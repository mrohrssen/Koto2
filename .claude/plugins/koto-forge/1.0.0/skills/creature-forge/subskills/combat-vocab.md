# Combat Vocab Generator (Subagent 2)

You are generating attack and ultimate ability candidates for a Japanese vocabulary learning RPG creature.

## Input

Read the baton JSON file at the path provided to you. Key fields you need:

- `baseMeaning` — the creature's concept (e.g., "scissors", "turtle")
- `frequencyTier` / `visualTier` — the creature's tiers
- `tierCeilings.skillPreferred` / `tierCeilings.skillCeiling` — frequency rank limits for combat verbs
- `rosterVerbs` — array of `{word, count}` showing which verbs are already used across the roster

## Your Task

Produce **3 attack candidates** and **3 ultimate candidates**, each a Japanese verb suitable as a combat move.

### Rules

1. **Each candidate must be a real Japanese verb in dictionary form.**

2. **JPDB rank must be within tier ceilings.** Prefer below `skillPreferred`, hard ceiling at `skillCeiling`. Hard-discard anything rank 30000+.

3. **Use the most common spelling form.** Run JPDB lookup to resolve all forms and use the lowest-rank spelling.

4. **Translation accuracy is NON-NEGOTIABLE.** This is a language learning game — every meaning the player sees is something they will memorize.
   - Use the primary dictionary definition from JPDB
   - NEVER change a word's transitivity: 狂う = "go mad" NOT "drive mad"; 散る = "scatter" NOT "shatter"
   - NEVER embellish: "invite" stays "invite", not "lure"; "scatter" stays "scatter", not "shatter"
   - If the accurate translation feels weak as an ability name, pick a different word — never bend the translation
   - Show the raw JPDB `meanings` array for every candidate

5. **Must work as a natural combat action in Japanese.** Would a Japanese player hear this verb and picture a battle move? Transitive verbs acting on an opponent are ideal. Intransitive verbs can work if they describe clear combat motion (飛ぶ "fly/jump"). The English is shown as "[Name] used [Base] [Attack]" so it should read smoothly.

6. **Attacks and ultimates must not overlap** — no verb appears in both lists.

7. **Roster verb awareness.** Check `rosterVerbs` in the baton. Avoid verbs with count >= 3 (already used on 3+ creatures). Common combat verbs like 噛む, 切る, 打つ can repeat — the base word contextualizes each usage. Only avoid heavy repetition.

8. **Ultimates should feel more powerful** than basic attacks. Prefer different vocabulary from attacks.

### JPDB Lookup

Write a temp script to `/tmp/creature-combat-lookup.mjs` and run it:

```javascript
#!/usr/bin/env node
const { resolveCommonForms, tierFromRank } = await import(process.cwd() + '/scripts/lib/jpdb-helpers.mjs');
import { readFile } from 'fs/promises';

const words = ['切る', '挟む', '閉じる', '砕く', '裂く', '研ぐ']; // your candidates
const apiKey = (await readFile(process.cwd() + '/data/.creature-forge-jpdb-key', 'utf8')).trim();
const results = await resolveCommonForms(words, apiKey);

for (const r of results) {
  console.log(JSON.stringify(r));
}
```

**Use unambiguous forms for input.** JPDB misidentifies short hiragana as particles. Use kanji or katakana: `['亀', '犀']` not `['かめ', 'さい']`.

## Output

Read the baton JSON, add your output fields, write it back. Append:

```json
{
  "attackCandidates": [
    {
      "label": "A",
      "word": "切る",
      "reading": "きる",
      "meaning": "Cut",
      "rank": 283,
      "allForms": "切る(283)",
      "rawMeanings": [["cut", "slash", "sever"]]
    },
    { "label": "B", ... },
    { "label": "C", ... }
  ],
  "ultimateCandidates": [
    {
      "label": "A",
      "word": "砕く",
      "reading": "くだく",
      "meaning": "Crush",
      "rank": 5200,
      "allForms": "砕く(5,200)",
      "rawMeanings": [["crush", "smash", "break"]]
    },
    { "label": "B", ... },
    { "label": "C", ... }
  ]
}
```

Read the baton file, add these fields to the existing object, and write the entire object back to the same file.
