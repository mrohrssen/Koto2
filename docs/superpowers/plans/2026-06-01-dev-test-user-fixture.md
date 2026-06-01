# Dev Test User Fixture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-only `devtester` account that is automatically available in every feature worktree for testing beyond registration and tutorial gates.

**Architecture:** Create a focused seed module under `src/dev/` that writes normal auth and save files through existing helpers. Wire it into `server.js` behind a local-development guard, expose a manual npm script, and document it in the playtest guide.

**Tech Stack:** Node.js ES modules, bcrypt auth helpers, JSON save files, Node test runner.

---

### Task 1: Seeder Module

**Files:**
- Create: `src/dev/dev-test-user.js`
- Test: `tests/unit/dev/dev-test-user.test.js`

- [ ] Write failing tests for fixture creation, save shape, idempotency, and local-only auto-seed gating.
- [ ] Run `npm run test:unit -- tests/unit/dev/dev-test-user.test.js` or the equivalent `node --test` target and verify the new tests fail.
- [ ] Implement the seed module using `createUserRecord()`, `hashPassword`, `createMetaProgression()`, `createNewPlayer()`, and `dataPath()`.
- [ ] Re-run the focused unit test and verify it passes.

### Task 2: Dev Startup and Scripts

**Files:**
- Modify: `server.js`
- Modify: `package.json`

- [ ] Add `seedDevTestUserForLocalDev()` to `server.js` startup after environment loading.
- [ ] Add `seed:dev-user` to `package.json`.
- [ ] Run a syntax check for changed JavaScript files.

### Task 3: Documentation

**Files:**
- Modify: `docs/playtest-guide.md`

- [ ] Document `devtester` / `test1234` as the default local playtesting login.
- [ ] State that future agents should use this account unless testing registration, onboarding, or tutorial behavior.
- [ ] Document manual repair with `npm run seed:dev-user`.

### Task 4: Verification

**Files:**
- All changed files

- [ ] Run the focused unit test.
- [ ] Run syntax checks for touched JavaScript files.
- [ ] Run `npm run seed:dev-user` once and verify it reports the seeded account without committing runtime files.
