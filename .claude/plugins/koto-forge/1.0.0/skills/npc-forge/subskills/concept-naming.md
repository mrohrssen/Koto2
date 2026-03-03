# Concept & Naming Generator (Subagent 1)

You are generating NPC concepts, JPDB-verified vocab words, and name candidates for 5 NPCs in a Japanese vocabulary learning RPG.

## Input

Read the baton JSON file at the path provided to you. It contains:

```json
{
  "area": {
    "id": "suizokukan",
    "name": "水族館",
    "nameEn": "Aquarium",
    "theme": "Marine life, water, oceanic serenity",
    "description": "A vast public aquarium with floor-to-ceiling tanks..."
  },
  "existingNpcIds": ["yuki", "takashi"],
  "existingNpcNames": ["Yuki", "Takashi"]
}
```

### Stage-Aware Word Selection

If the baton contains `discoveredOccupations` (from forge-discovery.mjs), use these as your primary candidate pool. They are already:
- Filtered to the area's stage
- Verified to exist in JPDB
- Sorted by frequency rank

You may supplement with your own ideas, but prefer the discovered candidates as they are stage-appropriate.

## Your Task

Produce **5 NPC concepts**, each with:
- Base word (a person noun — the occupation or role this NPC teaches)
- Modifier word (a personality adjective that describes this NPC)
- 3 natural Japanese given name candidates
- One-liner character summary

### Concept Guidelines

1. **Thematic fit:** All 5 NPCs should fit the area's theme and description. An aquarium might have a 研究者 (researcher), 案内人 (guide), 管理人 (caretaker), 客 (visitor), or 店員 (gift shop clerk).

2. **Variety:** Don't make all 5 NPCs the same archetype. Mix occupations, ages, demeanors, and roles. Each NPC should teach a DIFFERENT person noun.

3. **Human believability:** These are human NPCs who work, live, or spend time in the area. They should feel like real people with relatable jobs or reasons to be there.

### Vocab Word Selection

For each NPC, pick:

1. **Base word — MUST be a person noun.** A word that describes a type of human being. The player learns this word by meeting this NPC. It must fit the area — pick occupations and roles that make sense for the location.

   **Reference list** (pick from these or use similar person nouns):

   *Occupations:* 医者 (doctor), 先生 (teacher), 料理人 (cook), 店員 (clerk), 漁師 (fisherman), 歌手 (singer), 画家 (painter), 運転手 (driver), 警備員 (guard), 看護師 (nurse), 農家 (farmer), 大工 (carpenter), 写真家 (photographer), 研究者 (researcher), 案内人 (guide), 整備士 (mechanic), 司書 (librarian), 薬剤師 (pharmacist), 船長 (captain), 管理人 (manager/caretaker), 技師 (engineer), 職人 (craftsperson), 記者 (journalist), 選手 (athlete), 兵士 (soldier), 配達員 (delivery person), 清掃員 (janitor), 受付 (receptionist), 調律師 (tuner), 飼育員 (zookeeper), 救助員 (rescuer), 消防士 (firefighter), 探偵 (detective), 通訳 (interpreter)

   *Social roles:* 客 (customer/guest), 学生 (student), 隣人 (neighbor), 仲間 (companion), 住民 (resident), 旅人 (traveler), ボランティア (volunteer)

   *Person types:* 大人 (adult), 老人 (elderly person), 少年 (boy), 少女 (girl), 若者 (young person)

   **DO NOT use:** nature nouns (水, 鳥, 風, 星, 葉, 影, 花, 火, etc.), abstract concepts, personality traits, or any word that does not describe a type of person. The entire point is to teach the player words for kinds of people.

2. **Modifier word** — a personality adjective that describes this NPC's demeanor. Examples: 優しい (gentle), 静か (quiet), 明るい (cheerful), 厳しい (strict), 真面目 (serious), 元気 (energetic), 怖い (scary), 面白い (interesting/funny), 強い (strong), 賢い (clever).

3. **JPDB frequency:** Prefer commonly-known words (rank < 10,000 preferred). Hard-discard rank 30,000+.

4. **Natural Japanese phrasing:** The pair should work as "[modifier]な/の[base]" — e.g., 優しい医者 (gentle doctor), 静かな研究者 (quiet researcher). A Japanese speaker hearing the phrase should immediately picture a coherent person.

### Translation Accuracy (NON-NEGOTIABLE)

- Use primary dictionary definitions from JPDB
- NEVER change transitivity or embellish meanings
- Show raw JPDB `meanings` array for every word
- If accurate translation feels weak, pick a different word — never bend the translation

### JPDB Lookup

Write a temp script to `/tmp/npc-concept-lookup.mjs` and run it:

```javascript
#!/usr/bin/env node
const { resolveCommonForms } = await import(process.cwd() + '/scripts/lib/jpdb-helpers.mjs');
import { readFile } from 'fs/promises';

const words = [
  '研究者', '優しい',  // NPC 1: base, modifier
  '案内人', '明るい',  // NPC 2: base, modifier
  // ... 3 more NPCs (10 words total)
];
const apiKey = (await readFile(process.cwd() + '/data/.creature-forge-jpdb-key', 'utf8')).trim();
const results = await resolveCommonForms(words, apiKey);

for (const r of results) {
  console.log(JSON.stringify(r));
}
```

Run with `node /tmp/npc-concept-lookup.mjs`.

### Name Rules

1. **Use natural Japanese given names.** Pick names a real Japanese person might have: ユキ, タカシ, ハルカ, ミサキ, ケンタ, マユ, リン, ソラ, アキラ, サクラ, ヒロト, カエデ, ナオ, レイ, シンジ, アオイ, etc.

2. **No name collisions** — check `existingNpcNames` in the baton and don't reuse any existing name.

3. **Variety** — mix masculine, feminine, and gender-neutral names. Don't use the same name endings repeatedly.

4. **Write in katakana** — all NPC names use katakana in this game (e.g., ユキ not 雪 or ゆき).

### Name Output Format

For each of 3 candidates per NPC, provide:
- **Label** — A, B, or C
- **Name** — romanized, capitalized (e.g., "Yuki")
- **Katakana** — correct rendering (e.g., "ユキ")

### One-liner Summary

Each NPC needs a short (10-15 words) one-liner that captures their occupation, personality, or defining trait. The base word (occupation) should be clearly reflected here.

Example: "Soft-spoken aquarium researcher who talks to the fish like old friends"

## Output

Read the baton JSON, add your output fields, write it back. Append this field:

```json
{
  "npcConcepts": [
    {
      "index": 1,
      "baseWord": "研究者",
      "baseReading": "けんきゅうしゃ",
      "baseMeaning": "researcher",
      "baseRank": 2400,
      "rawBaseMeanings": [["researcher; investigator"]],
      "allBaseForms": "研究者(2,400)",
      "modifier": {
        "word": "優しい",
        "reading": "やさしい",
        "meaning": "gentle",
        "rank": 600,
        "rawMeanings": [["tender; kind; gentle; graceful; affectionate; amiable"]],
        "allForms": "優しい(600)"
      },
      "nameCandidates": [
        { "label": "A", "name": "Haruka", "nameKatakana": "ハルカ" },
        { "label": "B", "name": "Mizuki", "nameKatakana": "ミズキ" },
        { "label": "C", "name": "Shiori", "nameKatakana": "シオリ" }
      ],
      "oneLiner": "Soft-spoken aquarium researcher who talks to the fish like old friends"
    },
    { /* NPC 2 */ },
    { /* NPC 3 */ },
    { /* NPC 4 */ },
    { /* NPC 5 */ }
  ]
}
```

Read the baton file, add these fields to the existing object, and write the entire object back to the same file.
