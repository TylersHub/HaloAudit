# Quick Fix Summary - Agent Cloudflare Issues

## The Problem

The agent is configured to use someone else's Cloudflare account. You need to switch everything to YOUR account.

## What You Need to Do

### 1. Update Backend (5 minutes)

```bash
cd backend

# Edit wrangler.toml - change line 34 to YOUR AI Gateway URL
# Then deploy:
wrangler secret put JWT_SECRET        # Save this value!
wrangler secret put GOOGLE_API_KEY     # Your Google API key
npm run migrate:prod
npm run deploy
```

**Save the JWT_SECRET value** - you'll need it for the agent!

### 2. Create Agent .env File (5 minutes)

```bash
cd agent
cp env.example .env
```

Edit `.env` with these values:

```bash
# YOUR deployed backend URL (from step 1)
EDGE_BASE_URL=https://auditor-edge.YOUR_SUBDOMAIN.workers.dev

# MUST match the JWT_SECRET from backend (step 1)
EDGE_API_TOKEN=your-jwt-secret-from-step-1

# YOUR R2 credentials (from Cloudflare Dashboard → R2)
R2_ENDPOINT=https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-key
R2_SECRET_ACCESS_KEY=your-secret

# YOUR AI Gateway URL (from Cloudflare Dashboard → AI Gateway)
AI_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/YOUR_GATEWAY/google-ai-studio

# Your Google API key
GOOGLE_API_KEY=your-google-api-key
```

### 3. Test It (2 minutes)

```bash
cd agent
python verify_config.py
```

If all checks pass, you're good!

### 4. Run the Agent

```bash
python -m src.main
```

## Where to Get Values

| Value                    | Where to Get It                                                            |
| ------------------------ | -------------------------------------------------------------------------- |
| **EDGE_BASE_URL**        | After deploying backend: `https://auditor-edge.YOUR_SUBDOMAIN.workers.dev` |
| **EDGE_API_TOKEN**       | Same as backend `JWT_SECRET` (set in step 1)                               |
| **R2_ENDPOINT**          | Cloudflare Dashboard → R2 → Your Account ID                                |
| **R2_ACCESS_KEY_ID**     | Cloudflare Dashboard → R2 → Manage API Tokens                              |
| **R2_SECRET_ACCESS_KEY** | Cloudflare Dashboard → R2 → Manage API Tokens                              |
| **AI_GATEWAY_URL**       | Cloudflare Dashboard → AI Gateway → Your Gateway URL                       |
| **GOOGLE_API_KEY**       | https://aistudio.google.com/apikey                                         |

## Most Common Mistakes

1. ❌ Using someone else's Account ID in URLs
2. ❌ `EDGE_API_TOKEN` doesn't match backend `JWT_SECRET`
3. ❌ Wrong Worker URL (not your deployed backend)
4. ❌ R2 credentials from wrong account

## Full Details

See `FIX_AGENT_CLOUDFLARE.md` for complete step-by-step instructions.
