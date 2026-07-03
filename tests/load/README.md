# Kanji Kombat Load Harness

Drives real bots through the KK API. Not part of `npm test` (`tests/load/**`
is not in any test-suite glob — see `package.json`).

Bots self-register as `kkbot_*` throwaway users via `/api/auth/register`
(`aiDataSharingConsent: true`, no invite code required) and authenticate with
a JWT Bearer token. Every bot creates a player, starts a Kanji Kombat run with
the default starter creature (`hi`), and completes onboarding if the account
is fresh.

- **Regular bots** play live: one HTTP round-trip per action via the legacy
  `/intro`, `/answer`, `/completion-choice` routes, jittered 2-4s between
  actions — 85% correct answers, matching a real player's error rate.
- **Subway bots** simulate offline play: they mirror seeds/hashes locally
  (same recipe as `tests/integration/flows/kanji-kombat-sync.test.js`) to
  build up to 50 quiz entries without any network calls, sleep 5-15s
  ("underground"), then dump the whole batch through one `/sync` POST.

## Usage

    node tests/load/kk-load.mjs --url <base-url> --bots <n> --minutes <n> --subway <n> --ramp-seconds <n>

| Flag            | Default              | Meaning                                  |
|-----------------|----------------------|-------------------------------------------|
| `--url`         | `http://localhost:3000` | Target server base URL                 |
| `--bots`        | `10`                 | Total concurrent bots                    |
| `--minutes`     | `2`                  | Test duration                            |
| `--subway`      | `max(1, bots/10)`    | How many of `--bots` run the subway mode |
| `--ramp-seconds` | `0`                 | Spread bot registrations uniformly over N seconds; 0 = fixed 150ms stagger |

## Smoke (local)

    npm run dev   # or: node server.js
    node tests/load/kk-load.mjs --url http://localhost:3000 --bots 10 --minutes 2 --subway 2

## Launch gate (dev environment)

    node tests/load/kk-load.mjs --url https://jrpg-dev.up.railway.app --bots 100 --minutes 30 --subway 10 --ramp-seconds 300

Registrations include bcrypt hashing, so an instant 100-bot stampede saturates small instances and poisons setup-endpoint percentiles — ramp to measure steady-state honestly.

### Pass criteria

- **p95 latency < 300ms** on every endpoint in the summary table
- **error rate ≤ 1%** (harness exits non-zero above this threshold)
- **zero PROCESS restarts** of the Node server during the run — check Railway deploy logs; this is distinct from the harness's `runRestarts` counter (in-game bot run restarts, expected and benign)
- **memory plateaus** over the run with no monotonic growth — check Railway metrics
- **subway `/sync` batch requests p95 < 2s**

## Output

Per-endpoint p50/p95/p99 latency and request count, plus a summary line:

    requests=<n> errors=<n> (5xx=<n> network=<n>) rate=<pct>% runRestarts=<n>

- **errors** counts only 5xx responses and network failures (connection
  refused, timeout). A `'corrected'` `/sync` response, a 400 from a stale
  prompt ref, or a 400 from the known cursor bug (below) are normal client
  flows, not errors — a real client resyncs and keeps playing.
- **runRestarts** counts in-game bot run restarts (fresh attempts): legitimate
  in-run defeat, the daily-content-exhausted state, and the known pre-existing
  KO-cursor bug below — expected and benign. This is separate from server
  PROCESS restarts (Node crashes on Railway), which are tracked in Railway logs.

Exit code is non-zero if `errors / requests > 0.01` (1%).

## Known pre-existing bug bots route around, not fix

`resolveKanjiKombatCursorAction` (`src/game/services/combat-cycle-service.js`)
can compute a stale `actionCursor` after a KO-swap splices a dead ally out of
`combat.allies` — reachable once a streak-12 ally-join has grown the party
past one creature and a later KO removes an ally other than the one at the
highest surviving index. It surfaces as a `/sync` `'corrected'` response
(`reason: 'transcript_mismatch'` or a raw JS-error-shaped reason) or a 400
from the legacy `/answer`/`/intro`/`/completion-choice` routes' own cursor
validation. Both reference integration tests on this branch
(`kanji-kombat-sync-batch-perf.test.js`) hit and document the same bug. Bots
detect it and restart the run, exactly like a real client would — counted in
`runRestarts`, never in `errors`.

## Reconciliations made against the original task brief

The brief's starting-point code assumed some request/response shapes that
drifted from the real API. Fixed here, all verified against
`src/routes/game/kanji-kombat.js` and the two reference integration tests:

1. **`POST /start` always returns HTTP 200`, even when onboarding is
   pending** — it never 400s to signal "please onboard first." The pending
   state is `state.run.kanjiKombat.onboardingPending === true` inside the
   200 body. There is no `/availability` `starterIds` field; the starter
   creature comes from `gm.meta.creatureCollection`, which defaults to
   `['hi', 'mizu', 'ki']` for a fresh registration — `hi` is always usable.
2. **A player must exist before `/kanji-kombat/start`** — `POST
   /api/game/create-player` is called during bot registration, matching both
   reference tests' bootstrap helper.
3. **Legacy `/intro`, `/answer`, `/completion-choice` want flat top-level
   `promptId`/`sequence`/`cardId` fields, not a nested `promptRef` object.**
   `promptRefFromBody` (in the route file) only reads a nested `promptRef`
   from `body.payload.promptRef` (the optimistic-envelope shape) or flat
   fields directly on the body — a top-level `promptRef: {...}` key matches
   neither and is silently dropped.
4. **Local hash mirroring must thread `resolved.nextCombat` forward between
   entries.** `resolveKanjiKombatAnswerTurn` clones its input by default and
   does not mutate it, so chaining calls against the same initial `combat`
   object (as the brief's code did) predicts every entry past the first
   against stale HP/cursor state — guaranteed `transcript_mismatch` on entry
   2+. Fixed by using each call's `resolved.nextCombat` as the next
   iteration's `combat` input.
5. **Sync entries need `actionId`** (via `createActionId()` from
   `src/shared/action-protocol.js`) so the server's action ledger can dedupe
   them — the brief's entries omitted this field entirely.
6. **A locally-mirrored batch must stop building entries once its own
   prediction shows a party wipe** (`resolved.transcript.allAlliesDefeated`).
   The starter creature has no reserves, so a wipe ends the run through a
   different code path (`combatCycleService.resolveKanjiKombatCursorAction`)
   than the shared resolver simulates — continuing to predict further local
   entries after a wipe is certain to diverge from the server.
7. **A `'corrected'` sync response (or defeat) can leave a stale quiz/intro
   head in the returned state even though the run has already ended.**
   Submitting against it would 400 forever without making progress; bots
   check `run.active`/`report.defeated` before acting on a head and restart
   proactively when the run has ended.
8. **`/kanji-kombat/start` genuinely 400s with `"Kanji Kombat is complete
   for the day"`** once a user exhausts the day's new-card and due-review
   content (`DAILY_NEW_LIMIT = 20`). This is a real game mechanic, not a
   bug — a long-running bot (especially one that restarts often) can hit it
   before the test deadline. Bots detect this and idle out the rest of the
   window instead of hammering `/start`, matching how a real client would
   show a "come back tomorrow" screen.
9. **A per-request 30s timeout** (`AbortSignal.timeout`) guards against a
   hung (not connection-refused) target leaving a bot's `fetch` pending
   forever, which would otherwise keep the harness alive past its deadline
   waiting on `Promise.all`.

## Cleanup

Bots' save/SRS files are small (~80KB each). Clean up the dev Railway volume
afterwards if desired.
