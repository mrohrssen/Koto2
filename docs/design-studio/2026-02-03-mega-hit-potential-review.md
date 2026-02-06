# Game Design Studio Report: Mega Hit Potential Review

**Generated:** 2026-02-03
**Focus:** Comprehensive Review - Does NEO TOKYO have mega hit potential like Pokemon?
**Comparison Games:** Pokemon, Balatro, Slay the Spire, Hades

## Executive Summary

NEO TOKYO: System Liberation has **the bones of a megahit** but is currently designed for the wrong player. The game possesses a genuinely unique value proposition (vocabulary learning RPG), solid technical architecture (5-slot chip pipeline with 27+ effect types), and proven genre foundation (roguelike deck-builder). However, it suffers from a critical identity crisis: every system optimizes for the 5% of players who stay past hour one, while ignoring the 95% who bounce.

Pokemon's dominance came from a ten-year-old playing the first route without confusion. NEO TOKYO currently violates this test by introducing five simultaneous systems at entry (chips + Power/Bandwidth formula + loadouts + vocabulary + wards), hiding critical damage math that makes decisions feel random, and forcing dual-load cognitive fracture (vocabulary lookup during combat) that industry research explicitly warns against.

The path to mega-hit status exists but requires fundamental reorientation: **onboard the curious player first, then reveal depth**. The specialists have identified 9 critical decisions across combat, progression, and systems design. The verdict: NEO TOKYO can become a mega hit, but only if it learns from Pokemon's playbook—accessibility doesn't mean shallow, it means intentional scaffolding.

## The Verdict: Mega Hit Potential Assessment

**Current Trajectory: 6/10** (Solid indie hit potential, NOT mega-hit ready)

**What's Working:**
- Unique differentiation (vocabulary learning + roguelike) that no competitor owns
- Strong technical foundation with chip pipeline system enabling emergent complexity
- Proven genre framework (Balatro, Slay the Spire, Hades) with vocabulary twist
- Excellent mobile UI foundations (viewport handling, touch targets, gestures)
- Intrinsic motivation architecture (vocabulary mastery = combat power)

**What's Holding It Back:**
- 95% bounce rate risk from cognitive explosion at entry (5 simultaneous systems)
- Hidden skill ceiling punishes exploration (damage math never taught)
- Vocabulary integration timing fractures attention during critical onboarding window
- Zero daily retention hooks or session flexibility for mobile players
- Under-utilized replayability infrastructure (fixed ward topology, no difficulty selection)

**Mega-Hit Requirement Gap:**
Pokemon succeeded because complexity was gated: catch/battle/evolve introduced sequentially over 10 hours. NEO TOKYO dumps everything in hour one. Balatro succeeded through streaming appeal—visible combo multipliers creating highlight moments. NEO TOKYO buries spectacle behind opaque math. The game needs to trust scaffolding over sink-or-swim design.

---

## Key Decisions

### Decision 1: Information Transparency vs. Emergent Tension
**The Question:** Should enemy intent be visible during chip planning, or hidden until after commitment to create uncertainty?

**Recommendation:** Maintain full intent visibility for launch, add optional "Hidden Intent Mode" post-release for mastery players.

**Evidence:**
- Balatro's hidden score preview creates drama through uncertainty, forcing faster intuitive decisions [combat-position.md:12]
- However, new players need predictability to build trust during onboarding; cognitive load is already high with chip combos + vocabulary system [ux-position.md implied]
- Industry research on mobile onboarding mandates progressive introduction, not information removal [playtester-position.md:9]

**Dissent:**
Combat Designer argues consensus "overvalues deterministic predictability"—players pattern-match faster than designers expect, and visible intent flattens engagement by removing learning reward cycles. "Obscured information ≠ unfair; it's interactive difficulty" [combat-position.md:22-24].

Playtester Advocate counters that hiding intent adds unintentional friction for 95% of players who bounce early, punishing exploration during the critical first-hour retention window.

**Implementation Notes:** Launch with visible intent. Post-launch, add "Hardcore Mode" that hides intent for experienced players seeking challenge. This preserves accessibility while rewarding mastery progression.

---

### Decision 2: Feedback Saturation vs. Coherence
**The Question:** Should we amplify feedback quantity (more particles, audio layers, faster animations) or prioritize synchronization and timing coherence?

**Recommendation:** Prioritize audio implementation + timing sync over particle saturation. Quality over quantity.

**Evidence:**
- Audio feedback adds 40% impact perception alone; multi-sensory confirmation (visual+audio) helps players parse actions faster [ux-position.md:9, 17]
- Sub-200ms timing prevents blur and maintains cause-effect chain that builds user trust [ux-position.md:19]
- However, incoherent feedback creates sensory overload; a single perfectly-timed audio spike + flash outperforms 40 unsynced particles [ux-position.md:28-30]

**Dissent:**
Combat Designer warns "more particles and audio will distract from readability." UX Specialist counters that research shows layered feedback increases clarity because multi-sensory coherence improves comprehension.

UX Specialist's own self-critique: "The real lever isn't quantity—it's synchronization across channels." The risk is adding audio/particles without pruning overlapping effects, creating chaos instead of crunch.

**Implementation Notes:** Phase 1: Implement audio library (4 hours work, 40% impact boost). Phase 2: Sync visual timing to sub-200ms. Phase 3: Prune overlapping effects. Do NOT increase particle counts until sync is proven.

---

### Decision 3: Progressive Complexity vs. Front-Loaded Depth
**The Question:** Should chip mechanics be gated and introduced gradually, or trust players to explore the full 30+ chip system from the start?

**Recommendation:** Staged chip introduction—start with 3 chips, unlock full shop by encounter 5. Gate vocabulary until first boss win.

**Evidence:**
- Five simultaneous systems violate industry standard of ONE mechanic per tutorial beat [playtester-position.md:9]
- Mobile onboarding research mandates graduated introduction to prevent 95% bounce rate [playtester-research.md:10]
- First encounter should use only common chips (Attack, Defend, Heal) with no recursion, sacrifice, or cooldown mechanics [playtester-position.md:19]
- Gate vocabulary lookup until first boss win to prevent "dual-load cognitive fracture" [playtester-position.md:21]

**Dissent:**
Combat Designer's proposals assume full system access, arguing conditional chip triggers that respond to enemy intent create tactical micro-decisions rewarding pattern recognition—parallel to kanji learning. Depth amplifies attention rather than conflicting with learning [combat-position.md:14, 25].

Playtester Advocate warns: "We're designing for the engaged player, not the curious one. Cognitive explosion at entry creates 95% bounce rate. Hidden skill ceiling in damage math punishes players for not reading wikis" [playtester-position.md:8-13, 33-35].

**Implementation Notes:** This is the most critical decision for mega-hit potential. Pokemon gates complexity over 40 hours; NEO TOKYO must learn this lesson. Speedrunners can skip tutorial; newcomers need scaffolding.

---

### Decision 4: Damage Calculation Transparency
**The Question:** Should players see precise damage calculations before executing attacks, or should mastery emerge through trial-and-error?

**Recommendation:** Implement "Combo Preview Mode" showing power pool, bandwidth consumption, and final multiplier before turn execution.

**Evidence:**
- Balatro's visible combo multipliers drive 40% of highlight clips; accessibility drives market success [competitive-position.md:9]
- Transparency shifts difficulty from opacity to decision-making under complete information—knowing a combo outputs 5x damage still requires choosing optimal chip slots [competitive-position.md:26]
- Hidden damage math creates unintentional friction; players learn only after grinding 10 failed runs, not through elegant design [playtester-position.md:14]

**Dissent:**
Roguelike Specialist (anticipated): "Damage prediction breaks the 'skill discovery' fantasy—players should learn through failure, not preview." Slay the Spire's initial runs reward experimentation; mastery emerges from understanding hidden synergies [systems-position-debate:10].

Competitive Analyst counters: Balatro proves visibility doesn't eliminate depth; it shifts difficulty to strategic choice under transparency. The spectacle becomes streamable content, not buried math [competitive-position.md:17].

**Implementation Notes:** Implement as optional toggle (default ON for new players, OFF for hardcore players). Streaming appeal requires visible combos—this is non-negotiable for Twitch/YouTube virality.

---

### Decision 5: Vocabulary Integration Depth
**The Question:** Should vocabulary learning be optional flavor or mandatory progression gating?

**Recommendation:** Soft incentives with explicit achievement callouts, NOT hard gates. Hybrid approach.

**Evidence:**
- Market differentiation requires authentic integration; "learning RPG" that doesn't require learning is just a roguelike [competitive-position.md:11]
- Competitive Analyst's radical proposal: tie chip rarity unlocks to JPDB mastery milestones (unlock 5-star chips after 50 words) to make vocabulary an optimization axis [competitive-position.md:19]
- However, Systems Designer emphasizes "emergent discussion" and player agency over coercion—weighted shop distributions could feel patronizing [systems-position.md:31]

**Dissent:**
Competitive Analyst: "Vocabulary learning shouldn't be balanced with combat balance. Our market advantage evaporates if players skip Word Discovery rooms. Make vocabulary unlocks mandatory" [competitive-position.md:33].

Systems Designer counters: preserve player choice through "archetype compatibility hints" rather than hard weighting. Philosophy: agency requires emergence over enforcement [systems-position.md:23].

Psychology research shows intrinsic motivation beats extrinsic optimization. Vocabulary mastery itself is the win state, not combat progression [psychology-position.md:34].

**Implementation Notes:** Gate vocabulary during first 3 runs (prevent cognitive fracture). Post-first-boss, add explicit achievement callouts: "掌握 learned! +1.2x comprehension bonus." Display mastery dashboard: "Word Mastery: 500/2000 unlocked (25%)." Do NOT hard-gate chip unlocks—this narrows audience without pedagogical benefit.

---

### Decision 6: Prestige System vs. Infinite Grinding
**The Question:** How do we handle endgame soft-cap (maxed essence upgrades) to sustain 100+ run retention?

**Recommendation:** Seasonal cosmetic prestige (optional) over mechanical prestige loops.

**Evidence:**
- Meta-progression research shows prestige systems sustain long-tail engagement when core progression maxes [economy-position.md:21]
- Psychology research shows optional reset mechanics sustain engagement when framed as novelty/achievement—every 50 runs, offer badge + harder enemy tiers without mandatory essence loss [psychology-position.md:24]
- Intrinsic motivation research prioritizes competence satisfaction over extrinsic optimization [psychology-position.md:10]

**Dissent:**
Economy Designer wants mechanical prestige (essence multipliers creating new optimization meta): "transforms soft-cap into new ladder with +5% Essence multiplier per reset" [progression-debate:7].

Player Psychologist wants psychological prestige (cosmetic badges, optional challenges), arguing intrinsic motivation beats extrinsic optimization. "Make it optional" [progression-debate:8].

Neither agent addresses whether prestige is pedagogically sound for vocabulary learning [progression-debate:13].

**Implementation Notes:** Vocabulary learning games have natural completion curves—some players should finish. Offer optional seasonal badges + harder enemy tiers for 300+ run players without punishing completionists.

---

### Decision 7: Session Length vs. Depth
**The Question:** Should we restructure progression to support 5-10 minute sessions, or keep 15-30 minute ward runs as the core loop?

**Recommendation:** Implement checkpoint system + daily hooks while maintaining ward depth. Enable both play styles.

**Evidence:**
- Optimal mobile sessions are 2-10 minutes; checkpoints enable interrupted play without abandonment [mobile-position.md:9, 19]
- However, flow state requires immersion—breaking at checkpoints disrupts psychological momentum [progression-debate:22]
- Cumulative play time (5 × 8-min sessions = 40 min) beats abandoned 30-min sessions (15 min actual play) [mobile-position.md:27]

**Dissent:**
Mobile Expert argues fragmented sessions prevent abandonment and create natural spaced repetition for vocabulary learning [mobile-position.md:6, 19].

Player Psychologist counters that flow state requires continuous challenge-skill balance; checkpoints break immersion. Engagement comes from satisfying sessions, not fragmented ones [progression-debate:22].

**Unresolved Tension:** Is vocabulary learning better served by deep immersion (continuous exposure across 30-min arc) or spaced micro-sessions (5-min bursts with breaks creating natural spaced repetition)? Psychology research supports both [progression-debate:26].

**Implementation Notes:** Save mid-ward after shrines/quiz rooms via "Continue Run" button. Add "Quick Run" preset (3-floor easy enemies, 5-8 min). Preserve 15-30 min ward depth for immersion players. Both, not either/or.

---

### Decision 8: Reward Timing—Hourly Spikes vs. Implicit Mastery
**The Question:** When should players receive progression feedback? Frequent dopamine hits (per-boss essence) or implicit mastery rewards (end-of-run totals)?

**Recommendation:** Explicit linguistic achievements (vocabulary mastery) over extrinsic currency spikes alone. Prioritize intrinsic rewards.

**Evidence:**
- Economy research shows frequent reward pulses sustain engagement longer than bulk distributions—per-boss essence bonuses create hourly dopamine spikes [economy-position.md:17]
- However, intrinsic feedback loops require explicit acknowledgment: add in-run callouts like "掌握 learned! +1.2x comprehension bonus" to connect language mastery to combat success [psychology-position.md:20]
- Vocabulary mastery drives power implicitly; players don't consciously link understanding Japanese to defeating enemies without UI celebration [psychology-position.md:12]

**Dissent:**
Economy Designer wants extrinsic currency spikes (essence bonuses, achievement discounts), arguing dopamine consistency drives retention [progression-debate:40].

Player Psychologist wants intrinsic mastery celebration (vocabulary comprehension callouts), arguing sustainable engagement beats manipulation [progression-debate:41].

**Critical Disagreement:** Economy says "players don't feel progression momentum early enough." Psychology says "vocabulary mastery is the win state, not combat progression." Both identify a feedback gap but disagree on the fix [progression-debate:40-42].

**Implementation Notes:** Do both without UI clutter—per-boss essence (extrinsic), linguistic achievement pop-ups (intrinsic), mastery dashboard in hub (competence visualization). Priority: intrinsic first (aligns with educational goal), extrinsic second (sustains retention).

---

### Decision 9: Replayability Variability—Route Branching vs. Converging Narratives
**The Question:** Should ward progression maintain multiple viable endgame routes or converge toward a single palace climax?

**Recommendation:** Expand routing to maintain 2-3 viable paths through tier 5+ instead of collapsing to palace by tier 3.

**Evidence:**
- Route variability distinguishes roguelikes from linear RPGs; Slay the Spire's act branching sustains replayability [roguelike-position.md:17]
- Fixed endgame by tier 3 eliminates perceived agency after turn one—genre purity requires route tension [roguelike-position.md:27]
- Ward topology under-utilizes existing routing infrastructure [systems-debate:42]

**Dissent:**
Competitive Analyst (anticipated objection): "Converging paths create thematic coherence—everyone marches to the palace. Branching dilutes narrative focus" [systems-debate:48].

Roguelike Specialist rebuttal: "Route convergence at the palace remains thematic; getting there via shrine-heavy vs. combat-heavy paths isn't narratively diluting—it's replayability" [systems-debate:49].

**Unresolved Tension:** Mechanical variety (roguelike genre convention) vs. narrative coherence (thematic design intent). Systems Designer didn't address topology directly, suggesting this is design philosophy gap rather than technical constraint [systems-debate:51].

**Implementation Notes:** Expand getNextWardOptions() to maintain branching through tier 5. Route convergence at palace finale preserves narrative coherence; path variety enhances replayability. Hades proves thematic focus survives mechanical variety.

---

## Heated Debates (Top 5)

The most contentious discussions where specialists strongly disagreed:

### 1. Vocabulary Integration: Flavor vs. Gate
**Competitive Analyst** argued vocabulary must be hard-gated to progression: "Our market advantage evaporates if players skip Word Discovery rooms. Make vocabulary unlocks mandatory for chip rarity." **Systems Designer** and **Player Psychologist** countered that coercion betrays player agency and sustainable intrinsic motivation: "Vocabulary learning itself is the win state, not a means to combat progression."

Tension remains because no one has reconciled market differentiation (vocabulary must matter) with pedagogical design (forced learning creates resentment). The synthesis—explicit achievement callouts without hard gates—attempts middle ground but may satisfy neither camp.

---

### 2. New Player Onboarding vs. Mastery-Driven Engagement
**Combat Designer** optimizes for learned skill progression (hidden intent, conditional triggers escalating complexity, full chip access from start). **Playtester Advocate** optimizes for first-hour retention (staged chip introduction, separated vocabulary concerns, transparent damage math): "We're designing for the engaged player, not the curious one. 95% bounce rate from cognitive explosion."

These aren't reconcilable through compromise—one philosophy must dominate. Combat Designer frames complexity as depth amplification; Playtester frames it as unintentional friction. The decision to gate chips validates Playtester's position, but Combat Designer's warning remains: "removing complexity might flatten the engagement curve that rewards mastery."

---

### 3. Damage Transparency: Discovery Fantasy vs. Streaming Appeal
**Roguelike Specialist** (implicit position) argues damage prediction breaks skill discovery fantasy—players should learn through failure, not preview. Slay the Spire's mastery emerges from understanding hidden synergies through repeated play. **Competitive Analyst** counters that Balatro proves visibility doesn't eliminate depth; it shifts difficulty to decision-making under transparency and creates streaming moments (40% of highlight clips).

Philosophical divide: Is hidden information "interactive difficulty" or unintentional opacity? Market data favors transparency for accessibility + virality. Genre purity favors discovery through failure. The optional toggle attempts compromise but may feel like design indecision.

---

### 4. Session Architecture: Immersion vs. Micro-Sessions
**Mobile Expert** argues cumulative play time from fragmented sessions beats abandoned long runs: "5 × 8-min sessions = 40 min total outperforms 15 min actual play from abandoned 30-min session." Checkpoints prevent abandonment and create natural spaced repetition. **Player Psychologist** counters that flow state requires continuous challenge-skill balance; checkpoints break immersion that drives satisfaction.

Unresolved: Is vocabulary learning better served by deep immersion or spaced micro-bursts? Psychology research supports both—immersion for flow, fragmentation for memory consolidation. No consensus exists, and the "do both" recommendation may dilute focus.

---

### 5. Prestige Philosophy: Mechanical vs. Psychological
**Economy Designer** wants mechanical prestige (essence multipliers creating new optimization meta): "transforms soft-cap into new ladder." **Player Psychologist** wants psychological prestige (cosmetic badges, optional challenges): "intrinsic motivation beats extrinsic optimization."

Critical gap: Neither addresses whether prestige is pedagogically sound for vocabulary learning. Economy optimizes for "one more run," Psychology for "sustained engagement," but no one argues "this makes players learn more Japanese." The educational goal—the game's unique differentiator—gets lost in retention mechanics debate.

---

## What Pokemon Does That This Game Doesn't (Yet)

### 1. Intentional Complexity Gating
Pokemon introduces mechanics sequentially over 40+ hours:
- **Hour 1:** Catch, battle (4 moves max), type advantage
- **Hour 5:** Evolution, status effects
- **Hour 10:** Breeding, IVs/EVs (hidden from casual players)
- **Hour 40+:** Competitive meta, shiny hunting

NEO TOKYO dumps everything in hour one: 30+ chips, Power/Bandwidth formula, loadouts, vocabulary lookup, ward topology. Industry research is unambiguous—this creates 95% bounce rate.

**Gap:** No tutorial progression system. First encounter should use 3 chips (Attack, Defend, Heal) only.

---

### 2. Hidden Complexity That Doesn't Punish Exploration
Pokemon's damage formula is opaque, but players never feel punished for not understanding it. Type advantage (super effective!) provides instant feedback. Casual players beat the game without knowing IVs exist.

NEO TOKYO's damage math (Power × (1 + Bandwidth)) is hidden AND punishes ignorance—players don't understand why Feather in slot 4 outperforms slot 1. Clock's 7% recursion restart, Charcoal's self-sacrifice, Ice Cream's degradation are never explained.

**Gap:** Hidden skill ceiling without scaffolding. Add tutorial narration: "Power (20) × (1 + Bandwidth 0.5) = 30 damage."

---

### 3. Intrinsic Reward Celebration
Pokemon explicitly celebrates progress: level-up fanfare, evolution animations, Pokédex completion percentages. Players consciously connect "I caught 50 Pokemon" to "I'm progressing."

NEO TOKYO's vocabulary mastery drives power implicitly—players may not consciously link understanding Japanese to defeating enemies. No UI celebrates "掌握 learned!" or displays "Word Mastery: 500/2000 (25%)."

**Gap:** Vocabulary learning feedback loop is invisible. Add achievement callouts + hub dashboard.

---

### 4. Accessibility Without Shallow Depth
Pokemon's "easy to learn, impossible to master" philosophy allows:
- **Casual players:** Beat game with starter Pokemon, never use held items
- **Hardcore players:** IV breeding, EV training, competitive singles/doubles

Both audiences coexist because complexity is opt-in, not front-loaded.

NEO TOKYO forces complexity uniformly. Damage transparency toggle and chip gating attempt this but need aggressive execution.

**Gap:** No difficulty selection or complexity opt-in. Add "Hardcore Mode" for mastery players post-launch.

---

### 5. Social/Competitive Framework
Pokemon's trading, battling, and leaderboards create social relatedness (self-determination theory's third pillar). Even single-player Pokemon implies multiplayer through NPC trainers.

NEO TOKYO has leaderboard UI but it's invisible during play. No daily/weekly rankings, no social hooks, no comparison-based engagement.

**Gap:** Leaderboard exists but isn't surfaced. Add leaderboard glimpses on pause menu; requires zero server changes.

---

### 6. Habit Formation Without Manipulation
Pokemon's "play 5 minutes or 5 hours" session flexibility accommodates all schedules. Mobile games add daily login streaks; Pokemon succeeds through intrinsic pull alone.

NEO TOKYO's 15-30 minute ward runs exceed mobile sweet spot (2-10 min) by 2-3x. Zero daily hooks, zero session flexibility.

**Gap:** Session architecture mismatch. Implement checkpoints + Quick Run preset (3-floor, 5-8 min).

---

## Conclusion: The Path to Mega-Hit Status

NEO TOKYO has genuine mega-hit DNA:
- **Unique differentiation** no competitor owns (vocabulary learning × roguelike)
- **Proven technical foundation** (chip pipeline, adaptive JPDB difficulty)
- **Strong genre framework** (Balatro, Slay the Spire, Hades) with educational twist

But it's currently designed for the wrong player. The game optimizes for the 5% who stay past hour one while ignoring the 95% who bounce. Pokemon's dominance came from accessibility with hidden depth. NEO TOKYO inverts this—complexity without scaffolding.

**The 3 Critical Pivots:**

1. **Onboarding Overhaul (Blocker):** Gate chips to 3 at start, unlock full shop by encounter 5. Gate vocabulary until first boss win. Add damage math tutorials. This is non-negotiable—cognitive explosion kills retention.

2. **Feedback Loop Visibility (Force Multiplier):** Implement combo preview mode (streaming appeal), audio feedback (40% impact boost), linguistic achievement callouts (intrinsic motivation). Players must see cause-effect chains within 100ms.

3. **Session Flexibility (Market Expansion):** Add checkpoint system + Quick Run preset. Enable 5-minute micro-sessions and 30-minute deep runs. Mobile market demands this; current 15-30 min mandate excludes commute players.

**Timeline to Mega-Hit:**
- **Phase 1 (1 month):** Onboarding redesign + damage transparency + audio feedback
- **Phase 2 (2 months):** Checkpoint system + linguistic achievements + daily hooks
- **Phase 3 (post-launch):** Difficulty selection + prestige system + route branching

**Final Verdict:** NEO TOKYO can become a mega hit, but only if it learns Pokemon's lesson—**accessibility is not the enemy of depth; it's the gateway**. Gate complexity, scaffold learning, celebrate mastery explicitly. The curious player is worth 1,000 speedrunners.

The game's current trajectory leads to "solid indie hit" (10-50K players). The recommended pivots unlock "mega-hit potential" (1M+ players). The difference is respecting the 95% who quit before discovering the depth the 5% celebrate.

---

## Run Metadata
- **Specialists completed:** 9/9 (Combat Designer, Systems Designer, Economy Designer, UX Specialist, Competitive Analyst, Player Psychologist, Playtester Advocate, Mobile Expert, Roguelike Specialist)
- **Clusters completed:** 3/3 (Combat, Progression, Systems)
- **Debate outputs reviewed:** 3 cluster debates covering 9 key decisions
- **Position papers reviewed:** 9 specialist positions with cross-referenced evidence

---

## Appendix: Sources

### Combat Cluster Sources
- **Balatro's Design Problem** (GMTK): Hidden information creates drama through uncertainty [combat-position.md:12]
- **Metaphor: ReFantazio GDC 2025** (Kenichi Goto): Progressive scaling maintains strategic relevance [combat-position.md:8]
- **Game Juicing Research** (GameAnalytics): Multi-sensory feedback creates exponential satisfaction gains [ux-position.md:7]
- **Sub-100ms Response Research** (ux-analysis.md): Real-time confirmation builds user trust [ux-position.md:8]

### Progression Cluster Sources
- **Core Loop Simplification** (Yodo1): Reinvestment loops drive retention through immediate power returns [economy-position.md:9]
- **Compulsion Loops Research** (Stash): Milestone velocity outperforms lump sum distributions [economy-position.md:11]
- **Meta-Progression in Roguelikes** (Hamatti): Prestige systems unlock when core progression maxes [economy-position.md:21]
- **Self-Determination Theory** (Ryan & Deci): Intrinsic motivation (autonomy, competence, relatedness) beats extrinsic rewards [psychology-position.md:10]
- **Flow State Theory** (Csikszentmihalyi): Challenge-skill balance sustains engagement [psychology-position.md:8]

### Systems Cluster Sources
- **Balatro Streaming Analysis** (Stream Hatchet): Visible combo multipliers drive 40% of highlight clips [competitive-position.md:9]
- **Roguelike Design Elements** (Envato Tuts+): Agency within randomness is non-negotiable [roguelike-position.md:9]
- **Hades Meta-Progression** (Supergiant): Essence unlocks sustain motivation across failures [roguelike-position.md:11]
- **Slay the Spire Ascension System**: Difficulty scaling intensifies meta-progression stakes [roguelike-position.md:11]

### Onboarding/Mobile Sources
- **Mobile Session Optimization** (mobile-research.md): 2-10 minute sessions hit top 25% engagement [mobile-position.md:9]
- **Mobile Onboarding Research** (playtester-research.md): ONE mechanic per tutorial beat prevents cognitive overload [playtester-position.md:9]
- **Attention Fragmentation Research** (playtester-analysis.md): Dual-load (vocabulary + combat) creates retention collapse [playtester-position.md:16]
- **Daily Login Streak Research** (mobile-research.md): Escalating rewards drive habit formation without exploitation [mobile-position.md:13]

### Industry Comparative Analysis
- **LocalThunk Post-Launch Iteration** (Balatro timeline): Player-first feedback post-release defines winners [competitive-position.md:13]
- **Pokemon Complexity Gating**: Sequential introduction (catch → battle → evolve → breed) over 40+ hours
- **Hades Thematic Coherence**: Narrative focus survives mechanical variety (weapons, boons, mirror) [systems-debate:44]
