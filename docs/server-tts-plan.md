# Server-Side TTS Implementation Plan

## Overview

This document outlines options and implementation strategy for server-side Text-to-Speech (TTS) to support Japanese vocabulary words and dialogue narration in the JRPG game.

### Current State
- Existing VOICEVOX integration in `src/voicevox.js` connects to local VOICEVOX engine
- Prefetch system in `src/game/prefetch.js` caches TTS audio
- TTS settings configurable via `/api/settings` (enabled, speaker ID, speed, volume)
- Current limitation: Requires local VOICEVOX engine running on user's machine

### Requirements
1. **Vocabulary TTS**: Pronounce individual Japanese words during combat/learning
2. **Dialogue TTS**: Narrate AI-generated Japanese dialogue and story content
3. **Server Deployment**: Run TTS on server without requiring user-side software
4. **Quality**: Natural Japanese pronunciation, anime-style voices preferred
5. **Performance**: Low latency for real-time gameplay

---

## Option Comparison

### Self-Hosted Solutions

| Option | Quality | Japanese | Latency | Cost | Complexity |
|--------|---------|----------|---------|------|------------|
| **VOICEVOX Docker** | Excellent | Native | ~1-2s | Free | Medium |
| **Kokoro-FastAPI** | Very Good | Supported | ~0.5-1s | Free | Low |
| **MeloTTS** | Good | Supported | ~1s | Free | Medium |

### Cloud API Solutions

| Option | Quality | Japanese | Latency | Cost/1M chars | Complexity |
|--------|---------|----------|---------|---------------|------------|
| **OpenAI TTS** | Excellent | Good | ~0.5s | $15-30 | Very Low |
| **Google Cloud TTS** | Excellent | Excellent | ~0.3s | $4-16 | Low |
| **Azure TTS** | Excellent | Excellent | ~0.3s | $4-16 | Low |
| **ElevenLabs** | Premium | Limited | ~0.5s | $180 | Very Low |

---

## Recommended Architecture: Hybrid Approach

Implement a **provider abstraction layer** similar to the existing `ai-providers.js` pattern, allowing flexible switching between TTS backends.

```
┌─────────────────────────────────────────────────┐
│                  TTS Provider                    │
│              (src/tts-providers.js)              │
├─────────────────────────────────────────────────┤
│  ┌───────────┐ ┌───────────┐ ┌───────────────┐  │
│  │ VOICEVOX  │ │  Kokoro   │ │  Cloud APIs   │  │
│  │  Docker   │ │  FastAPI  │ │ (OpenAI/GCP)  │  │
│  └───────────┘ └───────────┘ └───────────────┘  │
└─────────────────────────────────────────────────┘
```

### Priority Order (Recommended)
1. **Primary: Kokoro-FastAPI** - Best balance of quality, cost, and ease of deployment
2. **Fallback: OpenAI TTS** - Already have API key, excellent quality
3. **Alternative: VOICEVOX Docker** - Best Japanese anime voices, more complex setup

---

## Detailed Implementation Plan

### Phase 1: TTS Provider Abstraction Layer

**Create `src/tts-providers.js`**

```javascript
/**
 * TTS Provider Abstraction Layer
 * Supports multiple TTS backends with unified interface
 */

const providers = {
  kokoro: { /* Kokoro-FastAPI implementation */ },
  openai: { /* OpenAI TTS implementation */ },
  google: { /* Google Cloud TTS implementation */ },
  voicevox: { /* Existing VOICEVOX implementation */ }
};

export async function synthesize(text, options = {}) {
  const provider = options.provider || getDefaultProvider();
  return providers[provider].synthesize(text, options);
}

export async function getVoices(provider) {
  return providers[provider].getVoices();
}

export function isProviderAvailable(provider) {
  return providers[provider].isAvailable();
}
```

**Configuration additions to settings:**
```javascript
{
  ttsProvider: 'kokoro',        // 'kokoro' | 'openai' | 'google' | 'voicevox'
  ttsVoiceId: 'af_sky',         // Provider-specific voice ID
  ttsFallbackProvider: 'openai' // Fallback if primary unavailable
}
```

### Phase 2: Kokoro-FastAPI Integration (Primary)

**Why Kokoro:**
- 82M parameters - lightweight, fast inference
- OpenAI-compatible API - easy integration
- Supports Japanese, English, Chinese
- Docker deployment ready
- Free/open-source (Apache 2.0)
- ~0.5-1s latency on CPU, <0.1s on GPU

**Docker Deployment:**
```bash
# CPU Mode (for smaller servers)
docker run -d --name kokoro-tts \
  -p 8880:8880 \
  ghcr.io/remsky/kokoro-fastapi-cpu:latest

# GPU Mode (for production with NVIDIA)
docker run -d --name kokoro-tts \
  --gpus all \
  -p 8880:8880 \
  ghcr.io/remsky/kokoro-fastapi-gpu:latest
```

**Integration Code:**
```javascript
// src/tts/kokoro.js
const KOKORO_URL = process.env.KOKORO_URL || 'http://localhost:8880';

export async function synthesize(text, options = {}) {
  const response = await fetch(`${KOKORO_URL}/v1/audio/speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kokoro',
      voice: options.voice || 'jf_alpha',  // Japanese female voice
      input: text,
      response_format: 'wav',
      speed: options.speed || 1.0
    })
  });

  if (!response.ok) throw new Error(`Kokoro TTS failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function getVoices() {
  const response = await fetch(`${KOKORO_URL}/v1/audio/voices`);
  return response.json();
}

export async function isAvailable() {
  try {
    const response = await fetch(`${KOKORO_URL}/v1/audio/voices`, {
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

### Phase 3: OpenAI TTS Integration (Fallback)

**Why OpenAI as fallback:**
- Already integrated for AI narration
- No additional infrastructure
- Good Japanese support
- ~$15/1M characters (affordable at game scale)

**Integration Code:**
```javascript
// src/tts/openai-tts.js
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function synthesize(text, options = {}) {
  const response = await openai.audio.speech.create({
    model: options.model || 'tts-1',  // or 'tts-1-hd' for higher quality
    voice: options.voice || 'nova',   // Good for Japanese
    input: text,
    response_format: 'wav',
    speed: options.speed || 1.0
  });

  return Buffer.from(await response.arrayBuffer());
}

export async function getVoices() {
  // OpenAI has fixed voices
  return [
    { id: 'alloy', name: 'Alloy', description: 'Neutral' },
    { id: 'echo', name: 'Echo', description: 'Male' },
    { id: 'fable', name: 'Fable', description: 'Expressive' },
    { id: 'onyx', name: 'Onyx', description: 'Deep male' },
    { id: 'nova', name: 'Nova', description: 'Female, warm' },
    { id: 'shimmer', name: 'Shimmer', description: 'Female, clear' }
  ];
}

export async function isAvailable() {
  return !!process.env.OPENAI_API_KEY;
}
```

### Phase 4: VOICEVOX Docker Integration (Alternative)

**Why VOICEVOX:**
- Best anime-style Japanese voices
- 40+ character voices with multiple styles
- Free and open-source
- Already have integration code

**Docker Deployment:**
```bash
# CPU Mode
docker run -d --name voicevox \
  -p 50021:50021 \
  voicevox/voicevox_engine:cpu-latest

# GPU Mode (NVIDIA)
docker run -d --name voicevox \
  --gpus all \
  -p 50021:50021 \
  voicevox/voicevox_engine:nvidia-latest
```

**Existing code in `src/voicevox.js` can be reused** - just configure `VOICEVOX_URL` environment variable.

### Phase 5: Google Cloud TTS Integration (Optional Premium)

**Why Google Cloud:**
- Excellent Japanese voices (Neural2, WaveNet, Chirp 3)
- Low latency (~0.3s)
- 1M free characters/month (WaveNet)
- Best for production scale

**Integration Code:**
```javascript
// src/tts/google-tts.js
import textToSpeech from '@google-cloud/text-to-speech';

const client = new textToSpeech.TextToSpeechClient();

export async function synthesize(text, options = {}) {
  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: {
      languageCode: 'ja-JP',
      name: options.voice || 'ja-JP-Neural2-B',  // High-quality Japanese
      ssmlGender: options.gender || 'FEMALE'
    },
    audioConfig: {
      audioEncoding: 'LINEAR16',
      speakingRate: options.speed || 1.0,
      pitch: options.pitch || 0
    }
  });

  return Buffer.from(response.audioContent);
}

export async function getVoices() {
  const [response] = await client.listVoices({ languageCode: 'ja-JP' });
  return response.voices.map(v => ({
    id: v.name,
    name: v.name,
    gender: v.ssmlGender,
    type: v.name.includes('Neural') ? 'Neural' :
          v.name.includes('Wavenet') ? 'WaveNet' : 'Standard'
  }));
}
```

---

## Server Configuration

### Environment Variables

```bash
# TTS Provider Selection
TTS_PROVIDER=kokoro              # Primary provider
TTS_FALLBACK_PROVIDER=openai     # Fallback provider

# Kokoro-FastAPI
KOKORO_URL=http://localhost:8880

# VOICEVOX
VOICEVOX_URL=http://localhost:50021

# OpenAI (already configured)
OPENAI_API_KEY=sk-...

# Google Cloud (optional)
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
```

### Docker Compose for Full Stack

```yaml
# docker-compose.yml
version: '3.8'

services:
  jrpg:
    build: .
    ports:
      - "3000:3000"
    environment:
      - TTS_PROVIDER=kokoro
      - KOKORO_URL=http://kokoro:8880
      - VOICEVOX_URL=http://voicevox:50021
    depends_on:
      - kokoro

  kokoro:
    image: ghcr.io/remsky/kokoro-fastapi-cpu:latest
    ports:
      - "8880:8880"
    # For GPU: uncomment below
    # deploy:
    #   resources:
    #     reservations:
    #       devices:
    #         - driver: nvidia
    #           count: 1
    #           capabilities: [gpu]

  # Optional: VOICEVOX for anime voices
  voicevox:
    image: voicevox/voicevox_engine:cpu-latest
    ports:
      - "50021:50021"
```

---

## Vocabulary vs Dialogue TTS Strategy

### Vocabulary Words
- **Use Case**: Individual word pronunciation during combat/learning
- **Recommended Provider**: Kokoro or VOICEVOX
- **Voice Style**: Clear, educational pronunciation
- **Speed**: Slightly slower (0.8-0.9x) for learning
- **Caching**: Aggressive - vocab words are finite and repeatable

```javascript
async function synthesizeVocabWord(word, reading) {
  const cacheKey = `vocab_${word}_${reading}`;

  // Check cache first
  const cached = await audioCache.get(cacheKey);
  if (cached) return cached;

  // Synthesize with learning-optimized settings
  const audio = await ttsProviders.synthesize(reading, {
    provider: 'kokoro',
    voice: 'jf_alpha',  // Clear Japanese female
    speed: 0.85         // Slower for learning
  });

  // Cache indefinitely (vocab words don't change)
  await audioCache.set(cacheKey, audio, { ttl: Infinity });
  return audio;
}
```

### Dialogue/Narration
- **Use Case**: AI-generated story narration and NPC dialogue
- **Recommended Provider**: VOICEVOX (character voices) or Kokoro
- **Voice Style**: Expressive, character-appropriate
- **Speed**: Normal (1.0x)
- **Caching**: Limited TTL - narrations are dynamic

```javascript
async function synthesizeNarration(text, characterId) {
  // Map characters to voice IDs
  const voiceMap = {
    narrator: { provider: 'kokoro', voice: 'jm_alpha' },
    npc_merchant: { provider: 'voicevox', voice: 1 },
    npc_blacksmith: { provider: 'voicevox', voice: 13 },
    enemy: { provider: 'voicevox', voice: 3 }
  };

  const config = voiceMap[characterId] || voiceMap.narrator;

  return ttsProviders.synthesize(text, {
    provider: config.provider,
    voice: config.voice,
    speed: 1.0
  });
}
```

---

## API Endpoint Updates

### New/Updated Endpoints

```javascript
// GET /api/tts/providers - List available TTS providers
app.get('/api/tts/providers', async (req, res) => {
  const providers = await ttsProviders.getAvailableProviders();
  res.json(providers);
});

// GET /api/tts/voices/:provider - List voices for provider
app.get('/api/tts/voices/:provider', async (req, res) => {
  const voices = await ttsProviders.getVoices(req.params.provider);
  res.json(voices);
});

// POST /api/tts/synthesize - Synthesize audio
app.post('/api/tts/synthesize', async (req, res) => {
  const { text, provider, voice, speed, type } = req.body;

  const audio = await ttsProviders.synthesize(text, {
    provider: provider || settings.ttsProvider,
    voice: voice || settings.ttsVoice,
    speed: speed || settings.ttsSpeed,
    type  // 'vocab' or 'dialogue' for optimized settings
  });

  res.set('Content-Type', 'audio/wav');
  res.send(audio);
});

// POST /api/tts/vocab/:word - Synthesize vocabulary word (cached)
app.post('/api/tts/vocab/:word', async (req, res) => {
  const { word } = req.params;
  const { reading } = req.body;

  const audio = await synthesizeVocabWord(word, reading || word);

  res.set('Content-Type', 'audio/wav');
  res.send(audio);
});
```

---

## Implementation Steps

### Step 1: Create Provider Abstraction (1-2 hours)
- [ ] Create `src/tts-providers.js` with provider interface
- [ ] Refactor existing `src/voicevox.js` to fit interface
- [ ] Add provider selection to settings

### Step 2: Integrate Kokoro-FastAPI (1-2 hours)
- [ ] Create `src/tts/kokoro.js` implementation
- [ ] Add Docker setup for Kokoro
- [ ] Test Japanese voice quality

### Step 3: Integrate OpenAI TTS (1 hour)
- [ ] Create `src/tts/openai-tts.js` implementation
- [ ] Add fallback logic to provider layer
- [ ] Test with existing OpenAI API key

### Step 4: Update Prefetch System (1-2 hours)
- [ ] Update `src/game/prefetch.js` to use new provider layer
- [ ] Add vocab-specific caching strategy
- [ ] Optimize concurrent TTS requests

### Step 5: Update Server Endpoints (1 hour)
- [ ] Add new TTS API endpoints to `server.js`
- [ ] Update settings API for TTS provider selection
- [ ] Add provider health check endpoints

### Step 6: Frontend Integration (1-2 hours)
- [ ] Update settings UI for TTS provider selection
- [ ] Add voice preview functionality
- [ ] Update audio playback for new formats

### Step 7: Docker Compose Setup (1 hour)
- [ ] Create `docker-compose.yml` for full stack
- [ ] Document deployment process
- [ ] Test on cloud VPS (Digital Ocean, etc.)

---

## Cost Estimates

### Self-Hosted (Kokoro/VOICEVOX)
- **Server**: $5-20/month (DigitalOcean droplet)
- **TTS**: Free
- **Total**: ~$10-20/month

### Cloud API (OpenAI)
- **Typical usage**: ~100k-500k characters/month
- **Cost**: $1.50-7.50/month
- **Best for**: Low-volume or fallback

### Hybrid (Recommended)
- **Primary**: Kokoro self-hosted (free)
- **Fallback**: OpenAI API
- **Total**: ~$10-25/month

---

## Recommended First Steps

1. **Immediate**: Set up Kokoro-FastAPI Docker container locally
2. **Test**: Evaluate Japanese voice quality for vocab and dialogue
3. **Implement**: Create provider abstraction layer
4. **Deploy**: Use Docker Compose for unified deployment

---

## Resources

- [Kokoro-FastAPI GitHub](https://github.com/remsky/Kokoro-FastAPI)
- [VOICEVOX Engine Docker](https://hub.docker.com/r/voicevox/voicevox_engine)
- [OpenAI TTS Documentation](https://platform.openai.com/docs/guides/text-to-speech)
- [Google Cloud TTS](https://cloud.google.com/text-to-speech)
- [MeloTTS GitHub](https://github.com/myshell-ai/MeloTTS)
