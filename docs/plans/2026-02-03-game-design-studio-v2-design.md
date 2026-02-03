# Game Design Studio v2 - Micro-Agent Chain Architecture

**Date:** 2026-02-03
**Problem:** The current `/game-design-studio` skill hits context limits because each of the 10 research agents accumulates too much context (web searches + codebase reads + position paper writing).
**Solution:** Decompose each specialist into a chain of 3 focused micro-agents with file-based handoffs.

---

## Architecture Overview

Each of the 10 specialists becomes a chain of 3 micro-agents:

```
┌─────────────────────────────────────────────────────────────┐
│  SPECIALIST CHAIN (e.g., Combat Designer)                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Researcher ──writes──► combat-research.md                  │
│      │                     (web findings, 200 words max)    │
│      ▼                                                      │
│  Analyzer ────writes──► combat-analysis.md                  │
│      │                     (codebase insights, 200 words)   │
│      ▼                                                      │
│  Writer ──────writes──► combat-position.md                  │
│                            (position paper, 500 words)      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Why this works:**
- Each micro-agent has fresh context (no accumulated cruft)
- Agents read only what they need from files
- Agents write output before accumulating more
- No agent ever holds more than ~2000 words of working content

---

## Phase Breakdown

### Phase 1: Codebase Analysis (10% of time)

Orchestrator reads key files directly - no agents needed:
- `docs/ARCHITECTURE.md`
- `data/chips.json`
- `data/enemies.json`
- `src/game/items/chips.js`
- `src/game/combat/mechanics.js`

This grounds the orchestrator before spawning specialists.

### Phase 2: Parallel Research (60% of time)

All 10 specialist chains run simultaneously. Within each chain, steps run sequentially:

**Step 1: Researcher (web search only)**
- 1-2 focused web searches
- Writes findings to `{specialist}-research.md` (max 200 words)
- Returns: `"Combat-Researcher: done, 3 sources"`

**Step 2: Analyzer (codebase only)**
- Reads `{specialist}-research.md`
- Reads relevant codebase files
- Writes to `{specialist}-analysis.md` (max 200 words)
- Returns: `"Combat-Analyzer: done, 2 files analyzed"`

**Step 3: Writer (synthesis)**
- Reads `{specialist}-research.md` and `{specialist}-analysis.md`
- Writes `{specialist}-position.md` (max 500 words, structured format)
- Returns: `"Combat-Writer: done, position paper complete"`

**Parallelism:** Fully parallel across specialists. Each chain runs independently - a fast-completing specialist doesn't wait for slow ones.

### Phase 3: Clustered Debate (20% of time)

Single agents per cluster. Each reads 3 position paper files (~1500 words total):

| Cluster | Reads |
|---------|-------|
| Combat Cluster | `combat-position.md`, `ux-position.md`, `playtester-position.md` |
| Progression Cluster | `economy-position.md`, `psychology-position.md`, `mobile-position.md` |
| Systems Cluster | `systems-position.md`, `roguelike-position.md`, `competitive-position.md` |

Each writes to `{cluster}-debate.md`.

All 3 clusters run in parallel.

### Phase 4: Synthesis (10% of time)

Creative Director reads:
- All 3 debate files
- Skims position papers for sourcing

Writes final report to `docs/design-studio/YYYY-MM-DD-<topic>.md`.

---

## File Structure

### Temporary Files (cleaned up after successful run)

```
docs/design-studio/tmp/
├── combat-research.md
├── combat-analysis.md
├── combat-position.md
├── systems-research.md
├── systems-analysis.md
├── systems-position.md
├── economy-research.md
├── economy-analysis.md
├── economy-position.md
├── ux-research.md
├── ux-analysis.md
├── ux-position.md
├── competitive-research.md
├── competitive-analysis.md
├── competitive-position.md
├── psychology-research.md
├── psychology-analysis.md
├── psychology-position.md
├── playtester-research.md
├── playtester-analysis.md
├── playtester-position.md
├── mobile-research.md
├── mobile-analysis.md
├── mobile-position.md
├── roguelike-research.md
├── roguelike-analysis.md
├── roguelike-position.md
├── combat-cluster-debate.md
├── progression-cluster-debate.md
└── systems-cluster-debate.md
```

### Specialist Naming Map

| Specialist | File prefix |
|------------|-------------|
| Combat Designer | `combat-` |
| Systems Designer | `systems-` |
| Economy/Progression Designer | `economy-` |
| UX/Game Feel Specialist | `ux-` |
| Competitive Analyst | `competitive-` |
| Player Psychologist | `psychology-` |
| Playtester Advocate | `playtester-` |
| Mobile/Retention Expert | `mobile-` |
| Roguelike Specialist | `roguelike-` |

### Final Output (kept)

```
docs/design-studio/YYYY-MM-DD-<topic>.md
```

### Cleanup

- After successful run: delete `docs/design-studio/tmp/`
- On failure: leave tmp/ for debugging

---

## Error Handling

### Micro-Agent Failure Protocol

```
Micro-agent fails (timeout, context limit, bad output)
         │
         ▼
    Retry same micro-agent (attempt 2/3)
         │
         ├── Success → continue chain
         │
         ▼
    Retry same micro-agent (attempt 3/3)
         │
         ├── Success → continue chain
         │
         ▼
    Mark specialist as SKIPPED
    Write to {specialist}-position.md:
      "## [Specialist] - UNAVAILABLE
       This specialist could not complete research.
       Error: [brief description]"
         │
         ▼
    Continue with remaining specialists
```

### Partial Work Preservation

- If Researcher succeeds but Analyzer fails → research file preserved, retry only Analyzer
- If Analyzer succeeds but Writer fails → both files preserved, retry only Writer
- Partial work is never thrown away

### Debate Cluster Handling

- Missing 1 position paper → debate agent proceeds with 2 papers
- Missing 2+ papers → skip that cluster, note in report

### Final Report Notation

```markdown
## Run Metadata
- **Agents completed:** 8/10
- **Skipped:** Mobile Expert (web search timeout), Playtester Advocate (context limit)
- **Note:** Retention and friction analysis may be incomplete.
```

---

## Orchestrator Behavior

### Responsibilities

1. Parse user request (time budget, focus, comparison games)
2. Read codebase files for grounding (Phase 1)
3. Spawn micro-agents, track one-line status returns
4. Handle retries and skip logic
5. Display progress
6. Trigger cleanup on completion

### Context Budget

The orchestrator never receives:
- Full web search results
- Full codebase file contents (after Phase 1)
- Full position papers or debate outputs

It only receives one-line status strings:
```
"Combat-Researcher: done, 3 sources"
"Combat-Analyzer: done, analyzed mechanics.js, chips.js"
"Combat-Writer: done, position paper complete"
```

### Progress Display

```
══════════════════════════════════════════════════════════════════
  GAME DESIGN STUDIO - 1 hour focus on chip system
══════════════════════════════════════════════════════════════════

[██████░░░░░░░░░░░░░░] 35% | Phase 2: Research

  ✓ Combat Designer     [████] Position complete
  ● Systems Designer    [██░░] Analyzer running...
  ● Economy Designer    [███░] Writer running...
  ● UX Specialist       [█░░░] Researcher running...
  ○ Roguelike Specialist [░░░░] Queued...
  ✗ Mobile Expert       [██░░] SKIPPED (timeout)
  ...

──────────────────────────────────────────────────────────────────
  6/10 specialists active | 1 skipped | Debate begins when complete
──────────────────────────────────────────────────────────────────
```

Status indicators:
- `✓` Complete
- `●` In progress
- `○` Queued
- `✗` Skipped/failed

---

## Agent Counts

| Phase | Agents | Parallel? |
|-------|--------|-----------|
| Research | 30 (10 × 3) | Yes across specialists, sequential within chain |
| Debate | 3 | Yes |
| Synthesis | 1 | No |
| **Total** | **34** | |

---

## Changes from v1

| v1 (Current) | v2 (New) |
|--------------|----------|
| 10 monolithic research agents | 30 micro-agents (10 × 3-step chains) |
| Agents return full position papers to orchestrator | Agents write to files, return one-line status |
| Orchestrator accumulates all outputs | Orchestrator stays lean, reads nothing |
| Debate agents receive raw papers in prompt | Debate agents read files directly |
| Single point of failure per specialist | Retry at micro-agent level, preserve partial work |

---

## Micro-Agent Prompt Templates

### Researcher Template

```
You are the {ROLE} Researcher for a game design review of NEO TOKYO: System Liberation.

FOCUS AREA: {focus_area}
COMPARISON GAMES: {comparison_games}

TASK:
1. Perform 1-2 web searches on: {search_queries}
2. Extract the most relevant findings
3. Write to: docs/design-studio/tmp/{prefix}-research.md

OUTPUT FORMAT (max 200 words):
## {Role} Research Findings

### Sources
- [Title](url) - one-line summary
- [Title](url) - one-line summary

### Key Insights
- Insight 1
- Insight 2
- Insight 3

RETURN exactly: "{Role}-Researcher: done, N sources"
```

### Analyzer Template

```
You are the {ROLE} Analyzer for a game design review of NEO TOKYO: System Liberation.

TASK:
1. Read: docs/design-studio/tmp/{prefix}-research.md
2. Read codebase files: {relevant_files}
3. Connect research findings to current implementation
4. Write to: docs/design-studio/tmp/{prefix}-analysis.md

OUTPUT FORMAT (max 200 words):
## {Role} Codebase Analysis

### Current Implementation
- What exists in {files}

### Gaps vs Research
- Gap 1: Research suggests X, code does Y
- Gap 2: ...

### Opportunities
- Opportunity 1 (cites research + code)
- Opportunity 2

RETURN exactly: "{Role}-Analyzer: done, N files analyzed"
```

### Writer Template

```
You are the {ROLE} Position Writer for a game design review of NEO TOKYO: System Liberation.

YOUR VALUE FUNCTION: {value_function}
YOUR NATURAL TENSION: You often disagree with {opposing_role} because {reason}.

TASK:
1. Read: docs/design-studio/tmp/{prefix}-research.md
2. Read: docs/design-studio/tmp/{prefix}-analysis.md
3. Synthesize into a position paper
4. Write to: docs/design-studio/tmp/{prefix}-position.md

OUTPUT FORMAT (max 500 words):
## {Role} Position Paper

### Domain Summary
What you researched and why it matters.

### Key Findings
- Finding 1 [Source: title](url) or [Source: file:line]
- Finding 2
- Finding 3

### Proposals (2-3 concrete suggestions)
1. **Proposal title**: Description. Evidence: [source]
2. **Proposal title**: Description. Evidence: [source]

### Anticipated Objections
- {Opposing role} might object because...
- My counter: ...

### Dissent
One thing the consensus might get wrong: ...

RETURN exactly: "{Role}-Writer: done, position paper complete"
```

### Debate Cluster Template

```
You are facilitating the {CLUSTER} Debate for a game design review.

TASK:
1. Read position papers:
   - docs/design-studio/tmp/{paper1}-position.md
   - docs/design-studio/tmp/{paper2}-position.md
   - docs/design-studio/tmp/{paper3}-position.md
2. Identify 2-3 decisions this cluster should address
3. Surface genuine disagreements - don't paper over conflicts
4. Write to: docs/design-studio/tmp/{cluster}-cluster-debate.md

OUTPUT FORMAT:
## {Cluster} Cluster Debate Output

### Decision: [Title]
**The Question:** ...
**Options:**
- Option A: ... (Advocates: Agent1) (Evidence: ...)
- Option B: ... (Advocates: Agent2, Agent3) (Evidence: ...)
**Dissent:** [who disagreed and why]

[Repeat for each decision]

### Unresolved Tensions
- Tension that couldn't be resolved

RETURN exactly: "{Cluster}-Debate: done, N decisions surfaced"
```

---

## Implementation Notes

1. Create `docs/design-studio/tmp/` directory at start of run
2. Use `run_in_background: false` for micro-agents (need status returns)
3. Track chain progress: `{specialist: {step: 1|2|3, status: 'running'|'done'|'failed'}}`
4. Spawn next step immediately when previous completes (don't wait for other specialists)
5. After synthesis completes, delete tmp/ directory
