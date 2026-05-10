# Production Bug Triage - 2026-05-10

Pulled from production Railway bug reports on 2026-05-10 for the user-requested 10-hour window only.

- Window start: `2026-05-09T19:04:00.000Z` (`2026-05-10 04:04 JST`)
- Window end: request time `2026-05-10T05:04:00.000Z` (`2026-05-10 14:04 JST`)
- Production source: `https://jrpg-production.up.railway.app/api/bug-reports`
- Reports in source index: 50
- Reports in this window: 7
- Device pattern: all reports came from iPhone Safari WebKit, viewport `402x874`, DPR `3`, tester `Hacker`, user `u_6c89d305104abe04`
- Screenshot links below were checked and returned `200 image/png`.

## Issue 1: Combat can become stuck after player's creature is defeated

Priority: Critical

Source report:
- `report-2026-05-10-01-37-43-1778377065173`
- Timestamp: `2026-05-10T01:37:45.173Z`
- Screen: `combat`
- Screenshot: https://jrpg-production.up.railway.app/api/bug-reports/report-2026-05-10-01-37-43-1778377065173/screenshot
- Metadata: https://jrpg-production.up.railway.app/api/bug-reports/report-2026-05-10-01-37-43-1778377065173

Reporter note:
> After my own creature was defeated, I could not do anything in game anymore. I suspect related to our new turn based combat cursor

Captured state:
- `gameState.phase`: `combat`
- `gameState.combat.turn`: `player`
- `gameState.combat.enemyCount`: `3`
- `gameState.partySize`: `0`
- Player HP: `100/100`

Relevant action trail:
- The player cycled through several encounters and campfires.
- Last transition before the report: `room` -> `room_encounter` -> `combat` at `2026-05-10T01:36:18Z`.
- No console errors were captured.

Notes for investigation:
- The stuck state is suspicious because the report shows `partySize: 0` while the phase remains `combat` and the turn remains `player`.
- Check whether the action cursor expects at least one available allied combatant and fails to produce actions when the party is empty or KO'd.
- Areas to inspect first: creature KO handling, combat end conditions, and action cursor action generation for `partySize === 0` or no usable allied creature.
- This may overlap with recent turn-based combat cursor changes.

## Issue 2: Learn lesson endpoint unavailable while translate works

Priority: High

Source reports:
- `report-2026-05-10-01-31-54-1778376716563`
  - Timestamp: `2026-05-10T01:31:56.563Z`
  - Screen: `combat`
  - Screenshot: https://jrpg-production.up.railway.app/api/bug-reports/report-2026-05-10-01-31-54-1778376716563/screenshot
  - Metadata: https://jrpg-production.up.railway.app/api/bug-reports/report-2026-05-10-01-31-54-1778376716563
- `report-2026-05-10-01-26-31-1778376393702`
  - Timestamp: `2026-05-10T01:26:33.702Z`
  - Screen: `friendlyNpc`
  - Screenshot: https://jrpg-production.up.railway.app/api/bug-reports/report-2026-05-10-01-26-31-1778376393702/screenshot
  - Metadata: https://jrpg-production.up.railway.app/api/bug-reports/report-2026-05-10-01-26-31-1778376393702
- Also captured in `report-2026-05-10-01-37-43-1778377065173` as repeated network failures.

Reporter notes:
> Translate worked learn lesson did not

> Translate works, learn lesson says unavailable

Captured failures:
- `POST https://jrpg-production.up.railway.app/api/dialogue/learn`
- HTTP status: `503`
- Body: `{"ok":false,"error":"learn_lesson_unavailable"}`
- Captured timestamps include:
  - `2026-05-10T01:25:56.197Z`
  - `2026-05-10T01:25:59.707Z`
  - `2026-05-10T01:31:25.900Z`
  - `2026-05-10T01:33:37.791Z`
  - `2026-05-10T01:33:56.451Z`
  - `2026-05-10T01:36:33.099Z`

Captured state examples:
- Friendly NPC report: `gameState.phase` was `friendlyNpc`, but `gameState.combat` still contained `{ "turn": "player", "enemyCount": 1 }`.
- Combat report: `gameState.phase` was `combat`, `enemyCount: 3`.

Notes for investigation:
- Translate succeeding while learn lesson returns `503` suggests this is not a general AI/provider outage.
- Production has `DIALOGUE_LEARN_PROVIDER`, `DIALOGUE_LEARN_API_KEY`, and `DIALOGUE_LEARN_MODEL` set to match the working translation values, so missing Railway config is unlikely.
- The next likely failure points are learn-specific: model output parse failure, strict schema validation failure, or provider/model generation failure on the larger lesson JSON payload.
- Diagnostic patch on `feature/prod-bug-triage-20260510` now returns and displays specific codes:
  - `learn_lesson_invalid_request / missing_text`
  - `learn_lesson_invalid_request / missing_tokens`
  - `learn_lesson_config_missing / missing_config_or_chat`
  - `learn_lesson_parse_failed / invalid_json`
  - `learn_lesson_validation_failed / <validator_reason>`
  - `learn_lesson_generation_failed / provider_error`
- After this patch reaches production, re-test Learn and capture the popup line or bug report `networkErrors.bodyPreview`, which should include the exact `error` and `reason`.

## Issue 3: Friendly NPC did not greet and shop could not be used

Priority: High

Source report:
- `report-2026-05-10-01-28-31-1778376513458`
- Timestamp: `2026-05-10T01:28:33.458Z`
- Screen: `friendlyNpc`
- Screenshot: https://jrpg-production.up.railway.app/api/bug-reports/report-2026-05-10-01-28-31-1778376513458/screenshot
- Metadata: https://jrpg-production.up.railway.app/api/bug-reports/report-2026-05-10-01-28-31-1778376513458

Reporter note:
> Npc did not greet me and then I could not buy anything from the shop

Captured failures:
- Console errors:
  - `[API] Request failed: {"endpoint":"/friendly-npc-choose","error":"No offers generated yet"}`
- Network errors:
  - `POST https://jrpg-production.up.railway.app/api/game/friendly-npc-choose`
  - HTTP status: `400`
  - Body: `{"error":"No offers generated yet"}`
- Server errors:
  - Route: `/api/game/friendly-npc-choose`
  - Method: `POST`
  - Message: `No offers generated yet`

Relevant timestamps:
- First friendly NPC phase began at `2026-05-10T01:25:34.588Z`.
- A later friendly NPC phase began at `2026-05-10T01:27:43.616Z`.
- `/friendly-npc-choose` failed at `2026-05-10T01:27:53Z` and `2026-05-10T01:27:57Z`.

Notes for investigation:
- The route is being called before offers exist, or offer generation is failing silently before the shop action is shown.
- The missing greeting and missing offers are likely the same flow break: friendly NPC UI is allowing choose/buy before the greeting/offer generation step completes.
- This server error also appears in later reports, so it may be sticky in session telemetry after the first failure.

## Issue 4: Friendly NPC dialogue overflows instead of wrapping

Priority: Medium

Source report:
- `report-2026-05-10-01-29-25-1778376567295`
- Timestamp: `2026-05-10T01:29:27.295Z`
- Screen: `friendlyNpc`
- Screenshot: https://jrpg-production.up.railway.app/api/bug-reports/report-2026-05-10-01-29-25-1778376567295/screenshot
- Metadata: https://jrpg-production.up.railway.app/api/bug-reports/report-2026-05-10-01-29-25-1778376567295

Reporter note:
> Dialogue is going beyond boundaries instead of wrapping properly

Captured state:
- `gameState.phase`: `friendlyNpc`
- `partySize`: `0`
- No console or network errors captured directly in this report.
- Server telemetry still included previous `/api/game/friendly-npc-choose` errors from the same session.

Notes for investigation:
- This sounds like CSS/layout rather than backend behavior.
- Check friendly NPC dialogue rendering, especially long Japanese text, ruby annotations, translated text, and any `white-space`, `overflow-wrap`, `word-break`, `min-width`, or flex child sizing rules.
- Because this is visual, verify any fix with mobile screenshot evidence before calling it fixed.

## Issue 5: Campfire cooking should only be offered when a recipe is cookable

Priority: Medium

Type: Feature request / UX bug

Source report:
- `report-2026-05-10-01-30-26-1778376628278`
- Timestamp: `2026-05-10T01:30:28.278Z`
- Screen: `campfire`
- Screenshot: https://jrpg-production.up.railway.app/api/bug-reports/report-2026-05-10-01-30-26-1778376628278/screenshot
- Metadata: https://jrpg-production.up.railway.app/api/bug-reports/report-2026-05-10-01-30-26-1778376628278

Reporter note:
> Feature request - user should only be offered cooking if the user can cook a recipe with their existing ingredients

Captured state:
- `gameState.phase`: `campfire`
- `combat`: `null`
- `partySize`: `0`
- No network errors.
- Server telemetry still included previous `/api/game/friendly-npc-choose` errors from the same session.

Notes for investigation:
- Campfire action generation should likely check inventory against recipe requirements before rendering/enabling cooking.
- Decide whether the preferred behavior is to hide cooking entirely, show it disabled with explanation, or route to a "no recipes available" state. The report asks for "only be offered cooking" when at least one recipe can be cooked.

## Issue 6: Top HUD shows "Cid headed up top" and crystal counter is misplaced

Priority: Medium

Source report:
- `report-2026-05-10-01-25-19-1778376322358`
- Timestamp: `2026-05-10T01:25:22.358Z`
- Screen: `skillMaster`
- Screenshot: https://jrpg-production.up.railway.app/api/bug-reports/report-2026-05-10-01-25-19-1778376322358/screenshot
- Metadata: https://jrpg-production.up.railway.app/api/bug-reports/report-2026-05-10-01-25-19-1778376322358

Reporter note:
> Cid headed up top should not display and then the crystal count should go to the left, so it sits just to the right of the room counter

Captured state:
- `gameState.phase`: `skillMaster`
- `combat`: `null`
- `partySize`: `0`
- No console, network, or server errors.

Notes for investigation:
- Likely a top HUD rendering/layout issue on the `skillMaster` screen.
- Remove or conditionally hide the "Cid headed up top" copy.
- Move the crystal count left so it sits immediately to the right of the room counter.
- Because this is visual, verify with mobile screenshot evidence.

## Raw Reports In Window

1. `report-2026-05-10-01-37-43-1778377065173` - combat stuck after own creature defeated - `2026-05-10T01:37:45.173Z`
2. `report-2026-05-10-01-31-54-1778376716563` - learn lesson unavailable in combat - `2026-05-10T01:31:56.563Z`
3. `report-2026-05-10-01-30-26-1778376628278` - only offer cooking when recipe is cookable - `2026-05-10T01:30:28.278Z`
4. `report-2026-05-10-01-29-25-1778376567295` - dialogue overflow in friendly NPC - `2026-05-10T01:29:27.295Z`
5. `report-2026-05-10-01-28-31-1778376513458` - NPC did not greet / shop unavailable - `2026-05-10T01:28:33.458Z`
6. `report-2026-05-10-01-26-31-1778376393702` - learn lesson unavailable in friendly NPC - `2026-05-10T01:26:33.702Z`
7. `report-2026-05-10-01-25-19-1778376322358` - top HUD text and crystal counter layout - `2026-05-10T01:25:22.358Z`

## Suggested Fix Order

1. Combat stuck after creature defeat, because it can block all play.
2. Learn lesson `503`, because it affects the language-learning loop and repeats across screens.
3. Friendly NPC greeting/shop offer generation, because it has concrete server and client errors.
4. Friendly NPC dialogue wrapping, because it is a visible mobile layout issue.
5. Campfire cooking offer gating.
6. Top HUD copy/layout on skill master.
