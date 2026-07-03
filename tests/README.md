# Test Conventions

## Three Tiers

| Tier | Dir | Speed | Runs on | Gates PRs? |
|------|-----|-------|---------|------------|
| 1 - Unit | `tests/unit/` | <30s | every commit | yes |
| 2 - Integration | `tests/integration/` | <2min | every PR | yes |
| 3 - Smoke | `tests/smoke/` | varies | on-demand | no |

## Rules

- **Mock all external boundaries** in Tier 1 and 2 (AI providers, JPDB API, network)
- **Use `createTestTmpDir()`** from `tests/helpers/tmp.js` for any file I/O — never raw `/tmp`
- **Use fixtures** from `tests/helpers/fixtures.js` for test data constants
- **Use mock factories** from `tests/helpers/mocks.js` for AI, JPDB, Express req/res
- **Test names:** present-tense behavior — `it('applies poison damage at end of turn')`
- **Max nesting:** `describe('module')` -> `it('does thing')`. One level of grouping max.

## Keep-or-delete rule

> If this test didn't exist and the code it tests broke, would a user notice?

If yes: keep. If no: delete.

## Commands

```bash
npm test              # Tier 1 + 2 (default)
npm run test:unit     # Tier 1 only (with coverage)
npm run test:integration  # Tier 2 only
npm run test:smoke    # Tier 3 (on-demand, not a gate)
npm run test:coverage # View coverage report
```

### Explore Subway Runway Smoke (full-session harness)

Full-area explore run through scripted 60–120s offline windows. Two tiers, both env-gated (skipped by default):

```bash
# Rooms tier — Stage 1 gate: travel + support rooms survive outages; fights wait for online windows
npm run seed:dev-user
EXPLORE_SUBWAY_SMOKE=1 npx playwright test tests/smoke/explore-subway-runway.test.js --config tests/smoke/playwright.subway.config.js

# Combat tier — Stage 2 gate: fights also proceed while offline (expected red until offline PvE combat lands)
EXPLORE_SUBWAY_SMOKE=1 EXPLORE_SUBWAY_COMBAT=1 npx playwright test tests/smoke/explore-subway-runway.test.js --config tests/smoke/playwright.subway.config.js
```

The subway config owns its own dev server on isolated ports (Vite 5199 / API 3099) — do not point it at a running 5173 server. Asserts: tap acknowledgment < 250ms, no forbidden copy, no blank action area, prepared rooms render offline, post-reconnect server state matches actions played, zero corrected syncs. Layouts are random; to force room types use the `debug-mode` + `debug-queue-rooms` endpoints (see the harness's `forceSpeedReviewLayout`). This harness is the explore-mode merge gate for the subway-stability arc (see `docs/superpowers/specs/2026-07-03-explore-subway-stability-design.md`).
