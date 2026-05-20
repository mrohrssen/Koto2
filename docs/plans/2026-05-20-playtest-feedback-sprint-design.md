# Playtest Feedback Sprint — Score-Bump Design

**Date:** 2026-05-20
**Owner:** TBD
**Status:** Design — pending review
**Target playtest re-launch:** ~2 weeks from approval

## 1. Goal

Lift average playtester ratings (Fun, Would-play-again, Would-recommend, Learning impact) by addressing the highest-frequency friction clusters from the three most recent live playtest summaries (`Playtest summary for Koto - 1/2/3.pdf`, ~59 testers).

Concrete numeric targets for the next playtest cohort:

- **Fun** average: 3.5 → **4.2+**
- **Would recommend** average: 3.5 → **4.2+**
- **Learning impact (Did you learn?)** average: 6.5/10 → **7.5+/10**
- Sessions ending in "I'm stuck / quit at crystal wall / softlock" : currently ~12 of ~59 → **≤ 3 of next cohort**
- Sessions reporting "couldn't hear pronunciation" or "music drowns voice" : currently ~25 of ~59 → **≤ 5 of next cohort**

These targets are deliberately aggressive on the friction-quit metrics (binary fixes) and modest on raw 1–10 ratings (where some testers will always rate the pedagogy low).

## 2. Out of scope

- **Active production pedagogy** (speak-into-mic, type-the-meaning, randomized boss vocab gates). Captured as a separate B-track design (§9) but not in this sprint.
- **Higher-quality voice acting / non-AI TTS.** Acknowledged as a real concern but a separate strategic decision.
- **Major content additions** (new areas, creatures, recipes). Existing content stays; we fix the experience around it.
- **Multiplayer/PvP feature work** beyond what's needed to maintain parity (`AGENTS.md` rule).

## 3. Evidence summary

Three playtest PDFs, ~59 testers total, across two builds ("Koto V1" in PDF 1; "Koto" in PDFs 2 & 3). The complaint clusters and frequencies (testers explicitly mentioning each theme):

| # | Theme | Frequency | Status vs. last 5 days of `origin/dev` |
|---|---|---|---|
| 1 | Audio/TTS — no tap-to-hear, music vs voice mix, broken sliders, no replay | ~25 | 🟡 Heavy commit activity (≥18 commits). Cut-off syllables, TTS speed, AI-voice quality still open. |
| 2 | Romanization / furigana in breakdowns + reviews + Japanese-only transition feels too early | ~15 | ❌ Untouched |
| 3 | Crystal economy — "not enough crystals / come back tomorrow" wall; translation costs crystals | ~12 | 🟡 Only `Increase daily crystal login bonus` |
| 4 | Cooking — "no recipes," opaque flow | ~10 | 🟡 `Guard campfire cooking until recipe ready` reduces dead-ends |
| 5 | Next-step gaps — "I don't know what to do," Translate vs Learn unclear, no back, softlocks | ~12 | 🟡 `Tighten dialogue action labels`, click-through blocks |
| 6 | Pacing / density — dialogue too fast, breakdown too much text | ~10 | 🟡 `Block tutorial narration click-through` |
| 7 | Symbol intimidation — kana/kanji recall vs sound/meaning emphasis mismatch | ~8 | ❌ Untouched (strategic) |
| 8 | Combat clarity — MP, status terms, healing, target selection | ~10 | 🟡 Some fixes; conceptual clarity open |
| 9 | Performance — lag, freezes, stutters (older iPhones) | ~6 | 🟡 Asset-manifest warmup landed 5/14; needs verification |
| 10 | iPhone safe-area / Dynamic Island cutoff | ~5 | 🟡 `Bump mobile app max width`, HUD swap; not explicitly safe-area |
| 11 | End-of-content abruptness, 2 runs/day cap | ~6 | ❌ Tied to #3 |
| 12 | "Just clicking through, not really learning" / want active production | ~6 | ❌ B-track |
| 13 | AI-feel concern (voices/art/copy) | ~3 (vocal) | ❌ Strategic |
| 14 | Forced registration friction at start | ~5 | ❌ Untouched |
| 15 | Hard softlocks requiring force-close | ~3 | ❌ Untouched |

**Net read:** Recent audio/TTS work likely already moves the needle on theme #1 once it ships to playtesters. The largest *unfixed* impact opportunities are #2 (romanization), #3 (crystal economy), and #5 (next-step gaps).

## 4. Sprint scope — seven workstreams

Each workstream has a name, scoped fixes, exit criteria, and a primary failure mode it removes. Workstreams are deliberately small so two engineers can run them in parallel.

### W1. Romanization-everywhere

**Problem:** 15+ testers explicitly asked for romaji under every Japanese word, especially in the breakdown view and the post-run review. Several said reviews tested symbols while gameplay only taught sound, leading to "I did terrible" reactions.

**Fixes:**
- Always show romaji above (or beside) every kana/kanji token in:
  - Dialogue breakdown view (Translate / Learn screens)
  - Befriend prompts and choose-your-response dialogue
  - Combat move cards and status badges
  - Post-run "Knowledge Review" cards (front face)
  - Cooking ingredient names
- Add a settings toggle `Show romaji` defaulting **ON** for `Japanese level: 1 / basic` users, OFF for higher JLPT levels. Players can override.
- Soften the "now Japanese-only" transition copy: it currently reads as a removal; reword to emphasize "tap any word for full translation, romaji stays."

**Exit criteria:**
- Visual audit (Playwright) confirms romaji renders on each of the five surfaces.
- Tester checklist Q: "Could you read every Japanese word phonetically without having to guess?" answered yes by ≥90% of next cohort.

**Risk:** Some advanced learners may find romaji over kanji babyish; mitigated by the settings toggle and JLPT-level default.

### W2. Crystal economy de-friction

**Problem:** Players quit when they hit "not enough crystals / come back tomorrow." Multiple testers explicitly rage-quit. Several didn't understand why **translation** costs crystals when the translation is already on screen.

**Fixes:**
- **Make tap-to-translate free.** Reading the existing translation pane on a Japanese word costs nothing. (This matches the principle of comprehensible input — players shouldn't pay to comprehend.)
- Keep **Learn** (the deep grammar/usage breakdown) as the gated action — it's the deeper feature most players don't always engage with, and gating it preserves a sense of "I'm choosing to dive deeper." Reduce its cost (currently ~15? confirm) by 50%.
- Remove the hard "come back tomorrow" lockout. Replace with a soft cap: the first 2 runs per day grant full crystal/XP rewards (today's behavior); runs 3+ continue with rewards halved. Players are *never* told "you can't play." If a player has zero crystals at the start of a run, they begin with a small "starter pouch" (e.g., 25 crystals) so translation/learn actions remain accessible — these starter crystals do not roll over across runs.
- Add visible cost preview on every crystal-spending button (e.g., button reads `Learn — 8 💎`).
- Clear toast/log entry whenever crystals are spent or earned (covers "took my crystals without telling me" complaint).

**Exit criteria:**
- A fresh tester can play continuously for 30 minutes without seeing any "you cannot proceed" message.
- 90% of next cohort can answer "What do crystals do?" correctly after 10 minutes.

**Risk:** This changes meta-progression pacing. Coordinate with `docs/plans/2026-03-02-equipment-crafting-town-mvp-design.md` and any monetization plan. If crystals are a future paid currency, the free-translation rule must hold — translation is the *core learning feature* and gating it directly contradicts CLAUDE.md's "Comprehensible Input (i+1)" principle.

### W3. Audio/TTS quality pass

**Problem:** Despite ~18 recent TTS commits, the lowest-scoring testers (Toby 0.5/5 fun, Eden 1/10 enjoyment) cited robotic voice, words cut off at the start, and TTS playing too fast.

**Fixes:**
- **TTS speed control** — add a settings slider (e.g., 0.7×, 0.85×, 1×, 1.15×). Default 0.85× for `Japanese level: basic`.
- **Investigate cut-off syllables** — Eden specifically described leading syllables missing. Likely a buffer/latency issue. Add an integration test that plays a known word and asserts the rendered audio buffer matches expected duration ±50 ms.
- **Music vs voice mix** — current per-channel volume work is good. Add a "duck music during voice" auto-mode (lower music to 30% while voice plays), enabled by default.
- **Verify recent commits work end-to-end** — Playwright tester checklist for each of the recent TTS PRs (tap-to-hear, Learn replay, autoplay, ingredient names, befriend voices, dialogue card audio).
- **Acknowledge TTS limits in settings** — copy that explains current voices are synthesized; let advanced users disable TTS entirely without breaking dialogue flow.

**Exit criteria:**
- Tester checklist: "Could you hear and replay pronunciations clearly when you wanted to?" ≥85% yes.
- No tester reports an audio-related ⭐1 rating in the next cohort.

**Risk:** Fundamental TTS quality cannot be fixed without a different model/voice. The speed slider and duck-music feature can absorb most of the practical complaint; the perception of "AI voice" will persist for the most sensitive testers.

### W4. Onboarding next-step + button-clarity polish

**Problem:** Twelve testers explicitly said "I don't know what to do." Translate / Learn / Continue buttons are confused for one another. Players soft-lock on Explore with no party. Cooking opens with no recipes. Post-breakdown players are stranded.

**Fixes:**
- **Universal back / "Return" affordance** on every menu — no more "I had to force-close." Verify Explore, Knowledge Review, Cooking, Fusion Lab, Settings.
- **Post-breakdown continuation hint** — after Learn closes, surface "Back to dialogue" with a small arrow/pulse.
- **Button label sweep** — Translate / Learn / Continue / Talk / Fight / Befriend audit; ensure each label is verbed and each has a one-line tooltip on long-press explaining what it does and costs.
- **Cooking onboarding gift** — first time the player opens Cooking, gift one starter recipe. Never show the cooking modal if the inventory has zero ingredients.
- **HUD label for current scene** ("Starting Meadow", "Wild Plains") top-left, so players know where they are. Several "I'm just here, lost" comments link to spatial confusion.
- **Disable advance-on-tap during the first 800 ms** of any new narration page (extends the recent `Block tutorial narration click-through` fix to all narration, not just the tutorial).

**Exit criteria:**
- Next cohort: zero force-close-to-recover reports.
- 90% of next cohort can name what each of the three dialogue buttons does after 5 minutes.

**Risk:** Tooltip-on-long-press may not be obvious; consider showing button labels expanded by default for first 3 sessions.

### W5. Mobile safe-area + iPhone polish

**Problem:** Five+ testers reported HUD elements (crystals, notifications, currency) cut off by the Dynamic Island or screen edge. One tester saw a white screen on launch.

**Fixes:**
- Audit and pin every fixed-position HUD element behind `env(safe-area-inset-*)` with adequate fallback padding (≥48 px top on iPhone 14 Pro and newer).
- Verify the white-screen-on-launch repro path; if related to the asset manifest warmup landed 5/14, add a loading screen with a visible spinner that fails-soft if assets stall.
- Audit retry button (Dan: "retry button doesn't work").
- Audit fusion lab locked state communication (Dan: "tapped fusion lab battle and it did nothing"). If a feature is locked, say *why* and what unlocks it.

**Exit criteria:**
- Playwright iPhone 15 Pro safe-area smoke test passes on every screen (existing tooling per CLAUDE.md).
- Retry and Fusion Lab tappable from end-of-run and main hub respectively, with clear feedback.

**Risk:** Low. Mostly CSS/UX cleanup.

### W6. Combat clarity micro-fixes

**Problem:** Players don't know what MP, "minus stage 1," or status icons mean. They don't know how to heal. They don't know which ability to pick.

**Fixes:**
- **Stat/status legend** — add a tappable `?` on combat HUD opening a 1-page legend (HP, MP, status badges, type matchups). Tester suggested this directly.
- **Heal discoverability** — surface a "Rest" affordance and (if it exists) a "Heal item" inventory shortcut directly on combat HUD when any party member is below 40% HP. Don't make players guess that Rest restores MP only — the heading should read "Recover MP — no damage this turn."
- **Ability tooltip on long-press** — every move card has full description on long-press, even mid-combat.
- **Type-effectiveness preview** — show a faint icon on each move card indicating effectiveness against the currently-selected target (super effective / resisted / no effect), so the player isn't surprised by "No effect."
- **Friendly "you can't befriend stronger creatures" copy** — Lyliana complained being blocked from befriending stronger creatures felt like a hard stop after being told to "talk." Reword to say "Defeat this one to study it — you can recruit a fused version later."

**Exit criteria:**
- Next cohort: ≤3 testers ask "what is MP / what is this status." Currently ~10.
- ≤3 testers ask "how do I heal." Currently ~6.

**Risk:** Low. Pure UI/tooltip work.

### W7. Verification + re-playtest readiness

**Problem:** The recent dev branch has ~80 commits in 5 days. We need confidence each shipped fix actually lands in the player experience before re-launching.

**Fixes:**
- **End-to-end manual playtest checklist** covering all 15 complaint themes — run it on Vite dev (per CLAUDE.md) before tagging the build.
- **Regression Playwright smoke test** — start to first combat, dialogue with tap-to-hear, learn breakdown, cooking with no ingredients (must not soft-lock), end-of-run → review → fusion.
- **Field a new playtest cohort** with the same demographics (mobile, no prior Japanese to JLPT N4) on UserTesting/the same platform. Aim for ≥40 testers.
- **Pre-playtest task list** for testers — give them 3 explicit prompts: "Reach Wild Plains," "Tap a Japanese word to hear it," "Cook something." This makes results comparable across cohorts.

**Exit criteria:**
- Build tagged for playtest deploy with checklist 100% green.
- Playtest live with first 5 sessions visible within 48 hours.

## 5. Sequencing

| Week | Track A | Track B |
|---|---|---|
| **W1** | W2 Crystal economy | W1 Romanization-everywhere |
| **W1** | W4 Onboarding next-step | W6 Combat clarity micro-fixes |
| **W2** | W3 Audio/TTS quality pass | W5 Mobile safe-area + iPhone polish |
| **W2** | W7 Verification + re-playtest readiness | W7 (joint) |

Two engineers in parallel; W2/W4 first because they are gameplay-blocking; W1/W6 alongside because they're high-volume UX. W3 in week 2 to ride on top of the audio commits already landed. W5 last because it's local CSS/UX. W7 is a joint final pass.

If only one engineer is available, drop W6 from the sprint (it has the lowest unique value and overlaps W4).

## 6. Risks & open questions

- **Crystal economy change interacts with monetization roadmap.** If crystals are intended to be the paid currency, making translation free is the right call (matches the i+1 principle) and we monetize cosmetics/creatures/area unlocks instead. Confirm with product before W2 starts.
- **Romaji-everywhere may dilute the language-acquisition curve.** Mitigated by the JLPT-level default and the explicit toggle. Track in next playtest: do users with romaji-on still pass the review at the same rate as romaji-off users? If yes, ship the default; if no, raise the default level.
- **TTS limitations are structural.** A speed slider and music ducking go far, but the "robotic voice" complaint will persist for sensitive testers until we change TTS provider/voice (out of scope here).
- **Daily limit removal might shorten engagement long term.** Soft cap with diminishing rewards is the compromise; tune by analytics post-launch.

## 7. Success-tracking

After the next playtest cohort returns:

- Re-extract complaint frequencies using the same theme table (§3).
- For each theme, expected reduction:
  - Audio: ≤5 mentions (from 25)
  - Romanization: ≤2 mentions (from 15)
  - Crystal wall: 0 mentions of "come back tomorrow / can't proceed" (from 12)
  - Cooking dead-end: 0 mentions (from 10)
  - "I don't know what to do": ≤4 mentions (from 12)
- Track survey deltas (Fun, Recommend, Learning).
- If targets met → ship to production on `dev → master` fast-forward (per CLAUDE.md). If not, root-cause the gap on a per-theme basis before the next sprint.

## 8. Connection to recent dev work

This sprint **builds on** the audio/TTS work landed 2026-05-14 → 2026-05-19. It does not redo it. Specifically:

- W3 verifies and tunes the ~18 audio commits landed in the last 5 days.
- W4's "post-breakdown back" affordance respects the `Tighten dialogue action labels` work.
- W5 extends `Bump mobile app max width` and the HUD swap.
- W2 supersedes `Increase daily crystal login bonus` with a fuller economy fix.

If any work in this sprint contradicts in-flight branches, default to the in-flight branch and adjust.

## 9. B-track companion design — Pedagogy active production (separate doc)

Multiple testers (Charles, Amubioya, Donald, Robert, Oliver) explicitly asked for active production: speaking into the mic, typing the meaning, boss vocab gates with random words. This is **out of scope** for the 2-week sprint but should be scoped in a parallel design doc:

- `docs/plans/2026-05-20-active-production-pedagogy-design.md` (to be written separately)
- Likely components: speech-recognition pronunciation check, typed-meaning recall mode, boss fights gated by N correct word recalls.
- Risk: a major engineering investment and could change game feel meaningfully. Should be A/B tested rather than blanket-deployed.
- Recommended start date: after this sprint's playtest data returns. If learning ratings remain ≤7/10 after this sprint, B-track becomes the next priority.

## 10. Approval

Once approved, this design feeds into a detailed implementation plan via the writing-plans skill. The plan will:

- Break each workstream into specific file edits / new endpoints / new tests.
- Assign owners.
- Specify branch names following `feature/` and `fix/` conventions in CLAUDE.md.
- Define the merge-back order to keep `dev`'s history clean.
