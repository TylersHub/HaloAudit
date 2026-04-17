"""Client for the Edge Worker API."""

import logging
from typing import Any

import httpx
import orjson
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from .config import Config

logger = logging.getLogger(__name__)


def should_retry_llm(exc: BaseException) -> bool:
    """Retry transient upstream failures, but not quota/auth/client errors."""
    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        if status in {400, 401, 403, 404, 409, 422, 429}:
            return False
    return True


class EdgeClient:
    """Client for Edge Worker API endpoints."""

    def __init__(self, config: Config):
        self.config = config
        self.base_url = config.edge_base_url.rstrip("/")
        self.client = httpx.Client(timeout=30.0)
        self.headers = {
            "Content-Type": "application/json",
            "X-Server-Auth": config.edge_api_token,
        }

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
    )
    def vector_upsert(
        self,
        ids: list[str],
        vectors: list[list[float]],
        metadatas: list[dict[str, Any]] | None = None,
    ) -> dict:
        """
        Upsert vectors to Vectorize via edge proxy.

        Args:
            ids: Vector IDs
            vectors: Vector embeddings
            metadatas: Optional metadata for each vector

        Returns:
            Response data
        """
        payload = {"ids": ids, "vectors": vectors}
        if metadatas:
            payload["metadatas"] = metadatas

        logger.debug(f"Upserting {len(ids)} vectors")

        response = self.client.post(
            f"{self.base_url}/vector/upsert",
            headers=self.headers,
            content=orjson.dumps(payload),
        )
        response.raise_for_status()

        data = response.json()
        logger.info(f"Upserted {len(ids)} vectors successfully")
        return data

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
    )
    def vector_query(
        self,
        vector: list[float],
        top_k: int = 10,
        filter: dict[str, Any] | None = None,
    ) -> list[dict]:
        """
        Query similar vectors from Vectorize.

        Args:
            vector: Query vector
            top_k: Number of results to return
            filter: Optional metadata filter

        Returns:
            List of matching vectors with scores
        """
        payload = {"vector": vector, "topK": top_k}
        if filter:
            payload["filter"] = filter

        response = self.client.post(
            f"{self.base_url}/vector/query",
            headers=self.headers,
            content=orjson.dumps(payload),
        )
        response.raise_for_status()

        data = response.json()
        matches = data.get("matches", [])
        logger.info(f"Found {len(matches)} similar vectors")
        return matches

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
    )
    def d1_query(self, name: str, params: list[Any]) -> dict:
        """
        Execute a whitelisted D1 query via edge proxy.

        Args:
            name: Query name (must be whitelisted)
            params: Query parameters

        Returns:
            Query result
        """
        payload = {"name": name, "params": params}

        logger.debug(f"Executing D1 query: {name}")

        response = self.client.post(
            f"{self.base_url}/d1/query",
            headers=self.headers,
            content=orjson.dumps(payload),
        )
        response.raise_for_status()

        data = response.json()
        logger.info(f"D1 query '{name}' executed successfully")
        return data

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
    )
    def emit_event(
        self,
        run_id: str,
        level: str,
        message: str,
        data: dict[str, Any] | None = None,
    ) -> bool:
        """
        Emit a run event (persists to D1 and updates DO).

        Args:
            run_id: Run ID
            level: Log level (info, warning, error)
            message: Event message
            data: Optional additional data

        Returns:
            True if successful
        """
        # Generate event ID
        import time
        import random

        event_id = f"evt_{int(time.time())}_{random.randint(1000, 9999)}"

        # Insert event into D1
        try:
            self.d1_query(
                "insert_event",
                [event_id, run_id, level, message, orjson.dumps(data or {}).decode()],
            )
            logger.info(f"Emitted event for run {run_id}: {message}")
            return True
        except Exception as e:
            logger.error(f"Failed to emit event: {e}")
            return False

    def update_run_status(self, run_id: str, status: str) -> bool:
        """
        Update run status in D1.

        Args:
            run_id: Run ID
            status: New status

        Returns:
            True if successful
        """
        try:
            self.d1_query("update_status", [run_id, status])
            logger.info(f"Updated run {run_id} status to {status}")
            return True
        except Exception as e:
            logger.error(f"Failed to update run status: {e}")
            return False

    def insert_finding(
        self,
        finding_id: str,
        run_id: str,
        code: str,
        severity: str,
        title: str,
        detail: str,
        evidence_r2_key: str | None = None,
    ) -> bool:
        """
        Insert a finding into D1.

        Args:
            finding_id: Unique finding ID
            run_id: Associated run ID
            code: Finding code
            severity: Severity level
            title: Finding title
            detail: Detailed description
            evidence_r2_key: Optional evidence file key

        Returns:
            True if successful
        """
        try:
            self.d1_query(
                "insert_finding",
                [finding_id, run_id, code, severity, title, detail, evidence_r2_key or ""],
            )
            logger.info(f"Inserted finding {finding_id} for run {run_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to insert finding: {e}")
            return False

    @retry(
        retry=retry_if_exception(should_retry_llm),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=4, max=30),
    )
    def llm_gateway(
        self,
        contents: list[dict[str, Any]],
        generation_config: dict[str, Any] | None = None,
        model: str | None = None,
    ) -> dict:
        """
        Call Gemini via AI Gateway through edge proxy.

        Args:
            contents: Gemini conversation contents
            generation_config: Optional generation config

        Returns:
            Gemini response data
        """
        payload = {"contents": contents}
        if generation_config:
            payload["generationConfig"] = generation_config
        if model:
            payload["model"] = model

        logger.debug("Calling Gemini via AI Gateway")

        response = self.client.post(
            f"{self.base_url}/llm/gateway",
            headers=self.headers,
            content=orjson.dumps(payload),
        )
        response.raise_for_status()

        data = response.json()
        logger.info("Gemini gateway call successful")
        return data

    @retry(
        retry=retry_if_exception(should_retry_llm),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=4, max=30),
    )
    def llm_embed(
        self,
        requests: list[dict[str, Any]],
    ) -> dict:
        """
        Generate embeddings via AI Gateway through edge proxy.

        Args:
            requests: List of embedding requests

        Returns:
            Embedding response data
        """
        payload = {"requests": requests}

        logger.debug(f"Generating {len(requests)} embeddings via AI Gateway")

        response = self.client.post(
            f"{self.base_url}/llm/embed",
            headers=self.headers,
            content=orjson.dumps(payload),
        )
        response.raise_for_status()

        data = response.json()
        logger.info("Embedding generation successful")
        return data

    def close(self):
        """Close the HTTP client."""
        self.client.close()

