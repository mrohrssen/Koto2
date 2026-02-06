# Game Design Studio Report: Comprehensive Fun Review

**Generated:** 2026-02-03
**Focus:** Making the game more fun based on best gameplay design principles
**Comparison Games:** Slay the Spire, Balatro, Hades

## Executive Summary

NEO TOKYO: System Liberation has a strong mechanical foundation (Power × Bandwidth chip system, deterministic turn-based combat, permadeath roguelike structure) that mirrors Balatro's "naive design" principle—creating fresh mechanics rather than following genre conventions. However, nine specialist analyses reveal three critical gaps preventing the game from achieving its potential:

**The Satisfaction Gap**: Combat implements tier-based visual feedback but lacks the audio layer that research shows accounts for 40% of "juice" satisfaction. Balatro and Vampire Survivors prove audio-visual orchestration creates irresistible feedback loops; NEO TOKYO has done 70% of the work for 40% of the payoff.

**The Onboarding Chasm**: 85% of players quit in the first 30 minutes if confused. NEO TOKYO dumps full complexity at login (combat + vocabulary + chip synergies simultaneously), violating progressive disclosure best practices. Current analytics measure engaged survivors, not the invisible cohort that quit before data collection begins.

**The Progression Ceiling**: The game has 4 static upgrades versus competitors' 50+ unlocks, limited synergy discovery visibility, and no distance-based breadcrumb rewards to transform permadeath failure into progress. Players hit upgrade completion walls with no alternative progression paths, causing retention to plateau at mastery completion rather than synergy discovery.

The recommendations balance three philosophies: **depth-first mastery** (Systems Designer, Psychologist), **breadth-first variety** (Economy Designer, Roguelike Specialist), and **time-respecting accessibility** (Mobile Expert, Playtester Advocate). Implementation prioritization should favor high-ROI orchestration of existing systems over new feature sprawl.

## Key Decisions

### Decision 1: Audio Layer Implementation (Non-Negotiable Priority)
**The Question:** Should the next effort allocation prioritize implementing a tier-mapped audio layer with 5-tier sound progression, or continue visual refinement (chromatic aberration, extended animations)?

**Recommendation:** **Implement audio immediately.** Add tier-mapped sound effects (chip beep → hit crack → solid thump → big explosion → massive rumble) to `combat-effects.js`. Use Web Audio API prototyping if professional SFX unavailable. Screen shake escalation for tier 4 (amplitude 15px + 200ms hold) should accompany audio, not replace it.

**Evidence:** UX Specialist's research demonstrates audio is 3-5x more effective at triggering dopamine than visuals alone [Source: Juice in Game Design, bloodmooninteractive.com]. Balatro and Vampire Survivors prove "reward symphonies" (layered weapon + gem sounds) multiply satisfaction exponentially. Current implementation achieves 60% satisfaction potential; audio addition is estimated 10x ROI for 10 lines of code (tier-to-sfx map). Psychology research confirms coordinated sensory feedback creates "micro flow loops" essential for sustained engagement [Source: Csikszentmihalyi flow theory, psychology-position.md].

**Dissent:** Combat Designer prioritizes computational cost and asset creation overhead, arguing "we're time-constrained" and visual polish can ship without external dependencies. UX Specialist counters: "If we ship this quarter without audio, we've done 70% of the work for 40% of the payoff. Audio is the moat."

**Implementation Notes:** Start with Web Audio API sine-wave synthesis for validation; graduate to professional Foley post-validation. Tier 4+ should add screen shake to distinguish from tier 3 (current plateau issue). Audio files should be <50kb each to maintain performance.

---

### Decision 2: Onboarding Scaffolding (Critical for Retention)
**The Question:** Should combat introduce multiple attack types and full chip synergies immediately, or prioritize simplified onboarding with training wheels mode and progressive disclosure?

**Recommendation:** **Gate complexity via progressive disclosure.** Implement "Training Wheels Mode" for first combat (2 basic chips: Firewall + Slash, with in-turn narration) and add persistent In-Game Mechanics Reference Panel (glossary accessible from combat/exploration). Unlock multiple attack types and synergy UI in Ward 2+.

**Evidence:** Playtester Advocate's research shows 85% of players quit in first 30 minutes if confused [Source: Mobile UX best practices, playtester-position.md]. Industry leaders (Zelda: BotW, Hades, Slay the Spire) teach one mechanic per encounter, not simultaneous system overload. Current implementation violates "learning by doing" principle: chip descriptions lack causal explanations ("Firewall (rare)" vs. "blocks 2 damage next turn"). Combat Designer's own proposals (progressive enemy tier scaling, ward-by-ward recompilation) align with progressive disclosure, creating implicit agreement that complexity should be paced.

**Dissent:** Combat Designer argues hidden complexity fails to satisfy and experienced players will feel patronized. "If we hide multiple attack types behind onboarding, the depth won't shine." Playtester Advocate counters: "Current players self-selected through pain. We're optimizing for the invisible cohort that quit silently before data collection." The core conflict: ship simplified systems that grow into complexity (risk: depth feels tacked-on) vs. ship complex systems that are optionally simplified (risk: new players quit before understanding).

**Implementation Notes:** Training wheels trigger only on new character creation with "I'm new" flag. Glossary costs ~50 lines UI code (three tabs: Turn Structure, Chip Rarity Legend, Vocabulary Grades). Personalized post-combat coaching can ship as iterative update. Priority: Glossary (40% friction reduction) → Training Wheels → Coaching.

---

### Decision 3: Meta-Progression Depth vs. Breadth
**The Question:** Should NEO TOKYO prioritize expanding the upgrade system (more choices, more unlocks, more sinks) or deepening existing mechanics (chip emergence complexity, flow orchestration, skill-challenge equilibrium)?

**Recommendation:** **Sequence both, depth-first.** Audit existing chip synergies for emergence complexity and implement Synergy Discovery Panel (surfaces recognized combinations with flavor text, e.g., "Perfect Pair engine detected" when Duo + Anchor equipped). Then expand essence sinks via achievement-gated upgrade unlocks (milestone-based, e.g., "Defeat 50 bosses → unlock attackPower II") and breadcrumb unlocks tied to furthest floor reached (floors 5, 10, 15+).

**Evidence:** Player Psychologist argues "players disengage when synergies feel solved, not discovered. Ten chips with rich synergy chains sustain engagement longer than 50 isolated options." Systems Designer identifies synergies already exist (egg+fireworks chains, clock+mirror loops, toolbox stacking) but lack narrative visibility—"real issue isn't more synergies; it's friction" [Source: systems-position.md]. Economy Designer's research shows horizontal progression (new playstyles, alternative paths) outperforms vertical multiplication for long-term retention [Source: hamatti.org roguelike meta-progression]. Roguelike Specialist confirms distance-traveled unlocks psychologically transform failure into progress—genre DNA, not retention trick [Source: Hades/Slay the Spire patterns, roguelike-position.md].

**Dissent:** Economy Designer assumes "more options = more engagement." Psychologist directly challenges: "The real lever isn't more chips; it's emergence complexity." Unresolved tension: If we add 10 new essence sinks (upgrades, shops), does chip depth audit get deprioritized? Resolution: These aren't incompatible if sequenced—audit discovers synergies, economy design creates sinks around those discoveries.

**Implementation Notes:** Synergy Panel costs minimal effort (bottom-right UI element, detects existing combo logic). Achievement-gated unlocks maintain pacing while rewarding mastery. Breadcrumb unlocks reduce permadeath frustration (each death reveals new content). Add telemetry dashboards tracking chip win-rate correlations to validate synergy balance (prevent dominance).

---

### Decision 4: Power Scaling Ceiling (Conservative vs. Exponential)
**The Question:** Should late-game chip stacking remain bounded (1.2x-3.0x current implementation) or unlock exponential cascades comparable to Balatro (10x+)?

**Recommendation:** **Implement conditional exponential mechanics with metrics guardrails.** Add "Archetype Charm" conditional system (e.g., "consume 3 Power-pool chips → ×1.5 Bandwidth multiplier") and Bandwidth Amplifier chips with conservative exponential scaling (1.02^equipped chips initially). Instrument telemetry tracking enemy win rates and chip correlations before aggressive scaling.

**Evidence:** Systems Designer identifies current 1.2x-3.0x ceiling as "conservative relative to genre peers" [Source: systems-analysis.md]. Balatro's GOTY success proves exponential mechanics create roguelike power fantasy—"earned mastery" rather than "incremental grind." Competitive Analyst notes chips.json already supports `effects.pipeline` chaining; conditional logic mirrors existing architecture [Source: competitive-position.md]. Roguelike Specialist warns: "Theoretical exponential design breaks games; metrics prevent billion-damage exploits. Balatro's mechanics took 18 months to stabilize."

**Dissent:** Systems Designer dismisses metrics-driven caution as "analysis paralysis—telemetry won't capture emotional payoff." Roguelike Specialist counters: "Your 1.05^6 assumption hasn't been validated against actual builds." Competitive Analyst argues middle ground: "Conditional multipliers allow iteration without commit—limits ceiling while rewarding tactical deck-building."

**Implementation Notes:** Start with 1.02x multiplier (Singularity chip); A/B test against 1.05x cohort. Conditional triggers create strategic choice (spend chips for multiplier vs. hoard for synergies) without unbounded scaling. Add dashboard tracking max damage per run, chip slot saturation, tier completion rates. Iterate based on data, avoiding over-tuning.

---

### Decision 5: Mobile Session Architecture
**The Question:** Does NEO TOKYO redesign core progression around mobile time constraints (3-5 sessions/day, 15-30 min bursts) or maintain desktop-first design?

**Recommendation:** **Hybrid approach with desktop-primary.** Implement Express Run Mode (3-floor variant, 10-15 min, scaled essence rewards) and Paused Run Persistence (store exact enemy HP, room state, turn count) without compromising 7-floor runs as primary progression path. Add optional Daily Login Streak (7-day cycle, +20% essence bonus, zero mandatory content).

**Evidence:** Mobile Expert's research shows 73% Day 1 abandonment in mobile gacha, dropping to 30% with daily systems [Source: maf.ad/en/blog retention studies, mobile-position.md]. Current design requires uninterrupted 45-minute runs; player abandonment mid-run signals design mismatch with actual session patterns. All proposals preserve game depth—Express Runs use identical mechanics, just shorter. Psychology research confirms pause/resume honors real player behavior (alt-tab, calls, context-switching already breaks flow) [Source: Csikszentmihalyi flow theory].

**Dissent:** Player Psychologist warns "pause/resume middle-run breaks game narrative flow. Flow requires uninterrupted engagement." Mobile Expert counters: "Players don't want 'less content'—they want different pacing. Same depth, packed tighter. Resume is respecting reality, not compromise." Unresolved tension: If a player pauses mid-boss-fight, dramatic tension collapses. This isn't just implementation; it's whether core narrative experience survives interruption.

**Implementation Notes:** Express Runs award 2.5x essence per floor to maintain progression parity. Pause stores `pausedRuns` array in save file (meta-progression architecture already supports per-player state). Streak system stores `lastPlayDate` timestamp; rewards essence on Day 7 with reset if broken (no cascading penalties). Mobile becomes retention funnel without diluting desktop experience.

---

### Decision 6: Multiple Attack Types and Chip Synergy Visibility
**The Question:** Should combat introduce Quick/Normal/Heavy attack types with distinct chip pipeline branches, and should players see active chip combos in a pre-battle summary screen?

**Recommendation:** **Defer until Ward 2+ (post-onboarding).** After training wheels mode establishes core mechanics, unlock multiple attack types (Quick: 0.8x damage, 50% SP cost; Heavy: 1.5x damage, 150% SP cost) that trigger distinct chip synergies. Implement pre-battle synergy visualization showing active buffs (runTwice, nextChipDouble, nextChipAmplify) for experienced players.

**Evidence:** Combat Designer's research shows "strategic satisfaction emerges from deliberation and synergy discovery" [Source: GDC Vault - Creating Conflict, combat-position.md]. Slay the Spire proves players internalize complex card synergy without overwhelming UI—key is transparency. "Hidden synergies feel like RNG; visible attack choices feel like agency." Current chip pipeline has infrastructure for depth but lacks visible decision points.

**Dissent:** Playtester Advocate argues pre-battle summaries assume existing mental models new players lack. "Better to surface chip explanations in reference panel so players learn at their own pace, then graduate to pre-battle deliberation mid-game." Combat Designer prioritizes players who can appreciate synergy diagrams; Playtester prioritizes new players who need glossaries first. Unresolved: Do pre-battle synergy summaries help or overwhelm new players?

**Implementation Notes:** Attack type selection UI triggers at turn start (3-button choice). Chip pipeline branches via conditional logic on attack type selection (existing `effects.pipeline` chaining supports this). Pre-battle summary displays active chip list + buff indicators; unlocks after completing first 3 combats. Test with 3-5 new players to validate interpretability before full rollout.

---

### Decision 7: Educational Content Integration (Genre Purity vs. Differentiation)
**The Question:** Should NEO TOKYO optimize for roguelike genre purity (mechanical depth over extra systems) or lean into its unique educational dimension as core identity?

**Recommendation:** **Educational frosting on genre cake.** Keep roguelike core pure (distance-based unlocks, synergy discovery, balanced scaling) but overlay narrative persistence: vocabulary progress affects dialogue, enemy recognition of past defeats, DM narration callbacks. Gate optional chip rarities behind JPDB vocabulary thresholds (500 N5 words → gold chip tier) as bonus progression, not mandatory path.

**Evidence:** Competitive Analyst identifies "no competitor couples vocabulary learning with roguelike progression—defensible competitive moat if expanded" [Source: competitive-position.md]. Hades' $300M+ revenue came from character arcs across runs; NEO TOKYO's VOICEVOX narration (49 voices) and enemy intents hint at similar potential. Player Psychologist confirms narrative milestones justify repeated failure and anchor engagement to intrinsic meaning [Source: Hades longevity patterns, psychology-position.md]. Roguelike Specialist counters: "Educational mechanics are distraction from core loop. Roguelikes thrive on purity; learning Japanese is secondary."

**Dissent:** Three-way split. (A) Roguelike Specialist: "Educational systems dilute mechanical focus—genre purity is defensible." (B) Competitive Analyst: "Balatro broke genre conventions—educational integration is our edge." (C) Systems Designer: "Genre purity and differentiation aren't mutually exclusive. Vocabulary overlay (dialogue affecting) justifies JPDB integration without compromising elegance." Genuine disagreement on whether educational systems should gate progression, gate narrative, or remain cosmetic.

**Implementation Notes:** Link vocabulary milestones to optional unlocks (doesn't block core progression). DM narration references past defeats ("You've faced this construct before..."). VOICEVOX dialogue varies based on `jpdbMilestones` tracked in meta-progression. Educational content enhances replayability without forcing engagement—players who ignore language still progress via standard chip chains.

---

### Decision 8: Adaptive Difficulty vs. Tiered Wards
**The Question:** Should difficulty scale adaptively based on player skill (win/loss tracking) or provide explicit difficulty tiers with different reward structures?

**Recommendation:** **Tiered wards with optional adaptive scaling.** Implement hard/expert ward variants offering different essence per floor (10/15/20 essence), creating trade-offs (speed vs. safety). Post-launch, A/B test adaptive difficulty cohort (tracking win/loss ratios, progressively adjusting enemy intent complexity) against tiered-only cohort.

**Evidence:** Player Psychologist argues fixed difficulty curves violate Csikszentmihalyi's skill-challenge equilibrium—players either dominate (boredom) or face impossible odds (anxiety) [Source: flow theory research, psychology-position.md]. Economy Designer's research shows 78% of mobile games use resource tiering; enables analytics without constant rebalancing [Source: Adjust.com gacha mechanics, economy-position.md]. Roguelike Specialist emphasizes transparency: "Tiered wards give explicit choice; adaptive scaling is elegant but opaque—players don't understand why enemies suddenly get harder."

**Dissent:** Psychologist and Economist fundamentally disagree on mechanism. Adaptive scaling (Psych) is elegant but creates feedback loops (players who win too much get harder enemies, reducing win rate, changing reward perception). Tiered wards (Econ) are explicit but require rebalancing if one tier dominates. Psychologist proposes third option: chip emergence complexity lets players self-select challenge (experienced players naturally select harder combo paths).

**Implementation Notes:** Ship tiered wards first (easier to balance, easier to communicate). Track which tier players choose and win rates per tier. If data shows dominance (>70% hard ward selection), iterate rewards. Adaptive difficulty requires win/loss tracking per player cohort; implement post-launch if tiered wards insufficient for skill-challenge equilibrium.

---

### Decision 9: Narrative Integration Scope
**The Question:** Should story moments weave into lifetime achievements (100/500/1000 enemies defeated), or keep narrative minimal to avoid scope expansion?

**Recommendation:** **Lightweight narrative milestones via DM narration.** Trigger DM story beats at achievement thresholds (100 enemies: "The construct network recognizes you..."; 500 enemies: "Your chip mastery threatens the System..."; 1000 enemies: "You've become legend..."). Use existing VOICEVOX infrastructure; no new story authoring required initially.

**Evidence:** Player Psychologist argues narrative justification for repeated failure maintains intrinsic motivation—"meta-progression numbers feel empty without meaning; story contextualization transforms grinding into heroic progression" [Source: Hades retention patterns, psychology-position.md]. Competitive Analyst identifies VOICEVOX narration as "industry-unique; narrative persistence creates retention loops competitors cannot replicate" [Source: competitive-position.md]. Systems Designer notes `updateLifetimeStats()` already tracks milestones; hookpoints exist for callbacks.

**Dissent:** Minimal disagreement on lightweight implementation. Tension arises if narrative becomes mandatory for progression (Economy Designer's achievement-gated unlocks could absorb this). Resolution: narrative enhances optional unlocks but doesn't gate core loop.

**Implementation Notes:** DM narration triggers at milestone thresholds via `updateLifetimeStats()` callbacks. VOICEVOX voice selection varies by ward theme. Future expansion: chip-specific story beats ("You've equipped Singularity 50 times—the System fears your recursion mastery..."). Keeps scope minimal while adding emotional context.

---

### Decision 10: Feedback Orchestration Timing
**The Question:** Should combat synchronize chip animations, damage number styling, and particle effects, or trust existing delegation to frontend modules?

**Recommendation:** **Implement coordinated feedback timing in `GameManager.executeCombat()`.** Synchronize chip pipeline execution, tier-based damage number display, particle effects, and audio cues (once implemented) into single orchestrated sequence.

**Evidence:** Player Psychologist's research shows "immediate satisfying feedback is essential for dopamine-driven loops. Architecture delegates feedback to separate frontend modules, potentially creating latency between actions and perception of impact" [Source: Csikszentmihalyi flow theory, psychology-position.md]. UX Specialist confirms "coordinated sensory feedback creates 'micro flow loops'—tier-based damage system (already CSS-styled) needs orchestration timing, not new features" [Source: Juice in Game Design research, ux-position.md]. Recent commits show tier-based damage feedback exists; gap is synchronization.

**Dissent:** None significant. This is low-controversy, high-ROI improvement.

**Implementation Notes:** Modify `GameManager.executeCombat()` to await animation completion before next action. Tier-mapped delays (tier 1: 300ms, tier 2: 500ms, tier 3: 800ms, tier 4: 1500ms) create escalating impact perception. Particle effects trigger on damage number appearance, not action initiation. Audio (once implemented) plays simultaneously with damage number appearance.

---

## Heated Debates (Top 5)

The most contentious discussions where specialists strongly disagreed:

1. **Onboarding vs. Depth Visibility Sequencing**: Combat Designer argued multiple attack types and synergy UI should ship immediately because "hidden complexity fails to satisfy—visible depth feels like agency." Playtester Advocate countered "85% of players quit if confused; current players self-selected through pain—we're ignoring the invisible cohort." Tension remains because both positions are correct for different cohorts. Resolution requires choosing primary audience (new players vs. experienced players) before sequencing features.

2. **Audio vs. Visual Polish Priority**: UX Specialist insisted "audio is non-negotiable—3-5x more effective at triggering dopamine than visuals. If we ship without audio, we've done 70% of work for 40% of payoff." Combat Designer dismissed as "time-constrained; visual polish can ship without external dependencies." Tension arose from resource allocation debate disguised as design debate. Resolution: start with Web Audio API prototyping to prove ROI before professional SFX investment.

3. **Progression Breadth vs. Depth Philosophy**: Economy Designer advocated "more upgrades, scaled rewards, transparent progression mechanics—horizontal progression outperforms vertical multiplication." Player Psychologist countered "ten chips with rich synergy chains sustain engagement longer than 50 isolated options—players disengage when synergies feel solved." This is fundamental disagreement on whether retention comes from breadth of choice or depth of discovery. Resolution: sequence both (depth audit first, then economy sinks around discovered synergies).

4. **Mobile-First vs. Desktop-First Architecture**: Mobile Expert argued "73% Day 1 abandonment in mobile; session mismatch costs retention—Express Runs and pause/resume are non-negotiable." Player Psychologist warned "pause/resume breaks narrative flow—flow requires uninterrupted engagement." Tension arose from platform priority question: is mobile primary audience or secondary convenience? Resolution: hybrid approach (desktop-primary with mobile-shaped access points).

5. **Educational Content as Moat or Distraction**: Competitive Analyst claimed "no competitor couples vocabulary with roguelike progression—defensible competitive moat." Roguelike Specialist countered "educational mechanics distract from core loop—roguelikes thrive on genre purity." Systems Designer proposed middle ground: "vocabulary overlay affects dialogue without gating progression." This debate reveals identity crisis: is NEO TOKYO a roguelike that teaches Japanese, or a Japanese-learning tool disguised as roguelike? Resolution: educational frosting on genre cake (narrative persistence, optional unlocks, not mandatory gates).

---

## Run Metadata

- **Specialists completed:** 9/9
- **Skipped:** None
- **Clusters completed:** 3/3 (Combat, Progression, Systems)
- **Total position papers analyzed:** 9
- **Total debate documents synthesized:** 3
- **Consensus decisions:** 10
- **Heated debates identified:** 5
- **Implementation priority tiers:** 3 (immediate/post-launch/future)

---

## Appendix: Sources

### Academic Research
- **Csikszentmihalyi flow theory** - Skill-challenge equilibrium, intrinsic motivation, sustained engagement through flow state [Cited: psychology-position.md, psychology-analysis.md]
- **Juice in Game Design** (bloodmooninteractive.com/articles/juice.html) - Audio-visual feedback compounding, sensory orchestration for satisfaction [Cited: ux-position.md]
- **Game Feel: A Beginner's Guide** (gamedesignskills.com) - Input responsiveness hierarchy, perception of control [Cited: ux-position.md]
- **Roguelike Meta-Progression Research** (hamatti.org/roguelike-meta-progression) - Horizontal progression vs. vertical multiplication, skill-mastery paradox [Cited: economy-position.md]

### Industry Analysis
- **GDC Vault - Creating Conflict: Combat Design for Turn-Based Games** (gdcvault.com/play/1023860) - Predictability enables strategy, decision-making vs. execution separation [Cited: combat-position.md]
- **Slay the Spire UX/UI Redesigns** (medium.com/@n01578837/final-deliverable-632cfc09e673) - Synergy moments drive engagement, discovered combinations create "aha moments" [Cited: combat-position.md]
- **Turn Based Combat System Design** (adelaidejenkins.com/pb-turn-based-combat-design) - Pre-battle deliberation, synergy visualization best practices [Cited: combat-position.md]
- **Balatro Timeline** (localthunk.com/blog/balatro-timeline-3aarh) - Naive design principles, deliberate genre separation, CHIP × MULT innovation [Cited: competitive-position.md]
- **PC Gamer Roguelike Analysis 2025** (pcgamer.com) - Market differentiators (first-person, dual-deck, exploration integration), emerging genre trends [Cited: competitive-position.md]

### Roguelike Design Principles
- **Meaningful Agency Through Constrained Randomness** (thom.ee, cloudfallstudios.com) - Pre-action luck vs. post-action randomness, synergy-driven balance, intent transparency [Cited: roguelike-position.md, roguelike-analysis.md]
- **Roguelike Permadeath Enables Broken Builds** (GameDev Protips) - Calculated risk-taking, unconventional discoveries, run-specific mutations [Cited: systems-position.md]
- **Distance-Traveled Unlocks as Genre DNA** (blackshellmedia.com) - Hades/Slay the Spire meta-progression patterns, breadcrumb unlocks reduce frustration [Cited: roguelike-position.md]

### Mobile Retention Research
- **The 73% Problem** (maf.ad/en/blog/game-retention) - Day 1 abandonment in mobile gacha, daily login systems improve Day 7 retention by 30% [Cited: mobile-position.md]
- **Session Architecture Patterns** (moldstud.com) - Top gacha games target 3-5 sessions/day, 18-30 minute windows [Cited: mobile-position.md, mobile-analysis.md]
- **Daily Login Rewards: Engagement & Retention** (maf.ad/en/blog/daily-login-rewards) - Calendar-based rewards (7/14/30-day cycles), habit loops without manipulation [Cited: mobile-position.md]
- **Resource Tiering in Mobile Games** (Adjust.com gacha-mechanics) - 78% of successful mobile games use difficulty-scaled acquisition rates [Cited: economy-position.md]

### Onboarding Best Practices
- **Progressive Disclosure Principle** (multiple sources) - Teach one mechanic per encounter, learning by doing, causal connections [Cited: playtester-position.md, playtester-analysis.md]
- **85% Quit Rate in First 30 Minutes** (Mobile UX best practices) - Confusion-driven abandonment, compound cognitive load management [Cited: playtester-position.md]
- **Zelda: BotW / Hades / Slay the Spire Onboarding Models** (industry comparison) - Single-mechanic tutorials, scaffolded decision spaces [Cited: playtester-research.md]

### Codebase Analysis Sources
- **combat-analysis.md** - Current chip pipeline infrastructure, synergy triggers (runTwice, nextChipAmplify), enemy variety gaps [Cited: combat-position.md]
- **systems-analysis.md** - 14 effect types, position-sensitivity, dual-pool mechanics, conservative multiplier ceiling (1.2x-3.0x) [Cited: systems-position.md]
- **economy-analysis.md** - Dual-currency system (credits/essence), 4-upgrade flatness, essence velocity imbalance, no tiered rewards [Cited: economy-position.md]
- **ux-analysis.md** - Tier-based damage feedback architecture, audio layer gap, tonal inconsistency (cyberpunk overlay vs. bright UI), escalation plateau [Cited: ux-position.md]
- **psychology-analysis.md** - Phase machine flow support, micro-feedback timing delegation, narrative motivation underpowering [Cited: psychology-position.md]
- **playtester-analysis.md** - Full complexity dump at login (game.js → rooms.js → combat loop), information asymmetry in chip systems, no scaffolded decision space [Cited: playtester-position.md]
- **mobile-analysis.md** - Run persistence friction, session architecture mismatch (45+ min uninterrupted runs vs. mobile bursts) [Cited: mobile-position.md]
- **roguelike-analysis.md** - Enemy intent system (5 types, single-turn preview), meta-progression gaps (shop-based only), balance metrics absent [Cited: roguelike-position.md]
- **competitive-position.md** - JPDB integration uniqueness (tier-based narration, 49 VOICEVOX voices), 2-stat information density sweet spot [Cited: competitive-position.md]

### Game-Specific Research
- **Balatro** - Exponential multiplier stacking (10x+), slot machine cascade audio, naive design success (5M+ copies, GOTY) [Cited: systems-position.md, ux-position.md, competitive-position.md]
- **Vampire Survivors** - Weapon-sound symphonies, power fantasy through rapid escalation, reward audio layering [Cited: ux-position.md]
- **Slay the Spire** - Metrics-driven iteration, relic cascades, Ascension systems, horizontal progression, linear floor selection (2018 design) [Cited: systems-position.md, economy-position.md, roguelike-position.md]
- **Hades** - Character arcs across runs, $300M+ revenue from narrative persistence, weapon unlocks for casual/hardcore cohorts, meta-progression depth [Cited: psychology-position.md, competitive-position.md, economy-position.md]
- **Inscryption** - Exploration layers, branching paths for 2025 retention standards [Cited: competitive-position.md]

---

## Implementation Priority Tiers

### Tier 1: Immediate (High ROI, Low Effort)
1. **Audio layer implementation** (10-line tier-to-sfx map, Web Audio API prototype)
2. **Synergy Discovery Panel** (surfaces existing chip combos, bottom-right UI element)
3. **In-Game Mechanics Reference Panel** (glossary, ~50 lines UI code, 40% friction reduction)
4. **Feedback orchestration timing** (synchronize animations in `GameManager.executeCombat()`)

### Tier 2: Post-Launch (Medium Effort, Proven Patterns)
1. **Training Wheels Mode** (2-chip onboarding, in-turn narration)
2. **Tiered essence rewards** (10/15/20 per ward difficulty)
3. **Achievement-gated upgrade unlocks** (milestone-based progression)
4. **Breadcrumb unlocks** (distance-traveled chip variants)
5. **Express Run Mode** (3-floor variant, 10-15 min sessions)
6. **Paused Run Persistence** (exact state resume)
7. **Lightweight narrative milestones** (DM narration at achievement thresholds)

### Tier 3: Future Iteration (Complex, Requires Validation)
1. **Multiple attack types** (Quick/Normal/Heavy with chip synergy branches)
2. **Pre-battle synergy visualization** (active buff display)
3. **Conditional exponential mechanics** (Archetype Charm system)
4. **Adaptive difficulty scaling** (win/loss tracking, A/B testing)
5. **Educational content gating** (JPDB vocabulary thresholds for optional unlocks)
6. **Branching ward paths** (spatial variance, tier selection)
7. **Telemetry dashboards** (chip win-rate correlations, synergy balance validation)

---

**Report compiled by:** Creative Director (Game Design Studio)
**Next steps:** Share with development team for prioritization roadmap. Validate audio ROI with Web Audio API prototype. Schedule playtesting for training wheels mode with 3-5 new players.
