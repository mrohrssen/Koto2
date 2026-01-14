# JRPG Deployment Plan

## Application Architecture Summary

| Aspect | Details |
|--------|---------|
| **Type** | Full-stack Node.js application (Express server + static frontend) |
| **Backend** | Express.js server with 50+ API endpoints |
| **Frontend** | Static HTML/CSS/JS served from `/public` directory |
| **Storage** | Local JSON files (`.jrpg-settings.json`, `.jrpg-save.json`, `.jrpg-vocab-cache.json`, etc.) |
| **External APIs** | JPDB (vocabulary), OpenAI/Anthropic/Google (AI narration) |
| **Optional** | VOICEVOX TTS (local only, will not work in cloud) |

## Environment Variables Required

From `.env.example`:
- `JPDB_API_KEY` - Japanese vocabulary integration
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` - At least one for AI narration
- `PORT` - Server port (default: 3000)

---

## Platform Analysis

### Why Vercel is NOT Recommended

Vercel is optimized for static sites and serverless functions. This JRPG application has:
- A persistent Express server (not serverless)
- Local file-based storage (Vercel has read-only filesystem)
- Long-running game state management

**Deploying to Vercel would require significant refactoring:**
1. Convert all Express routes to Vercel API routes
2. Replace file storage with a database (MongoDB Atlas, Supabase, etc.)
3. Restructure the game state management

### Recommended: Railway

**Railway** is the best fit because:
- Runs persistent Docker containers (not serverless)
- Local file storage works immediately
- Good free tier ($5/month credit)
- Zero code changes required
- Automatic HTTPS
- Easy GitHub integration

### Alternative: Render

**Render** free tier works but:
- Spins down after 15 minutes of inactivity (cold starts)
- Without persistent disk, data resets on each deploy
- Persistent disk is a paid add-on

---

## Platform Comparison

| Platform | Effort Required | Free Tier | File Storage | Best For |
|----------|----------------|-----------|--------------|----------|
| **Railway** | Zero changes | $5/month credit | Works | This app |
| **Render** | Zero changes | Free (cold starts) | Needs paid disk | Simple demo |
| **Fly.io** | Minor config | 3 VMs free | Volume available | Global users |
| **Vercel** | Major refactoring | Generous | Database needed | Static/serverless |
| **Glitch** | Zero changes | Free (sleeps) | Works | Quick testing |

---

## Implementation Plan: Deploy to Railway

### Step 1: Prepare the Repository

No code changes are strictly required. The application is already configured correctly:

- `package.json` has correct start script: `"start": "node server.js"`
- `server.js` reads PORT from environment: `const PORT = process.env.PORT || 3000;`

**Optional: Add `railway.json` configuration:**
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/api/config"
  }
}
```

### Step 2: Set Up Railway

1. Go to [railway.app](https://railway.app) and sign up/login with GitHub
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose the JRPG repository
5. Railway will auto-detect Node.js and deploy

### Step 3: Configure Environment Variables

In Railway dashboard, go to your project > Variables:

| Variable | Value |
|----------|-------|
| `OPENAI_API_KEY` | Your OpenAI API key |
| `JPDB_API_KEY` | Your JPDB API key (optional) |
| `NODE_ENV` | `production` |

### Step 4: Add Persistent Storage (Recommended)

For game saves to persist across deployments:

1. In Railway dashboard, click "New" > "Volume"
2. Mount path: `/app/data`
3. Modify file paths in server.js to use `/app/data/` prefix (or use environment variable)

**Alternative approach - use environment variable for data directory:**
```javascript
const DATA_DIR = process.env.DATA_DIR || __dirname;
const SETTINGS_FILE = join(DATA_DIR, '.jrpg-settings.json');
```

### Step 5: Deploy and Test

1. Railway auto-deploys on push to the linked branch
2. Click "Generate Domain" to get a public URL
3. Test all features:
   - Game loads
   - Settings save
   - AI narration works (requires API keys)
   - Game progress saves

---

## Alternative: Vercel Deployment (If Required)

If Vercel is strongly preferred, here is what would need to change:

### Required Changes

1. **Create `vercel.json`**:
```json
{
  "version": 2,
  "builds": [
    { "src": "server.js", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/(.*)", "dest": "/server.js" }
  ]
}
```

2. **Replace file storage with a database**:
   - Use MongoDB Atlas (free tier) or Supabase
   - Create a database adapter module
   - Replace all `readFileSync`/`writeFileSync` calls

3. **Handle serverless constraints**:
   - The game state would need to be stored externally
   - Each API call is stateless in serverless

**This is significantly more work than using Railway.**

---

## Notes

- VOICEVOX TTS will not work in any cloud deployment (requires local VOICEVOX server)
- All other features work fully in cloud deployment
- The free tier on Railway should be sufficient for personal use

---

## Files to Review for Implementation

- `server.js` - Main server entry point; verify PORT environment variable handling
- `package.json` - Contains start script; may need to add railway.json
- `.env.example` - Template for required environment variables
- `src/game-stats.js` - File storage logic; paths may need updating for persistent volumes
- `src/jpdb.js` - Another file using local storage; same consideration for volumes
