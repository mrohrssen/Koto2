# Move Verb Mechanics CSV Implementation Plan

> **For agentic workers:** Execute inline in this session. Do not use subagents for this task.

**Goal:** Generate a new selected-moves CSV with proposed combat mechanics for each human-approved move.

**Architecture:** Use the approved design spec as the contract. Read the external source CSV, filter rows whose `Human Judgement` contains `Add`, preserve source columns, append curated mechanics columns, and validate the result before reporting completion.

**Tech Stack:** Python standard library `csv` module, project `output/` directory.

---

### Task 1: Extract Approved Rows

**Files:**
- Read: `/Users/michiarohrssen/Documents/move-verb-expansion-suggestions-master-MR CSV.csv`

- [ ] Parse the CSV with `csv.DictReader`.
- [ ] Keep rows where `Human Judgement` contains `Add`.
- [ ] Derive `Approved Move Name` from `Human Judgement` notes when they specify a preferred name; otherwise use `Move`.

### Task 2: Curate Move Mechanics

**Files:**
- Reference: `docs/move-system-reference.md`
- Output target: `output/move-verb-expansion-approved-mechanics.csv`

- [ ] Assign `Element`, `Category`, `Target`, `Power`, `MP Cost`, `Status Effect`, `Status Chance`, `Status Duration`, `Stat Changes`, `Tier`, and `Description`.
- [ ] Use the full move design space, including planned mechanics.
- [ ] Scale powerful-sounding moves above current game limits, up to roughly 70% stronger at the high end.
- [ ] Reduce raw power for status, buff, debuff, heal, drain, or all-target utility.

### Task 3: Validate Output

**Files:**
- Read: `output/move-verb-expansion-approved-mechanics.csv`

- [ ] Confirm row count matches the approved source rows.
- [ ] Confirm all appended columns are present.
- [ ] Confirm at least one move covers each category, target, status effect, and stat family requested in the spec.
- [ ] Confirm source CSV was not modified.
