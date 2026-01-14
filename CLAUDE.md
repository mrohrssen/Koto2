# NEO TOKYO: System Liberation

> **BEFORE WRITING ANY CODE** - Multiple Claude sessions may be active. Run these commands first:
> ```bash
> /usr/bin/git fetch origin && /usr/bin/git status
> /usr/bin/git checkout -b feature/your-feature-name   # ALWAYS work on a branch
> ```
> When done: commit, checkout master, pull, merge your branch, push, delete branch.

Japanese vocabulary learning RPG. Cyberpunk Tokyo where citizens are possessed by the SYSTEM AI and need liberation. Turn-based dungeon crawling with JPDB vocabulary integration and AI-generated narration.

## Tech Stack

- **Backend**: Express.js (Node.js ES modules)
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Data**: Local JSON files (.jrpg-save.json, .jrpg-settings.json, .jrpg-vocab-cache.json)
- **APIs**: JPDB (vocabulary), OpenAI/Anthropic/Google (narration), VOICEVOX (TTS)

## Commands

```bash
npm install    # Install dependencies
npm run dev    # Development with watch
npm start      # Production
npm test       # Run e2e tests (Playwright)
```

## Testing

**Always run e2e tests after adding a feature.** Tests are in `tests/` using Playwright.

```bash
npm test                    # Run all tests
npx playwright test --ui    # Interactive test UI
```

## Git Workflow (Multi-Session Safe)

Multiple Claude Code sessions run in parallel. **Never work directly on master.**

```bash
# START: Always do this first
/usr/bin/git fetch origin && /usr/bin/git status
/usr/bin/git checkout -b feature/your-feature-name

# FINISH: When done with your feature
/usr/bin/git add -A && /usr/bin/git commit -m "Your message"
/usr/bin/git checkout master && /usr/bin/git pull origin master
/usr/bin/git merge feature/your-feature-name
/usr/bin/git push origin master
/usr/bin/git branch -d feature/your-feature-name
```

Branch prefixes: `feature/`, `fix/`, `refactor/`

## Key Directories

```
server.js              # Main Express server (50+ API endpoints)
public/
  game.js              # Frontend game logic
  game.css             # Cyberpunk UI styling
  game.html            # Main game template
  assets/              # Sprites, backgrounds
src/
  jpdb.js              # JPDB API integration with rate limiting
  ai-providers.js      # Multi-provider AI abstraction
  game/
    loop.js            # GameManager class (main game orchestration)
    state.js           # Player/run/combat state, meta-progression
    stats.js           # iRO-based stats formulas (STR/AGI/VIT/INT/DEX/LUK)
    enemies.js         # Enemy definitions, intent patterns, bosses
    rooms.js           # Ward system, room generation
    dm.js              # Dungeon Master narration system
    combat.js          # Combat mechanics
    items/
      chips.js         # Chip system (core equipment, rarities, effects)
      equipment.js     # Weapons, armor, shields, accessories
      consumables.js   # Potions, healing items
      skills.js        # Character abilities
```

## File Summaries

Major files have comprehensive JSDoc headers (first 50-80 lines) with:
- **PURPOSE**: What the file does and why it exists
- **KEY EXPORTS**: Functions, classes, and constants
- **DEPENDENCIES**: What it imports and why
- **DATA STRUCTURES**: Key object shapes and their fields
- **ARCHITECTURE NOTES**: How it fits in the system
- **CLAUDE HINTS**: Specific guidance for working with the file

**Read summaries first** before diving into full file contents to quickly understand if a file is relevant to your task. Files with summaries: `game.js`, `loop.js`, `state.js`, `enemies.js`, `chips.js`, `equipment.js`, `rooms.js`, `prefetch.js`, `server.js`.

## Key Game Systems

- **Chips**: Passive augmentations with rarities (Common 1.0x → Legendary 3.0x stat multipliers)
- **Stats**: iRO-based primary stats with derived stats (ATK, DEF, HIT, FLEE, CRIT, etc.)
- **JPDB Integration**: Vocabulary lookup, learning states, constrains AI narration to user's level
- **Enemy Dialogue**: 3 states (Possessed/Liberation/Boss) with AI-generated contextual dialogue
- **Ward System**: 7 Tokyo wards as dungeon floors (Nerima → Imperial Palace)

## Coding Conventions

- ES6 modules with imports/exports
- Japanese names with English fallbacks: `name` (Japanese), `nameEn` (English)
- Constants in ALL_CAPS: `CHIPS`, `WEAPONS`, `STAT_NAMES`
- camelCase for variables/functions
- Factory functions: `createNewPlayer()`, `generateEnemy()`, `createCombatState()`

## Item Schema

```javascript
{
  id: 'item_id',
  name: '日本語名',      // Japanese name
  nameEn: 'English Name', // English fallback
  description: '説明',
  rarity: 'common|uncommon|rare|epic|legendary',
  // ... type-specific fields
}
```

## API Endpoint Namespaces

- `/api/game/` - Game management (create-player, start-run, attack, etc.)
- `/api/jpdb/` - JPDB vocabulary integration
- `/api/vocab/` - Word suggestion system
- `/api/tts/` - VOICEVOX text-to-speech

## Deployment

- **Production URL**: https://jrpg-production.up.railway.app
- **VOICEVOX URL**: https://voicevox-production.up.railway.app
- **Railway Dashboard**: https://railway.com/project/3bf46306-66b8-4d9c-9afa-93156f95bbc3

## Environment Variables

- `JPDB_API_KEY` - Required for vocabulary integration
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` - At least one required for AI narration
- `PORT` - Server port (default: 3000)

## Important Notes

- **Always run `npm test` after adding features** - e2e tests catch UI regressions
- Rate limit external APIs (500ms intervals for JPDB)
- File-based caching for JPDB responses and TTS audio
- Frontend uses localStorage for user API keys and preferences
- Deployment requires persistent storage (Railway recommended, not Vercel)
- **Always use system git/curl** (`/usr/bin/git`, `/usr/bin/curl`) - Homebrew versions have library conflicts
