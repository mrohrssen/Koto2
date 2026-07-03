# Explore Subway — Baseline Findings (Task 1)

Baseline captured by the full-session explore subway harness
(`tests/smoke/explore-subway-runway.test.js`) run against **current `dev` code**
in the **rooms tier** (`EXPLORE_SUBWAY_SMOKE=1`). The harness is committed RED on
purpose: these failures are the deliverable and form Stage 1's work queue.

- **Harness config:** `tests/smoke/playwright.subway.config.js` (WebKit, iPhone
  393×852, isolated ports Vite 5199 / API 3099; the config's `webServer` owns the
  dev server — the harness uses relative URLs against `baseURL`).
- **Account:** `devtester` / `test1234`, reseeded (`npm run seed:dev-user`) before
  every run so it starts from the hub with `run: null`.
- **Runs performed:** 6 full rooms-tier runs during harness bring-up + baseline
  capture. Room layout is random each run (Starting Meadow `hajimari-no-hiroba`,
  10 rooms; the current room system exposes no API to force room types — see
  "Determinism" note), so different runs surface different distinct failures.
- **Command:**
  ```bash
  npm run seed:dev-user
  EXPLORE_SUBWAY_SMOKE=1 npx playwright test \
    tests/smoke/explore-subway-runway.test.js \
    --config tests/smoke/playwright.subway.config.js
  ```

## Distinct baseline failures (game bugs)

### ~~F1 — Support-room actions show the offline soft-pause while ONLINE~~  ✅ FIXED (Task 3)

> **Resolution (Task 3, 2026-07-04):** Two coupled root causes, both fixed.
> **(a) Root cause of the literal `noPreparedRoom` soft-pause:** the legacy
> `POST /api/game/proceed` did NOT rebuild `run.exploreRunway` after advancing.
> `proceedToNextRoom` bumps `currentRoom`/`roomActionSeq`, invalidating the cached
> runway; `getState()`'s sync snapshot (`exploreRunwaySnapshot`, loop.js:30) then
> returns `preparedRooms: []` by design (async rebuild deferred). The session
> client adopted that empty runway, so `recordRoomAction(...)` for the new room hit
> `noPreparedRoom` → `showExploreSoftPause` while ONLINE. Fixed by rebuilding the
> runway in the proceed route (`src/routes/game/run.js`,
> `refreshExploreRunwayAfterProceed`), epoch-preserving, mirroring `/api/game/state`.
> **(b) Coupled race (would have tripped `correctedSyncs === 0`):** support rooms
> are not `proceed`-capable in the runway, so `shrine.choose`/`friendlyNpc.choose`
> is queued in the session while the room auto-advances via the legacy proceed.
> The legacy proceed raced ahead of the still-pending choose, moving the server
> cursor past the room → the choose synced into a `room_index_mismatch` correction
> (reward lost). Fixed by draining the session before the legacy proceed
> (`public/js/ui/exploration.js`, `flushPendingSessionBeforeLegacyProceed`).
> **Tests:** `tests/integration/flows/exploration.test.js`
> ("proceed rebuilds the explore runway so the new room accepts session actions")
> and `tests/unit/ui/explore-session-cutover.test.js`
> ("drains pending session actions before a legacy proceed from a support room").

- **Assertion (verbatim):** `soft pause "Connection is spotty" shown while ONLINE`
- **State:** ONLINE (not offline). Reproduced at `phase: shrine` (room 0 / room 1)
  and `phase: friendlyNpc` (room 3) across separate runs — i.e. it is not tied to
  one room type.
- **Repro:** After the harness dismisses the support room's NPC dialogue and taps
  the first choice (shrine blessing / friendlyNpc offer), the narration box renders
  `Connection is spotty. Your progress will sync when you reconnect.` even though
  the network is up. Browser log immediately before the failure:
  `[NarrationBox] Final displayed text: Connection is spotty. Your progress will sync when you reconnect.`
- **Reproducibility:** HIGH. Occurred in 3 of 6 runs — every run whose early
  layout contained a shrine/friendlyNpc room. This is the dominant blocker: it
  fails the harness before it can exercise a full offline window.
- **Owning module (first guess):** `public/js/ui/exploration.js`
  (`chooseShrineReward` / `renderFriendlyNpc` / their
  `getExploreSession()?.recordRoomAction('shrine.choose' | 'friendlyNpc.choose', …)`
  paths → `showExploreSoftPause` on `!queued.accepted`) together with
  `public/js/ui/explore-session.js` (`recordRoomAction` rejects with
  `noPreparedRoom` / `currentRoomNotReady` / `actionNotAccepted`) and the runway
  builder `src/game/services/explore-runway-service.js` (whether support rooms are
  emitted into `preparedRooms[]` with the right `acceptedActions` / `offlineReady`
  after a combat victory advances the cursor). The pause firing while online means
  the session is rejecting a support action it should accept.
- **Judgment:** GAME BUG. The soft pause is offline-only UX; showing it during a
  normal online support-room interaction is exactly the Stage-1 rooms-hardening
  defect. The harness assertion is correct.

### F2 — Offline mid-combat: action area goes blank with no soft-pause copy

- **Assertion (verbatim):** `blank action area with no pause copy (offline=true, phase=undefined, roomType=null)`
  (from the earlier, non-transition-tolerant driver; the shipped harness now polls
  an 8 s grace window and reports `blank action area with no pause copy for >8s`).
- **State:** OFFLINE, mid-combat (encounter room, before the fight resolved).
- **Repro:** An offline window opened while combat was in flight. After a move was
  tapped, the split-attack-card / move grid cleared and combat could not advance
  because per-turn combat verification is a server round-trip (blocked offline),
  leaving `#action-area` empty with NO soft-pause narration. The player is left
  staring at a blank action area for the outage.
- **Reproducibility:** HIGH whenever an offline window overlapped combat. (Mitigated
  in the shipped harness by keying offline windows to room number so they overlap
  the room-to-room path, and by the rooms tier holding at combat while offline —
  but the underlying "blank, no pause" state is a real combat-offline gap.)
- **Owning module (first guess):** `public/js/ui/combat-loop.js` (combat cannot be
  predicted offline; when verification is unreachable the loop tears the action
  area down without surfacing the spotty-connection pause) and the combat/offline
  boundary. This is primarily **Stage 2** (offline PvE combat) territory; recorded
  here because the rooms-tier harness surfaces it when a window lands on combat.
- **Judgment:** GAME BUG (combat/offline). Offline, the client should show the
  soft pause (or a safe hold), never a blank action area.

### F3 — Post-combat victory → next-control handoff briefly blanks the action area

- **Assertion (verbatim, earlier driver):** `blank action area with no pause copy (offline=false, phase=room_encounter, roomType=encounter)` — fired immediately
  after `[CombatLoop] Combat ended: {victory: true}`.
- **State:** ONLINE, at the instant combat victory tears down the combat UI before
  the post-combat shop / proceed control renders.
- **Repro:** Won an encounter; `#action-area` was momentarily empty during the
  victory→shop/proceed transition.
- **Reproducibility:** MODERATE (a transient timing gap, ~<1 s).
- **Judgment:** BORDERLINE / HARNESS-SENSITIVITY. A brief empty action area during
  a legitimate transition is arguably acceptable UX. **The shipped harness now
  tolerates this**: the blank-area check polls an 8 s grace window for any
  actionable signal (control, pause, takeover, narration, dialogue) and only
  asserts on a *persistently* empty area. Kept in the record because if the
  post-combat handoff ever stalls for real, this is the assertion that will catch
  it.

### F4 — NPC battle reward with no skills soft-locks the room  ✅ FIXED (Task 3, NEW — not in original baseline)

> **Discovered (Task 3):** surfaced only after the F1 fix let a run reach an
> `npcBattle` room. When `rollSkillMasterOffers` returns empty (every party skill
> tree maxed / offer display resolves to none), `renderNpcBattleSkillSelection`
> rendered `NPC Battle Reward — No skills available.` with **no control to
> advance** — a soft lock (`npc_skill_selection` with `skillSelectionPending`, no
> proceed affordance). The player is stuck and the harness loops to
> `MAX_INTERACTIONS`. **Fix:** on empty offers, mark the reward resolved and
> auto-proceed (`proceedToNextRoom` does not gate npcBattle rooms), mirroring the
> "already completed → auto-proceed" path. `public/js/ui/exploration.js`,
> `renderNpcBattleSkillSelection`; test
> `tests/unit/ui/exploration-skill-master.test.js`
> ("auto-proceeds when the NPC battle reward has no skills to offer").
> Commit `1ed25b42`.

## Instrumentation / environment observations

### ~~O1 — `window.__gameState` test seam does not exist~~  ✅ ADDED (Task 3)

> **Resolution (Task 3, 2026-07-04):** Added the `window.__gameState` seam in
> `public/game.js` (set in `updateGameState` and at init), mirroring
> `window.__kkPhase`. This was not merely cosmetic: without it the harness's
> `gameState()` fell back to `GET /api/game/state`, which **rotates the explore
> session epoch** (`rotateExploreSessionEpoch`) out from under the client's live
> session — the client's next sync then carried a stale epoch and came back
> `corrected` (`session_epoch_mismatch`), tripping the rooms-tier `correctedSyncs
> === 0` invariant. With the seam the harness reads state in-page and no longer
> polls `/state` mid-run, so the epoch is not rotated under the live session.
> Commit `77d23149`.

- **Finding:** The brief and `CLAUDE.md` reference reading client state via
  `window.__gameState`, but nothing in `public/js/**` assigns it (only
  `window.__kkPhase`, `window.__inspector`, `window.__intentLog`, etc. exist).
- **Impact on harness:** State cannot be read in-page, and especially not while
  offline. The harness's `gameState()` helper tries `window.__gameState` first,
  then falls back to an authenticated `GET /api/game/state` — but that fetch is
  unreachable during an offline window. The shipped driver is therefore **DOM-first**:
  all offline decisions come from the DOM (`#action-area` buttons, `.move-cell`,
  `.split-attack-card`, `.ui-choice`, the `Connection is spotty` copy, `.takeover.active`).
- **Judgment:** GAME/INSTRUMENTATION GAP (not a harness bug). A future improvement
  (out of Task 1 scope) is to expose a `window.__gameState` (and/or
  `window.__explorePhase`) test seam so the harness can assert client state offline,
  mirroring Kanji Kombat's `window.__kkPhase` seam.

### O2 — Intermittent `500` on TTS / dialogue asset endpoints

- **Finding:** Browser logs show occasional `Failed to load resource: 500` and
  `[WordAudio] Failed to prefetch … TTS failed: 500` → `[WordAudio] Disabled -
  VOICEVOX unavailable`. VOICEVOX is not running in the harness environment.
- **Judgment:** ENVIRONMENT, not a subway bug. TTS being unavailable degrades
  gracefully. Noted so it is not mistaken for a stability defect during triage.

## Harness-vs-game judgments made during bring-up (driver bugs fixed)

These were **driver** defects found and fixed so the remaining failures are clean
game signals — recording them so Stage 1 does not chase ghosts:

1. **Wrong combat card selector.** The brief skeleton (and older docs) used the
   legacy `.dual-flash-card.attack` vocab card. Current creature combat uses
   `.move-cell` (tap to take a turn), a `.ui-choice` move-target picker under the
   `Choose target` heading, `⚔️ 戦う` to enter, and a `.split-attack-card` between
   turns. Fixed the combat driver to this flow.
2. **`.narration-box` always matched.** `#narration-box` is always in the DOM;
   only `.narration-box.visible` means a narration is showing. Using the bare class
   caused an infinite narration-dismiss loop. Fixed to `.narration-box.visible`.
3. **Move-target picker looped forever.** Tapping the first `#action-area` button
   during targeting hit the `Back` `.ui-btn` (cancels the move) → move→Back→move
   loop. Fixed to tap the first `.ui-choice` target card instead.
4. **SAC never advanced.** The split-attack-card continue listener is bound to
   `#action-area` and only fires on a tap inside the SAC (or on `#action-area` with
   the SAC as first child) — a `.scene-area` tap is ignored. Fixed to click the
   `.split-attack-card` itself.
5. **State read offline.** Reading phase via a server fetch returns `undefined`
   offline and mis-drove the loop; rewrote the driver to be DOM-first.
6. **Blank-area false positives on transitions / takeovers.** Added an 8 s grace
   poll before asserting blank, and a `.takeover.active` branch (a speed-review
   ROOM takeover whose close is locked until completion is reported as an explicitly
   unmodeled, out-of-scope minigame rather than a spurious blank-area failure).

## Determinism note (for Stage 1)

The current room system generates rooms as `randomRoom` placeholders resolved on
entry by `finalizeRandomRoom` → `pickRandomRoomType` (pure weighted RNG; it does
**not** consult the `queueTestRooms`/`popTestRoomType` seam, which only feeds the
legacy `generateSingleRoom` path). `selectArea`/`enterArea`'s `forceRoomType`
parameter is **ignored** by `enterArea`. Net effect: there is no clean API to force
a deterministic room layout in the live path, so the harness runs against random
rooms and different runs surface different distinct failures. If Stage 1 wants a
deterministic rooms-only fixture (no combat/minigames) to isolate the proceed/sync
invariant, it should add a test seam to `pickRandomRoomType` (e.g. honor
`popTestRoomType()` there, or a run-scoped forced-type field).

> **CORRECTION (Task 3b, 2026-07-04): do NOT add the `pickRandomRoomType` seam.**
> A deterministic probe proved layout forcing already works on the live path:
> `proceedToNextRoom` (`src/game/services/exploration-service.js:455-461`) pops
> `popTestRoomType()` and overrides the entered room, driven via the existing
> `debug-mode` + `debug-queue-rooms` endpoints. Adding the seam to
> `pickRandomRoomType` makes the runway prepare-ahead consume the same queue →
> double consumption scrambles layouts and the `:455` guard stomps the resolved
> room (two integration tests break). The harness forces layouts through the
> existing endpoints; see `.superpowers/sdd/task-3b-report.md` for the probe.

## Scope reachability

- **Rooms tier** (`EXPLORE_SUBWAY_SMOKE=1`): exercised; fails RED on F1 (dominant).
- **Combat tier** (`EXPLORE_SUBWAY_COMBAT=1`): the `COMBAT_TIER` branches (fight
  while offline instead of holding at the door) are wired and reachable; their
  assertions are expected to pass only after Stage 2 lands offline PvE combat.
