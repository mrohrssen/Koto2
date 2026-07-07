# Frames → AI Dialogue Transition ("Translator Upgrade") — Design

**Date:** 2026-07-07
**Status:** Approved (brainstorm with user, 6 clarifying decisions + 4 design sections)
**Prior art:** `2026-04-04-minimum-viable-i1-dialogue-findings.md` (threshold research),
`2026-04-05-hardcoded-dialogue-bootstrap-design.md` (frames bootstrap),
`2026-04-10-glue-word-i1-dialogue-curriculum-design.md` (glue curriculum),
`2026-06-02-ai-befriend-model-benchmark.md` (unrun benchmark plan — out of scope here)

## Problem

Koto's magic is not SRS flashcards — it is that hardcoded frames teach the player
exactly the words they need so the game can eventually hand dialogue over to a live
AI system that speaks to them in i+1 Japanese. Both halves exist today:

- **Frames pipeline** (static, pre-validated): serves all player-visible NPC text
  (only `fightStart`/`defeatLine` one-liners), the befriend name-quiz, barks, shop
  lines. Selection is already word-gated per player via `selectNpcLine`/`selectBark`.
- **Narration engine** (`src/narration-engine/`): character cards for all 48 NPCs +
  creatures, per-user memory (bond/encounters/liberated), staleness-aware text cache,
  hard i+1 repair loop that refuses to cache violations, TTS. Generates NPC dialogue
  in the background but almost none of it is served. Creature befriend is the one
  AI-wired surface, gated by a manual settings toggle.

What's missing is the **graceful transition**: no trigger connects "player has
learned enough" to "AI dialogue turns on." The manual toggle also serves AI befriend
to players whose vocabulary can't support it — which is exactly why befriend
responses feel bad today (below ~110 known words, every sentence burns its i+1
budget on survival glue and the wrong-options become mush; see findings doc
Experiments 11 vs 25).

## Decision Summary

| Question | Decision |
|---|---|
| Which surfaces transition? | All conversations now (befriend + NPC lines + revived 3-round bond convo) plus shop/shrine line pools (shopGreeting, shopPurchase, shrineGreeting); barks/gameMaster eventually (roadmap note only) |
| Trigger shape | **Single switch, no tiers** — flips all conversation surfaces at once, only when we are confident output will be excellent |
| Trigger condition | Vocab threshold (≥130 known words incl. ≥30 of a 74-word glue pool) **AND** verified pre-generated runway (preflight) |
| Unlock UX | **Cid moment**: she "changes your translator setting" — prologue-style scene, fires once |
| Befriend quality fix | Gate behind the switch + prompt-improvement pass. No model benchmark in scope |
| Architecture | Central **Dialogue Director** module; all surfaces query it; per-request frame fallback forever |
| NPC conversations live | Revived post-battle flow (defeatLine → 3 bond rounds → freedLine → skill pick) |

## Non-Goals

- Model selection / running the June benchmark (current `AI_DIALOGUE_MODEL` assumed).
- AI quality-scoring pass in preflight (offered, declined — i+1 repair + prompt pass
  is the quality bar).
- Out-of-combat hub conversations with NPCs (future phase, mentioned in roadmap).
- AI for utility lines (barks, shop, shrine, gameMaster) — roadmap sketch only.
- DM narration and door hints — separate systems, untouched.

## 1. The Switch: "Translator Upgrade"

One per-user boolean, earned once, never auto-revoked.

### Condition A — Vocab readiness

- `knownWords ≥ 130`, where known = FSRS card in Learning/Review/Relearning state
  (existing `getKnownWordsFromFsrs(userId)`).
- `glueWordsKnown ≥ 30`, counted against a **74-word glue pool re-derived from
  scratch on 2026-07-07** (superseding the April findings-doc Priority 1–5
  curriculum, which was built with weaker models) and **grounded against JPDB
  frequency data the same day**: every pool word is JPDB "common" tier (median
  rank 200, worst 2600) on JPDB's dialogue-heavy corpus. The pool covers
  people/social, deixis, time, degree/quantity, mental/communication verbs and
  nouns (話, 言葉, plus body/expression nouns 手/目/声/心 that the frequency
  data reinstated), motion verbs, daily/game verbs (shop economics: 買う/高い/
  安い; food/cooking: 食べる/甘い/美味しい; game-talk: 難しい/簡単/出来る;
  friendship loop: また/今度/会う/楽しみ; collection talk: 一番/たくさん/
  可愛い/大好き/見せる), and descriptors. It deliberately **excludes**
  bark-guaranteed words (これ, 嬉しい, 新しい — free threshold credit measures
  nothing), grammar-pattern words (方, 時, 後 — their high frequency measures
  the patterns 〜の方が/〜時/〜た後, not flashcard value), ambiguous bare kanji
  (気, 力, 道 — JPDB itself parses them as suffixes), and 天気 (rank 4900, the
  only frequency-rejected candidate). みんな and どっち received user-approved
  dictionary entries (2026-07-07). Requiring 30 of 74 keeps the vocab bar at
  the research's exchange-comfort point while the expansive pool means any 30
  a player happens to learn are all high-value; the preflight (Condition B) —
  not the word count — is what guarantees generation quality before the
  switch fires.
- Constants + glue list live in a new config: `data/dialogue-switch-config.json`
  (`{ minKnownWords: 130, minGlueWords: 30, glueWords: [74 words] }`). Tunable
  without code changes.

Research basis: at 130 words with strong glue coverage, full 3-round dialogue
generated 15/15 fields with zero unknowns and real narrative arcs (Experiment 25).
Raw word count without glue composition fails (Experiment 29: 150 nouns, emotionally
dead output) — hence the compound condition.

### Condition B — Verified runway (preflight)

When Condition A is met, the server silently pre-generates the **complete dialogue
inventory for the player's unlocked areas**: every NPC with a character card and
every befriendable creature with a character card in those areas, through the
existing generation + i+1 repair pipeline (`queueMissingDialogues` machinery),
plus the three shop/shrine line pools (§3).
A completeness check then verifies every entity and pool has a valid,
fresh-enough cache entry.

- 100% clean → mark `translatorUpgrade.ready`; the Cid moment plays at the next
  hub entry and the switch activates.
- Any failure → no switch, no Cid, frames continue. Preflight retries at the next
  evaluation point. The player can never see a half-working version.

### Evaluation points

Threshold + preflight status are evaluated at hub entry and after the adventure
report (where FSRS growth lands). Both are cheap reads; generation itself is the
existing fire-and-forget background queue with concurrency 3.

### State

- `meta.translatorUpgrade = { active: bool, readyAt: iso, seenAt: iso }` — in the
  game save. `active` is high-water: FSRS lapses dropping the count below 130 never
  revoke it.
- Cid-moment completion sets `userKeys.aiDataSharingConsent = true` and
  `userKeys.aiConversationsEnabled = true` (she flips the setting in-world; the
  scene's English text notes it and Settings offers the opt-out).

## 2. Dialogue Director

New module `src/game/dialogue-director.js`. The single seam every surface queries.

```
getDialogueSwitchState(userId, meta) -> { knownCount, glueCount, thresholdMet, ready, active }
shouldUseAi(userId, userKeys, meta)  -> bool
```

`shouldUseAi` = server env configured (`buildAiDialogueConfig()` non-null)
AND `userKeys.aiDataSharingConsent`
AND `userKeys.aiConversationsEnabled`
AND `meta.translatorUpgrade.active`
(OR a dev/debug override — see Testing).

`canUseAiDialogue` in `src/ai-dialogue/config.js` remains the env+consent+toggle
input; the director adds the earned-switch condition on top. All call sites that
currently use `canUseAiDialogue` to decide *serving* (befriend conversation route,
background queues) move to `shouldUseAi`.

**Migration note:** users with the manual toggle already on (in practice: michia)
lose ungated AI befriend until the switch activates — but that account is far past
130 words, so Cid fires on the first hub visit after deploy. Built-in dogfood.

## 3. Per-Surface Behavior

### Creature befriend
- **Pre-switch:** frames name-quiz (`befriend_wait/name/success/wrong`), unchanged.
- **Post-switch:** existing AI 3-round conversation path
  (`/befriend-conversation` → cache → `buildBefriendDisplayRounds`), now gated by
  `shouldUseAi` instead of the bare toggle, with the prompt pass (§5) applied.
- Fallbacks inside the AI path (cache miss → on-demand regen → name-quiz fallback)
  stay exactly as they are.

### NPC encounter one-liners
- **Pre-switch:** frame `fightStart`/`defeatLine` via `selectNpcLine` (unchanged).
- **Post-switch:** served from the NPC dialogue cache — `greeting` replaces
  fightStart, `defeatLine` replaces the frame defeat line. Raw cached strings are
  tokenized server-side at serve time through the same pipeline the befriend display
  service uses (`tokenizeDialogueTexts` + `enrichTokens`), TTS keys from cache as
  the greetingTts path does today. Cache miss → frames, per request.

### Post-battle bond conversation (revival)
- **Pre-switch:** current v1 — single frame defeat line + skill pick.
- **Post-switch:** AI `defeatLine` → 3 bond rounds (existing
  `/npc-dialogue-respond` logic: shuffled tone options, totalDelta clamped to ±1,
  bond + encounter + liberated flag + memory logging already wired) → `freedLine` →
  skill pick.
- The April phase-machine trap (setting `run.npcDialogue` stranded the run in
  NPC_DIALOGUE) is fixed by making NPC_DIALOGUE a deliberate post-combat state that
  exits into `skillSelectionPending`, with the same prepared-room snapshot resync
  the defeat-line path performs today.

### Shop & shrine line pools
- **Pre-switch:** static frames (`shopGreeting`, `shopPurchase`, `shrineGreeting`)
  selected per player via `assembleFrame` + `selectBestFrame`, unchanged.
- **Post-switch:** the same three categories serve from **per-user AI line pools**
  generated through the narration engine as a `linePool` entity type (one
  pseudo-entity per category; personas: shopkeeper, shrine fox). A pool is ~8
  short lines cached per user on the normal staleness cadence. `shopPurchase`
  lines must contain the literal `{item}` slot, and vocab validation runs on the
  template with the slot stripped — everything outside the slot must be known
  words, leaving the i+1 budget for the item itself, exactly like the static
  frames. Serving tokenizes pool lines into the standard frame shape (slot token
  spliced), so the existing `assembleFrame`/`selectBestFrame` machinery and
  serve-time TTS keep working untouched at every call site (friendly-NPC
  hydration, shrine offers, and the explore-runway prepared payloads). Static
  frames remain the per-request fallback (missing/stale pool, slot-malformed
  lines, AI outage).

### Stays frames (this design)
Barks, gameMaster lines, skill_select, and the befriend name-quiz prompts
(they are the permanent fallback layer).

## 4. Cid Moment

- A short prologue-style scene sequence (same scene-player pattern as
  `data/prologue.json`: Cid portrait + English lines; any Japanese she demos goes
  through `frame-sources.json` → tokenizer).
- Script beats (final copy at implementation): *"Hey! You've learned some real
  Japanese!"* → *"Hold on, I'm going to change your translator setting."* →
  *"There — now the translator will allow for dynamic conversations."*
- Triggered on hub entry when `translatorUpgrade.ready && !seenAt`.
- Completion sets the userKeys flags + `seenAt` + `active`. Fires exactly once;
  idempotent across re-login (all state persisted).
- Settings copy changes from opt-in "Personalized Dialogue" to an opt-out
  "Dynamic conversations — on".

## 5. Prompt Pass (creature + NPC entity types)

Applied to `src/narration-engine/entity-types/creature.js` and `npc.js` (+
`vocab-constraints.js` where shared):

1. **Compound-word warnings** (from findings verification failures):
   注意：今日≠今、見つける≠見る、出す≠出る、歌(noun)≠歌う(verb). These are separate words.
2. **Reinforcement layer:** pass nearly-known words (FSRS Learning-state cards, via
   the existing suggestion machinery) as "prefer these when natural: […]" — research
   showed reinforcement integrates smoothly and doesn't degrade naturalness.
3. **Wrong-option rules** (befriend): incorrect options must be grammatical,
   plausible, clearly non-responsive to the specific prompt, of similar length to
   the correct answer (no length tells), and never near-synonyms of it.

**Resolved 2026-07-07:** the earlier proposal to add どっち to the validator's
FREE list is superseded — どっち joined the glue pool as *taught* vocabulary with
a user-approved dictionary entry instead. Broader free-list reform (the
surface-vs-base bug where ください is freed but frames count くださる;
interjections ああ/うわ counted as content words; question words freed despite
being teachable vocabulary; the two validators not sharing one list) is
documented as separate follow-up scope, not part of this design.

## 6. Readiness Runway (the "graceful" part)

Players must actually reach 130+30-glue through play. The 2026-07-07 reachability
audit found only 29 of the 74 pool words teachable from current content — 44 pool
words have no i+1-eligible frames at all, and 前 is blocked by double-unknown
lines — so the gap-filler authoring below is load-bearing (~55-75 short lines),
not polish:

- **Runway audit (one-time script):** verify every glue word required by the switch
  is teachable from current frame content — reuses/extends the April curriculum
  validation script. Any unreachable glue word gets gap-filler frames authored in
  `frame-sources.json` (through the normal tokenize + validate pipeline).
- **Curriculum wiring:** `selectNpcLine` already accepts a `curriculumWords` option
  that no caller passes. Wire it: pre-switch, callers pass the player's *missing*
  glue words so frame selection actively prefers lines that teach exactly what the
  switch still needs. Frames consciously funnel players toward the upgrade.

## 7. Degradation Model

- **AI outage post-switch:** per-request fallback to frames; the switch itself never
  flip-flops.
- **Staleness is never breakage:** vocab only grows, so previously cached dialogue
  remains i+1-compliant — stale means suboptimal (regenerate in background), never
  invalid.
- **Preflight failure:** logged, retried at next evaluation point; no partial switch.
- **Opt-out:** Settings toggle → frames immediately; opting back in resumes AI from
  the intact cache.
- **Repair-loop failure for one entity post-switch:** that entity serves frames
  (existing "not caching — static fallback" behavior), everything else stays AI.
- **Pool failure:** a missing, stale, or slot-malformed line pool falls back to
  the static frame pool for that category, per request.

## 8. Testing

- **Unit (director):** threshold boundaries (129/130 words, 29/30 glue), glue-list
  counting, high-water persistence (active survives FSRS lapse), preflight
  completeness math (unlocked-areas entity scoping).
- **Unit (prompts):** assembled prompts contain compound warnings, reinforcement
  list, wrong-option rules; JSON schema unchanged.
- **Unit (pools):** line-pool shape + `{item}` slot validation, slot-token
  splicing, pool resolver falling back to static frames.
- **Integration:** befriend route serves name-quiz pre-switch / AI post-switch;
  NPC encounter serves frame lines pre-switch / cached AI post-switch; Cid moment
  fires exactly once (hub re-entry, re-login); opt-out round-trip.
- **Dev utility:** a seed script/route that pushes a test account across the
  threshold (devtester knows far too few words to test naturally). Follows the
  existing `seed:dev-user` pattern.
- **Gate:** `npm test` failing-set equality per the established baseline (the ~48
  sudachipy/numpy failures are environmental, not regressions).
- **Manual:** Playwright playtest of the full arc — below threshold (frames), seed
  across, hub entry → Cid scene → befriend + NPC battle on AI dialogue. Visual
  verification per repo rules.

## 9. Rollout Sequencing (build dark, enable last)

1. **Director module** + switch config + tests. Dark: nothing reads it in prod yet.
2. **Befriend prompt pass** + move befriend gating to `shouldUseAi` (+ debug
   override). From this step until step 5, toggle-only users get frames (the
   documented migration); dev accounts keep AI befriend via the debug override,
   which becomes the test vehicle. Prompt improvements land for whoever the
   override serves.
3. **NPC AI one-liners + 3-round revival + shop/shrine line pools**, dark behind
   the switch/debug override.
4. **Glue runway:** audit script, gap-filler frames, `curriculumWords` wiring.
5. **Preflight + Cid moment + settings copy + admin dashboard state**
   (per-user known count, glue coverage, preflight %, switch status). This step
   activates the feature for eligible users.
6. **Rollout checks:** `AI_DIALOGUE_*` env present on Railway dev + prod; dogfood
   via michia's account (crosses threshold → Cid on first hub visit); watch
   `[NpcDialogue]/[CreatureDialogue]` logs and repair-failure rates.

## 10. Roadmap (out of scope, recorded for "everything eventually")

- **Utility lines** (barks, gameMaster): post-switch, per-user pre-generated
  *pools* per category following the shop/shrine pool pattern (§3). Needs its
  own spec (bark trigger coverage + pool validation).
- **Out-of-combat NPC conversations:** liberated NPCs chat in hub/friendly rooms,
  reusing the same cache + bond system. Needs encounter/room design.
- **Grammar-aware constraints:** the grammar tracking system (2026-05-24) could
  eventually constrain generation grammar the way vocab constrains words.
