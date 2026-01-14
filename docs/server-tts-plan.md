# Server-Side TTS Implementation Plan

## Overview

Enable VOICEVOX Text-to-Speech on the server to support Japanese vocabulary words and dialogue narration without requiring users to run VOICEVOX locally.

### Current State
- Existing VOICEVOX integration in `src/voicevox.js` - **already complete**
- Prefetch system in `src/game/prefetch.js` caches TTS audio - **already complete**
- TTS settings configurable via `/api/settings` - **already complete**
- **Only missing**: Server-side VOICEVOX deployment

### Solution
Run VOICEVOX Engine as a Docker container alongside the JRPG app on Railway.

---

## Why VOICEVOX

| Criteria | VOICEVOX |
|----------|----------|
| **Japanese Quality** | Excellent - purpose-built for Japanese |
| **Pitch Accent** | Visual display & editing support |
| **Voice Selection** | 40+ anime-style character voices |
| **Cost** | Free (open source) |
| **Integration** | Already implemented in codebase |

VOICEVOX is the best choice because:
1. **Already integrated** - `src/voicevox.js` is complete and working
2. **Best Japanese voices** - Native Japanese TTS with anime character voices
3. **Free forever** - No API costs regardless of usage
4. **Pitch accent accuracy** - Critical for vocabulary learning

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Railway Project                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────┐          ┌─────────────────────────┐   │
│  │   JRPG      │  HTTP    │      VOICEVOX           │   │
│  │   App       │ -------> │      Engine             │   │
│  │  (Node.js)  │ :50021   │      (Docker)           │   │
│  └─────────────┘          └─────────────────────────┘   │
│        │                            │                    │
│        └── Public URL               └── Internal only    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## Railway Deployment

### Option A: Railway Docker Service (Recommended)

Railway can run Docker images directly. Deploy VOICEVOX as a separate service in the same project.

**Step 1: Add VOICEVOX Service**

1. In Railway dashboard, click "New Service" → "Docker Image"
2. Enter image: `voicevox/voicevox_engine:cpu-latest`
3. Railway will deploy the container

**Step 2: Configure Networking**

Railway services in the same project can communicate via internal networking:
- VOICEVOX internal URL: `voicevox.railway.internal:50021`

**Step 3: Set Environment Variable**

In the JRPG service, add:
```
VOICEVOX_URL=http://voicevox.railway.internal:50021
```

**Step 4: Update Code (One Line)**

The existing `src/voicevox.js` already reads from environment:
```javascript
let voicevoxUrl = process.env.VOICEVOX_URL || 'http://localhost:50021';
```

No code changes needed!

### Option B: Render with Docker

If using Render instead:

1. Create a new "Background Worker" or "Private Service"
2. Use Docker image: `voicevox/voicevox_engine:cpu-latest`
3. Set internal hostname and update `VOICEVOX_URL`

### Option C: Dedicated VPS

For more control or GPU acceleration:

```bash
# On a VPS (DigitalOcean, Linode, etc.)
docker run -d \
  --name voicevox \
  --restart unless-stopped \
  -p 50021:50021 \
  voicevox/voicevox_engine:cpu-latest

# For GPU (NVIDIA)
docker run -d \
  --name voicevox \
  --restart unless-stopped \
  --gpus all \
  -p 50021:50021 \
  voicevox/voicevox_engine:nvidia-latest
```

Then set `VOICEVOX_URL=http://your-vps-ip:50021` in Railway.

---

## Resource Requirements

### VOICEVOX CPU Mode

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 2 GB | 4 GB |
| CPU | 1 core | 2 cores |
| Disk | 2 GB | 2 GB |
| Latency | ~2-3s | ~1-2s |

### VOICEVOX GPU Mode

| Resource | Requirement |
|----------|-------------|
| RAM | 4 GB |
| GPU | NVIDIA with 4GB+ VRAM |
| CUDA | 11.x or 12.x |
| Latency | ~0.2-0.5s |

### Railway Pricing Impact

- VOICEVOX service: ~$5-10/month (CPU mode)
- Total with JRPG app: ~$10-15/month
- Stays within reasonable hobby project budget

---

## Implementation Steps

### Step 1: Test Locally (5 minutes)

```bash
# Pull and run VOICEVOX
docker run -d -p 50021:50021 voicevox/voicevox_engine:cpu-latest

# Test it works
curl http://localhost:50021/version

# Test with the app
VOICEVOX_URL=http://localhost:50021 npm start
```

### Step 2: Deploy to Railway (10 minutes)

1. Open Railway project (from DEPLOYMENT_PLAN.md)
2. Click "New" → "Docker Image"
3. Enter: `voicevox/voicevox_engine:cpu-latest`
4. Wait for deployment
5. Add to JRPG service variables: `VOICEVOX_URL=http://voicevox.railway.internal:50021`
6. Redeploy JRPG service

### Step 3: Verify (5 minutes)

1. Open the deployed JRPG app
2. Go to Settings → Enable TTS
3. Test vocabulary pronunciation in combat

---

## Caching Strategy

The existing prefetch system handles caching well. For vocabulary specifically:

### Vocabulary Words (Aggressive Caching)
- Cache key: `vocab_${word}_${reading}_${speakerId}`
- TTL: Indefinite (vocab words don't change)
- Storage: In-memory + optional persistent cache

### Dialogue/Narration (Limited Caching)
- Cache key: `narration_${hash(text)}_${speakerId}`
- TTL: 5 minutes (from existing prefetch.js)
- Storage: In-memory only

The existing `src/game/prefetch.js` already implements this pattern.

---

## Voice Selection Guide

VOICEVOX includes many character voices. Recommended for JRPG:

| Use Case | Speaker ID | Character | Style |
|----------|------------|-----------|-------|
| **Narrator** | 13 | 青山龍星 | Calm, mature male |
| **Vocab Learning** | 3 | ずんだもん | Clear, friendly |
| **NPC Female** | 0 | 四国めたん | Neutral female |
| **NPC Male** | 13 | 青山龍星 | Mature male |
| **Enemy** | 4 | 春日部つむぎ | Energetic |

Full speaker list available at: `GET /speakers` endpoint

---

## Configuration

### Environment Variables

```bash
# Required for TTS
VOICEVOX_URL=http://voicevox.railway.internal:50021

# Existing TTS settings (in game settings, not env vars)
# gameTtsEnabled: true/false
# gameTtsSpeakerId: 13
# gameTtsSpeed: 0.9
# gameTtsVolume: 1.0
```

### Settings UI

The existing settings UI already supports:
- Enable/disable TTS
- Speaker selection
- Speed adjustment
- Volume control

No frontend changes needed.

---

## Cost Summary

| Component | Monthly Cost |
|-----------|-------------|
| Railway JRPG App | ~$5 |
| Railway VOICEVOX | ~$5-10 |
| **Total** | **~$10-15/month** |

Compare to cloud TTS APIs:
- OpenAI TTS: $15-30/1M chars
- ElevenLabs: $180/1M chars
- Google Cloud: $4-16/1M chars

VOICEVOX is **free** regardless of usage volume.

---

## Checklist

- [ ] Test VOICEVOX Docker locally
- [ ] Deploy VOICEVOX to Railway as Docker service
- [ ] Set `VOICEVOX_URL` environment variable
- [ ] Verify TTS works in deployed app
- [ ] Update DEPLOYMENT_PLAN.md to remove "VOICEVOX won't work in cloud" note

---

## References

- [VOICEVOX Engine Docker Hub](https://hub.docker.com/r/voicevox/voicevox_engine)
- [VOICEVOX GitHub](https://github.com/VOICEVOX/voicevox_engine)
- [Railway Docker Deployment](https://docs.railway.app/guides/dockerfiles)
- [Existing Integration: src/voicevox.js](../src/voicevox.js)
