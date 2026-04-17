# Auditor Agent

A LangGraph-driven audit pipeline that processes documents from Cloudflare Queues, extracts text using Gemini AI, performs audit checks, and generates comprehensive reports.

## Features

- 🤖 **AI-Powered Text Extraction** - Uses Gemini's multimodal API to extract text directly from PDFs/Docs (no local OCR)
- 📊 **Intelligent Analysis** - Runs deterministic checks and AI-powered analysis
- 🔍 **Vector Search** - Indexes document chunks in Vectorize for semantic search
- 📝 **Automated Reports** - Generates detailed Markdown reports with findings
- ⚡ **Scalable** - Processes jobs from Cloudflare Queues
- 🔄 **Real-time Updates** - Emits progress events to edge Durable Objects

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Edge Worker (D1-backed Queue)          │
│                                                            │
│  POST /uploads/create → INSERT INTO jobs (pending)        │
│  POST /runs/:id/enqueue → INSERT INTO jobs (pending)      │
└────────────────────┬─────────────────────────────────────┘
                     │
                     │ Agent polls: POST /jobs/pull
                     ▼
          ┌─────────────────┐
          │  Auditor Agent  │
          │   (LangGraph)   │
          └────────┬────────┘
                   │
    ┌──────────────┼──────────────┬────────────┐
    ▼              ▼              ▼            ▼
┌───────┐      ┌────────┐    ┌────────┐  ┌────────┐
│   R2  │      │ Gemini │    │Vectorize│  │   D1   │
│Storage│      │   AI   │    │(via Edge)│  │(via Edge)│
│       │      │        │    │          │  │        │
│ GET   │      │ Extract│    │ Upsert   │  │Insert  │
│object │      │  text  │    │ vectors  │  │findings│
└───┬───┘      └────────┘    └────────┘  └────────┘
    │                                          │
    │ PUT report                               │
    └──────────────────────────────────────────┘
                                               │
                   Agent acks: POST /jobs/ack (done/failed)
                                               ▼
                              ┌─────────────────────────────┐
                              │ Edge Worker                  │
                              │ UPDATE jobs SET status=done  │
                              │ RunRoom.update(phase=done)   │
                              └─────────────────────────────┘
```

## Job Lifecycle

1. **Upload** → `POST /uploads/create` → Job inserted to D1 (status=`pending`)
2. **Pull** → Agent polls `POST /jobs/pull` → Job leased (status=`leased`, visibility timeout set)
3. **Process** → Agent runs LangGraph pipeline
   - Download from R2
   - Extract text with Gemini
   - Chunk and embed
   - Index to Vectorize
   - Run audit checks
   - Generate AI analysis
   - Create report
   - Save findings to D1
4. **Ack** → Agent calls `POST /jobs/ack`:
   - Success → `status=done`, RunRoom updated
   - Failure → `status=pending` (requeued for retry)
5. **Visibility** → If agent crashes, job becomes available again after timeout

## Pipeline Stages

1. **Ingest** - Download document from R2
2. **Extract** - Extract text using Gemini's multimodal API
3. **Chunk** - Split text into embedable chunks
4. **Embed** - Generate embeddings with Gemini
5. **Index** - Store vectors in Vectorize
6. **Checks** - Run deterministic audit checks
7. **Analyze** - AI-powered summary and analysis
8. **Report** - Generate Markdown report
9. **Persist** - Save findings to D1

## Prerequisites

- Python 3.11+
- Poetry (or pip-tools)
- Cloudflare account with:
  - R2 bucket
  - D1 database
  - Vectorize index
  - Queues
  - AI Gateway configured for Google AI Studio
  - Edge Worker deployed (from `../backend`)

## Installation

### Using Poetry (Recommended)

```bash
# Install dependencies
poetry install

# Activate virtual environment
poetry shell
```

## Quick Start

**You only need 2 tokens:**
1. `EDGE_BASE_URL` - Your deployed edge worker URL
2. `EDGE_API_TOKEN` - Your JWT_SECRET (same as backend)

## Configuration

Copy the example environment file and configure:

```bash
cp env.example .env
```

Edit `.env` with your credentials:

```bash
# Cloudflare AI Gateway
AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/ACCOUNT_ID/GATEWAY_ID/google-ai-studio
GOOGLE_API_KEY=your-google-api-key

# Edge Worker API (D1-backed job queue + proxies)
EDGE_BASE_URL=https://your-worker.workers.dev
EDGE_API_TOKEN=your-jwt-secret  # Same as backend JWT_SECRET

# R2 Storage
R2_ENDPOINT=https://account.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-r2-key
R2_SECRET_ACCESS_KEY=your-r2-secret
R2_BUCKET=auditor

# Gemini Models (optional, defaults shown)
GEMINI_CHAT_MODEL=gemini-2.5-flash
GEMINI_EMBED_MODEL=gemini-embedding-001
GEMINI_EMBED_DIMENSIONS=768

# Application Settings
BATCH_SIZE=10
VISIBILITY_TIMEOUT=60
```

## Usage

### Run the Agent

```bash
# Using Make
make dev

# Using Poetry directly
poetry run python -m src.main

# Using Python
python -m src.main
```

The agent will:
1. Start a health server on port 8080 (configurable)
2. Begin polling the Edge Worker's `/jobs/pull` endpoint
3. Process each job through the LangGraph pipeline
4. Emit progress events to the edge Durable Object
5. Store results in D1 (via edge) and R2
6. Acknowledge jobs as `done` or `failed` (requeue)

### Health Check

```bash
curl http://localhost:8080/healthz
# Response: {"status": "healthy", "service": "auditor-agent"}
```

## Development

### Run Tests

```bash
# All tests
make test

# With coverage
poetry run pytest --cov=src --cov-report=html

# Specific test file
poetry run pytest tests/test_checks.py -v
```

### Code Formatting

```bash
# Format with ruff and black
make fmt

# Check formatting
make lint
```

### Type Checking

```bash
make typecheck
```

## Testing

The project includes comprehensive tests:

### Unit Tests

```python
# tests/test_checks.py
- Duplicate invoice detection
- Round number anomalies
- Weekend posting detection
```

### Integration Tests

```python
# tests/test_graph.py
- Full pipeline execution with mocks
- Error handling
- Node-by-node testing
```

Run specific test:

```bash
poetry run pytest tests/test_checks.py::test_check_duplicate_invoices -v
```

## Project Structure

```
auditor-agent/
├── src/
│   ├── main.py                 # Entry point with job pull loop
│   ├── config.py               # Pydantic configuration
│   ├── state.py                # State models (RunState, Txn)
│   ├── edge_jobs.py            # Edge job queue client (D1-backed)
│   ├── r2.py                   # R2 storage client
│   ├── edge_client.py          # Edge Worker API client
│   ├── gemini.py               # Gemini AI client
│   ├── checks/
│   │   └── deterministic.py   # Audit check implementations
│   └── graph/
│       ├── nodes.py            # LangGraph node implementations
│       └── build.py            # Graph builder
├── tests/
│   ├── test_checks.py          # Check tests
│   └── test_graph.py           # Pipeline tests
├── pyproject.toml              # Poetry dependencies
├── Makefile                    # Development commands
├── env.example                 # Example configuration
└── README.md                   # This file
```

## Audit Checks

### Deterministic Checks

1. **Duplicate Invoices** (`DUP_INVOICE`)
   - Detects identical vendor, date, and amount
   - Severity: Medium

2. **Round Numbers** (`ROUND_NUMBER`)
   - Flags suspiciously round amounts
   - Configurable threshold and minimum
   - Severity: Low

3. **Weekend Postings** (`WEEKEND_POST`)
   - Detects transactions posted on weekends
   - Severity: Low

### AI-Powered Analysis

Uses Gemini to:
- Summarize findings
- Identify risk patterns
- Recommend next steps

## API Integration

### Edge Worker Endpoints Used

```python
# Job Queue (NEW - D1-backed)
POST /jobs/pull          # Pull jobs with lease
POST /jobs/ack           # Acknowledge done/failed

# Vector operations
POST /vector/upsert      # Index embeddings
POST /vector/query       # Semantic search

# Database operations
POST /d1/query           # Whitelisted queries
- insert_run
- update_status
- insert_finding
- insert_event

# Real-time updates
Emits events to Durable Object via D1
```

### Job Format

Jobs are pulled from the edge worker:

```python
# Pull jobs
jobs = edge_jobs.pull(max=10, visibility_seconds=60)

# Each job has:
job.id          # "job_1234_abc"
job.run_id      # "run_1234_abc"
job.tenant_id   # "tenant_001"
job.r2_key      # "tenants/tenant_001/run_123/file.pdf"
job.attempts    # Number of retry attempts

# Acknowledge
edge_jobs.ack([job.id], status="done")   # Success
edge_jobs.ack([job.id], status="failed") # Requeue for retry
```

## Gemini Integration

### Text Extraction

Uses Gemini's `inlineData` multimodal API:

```python
{
  "contents": [{
    "role": "user",
    "parts": [
      {"text": "Extract all readable text..."},
      {"inlineData": {"mimeType": "application/pdf", "data": "<base64>"}}
    ]
  }]
}
```

Supports:
- PDF (`application/pdf`)
- Word Docs (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`)
- CSV (`text/csv`)

### Embeddings

Uses `gemini-embedding-001` model:

```python
POST /models/gemini-embedding-001:batchEmbedContents
```

Returns 768-dimensional vectors for semantic search when `GEMINI_EMBED_DIMENSIONS=768`.

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `AI_GATEWAY_URL` | Cloudflare AI Gateway URL | Yes |
| `GOOGLE_API_KEY` | Google API key for Gemini | Yes |
| `EDGE_BASE_URL` | Edge Worker URL | Yes |
| `EDGE_API_TOKEN` | Server auth token (= backend JWT_SECRET) | Yes |
| `R2_ENDPOINT` | R2 storage endpoint | Yes |
| `R2_ACCESS_KEY_ID` | R2 access key | Yes |
| `R2_SECRET_ACCESS_KEY` | R2 secret key | Yes |
| `R2_BUCKET` | R2 bucket name | Yes |
| `GEMINI_CHAT_MODEL` | Gemini chat model | No (default: gemini-2.5-flash) |
| `GEMINI_EMBED_MODEL` | Gemini embedding model | No (default: gemini-embedding-001) |
| `GEMINI_EMBED_DIMENSIONS` | Gemini embedding vector size | No (default: 768) |
| `LOG_LEVEL` | Logging level | No (default: INFO) |
| `HEALTH_PORT` | Health server port | No (default: 8080) |
| `BATCH_SIZE` | Jobs per pull | No (default: 10) |
| `VISIBILITY_TIMEOUT` | Lease duration (seconds) | No (default: 60) |

## Deployment

### Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml poetry.lock ./
RUN pip install poetry && poetry install --no-dev

COPY src/ ./src/
COPY .env .env

CMD ["poetry", "run", "python", "-m", "src.main"]
```

Build and run:

```bash
docker build -t auditor-agent .
docker run --env-file .env auditor-agent
```

### Docker Compose

```yaml
version: '3.8'

services:
  agent:
    build: .
    env_file: .env
    ports:
      - "8080:8080"
    restart: unless-stopped
```

### Kubernetes

See `k8s/` directory for Kubernetes manifests (deployment, service, configmap).

## Monitoring

### Logs

Structured JSON logging to stdout:

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "INFO",
  "message": "Pipeline completed for run_123",
  "run_id": "run_123",
  "tenant_id": "tenant_001"
}
```

### Health Checks

```bash
# Liveness
curl http://localhost:8080/healthz

# Readiness (same endpoint)
curl http://localhost:8080/health
```

### Metrics

Progress events are emitted to the edge DO and persisted to D1:

- `info` - Normal progress
- `warning` - Non-fatal issues
- `error` - Fatal errors

## Troubleshooting

### Agent won't start

1. Check `.env` file exists and has all required variables
2. Verify Cloudflare credentials are correct
3. Check R2 endpoint and credentials
4. Ensure Python 3.11+ is installed

### No jobs being processed

1. Check jobs exist: `curl $EDGE_BASE_URL/jobs/stats -H "Authorization: Bearer $TOKEN"`
2. Verify `EDGE_API_TOKEN` matches backend `JWT_SECRET`
3. Check edge worker is deployed and accessible
4. Look for errors in logs
5. Verify visibility timeout is sufficient (default: 60s)

### Text extraction fails

1. Check Google API key is valid
2. Verify AI Gateway is configured correctly
3. Ensure MIME type is supported
4. Check file isn't corrupted in R2

### Tests failing

```bash
# Clean and reinstall
make clean
poetry install

# Run with verbose output
poetry run pytest -v -s
```

## Performance

- **Text extraction**: ~5-15s per document (depends on size and complexity)
- **Embedding**: ~2-5s per batch (10 chunks)
- **Full pipeline**: ~30-60s for typical document
- **Throughput**: ~60-120 documents/hour with single worker

Scale horizontally by running multiple agent instances.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `make test`
5. Format code: `make fmt`
6. Submit a pull request

## License

MIT

## Support

For issues and questions:
- GitHub Issues: [Create an issue](#)
- Documentation: See `../backend/README.md` for edge API docs
- Cloudflare Docs: https://developers.cloudflare.com/

---

Built with ❤️ using LangGraph, Gemini AI, and Cloudflare Workers

