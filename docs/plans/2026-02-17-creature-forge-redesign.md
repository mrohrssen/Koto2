# Creature Forge Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the creature-forge skill into a relay chain of subagents with mini-skills, simplify roster awareness, and add art consistency features (style reference images, rigid style block, two-tier descriptions).

**Architecture:** The monolithic SKILL.md becomes a thin orchestrator that fires 4 subagents sequentially. Each subagent reads its own mini-skill file and a slim baton JSON. The Gemini image generation script gains style reference image support and a rigid style block.

**Tech Stack:** Claude Code skills (markdown), Node.js (creature-gemini-gen.mjs), Gemini 2.5 Flash API, JPDB API via scripts/lib/jpdb-helpers.mjs

---

### Task 1: Modify creature-gemini-gen.mjs for style references and rigid style block

**Files:**
- Modify: `/Users/michia/Documents/jrpg/scripts/creature-gemini-gen.mjs`

**Step 1: Add style reference support to CLI and image generation**

Add a `--style-refs-dir` optional argument (defaults to `data/creature-forge-style-refs/`). Read all `.png`/`.jpg`/`.jpeg`/`.webp` files from that directory, base64-encode them, and prepend as `inlineData` parts before the text prompt in the `generateContent` call.

Add a `--use-art-briefs` boolean flag. When set, use `artBriefs.a/b/c` from the descriptions JSON instead of the top-level `a/b/c` keys.

Changes to `parseCli()`:

```javascript
function parseCli() {
  let args;
  try {
    args = parseArgs({
      options: {
        id:              { type: 'string' },
        'visual-tier':   { type: 'string' },
        descriptions:    { type: 'string' },
        'style-refs-dir': { type: 'string' },
        'use-art-briefs': { type: 'boolean', default: false },
      },
      strict: true,
    });
  } catch {
    process.stderr.write(USAGE + '\n');
    process.exit(1);
  }

  const id          = args.values.id;
  const visualTier  = args.values['visual-tier'];
  const descPath    = args.values.descriptions;
  const styleRefsDir = args.values['style-refs-dir'] || null;
  const useArtBriefs = args.values['use-art-briefs'];

  if (!id || !visualTier || !descPath) {
    process.stderr.write(USAGE + '\n');
    process.exit(1);
  }

  if (!TIER_DIRECTIVES[visualTier]) {
    process.stderr.write(`Error: Invalid visual-tier "${visualTier}". Must be one of: ${Object.keys(TIER_DIRECTIVES).join(', ')}\n`);
    process.exit(1);
  }

  return { id, visualTier, descPath, styleRefsDir, useArtBriefs };
}
```

Add a function to load style reference images:

```javascript
import { readdir } from 'node:fs/promises';

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

async function loadStyleRefs(dir) {
  if (!dir) return [];
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const absDir = resolve(projectRoot, dir);

  let files;
  try {
    files = await readdir(absDir);
  } catch {
    return []; // directory doesn't exist — no style refs
  }

  const refs = [];
  for (const f of files.sort()) {
    const ext = extname(f).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;
    const data = await readFile(resolve(absDir, f));
    const mimeType = ext === '.png' ? 'image/png'
      : ext === '.webp' ? 'image/webp'
      : 'image/jpeg';
    refs.push({ inlineData: { mimeType, data: data.toString('base64') } });
  }
  return refs;
}
```

**Step 2: Rewrite buildPrompt() with rigid style block**

Replace the vague "Pokemon meets Genshin Impact" with a frozen style specification:

```javascript
function buildPrompt(meta, visualTier, descriptionText, hasStyleRefs) {
  const tierDirective = TIER_DIRECTIVES[visualTier];

  const styleBlock = hasStyleRefs
    ? `ART STYLE (match the reference images exactly — same line weight, same shading, same level of detail):
- Crisp black outlines, uniform weight
- Cel-shaded flat coloring: base color + one shadow tone per surface
- No gradients, no soft brushwork, no painterly textures, no airbrushing
- Large expressive eyes with single white catchlight
- Limited palette: 5-6 body colors maximum plus black outlines and white highlights
- Clean readable silhouette suitable for a game UI thumbnail
- Compact appealing proportions — not hyper-detailed or realistic`
    : `ART STYLE:
Anime creature collector style — cel-shaded lighting, expressive eyes.
NOT chibi — proper proportions but still stylized.`;

  return `${styleBlock}

TECHNICAL:
- Solid flat magenta (#FF00FF) background, NO gradients, shadows, or ground
- Full body visible, front-facing idle pose, single character only
- No text, no UI elements, no humans
- Creature must not contain any magenta (#FF00FF) in its own colors

CREATURE IDENTITY:
This creature represents "${meta.baseMeaning}". Looking at it, a viewer must immediately think "${meta.baseMeaning}".
The creature must visually BE ${meta.baseMeaning}, not be a different animal/object that relates to it.

Rarity: ${visualTier} — ${tierDirective}
Name: ${meta.name} the ${meta.modifier} ${meta.baseMeaning}
Element: ${meta.element} | Archetype: ${meta.archetype}
Moves: ${meta.attack} / ${meta.ultimate}

Appearance: ${descriptionText}`;
}
```

**Step 3: Update generateImage() to accept style ref parts**

```javascript
async function generateImage(model, prompt, outputPath, styleRefParts) {
  let lastError;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const parts = [
        ...styleRefParts,
        { text: prompt },
      ];

      const result = await model.generateContent({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseModalities: ['image', 'text'] },
      });
      // ... rest unchanged
```

**Step 4: Update main() to wire it all together**

In `main()`, load style refs and resolve description text based on `--use-art-briefs`:

```javascript
async function main() {
  const { id, visualTier, descPath, styleRefsDir, useArtBriefs } = parseCli();
  // ... existing key reading and descriptions loading ...

  // Load style reference images
  const defaultRefsDir = 'data/creature-forge-style-refs';
  const styleRefParts = await loadStyleRefs(styleRefsDir || defaultRefsDir);
  if (styleRefParts.length > 0) {
    process.stderr.write(`Loaded ${styleRefParts.length} style reference image(s)\n`);
  }

  // Resolve description text per variant
  const getDescText = (variant) => {
    if (useArtBriefs && descriptions.artBriefs?.[variant]) {
      return descriptions.artBriefs[variant];
    }
    return descriptions[variant];
  };

  // ... existing model init ...

  const results = await Promise.allSettled(
    VARIANTS.map(variant => {
      const descText = getDescText(variant);
      const prompt = buildPrompt(meta, visualTier, descText, styleRefParts.length > 0);
      const outputPath = `/tmp/creature-forge-${id}-${variant}.png`;
      return generateImage(model, prompt, outputPath, styleRefParts);
    })
  );
  // ... rest unchanged
```

**Step 5: Syntax check and commit**

```bash
node --check scripts/creature-gemini-gen.mjs && echo "OK"
```
Expected: `OK`

```bash
git add scripts/creature-gemini-gen.mjs
git commit -m "feat: add style reference images and rigid style block to creature-gemini-gen"
```

---

### Task 2: Create the style refs directory

**Files:**
- Create: `/Users/michia/Documents/jrpg/data/creature-forge-style-refs/.gitkeep`

**Step 1: Create directory with .gitkeep**

```bash
mkdir -p /Users/michia/Documents/jrpg/data/creature-forge-style-refs
touch /Users/michia/Documents/jrpg/data/creature-forge-style-refs/.gitkeep
```

Note: The `data/*` gitignore rule will ignore image files placed here. The `.gitkeep` ensures the directory structure exists. Users place their curated art style exemplar PNGs/JPGs in this directory.

**Step 2: Commit**

```bash
git add data/creature-forge-style-refs/.gitkeep
git commit -m "feat: add creature-forge style refs directory"
```

---

### Task 3: Write name-vocab.md mini-skill

**Files:**
- Create: `/Users/michia/.claude/skills/creature-forge/skills/name-vocab.md`

This mini-skill tells Subagent 1 how to generate 3 name candidates and the base word vocab table.

**Step 1: Write the mini-skill**

Content should include:
- The name construction rules from current SKILL.md Sections 1-2 (romaji contiguous substring rule, visual tier matching, creativity guidance)
- Input: read baton JSON from the path provided in the prompt
- Output: append `nameCandidates` array and `vocabTable` object to the baton JSON
- The exact output schema with example
- JPDB raw meanings display requirement
- No roster balancing — just check `rosterNames` in the baton for name collisions

The baton input the subagent expects:

```json
{
  "baseWord": "ハサミ",
  "baseReading": "はさみ",
  "baseMeaning": "scissors",
  "baseRank": 13900,
  "frequencyTier": "epic",
  "visualTier": "rare",
  "allForms": [{"spelling": "ハサミ", "rank": 13900}],
  "meanings": [["scissors"]],
  "tierCeilings": { "skillPreferred": 10000, "skillCeiling": 20000, "modPreferred": 12000, "modCeiling": 20000 },
  "rosterNames": ["Kamedor", "Irukami", ...],
  "rosterVerbs": [{"word": "噛む", "count": 3}, ...]
}
```

The subagent appends:

```json
{
  "nameCandidates": [
    { "label": "A", "name": "Hasamaw", "nameKatakana": "ハサマウ", "thesis": "はさみ (hasami) + '-maw' (English: jaws)..." }
  ],
  "vocabTable": {
    "word": "ハサミ",
    "reading": "はさみ",
    "meaning": "scissors",
    "rank": 13900,
    "allForms": "ハサミ(13,900), 鋏(17,000)"
  }
}
```

**Step 2: Commit**

```bash
git add ~/.claude/skills/creature-forge/skills/name-vocab.md
git commit -m "feat: add name-vocab mini-skill for creature-forge subagent 1"
```

---

### Task 4: Write combat-vocab.md mini-skill

**Files:**
- Create: `/Users/michia/.claude/skills/creature-forge/skills/combat-vocab.md`

This mini-skill tells Subagent 2 how to generate 3 attack and 3 ultimate candidates.

**Step 1: Write the mini-skill**

Content should include:
- Attack and ultimate rules from current SKILL.md Sections 3-4
- Tier ceiling table (skill preferred/ceiling from the baton's `tierCeilings`)
- Translation accuracy rules (transitivity, dictionary-first, no embellishment) — duplicated in full
- JPDB lookup instructions using `scripts/lib/jpdb-helpers.mjs` (write a temp script to `/tmp/`, run it)
- Roster verb awareness: read `rosterVerbs` from baton, avoid verbs with count >= 3
- Attacks and ultimates must not overlap
- Raw JPDB meanings must be shown
- Output schema: append `attackCandidates[3]` and `ultimateCandidates[3]` to baton

Each candidate:

```json
{
  "label": "A",
  "word": "切る",
  "reading": "きる",
  "meaning": "Cut",
  "rank": 283,
  "allForms": "切る(283)",
  "rawMeanings": [["cut", "slash", "sever"]]
}
```

**Step 2: Commit**

```bash
git add ~/.claude/skills/creature-forge/skills/combat-vocab.md
git commit -m "feat: add combat-vocab mini-skill for creature-forge subagent 2"
```

---

### Task 5: Write identity-modifier.md mini-skill

**Files:**
- Create: `/Users/michia/.claude/skills/creature-forge/skills/identity-modifier.md`

This mini-skill tells Subagent 3 how to suggest archetype, element, and 3 modifier candidates.

**Step 1: Write the mini-skill**

Content should include:
- Archetype definitions (Fighter / Tank-Healer / Mage / Trickster) from current SKILL.md Section 5
- Element definitions (Fire / Wood / Earth / Metal / Water) from Section 6
- Modifier rules from Section 7: natural as "[Modifier]の[Base]", appearance sketch, tier modifier ceilings
- Concept-visual alignment (Mouse Rule) — full table and logic
- JPDB lookup instructions for modifier words
- Translation accuracy rules — duplicated in full
- Output schema: append `archetype`, `element`, `modifierCandidates[3]` to baton

Each modifier candidate:

```json
{
  "label": "A",
  "word": "古代",
  "reading": "こだい",
  "meaning": "Ancient",
  "rank": 5500,
  "allForms": "古代(5,500)",
  "rawMeanings": [["ancient times", "antiquity"]],
  "appearanceSketch": "Crumbling temple-dome shell, oxidized bronze plates, fossilized coral in legs, dusty golden aura"
}
```

**Step 2: Commit**

```bash
git add ~/.claude/skills/creature-forge/skills/identity-modifier.md
git commit -m "feat: add identity-modifier mini-skill for creature-forge subagent 3"
```

---

### Task 6: Write visual-designer.md mini-skill

**Files:**
- Create: `/Users/michia/.claude/skills/creature-forge/skills/visual-designer.md`

This mini-skill tells Subagent 4 how to produce 3 visual descriptions with two-tier output.

**Step 1: Write the mini-skill**

Content should include:
- Firefly Rule (full text from current SKILL.md — creature must BE the concept)
- Visual tier style directives (Common through Legendary descriptions)
- Divergence axes (material palette, color palette, personality, silhouette, surface texture)
- The "3 different concept artists" framing
- Two-tier output requirement:
  - `richDescriptions[3]`: 5-8 sentences each, shown to user as flavor text. Material descriptions, personality, atmosphere. Full creative prose.
  - `artBriefs[3]`: 1-3 sentences each, sent to Gemini. Structural only: shape, colors, key features, pose. No poetic material descriptions like "oxidized bronze" or "honey-colored light."
- Input: reads locked identity from `/tmp/creature-forge-{id}-locked.json`
- Output: writes to `/tmp/creature-forge-{id}-visuals.json`

Output schema:

```json
{
  "richDescriptions": {
    "a": "An ancient turtle creature carries a shell resembling...",
    "b": "A muscular stallion creature built like...",
    "c": "A serpentine creature coils through..."
  },
  "artBriefs": {
    "a": "Ancient turtle. Domed shell with cracked jade-green and bronze plates. Glowing amber eyes. Small horns. Stocky legs.",
    "b": "Muscular horse. Stone armor plates on legs and chest. Dust-brown mane. Heavy hooves. Earth-toned body.",
    "c": "Snake-like creature. Long sinuous body with rocky scales. Green crystal eyes. Moss patches. Coiled resting pose."
  }
}
```

**Step 2: Commit**

```bash
git add ~/.claude/skills/creature-forge/skills/visual-designer.md
git commit -m "feat: add visual-designer mini-skill for creature-forge subagent 4"
```

---

### Task 7: Rewrite SKILL.md as orchestrator

**Files:**
- Modify: `/Users/michia/.claude/skills/creature-forge/SKILL.md`

**Step 1: Rewrite the skill file**

The new SKILL.md is a thin orchestrator. It retains:
- The skill frontmatter (name, description, triggers)
- Input mode detection (direct, discovery, thematic)
- Discovery and thematic mode logic (these happen before the relay, in the main agent)

It replaces the 9-section generation with the relay chain:

**Phase 0 — Foundation (main agent):**
1. JPDB lookup for base word (existing helper script pattern)
2. Read `creatures.json` + `new-creatures-staging.json`
3. Extract name list and verb usage counts (simplified roster awareness)
4. Determine frequency tier, visual tier (concept-visual alignment)
5. Build baton JSON with: baseWord, baseReading, baseMeaning, baseRank, frequencyTier, visualTier, allForms, meanings, tierCeilings, rosterNames, rosterVerbs
6. Write to `/tmp/creature-forge-{id}-baton.json`

**Phase 1 — Subagent relay (sequential):**

For each subagent, the orchestrator fires a Task tool call with:
```
Read the skill file at /Users/michia/.claude/skills/creature-forge/skills/{name}.md
Then read the baton at /tmp/creature-forge-{id}-baton.json
Follow the skill instructions exactly.
Write your output back to the baton file (read it, add your fields, write it back).
```

Order: name-vocab → combat-vocab → identity-modifier

After each subagent completes, the main agent reads the baton to sanity-check the output.

**Phase 2 — User picks (main agent):**

Present all candidates in one consolidated view. The main agent reads the baton and displays:
- 3 name candidates (pick A/B/C)
- Base vocab table
- 3 attack candidates (pick A/B/C)
- 3 ultimate candidates (pick A/B/C)
- Archetype suggestion (confirm or change)
- Element suggestion (confirm or change)
- 3 modifier candidates with appearance sketches (pick A/B/C)

User makes all picks in one interaction.

Build locked identity and write to `/tmp/creature-forge-{id}-locked.json`.

**Phase 3 — Visual design (subagent 4):**

Fire visual designer subagent:
```
Read the skill file at /Users/michia/.claude/skills/creature-forge/skills/visual-designer.md
Then read the locked identity at /tmp/creature-forge-{id}-locked.json
Follow the skill instructions exactly.
Write your output to /tmp/creature-forge-{id}-visuals.json
```

**Phase 4 — Image generation (main agent):**

Read visuals JSON. Build the meta JSON for `creature-gemini-gen.mjs` (combining locked identity + art briefs as description keys). Run:

```bash
node scripts/creature-gemini-gen.mjs \
  --id ${ID} \
  --visual-tier ${VISUAL_TIER} \
  --descriptions /tmp/creature-forge-${ID}-meta.json \
  --use-art-briefs
```

Then run preview and show in browser (existing pattern).

**Phase 5 — Save (main agent):**

Same save logic as current skill — assemble creature JSON object from locked identity + chosen rich description, append to `new-creatures-staging.json`. Copy selected image to `data/creature-staging-images/{id}.png`.

The SKILL.md should also retain:
- Tier system reference (the 5 tiers table) for Phase 0
- Concept-visual alignment (Mouse Rule) for Phase 0
- Summary table format
- Approval prompt and re-roll handling
- Save schema
- Checklist before finishing

**Step 2: Syntax validation**

Read through the new SKILL.md and verify:
- All file paths are absolute
- All subagent prompts reference the correct mini-skill paths
- The baton schema matches what mini-skills expect
- The tier ceilings table is present for Phase 0 computation

**Step 3: Commit**

```bash
git add ~/.claude/skills/creature-forge/SKILL.md
git commit -m "feat: rewrite creature-forge as relay chain orchestrator with subagents"
```

---

### Task 8: Update creature-preview.mjs to show rich descriptions

**Files:**
- Modify: `/Users/michia/Documents/jrpg/scripts/creature-preview.mjs`

The preview script currently reads `descriptions.a/b/c` from the metadata JSON. With two-tier descriptions, we want it to show the rich descriptions (flavor text) in the preview cards, not the art briefs.

**Step 1: Update buildHtml to prefer richDescriptions**

In `buildHtml()`, change the description lookup:

```javascript
const cards = VARIANTS.map(v => {
  const label = v.toUpperCase();
  const desc = meta.richDescriptions?.[v] || descriptions?.[v] || '';
  // ... rest unchanged
```

This is backwards-compatible: if `richDescriptions` exists (new flow), use it. Otherwise fall back to `descriptions` (old flow).

**Step 2: Syntax check and commit**

```bash
node --check scripts/creature-preview.mjs && echo "OK"
git add scripts/creature-preview.mjs
git commit -m "feat: prefer richDescriptions in creature preview HTML"
```

---

### Task 9: Integration test — run creature-forge end to end

**Step 1: Test creature-gemini-gen.mjs with style refs**

Place 1-2 test images in `data/creature-forge-style-refs/`. Create a minimal test descriptions JSON and run the script to verify style refs are loaded and passed to the API:

```bash
# Create a test descriptions file
cat > /tmp/creature-forge-test-meta.json << 'EOF'
{
  "name": "TestBot",
  "modifier": "Wild",
  "baseMeaning": "Test",
  "element": "fire",
  "archetype": "Fighter",
  "attack": "Strike",
  "ultimate": "Blast",
  "a": "A small fiery test creature",
  "b": "A medium test creature",
  "c": "A large test creature",
  "artBriefs": {
    "a": "Small fire creature. Round body. Red and orange.",
    "b": "Medium fire creature. Angular body. Crimson.",
    "c": "Large fire creature. Imposing. Dark red."
  },
  "descriptions": {
    "a": "A small fiery test creature",
    "b": "A medium test creature",
    "c": "A large test creature"
  }
}
EOF

node scripts/creature-gemini-gen.mjs --id test --visual-tier common --descriptions /tmp/creature-forge-test-meta.json --use-art-briefs
```

Verify: stderr shows "Loaded N style reference image(s)" (if refs exist), stdout shows JSON with a/b/c results.

**Step 2: Test creature-preview.mjs with richDescriptions**

```bash
cat > /tmp/creature-forge-test2-meta.json << 'EOF'
{
  "name": "TestBot",
  "modifier": "Wild",
  "baseMeaning": "Test",
  "element": "fire",
  "archetype": "Fighter",
  "visualTier": "common",
  "attack": "Strike",
  "ultimate": "Blast",
  "richDescriptions": {
    "a": "This is the RICH description for A — full flavor text.",
    "b": "This is the RICH description for B — full flavor text.",
    "c": "This is the RICH description for C — full flavor text."
  },
  "descriptions": {
    "a": "Old description A",
    "b": "Old description B",
    "c": "Old description C"
  }
}
EOF

node scripts/creature-preview.mjs --id test2 --metadata /tmp/creature-forge-test2-meta.json
```

Verify: the generated HTML at the URL shows "RICH description" text, not "Old description" text.

**Step 3: Run the full creature-forge skill**

Invoke `/creature-forge scissors` and verify:
- Phase 0 builds baton correctly
- Subagents 1-3 fire sequentially and append to baton
- All candidates display in one consolidated view
- User picks work
- Subagent 4 produces rich descriptions + art briefs
- Gemini gen uses art briefs with style refs
- Preview shows rich descriptions
- Save works correctly

**Step 4: Clean up test files**

```bash
rm -f /tmp/creature-forge-test-*.json /tmp/creature-forge-test-*.png /tmp/creature-forge-test2-*
```
