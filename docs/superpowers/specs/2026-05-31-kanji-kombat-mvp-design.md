# Kanji Kombat MVP Design

**Date:** 2026-05-31  
**Status:** Draft for user review  
**Feature:** Hub-accessible script practice combat mode

## Summary

Kanji Kombat is a hub-launched mini game for practicing hiragana, katakana, and kanji through fast combat quizzes. It reuses the existing combat engine, dex/action cursor ordering, enemy actions, damage/VFX, boss scaling, and run-scoped XP/level-up methods. New code owns only the mode-specific learning rules: script deck selection, daily new-card cadence, quiz generation, wave count, streak rewards, and daily completion.

The mode is intentionally separate from Speed Review. Speed Review must exclude script cards, while Kanji Kombat must include only script cards.

## Goals

- Add a hub button labeled `Kanji Kombat`.
- Let the player choose one unlocked creature to start a Kanji Kombat run.
- Practice only `hiragana`, `katakana`, and `kanji` cards in this mode.
- Use FSRS due-card logic for script reviews.
- Introduce new script cards every 3-5 reviews, up to 20 new cards per day.
- Reuse existing combat, enemy turn, boss scaling, XP, and level-up behavior instead of duplicating those systems.
- End the daily session with `Come back later!` once all due work is done and no more new cards can be introduced that day.
- Show an adapted adventure report for Kanji Kombat defeat or daily completion.

## Non-Goals

- No new combat engine.
- No duplicate creature XP or level-up functions.
- No persistent creature XP outside the Kanji Kombat run.
- No kanji ordering algorithm beyond the first 100 MVP list.
- No Speed Review support for hiragana, katakana, or kanji cards.
- No dictionary edits as part of this feature.

## Mode Entry

The hub gains a `Kanji Kombat` action. Kanji Kombat is implemented as a special run mode, not as a separate combat session object.

Run/combat markers:

- `run.mode = 'kanjiKombat'`
- `run.kanjiKombat = { ...modeState }`
- `combat.mode = 'kanjiKombat'` while a wave is active

Selecting the hub action starts a Kanji Kombat setup flow:

1. Check whether the player has any eligible due cards or daily new cards in the active script deck.
2. If no eligible work remains, show `Come back later!` and keep the player in the hub.
3. If work is available, prompt the player to choose one creature from their unlocked collection.
4. Start a Kanji Kombat run with that single active ally.

The selected creature is copied into the run-scoped party, following the same temporary progression model regular runs use. Any XP and level-ups earned during the mode are for that run only.

Normal run side effects suppressed in Kanji Kombat:

- Area selection and area completion.
- Room generation and room progression.
- `currentRoom.interacted` bookkeeping.
- `currentAreaEncounters`, `areasCompleted`, and `areaCleared` progression.
- Post-combat shops.
- Befriend/capture prompts and pending capture flushes.
- Persistent creature collection additions.
- Persistent boss-defeated tracking from miniboss waves.
- Element drops, ingredient drops, credits, and other normal run rewards.
- Initial party skill pick flow.

The mode still reuses run-scoped party, HP, XP, level-up, buffs, debuffs, combat rendering, and enemy action behavior.

## Script Deck Scope

Card types are explicit:

- `hiragana`
- `katakana`
- `kanji`

Kanji Kombat includes only these three card types. Speed Review excludes these three card types, even though they remain part of the user's overall card collection/SRS data.

Script cards live in a separate generic SRS deck named `script`, not in the `vocab` deck. Each script card has a `type` field of `hiragana`, `katakana`, or `kanji`. Speed Review remains backed by the `vocab` deck and must not read from the `script` deck.

Script card shape:

```javascript
{
  id: 'hiragana:あ',
  type: 'hiragana',
  prompt: 'あ',
  answer: 'a',
  reading: 'あ',
  keyword: null,
  sortIndex: 1,
  source: 'builtin-hiragana',
  // plus FSRS fields
}
```

Kanji cards use `id: 'kanji:人'`, `prompt: '人'`, `answer: 'person'`, `keyword: 'person'`, and the Koto dictionary primary reading in `reading`.

Existing legacy `kana.cards` data is migrated into the `script` deck on first Kanji Kombat access. The migration copies hiragana FSRS fields into matching `script` cards when present and does not delete the old `kana` data in the MVP. New hiragana reviews after migration use the `script` deck.

Active script order:

1. Hiragana
2. Katakana
3. Kanji

The mode uses only one active script deck at a time. Hiragana must graduate before katakana is active. Katakana must graduate before kanji is active.

Script graduation means every card in that script deck has reached FSRS `Review` state. Initial new-card modal responses alone do not graduate a deck.

Katakana is seeded as script cards from a static katakana deck. Kanji is seeded from Koto's internal kanji dictionary in frequency order.

## FSRS Behavior

Kanji Kombat uses the existing FSRS deck/card primitives. The mode controller decides when to introduce a new card; FSRS records the review result and schedules the card after that point.

Review answer grading:

- Correct quiz answer: grade the current card as `Good`.
- Wrong quiz answer: grade the current card as `Again`.
- New-card intro modal `I knew it`: grade `Good`.
- New-card intro modal `I didn't know it`: grade `Again`.

Because `Good` on a brand-new card enters FSRS learning state in the current `ts-fsrs` behavior, the card can still be due soon. That is expected. Graduation remains tied to FSRS `Review` state.

## Daily New-Card Cadence

Kanji Kombat primarily serves due FSRS cards from the active script deck.

New cards are introduced through a mode-owned cadence:

- Introduce one new card every 3-5 completed reviews.
- The interval can be randomized per insertion within that range.
- Introduce at most 20 new cards per user per local day.
- Track daily new-card count separately from due-card review count.

Only combat quiz answers count as completed reviews for the 3-5 review spacing interval. New-card intro modal responses count toward daily new-card count and report stats, but they do not increment the spacing interval.

If due cards exist, new cards are introduced only when the spacing interval fires. If no due cards exist but unintroduced cards remain under the daily cap, the controller introduces one new card immediately. After the intro modal is graded, the controller reselects work from FSRS; if there is still no due work and the daily cap is not exhausted, it introduces the next new card. If the daily cap is exhausted and there is no due work, the mode shows `Come back later!`.

New-card intro flow:

1. Pause combat interaction before the quiz for the new card.
2. Show a modal with the script character and its answer metadata.
3. Offer `I knew it` and `I didn't know it`.
4. Grade the card through FSRS as `Good` or `Again`.
5. Do not immediately quiz the same card as part of the same presentation.
6. Resume the quiz/combat loop by selecting the next eligible due card from FSRS.

When the active script deck has no due cards and no remaining new cards available under the daily cap, Kanji Kombat is complete for the day and shows `Come back later!`.

## Kanji Curriculum

Kanji cards represent one kanji character and one primary English meaning. Quiz choices for kanji use those English meanings.

Kanji cards are sourced from Koto's internal kanji dictionary at `data/kanji/koto-kanji-dictionary.json`. The dictionary contains 4000 entries ordered by a dated top-4000 JPDB frequency snapshot, while card meanings/readings/examples come from Koto-maintained dictionary fields.

JPDB is only an ordering input and is not included in the dictionary `sources` metadata. The shipping dictionary source metadata names only the enrichment sources used for meanings, readings, and examples.

The game introduces new kanji as the next unlearned item in the ordered `KANJI_SCRIPT_CARDS` array. There is no separate adaptive selector for new kanji. Reviews are still FSRS-driven by due date.

The first four kanji cards in the current dictionary order are:

| # | Kanji | Reading | Primary Meaning |
|---:|---|---|---|
| 1 | 人 | ひと | person |
| 2 | 言 | げん | say |
| 3 | 見 | ケン | see |
| 4 | 一 | いち | one |

## Quiz Rules

When an ally actor is ready to act, the move selection area becomes a quiz.

Prompt:

- Hiragana card: show the hiragana character.
- Katakana card: show the katakana character.
- Kanji card: show the kanji character.

Choices:

- Hiragana/katakana: four romaji choices.
- Kanji: four English keyword choices.

Distractors:

- Pull the other three answers randomly from the full possible answer list for the active script deck.
- The correct answer appears once.
- Duplicate answer labels are not allowed in the same quiz.

Correct answer:

- Grade the card `Good` through FSRS.
- Preserve the current streak.
- Submit a fixed pseudo-move for the acting ally.

Wrong answer:

- Grade the card `Again`.
- Reset the current streak to 0.
- Consume the acting ally's action.
- Deal no damage.

## Combat Rules

Kanji Kombat reuses regular combat turn ordering, including dex/action cursor behavior. It does not run "all living allies, then all enemies" as a custom loop.

Kanji Kombat must not submit client-supplied synthetic `moveId` values through the normal move-selection contract. The current combat path validates that the submitted choice matches the current action cursor and then resolves only moves present on the creature. Kanji Kombat therefore adds a server-owned action path:

```javascript
gameManager.submitKanjiKombatAnswer(answerId)
```

The client submits only the selected answer id for the current quiz. The server derives the current `combat.actionCursor`, validates that it is an ally cursor in a Kanji Kombat run, checks the answer against the server-owned quiz payload, grades FSRS, updates streak state, and then resolves the current actor.

Correct-answer synthetic action:

- Build a server-owned synthetic move object, not a creature learnset move.
- Route it through a shared synthetic-move resolver used by the existing single-actor combat path.
- Do not require the synthetic move to exist in `creature.moves`.
- Do not allow the client to specify power, element, move id, or MP cost.

Synthetic move properties:

- Power: 15
- Element: acting ally's element
- MP cost: 0
- Target type: single enemy
- Target: one enemy using the existing single-enemy auto-target behavior when only one enemy is alive; otherwise use the existing target selection/targeting path.
- Visuals: call the same frontend attack/VFX path used by regular single-target creature moves.

Wrong-answer no-op action:

- Grade the card `Again`.
- Reset the streak.
- Resolve a server-owned no-op for the current ally actor.
- The no-op creates an action segment with no attacks and no damage.
- The no-op advances `combat.actionCursor` using the same next-cursor logic regular combat uses.
- Enemy actors that follow in dex order resolve normally.

Enemies use regular moves when their turns arrive.

The implementation must route through the existing combat resolution, XP award, level-up, enemy attack, status/buff, HP bar, and battle scene rendering paths rather than introducing duplicate implementations of those behaviors.

## Wave Lifecycle

Kanji Kombat must not use normal room-combat victory cleanup for wave continuation. In normal runs, `finalizeCombatVictory()` ends combat, increments area encounter state, marks the current room interacted, can flush captures, and can lead into post-combat flow. That conflicts with endless Kanji Kombat waves.

When all enemies are defeated in `run.mode === 'kanjiKombat'`, combat resolution branches to a Kanji Kombat wave handler instead of normal victory finalization:

```javascript
kanjiKombatService.completeWaveAndMaybeStartNext()
```

Wave completion responsibilities:

- Keep the Kanji Kombat run active unless the daily deck is complete.
- Increment `run.kanjiKombat.wave`.
- Update report stats such as waves cleared and minibosses defeated.
- Preserve run-scoped ally HP, MP, XP, levels, buffs, and debuffs according to normal combat timing rules unless a streak reward changes them.
- Skip capture/befriend handling.
- Skip post-combat shop generation.
- Skip element drops, credits, ingredients, and persistent collection changes.
- Skip `finalizeCombatVictory()` and any room/area bookkeeping.
- Check whether daily deck work is now complete.
- If work remains, spawn the next wave by creating/replacing the combat enemy list, rebuilding the action cursor with existing dex ordering, and returning a combat-continuation payload to the frontend.
- If no work remains, end the Kanji Kombat run with daily completion and show the adapted report.

Defeat uses the existing KO and run-inactive mechanics, then calls a Kanji Kombat defeat finalizer that shows the adapted report. The Kanji Kombat defeat finalizer does not flush pending captures or apply normal run reward cleanup.

## Waves And Enemies

Kanji Kombat waves continue until party defeat or daily deck completion.

Regular waves:

- Spawn 1-3 enemies.
- Pull enemies from all areas the player has unlocked so far.
- Use the existing enemy scaling logic.

Miniboss waves:

- Every 10th wave is a miniboss wave.
- The miniboss wave replaces the regular wave.
- It contains a single boss.
- The boss is randomly selected from boss creatures across areas the player has unlocked so far.
- Use the existing boss scaling behavior for sprite size and HP.

## Streak Rewards

Streak counts consecutive correct answers. A wrong answer breaks the streak.

Rewards:

- 5 correct: small heal to all current allies.
- 10 correct: random buff.
- 15 correct: big heal to all current allies.
- 20 correct: random unlocked ally joins this Kanji Kombat run, up to a maximum of 3 active allies. If already at 3 allies, full heal all allies instead.

After the 20-streak reward resolves, the streak counter resets to 0 and the cycle can repeat.

The random ally pool is the player's unlocked creature collection, excluding creatures already active in the Kanji Kombat run.

## Results And Reporting

On defeat or daily completion, show an adapted adventure report instead of returning directly to the hub.

The report should include Kanji Kombat-specific stats:

- Waves cleared.
- Highest streak.
- Correct answers.
- Wrong answers.
- Accuracy.
- New cards introduced.
- Cards reviewed.
- Script deck practiced.
- Minibosses defeated.
- Temporary creature levels reached during the run.

## State And Persistence

Persistent state:

- SRS card data and scheduling in the `script` deck.
- One-time migration marker for legacy `kana` to `script` deck migration.
- Daily new-card count and date for Kanji Kombat.
- Any durable "daily completed" marker needed to show `Come back later!`.

Run-scoped state:

- Selected/earned Kanji Kombat party.
- Temporary creature XP and levels.
- Current wave number.
- Current streak.
- Current quiz card and answer choices.
- Kanji Kombat report stats.
- `mode: 'kanjiKombat'` and `kanjiKombat` mode state.

Speed Review exclusion is enforced by deck boundary in the MVP: Speed Review continues reading the `vocab` deck only, while Kanji Kombat reads the `script` deck only. If a future shared due-card endpoint aggregates multiple decks, it must filter out `hiragana`, `katakana`, and `kanji` card types for Speed Review without deleting those cards from the user's collection.

## Error Handling

- If the active script deck cannot produce one correct answer and three distinct distractors, the controller seeds any missing static script cards for that deck and retries quiz generation. If the deck still has fewer than four distinct answer labels after seeding, Kanji Kombat does not start and shows `Come back later!`.
- If the player has no unlocked creatures, hide or disable Kanji Kombat with a short explanation.
- If no enemies are available from unlocked areas, fall back to the earliest available area creature pool rather than failing the mode.
- If no unlocked bosses are available for a miniboss wave, spawn a regular single-enemy wave using normal scaling.

## Testing Plan

Unit tests:

- Active script deck selection: hiragana before katakana before kanji.
- FSRS script graduation requires all cards in `Review`.
- Legacy `kana` cards migrate into `script` hiragana cards without deleting old data.
- New-card cadence inserts cards every 3-5 reviews and caps at 20 per day.
- New-card intro responses do not double-grade via an immediate quiz for the same presentation.
- Zero-due/new-remaining behavior introduces new cards until due work exists or the daily cap is exhausted.
- Speed Review excludes `hiragana`, `katakana`, and `kanji` types.
- Kanji Kombat includes only `hiragana`, `katakana`, and `kanji` types.
- Quiz distractors are unique and drawn from the active script deck's answer pool.
- Wrong answer grades `Again`, consumes action, and breaks streak.
- New-card modal grades `Good` or `Again`.
- Streak reward thresholds and reset-after-20 behavior.
- Synthetic Kanji Kombat attack resolves without requiring a matching move in `creature.moves`.
- Kanji Kombat no-op advances the current action cursor without dealing damage.
- Kanji Kombat wave victory does not call normal room victory cleanup.

Integration tests:

- Starting Kanji Kombat from hub creates a run-scoped one-creature party.
- Correct quiz answer submits the pseudo-move through the existing combat path.
- Wrong quiz answer submits the no-op path and then advances to the next dex/action cursor actor.
- Enemy turns continue through regular dex/action cursor ordering.
- XP/level-up behavior uses existing run-scoped combat methods.
- Every 10th wave spawns a single boss when eligible.
- Wave completion spawns the next wave without room progression, post-combat shop, capture, drops, or area bookkeeping.
- Daily completion produces `Come back later!`.
- Defeat and daily completion show Kanji Kombat report data.

Visual/manual verification:

- Verify the hub button and creature selection flow.
- Verify the quiz replaces move selection only during ally turns.
- Verify new-card modal behavior.
- Verify miniboss sprite/HP scaling.
- Verify adapted adventure report display.

## Acceptance Criteria

- The hub exposes `Kanji Kombat`.
- Kanji Kombat never serves non-script card types.
- Speed Review never serves hiragana, katakana, or kanji cards and continues reading the `vocab` deck only.
- Hiragana, katakana, and kanji cards remain in the user's overall card collection.
- Script cards live in the separate `script` SRS deck with explicit `type` metadata.
- Existing legacy `kana` hiragana progress is copied into the `script` deck on first Kanji Kombat access.
- The active script deck advances only when every card in the current script deck reaches FSRS `Review`.
- The kanji deck uses the 4000-entry Koto kanji dictionary in frequency order.
- The Koto dictionary does not use WaniKani as a shipping source.
- New cards appear every 3-5 reviews, with no more than 20 new script cards introduced per day.
- If no due cards exist but daily new cards remain, Kanji Kombat introduces new cards until due work exists or the cap is exhausted.
- New-card intro modal grades `Good` for `I knew it` and `Again` for `I didn't know it`.
- New-card intro grading is the review for that presentation; the same card is not immediately quiz-graded in the same presentation.
- Correct answers trigger a 15-power element-matched pseudo-move through existing combat systems.
- Wrong answers grade `Again`, consume the actor's action, and deal no damage.
- Correct and wrong answer actions are server-owned Kanji Kombat action paths, not fake client-submitted move ids.
- Combat turn order follows the existing dex/action cursor system.
- Regular waves use 1-3 enemies from unlocked areas.
- Every 10th eligible wave is a single scaled boss.
- Wave continuation bypasses normal room victory cleanup, post-combat shops, captures, drops, and area bookkeeping.
- Streak rewards trigger at 5, 10, 15, and 20, then reset after 20.
- Run-scoped creature XP/level-up behavior reuses existing methods and does not persist outside the Kanji Kombat run.
- Defeat and daily completion show an adapted adventure report.
