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
- **When in doubt, check a dictionary.** If you're unsure whether an English gloss is accurate, say so rather than guessing.

## Commands

```bash
npm install    # Install dependencies
npm run dev    # Development with watch
npm start      # Production
```

## Testing

**Three-tier test system** — see `tests/README.md` for full conventions.

```bash
npm test              # Tier 1 (unit) + Tier 2 (integration) — must pass before merge
npm run test:unit     # Unit tests with c8 coverage
npm run test:integration  # Integration tests
npm run test:smoke    # On-demand smoke tests (real AI calls, not a gate)
npm run test:coverage # View HTML coverage report
```

**Syntax check after editing JS** (catches errors fast):
```bash
node --check public/js/yourfile.js && echo "OK"
```

CI runs Tier 1 + 2 on every push and PR via GitHub Actions. Coverage has a ratcheting floor — it can only go up. Playtest manually using the Playwright MCP browser for visual/UX verification.

## Git Workflow (Multi-Session Safe with Worktrees)

Multiple Claude sessions share the same repo. **Branches alone don't work** - switching branches in one terminal affects all terminals. Use **git worktrees** to isolate each session's work.

**Always pull before starting work and push when done** to keep all machines in sync:

```bash
# ============ SYNC: Pull latest before starting ============
git pull origin master

# ============ START: Create isolated worktree ============
PROJECT_ROOT=$(git rev-parse --show-toplevel)
cd "$PROJECT_ROOT"
git fetch origin
git worktree add ../koto-wt-myfeature -b feature/my-feature-name

# Work in the new directory (isolated from main repo)
cd ../koto-wt-myfeature
npm install  # If needed

# ============ FINISH: Merge, push, and cleanup ============
# Commit your changes in the worktree
git add -A && git commit -m "Your message"

# Go to main repo to merge
cd "$PROJECT_ROOT"
git checkout master
git pull origin master
git merge feature/my-feature-name
git push origin master

# Remove the worktree and branch
git worktree remove ../koto-wt-myfeature
git branch -d feature/my-feature-name
```

**Why worktrees?** Each worktree is a separate directory with its own branch. Multiple Claude sessions can work on different features simultaneously without conflicts.

**GitHub sync rules:**
- `git pull origin master` at the start of every session
- `git push origin master` after merging completed work
- Never force-push to master

Branch prefixes: `feature/`, `fix/`, `refactor/`

## Key Directories

```
server.js              # Main Express server (50+ API endpoints)
public/
  js/game.js           # Frontend coordinator
  js/ui/               # UI modules (combat-loop, creature-row, lookup, etc.)
  game.css             # Game UI styling
  game.html            # Main game template
  assets/              # Sprites, backgrounds
src/
  ai-providers.js      # Multi-provider AI abstraction
  game/
    loop.js            # GameManager class (central coordinator)
    state.js           # State factories, meta-progression
    rooms.js           # Area system, room generation
    dm.js              # Dungeon Master narration
    combat/effects.js  # Creature combat status effects
    services/          # Creature combat, collection, items, exploration
data/
  creatures.json       # Creature definitions
  items.json           # Consumable item definitions
```

For detailed architecture, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Coding Conventions

- ES6 modules with imports/exports
- Japanese names with English fallbacks: `name` (Japanese), `nameEn` (English)
- Constants in ALL_CAPS: `WARD_INFO`, `CREATURES`, `ROOM_TYPES`
- camelCase for variables/functions
- Factory functions: `createNewPlayer()`, `createNewRun()`, `generateAreaRooms()`

## API Endpoint Namespaces

- `/api/auth/` - Authentication (login, register, API keys)
- `/api/game/` - Game state, combat, exploration, meta-progression
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

**Narration boxes** must be dismissed by clicking **OUTSIDE** the box, not inside it. Clicking inside the narration box does nothing — the interior is a safe zone for word exploration/lookup. Click the `.scene-area` behind it or any area outside the box:
```js
await page.evaluate(() => {
  const scene = document.querySelector('.scene-area');
  if (scene) scene.click();
});
```
Some narrations have multiple pages (shown by a `▼` indicator) — keep clicking outside with ~600ms delays between clicks until the box disappears or buttons become enabled. **Some narrations have response buttons** (e.g., "Yes, I understand!") that appear below the narration box. When these are present, clicking outside does nothing — you must click the button to proceed. Always screenshot or snapshot to check for buttons before assuming a click-outside loop will work.

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
- **Use `npm run dev` (Vite + Express), NOT `npm start`.** Navigate to `http://localhost:5173` (Vite), NOT `:3000` (Express). Without Vite, bare module imports like `animejs` fail and the game JS module graph silently breaks.
- After server restart, wait 5s then verify with `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173`
- Creature popups can accidentally open if you click a creature slot — dismiss with `page.evaluate(() => document.querySelector('.creature-popup')?.remove())`

Update the guide when adding new features or discovering new interaction patterns.

## Sprite Cache Busting

Sprites are served with 1-year immutable cache headers. When regenerating sprites, **bump `SPRITE_VERSION`** in `public/js/ui/sprite-utils.js` so users' browsers fetch the new files. Use the date of generation (e.g. `'20250212'`).

## Koto Forge Skills (Claude Code Commands)

Game content design skills live in `.claude/plugins/koto-forge/1.1.0/skills/` and are registered as Claude Code commands via symlinks in `.claude/commands/`. On a fresh machine, run the setup script:

```bash
bash scripts/setup-claude-skills.sh
```

This symlinks each skill's `SKILL.md` into `.claude/commands/<skill-name>.md`. Restart Claude Code after running.

**Available skills:**

| Skill | Trigger | Description |
|-------|---------|-------------|
| `creature-forge` | `/creature-forge [word]` | Design creatures from English words (5-phase, learnset builder) |
| `creature-animate` | `/creature-animate` | Animate staging PNGs into idle sprites via ComfyUI |
| `move-forge` | `/move-forge [verb]` | Design combat moves from Japanese verbs |
| `item-forge` | `/item-forge [--type]` | Generate items (consumables, equipment, crafting resources) |
| `area-forge` | `/area-forge [word]` | Design areas with sub-areas from Japanese location words |
| `npc-forge` | `/npc-forge [area]` | Generate 5 area-matched NPCs with bond-based character cards |
| `jpdb-frequency-lookup` | `/jpdb-frequency-lookup` | Enrich word lists with JPDB frequency ranks |
| `sprite-quality-pipeline` | `/sprite-quality-pipeline` | Three-gate sprite quality enforcement |

Skills use `process.cwd()` for project paths and `$CLAUDE_PROJECT_DIR` for sub-skill references — no hardcoded machine paths. Edit skills in the repo and changes take effect immediately (symlinked).

## Visual Verification Rule

**All visual/CSS/animation/rendering changes MUST be verified with screenshots before reporting completion.** Never claim a visual fix works based on code reasoning alone — run the dev server, open Playwright, navigate to the affected screen, and take a screenshot proving the change is visible. If the fix involves combat animations, play through to combat. If it involves backgrounds, navigate to where the background renders. Evidence before assertions, always.

## PvE / PvP Parity

**Never modify PvE combat in ways that disconnect it from PvP.** Both battle modes must share the same visual and mechanical systems. When adding or upgrading combat features (animations, effects, damage display, status indicators), the implementation should work for both PvE and PvP automatically. When that's not possible, both attack loops must be updated in the same PR. A feature that works in PvE but not PvP (or vice versa) is incomplete.

## Adding Dialogue (Static Frames Pipeline)

All static Japanese text shown to the player (barks, narration, befriend prompts, shop lines, NPC dialogue, etc.) lives in the **frames pipeline**. Never hand-write tokenizations or meanings — the pipeline generates them from Sudachi + the word dictionary.

**Files:**
- `data/dialogue/frame-sources.json` — **author here**. Each entry has `id`, `category`, `raw` (Japanese text), and `slots` (template markers).
- `data/dialogue/frames.json` — **generated output, never edit directly**. Contains tokenized frames with `tokens[]` and `words[]`.

**Workflow:**
```bash
# 1. Add your raw Japanese text to frame-sources.json
#    (id, category, raw, slots — see existing entries for format)

# 2. Run the tokenizer (Sudachi + dictionary enrichment)
node scripts/tokenize-static.js

# 3. Validate all frames against the dictionary
node scripts/validate-dialogue.js

# 4. Run tests
npm test
```

**Rules:**
- `frames.json` is a build artifact. If you need to change dialogue, change `frame-sources.json` and regenerate.
- **Write raw text in kanji** (e.g. `待って！` not `まって！`). Sudachi needs kanji to tokenize correctly — the pipeline outputs hiragana readings, and the renderer decides what to show the player.
- Every content word must exist in the word dictionary (`data/dictionary.json`). The validator will catch missing entries.
- Barks (category `bark_*`) must have ≤ 3 content words.
- Frame categories follow the pattern: `befriend_wait`, `befriend_name`, `bark_onHit`, `shop`, `greeting`, etc.

## Common Mistakes to Avoid

- **Don't add equipment systems without the plan** - Equipment is designed via `/item-forge --type equipment`. See `docs/plans/2026-03-02-equipment-crafting-town-mvp-design.md`.
- **Don't run `npx playwright test` directly** - Use the wrapper script or exact command above.
- **Don't use Homebrew git** - Use `/usr/bin/git` to avoid library conflicts.
- **Don't skip worktrees** - Multiple Claude sessions will conflict without them.
- **Don't forget to bump `SPRITE_VERSION`** - After regenerating sprites, update it in `public/js/ui/sprite-utils.js` or users will see cached old sprites.
- **Don't use Read tool to "show" images** - The Read tool's image display does NOT render in the terminal. To show the user images, serve them via a local HTTP server and display in the Playwright MCP browser (e.g., `python3 -m http.server` then `browser_navigate`).
- **Don't launch Playwright without asking first** - Always ask the user before opening a Playwright browser session. Chrome session conflicts are common and launching blindly breaks things.
- **Don't break PvE/PvP parity** - Combat features (animations, effects, UI) must work in both PvE and PvP. If you touch one attack loop, update the other.
- **Don't hand-write frames.json** - `data/dialogue/frames.json` is generated by `node scripts/tokenize-static.js` from `frame-sources.json`. Add raw text to `frame-sources.json` and run the pipeline. Hand-crafted tokenizations will have wrong word boundaries and meanings.
- **Report non-JSON code changes during forging** - Forge subagents should only produce JSON data for `forge-results.json`. If a forge job requires new code (new effect types, new systems, engine changes), **always report this to the user** before or immediately after. Don't silently add new code paths — the user needs to approve structural changes separately from content.
- **NEVER modify `data/dictionary.json` without explicit user confirmation** - The dictionary is a curated language-learning resource, not a generic data file. Every definition directly affects what players learn. Always ask the user before adding, changing, or removing any entry — even if it seems like an obvious fix.

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

## ComfyUI (Image Generation)

A ComfyUI instance (RTX 3090, 24GB VRAM) is available via SSH reverse tunnel from the developer's local machine. A watchdog auto-restarts ComfyUI if it crashes or becomes unresponsive.

- **API endpoint:** `http://127.0.0.1:8188` — use from server-side code, no auth needed
- **Web UI:** `https://76.13.220.142` — self-signed cert, basic auth: `comfyui` / `832fw+i/oW+2Mol8gnzA`

### Management

```bash
# Force restart ComfyUI (watchdog picks this up within ~30s)
curl -s http://127.0.0.1:8189/restart

# Check if restart server is alive
curl -s http://127.0.0.1:8189/ping
```

If ComfyUI is unresponsive and you did NOT request a restart, the watchdog will auto-detect and restart it within ~90 seconds. You can speed this up by hitting the restart endpoint above.

### ComfyUI Built-in Management

```bash
# Check if ComfyUI is up
curl -s http://127.0.0.1:8188/system_stats | jq .system.comfyui_version

# Interrupt current generation
curl -s -X POST http://127.0.0.1:8188/interrupt

# Clear the queue
curl -s -X POST http://127.0.0.1:8188/queue \
  -H "Content-Type: application/json" \
  -d '{"clear": true}'

# View queue status
curl -s http://127.0.0.1:8188/queue

# Free VRAM/RAM
curl -s -X POST http://127.0.0.1:8188/free \
  -H "Content-Type: application/json" \
  -d '{"unload_models": true, "free_memory": true}'
```

### Generating Images

```bash
# Queue a workflow
curl -s -X POST http://127.0.0.1:8188/prompt \
  -H "Content-Type: application/json" \
  -d '{"prompt": <workflow_json>}'

# Check history for a prompt
curl -s "http://127.0.0.1:8188/history/<prompt_id>"

# Download generated image
curl -s "http://127.0.0.1:8188/view?filename=<name>&type=output" -o image.png

# Upload an input image
curl -s -X POST http://127.0.0.1:8188/upload/image -F "image=@myimage.png"

# List available node types
curl -s http://127.0.0.1:8188/object_info | jq 'keys'

# Get info about a specific node type
curl -s "http://127.0.0.1:8188/object_info/<NodeName>"
```

## Skill routing

When the user's request matches an available skill, ALWAYS invoke it using the Skill
tool as your FIRST action. Do NOT answer directly, do NOT use other tools first.
The skill has specialized workflows that produce better results than ad-hoc answers.

Key routing rules:
- Product ideas, "is this worth building", brainstorming → invoke office-hours
- Bugs, errors, "why is this broken", 500 errors → invoke investigate
- Ship, deploy, push, create PR → invoke ship
- QA, test the site, find bugs → invoke qa
- Code review, check my diff → invoke review
- Update docs after shipping → invoke document-release
- Weekly retro → invoke retro
- Design system, brand → invoke design-consultation
- Visual audit, design polish → invoke design-review
- Architecture review → invoke plan-eng-review
