# Test Suite Reset: Design Document

**Date:** 2026-02-28
**Status:** Approved
**Approach:** Reset & Rebuild (Approach B)

## Problem

The test suite is not trusted. Tests fail but code ships anyway, results vary by environment, and nobody knows if the tests cover what matters. There are 286 unit tests with 9 currently failing (94.4% pass rate), no CI/CD gating, no coverage measurement, and no mocking of external services (AI providers, JPDB API). The test culture needs a full reset.

## Design

### Three-Tier Test Architecture

#### Tier 1 — Unit (target: <30s, runs on every commit)

Pure logic with zero I/O. Everything external is mocked or stubbed.

**What belongs here:**
- Combat math (damage calc, XP curves, MP regen, status effects)
- Room generation logic (given deterministic random, expect specific rooms)
- Vocab filtering & i+1 constraint checking
- Item effect calculations
- Robot instantiation & leveling
- State factory outputs (createNewPlayer, createNewRun)

**What does NOT belong here:**
- Anything that touches the filesystem
- Anything that calls an API (JPDB, AI providers)
- Tests that assert implementation details ("this internal function was called 3 times")

#### Tier 2 — Integration (target: <2min, runs on every PR)

Real service interactions with mocked external boundaries (AI, JPDB API). Filesystem tests use proper temp dirs with guaranteed cleanup.

**What belongs here:**
- Narration pipeline: prompt assembly -> (mocked) AI call -> validation -> repair loop
- Vocab cache: write -> read -> invalidate round-trips (proper temp dirs)
- Auth flows: register -> login -> authenticated request (through real Express handlers)
- JPDB circuit breaker: mock fetch, verify rate-limiting behavior
- NPC dialogue: mock AI response -> i+1 validation -> repair if needed

#### Tier 3 — Smoke (on-demand, not a gate)

Real AI provider calls using recorded fixtures. Run manually or on a weekly cron. Failures are informational, not blocking.

**What belongs here:**
- "Does the narration engine produce parseable output with the real Claude/GPT API?"
- "Does JPDB batch parsing still work against the live API?"

### Test Infrastructure

#### Mock Factory: `tests/helpers/mocks.js`

Centralized mock creators for three external boundaries:

- `createMockAIProvider({ responses: [...] })` — returns canned AI responses, records calls for assertion
- `createMockJPDB({ vocabList: [...], parseResults: [...] })` — mock fetch for JPDB endpoints
- `createTestPlayer({ knownVocab: [...] })` — pre-built player state
- `createTestRun({ floor: 3, robots: [...] })` — pre-built run state
- `createTestCombatState({ playerHp: 100, enemyHp: 50 })` — pre-built combat state

#### Temp Directory Helper: `tests/helpers/tmp.js`

Replaces raw `/tmp/test-vocab-cache/` pattern that causes permission errors. Uses `node:fs/promises.mkdtemp()` with `afterEach` cleanup. No more cross-test contamination.

#### Test Data Constants: `tests/helpers/fixtures.js`

Single source of truth for test robot IDs, vocab words, NPC names. Eliminates hardcoded strings scattered across 39 files.

### Test Audit Triage

#### Keep (move to correct tier, minor fixes)
- Combat math, robot instantiation, item effects, auth crypto, room generation — pure functions that assert observable behavior.

#### Fix (refactor with proper mocks)
- Vocab cache tests (5 files) — use `createTestTmpDir()`, move to Tier 2
- JPDB circuit breaker — mock fetch, keep in Tier 2
- Narration engine tests (11 files) — mock AI boundary, test validation/repair, Tier 2
- Auth route tests — standardize with shared mock factory, Tier 2

#### Delete
- Tests asserting internal implementation details
- Tests for removed features (e.g. empty `pipeline-chip-effects.test.js`)
- Tests duplicating other tests' scenarios
- Broken tests where the fix is non-trivial and the tested code no longer exists

#### Audit rule: "If this test didn't exist and the code it tests broke, would a user notice?" If no, delete it.

### CI/CD Pipeline

#### GitHub Actions: `.github/workflows/test.yml`

```yaml
on: [push, pull_request]

jobs:
  tier1-unit:
    # npm install, npm run test:unit
    # Upload c8 coverage, fail if below floor

  tier2-integration:
    # npm install, npm run test:integration
    # Fail if any test fails

  tier3-smoke:
    # Weekly cron only
    # Informational, no gate
```

Tier 1 + Tier 2 must pass before merge. Tier 3 is informational only.

#### npm Scripts

```json
"test": "npm run test:unit && npm run test:integration",
"test:unit": "c8 node --experimental-test-module-mocks --test tests/unit/**/*.test.js",
"test:integration": "node --test tests/integration/**/*.test.js",
"test:smoke": "node --test tests/smoke/**/*.test.js",
"test:coverage": "c8 report --reporter=text --reporter=html"
```

Key changes: `npm test` runs Tier 1 + Tier 2. Unit glob uses `**/*.test.js` to support subdirectories. Legacy e2e scripts removed.

### Coverage Strategy

- **Tool:** `c8` (native V8 coverage, zero config for node:test)
- **Starting floor:** Whatever the codebase is at after the audit, rounded down to nearest 5%
- **Ratchet rule:** Floor only goes up. CI fails if coverage drops below floor.
- **No per-file thresholds** — just a global floor

### What We Don't Add

- No deployment gates (Railway deploys from master, separate decision)
- No Playwright in CI (playtesting stays manual)
- No required reviewers (test culture, not process bureaucracy)

### Directory Structure

```
tests/
  helpers/
    mocks.js              # AI provider, JPDB, fetch mock factories
    fixtures.js           # Test data constants
    tmp.js                # Isolated temp dir creation + cleanup
  unit/                   # Tier 1
    combat/               # damage, XP, status effects, MP, shields
    game/                 # room generation, state factories
    vocab/                # i+1 filtering, word state parsing
    robot/                # instantiation, leveling, collection
    item/                 # effects, shop rolls
  integration/            # Tier 2
    auth/                 # register -> login -> auth middleware
    narration/            # prompt -> mock AI -> validate -> repair
    vocab-cache/          # write -> read -> invalidate round-trips
    jpdb/                 # circuit breaker, batch parsing
  smoke/                  # Tier 3
    narration-live.test.js
```

### Conventions

- Files: `<thing-being-tested>.test.js`
- Test names: present-tense behavior — `it('applies poison damage at end of turn')`
- No `describe` nesting beyond 2 levels
- Framework: `node:test` (no migration)
- A short `tests/README.md` captures tier rules and mock conventions
