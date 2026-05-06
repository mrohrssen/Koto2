# Crystals Currency Design

## Goal

Add a persistent in-game currency called crystals to gate features that create real API costs.
Crystals persist between runs and are separate from run-local credits.

The first version has one earning source and three spending sinks:

- Daily login bonus: +100 crystals once per UTC day.
- Start run: 25 crystals.
- Translate dialogue text: 5 crystals.
- Learn mode from a dialogue card: 15 crystals.

Crystals are a server-authoritative resource. The client can show balances and costs, but all awards and spends must be enforced on the server.

## Data Model

Store crystals in persistent per-user meta-progression state, alongside fields such as `fusionCores` and `kanaMode`.

Add these fields to `meta`:

- `crystals`: current spendable balance. New accounts default to `0` before daily award processing.
- `lastCrystalLoginDate`: last UTC date string that received the daily login bonus, or `null`.
- `crystalCharges`: idempotency records for paid actions that should not double-charge on repeat taps.

Existing saves should be backfilled lazily during manager load:

- Missing or invalid `crystals` becomes `0`.
- Missing or invalid `lastCrystalLoginDate` becomes `null`.
- Missing or invalid `crystalCharges` becomes `{}`.

Expose `meta.crystals` in `GameManager.getState()` so the client can render the balance and gate UI affordances.

## Crystal Wallet Service

Add a small shared service, likely `src/game/services/crystal-wallet-service.js`, that centralizes crystal constants and mutations.

Constants:

- `DAILY_CRYSTAL_BONUS = 100`
- `START_RUN_CRYSTAL_COST = 25`
- `TRANSLATE_CRYSTAL_COST = 5`
- `LEARN_CRYSTAL_COST = 15`

Core responsibilities:

- Normalize and backfill crystal meta fields.
- Resolve the current UTC date as `YYYY-MM-DD`.
- Award the daily login bonus once per UTC day.
- Check whether a balance can cover a cost.
- Spend crystals for a reason.
- Spend crystals idempotently for repeatable paid actions.
- Prune old idempotency records so save files do not grow forever.

The first implementation can keep only the latest 100 `crystalCharges` entries. This is enough to protect repeat taps and short-term retries without introducing a full transaction ledger.

Async paid actions also need an in-flight guard. Translation and learn both call services that can take time, so two duplicate requests with the same idempotency key could otherwise pass the "not charged yet" check before either one records success. The server should keep a per-process in-flight map keyed by user ID, reason, and idempotency key. Duplicate requests should join the first request and return its result. The key is recorded in `meta.crystalCharges` only after the action succeeds and the crystal deduction happens; failed actions clear the in-flight entry without charging.

## Server Integration

Game routes already receive `req.gameManager` and `req.saveGame` from `/api/game` middleware. Crystal routes and `POST /api/game/start-run` should use those existing request helpers.

Dialogue routes are mounted under `/api/dialogue`, outside the game router middleware. To charge translation requests, the dialogue router needs access to the authenticated user's `GameManager` and save function, either by adding narrow middleware to that router or by injecting `getManager()` and `saveManager()` dependencies. The design should avoid duplicating wallet logic in dialogue routes; translation should call the same crystal wallet service as game routes.

## Daily Login Bonus

Daily bonus should be granted through an authenticated game endpoint, not by the auth token itself.

Add an endpoint such as:

```http
POST /api/game/crystals/daily-login
```

The endpoint:

1. Loads the authenticated user's `GameManager`.
2. Ensures crystal meta fields exist.
3. Compares `meta.lastCrystalLoginDate` to the server UTC date.
4. If different, adds 100 crystals, sets `lastCrystalLoginDate`, saves the game, and returns `awarded: true`.
5. If already claimed today, returns `awarded: false` without changing the balance.

Response shape:

```json
{
  "ok": true,
  "awarded": true,
  "amount": 100,
  "balance": 125,
  "today": "2026-05-06"
}
```

The client should call this endpoint after every successful authentication path:

- New account registration.
- Explicit username/password login.
- Saved-session app boot when `/api/auth/me` succeeds.

Registration should count as that day's login bonus so new players can immediately start playing.

## Spending Rules

All spending must be enforced server-side. Client gating is a UX improvement only.

### Start Run

`POST /api/game/start-run` spends 25 crystals before starting a run.

If the player has fewer than 25 crystals:

- Return an insufficient-crystals error.
- Do not call `gameManager.startRun()`.
- Do not replace, mutate, or create a run.

If the player can pay:

- Deduct 25 crystals.
- Start the run normally.
- Save the game.
- Return the updated game state with the new crystal balance.

Starting a run does not need the same per-encounter idempotency treatment as dialogue actions, because a successful run start has an obvious durable state transition.

### Translate Dialogue

`POST /api/dialogue/translate` costs 5 crystals only after a successful translation response.

The client must send an idempotency key that identifies the current dialogue page within the current encounter. Repeat taps for the same dialogue page/encounter key must not double-charge.

Suggested key inputs:

- Current run or encounter identifier when available.
- Current room identifier or NPC dialogue turn identifier when available.
- Dialogue page index.
- Exact source text.
- Stable entity-context signature, matching the translation cache behavior.

The server flow:

1. Validate the source text and entity context.
2. Check whether the idempotency key has already been charged.
3. If already charged, return the translation result without another crystal deduction.
4. If not charged, check that the player has at least 5 crystals.
5. Resolve the translation through the existing cache/AI service.
6. If translation succeeds, deduct 5 crystals, record the idempotency key, save the game, and return the translation plus updated balance.
7. If translation is unavailable, do not deduct crystals and do not record the idempotency key as charged.

This means cached translations still cost 5 crystals on first view in a given encounter/page, but repeat taps for the same encounter/page do not cost extra.

### Learn Mode

The dialogue card's `Learn` action costs 15 crystals. Assume the learning function itself exists or is being built separately.

The learn endpoint should use the same spend-after-success and idempotency pattern as translation:

1. Check whether the dialogue page/encounter idempotency key has already been charged for learn.
2. If already charged, return the compatible existing/success response without another deduction.
3. If not charged, require at least 15 crystals.
4. Run the learn action.
5. If learn succeeds, deduct 15 crystals, record the charge key, save the game, and return the updated balance.
6. If learn fails, do not charge.

Translation and learn should use distinct reason prefixes so the same dialogue page can be translated and learned once each without key collision.

## Client UX

Show the current crystal balance in persistent game UI, near the existing top/status area. The balance should update after daily awards and successful spends.

After authentication and state load, call the daily-login endpoint. If `awarded: true`, show a modal with:

- Daily login bonus headline.
- `+100` crystals.
- New balance.
- One dismiss button.

If `awarded: false`, update the local balance silently.

Paid buttons should show the cost inside the button on the left side, before the button label. Use a crystal icon plus number, for example:

```text
◆ 5  Translate
◆ 15 Learn
◆ 25 Start Run
```

The exact icon can be CSS or text, but it should read visually as part of the button, not as a separate label outside the button.

Button behavior:

- Start run: show 25-crystal cost. If the balance is too low, block the action with a friendly message such as "Come back tomorrow for more crystals."
- Translate: show 5-crystal cost before use. While the request is in flight, disable the button. After success for the current dialogue page, switch to a no-cost "View Translation" style for repeat taps in the same encounter/page.
- Learn: show 15-crystal cost before use. While the request is in flight, disable the button. After success for the current dialogue page, switch to a completed/no-cost state for repeat taps in the same encounter/page.

Client-side in-flight guards prevent accidental double-clicks, but server idempotency remains the source of truth.

## API Response Conventions

Insufficient crystals responses should be machine-readable so all clients can handle them consistently.

Suggested shape:

```json
{
  "ok": false,
  "error": "insufficient_crystals",
  "cost": 25,
  "balance": 10
}
```

Successful paid responses should include the updated balance:

```json
{
  "ok": true,
  "crystals": {
    "cost": 5,
    "charged": true,
    "balance": 95
  }
}
```

For repeat idempotent taps:

```json
{
  "ok": true,
  "crystals": {
    "cost": 5,
    "charged": false,
    "alreadyCharged": true,
    "balance": 95
  }
}
```

The response shape can be adapted to existing route conventions, but it must expose enough information for the UI to update the balance and distinguish "charged now" from "already paid for this encounter/page."

## Testing

Server tests should cover:

- New meta defaults include crystal fields.
- Old-save migration backfills crystal fields.
- Daily login awards 100 once per server UTC date.
- Registration, explicit login, and saved-session boot can all trigger the daily endpoint.
- Starting a run deducts 25 crystals.
- Starting a run with insufficient crystals fails without mutating the run.
- Translation deducts 5 only after success.
- Translation does not deduct on unavailable responses.
- Translation repeat taps with the same idempotency key do not double-charge.
- Learn deducts 15 only after success.
- Learn repeat taps with the same idempotency key do not double-charge.
- Old `crystalCharges` entries are pruned.

Client tests should cover:

- The daily bonus modal appears only when `awarded: true`.
- The displayed crystal balance updates after daily awards and spends.
- Paid action buttons render the crystal icon and number inside the button on the left side.
- Translate and Learn disable their buttons while requests are in flight.
- Repeat same-dialogue Translate and Learn actions do not issue duplicate in-flight requests.
- Insufficient-crystals responses show a friendly message and do not advance the flow.

## Non-Goals

This design does not add:

- Real-money crystal purchases.
- A full auditable transaction ledger.
- Streak bonuses.
- Alternative earning sources beyond daily login.
- Admin tools for adjusting balances.
- Changes to run-local credits.
