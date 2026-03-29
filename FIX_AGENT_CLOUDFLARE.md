# Fix Agent Cloudflare Issues - Complete Guide

## Problem Summary

The agent is trying to connect to someone else's Cloudflare account. You need to:

1. Update backend to use YOUR Cloudflare account
2. Configure agent to connect to YOUR backend
3. Set up all credentials for YOUR account

## Quick Fix Steps

### Step 1: Update Backend Configuration

The backend `wrangler.toml` has someone else's AI Gateway URL. Update it:

```bash
cd backend
```

Edit `wrangler.toml` and update line 34:

```toml
# Change this:
AI_GATEWAY_URL = "https://gateway.ai.cloudflare.com/v1/99b429887ccf20faca6cd78dbeb0a207/auditor-gateway/google-ai-studio"

# To YOUR AI Gateway URL:
AI_GATEWAY_URL = "https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/YOUR_GATEWAY_ID/google-ai-studio"
```

**To get your AI Gateway URL:**

1. Go to Cloudflare Dashboard → AI Gateway
2. Create or select your gateway
3. Configure for Google AI Studio
4. Copy the URL

**Note:** The backend actually calls Google AI Studio directly now, but the AI Gateway URL is still referenced for legacy support.

### Step 2: Deploy Your Backend

```bash
cd backend

# Make sure you're logged into YOUR Cloudflare account
wrangler login

# Set secrets (if not already set)
wrangler secret put TURNSTILE_SECRET
# Enter your Turnstile secret key

wrangler secret put JWT_SECRET
# Enter a strong random string (save this - you'll need it!)
# Generate one: openssl rand -base64 32

# Also set Google API key (needed for Gemini)
wrangler secret put GOOGLE_API_KEY
# Enter your Google API key from https://aistudio.google.com/apikey

# Run migrations
npm run migrate:prod

# Deploy
npm run deploy
```

**After deployment, note your Worker URL:**

- It will be something like: `https://auditor-edge.YOUR_SUBDOMAIN.workers.dev`
- Or check with: `wrangler deployments list`

### Step 3: Get Your R2 Credentials

1. Go to Cloudflare Dashboard → R2
2. Create bucket named `auditor` (if it doesn't exist)
3. Go to "Manage R2 API Tokens"
4. Create API token with read/write permissions
5. Copy:
   - **Endpoint URL**: `https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com`
   - **Access Key ID**
   - **Secret Access Key**

### Step 4: Create Agent .env File

```bash
cd agent
cp env.example .env
```

Edit `agent/.env` with YOUR values:

```bash
# Cloudflare AI Gateway (YOUR account)
# Get from: Cloudflare Dashboard → AI Gateway
AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/YOUR_GATEWAY_ID/google-ai-studio

# Google API Key (for Gemini)
# Get from: https://aistudio.google.com/apikey
GOOGLE_API_KEY=your-google-api-key-here

# Edge Worker API (YOUR deployed backend)
# This is the URL from Step 2
EDGE_BASE_URL=https://auditor-edge.YOUR_SUBDOMAIN.workers.dev

# MUST match backend JWT_SECRET from Step 2
EDGE_API_TOKEN=your-jwt-secret-from-backend

# R2 Storage (YOUR bucket from Step 3)
R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET=auditor

# These can stay as defaults
GEMINI_CHAT_MODEL=gemini-2.0-flash
GEMINI_EMBED_MODEL=text-embedding-004
LOG_LEVEL=INFO
HEALTH_PORT=8080
BATCH_SIZE=10
VISIBILITY_TIMEOUT=60
```

### Step 5: Verify Configuration

```bash
cd agent

# Activate virtual environment
poetry shell
# OR: source venv/bin/activate  (if using venv)

# Run verification script
python verify_config.py
```

This will test:

- ✅ Configuration loads correctly
- ✅ Backend connection works
- ✅ Authentication is valid
- ✅ R2 bucket is accessible

### Step 6: Run the Agent

```bash
# Make sure verification passed
python -m src.main
```

You should see:

```
Configuration loaded successfully
Pipeline runner initialized
Health server listening on port 8080
Starting edge job pull loop
Pulled 0 jobs from edge queue
No jobs available, waiting...
```

## Common Issues & Fixes

### Issue: "Failed to load configuration"

**Fix:**

- Make sure `.env` file exists in `agent/` directory
- Check all required variables are set (no empty values)
- Verify no typos in variable names

### Issue: "Authentication failed" or 401 error

**Fix:**

- Verify `EDGE_API_TOKEN` in agent `.env` exactly matches `JWT_SECRET` in backend
- Check backend is deployed: `curl https://YOUR_WORKER_URL/`
- Test auth: `curl -H "Authorization: Bearer YOUR_TOKEN" https://YOUR_WORKER_URL/jobs/stats`

### Issue: "Connection refused" or "Cannot connect"

**Fix:**

- Verify `EDGE_BASE_URL` is correct (your deployed Worker URL)
- Test: `curl https://YOUR_WORKER_URL/` should return JSON
- Check backend is actually deployed: `wrangler deployments list`

### Issue: "R2 access denied"

**Fix:**

- Verify R2 credentials are from YOUR account
- Check bucket name matches: `R2_BUCKET=auditor`
- Verify API token has read/write permissions
- Test R2 connection manually

### Issue: "AI Gateway error"

**Fix:**

- Verify `AI_GATEWAY_URL` uses YOUR Account ID and Gateway ID
- Check AI Gateway is configured for Google AI Studio
- Note: Backend calls Google AI Studio directly, so this might not be critical

### Issue: "No jobs available"

**This is normal!** The agent will wait for jobs. To test:

1. Upload a file through the Windows frontend
2. Watch agent logs - it should pick up the job
3. Check job stats: `curl -H "Authorization: Bearer YOUR_TOKEN" https://YOUR_WORKER_URL/jobs/stats`

## Verification Checklist

Before running the agent, verify:

- [ ] Backend `wrangler.toml` has YOUR AI Gateway URL
- [ ] Backend is deployed to YOUR Cloudflare account
- [ ] Backend secrets are set (TURNSTILE_SECRET, JWT_SECRET, GOOGLE_API_KEY)
- [ ] Agent `.env` has `EDGE_BASE_URL` pointing to YOUR Worker
- [ ] Agent `.env` has `EDGE_API_TOKEN` matching backend `JWT_SECRET`
- [ ] Agent `.env` has YOUR R2 credentials
- [ ] Agent `.env` has YOUR AI Gateway URL
- [ ] Agent `.env` has Google API key
- [ ] `verify_config.py` passes all tests

## Testing the Full Flow

1. **Start the agent:**

   ```bash
   cd agent
   python -m src.main
   ```

2. **Upload a file through Windows frontend:**

   - Drag & drop a PDF or CSV
   - Watch the frontend for progress

3. **Watch agent logs:**

   - Should see: "Pulled 1 jobs from edge queue"
   - Should see: "Processing job..."
   - Should see: "Pipeline completed successfully"

4. **Check results:**
   - Frontend should show completion
   - Findings should appear in the frontend

## Need Help?

If you're still having issues:

1. Run `python verify_config.py` and share the output
2. Check agent logs for specific error messages
3. Test backend directly: `curl https://YOUR_WORKER_URL/jobs/stats -H "Authorization: Bearer YOUR_TOKEN"`
4. Verify all credentials are from YOUR Cloudflare account (not someone else's)

## Summary

The main issue is that the agent was configured for someone else's Cloudflare account. You need to:

1. ✅ Update backend `wrangler.toml` with YOUR AI Gateway URL
2. ✅ Deploy backend to YOUR Cloudflare account
3. ✅ Create agent `.env` with YOUR credentials
4. ✅ Make sure `EDGE_API_TOKEN` matches backend `JWT_SECRET`
5. ✅ Run `verify_config.py` to test everything
6. ✅ Start agent and test with file upload

Once all credentials point to YOUR account, everything should work!
