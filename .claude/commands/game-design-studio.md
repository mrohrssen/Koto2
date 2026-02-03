---
name: game-design-studio
description: "Dispatch AI agents to research game design and produce a decision document for improving gameplay fun. Usage: /game-design-studio <natural language request>"
---

# Game Design Studio v2

You are orchestrating a game design consulting process using micro-agent chains to prevent context overflow.

## Constants

**Specialist Prefixes:**
```
combat, systems, economy, ux, competitive, psychology, playtester, mobile, roguelike
```

**Tmp Directory:** `docs/design-studio/tmp/`

**File Naming Convention:**
- Research: `{prefix}-research.md`
- Analysis: `{prefix}-analysis.md`
- Position: `{prefix}-position.md`
- Debate: `{cluster}-cluster-debate.md`

**Clusters:**
- Combat Cluster: `combat`, `ux`, `playtester`
- Progression Cluster: `economy`, `psychology`, `mobile`
- Systems Cluster: `systems`, `roguelike`, `competitive`

## Step 1: Parse the Request

Extract from the user's natural language:
- **Time budget** (required): Look for "30 min", "1 hour", "2 hours", "quick", "deep", etc. Default to 30 minutes if unclear.
- **Focus area** (optional): "combat", "chip system", "progression", "retention", "everything", etc. Default to "everything".
- **Comparison games** (optional): Any specific games mentioned (Balatro, Slay the Spire, Hades, etc.)

Announce what you parsed:
```
══════════════════════════════════════════════════════════════════
  GAME DESIGN STUDIO v2
══════════════════════════════════════════════════════════════════
  Time budget:      [X minutes]
  Focus area:       [area or "Comprehensive Review"]
  Comparison games: [games or "None specified"]
══════════════════════════════════════════════════════════════════
```

## Step 2: Calculate Phase Timing

Distribute time as: 10% analysis, 60% research, 20% debate, 10% synthesis.

| Budget | Analysis | Research | Debate | Synthesis |
|--------|----------|----------|--------|-----------|
| 30 min | 3 min | 18 min | 6 min | 3 min |
| 1 hour | 6 min | 36 min | 12 min | 6 min |
| 2 hours | 12 min | 72 min | 24 min | 12 min |

## Step 3: Create Tmp Directory

Before spawning any agents:
```bash
mkdir -p docs/design-studio/tmp
```

Announce:
```
[░░░░░░░░░░░░░░░░░░░░] 5% | Creating workspace...
```

## Step 4: Phase 1 - Codebase Analysis (Orchestrator Only)

The orchestrator reads key files directly - no agents needed. This grounds you before spawning specialists.

**Read these files:**
- `docs/ARCHITECTURE.md` - Full game architecture
- `data/chips.json` - Chip definitions
- `data/enemies.json` - Enemy definitions
- `src/game/items/chips.js` - Chip pipeline system
- `src/game/combat/mechanics.js` - Combat formulas

**Summarize internally (do not output):**
- Core gameplay loop structure
- Number of chips and their types
- Enemy variety and difficulty scaling
- Key technical constraints

Announce:
```
[██░░░░░░░░░░░░░░░░░░] 10% | Phase 1: Codebase Analysis complete
```

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

After writing the file, your FINAL message must be EXACTLY:
"{Role}-Researcher: done, N sources"
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

After writing the file, your FINAL message must be EXACTLY:
"{Role}-Analyzer: done, N files analyzed"
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

After writing the file, your FINAL message must be EXACTLY:
"{Role}-Writer: done, position paper complete"
```

## Specialist Definitions

Each specialist has: prefix, role name, search queries, relevant files, value function, opposing role.

| Prefix | Role | Search Queries | Codebase Files | Value Function | Opposes |
|--------|------|----------------|----------------|----------------|---------|
| combat | Combat Designer | "turn-based combat design GDC", "{comparison} combat" | src/game/combat/, data/enemies.json | Tactical depth, satisfying moments | UX (depth vs accessibility) |
| systems | Systems Designer | "deck builder synergy", "roguelike build variety" | src/game/items/chips.js, data/chips.json | Emergent complexity, protect what works | Economy (complexity vs clarity) |
| economy | Economy Designer | "roguelike progression", "mobile game economy" | src/game/state.js | "One more run" addiction | Systems (pacing vs freedom) |
| ux | UX Specialist | "game feel juice", "satisfying UI feedback" | public/js/ui/combat-effects.js, public/game.css | Every action feels crunchy | Combat (feel vs depth) |
| competitive | Competitive Analyst | "roguelike deck builder 2024", "{comparison} postmortem" | General overview | What's proven to work | Roguelike (trends vs purity) |
| psychology | Player Psychologist | "flow state game design", "player retention" | docs/ARCHITECTURE.md loop section | Sustainable engagement | Mobile (ethics vs retention) |
| playtester | Playtester Advocate | "new player onboarding", "roguelike tutorial" | Early game flow | CONTRARIAN - find problems | Everyone (advocate for newbies) |
| mobile | Mobile Expert | "mobile session design", "daily login hooks" | Meta-progression, run length | Short satisfying sessions | Psychology (engagement vs manipulation) |
| roguelike | Roguelike Specialist | "roguelike design pillars", "{comparison} analysis" | src/game/rooms.js | Genre purity, meaningful variance | Competitive (purity vs trends) |

## Step 5: Phase 2 - Parallel Research Chains

For EACH specialist, spawn a 3-step chain. Chains run in parallel across specialists, but steps within a chain are sequential.

### Chain Execution Pattern

For each specialist (combat, systems, economy, ux, competitive, psychology, playtester, mobile, roguelike):

**Step A: Spawn Researcher**
Use Task tool with:
- `subagent_type`: "general-purpose"
- `description`: "{Role} Researcher"
- `prompt`: Fill in Researcher Template with specialist values

Wait for return message: "{Role}-Researcher: done, N sources"

**Step B: Spawn Analyzer (after Researcher completes)**
Use Task tool with:
- `subagent_type`: "general-purpose"
- `description`: "{Role} Analyzer"
- `prompt`: Fill in Analyzer Template with specialist values

Wait for return message: "{Role}-Analyzer: done, N files analyzed"

**Step C: Spawn Writer (after Analyzer completes)**
Use Task tool with:
- `subagent_type`: "general-purpose"
- `description`: "{Role} Writer"
- `prompt`: Fill in Writer Template with specialist values

Wait for return message: "{Role}-Writer: done, position paper complete"

### Parallel Execution Strategy

Launch ALL 9 Researcher agents in a single message (9 Task tool calls).

When a Researcher completes, immediately launch its Analyzer.

When an Analyzer completes, immediately launch its Writer.

**Do NOT wait for all Researchers before starting Analyzers.**

### Progress Display During Phase 2

```
[████░░░░░░░░░░░░░░░░] 25% | Phase 2: Research Chains

  ✓ Combat Designer     [████] Position complete
  ● Systems Designer    [██░░] Analyzer running...
  ● Economy Designer    [███░] Writer running...
  ○ UX Specialist       [█░░░] Researcher running...
  ○ Competitive Analyst [░░░░] Queued...
  ✗ Mobile Expert       [██░░] SKIPPED (timeout)
  ...

──────────────────────────────────────────────────────────────────
  6/9 specialists active | 1 skipped | Debate begins when complete
──────────────────────────────────────────────────────────────────
```

Status key: ✓ Complete | ● In progress | ○ Queued | ✗ Failed/Skipped

## Error Handling

### Micro-Agent Failure Protocol

When a micro-agent fails (timeout, error, bad output):

1. **Retry Attempt 1**: Re-spawn same micro-agent with same prompt
2. **Retry Attempt 2**: If still failing, re-spawn with simplified prompt
3. **Skip**: If 2 retries fail, mark specialist as SKIPPED

### Partial Work Preservation

- If Researcher succeeds but Analyzer fails → Research file preserved, retry only Analyzer
- If Analyzer succeeds but Writer fails → Both files preserved, retry only Writer
- Never throw away partial work

### When Skipping a Specialist

Write to `{prefix}-position.md`:
```markdown
## {Role} - UNAVAILABLE

This specialist could not complete research.
Error: {brief description}
Partial work: {list any completed steps}
```

Then continue with remaining specialists.

### Failure Display

```
══════════════════════════════════════════════════════════════════
  ⚠ AGENT FAILURE: Mobile Expert Analyzer
══════════════════════════════════════════════════════════════════
  Error: Context limit exceeded

  Retry 1/2... attempting
  Retry 1/2... failed (same error)
  Retry 2/2... attempting with simplified prompt
  Retry 2/2... failed

  → Marking Mobile Expert as SKIPPED
  → Continuing with 8/9 specialists
══════════════════════════════════════════════════════════════════
```

## Debate Cluster Template

```
You are facilitating the {CLUSTER} Cluster Debate for a game design review.

TASK:
1. Read these position papers:
   - docs/design-studio/tmp/{paper1}-position.md
   - docs/design-studio/tmp/{paper2}-position.md
   - docs/design-studio/tmp/{paper3}-position.md
2. Identify 2-3 key decisions this cluster should address
3. Surface genuine disagreements - don't paper over conflicts
4. Write to: docs/design-studio/tmp/{cluster}-cluster-debate.md

OUTPUT FORMAT:
## {Cluster} Cluster Debate

### Decision 1: [Title]
**The Question:** ...
**Options:**
- Option A: ... (Advocates: {Agent1}) (Evidence: ...)
- Option B: ... (Advocates: {Agent2}, {Agent3}) (Evidence: ...)
**Dissent:** Who disagreed and why

### Decision 2: [Title]
[Same format]

### Unresolved Tensions
- Tension that couldn't be resolved

After writing the file, your FINAL message must be EXACTLY:
"{Cluster}-Debate: done, N decisions surfaced"
```

## Step 6: Phase 3 - Clustered Debate

Launch 3 debate cluster agents in parallel (single message with 3 Task calls):

**Combat Cluster**
- Reads: `combat-position.md`, `ux-position.md`, `playtester-position.md`
- Writes: `combat-cluster-debate.md`
- Focus: Combat feel, feedback, new player experience

**Progression Cluster**
- Reads: `economy-position.md`, `psychology-position.md`, `mobile-position.md`
- Writes: `progression-cluster-debate.md`
- Focus: Retention, progression hooks, session design

**Systems Cluster**
- Reads: `systems-position.md`, `roguelike-position.md`, `competitive-position.md`
- Writes: `systems-cluster-debate.md`
- Focus: Build variety, genre conventions, market fit

### Handling Missing Position Papers

- If 1 paper missing → Debate proceeds with 2 papers, note gap
- If 2+ papers missing → Skip cluster, note in final report

### Progress Display During Phase 3

```
[████████████░░░░░░░░] 60% | Phase 3: Clustered Debate

  ● Combat Cluster      debating combat feel...
  ● Progression Cluster debating retention hooks...
  ● Systems Cluster     debating build variety...

──────────────────────────────────────────────────────────────────
  All 3 clusters running | Synthesis begins when complete
──────────────────────────────────────────────────────────────────
```

## Step 7: Phase 4 - Synthesis

Launch Creative Director agent to compile final report.

### Creative Director Prompt

```
You are the Creative Director synthesizing a game design review for NEO TOKYO: System Liberation.

TASK:
1. Read all debate outputs:
   - docs/design-studio/tmp/combat-cluster-debate.md
   - docs/design-studio/tmp/progression-cluster-debate.md
   - docs/design-studio/tmp/systems-cluster-debate.md

2. Skim position papers for additional context and sourcing:
   - docs/design-studio/tmp/*-position.md

3. Compile final report to: docs/design-studio/{date}-{topic}.md

FINAL REPORT FORMAT:
# Game Design Studio Report: {Topic}

**Generated:** {date}
**Focus:** {focus_area}
**Comparison Games:** {games}

## Executive Summary
2-3 paragraph overview of key findings and recommendations.

## Key Decisions (5-10)

### Decision 1: [Title]
**The Question:** ...
**Recommendation:** [Your synthesis of the debate]
**Evidence:** [Cite sources from position papers]
**Dissent:** [Note significant disagreements]
**Implementation Notes:** [If applicable]

[Repeat for each decision]

## Heated Debates (Top 5)
The most contentious discussions where specialists strongly disagreed:

1. **[Topic]**: {Agent A} argued X, {Agent B} argued Y. Tension remains because...
2. ...

## Run Metadata
- **Specialists completed:** N/9
- **Skipped:** [list any skipped specialists and reasons]
- **Clusters completed:** N/3

## Appendix: Sources
[Compiled list of all sources from position papers]

After writing the file, your FINAL message must be EXACTLY:
"Creative-Director: done, report saved to docs/design-studio/{filename}"
```

### Progress Display During Phase 4

```
[██████████████████░░] 90% | Phase 4: Synthesis

  ● Creative Director   compiling final report...

──────────────────────────────────────────────────────────────────
```

## Step 8: Cleanup and Completion

### On Successful Completion

1. Delete tmp directory:
```bash
rm -rf docs/design-studio/tmp
```

2. Display completion message:
```
══════════════════════════════════════════════════════════════════
  ✓ GAME DESIGN STUDIO v2 COMPLETE
══════════════════════════════════════════════════════════════════
  Report saved: docs/design-studio/{date}-{topic}.md

  Specialists: {N}/9 completed
  Decisions:   {N}
  Sources:     {N} cited

  Skipped agents: {list or "None"}
══════════════════════════════════════════════════════════════════
```

### On Failure

Leave `docs/design-studio/tmp/` intact for debugging.

Display:
```
══════════════════════════════════════════════════════════════════
  ✗ GAME DESIGN STUDIO v2 FAILED
══════════════════════════════════════════════════════════════════
  Error: {description}

  Partial work preserved in: docs/design-studio/tmp/

  Completed files:
  - {list files that exist}

  To resume: Re-run /game-design-studio with same parameters
══════════════════════════════════════════════════════════════════
```

## Important Notes

### Parallelism Rules
- ALL 9 Researcher agents launch in ONE message (9 Task calls)
- When Researcher N completes, immediately launch Analyzer N (don't wait for others)
- ALL 3 Debate clusters launch in ONE message (3 Task calls)
- Only synthesis runs alone

### Context Management
- Orchestrator NEVER receives full file contents after Phase 1
- Orchestrator only sees one-line status returns from agents
- Each micro-agent starts fresh - no accumulated context
- Maximum ~2000 words working content per agent

### File Handoffs
- Research → Analysis: Analyzer reads research file
- Analysis → Position: Writer reads both files
- Position → Debate: Debate agent reads 3 position files
- Debate → Synthesis: Director reads 3 debate files

### Status Return Format
All agents MUST end with exact status string:
- `{Role}-Researcher: done, N sources`
- `{Role}-Analyzer: done, N files analyzed`
- `{Role}-Writer: done, position paper complete`
- `{Cluster}-Debate: done, N decisions surfaced`
- `Creative-Director: done, report saved to {path}`
