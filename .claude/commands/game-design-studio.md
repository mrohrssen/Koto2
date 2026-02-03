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
  GAME DESIGN STUDIO
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

## Step 3: Phase 1 - Codebase Analysis

Read the spec first:
```
Read: docs/design-studio/2026-02-03-game-design-studio-design.md
```

Then read key codebase files to ground yourself:
- `docs/ARCHITECTURE.md` - Full game architecture
- `data/chips.json` - Chip definitions
- `data/enemies.json` - Enemy definitions
- `src/game/items/chips.js` - Chip pipeline system
- `src/game/combat/mechanics.js` - Combat formulas

Announce:
```
[░░░░░░░░░░░░░░░░░░░░] 10% | Phase 1: Codebase Analysis complete
```

## Step 4: Phase 2 - Parallel Research

Launch ALL 10 research agents simultaneously using the Task tool. Each agent should:
1. Research their domain via web search
2. Read relevant codebase sections
3. Produce a position paper (max 500 words)

**Launch these agents in parallel (single message with multiple Task calls):**

```
Agent: Combat Designer
Focus: Turn-based combat feel, tactical depth, moment-to-moment satisfaction
Research: "turn-based combat design GDC", "[comparison games] combat analysis"
Codebase: src/game/combat/, data/enemies.json
Value function: Optimize for tactical depth and satisfying combat moments
Must cite: Specific games + specific codebase lines
```

```
Agent: Systems Designer
Focus: Chip synergies, build variety, emergent interactions
Research: "deck builder synergy design", "roguelike build variety"
Codebase: src/game/items/chips.js, data/chips.json
Value function: Protect what works, enable emergent complexity
Must cite: Specific games + specific codebase lines
```

```
Agent: Economy/Progression Designer
Focus: Reward pacing, power curves, meta-progression hooks
Research: "roguelike progression design", "mobile game economy"
Codebase: src/game/state.js (meta-progression section)
Value function: "One more run" addiction, satisfying power growth
Must cite: Specific games + specific codebase lines
```

```
Agent: UX/Game Feel Specialist
Focus: Juice, feedback, animations, micro-interactions
Research: "game feel juice design", "satisfying UI feedback"
Codebase: public/js/ui/combat-effects.js, public/game.css
Value function: Every action should feel crunchy and satisfying
Must cite: Specific games + specific codebase lines
```

```
Agent: Competitive Analyst
Focus: Market trends, what's working in similar games
Research: "roguelike deck builder 2024", "[comparison games] postmortem"
Codebase: General overview
Value function: What's proven to work in the market
Must cite: Specific successful games + market data
```

```
Agent: Player Psychologist
Focus: Flow states, intrinsic motivation, why players quit
Research: "flow state game design", "player retention psychology"
Codebase: Game loop flow in docs/ARCHITECTURE.md
Value function: Sustainable engagement over manipulation
Must cite: Psychology research + game examples
```

```
Agent: Playtester Advocate
Focus: First 10 minutes experience, friction points, confusion
Research: "new player onboarding games", "roguelike tutorial design"
Codebase: Early game flow
Value function: CONTRARIAN - find problems others miss
Must cite: Specific friction points in current game
```

```
Agent: Mobile/Retention Expert
Focus: Session length, daily hooks, pick-up-and-play
Research: "mobile game session design", "daily login hooks"
Codebase: Meta-progression, run length
Value function: Optimize for short satisfying sessions
Must cite: Successful mobile games + specific mechanics
```

```
Agent: Roguelike Specialist
Focus: Run variety, meaningful choices, genre conventions
Research: "roguelike design pillars", "[comparison games] design analysis"
Codebase: src/game/rooms.js, run structure
Value function: Genre purity, meaningful variance
Must cite: Classic roguelikes + modern innovations
```

```
Agent: Creative Director
DO NOT LAUNCH YET - waits for synthesis phase
```

**Progress display while research runs:**
```
[██████░░░░░░░░░░░░░░] 35% | ~X min remaining

PHASE 2: PARALLEL RESEARCH (all agents running simultaneously)

  ● Combat Designer        researching "turn-based combat feel"
  ● Systems Designer       reading src/game/items/chips.js
  ● Roguelike Specialist   researching "[comparison game] design"
  ...
```

**Wait for all agents to complete before proceeding.**

## Step 5: Phase 3 - Clustered Debate

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

## Step 6: Phase 4 - Synthesis

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

## Step 7: Output

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
