# Connection Resilience Design

Mobile-grade connection handling for Koto. Three phases: acute bug fixes, resilience infrastructure, and PvP hardening.

## Context

Koto is a mobile web game. Players are on phones with spotty connections (tunnels, elevators, WiFi handoffs). The current codebase has no retry logic, no offline detection, and several phases that break on page reload. A bug report from 2026-04-04 revealed a player stuck on a blank screen after reloading during NPC dialogue, caused in part by a wrong localStorage key sending 401s.

### Audit Findings

**Bugs found:**
- `game.js:636` uses `localStorage.getItem('token')` instead of `'authToken'` (always 401)
- Combat phase has no reload recovery (blank screen)
- Run + combat state not persisted to disk (server restart loses active games)

**Architectural gaps:**
- No retry/backoff on API calls (1 hardcoded exception)
- Global `isLoading` boolean blocks ALL concurrent requests
- No offline detection or "connection lost" UI
- No 401 recovery (expired token = silently broken forever)
- PvP: no auto-reconnect, in-memory match state, no move timeout, no forfeit award

**Phase resilience:** 21 of 25 phases handle reload safely. Combat, post-combat shop, and PvP battle/result do not.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Run/combat persistence | Same save file as player/meta | Simpler than separate files. Becomes a single jsonb column in Postgres later. |
| Retry strategy | Auto for GETs, opt-in for POSTs | GETs are always safe. Idempotent POSTs can opt in via `retryable: true`. |
| Offline detection | Banner after 2+ consecutive failures | `navigator.onLine` alone is unreliable. Consecutive failure count is the real signal. |
| Offline banner text | Plain English, not Japanese-themed | System infrastructure, not game content. Japanese in error states is confusing. |
| 401 handling | Auto-redirect to login | Proper refresh tokens deferred to Postgres migration. Redirect is simple and complete. |
| PvP reconnect | Socket.IO built-in reconnection | Battle-tested library feature. Custom reconnect reinvents the wheel. |
| Combat reload | Re-initialize combat loop directly | Turn-based game, no countdown needed. Player sees current state and picks a move. |

---

## Phase A: Fix Acute Bugs

Targeted fixes for things stranding real players today.

### A1. Fix token key in loadKnownWords

- **File:** `public/game.js:636`
- **Change:** `localStorage.getItem('token')` to `localStorage.getItem('authToken')`
- One line. Fixes the 401 on `/api/game/known-words` that every player hits.

### A2. Persist run + combat to disk

- **File:** `src/game/manager-registry.js`
- `saveManager()` — add `run: manager.run` and `combat: manager.combat` to the save object
- `getManager()` — restore `run` and `combat` on load, with null defaults for old saves missing these fields
- Filter ephemeral fields before writing (animation hints, client-only UI state)
- Every `req.saveGame()` already calls `saveManager()`, so combat state is written after each turn automatically
- Save file grows slightly but remains a single JSON blob per user. Clean for future Postgres migration.

### A3. Combat reload recovery

- **File:** `public/game.js` updateScene(), `public/js/ui/combat-loop.js`
- When `updateScene()` sees phase `combat` and the combat loop isn't running, call `startCombatLoop()` with `recovery: true`
- `startCombatLoop({ recovery: true })` — skip entrance animation, read existing combat state from `gameState.combat`, render current HP/enemies/moves immediately
- Re-entrancy guard (same pattern as npc_dialogue fix): module-level flag prevents double-start, one-shot recovery flag in game.js prevents retry loops

---

## Phase B: Resilience Layer

Infrastructure that makes the whole app behave well on spotty mobile connections.

### B1. Retry with exponential backoff in apiCall

- **File:** `public/js/api.js`
- GETs: auto-retry up to 2 times. Delays: 500ms, 1500ms.
- POSTs: no retry by default. New `retryable: true` option for idempotent POSTs.
- Backoff formula: `500 * 2^attempt` with +/-20% jitter to avoid thundering herd
- Mark these existing POSTs as retryable (server has idempotency guards): `/creature-combat-cycle`, `/combat-cycle`, `/proceed`, `/loadGameState`
- Remove the hardcoded retry loop in `startRun` (game.js:808-813) — gets retry for free now

### B2. Replace global isLoading gate

- **File:** `public/js/api.js`
- Current: single boolean `isLoading` blocks ALL concurrent requests. One slow request causes every subsequent call to return null silently.
- New: per-endpoint deduplication. Track in-flight requests by endpoint path in a `Set`. Block duplicate requests to the same endpoint, allow different endpoints concurrently.
- Keep `bypassLoadingGate` option for backward compat during transition, remove once all callers verified.

### B3. Offline detection banner

- **Files:** `public/js/api.js` (failure tracking), new `public/js/ui/connection-banner.js` (UI), `public/game.css` (styles)
- Track consecutive API failures in `apiCall`. After 2+ consecutive failures across any endpoints, show banner.
- Also listen to `navigator.onLine` events as a supplementary signal (but not the sole trigger).
- Banner text: "Connection lost, retrying..." in plain English. No game theme.
- Auto-dismiss on next successful API call. Text changes to "Reconnected" briefly before hiding.
- Positioned below the area header pill, above the scene area. Non-blocking, no overlay.
- CSS transition in/out, no jarring pop.

### B4. 401 auto-redirect to login

- **File:** `public/js/api.js`
- In `apiCall`, detect 401 status specifically before the generic error throw.
- On first 401: clear `localStorage.authToken`, redirect to login page.
- Show toast on login screen: "Session expired, please log in again"
- Guard against redirect loops: only redirect once per page load via module-level flag.

---

## Phase C: Full Mobile-Grade Resilience

PvP hardening and remaining edge cases.

### C1. PvP auto-reconnect via Socket.IO

- **File:** `public/js/pvp-socket.js`
- Enable Socket.IO built-in reconnection: `reconnection: true`, `reconnectionAttempts: 5`, `reconnectionDelay: 1000`, `reconnectionDelayMax: 10000`
- On Socket.IO `reconnect` event, automatically emit `pvp:reconnect` with stored matchCode
- Store active matchCode in `sessionStorage` so page reload can also rejoin
- Show "Reconnecting..." banner in PvP battle UI (same component as B3) while socket is disconnected

### C2. PvP forfeit-on-timeout

- **Files:** `src/pvp/socket-handler.js`, `public/js/ui/pvp-battle.js`
- Server: when 30s disconnect timer fires, award victory to the remaining player (currently just cleans up)
- Emit `pvp:match-forfeit` to the connected player with winner/loser data
- Client: show "Opponent forfeited" result screen, same layout as normal victory with different message

### C3. PvP move submission timeout

- **Files:** `src/pvp/match-manager.js`, `public/js/ui/pvp-battle.js`
- Server: 60-second timer per round once both players are in battle phase
- If a player doesn't submit moves within 60s, auto-forfeit that player
- Client: show countdown timer in move selection UI. Warning state at 15s remaining.
- Prevents indefinite stalling.

### C4. PvP match persistence

- **Files:** `src/pvp/match-manager.js`
- Persist active matches to disk after each round resolution: `.pvp-match-{matchCode}.json`
- On server startup, restore active matches from disk and allow reconnection
- Clean up match files when match ends normally (victory, forfeit, or timeout)
- Later migrates to Postgres alongside game save state.

### C5. Post-combat shop reload recovery

- **Files:** `src/routes/game/combat.js` or `src/game/loop.js`, `public/game.js`
- Wire up server state: when post-combat shop triggers, set `run.postCombatShop = { active: true, offers: [...] }` before sending response
- Add handler in `updateScene()` that re-renders shop from server state on reload
- Same pattern as combat and npc_dialogue recovery: re-entrancy guard + one-shot flag

---

## Testing Strategy

- **Phase A:** Unit tests for save/restore with run+combat fields. Integration test for combat reload (start combat, simulate reload by re-calling updateScene).
- **Phase B:** Unit tests for retry logic (mock fetch, verify attempt count and timing). Test isLoading replacement doesn't break concurrent request behavior. Manual test on throttled connection (Chrome DevTools network throttling).
- **Phase C:** Integration tests for PvP disconnect/reconnect flow. Test forfeit timer fires correctly. Test match persistence survives simulated server restart.

## Migration Notes

- Phase A changes the save file format (adds `run` and `combat` fields). Old saves without these fields load with null defaults. No version bump needed, just null-safe loading.
- Phase B changes `apiCall` behavior. All existing callers that check for null returns continue to work. The retry layer is transparent.
- Phase C changes PvP socket config. Existing clients that don't support reconnection will still work (reconnection is client-initiated).
