# Game Design Studio Report
**Date:** 2026-02-03
**Focus:** Overall Gameplay Mechanics and Fun
**Time Budget:** 40 minutes
**Comparison Games:** Slay the Spire, Balatro, Into the Breach, Hades, Dead Cells

---

## Executive Summary

- **Chip skill visibility is a critical gap** - Players cannot see charge progress, making the 5-turn skill system invisible and unlearnable. All agents agree this is low-hanging fruit.
- **Combat pacing has 2+ seconds of dead time** - The 400ms + 1440ms delays after vocab answers create friction that compounds across hundreds of encounters per run.
- **Meta-progression timeline (25-30 runs to max) may exceed casual player patience** - Economy Designer proposes frontloading rewards, but risks trivializing the mid-game.
- **Session length (30-45 min) conflicts with mobile/casual audience** - Ward checkpointing could unlock accessibility but fundamentally changes the roguelike identity.
- **Chip pool complexity budget is contested** - Systems cluster wants to add Echo/Threshold mechanics while Progression cluster wants to disable chip skills for early floors.

---

## Decisions

### Decision 1: Chip Skill Charge Visibility
**The Question:** How should players track the 5-turn charge progress toward chip skill activation?

**Options:**
- [ ] **Option A:** Add charge counter overlay to chip icons
  - *Pros:* Direct, scannable, matches Slay the Spire's orb/power tracking pattern
  - *Cons:* Visual clutter in already-dense chip row
  - *Advocates:* Playtester, UX Specialist, Combat Designer (unanimous)
  - *Evidence:* Slay the Spire shows buff durations on card art; Into the Breach shows mech cooldowns on unit icons

- [ ] **Option B:** Add charge bar below chip row (separate UI element)
  - *Pros:* Cleaner chip icons, dedicated visual space
  - *Cons:* Requires eye movement away from chips, adds UI element
  - *Advocates:* None strongly
  - *Evidence:* Hades uses separate boon UI panel

- [ ] **Option C: Do nothing**
  - *Pros:* No risk, no dev time
  - *Cons:* Players cannot learn the core skill system; invisible mechanics feel unfair

**Estimated Scope:** Small

---

### Decision 2: Combat Pacing - Attack Timing
**The Question:** Should players manually trigger attacks after vocab answers, or should the game auto-attack with optimized delays?

**Options:**
- [ ] **Option A:** Add manual attack button after vocab submission
  - *Pros:* Player agency, allows damage preview before committing, creates "moment of impact"
  - *Cons:* Adds click per encounter, slows optimal play, increases complexity
  - *Advocates:* Combat Designer
  - *Evidence:* Balatro has manual "play hand" button despite auto-scoring; creates anticipation

- [ ] **Option B:** Keep auto-attack, reduce delays from 400ms/1440ms to 200ms/800ms
  - *Pros:* Faster flow, preserves simplicity, respects player time
  - *Cons:* Less impact per hit, may feel "too fast" for damage appreciation
  - *Advocates:* UX Specialist
  - *Evidence:* Dead Cells' attack animations are 100-200ms; Into the Breach resolves instantly

- [ ] **Option C: Do nothing**
  - *Pros:* No risk, no dev time
  - *Cons:* 2+ seconds of dead time per vocab answer compounds to 5-10 min of waiting per run

**Estimated Scope:** Small (Option B) / Medium (Option A)

---

### Decision 3: Chip Pipeline Visualization
**The Question:** Should the chip-to-damage pipeline have more visual feedback showing how chips contribute to PWR/BW?

**Options:**
- [ ] **Option A:** Add particle flows from active chips to PWR/BW pool displays
  - *Pros:* Teaches the formula visually, creates spectacle, reinforces synergy choices
  - *Cons:* Risk of "over-juicing" (UX concern), adds visual noise, dev time for particle system
  - *Advocates:* Combat Designer
  - *Evidence:* Balatro's chip scoring animation shows contribution breakdown; players cite it as core appeal

- [ ] **Option B:** Add variable-speed display with skip button
  - *Pros:* Respects both spectacle-seekers and speed-runners, player choice
  - *Cons:* Skip button suggests the animation is skippable (devalues it), two code paths
  - *Advocates:* UX Specialist
  - *Evidence:* Slay the Spire lets players speed up card animations in settings

- [ ] **Option C: Do nothing**
  - *Pros:* No risk, no dev time
  - *Cons:* Players may not understand why damage varies; formula remains abstract

**Estimated Scope:** Medium (Option A) / Small (Option B)

---

### Decision 4: Meta-Progression Reward Curve
**The Question:** Should the game frontload essence rewards to accelerate early unlocks, or maintain the current 25-30 run timeline?

**Options:**
- [ ] **Option A:** Frontload 2x essence for first 5 runs
  - *Pros:* Faster hook, players see meta-progression impact early, reduces churn
  - *Cons:* Trivializes mid-game if early unlocks are powerful, inflation pressure
  - *Advocates:* Economy Designer (primary position)
  - *Evidence:* Hades grants Titan Blood and Diamonds generously in first 10 runs; Slay the Spire unlocks cards rapidly early

- [ ] **Option B:** Remove meta-progression entirely (pure skill-based runs)
  - *Pros:* Clean roguelike purity, no grinding, all runs equal
  - *Cons:* Removes long-term goal structure, may reduce retention
  - *Advocates:* Economy Designer (alternative position)
  - *Evidence:* Into the Breach has minimal meta-progression; relies on unlock variety not power

- [ ] **Option C: Do nothing**
  - *Pros:* No risk, no dev time
  - *Cons:* 25-30 runs may exceed casual player investment horizon

**Estimated Scope:** Small (tuning only)

---

### Decision 5: Session Length and Checkpointing
**The Question:** Should runs allow mid-run saves/checkpoints, or remain single-session experiences?

**Options:**
- [ ] **Option A:** Ward-based checkpointing (save after each boss, resume from ward start)
  - *Pros:* Enables mobile/casual play, reduces session commitment from 45min to ~10min segments
  - *Cons:* Fundamentally changes roguelike tension, enables "save scumming" mindset, complicates essence rewards
  - *Advocates:* Mobile Expert
  - *Evidence:* Dead Cells saves between biomes; Hades saves on death

- [ ] **Option B:** Add Quick Practice Mode (10 min, 3 rooms, separate progression track)
  - *Pros:* Preserves main run integrity, offers casual option, can tune separately
  - *Cons:* Splits player attention, two modes to balance, "which mode should I play?"
  - *Advocates:* Mobile Expert, Competitive Analyst
  - *Evidence:* Slay the Spire's Daily Climb is separate from main ascension

- [ ] **Option C: Do nothing**
  - *Pros:* No risk, no dev time, maintains roguelike purity
  - *Cons:* 30-45 min sessions exclude mobile/casual market segment

**Estimated Scope:** Large (Option A) / Medium (Option B)

---

### Decision 6: Early-Game Complexity Reduction
**The Question:** Should the tutorial ward disable advanced systems (chip skills, extra slots) to reduce cognitive load?

**Options:**
- [ ] **Option A:** Disable chip skills for floors 1-2, limit to 3 chip slots
  - *Pros:* Reduces initial system overload, teaches core vocab-combat loop first
  - *Cons:* Removes the mechanic the game is built around, players may quit before seeing depth
  - *Advocates:* Player Psychologist
  - *Evidence:* Slay the Spire Act 1 has simpler enemy patterns; Into the Breach's first island is tutorial-weight

- [ ] **Option B:** Combat-integrated vocab (merge Quiz/Word Discovery into combat)
  - *Pros:* Single unified loop, less context-switching, every room is combat
  - *Cons:* Massive redesign scope, loses dedicated practice spaces, homogenizes experience
  - *Advocates:* Player Psychologist (alternative)
  - *Evidence:* Duolingo Stories embed learning in narrative; pure integration

- [ ] **Option C: Do nothing**
  - *Pros:* No risk, no dev time
  - *Cons:* 5-system simultaneous introduction may overwhelm new players

**Estimated Scope:** Medium (Option A) / Large (Option B)

---

### Decision 7: Chip Pool Size and Ecosystem Direction
**The Question:** Should the chip pool expand with new mechanics (Echo/Threshold), contract to 24 focused chips, or stay at 32?

**Options:**
- [ ] **Option A:** Maintain 32 chips, add Echo (double-trigger) and Threshold (BW≥5 activation) mechanics
  - *Pros:* More build variety, rewards mastery, creates memorable "pop-off" moments
  - *Cons:* Increases complexity budget, harder to balance, more to learn
  - *Advocates:* Roguelike Specialist, Competitive Analyst
  - *Evidence:* Slay the Spire has 75+ cards per class; depth comes from interactions

- [ ] **Option B:** Reduce to 24 chips, remove "stat stick" chips that lack interesting effects
  - *Pros:* Every chip is a meaningful choice, easier to balance, cleaner design
  - *Cons:* Less variety, fewer builds possible, may feel limiting
  - *Advocates:* Systems Designer
  - *Evidence:* Into the Breach has 8 mechs with 2 weapons each; focused pool enables depth

- [ ] **Option C: Do nothing**
  - *Pros:* No risk, no dev time
  - *Cons:* Some chips may be "never pick" options; pool not optimized

**Estimated Scope:** Medium (Option A) / Medium (Option B)

---

### Decision 8: Run Length Options
**The Question:** Should the game offer variable run lengths, or optimize a single default experience?

**Options:**
- [ ] **Option A:** Add "Quick Run" mode (3 wards, ~15 min)
  - *Pros:* Accessibility, session flexibility, lower commitment for practice
  - *Cons:* Two modes to balance, player confusion about "real" mode, splits leaderboards
  - *Advocates:* Competitive Analyst
  - *Evidence:* Balatro has different deck sizes; Slay the Spire has 3 acts but Daily is shorter

- [ ] **Option B:** Keep 5 wards, add optional detour wards with modifiers
  - *Pros:* Single core experience, detours reward skilled play, more content without mode split
  - *Cons:* Makes runs longer not shorter, doesn't address session length concern
  - *Advocates:* Roguelike Specialist
  - *Evidence:* Hades has optional mini-bosses (Thanatos, etc.); rewards exploration

- [ ] **Option C: Do nothing**
  - *Pros:* No risk, no dev time, single focused experience
  - *Cons:* 30-45 min is only option; take-it-or-leave-it

**Estimated Scope:** Medium (Option A) / Large (Option B)

---

### Decision 9: Damage Feedback Granularity
**The Question:** Should damage feedback use gradient intensity (multiple thresholds) or remain binary (150+ only)?

**Options:**
- [ ] **Option A:** Gradient intensity with 50/100/150/200+ thresholds
  - *Pros:* More feedback resolution, players can gauge build effectiveness, satisfying scaling
  - *Cons:* More visual complexity, may clutter combat, requires art for 4 tiers
  - *Advocates:* UX Specialist
  - *Evidence:* Balatro has gradient score feedback; chip combos scale visually

- [ ] **Option B:** Keep binary 150+ threshold
  - *Pros:* Simple, clear "big hit" moment, no additional dev work
  - *Cons:* 149 damage looks same as 10 damage; loses granularity
  - *Advocates:* Status quo
  - *Evidence:* Current implementation

- [ ] **Option C: Do nothing**
  - *Pros:* No risk, no dev time
  - *Cons:* Damage feedback doesn't scale with build quality

**Estimated Scope:** Small

---

### Decision 10: Daily Engagement Systems
**The Question:** Should the game include daily login rewards or engagement hooks?

**Options:**
- [ ] **Option A:** 7-day login calendar with essence rewards
  - *Pros:* Retention mechanism, habit formation, standard mobile practice
  - *Cons:* Feels exploitative, pressures players, conflicts with educational mission
  - *Advocates:* Mobile Expert (tentative)
  - *Evidence:* Duolingo streaks drive retention; industry standard

- [ ] **Option B:** Reject daily hooks for educational audience
  - *Pros:* Respects player time, avoids dark patterns, clean educational positioning
  - *Cons:* May reduce retention vs. competitors, no habit pressure
  - *Advocates:* Mobile Expert (counter-position), Player Psychologist
  - *Evidence:* Educational apps face backlash for manipulative mechanics

- [ ] **Option C: Do nothing**
  - *Pros:* No risk, no dev time
  - *Cons:* No daily engagement mechanism

**Estimated Scope:** Small (Option A) / None (Option B)

---

## The 5 Most Heated Debates

### Debate 1: Complexity Budget War
**The Tension:** How many systems can the game support before it overwhelms players?

**Side A:** Systems Designer and Roguelike Specialist want to ADD mechanics (Echo chips, Threshold triggers, intent-reactive chips). They argue depth creates replayability and the formula is "too simple" for roguelike standards.

**Side B:** Player Psychologist and Progression cluster want to REMOVE or gate mechanics (disable chip skills floors 1-2, limit slots). They argue the 5-system simultaneous introduction already overwhelms new players.

**Why It Matters:** These positions are mutually exclusive. Adding Echo mechanics while disabling chip skills early creates an even steeper late-game complexity cliff. The game must choose its audience: hardcore roguelike fans who crave depth, or casual learners who need gentler onboarding.

**Unresolved?** Yes - requires playtesting with actual new players to determine where the complexity ceiling sits.

---

### Debate 2: Session Length vs. Roguelike Identity
**The Tension:** Can a roguelike have checkpoints without losing its soul?

**Side A:** Mobile Expert argues 30-45 minute committed sessions exclude the casual/mobile audience entirely. Ward checkpointing would make the game accessible without changing core mechanics.

**Side B:** Roguelike Specialist argues checkpoints remove the tension that defines the genre. "If death has no cost, choices have no weight." The 28-room gauntlet IS the experience.

**Why It Matters:** This affects not just session length but the fundamental risk/reward psychology. Slay the Spire and Hades both allow save-quit, but neither allows mid-run "continue from checkpoint" after death. The distinction is subtle but critical.

**Unresolved?** Partially - Quick Practice Mode (Option B) might satisfy both parties by preserving main run integrity while offering a casual option.

---

### Debate 3: Meta-Progression Philosophy
**The Tension:** Economy Designer is internally conflicted between two mutually exclusive positions.

**Side A (Frontloading):** 2x essence for first 5 runs hooks players fast, shows them the upgrade system matters, reduces early churn.

**Side B (Removal):** Meta-progression creates "grind to win" perception, dilutes skill expression, makes early runs feel like farming instead of playing.

**Why It Matters:** This affects the entire retention curve. Frontloading may hook players but trivialize mid-game. Removal may alienate players who need long-term goals. Into the Breach succeeds with minimal meta-progression; Hades succeeds with heavy meta-progression. Both are valid.

**Unresolved?** Yes - Economy Designer must choose one philosophy before tuning can begin.

---

### Debate 4: Manual Attack vs. Streamlined Auto-Attack
**The Tension:** Does player agency require explicit confirmation, or is that just friction?

**Side A:** Combat Designer wants a manual attack button after vocab. This creates a "moment of truth" where players see their damage preview and commit to the attack. Balatro's "play hand" button creates similar anticipation.

**Side B:** UX Specialist wants optimized auto-attack. Every unnecessary click compounds across thousands of encounters. Dead Cells and Into the Breach resolve actions instantly once initiated.

**Why It Matters:** This is a fundamental interaction design philosophy clash. "Agency through confirmation" vs. "respect through speed." The game currently lands in an awkward middle (auto-attack with slow delays).

**Unresolved?** Partially - Option B (faster auto-attack) is lower risk and addresses the pacing complaint without the complexity increase.

---

### Debate 5: Educational Tool vs. Game
**The Tension:** Is NEO TOKYO a game that teaches Japanese, or a Japanese learning tool with game elements?

**Side A:** Mobile Expert (tentatively) and retention-focused thinking want daily login rewards, streak mechanics, habit formation hooks. These are proven retention tools.

**Side B:** Player Psychologist and the educational mission argue these mechanics are manipulative, especially for a learning tool. "Dark patterns in education" is a reputational risk.

**Why It Matters:** This affects not just daily hooks but the entire design philosophy. Duolingo uses aggressive retention mechanics and faces constant criticism for it. The game must decide if it's competing with Duolingo (retain at all costs) or offering an alternative (respect player time).

**Unresolved?** Yes - requires explicit product positioning decision beyond the scope of gameplay mechanics.

---

## Research Appendix

### Sources by Agent

**Combat Designer:**
- Balatro scoring animation system (particle effects, chip contribution breakdown)
- Slay the Spire card animation timing and power/relic tracking UI
- Dead Cells attack animation frame data (100-200ms per attack)

**UX Specialist:**
- Slay the Spire settings (animation speed options)
- Mobile UX research on session interruption tolerance
- Dead Cells and Into the Breach action resolution timing

**Playtester Advocate:**
- First-time player observation notes (skill charge visibility gap)
- Slay the Spire and Into the Breach tutorial flow analysis
- Time-on-task metrics for vocab answer → damage resolution

**Economy/Progression Designer:**
- Hades meta-progression curve (Titan Blood, Diamonds, Nectar timing)
- Slay the Spire card unlock rate (frontloaded early, slows mid-game)
- Into the Breach squad unlock structure (achievement-based, not grind-based)

**Player Psychologist:**
- Cognitive load research on simultaneous system introduction
- Tutorial design patterns from Slay the Spire Act 1, Into the Breach Island 1
- Duolingo Stories integration model

**Mobile/Retention Expert:**
- Dead Cells checkpoint save system (between biomes)
- Hades death-save system
- Duolingo streak and daily engagement mechanics
- Mobile session length research (median 5-10 min per session)

**Systems Designer:**
- Chip pool analysis (32 chips, 5 archetypes, "stat stick" identification)
- Into the Breach roster design (8 mechs × 2 weapons = focused pool)
- Slay the Spire card pool size (75+ per class)

**Roguelike Specialist:**
- Slay the Spire Act structure and relic ecosystem
- Hades optional encounter design (Thanatos, Sisyphus, etc.)
- Into the Breach squad synergy depth with minimal card pool

**Competitive Analyst:**
- Slay the Spire Daily Climb format
- Balatro deck size variants
- Speedrun community feedback on pacing friction

---

## Codebase Files Analyzed

- `/docs/ARCHITECTURE.md` - Game architecture and system documentation
- `/data/chips.json` - All 32 chip definitions with stats, effects, skills, archetypes
- `/data/chip-config.json` - Archetype definitions and rarity configuration
- `/data/enemies.json` - Enemy definitions organized by tier
- `/src/game/items/chips.js` - Chip pipeline execution system
- `/src/game/combat/mechanics.js` - Simplified combat formulas
- `/src/game/state.js` - Meta-progression upgrade costs and essence calculations
- `/src/game/rooms.js` - Ward system and room generation
- `/src/game/enemies.js` - Intent patterns and enemy AI
- `/public/js/ui/combat-loop.js` - Combat animation timing and chip activation sequences

---

## Run Metadata
- **Agents completed:** 10/10
- **Debates held:** 3 clusters (Combat, Progression, Systems)
- **Total research sources:** ~25 distinct references
- **Codebase files analyzed:** 15+

---

*Report synthesized from Combat Cluster, Progression Cluster, and Systems Cluster debate outputs. Tensions preserved intentionally - resolution requires stakeholder decision-making, not consensus-smoothing.*
