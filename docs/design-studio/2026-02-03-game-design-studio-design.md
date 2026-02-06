# Game Design Studio - Specification

A Claude Code skill that dispatches specialized AI agents to research game design best practices, analyze the codebase, and produce a prioritized decision document for improving gameplay fun.

---

## Invocation

```
/game-design-studio <natural language request>
```

**Examples:**
```
/game-design-studio quick 30 min pass on combat feel
/game-design-studio 1 hour deep dive on the chip system, compare to Balatro and Slay the Spire
/game-design-studio 2 hour comprehensive review of everything, fresh eyes on the whole game
/game-design-studio 45 min focus on early game retention and why players might bounce
```

**Parsed inputs:**
- **Time budget** (required): How long the process runs (30m, 1h, 2h, etc.)
- **Focus area** (optional): Specific system or "everything" (default: everything)
- **Comparison games** (optional): Specific titles to research heavily

**Output location:**
```
docs/design-studio/YYYY-MM-DD-<topic>.md
```

---

## The 10 Specialist Roles

Each agent has a distinct value function designed to create natural tension and avoid groupthink.

| Role | Value Function | Natural Tension With |
|------|----------------|---------------------|
| **Combat Designer** | Moment-to-moment satisfaction, tactical depth | Mobile Expert (complexity vs. accessibility) |
| **Systems Designer** | Emergent interactions, build variety, protecting what works | UX Specialist (elegance vs. change) |
| **Economy/Progression Designer** | Reward pacing, power curves, "one more run" hooks | Player Psychologist (manipulation vs. satisfaction) |
| **UX/Game Feel Specialist** | Juice, feedback, animation polish, satisfying micro-interactions | Systems Designer (change vs. stability) |
| **Competitive Analyst** | Market trends, proven patterns, what's working elsewhere | Roguelike Specialist (trends vs. genre purity) |
| **Player Psychologist** | Intrinsic motivation, flow states, why players quit | Economy Designer (long-term vs. short-term hooks) |
| **Creative Director** | Holistic vision, resolves conflicts, synthesizes | All (must weigh competing priorities) |
| **Playtester Advocate** | Represents the player who bounces after 10 minutes, friction-finder | Everyone (contrarian by design) |
| **Mobile/Retention Expert** | Session length, daily hooks, notification-worthy moments | Combat Designer (depth vs. pick-up-and-play) |
| **Roguelike Specialist** | Run variety, meaningful choices, genre conventions, replayability | Mobile Expert (run length vs. session length) |

### Agent Rules

Every agent must:
- Cite specific games, mechanics, or codebase evidence for every claim
- State at least one objection to emerging consensus
- Cannot simply agree—must add unique perspective or push back

---

## Process Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 1: CODEBASE ANALYSIS (10% of time)                       │
│  All agents read ARCHITECTURE.md, key source files, data/*.json │
│  Run in parallel. Goal: Ground all agents in what exists.       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 2: PARALLEL RESEARCH (60% of time)                       │
│  ALL agents research their domains simultaneously.              │
│  Each produces a structured POSITION PAPER:                     │
│    - Domain summary (what they researched)                      │
│    - Key findings (with citations + URLs)                       │
│    - 2-3 concrete proposals for the game                        │
│    - Anticipated objections                                     │
│  Debate begins when ALL agents complete.                        │
│  Goal: Deep research with small, fresh contexts.                │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 3: CLUSTERED DEBATE (20% of time)                        │
│  Small groups debate related proposals:                         │
│    - Combat Cluster: Combat Designer, UX Specialist, Playtester │
│    - Progression Cluster: Economy, Player Psych, Mobile Expert  │
│    - Systems Cluster: Systems Designer, Roguelike Specialist    │
│    - Competitive Analyst floats across clusters                 │
│                                                                 │
│  Clusters run in parallel.                                      │
│  Each cluster receives ONLY summarized position papers.         │
│  Output: Compressed decisions + dissent per cluster.            │
│  Synthesis begins when ALL clusters complete.                   │
│  Goal: Real debate without context bloat.                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  PHASE 4: SYNTHESIS (10% of time)                               │
│  Creative Director receives cluster outputs (summaries only).   │
│  Produces final decision document.                              │
│  Goal: Unified report from compressed inputs.                   │
└─────────────────────────────────────────────────────────────────┘
```

### Time Scaling Examples

| Budget | Analysis | Research | Debate | Synthesis |
|--------|----------|----------|--------|-----------|
| 30 min | 3 min | 18 min | 6 min | 3 min |
| 1 hour | 6 min | 36 min | 12 min | 6 min |
| 2 hours | 12 min | 72 min | 24 min | 12 min |

---

## Anti-Drift Mechanisms

To prevent context drift (model degradation from large contexts):

1. **Agent isolation during research** - Each agent runs in parallel with its own small context
2. **Position papers are structured and length-capped** - Max 500 words per agent
3. **Clusters receive summaries, not raw transcripts** - Compressed handoffs between phases
4. **Fresh agent spawns per phase** - Each debate "response" is a new agent with compressed prior context
5. **No shared conversation history** - Agents communicate via structured documents, not chat

---

## Decision Document Structure

```markdown
# Game Design Studio Report
**Date:** YYYY-MM-DD
**Focus:** [focus area or "Comprehensive Review"]
**Time Budget:** [X minutes]
**Comparison Games:** [if specified]

---

## Executive Summary
3-5 bullet points: the biggest opportunities identified.

---

## Decisions

### Decision 1: [Clear action-oriented title]

**The Question:** What specific choice needs to be made?

**Options:**
- [ ] **Option A:** [Description]
  - *Pros:* ...
  - *Cons:* ...
  - *Advocates:* Combat Designer, UX Specialist
  - *Evidence:* [Source: GDC Talk - Title](url), `src/file.js:line`

- [ ] **Option B:** [Description]
  - *Pros:* ...
  - *Cons:* ...
  - *Advocates:* Systems Designer, Playtester Advocate
  - *Evidence:* [Source: Article Title](url)

- [ ] **Option C: Do nothing**
  - *Pros:* No risk, no dev time
  - *Cons:* Missed opportunity

**Estimated Scope:** Small / Medium / Large

---

[Decisions 2-10 follow same format]

---

## The 5 Most Heated Debates

### Debate 1: [Topic]
**The Tension:** [What agents fundamentally disagreed about]

**Side A:** [Position + who held it + their reasoning]

**Side B:** [Position + who held it + their reasoning]

**Why It Matters:** [Stakes of this disagreement]

**Unresolved?** Yes/No - [if unresolved, what would resolve it]

---

[Debates 2-5 follow same format]

---

## Research Appendix

### Sources by Agent

**Combat Designer:**
- [GDC 2019: Slay the Spire Design](https://url) - Combat pacing insights
- [Balatro Postmortem - Reddit AMA](https://url) - Card feel discussion
- `src/game/combat/player-actions.js` - Current attack pipeline

**Systems Designer:**
- [Source Title](url) - Key insight
- `data/chips.json` - Current chip variety analysis

**Roguelike Specialist:**
- [Hades Design Deep Dive - Game Maker's Toolkit](https://url)
- [Into the Breach: Design Postmortem](https://url)

**Economy/Progression Designer:**
- [Source Title](url) - Key insight

**UX/Game Feel Specialist:**
- [Source Title](url) - Key insight

**Player Psychologist:**
- [Source Title](url) - Key insight

**Competitive Analyst:**
- [Source Title](url) - Key insight

**Playtester Advocate:**
- [Source Title](url) - Key insight

**Mobile/Retention Expert:**
- [Supercell Retention Talk 2023](https://url)
- [Clash Royale Session Design - Deconstructor of Fun](https://url)

---

## Source Index
Alphabetized list of all external sources with full URLs.

---

## Run Metadata
- **Agents completed:** 10/10
- **Debates held:** 3 clusters
- **Total research sources:** [N]
- **Codebase files analyzed:** [N]
```

---

## Progress Visibility

During the run, the terminal displays:

```
══════════════════════════════════════════════════════════════════
  GAME DESIGN STUDIO - 1 hour focus on chip system
══════════════════════════════════════════════════════════════════

[██████░░░░░░░░░░░░░░] 30% | ~42 min remaining

PHASE 2: PARALLEL RESEARCH (all agents running simultaneously)

  ● Combat Designer        researching "turn-based combat feel"
  ● Systems Designer       reading src/game/items/chips.js
  ● Roguelike Specialist   researching "Slay the Spire card synergies"
  ● Economy Designer       researching "Balatro chip economy"
  ● UX Specialist          researching "game juice best practices"
  ● Player Psychologist    researching "flow state game design"
  ● Mobile Expert          researching "session length retention"
  ● Competitive Analyst    researching "2024 roguelike market"
  ✓ Playtester Advocate    done - 2 proposals drafted
  ○ Creative Director      waiting for synthesis phase

──────────────────────────────────────────────────────────────────
  9/10 agents active | Debate begins when all research complete
──────────────────────────────────────────────────────────────────
```

**Status indicators:**
- `✓` Complete
- `●` In progress (shows current action)
- `○` Queued/waiting

**Phase transitions:**
```
══ PHASE 3: CLUSTERED DEBATE ══════════════════════════════════════
  Combat Cluster forming: Combat Designer, UX Specialist, Playtester
  Progression Cluster forming: Economy, Player Psych, Mobile Expert
  Systems Cluster forming: Systems Designer, Roguelike Specialist
```

---

## Error Handling

**Auto-retry with escalation:**

```
══════════════════════════════════════════════════════════════════
  ⚠ ERROR: Mobile Expert - web search failed (rate limit)

  Retry 1/3...
  Retry 2/3...
  Retry 3/3...

  ✗ FAILED after 3 retries
══════════════════════════════════════════════════════════════════

Mobile Expert could not complete research. Options:

  [1] Skip this agent - continue without Mobile Expert input
  [2] Retry with different search terms
  [3] Abort run - no charge for partial work

Your choice (1/2/3): _
```

**Error categories:**

| Error Type | Auto-Retry? | Fallback |
|------------|-------------|----------|
| Web search fails | Yes (3x) | Ask user |
| Codebase read fails | Yes (3x) | Ask user |
| Agent produces garbage | No | Ask user |
| Rate limit hit | Yes (with backoff) | Ask user |
| Timeout | Yes (3x) | Ask user |

**Partial completion note in report:**
```markdown
**Note:** Mobile/Retention Expert was unavailable for this run.
Retention-focused analysis may be incomplete.
```

---

## Skill Implementation

**Location:** Project skill or `~/.claude/skills/game-design-studio.md`

**Orchestration approach:**

1. **Orchestrator agent** parses natural language input, sets time budget, initializes run
2. **Phase 1:** Spawns all 10 agents in parallel to read codebase (Task tool with `run_in_background`)
3. **Phase 2:** Spawns all agents in parallel for research; waits for all to complete
4. **Phase 3:** Spawns 3 debate clusters in parallel with summarized position papers; waits for all
5. **Phase 4:** Spawns Creative Director with cluster summaries to produce final document
6. **Output:** Writes report to `docs/design-studio/YYYY-MM-DD-<topic>.md`

**Time enforcement:**
- Orchestrator tracks wall clock time
- Sends "wrap up" signal to agents at phase deadlines
- Agents must produce best-effort output even if research incomplete

**Parallelism:**
- Research phase: All 10 agents run simultaneously
- Debate phase: All 3 clusters run simultaneously
- Agents within a cluster may run sequentially (for response/counter-response)

---

## Key Design Decisions

1. **Adversarial by design** - Agents have conflicting value functions to surface real trade-offs
2. **Position papers over live chat** - Prevents context drift, enables parallel execution
3. **Clustered debates** - Small groups keep context small, enable focused discussion
4. **CEO decides** - Disagreements surface with pros/cons; you make final calls
5. **Fully autonomous** - Fire and forget; no checkpoints during run
6. **Configurable depth via time** - You set the clock, system adapts

---

## Future Enhancements (Not in V1)

- Memory between runs (reference previous reports)
- A/B testing hooks for implemented changes
- Player feedback integration
- Automatic implementation plan generation from checked decisions
