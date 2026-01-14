# Railway Deployment Guide

Complete guide to deploy JRPG with VOICEVOX TTS to Railway.

## Prerequisites

### 1. Install Railway CLI

```bash
npm install -g @railway/cli
```

### 2. Authenticate (one-time, opens browser)

```bash
railway login
```

### 3. Have your API keys ready

- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` or `GOOGLE_API_KEY` (at least one)
- `JPDB_API_KEY` (optional, for vocabulary integration)

---

## Deployment Steps

All commands below can be run by Claude after you complete the prerequisites.

### Step 1: Create Railway Project

```bash
# Create new project and link it
railway init --name jrpg

# Or link to existing project
# railway link
```

### Step 2: Deploy the JRPG App

```bash
# Deploy from current directory
railway up --detach
```

Railway auto-detects Node.js and runs `npm start`.

### Step 3: Set Environment Variables

```bash
# Required: At least one AI provider
railway variables set OPENAI_API_KEY=sk-your-key-here

# Optional: Additional AI providers
railway variables set ANTHROPIC_API_KEY=sk-ant-your-key-here
railway variables set GOOGLE_API_KEY=your-google-key-here

# Optional: JPDB for vocabulary
railway variables set JPDB_API_KEY=your-jpdb-key

# Set production mode
railway variables set NODE_ENV=production
```

### Step 4: Add VOICEVOX Service

```bash
# Add VOICEVOX as a Docker service
railway add --docker voicevox/voicevox_engine:cpu-latest --name voicevox
```

If the above doesn't work (Railway CLI limitations), use the dashboard:
1. `railway open` - opens project in browser
2. Click "New Service" → "Docker Image"
3. Enter: `voicevox/voicevox_engine:cpu-latest`
4. Name it: `voicevox`

### Step 5: Configure VOICEVOX URL

After VOICEVOX service is deployed:

```bash
# Set the internal URL for VOICEVOX
# Railway uses <service-name>.railway.internal for internal networking
railway variables set VOICEVOX_URL=http://voicevox.railway.internal:50021
```

### Step 6: Generate Public Domain

```bash
# Generate a public URL for the app
railway domain
```

This gives you a URL like: `jrpg-production.up.railway.app`

### Step 7: Verify Deployment

```bash
# Check service status
railway status

# View logs
railway logs

# Open in browser
railway open
```

---

## Complete CLI Script

After `railway login`, run these commands in sequence:

```bash
# 1. Initialize project
cd /path/to/jrpg
railway init --name jrpg

# 2. Deploy app
railway up --detach

# 3. Set environment variables (replace with your actual keys)
railway variables set NODE_ENV=production
railway variables set OPENAI_API_KEY=sk-xxxxx
# railway variables set JPDB_API_KEY=xxxxx  # Optional

# 4. Open dashboard to add VOICEVOX Docker service
railway open
# Then: New Service → Docker Image → voicevox/voicevox_engine:cpu-latest

# 5. After VOICEVOX deploys, set its URL
railway variables set VOICEVOX_URL=http://voicevox.railway.internal:50021

# 6. Generate public domain
railway domain

# 7. View logs to confirm everything works
railway logs
```

---

## Project Structure on Railway

```
Railway Project: jrpg
├── Service: jrpg (Node.js)
│   ├── Source: GitHub repo
│   ├── Build: Nixpacks (auto-detected)
│   ├── Start: npm start
│   └── Domain: jrpg-xxx.up.railway.app
│
└── Service: voicevox (Docker)
    ├── Image: voicevox/voicevox_engine:cpu-latest
    ├── Internal: voicevox.railway.internal:50021
    └── Domain: None (internal only)
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Set to `production` |
| `OPENAI_API_KEY` | One of these | OpenAI API key |
| `ANTHROPIC_API_KEY` | One of these | Anthropic API key |
| `GOOGLE_API_KEY` | One of these | Google AI API key |
| `JPDB_API_KEY` | No | JPDB vocabulary integration |
| `VOICEVOX_URL` | For TTS | Internal URL to VOICEVOX service |

---

## Persistent Storage (Optional)

For game saves to persist across deployments:

### Option A: Railway Volume

```bash
# Add a volume for persistent data
railway volume add --mount /app/data
```

Then update file paths in code to use `/app/data/` prefix, or set:
```bash
railway variables set DATA_DIR=/app/data
```

### Option B: External Database

For more robust persistence, use Railway's PostgreSQL or MongoDB add-on.
This requires code changes to use a database instead of JSON files.

---

## Monitoring & Debugging

```bash
# View real-time logs
railway logs --follow

# Check deployment status
railway status

# Open Railway dashboard
railway open

# Redeploy after changes
railway up --detach

# Restart service
railway service restart
```

---

## Estimated Costs

| Service | Usage | Estimated Cost |
|---------|-------|----------------|
| JRPG App | Light usage | ~$3-5/month |
| VOICEVOX | TTS processing | ~$5-10/month |
| **Total** | | **~$8-15/month** |

Railway gives $5 free credit monthly on the hobby plan.

---

## Troubleshooting

### VOICEVOX not responding

```bash
# Check VOICEVOX logs
railway logs --service voicevox

# Verify internal networking
railway variables get VOICEVOX_URL
```

### App crashes on startup

```bash
# Check logs for errors
railway logs --service jrpg

# Verify environment variables are set
railway variables
```

### TTS not working

1. Verify VOICEVOX service is running: `railway status`
2. Check VOICEVOX_URL is set correctly
3. Enable TTS in game settings after deployment

---

## Quick Reference

```bash
railway login          # Authenticate (once)
railway init           # Create/link project
railway up             # Deploy
railway variables set  # Set env vars
railway logs           # View logs
railway domain         # Generate public URL
railway open           # Open dashboard
railway status         # Check status
```
