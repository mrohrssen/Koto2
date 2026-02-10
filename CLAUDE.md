# NEO TOKYO: System Liberation

> **BEFORE WRITING ANY CODE** - Multiple Claude sessions share this repo. Use git worktrees to isolate your work:
> ```bash
> # Check if you're in a worktree or main repo
> /usr/bin/git rev-parse --show-toplevel
>
> # If in main repo (/Users/michia/Documents/jrpg), create a worktree:
> cd /Users/michia/Documents/jrpg
> /usr/bin/git worktree add ../jrpg-wt-yourfeature -b feature/your-feature-name
> cd ../jrpg-wt-yourfeature
> # Now work here - this directory is isolated from other sessions
> ```

Japanese vocabulary learning RPG. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the game works.

## Commands

```bash
npm install    # Install dependencies
npm run dev    # Development with watch
npm start      # Production
npm test       # Run e2e tests (Playwright)
```

## Testing

**Always run e2e tests after adding a feature.** Tests are in `tests/` using Playwright.

### E2E Testing Rules (CRITICAL - READ THIS)

**USE THE WRAPPER SCRIPT - it enforces correct flags:**

```bash
./scripts/e2e-test.sh                              # Run all tests
./scripts/e2e-test.sh specs/character-creation     # Run specific test
```

**NEVER run playwright directly without the required flags.**

If wrapper doesn't work, use EXACTLY this (no variations):
```bash
cd /Users/michia/Documents/jrpg
pkill -f "node server.js" 2>/dev/null
npm start &
sleep 3
cd tests/e2e && npx playwright test --workers=1 -x
pkill -f "node server.js"
```

**FORBIDDEN - will waste hours on timeouts:**
```bash
npx playwright test --workers=2    # NO! Causes race conditions
npx playwright test                # NO! Runs all 66 tests even on failure
```

**Test thresholds:**
- 66/66 = ideal
- 60+/66 = acceptable (known flakiness)
- <60/66 = broken, fix before committing

**Syntax check BEFORE E2E** (saves time):
```bash
node --check public/js/yourfile.js && echo "OK"
```

### Quick Tests (no server needed)

```bash
npm run test:unit           # Unit tests only (154 tests)
npm run test:integration    # Integration tests (14 tests)
```

## Git Workflow (Multi-Session Safe with Worktrees)

Multiple Claude sessions share the same repo. **Branches alone don't work** - switching branches in one terminal affects all terminals. Use **git worktrees** to isolate each session's work.

```bash
# ============ START: Create isolated worktree ============
cd /Users/michia/Documents/jrpg
/usr/bin/git fetch origin
/usr/bin/git worktree add ../jrpg-wt-myfeature -b feature/my-feature-name

# Work in the new directory (isolated from main repo)
cd ../jrpg-wt-myfeature
npm install  # If needed

# ============ FINISH: Merge and cleanup ============
# Commit your changes in the worktree
/usr/bin/git add -A && /usr/bin/git commit -m "Your message"

# Go to main repo to merge
cd /Users/michia/Documents/jrpg
/usr/bin/git checkout master
/usr/bin/git pull origin master
/usr/bin/git merge feature/my-feature-name
/usr/bin/git push origin master

# Remove the worktree and branch
/usr/bin/git worktree remove ../jrpg-wt-myfeature
/usr/bin/git branch -d feature/my-feature-name
```

**Why worktrees?** Each worktree is a separate directory with its own branch. Multiple Claude sessions can work on different features simultaneously without conflicts.

Branch prefixes: `feature/`, `fix/`, `refactor/`

## Key Directories

```
server.js              # Main Express server (50+ API endpoints)
public/
  js/game.js           # Frontend coordinator
  js/ui/               # UI modules (combat-loop, chip-select, lookup, etc.)
  game.css             # Cyberpunk UI styling
  game.html            # Main game template
  assets/              # Sprites, backgrounds
src/
  jpdb.js              # JPDB API integration
  ai-providers.js      # Multi-provider AI abstraction
  game/
    loop.js            # GameManager class (central coordinator)
    state.js           # State factories, meta-progression
    enemies.js         # Enemy definitions, intent patterns
    rooms.js           # Ward system, room generation
    dm.js              # Dungeon Master narration
    combat/            # Combat mechanics (mechanics.js, player-actions.js, enemy.js)
    items/chips.js     # Chip pipeline system (core mechanic)
data/
  chips.json           # Chip definitions
  enemies.json         # Enemy definitions
  bosses.json          # Boss definitions
```

For detailed architecture, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Coding Conventions

- ES6 modules with imports/exports
- Japanese names with English fallbacks: `name` (Japanese), `nameEn` (English)
- Constants in ALL_CAPS: `CHIPS`, `ENEMIES`, `WARD_INFO`
- camelCase for variables/functions
- Factory functions: `createNewPlayer()`, `generateEnemy()`, `createCombatState()`

## API Endpoint Namespaces

- `/api/auth/` - Authentication (login, register, API keys)
- `/api/game/` - Game state, combat, exploration, meta-progression
- `/api/jpdb/` - JPDB vocabulary integration
- `/api/vocab/` - Word suggestion system
- `/api/tts/` - VOICEVOX text-to-speech
- `/api/settings` - User preferences

## Playtesting with Playwright MCP

**Before playtesting, READ [`docs/playtest-guide.md`](docs/playtest-guide.md).** It contains phase-by-phase instructions for what to expect at every screen, how to interact (swipe not click for cards), and what bugs to look for. Do not improvise.

Key rules:
- Fresh browser session per phase (close between phases)
- Always `browser_snapshot` before interacting
- Screenshot at every checkpoint
- Know what "correct" looks like before you start

Update the guide when adding new features or discovering new interaction patterns.

## Common Mistakes to Avoid

- **Don't reference iRO stats** - The game uses only `attack` and `maxHp`. No STR/AGI/VIT/INT/DEX/LUK.
- **Don't add armor/weapons** - Only chips exist. No equipment slots.
- **Don't run `npx playwright test` directly** - Use the wrapper script or exact command above.
- **Don't use Homebrew git** - Use `/usr/bin/git` to avoid library conflicts.
- **Don't skip worktrees** - Multiple Claude sessions will conflict without them.

## Deployment

- **Production URL**: https://jrpg-production.up.railway.app
- **Railway Dashboard**: https://railway.com/project/3bf46306-66b8-4d9c-9afa-93156f95bbc3

## Bug Reports

Users can submit bug reports with screenshots from mobile devices. Use these commands to fetch and view them:

```bash
# List recent bug reports (production)
curl -s "https://jrpg-production.up.railway.app/api/bug-reports" | jq '.reports[:5]'

# List recent bug reports (dev)
curl -s "https://jrpg-dev.up.railway.app/api/bug-reports" | jq '.reports[:5]'

# Get specific report metadata
curl -s "https://jrpg-production.up.railway.app/api/bug-reports/<report-id>" | jq

# Download screenshot
curl -L "https://jrpg-production.up.railway.app/api/bug-reports/<report-id>/screenshot" -o screenshot.png
```

Each bug report includes:
- `id` - Unique report identifier
- `note` - User's description of the issue
- `timestamp` - When the report was submitted
- `viewport` - Screen dimensions (width/height)
- `devicePixelRatio` - Screen density (3 for Retina)
- `userAgent` - Browser/device info
- `gameState` - Current game phase, floor, combat status

## Migration Notes

### 2026-02-05: Per-User Vocab Cache
- Old shared cache `data/.jrpg-vocab-suggestions.json` is deprecated
- New per-user caches: `data/vocab-cache-{userId}.json`
- Delete old cache on deploy: `rm -f data/.jrpg-vocab-suggestions.json`
- Each user's JPDB word states are now isolated
- First speed review after deploy will rebuild the cache for each user
