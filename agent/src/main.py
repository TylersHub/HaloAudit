"""Main application entry point with queue pull loop and health server."""

import logging
import signal
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from threading import Thread

import orjson

from .edge_jobs import EdgeJobClient
from .config import get_config
from .graph.build import PipelineRunner
from .state import RunState

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# Global shutdown flag
shutdown_requested = False


class HealthHandler(BaseHTTPRequestHandler):
    """Simple HTTP handler for health checks."""

    def do_GET(self):
        """Handle GET requests."""
        if self.path == "/healthz" or self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            response = orjson.dumps({"status": "healthy", "service": "auditor-agent"})
            self.wfile.write(response)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        """Override to use our logger."""
        logger.debug(f"Health check: {format % args}")


def run_health_server(port: int):
    """Run a simple HTTP health check server."""
    server = HTTPServer(("0.0.0.0", port), HealthHandler)
    logger.info(f"Health server listening on port {port}")

    while not shutdown_requested:
        try:
            server.handle_request()
        except Exception as e:
            logger.error(f"Health server error: {e}")
            break

    server.server_close()
    logger.info("Health server stopped")


def build_state_from_job(job) -> RunState:
    """
    Build initial RunState from job data.

    Args:
        job: Job object from edge queue

    Returns:
        Initial RunState
    """
    return RunState(
        run_id=job.run_id,
        tenant_id=job.tenant_id,
        r2_key=job.r2_key,
    )


def process_job(runner: PipelineRunner, job) -> bool:
    """
    Process a single job.

    Args:
        runner: Pipeline runner instance
        job: Job object from edge queue

    Returns:
        True if successful, False otherwise
    """
    try:
        logger.info(
            f"Processing job {job.id}: run_id={job.run_id}, "
            f"tenant_id={job.tenant_id}, r2_key={job.r2_key}, attempts={job.attempts}"
        )

        # Build initial state
        state = build_state_from_job(job)

        # Run the pipeline
        final_state = runner.pipeline(state)
        if isinstance(final_state, dict):
            final_state = RunState.model_validate(final_state)

        # Check if successful
        if final_state.error:
            logger.error(f"Pipeline failed for {job.run_id}: {final_state.error}")
            return False

        logger.info(f"Pipeline completed successfully for job {job.id}")
        return True

    except Exception as e:
        logger.error(f"Failed to process job {job.id}: {e}", exc_info=True)
        return False


def pull_loop(config, runner: PipelineRunner):
    """
    Main pull loop that processes jobs from edge queue.

    Args:
        config: Application configuration
        runner: Pipeline runner instance
    """
    job_client = EdgeJobClient(config)
    logger.info("Starting edge job pull loop")

    while not shutdown_requested:
        try:
            # Pull jobs from edge queue
            jobs = job_client.pull(
                max=config.batch_size,
                visibility_seconds=config.visibility_timeout,
            )

            if not jobs:
                logger.debug("No jobs available, waiting...")
                time.sleep(5)  # Wait 5 seconds before next pull to avoid rate limits
                continue

            logger.info(f"Pulled {len(jobs)} jobs from edge queue")

            # Process each job
            for job in jobs:
                if shutdown_requested:
                    break

                try:
                    logger.info(f"Processing job {job.id}")

                    # Process the job
                    success = process_job(runner, job)

                    # Acknowledge with appropriate status
                    if success:
                        job_client.ack([job.id], status="done")
                        logger.info(f"Job {job.id} completed successfully")
                    else:
                        job_client.ack([job.id], status="failed")
                        logger.warning(f"Job {job.id} failed permanently - not retrying")

                except Exception as e:
                    logger.error(f"Error processing job {job.id}: {e}", exc_info=True)
                    # Ack as failed to requeue
                    try:
                        job_client.ack([job.id], status="failed")
                    except Exception as ack_error:
                        logger.error(f"Failed to ack job {job.id}: {ack_error}")

            # Add delay after processing jobs to avoid rapid polling
            if jobs:
                logger.debug("Processed jobs, waiting before next poll...")
                time.sleep(10)

        except KeyboardInterrupt:
            logger.info("Received interrupt signal")
            break
        except Exception as e:
            logger.error(f"Pull loop error: {e}", exc_info=True)
            time.sleep(10)  # Wait before retrying

    job_client.close()
    logger.info("Pull loop stopped")


def signal_handler(signum, frame):
    """Handle shutdown signals."""
    global shutdown_requested
    logger.info(f"Received signal {signum}, initiating graceful shutdown...")
    shutdown_requested = True


def main():
    """Main application entry point."""
    # Load configuration
    try:
        config = get_config()
        logger.info("Configuration loaded successfully")
    except Exception as e:
        logger.error(f"Failed to load configuration: {e}")
        sys.exit(1)

    # Set log level from config
    logging.getLogger().setLevel(config.log_level)

    # Register signal handlers
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    # Initialize pipeline runner
    runner = PipelineRunner(config)
    logger.info("Pipeline runner initialized")

    # Start health server in background thread
    health_thread = Thread(
        target=run_health_server,
        args=(config.health_port,),
        daemon=True,
    )
    health_thread.start()

    # Run pull loop in main thread
    try:
        pull_loop(config, runner)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        sys.exit(1)

    logger.info("Application shutdown complete")
    sys.exit(0)


if __name__ == "__main__":
    main()

