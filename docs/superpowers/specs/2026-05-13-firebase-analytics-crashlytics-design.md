# Firebase Analytics & Crashlytics MVP

**Date:** 2026-05-13
**Branch:** feature/firebase-analytics-crashlytics
**Status:** Draft for user review

## Problem

Koto has no durable product analytics. The current diagnostics and bug report flow captures useful context only when a tester submits a report, but it does not answer basic product questions:

- How many users return on D1/D7?
- Where do new users drop out of onboarding?
- How far do users get in their first run?
- Which phase or room was active before a crash or serious client error?

The app is shipped through Capacitor, but the native shell loads the Railway web URL. Gameplay instrumentation must therefore live in the web app, while native Firebase integrations should be used only where the Capacitor bridge gives better platform support.

## Approved Decisions

- **Scope:** Funnel MVP only. Do not add gameplay-balance telemetry yet.
- **Identity:** Account-linked but pseudonymous. Firebase must never receive usernames, email addresses, raw internal user IDs, Japanese text, dialogue, vocabulary payloads, screenshots, or notes.
- **Consent model:** Default on, disclosed in the privacy policy and any settings/about copy that mentions data collection. Do not add a settings toggle in the MVP.
- **Reporting:** Firebase console only for the MVP. No BigQuery export in the first pass.
- **Integration shape:** A thin analytics facade in the web app owns event names, payload filtering, user identity, and provider selection.
- **Environment gate:** Analytics is enabled only when the Firebase config and `VITE_FIREBASE_ANALYTICS_ENABLED=true` are present. The user will configure those variables only on production Railway.
- **Rollout behavior:** Existing users start receiving analytics identity and current user properties the next time they authenticate or load the app. Do not backfill historical first-run events.

## Goals

1. Enable standard Firebase/GA4 metrics for active users, retention, sessions, first opens, and basic funnel conversion.
2. Track a small set of new-user milestones from authentication through first combat and first run end.
3. Attach crash/non-fatal reports to a pseudonymous user and current game context.
4. Keep analytics calls out of feature modules except through a small local API.
5. Preserve existing bug reports and diagnostics as the richer manual triage path.

## Non-Goals

- No balance telemetry such as card swipes, reward picks, damage distributions, move usage, creature choice rates, or room-type performance.
- No BigQuery export, custom dashboards, or server-side event warehouse.
- No raw username linkage in Firebase.
- No analytics settings toggle in the MVP beyond accurate privacy disclosure.
- No generated screenshots, bug report notes, dialogue text, Japanese content, or vocab lists in Firebase.
- No inferred/backfilled historical milestones for existing users.

## Architecture

Add a small `public/js/analytics.js` facade. Gameplay code calls semantic helpers such as:

```js
analytics.trackMilestone('first_combat_started', context);
analytics.setAnalyticsUser({ analyticsId, accountAgeDays });
analytics.setCrashContext(gameState);
analytics.recordNonFatal(error, context);
```

The facade chooses the transport at runtime:

- **Capacitor native:** prefer `@capacitor-firebase/analytics` for analytics events when the bridge is available. This records gameplay funnel events in the native app stream even though the UI is served from Railway.
- **Regular browser/PWA:** use the Firebase Web SDK analytics transport.
- **Crashlytics:** use `@capacitor-firebase/crashlytics` only on native platforms. Browser JS errors continue to rely on the existing diagnostics and bug-report system.
- **Tests/dev without Firebase config:** no-op transport with debug logging disabled by default.

This keeps Firebase-specific imports and failure handling out of `public/game.js`, `public/js/diagnostics.js`, and UI modules.

## Identity

The backend should expose a stable `analyticsId` for the authenticated user. It should be generated server-side using an HMAC or equivalent one-way mapping:

```text
analyticsId = hmacSha256(ANALYTICS_ID_SECRET, user.id)
```

The client sets this as the Firebase Analytics user ID and Crashlytics user ID. The raw `user.id` and `username` stay in Koto's own server-side systems only.

Auth responses should include `analyticsId` in the user object returned by:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

If `ANALYTICS_ID_SECRET` is missing, the server should fail closed for production analytics identity by returning no `analyticsId` and logging a server warning. Local development can still run with analytics disabled.

## Funnel Events

Use explicit event names for Firebase-console-friendly funnels. Event names stay lowercase snake case and under Firebase's limits. Params must be primitive, short, and non-content-bearing.

### Authentication

- `koto_login`
  - `method`: `password`
- `koto_sign_up`
  - `method`: `password`

### Onboarding

- `koto_player_created`
- `koto_prologue_started`
- `koto_prologue_completed`

### First Run Funnel

- `koto_first_run_started`
- `koto_area_selected`
  - `area_id`
- `koto_party_confirmed`
  - `party_size`
- `koto_first_room_seen`
  - `area_id`
  - `room_number`
- `koto_first_combat_started`
  - `area_id`
  - `room_number`
  - `is_boss`
- `koto_first_combat_ended`
  - `outcome`: `victory` | `defeat` | `befriend` | `unknown`
  - `turn_count`
- `koto_first_run_ended`
  - `outcome`: `victory` | `defeat` | `forfeit` | `unknown`
  - `area_id`
  - `rooms_reached`
  - `duration_sec`

### Progress User Properties

Keep user properties sparse:

- `koto_platform`: `native` | `web`
- `koto_furthest_step`: highest milestone reached, e.g. `first_combat_started`
- `koto_tutorial_step`: numeric tutorial step as a string
- `koto_highest_area`: highest unlocked area number as a string

The facade should update `koto_furthest_step` monotonically, backed by local storage so reloads do not regress the value.

## Event Dedupe

Milestone events should be idempotent per account on the current device. Store a local milestone set under a key derived from the pseudonymous `analyticsId`:

```text
koto_analytics_milestones:<analyticsId>
```

This prevents duplicate `first_*` events across reloads. Firebase funnels count users, so cross-device duplicates are acceptable for the MVP.

## Instrumentation Points

Use existing central points rather than scattering calls:

- `public/js/ui/auth.js`: log `koto_login` / `koto_sign_up` after successful auth and pass `analyticsId` to the facade.
- `public/game.js`: initialize analytics after auth and Firebase config are available.
- `public/game.js#createCharacter`: log player creation and prologue start/completion.
- `public/game.js#startNewRun`: log first run start.
- Area/party flow in `public/game.js` and `public/js/ui/exploration.js`: log area selected, party confirmed, first room seen.
- `public/js/diagnostics.js`: reuse phase-change subscription to set crash context and detect first combat entry.
- `public/js/ui/combat-loop.js`: log first combat end when the server returns combat-ended results.
- `src/game/loop.js#forfeitRun` or the client return-to-hub path: log first run end from the resulting run summary/context.

If a hook is ambiguous, prefer under-reporting to logging noisy or duplicate events.

## Crashlytics

Native Crashlytics should capture:

- Automatic native crashes from the Capacitor shell.
- Non-fatal JS errors forwarded from `window.onerror`, `unhandledrejection`, and existing diagnostics capture when running in Capacitor.
- Crash keys updated from sanitized game state:
  - `phase`
  - `area_id`
  - `room_number`
  - `tutorial_step`
  - `run_number`
  - `platform`

Crash logs may include short event breadcrumbs such as `phase:combat` or `milestone:first_combat_started`. They must not include dialogue, Japanese text, usernames, screenshots, API response bodies, or bug report notes.

## Configuration

Add Firebase config through environment variables. Firebase web config is public by design, but it should still be environment-specific:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_FIREBASE_MEASUREMENT_ID`
- `VITE_FIREBASE_ANALYTICS_ENABLED`

Server-side:

- `ANALYTICS_ID_SECRET`

Only production Railway should receive the Firebase env vars and `VITE_FIREBASE_ANALYTICS_ENABLED=true`. Local dev, dev Railway, previews, and tests should leave the analytics env vars absent or set `VITE_FIREBASE_ANALYTICS_ENABLED=false`, causing the facade to no-op. Do not add a hostname allowlist in the MVP unless env-only gating proves insufficient.

Native app setup:

- Add the Firebase iOS app for bundle ID `com.koto.app`.
- Add the Firebase Android app for package ID `com.koto.app`.
- Add `GoogleService-Info.plist` and `google-services.json` to the native projects.
- Install the Capacitor Firebase Analytics and Crashlytics plugins, then run Capacitor sync.

Do not add native Firebase service files in the MVP unless the user provides them and explicitly approves committing them. The web Firebase config can be supplied through Railway/Vite environment variables.

## Privacy Policy Update

Update `public/privacy.html` to disclose:

- Koto collects pseudonymous analytics events for app usage, retention, onboarding progress, and crash diagnostics.
- Koto uses Firebase/Google Analytics and Crashlytics as service providers.
- Koto does not send usernames, dialogue text, vocabulary content, screenshots, or bug report notes to Firebase.
- Account deletion removes Koto-owned account/progress data; pseudonymous Firebase analytics data follows Firebase/Google retention and deletion processes.

## Testing

Unit tests:

- Analytics facade no-ops without config.
- Event payload sanitizer drops disallowed keys and non-primitive values.
- Milestone dedupe logs each first milestone once per local analytics ID.
- Pseudonymous analytics ID helper is deterministic and does not expose username/raw user ID.

Integration/manual checks:

- Login/register responses include `analyticsId`.
- Browser dev run does not throw when Firebase env vars are absent.
- Native platform path does not throw if the Firebase plugin import fails.
- Firebase DebugView shows the MVP events in a local/dev Firebase project.
- Crashlytics receives a forced non-fatal JS error from a native dev build.

No visual verification is required unless the privacy/settings copy changes visible UI beyond `privacy.html`.

## Risks

- Firebase console funnels are less flexible than BigQuery for custom queries. This is acceptable for the MVP.
- Remote-url Capacitor apps depend on the native bridge being available to the Railway-served bundle. The facade must gracefully fall back if native plugins are unavailable.
- App Store privacy disclosures may need updates for analytics and crash diagnostics before release.
- Historical Firebase analytics deletion is not the same as Koto account deletion. The privacy policy must avoid overpromising.

## Acceptance Criteria

- A new account can log in, receive a pseudonymous `analyticsId`, and never send username to Firebase.
- Firebase records the approved funnel events for first-run progression.
- Firebase/GA4 retention and active-user reports work from standard console data.
- Native Crashlytics records shell crashes and JS non-fatals with sanitized context keys.
- Existing bug report diagnostics continue working unchanged.
