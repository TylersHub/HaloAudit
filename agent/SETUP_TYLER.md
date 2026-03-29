# Agent Setup Guide for Tyler

This guide will help you configure the agent to work with your own Cloudflare account.

## Prerequisites

1. **Cloudflare Account** with Workers paid plan (for Durable Objects)
2. **Backend Deployed** - Your backend must be deployed to Cloudflare Workers
3. **Google API Key** - For Gemini AI (get from https://aistudio.google.com/apikey)

## Step 1: Deploy Your Backend

First, make sure your backend is deployed to your Cloudflare account:

```bash
cd backend

# Login to Cloudflare
wrangler login

# Set secrets (if not already set)
wrangler secret put TURNSTILE_SECRET
wrangler secret put JWT_SECRET
# Note: Save the JWT_SECRET value - you'll need it for the agent!

# Deploy
npm run deploy
```

After deployment, note your Worker URL. It will be something like:

- `https://auditor-edge.YOUR_SUBDOMAIN.workers.dev`

## Step 2: Get Your Cloudflare Resources

### Get Your Account ID

1. Go to Cloudflare Dashboard
2. Select your account
3. Copy your Account ID from the right sidebar

### Get Your AI Gateway URL

1. Go to Cloudflare Dashboard → AI Gateway
2. Create a new Gateway (or use existing)
3. Configure it for Google AI Studio
4. Copy the Gateway URL (format: `https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/YOUR_GATEWAY_ID/google-ai-studio`)

### Get Your R2 Credentials

1. Go to Cloudflare Dashboard → R2
2. Create a bucket named `auditor` (or use existing)
3. Go to "Manage R2 API Tokens"
4. Create API token with read/write permissions
5. Copy:
   - Endpoint URL (e.g., `https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com`)
   - Access Key ID
   - Secret Access Key

## Step 3: Get Your JWT_SECRET

The agent needs the same `JWT_SECRET` that your backend uses. If you already set it:

```bash
cd backend
wrangler secret get JWT_SECRET
```

If you need to set a new one:

```bash
# Generate a secure random string
openssl rand -base64 32

# Set it in backend
wrangler secret put JWT_SECRET
# Paste the generated string

# IMPORTANT: Use the SAME value in agent/.env as EDGE_API_TOKEN
```

## Step 4: Create Agent .env File

```bash
cd agent
cp env.example .env
```

Edit `.env` with your values:

```bash
# Cloudflare AI Gateway (YOUR account)
AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/YOUR_GATEWAY_ID/google-ai-studio
GOOGLE_API_KEY=your-google-api-key-here

# Edge Worker API (YOUR deployed backend)
EDGE_BASE_URL=https://auditor-edge.YOUR_SUBDOMAIN.workers.dev
EDGE_API_TOKEN=your-jwt-secret-here  # MUST match backend JWT_SECRET

# R2 Storage (YOUR bucket)
R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET=auditor

# Gemini Models (optional, defaults are fine)
GEMINI_CHAT_MODEL=gemini-2.0-flash
GEMINI_EMBED_MODEL=text-embedding-004

# Application Settings (optional, defaults are fine)
LOG_LEVEL=INFO
HEALTH_PORT=8080
BATCH_SIZE=10
VISIBILITY_TIMEOUT=60
```

## Step 5: Test the Connection

```bash
cd agent

# Activate virtual environment
# If using Poetry:
poetry shell

# Or if using venv:
# source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate      # Windows

# Test configuration loads
python -c "from src.config import get_config; print('Config OK:', get_config().edge_base_url)"

# Test backend connection
curl -H "Authorization: Bearer YOUR_JWT_SECRET" https://YOUR_WORKER_URL/jobs/stats
```

## Step 6: Run the Agent

```bash
# Make sure .env is configured correctly
python -m src.main
```

You should see:

```
Configuration loaded successfully
Pipeline runner initialized
Health server listening on port 8080
Starting edge job pull loop
```

## Troubleshooting

### "Failed to load configuration"

- Check that `.env` file exists in `agent/` directory
- Verify all required variables are set (no empty values)

### "Authentication failed" or "Invalid token"

- Verify `EDGE_API_TOKEN` matches your backend's `JWT_SECRET`
- Check that backend is deployed and accessible

### "Connection refused" or "Failed to connect"

- Verify `EDGE_BASE_URL` is correct (your deployed Worker URL)
- Test with: `curl https://YOUR_WORKER_URL/` (should return health check)

### "R2 access denied"

- Verify R2 credentials are correct
- Check that R2 bucket exists and API token has correct permissions

### "AI Gateway error"

- Verify `AI_GATEWAY_URL` is correct for your account
- Check that Google API key is valid

### "No jobs available"

- This is normal if no files have been uploaded
- Upload a file through the frontend to create a job
- Check job stats: `curl -H "Authorization: Bearer YOUR_TOKEN" https://YOUR_WORKER_URL/jobs/stats`

## Quick Verification Checklist

- [ ] Backend deployed to your Cloudflare account
- [ ] `EDGE_BASE_URL` points to your deployed Worker
- [ ] `EDGE_API_TOKEN` matches backend `JWT_SECRET`
- [ ] `AI_GATEWAY_URL` uses your Account ID and Gateway ID
- [ ] `R2_ENDPOINT` uses your Account ID
- [ ] R2 credentials are from your account
- [ ] Google API key is valid
- [ ] `.env` file exists in `agent/` directory

## Next Steps

Once the agent is running:

1. Upload a file through the Windows frontend
2. Watch the agent logs for processing
3. Check the frontend for real-time progress updates
