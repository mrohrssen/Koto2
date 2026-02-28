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
