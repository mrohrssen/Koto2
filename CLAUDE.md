# Koto

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

Japanese vocabulary learning RPG — bright sci-fi fantasy where creatures and humans coexist. See [docs/WORLD.md](docs/WORLD.md) for theme/lore and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for technical architecture.

## Core Design Principle: Comprehensible Input (i+1)

**Every piece of Japanese text shown to the player MUST contain only words they already know, plus at most 1 unknown word (i+1).** This is not a nice-to-have — it is the entire purpose of the game. All AI-generated text (DM narration, NPC dialogue, door hints) must be validated against the player's known vocabulary before being shown. Static fallback text is NOT safe unless it was also generated against that specific player's vocab. Showing unvalidated Japanese text to the player is a critical bug that defeats the game's reason for existing.

## Japanese Translation Accuracy

**English translations of Japanese words MUST be dictionary-accurate.** This is a language learning game — every translation the player sees becomes something they memorize. Creative liberties with meaning are as bad as teaching the wrong word entirely.

- **Transitivity matters:** 狂う means "go mad" (intransitive), NOT "drive mad" (transitive/causative). 迷う means "get lost / hesitate," NOT "bewilder." Never flip a word's transitivity to make it sound cooler.
- **Use primary dictionary definitions:** Present the most common meaning first. If a word has multiple senses, show them separated by `/` (e.g., "invite / tempt").
- **No embellishment:** Don't upgrade "scatter" to "shatter," "invite" to "lure," or "go mad" to "drive mad." If the accurate translation feels underwhelming for a game ability name, pick a different word — don't bend the translation.
- **Show raw JPDB definitions:** When suggesting Japanese words, always show the exact `meanings` array from the JPDB API response. Do not paraphrase or summarize. The user must be able to verify every translation against the source data.
- **When in doubt, check a dictionary.** If you're unsure whether an English gloss is accurate, say so rather than guessing.

## Commands

```bash
npm install    # Install dependencies
npm run dev    # Development with watch
npm start      # Production
```

## Testing

**We do NOT use e2e test suites.** The `tests/e2e/` directory is legacy and unmaintained. Instead, playtest manually using the Playwright MCP browser (headless) — see the Playtesting section below.

**Syntax check after editing JS** (catches errors fast):
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
  js/ui/               # UI modules (combat-loop, robot-row, lookup, etc.)
  game.css             # Game UI styling
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
    services/          # Robot combat, collection, items, exploration
data/
  robots.json          # Starter robot definitions
  creatures.json       # Wild creature definitions
  items.json           # Consumable item definitions
  enemies.json         # Enemy definitions
  bosses.json          # Boss definitions
```

For detailed architecture, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Coding Conventions

- ES6 modules with imports/exports
- Japanese names with English fallbacks: `name` (Japanese), `nameEn` (English)
- Constants in ALL_CAPS: `ENEMIES`, `WARD_INFO`, `ROBOTS`
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

**Before playtesting, READ [`docs/playtest-guide.md`](docs/playtest-guide.md).** It contains phase-by-phase instructions for what to expect at every screen, how to interact, and what bugs to look for.

**For CSS/visual work**, Playwright is configured to use WebKit (Safari's engine) with iPhone 15 Pro emulation via `.mcp.json`. See the "Visual CSS Audit" section in the playtest guide. Inject safe-area mocks at session start:
```js
await page.addStyleTag({ path: 'public/dev-safe-area.css' });
```

### Playwright interaction patterns

**Keep the browser open.** Don't close/reopen between phases — the user may be watching on a second screen. Just navigate or reload as needed.

**Narration boxes** have an animated `▼` arrow that Playwright considers "not stable", so clicking by ref often times out. Instead use:
```js
await page.evaluate(() => document.querySelector('.narration-box')?.click());
```
Some narrations have multiple pages — keep clicking until they dismiss or buttons become enabled.

**Vocab cards (combat):** Cards must be **clicked first** to flip (reveals word + meaning), then **swiped** to register the action. Swipe right = "knew it" (attack), swipe left = "didn't know" (defend). Use mouse gestures:
```js
const card = await page.locator('.dual-flash-card.attack').boundingBox();
const cx = card.x + card.width / 2, cy = card.y + card.height / 2;
await page.mouse.move(cx, cy);
await page.mouse.down();
await page.mouse.move(cx + 200, cy, { steps: 10 }); // swipe right
await page.mouse.up();
```

**Game state:** Don't use `/api/game/state` directly (requires auth cookies). Instead read state from the browser:
```js
await page.evaluate(() => window.__gameState?.phase);
```

**General tips:**
- Always `browser_snapshot` before interacting — refs change after every DOM update
- Use `browser_take_screenshot` at checkpoints so the user can see visual state. **Delete screenshots after** they've been shown — run `rm <filename>` to avoid cluttering the repo
- After server restart, wait 3s then verify with `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
- Robot popups can accidentally open if you click a robot slot — dismiss with `page.evaluate(() => document.querySelector('.robot-popup')?.remove())`

Update the guide when adding new features or discovering new interaction patterns.

## Sprite Cache Busting

Sprites are served with 1-year immutable cache headers. When regenerating sprites, **bump `SPRITE_VERSION`** in `public/js/ui/sprite-utils.js` so users' browsers fetch the new files. Use the date of generation (e.g. `'20250212'`).

## Common Mistakes to Avoid

- **Don't reference iRO stats** - The game uses only `attack` and `maxHp`. No STR/AGI/VIT/INT/DEX/LUK.
- **Don't add equipment systems** - Players use robots and consumable items only.
- **Don't run `npx playwright test` directly** - Use the wrapper script or exact command above.
- **Don't use Homebrew git** - Use `/usr/bin/git` to avoid library conflicts.
- **Don't skip worktrees** - Multiple Claude sessions will conflict without them.
- **Don't forget to bump `SPRITE_VERSION`** - After regenerating sprites, update it in `public/js/ui/sprite-utils.js` or users will see cached old sprites.
- **Don't use Read tool to "show" images** - The Read tool's image display does NOT render in the terminal. To show the user images, serve them via a local HTTP server and display in the Playwright MCP browser (e.g., `python3 -m http.server` then `browser_navigate`).
- **Don't launch Playwright without asking first** - Always ask the user before opening a Playwright browser session. Chrome session conflicts are common and launching blindly breaks things.

## Session Cleanup Rules

- **Delete screenshots immediately** - You MUST `rm` any screenshot file within the same tool-call block where you take it, after it's been shown. Never leave PNGs in the repo.
- **No files in repo root** - Never create files (PNGs, HTML, CSVs, logs) in the repo root. Use `tmp/` for throwaway files, `output/` for generated artifacts. Both are gitignored.
- **Clean up worktrees** - Before ending a session, remove your worktree with `git worktree remove` if your branch has been merged.
- **Never commit generated caches** - Runtime-generated files (`vocab-cache-*.json`, `npc-memory-*.json`, dialogue caches) must never be `git add`-ed. Check `.gitignore` covers them.

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
