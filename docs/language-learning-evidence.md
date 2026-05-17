# Language Learning Evidence

**Date:** 2026-05-17
**Status:** Marketing and product evidence reference

This document supports the claim:

> **17 learning features backed by 500+ studies and experiments.**

Safer long-form wording:

> **Koto combines 17 research-backed learning features, supported by 500+ studies and experiments across comprehensible input, spaced repetition, active recall, vocabulary glossing, and pronunciation research.**

Use **"studies and experiments"** for the 500+ headline. If the copy must say **"studies"** only, use the stricter version:

> **17 learning features backed by 400+ published studies.**

## Counting Rule

The headline counts research syntheses that map to implemented learning mechanics in Koto. It does **not** mean 500+ studies tested Koto directly, and it is not a de-duplicated bibliography across every meta-analysis.

The headline count is intentionally rounded down:

| Evidence area | Research synthesis | Count used for headline |
|---|---|---:|
| Spacing / SRS | Cepeda et al. distributed-practice review: 317 experiments in 184 articles | 317 experiments |
| Comprehensible input / extensive reading | Nakanishi extensive reading meta-analysis | 34 studies |
| Active recall / intentional vocabulary learning | Yanagisawa & Webb intentional vocabulary-learning activities meta-analysis | 22 studies |
| Repeated exposure | Uchihara, Webb & Yanagisawa repetition meta-analysis | 26 studies |
| Glossing / lookup support | Multimedia glosses second-round meta-analysis | 136 original studies |
| Pronunciation / audio | Computer-assisted pronunciation training meta-analysis | 20 studies |
| **Total** |  | **555 studies and experiments** |

For stricter wording, count Cepeda's **184 articles** instead of **317 experiments**:

`184 + 34 + 22 + 26 + 136 + 20 = 422 published studies/articles`

That supports **"400+ published studies"**.

## The 17 Learning Features

### 1. Personalized i+1 / Comprehensible Input

Koto's core language principle is that Japanese text should contain only words the player knows plus at most one unknown word per sentence. This maps to comprehensible input, graded reading, and extensive reading research.

Code anchors:
- `src/game/bootstrap/renderer.js`
- `public/js/ui/bootstrap-client.js`
- `src/game/dialogue-filter.js`

Research anchors:
- Krashen's input hypothesis and comprehension hypothesis
- Nakanishi's extensive reading meta-analysis

### 2. Known-Vocabulary AI Narration Constraints

AI-generated narration is prompted with the player's usable vocabulary, capped at 8,000 words, and instructed not to use words outside that list except basic particles and grammar.

Code anchors:
- `src/narration-engine/vocab-constraints.js`
- `docs/ARCHITECTURE.md`

Research anchors:
- Comprehensible input
- Extensive reading and graded input

### 3. Post-Generation Vocabulary Repair

After AI generation, Japanese text can be checked sentence-by-sentence and repaired when it exceeds the i+1 target.

Code anchors:
- `src/game/vocab-repair.js`
- `tests/unit/narration-engine/dialogue-repair.test.js`

Research anchors:
- Comprehensible input
- Graded input

### 4. Static Dialogue Eligibility Filtering

NPC lines, barks, and scripts are filtered against the player's known vocabulary so static content follows the same i+1 constraint as AI text.

Code anchors:
- `src/game/dialogue-filter.js`
- `tests/unit/dialogue-filter.test.js`
- `data/dialogue/frame-sources.json`
- `data/dialogue/frames.json`

Research anchors:
- Comprehensible input
- Extensive reading
- Gloss-supported reading

### 5. Adaptive Known / Unknown Word Rendering

Known words render as Japanese reinforcement; unknown words show readings and English meaning support. In English-first contexts, only one unknown word is taught while remaining unknowns stay in English.

Code anchors:
- `src/game/bootstrap/renderer.js`
- `public/js/ui/bootstrap-client.js`
- `tests/integration/bootstrap-integration.test.js`

Research anchors:
- Comprehensible input
- Multimedia / textual glossing

### 6. Furigana Reading Support

Japanese words are rendered with reading support so learners can connect kanji, kana, and pronunciation.

Code anchors:
- `src/game/bootstrap/renderer.js`
- `public/js/ui/bootstrap-client.js`
- `public/js/ui/romaji.js`

Research anchors:
- Glossing
- Reading support in computer-assisted language learning

### 7. Romaji Reading Support

Early reading support includes romaji displays derived from kana readings, reducing decoding friction for newer learners.

Code anchors:
- `public/js/ui/bootstrap-client.js`
- `public/js/ui/romaji.js`

Research anchors:
- Beginner scaffolding
- Multimedia / textual glossing

### 8. Inline English Glosses

Unknown Japanese words are shown with compact English meanings inline, letting players continue reading without leaving the game flow.

Code anchors:
- `public/js/ui/bootstrap-client.js`
- `public/js/ui/dialogue-display.js`
- `public/js/ui/narration-box.js`

Research anchors:
- Computer-mediated glosses
- Textual glosses
- Multimedia glosses

### 9. Clickable Dictionary Lookup

Players can click Japanese words in dialogue to see the base form, reading, part of speech, known/new state, and dictionary definitions.

Code anchors:
- `public/js/ui/dialogue-word-lookup.js`
- `src/routes/game/known-words.js`
- `tests/unit/dialogue-word-lookup.test.js`

Research anchors:
- Computer-mediated glosses
- Lookup-supported reading

### 10. Contextual Meaning Overrides

When a word's in-context meaning differs from its primary dictionary definition, Koto can show the contextual meaning first while preserving dictionary definitions below it.

Code anchors:
- `public/js/ui/dialogue-word-lookup.js`
- `src/game/enrich-tokens.js`
- `tests/unit/dialogue-word-lookup.test.js`

Research anchors:
- Glossing
- Context-supported vocabulary acquisition

### 11. FSRS Spaced Repetition for Vocabulary

Vocabulary cards are scheduled with FSRS states, due dates, lapses, and review intervals. Due words are exposed through review routes and speed review.

Code anchors:
- `src/game/internal-srs.js`
- `src/game/vocab-manager.js`
- `src/routes/game/known-words.js`
- `tests/unit/game/vocab-srs.test.js`

Research anchors:
- Distributed practice / spacing effect
- Spaced retrieval practice
- Deliberate vocabulary learning

### 12. FSRS Kana Learning

Kana has its own FSRS-backed deck, row unlocks, due cards, and graduation state.

Code anchors:
- `src/game/internal-srs.js`
- `src/game/hiragana-deck.js`
- `docs/superpowers/specs/2026-03-18-fsrs-hiragana-combat-design.md`

Research anchors:
- Distributed practice / spacing effect
- Active recall

### 13. Due-Word Speed Review

The speed review UI pulls due vocabulary and turns review into a fast swipe-based loop, including queue refresh and in-flight review sync.

Code anchors:
- `public/js/ui/speed-review.js`
- `public/game.js`
- `src/routes/game/known-words.js`

Research anchors:
- Spaced repetition
- Retrieval practice
- Intentional vocabulary-learning activities

### 14. Active Recall Grading: Knew / Forgot

Players grade words as remembered or forgotten. Those grades feed FSRS as `good` or `again`, changing future scheduling.

Code anchors:
- `src/game/internal-srs.js`
- `src/routes/game/known-words.js`
- `public/js/ui/speed-review.js`
- `public/js/ui/dialogue-word-lookup.js`

Research anchors:
- Retrieval practice
- Testing effect
- Intentional vocabulary learning

### 15. Repeated Exposure Tracking Before Review

Words are not immediately treated as learned. Koto tracks exposures and creates a vocabulary SRS card after repeated exposure, currently at a threshold of five exposures.

Code anchors:
- `src/game/bootstrap/word-knowledge.js`
- `public/js/ui/bootstrap-client.js`
- `tests/unit/game/vocab-srs.test.js`

Research anchors:
- Repetition and incidental vocabulary learning
- Encounter frequency effects

### 16. Japanese TTS Narration

Japanese narration can be spoken aloud through VOICEVOX, giving players listening input in addition to reading input.

Code anchors:
- `src/routes/tts.js`
- `src/voicevox.js`
- `public/js/tts.js`
- `docs/ARCHITECTURE.md`

Research anchors:
- Computer-assisted pronunciation training
- Multimodal input
- Listening and pronunciation support

### 17. Click-to-Hear Individual Word Audio

Clicked dialogue words can trigger word-level audio, helping players connect spelling, reading, and sound at the exact point of curiosity.

Code anchors:
- `public/js/ui/dialogue-word-lookup.js`
- `src/routes/tts.js`
- `src/services/dialogue-card-tts.js`
- `tests/unit/routes/tts-dialogue-word.test.js`

Research anchors:
- Computer-assisted pronunciation training
- Multimedia glosses
- Phonological encoding support

## Related Learning Features Not Counted Separately

The 17-feature count is conservative. Koto also has learning-relevant systems that can be mentioned elsewhere but should not inflate this headline unless the feature list is revised:

- Frequency-prioritized vocabulary discovery from JPDB / staged word data
- Game-context vocabulary through creatures, moves, items, areas, NPCs, and barks
- Daily word discovery limits to manage cognitive load
- NPC dialogue practice and relationship-driven repetition
- Combat move selection that repeatedly asks players to read Japanese action verbs
- Kanji/kana display progression by area

## Recommended Copy

Best short line:

> **17 learning features backed by 500+ studies and experiments.**

Best landing-page sentence:

> **Koto combines 17 research-backed learning features, supported by 500+ studies and experiments across comprehensible input, spaced repetition, active recall, vocabulary glossing, and pronunciation research.**

Strict version:

> **17 learning features backed by 400+ published studies.**

Avoid:

- "500 studies prove Koto works."
- "Clinically proven."
- "500 studies of Koto."
- "Backed by 555 studies" without explaining that the count includes experiments and studies from research syntheses.

## References

These are the research syntheses used for the headline count. They cite the primary studies/experiments included in the 500+ total.

1. Cepeda, N. J., Pashler, H., Vul, E., Wixted, J. T., & Rohrer, D. (2006). **Distributed practice in verbal recall tasks: A review and quantitative synthesis.** *Psychological Bulletin, 132*(3), 354-380. Reports 317 experiments in 184 articles. https://www.yorku.ca/ncepeda/publications/CPVWR2006.html
2. Nakanishi, T. (2015). **A meta-analysis of extensive reading research.** *TESOL Quarterly, 49*(1), 6-37. Includes 34 studies, 43 effect sizes, and 3,942 participants. https://onlinelibrary.wiley.com/doi/10.1002/tesq.157
3. Uchihara, T., Webb, S., & Yanagisawa, A. (2019). **The effects of repetition on incidental vocabulary learning: A meta-analysis of correlational studies.** *Language Learning, 69*(3), 559-599. Includes 26 studies and 45 effect sizes. https://onlinelibrary.wiley.com/doi/10.1111/lang.12343
4. Yanagisawa, A., & Webb, S. **How effective are intentional vocabulary-learning activities? A meta-analysis.** Includes 22 studies and 100 effect sizes across flashcards, word lists, writing, and fill-in-the-blanks. https://www.academia.edu/74399712/How_Effective_Are_Intentional_Vocabulary_Learning_Activities_A_Meta_Analysis
5. **The effect of textual glosses on L2 vocabulary acquisition: A meta-analysis.** Includes 20 studies and 2,291 participants; reports medium effects and delayed retention benefits. https://journals.sagepub.com/doi/10.1177/13621688211011511
6. **Multimedia glosses and second language vocabulary learning: A second-round meta-analysis.** Synthesizes seven prior meta-analyses and 136 original studies. https://doaj.org/article/d4e748b431a644d080453ea22b22db8e
7. **The effectiveness of computer-assisted pronunciation training: A meta-analysis.** Includes 20 studies and 1,014 participants; reports positive pronunciation effects with quality caveats. https://eric.ed.gov/?id=EJ1231516
8. **The effectiveness of L2 vocabulary instruction: A meta-analysis.** Includes 16 primary studies and 1,008 participants; supports the broader effectiveness of explicit L2 vocabulary instruction. Not included in the 555 headline count to avoid unnecessary inflation. https://link.springer.com/article/10.1186/s40862-018-0062-2
9. Krashen, S. D. **The comprehension hypothesis extended.** Theoretical anchor for comprehensible input; not included in the numeric count. https://sdkrashen.com/content/articles/comprehension_hypothesis_extended.pdf

