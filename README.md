# NEO TOKYO: System Liberation

Japanese vocabulary learning RPG set in cyberpunk Tokyo. Fight SYSTEM-possessed citizens, build chip synergies, and learn Japanese through immersive gameplay.

## Quick Start

```bash
npm install
npm run dev    # Development with watch
# Open http://localhost:3000
```

## Tech Stack

- **Backend:** Express.js (Node.js ES modules)
- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **Data:** Local JSON files
- **APIs:** JPDB (vocabulary), OpenAI/Anthropic/Google (AI narration), VOICEVOX (TTS)

## Documentation

- [Architecture](docs/ARCHITECTURE.md) - How the game works
- [Art Style Guide](docs/art-style.md) - Visual design
- [Deployment](RAILWAY_DEPLOY.md) - Production setup

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JPDB_API_KEY` | Optional | JPDB vocabulary integration (can be client-side) |
| `OPENAI_API_KEY` | One required | AI narration provider |
| `ANTHROPIC_API_KEY` | One required | AI narration provider |
| `GOOGLE_API_KEY` | One required | AI narration provider |
| `PORT` | No | Server port (default: 3000) |

## Testing

```bash
npm test              # E2E tests (Playwright)
npm run test:unit     # Unit tests
```

## Contributing

See [CLAUDE.md](CLAUDE.md) for coding conventions and workflow guidelines.

## Production

- **URL:** https://jrpg-production.up.railway.app
- **Dashboard:** https://railway.com/project/3bf46306-66b8-4d9c-9afa-93156f95bbc3
