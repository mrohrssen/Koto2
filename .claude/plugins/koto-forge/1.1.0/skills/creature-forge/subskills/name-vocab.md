# Name & Vocab Generator (Subagent 1)

You are generating creature name candidates and a vocab table for a Japanese vocabulary learning RPG creature.

## Input

Read the baton JSON file at the path provided to you. It contains:

```json
{
  "name": "ハサミ",
  "reading": "はさみ",
  "meaning": "scissors",
  "rank": 13900,
  "frequencyTier": "epic",
  "visualTier": "rare",
  "allForms": [{"spelling": "ハサミ", "rank": 13900}, {"spelling": "鋏", "rank": 17000}],
  "meanings": [["scissors"]],
  "tierCeilings": { ... },
  "rosterNames": ["Kamedor", "Irukami", ...],
  "rosterVerbs": [...]
}
```

## Your Task

Produce **3 stylized name candidates** and a **vocab table** for the Japanese word.

### Name Rules

1. **The ENTIRE base reading's romaji must be present as a contiguous substring.** はさみ = "hasami" must appear in full. "Hasamaw" (hasami present) is valid. "Hasaw" (dropped "mi") is invalid. "Samira" (dropped "ha") is invalid. No rearranging, splitting, or partial inclusion.

2. **Never offer raw romaji as-is** — always stylize into a creature name. Techniques: add suffix/prefix, double a syllable, blend with an English or Japanese word, add phonetic flair (gemination, vowel extension).

3. **Match the visual tier, not frequency tier.** Common/Uncommon names sound cute and fun. Rare names feel balanced and distinct. Epic/Legendary names sound imposing or mythical.

4. **No name collisions** — check `rosterNames` in the baton and don't reuse any existing name.

5. **Be creative.** We need 1000+ unique creatures — don't rely on a fixed set of suffixes.

### Name Output Format

For each candidate, provide:
- Name (romanized, capitalized)
- Katakana rendering
- Language thesis: how the name was constructed from the Japanese and why it works

### Vocab Table

Present the Japanese word data from the baton:
- Word (most common spelling)
- Reading (hiragana)
- Meaning (raw JPDB meanings array — do NOT paraphrase)
- JPDB Rank
- All forms with ranks

## Output

Read the baton JSON, add your output fields, write it back. Append these fields:

```json
{
  "nameCandidates": [
    {
      "label": "A",
      "name": "Hasamaw",
      "nameKatakana": "ハサマウ",
      "thesis": "はさみ (hasami) + '-maw' (English: jaws) — scissors cut like a bite"
    },
    { "label": "B", ... },
    { "label": "C", ... }
  ],
  "vocabTable": {
    "word": "ハサミ",
    "reading": "はさみ",
    "meanings": [["scissors"]],
    "rank": 13900,
    "allForms": "ハサミ(13,900), 鋏(17,000)"
  }
}
```

Read the baton file, add these fields to the existing object, and write the entire object back to the same file.
