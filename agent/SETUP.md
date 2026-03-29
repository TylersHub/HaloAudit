# Quick Setup Guide

Get the Auditor Agent running in under 5 minutes!

## Step 1: Install Dependencies

```bash
cd agent

# Using Poetry (recommended)
poetry install

# Or using pip
pip install -e .

or

pip install -r requirements.txt
```

## Step 2: Configure Environment

```bash
# Copy example config
cp env.example .env

# Edit .env with your credentials
nano .env  # or use your favorite editor
```

**Required values:**
- Cloudflare account ID & API tokens
- Google API key for Gemini
- Edge Worker URL (from `../backend`)
- R2 credentials
- Queue URLs

## Step 3: Verify Edge Worker

Make sure the edge worker (from `../backend`) is deployed:

```bash
cd ../backend
npm run deploy
```

Note the deployed URL and add it to `agent/.env` as `EDGE_BASE_URL`.

## Step 4: Run Tests

```bash
cd ../agent
make test
```

All tests should pass!

## Step 5: Start the Agent

```bash
make dev
```

You should see:
```
INFO: Configuration loaded successfully
INFO: Pipeline runner initialized
INFO: Health server listening on port 8080
INFO: Starting queue pull loop
```

## Step 6: Test Health Endpoint

In another terminal:

```bash
curl http://localhost:8080/healthz
```

Should return:
```json
{"status":"healthy","service":"auditor-agent"}
```

## Step 7: Send a Test Job

Use the edge worker to create an upload and enqueue a job:

```bash
# Create upload (using edge worker)
curl -X POST https://your-worker.workers.dev/uploads/create \
  -H "Content-Type: application/json" \
  -d '{
    "contentType": "application/pdf",
    "filename": "test.pdf",
    "tenantId": "test-tenant"
  }'

# Upload your PDF to the presigned URL
# Then enqueue for processing
curl -X POST https://your-worker.workers.dev/runs/{runId}/enqueue \
  -H "Content-Type: application/json" \
  -d '{"r2Key": "..."}'
```

The agent will:
1. Pull the job from the queue
2. Download the PDF from R2
3. Extract text with Gemini
4. Run audit checks
5. Generate embeddings
6. Create a report
7. Save findings to D1

## Troubleshooting

### "Configuration failed to load"
- Check that `.env` exists and has all required variables
- Verify no syntax errors in `.env`

### "Failed to pull from queue"
- Verify `CF_API_TOKEN` has queue permissions
- Check queue URLs are correct
- Ensure queue exists in Cloudflare dashboard

### "Gemini API error"
- Verify `GOOGLE_API_KEY` is valid
- Check AI Gateway is configured correctly
- Ensure `AI_GATEWAY_URL` format is correct

### "R2 connection failed"
- Verify R2 credentials are correct
- Check R2 endpoint URL
- Ensure bucket exists

## Next Steps

1. **Monitor logs** - Watch the console for pipeline progress
2. **Check D1** - Query findings in D1 database
3. **View reports** - Download reports from R2
4. **Scale** - Run multiple agent instances for higher throughput

## Development Commands

```bash
make dev      # Run agent
make test     # Run tests
make fmt      # Format code
make lint     # Lint code
make clean    # Clean caches
```

## Docker Setup

```bash
# Build image
make docker

# Run with docker-compose
docker-compose up
```

## Production Deployment

See [README.md](README.md) for:
- Kubernetes manifests
- Monitoring setup
- Performance tuning
- Security best practices

---

For more details, see [README.md](README.md)

