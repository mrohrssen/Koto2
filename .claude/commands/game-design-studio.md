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

## Step 6: Phase 3 - Clustered Debate

Collect all position papers. Summarize each to ~100 words max.

Launch 3 debate clusters in parallel:

**Combat Cluster:** Combat Designer, UX Specialist, Playtester Advocate
- Input: Summarized position papers from these 3 agents
- Task: Debate combat-related proposals, surface disagreements
- Output: 2-3 decisions with options + dissent

**Progression Cluster:** Economy Designer, Player Psychologist, Mobile Expert
- Input: Summarized position papers from these 3 agents
- Task: Debate progression/retention proposals, surface disagreements
- Output: 2-3 decisions with options + dissent

**Systems Cluster:** Systems Designer, Roguelike Specialist, Competitive Analyst
- Input: Summarized position papers from these 3 agents
- Task: Debate systems/variety proposals, surface disagreements
- Output: 2-3 decisions with options + dissent

**Progress display:**
```
[████████████░░░░░░░░] 60% | ~X min remaining

PHASE 3: CLUSTERED DEBATE (all clusters running simultaneously)

  ● Combat Cluster         debating chip skill timing...
  ● Progression Cluster    debating meta-progression hooks...
  ● Systems Cluster        debating build variety...
```

**Wait for all clusters to complete before proceeding.**

## Step 7: Phase 4 - Synthesis

Launch Creative Director agent with:
- All cluster outputs (summarized)
- Full spec template from docs/design-studio/2026-02-03-game-design-studio-design.md
- Instructions to produce final decision document

The Creative Director must:
1. Synthesize 5-10 key decisions from cluster outputs
2. Identify the 5 most heated debates (where agents disagreed most)
3. Compile all sources into the appendix
4. Format according to the Decision Document Structure in the spec

**Progress display:**
```
[██████████████████░░] 90% | ~X min remaining

PHASE 4: SYNTHESIS

  ● Creative Director      compiling final report...
```

## Step 8: Output

Write the final report to:
```
docs/design-studio/YYYY-MM-DD-<topic>.md
```

Where `<topic>` is derived from the focus area (e.g., "chip-system", "combat-feel", "comprehensive").

Announce completion:
```
══════════════════════════════════════════════════════════════════
  ✓ GAME DESIGN STUDIO COMPLETE
══════════════════════════════════════════════════════════════════
  Report saved: docs/design-studio/YYYY-MM-DD-<topic>.md

  Decisions: [N]
  Heated debates: 5
  Sources cited: [N]
══════════════════════════════════════════════════════════════════
```

## Error Handling

If any agent fails:
1. Auto-retry 3 times with backoff
2. If still failing, pause and ask user:
```
══════════════════════════════════════════════════════════════════
  ⚠ ERROR: [Agent Name] - [error description]

  Retry 1/3... failed
  Retry 2/3... failed
  Retry 3/3... failed

  Options:
  [1] Skip this agent - continue without their input
  [2] Retry with different approach
  [3] Abort run

  Your choice: _
══════════════════════════════════════════════════════════════════
```

If skipped, note in final report:
```
**Note:** [Agent] was unavailable. [Domain] analysis may be incomplete.
```

## Agent Prompt Templates

When spawning each research agent, use this template:

```
You are the [ROLE NAME] for a game design review of NEO TOKYO: System Liberation.

YOUR VALUE FUNCTION: [specific optimization goal]
YOUR NATURAL TENSION: You often disagree with [opposing role] because [reason].

FOCUS AREA FOR THIS RUN: [user's focus area]
COMPARISON GAMES: [user's comparison games or "general research"]

TASK:
1. Read these codebase files: [relevant files]
2. Research via web: [search queries]
3. Produce a POSITION PAPER (max 500 words):

POSITION PAPER FORMAT:
## [Your Role] Position Paper

### Domain Summary
What you researched and why it matters.

### Key Findings
- Finding 1 [Source: title](url) or [Source: file:line]
- Finding 2 [Source: ...]
- Finding 3 [Source: ...]

### Proposals (2-3 concrete suggestions)
1. **[Proposal title]**: Description. Evidence: [source]
2. **[Proposal title]**: Description. Evidence: [source]

### Anticipated Objections
- [Other role] might object because...
- My counter: ...

### Dissent
One thing the consensus might get wrong: ...
```

## Debate Cluster Prompt Template

```
You are facilitating a debate between: [Agent 1], [Agent 2], [Agent 3]

Their summarized positions:
[100-word summary of each agent's position paper]

TASK:
1. Identify 2-3 decisions this cluster should address
2. For each decision, surface the options and who advocates what
3. Note genuine disagreements - don't paper over conflicts
4. Output structured decisions ready for the final report

OUTPUT FORMAT:
## [Cluster Name] Debate Output

### Decision: [Title]
**The Question:** ...
**Options:**
- Option A: ... (Advocates: Agent1) (Evidence: ...)
- Option B: ... (Advocates: Agent2, Agent3) (Evidence: ...)
**Dissent:** [who disagreed and why]

[Repeat for each decision]

### Unresolved Tensions
- [Tension that couldn't be resolved]
```

## Important Notes

- ALL research agents must run in PARALLEL - do not run them sequentially
- ALL debate clusters must run in PARALLEL - do not run them sequentially
- Keep position papers under 500 words to prevent context drift
- Summarize aggressively between phases
- The user is the CEO - surface disagreements for them to decide, don't resolve conflicts yourself
- Every claim must have a citation (game, article, or codebase line)
