# Console Logging Improvements Design

## Problem

The codebase has sparse, ad-hoc logging with no structured approach:
- **0% logging coverage** in game logic (loop.js, combat-service.js, exploration-service.js)
- **0% logging coverage** in combat mechanics
- Only error-catching in the API layer (no success/request logging)
- Inconsistent `[Module]` prefixes where logging exists
- No way to adjust verbosity without code changes

When the game breaks, there's no trail to follow. Room changes, combat actions, state transitions—all happen silently.

## Goals

- **Production debugging**: Trace what happened when something breaks for a user
- **Development debugging**: Follow execution flow while building features
- **E2E test failures**: Understand what actually happened when tests fail

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Verbosity | Moderate | Log state transitions and actions, not internals |
| Format | Tagged console.log | Human-readable, matches existing patterns |
| Correlation | None | Simpler; timestamps sufficient for matching |
| Log levels | Configurable | Quiet in prod, verbose when debugging |
| Logger location | Separate server/client | No bundler; two small files with same API |

## Logger API

Both server and client loggers share the same interface:

```js
// Usage
logger.error('[Combat] Invalid state:', { phase, expected });
logger.warn('[JPDB] Rate limit approaching');
logger.info('[Room] Entered shop', { ward: 'Shibuya', roomType: 'shop' });
logger.debug('[Combat] Damage calc', { base: 10, multiplier: 1.5 });

// Change level at runtime
logger.setLevel('debug');  // Show everything
logger.setLevel('info');   // Default - hide debug
logger.setLevel('error');  // Quiet mode
```

### Level Hierarchy

`debug` < `info` < `warn` < `error`

Setting level to `info` shows `info`, `warn`, and `error` but hides `debug`.

### Output Format

```
[info] [Combat] Turn ended - player dealt 25 damage
[error] [API] Failed to save game: Network error
[debug] 10:15:32.456 [Room] Generated room options: shop, shrine, combat
```

- Level prefix for grep filtering (`grep "\[error\]"`)
- Module tag for area filtering (`grep "\[Combat\]"`)
- Timestamp only at debug level (keeps info/warn/error clean)

## Implementation

### Server Logger (`src/logger.js`)

- Initial level from `process.env.LOG_LEVEL` or defaults to `info`
- Runtime changes via `logger.setLevel()`
- Uses appropriate console methods (`console.error`, `console.warn`, `console.log`, `console.debug`)

### Client Logger (`public/js/logger.js`)

- Initial level from `localStorage.getItem('logLevel')` or defaults to `info`
- Runtime changes via `logger.setLevel('debug')` in browser console
- Persists preference across page reloads

## What Gets Logged

### Server

| Module | info | warn | debug |
|--------|------|------|-------|
| **GameManager** (`loop.js`) | Player created, run started/ended, ward selected | - | State loaded, essence awarded |
| **CombatService** | Combat started (enemy), combat ended, player action | Invalid action attempted | Damage calcs, enemy intent |
| **ExplorationService** | Room entered, shop purchase, shrine upgrade, chip acquired | Purchase failed | Room options generated |
| **JPDB** | Batch parse completed | Rate limit, circuit breaker | Word lookups, cache hits |
| **API Routes** | - | - Request failures | Request received |

### Client

| Module | info | warn | debug |
|--------|------|------|-------|
| **game.js** | Game initialized, state loaded, phase changed | - | - |
| **combat-loop.js** | Combat started, word reviewed, chip used, combat ended | Stale attack | Timer, animations |
| **api.js** | - | - | Request/response (error always) |
| **exploration.js** | Room action taken | - | - |
| **UI modules** | Significant user actions | - | UI state changes |

## Files to Create

- `src/logger.js` (~40 lines)
- `public/js/logger.js` (~40 lines)

## Files to Modify

### Server (10 files)

1. `src/game/loop.js` - GameManager lifecycle
2. `src/game/services/combat-service.js` - Combat flow
3. `src/game/services/exploration-service.js` - Room navigation
4. `src/game/combat/mechanics.js` - Damage calculations (debug)
5. `src/game/rooms.js` - Room generation (debug)
6. `src/jpdb.js` - Standardize existing + batch logging
7. `src/routes/game/combat.js` - Request errors
8. `src/routes/game/exploration.js` - Request errors
9. `src/routes/game/meta.js` - Request errors
10. `server.js` - Startup logging

### Client (8 files)

1. `public/js/game.js` - Initialization, phase changes
2. `public/js/api.js` - Standardize error logging
3. `public/js/ui/combat-loop.js` - Standardize existing + word reviews
4. `public/js/ui/exploration.js` - Room actions
5. `public/js/ui/chip-select.js` - Chip equip
6. `public/js/ui/economy.js` - Purchases
7. `public/js/ui/actions.js` - User actions
8. `public/js/store.js` - State updates (debug)

## Usage Examples

### Debugging a failed combat

```
[info] [Combat] Started against Glitch Sprite (HP: 45)
[info] [Combat] Word reviewed: 食べる (grade: 5)
[info] [Combat] Player attacked for 12 damage
[info] [Combat] Enemy intent: attack (15 damage)
[error] [Combat] Invalid state transition: expected 'player-turn', got 'ended'
```

### Debugging a room navigation issue

```
[info] [Room] Entered Shibuya ward
[debug] [Room] Generated options: [shop, combat, shrine]
[info] [Room] Player chose: shop
[info] [Room] Entered shop (3 items available)
[info] [Shop] Purchase: Healing Chip (cost: 50)
[warn] [Shop] Purchase failed: insufficient credits (have: 30, need: 50)
```

### Enabling debug mode in browser

```js
// In browser console
logger.setLevel('debug');
// Now see all debug output
// Persists across page reloads
```

## Testing the Logging

After implementation, verify by:
1. Starting a new run - should see player/run creation logs
2. Entering combat - should see enemy spawn, each action
3. Opening browser console during combat - should see word reviews
4. Setting `LOG_LEVEL=debug npm start` - should see verbose output
