# Creature Forge Image Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure the creature-forge skill into a two-pass flow (identity first, visuals second) and add concept art image generation via OpenAI gpt-image-1.5.

**Architecture:** The creature-forge skill is a pure markdown file (`~/.claude/skills/creature-forge/skill.md`) that instructs Claude how to run the creature design workflow. Changes are all to this one file — no application code. Image generation uses `curl` to call OpenAI's API, saves PNGs to `/tmp`, and opens an HTML preview via Playwright MCP.

**Tech Stack:** Markdown (skill definition), OpenAI Images API (`gpt-image-1.5`), Playwright MCP (browser preview), `curl` + `base64` CLI tools

**Design doc:** `docs/plans/2026-02-15-creature-forge-image-gen-design.md`

---

### Task 1: Set Up OpenAI API Key File

**Files:**
- Create: `data/.creature-forge-openai-key` (gitignored, contains API key)

**Step 1: Verify .gitignore covers key files**

Run: `grep 'creature-forge' /Users/michia/Documents/jrpg/.gitignore`

If `data/.creature-forge-openai-key` is not listed, add it.

**Step 2: Create the key file**

Ask the user for their OpenAI API key and write it to `data/.creature-forge-openai-key` (no trailing newline).

**Step 3: Verify**

Run: `test -f /Users/michia/Documents/jrpg/data/.creature-forge-openai-key && echo "Key file exists"`

**Step 4: Commit .gitignore if changed**

```bash
git add .gitignore
git commit -m "chore: gitignore creature-forge OpenAI key"
```

---

### Task 2: Update Skill Intro & Section Count

**Files:**
- Modify: `/Users/michia/.claude/skills/creature-forge/skill.md` (lines 1-18)

**Step 1: Update frontmatter description**

Change the description to mention 9 sections and concept art preview.

**Step 2: Update intro paragraph**

Change line 10 from "8 numbered sections" to "9 numbered sections" and add "Concept Art Preview" to the list. Mention the two-pass structure:

> The creature design uses a two-pass approach. **Pass 1 (Sections 1-7)** locks in identity: Name, Japanese Vocab, Attack Skills, Ultimate Ability, Archetype, Element, and Modifier. **Pass 2 (Sections 8-9)** generates visual descriptions and concept art images with all identity locked in.

**Step 3: Update mode references**

In Direct mode (line 18), change "generate all 7 sections" to "generate all 9 sections".

In Discovery mode (line 36), change "proceed to the 7 sections" to "proceed to the 9 sections".

In Thematic mode (line 44), change "proceed to the 7 sections" to "proceed to the 9 sections".

---

### Task 3: Swap Sections 7 and 8 — Modifier Moves Up

**Files:**
- Modify: `/Users/michia/.claude/skills/creature-forge/skill.md` (sections 7 and 8)

**Step 1: Replace the old Section 7 (Description) header and content**

Rename `### 7 — Description (pick 1 of 3)` to `### 7 — Modifier (pick 1 of 3)`.

Use the existing Modifier content (old Section 8) but add an **Appearance Sketch** column to the table:

```markdown
### 7 — Modifier (pick 1 of 3)

A title/epithet that describes the creature's personality, origin, or nature — e.g., "Ancient", "Wild", "Silent". The modifier completes the creature's full name: "[Name] the [Modifier] [Base Meaning]" (e.g., "Kamedor the Ancient Turtle").

Present **3 adjective/descriptor candidates** with an appearance sketch for each — a 1-2 sentence visual hint showing how this modifier would influence the creature's look:

| # | Japanese | Reading | Meaning | JPDB Rank | Appearance Sketch |
|---|----------|---------|---------|-----------|-------------------|
| A | 古代 | こだい | Ancient | 5500 | Crumbling temple-dome shell, oxidized bronze plates, fossilized coral in legs, dusty golden aura |
| B | 静か | しずか | Quiet | 2100 | Smooth pale shell, muted blue-grey tones, misty vapor trail, contemplative half-closed eyes |
| C | 野生 | やせい | Wild | 4800 | Jagged cracked shell with thorny overgrowth, battle scars, feral glowing eyes, trailing moss |

The appearance sketches are NOT the final description — they help the user visualize how each modifier pulls the creature's look in a different direction.

Requirements:
- Must be a Japanese adjective, な-adjective, or noun that works as a descriptor
- JPDB rank < 10000 (prefer < 5000)
- Should feel evocative as a creature title — not generic
- Should thematically match the creature's archetype, element, or concept
- Each sketch should be distinct — show meaningfully different visual directions

The user picks A, B, or C. Once chosen, all identity is locked for Pass 2.
```

**Step 2: Replace the old Section 8 (Modifier) with new Section 8 (Description)**

```markdown
### 8 — Description (pick 1 of 3)

**This section begins Pass 2.** All identity is now locked: name, base word, attack, ultimate, archetype, element, and modifier. The descriptions must incorporate ALL of these.

Present **3 visual descriptions** labeled A, B, C. Each description must:

- Be **5-8 sentences long**
- Reference the chosen **modifier** in the creature's visual design (e.g., "Ancient" → weathered, fossilized, crumbling details)
- Reflect the chosen **element** through colors, particle effects, and materials
- Hint at the creature's **moveset** in its physical features (e.g., a creature with "Freeze" might have icy crystalline growths)
- Match the **archetype** in body language and posture (Fighter = aggressive stance, Tank = sturdy and grounded)
- Be vivid enough for a concept artist or image generation model to work from
- Include: body shape, colors, textures, distinctive features, personality traits, glowing or particle effects
- Reference the base word's object or animal in the creature's physical design
- Vary the openings — don't start every description the same way

Write descriptions in the anime creature collector style (Pokemon meets Genshin Impact): vivid elemental effects, cel-shaded lighting, detailed textures, expressive eyes. NOT chibi — proper proportions but still stylized and cute.

Example quality level (from existing creatures.json): "This ancient creature carries a shell that resembles a crumbling temple dome, its surface covered in overlapping plates of oxidized bronze and deep jade stone. Cracks along the shell's ridges leak a slow, honey-colored light — old energy that has been accumulating for millennia."

Do NOT ask the user to pick yet — Section 9 will generate concept art images for all 3 descriptions first.
```

---

### Task 4: Add Section 9 — Concept Art Preview

**Files:**
- Modify: `/Users/michia/.claude/skills/creature-forge/skill.md` (add after Section 8)

**Step 1: Add the new section**

Insert after Section 8, before the Summary Table:

````markdown
### 9 — Concept Art Preview

Generate concept art images for all 3 descriptions from Section 8, then display them in a browser so the user can compare visually.

**Read API Key:**

```bash
OPENAI_KEY=$(cat /Users/michia/Documents/jrpg/data/.creature-forge-openai-key)
```

If the key file doesn't exist, skip Section 9 entirely with: "No OpenAI key found at `data/.creature-forge-openai-key` — skipping image generation. Pick your description (A/B/C) based on the text above." Then proceed to the approval flow.

**Build Image Prompts:**

For each description (A, B, C), wrap it in this style template:

```
Game-ready creature design, single character on plain white background,
full body, front-facing idle pose. Anime creature collector style
(Pokemon meets Genshin Impact) — vivid elemental effects, cel-shaded
lighting, detailed textures, expressive eyes. NOT chibi — proper
proportions but still stylized and cute. No text, no UI, no humans.

Creature: [Name] the [Modifier] [BaseMeaning]
Element: [Element]
Archetype: [Archetype]
Moves: [Attack meaning] / [Ultimate meaning]

Visual description: [Full description text]
```

**Generate Images (3 parallel curl calls):**

Run all 3 in parallel using `&` and `wait`:

```bash
OPENAI_KEY=$(cat /Users/michia/Documents/jrpg/data/.creature-forge-openai-key)
ID="<creature-id>"

# Generate all 3 in parallel
curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1.5","prompt":"<PROMPT_A>","size":"512x512","quality":"high","response_format":"b64_json"}' \
  | jq -r '.data[0].b64_json' | base64 --decode > /tmp/creature-forge-${ID}-a.png &

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1.5","prompt":"<PROMPT_B>","size":"512x512","quality":"high","response_format":"b64_json"}' \
  | jq -r '.data[0].b64_json' | base64 --decode > /tmp/creature-forge-${ID}-b.png &

curl -s -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-1.5","prompt":"<PROMPT_C>","size":"512x512","quality":"high","response_format":"b64_json"}' \
  | jq -r '.data[0].b64_json' | base64 --decode > /tmp/creature-forge-${ID}-c.png &

wait
```

**Important:** Escape all double quotes and special characters in the prompt JSON. If the description contains quotes, escape them as `\"`.

**Generate HTML Preview:**

Write this HTML to `/tmp/creature-forge-${ID}-preview.html`:

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>[Name] the [Modifier] [BaseMeaning] — Concept Art</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a12; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; }
  h1 { text-align: center; font-size: 1.6rem; margin-bottom: 4px; color: #fff; }
  .subtitle { text-align: center; font-size: 0.9rem; color: #888; margin-bottom: 24px; }
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 0.8rem; margin: 0 4px; }
  .badge.element { background: #1a3a5c; color: #5ba8f5; }
  .badge.archetype { background: #3a1a3c; color: #c77dff; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; max-width: 1400px; margin: 0 auto; }
  .card { background: #14141f; border: 1px solid #2a2a3a; border-radius: 12px; overflow: hidden; }
  .card-label { font-size: 1.8rem; font-weight: bold; padding: 12px 16px 0; color: #5ba8f5; }
  .card img { width: 100%; aspect-ratio: 1; object-fit: cover; }
  .card-body { padding: 12px 16px 16px; }
  .card-body p { font-size: 0.85rem; line-height: 1.5; color: #bbb; }
  .moves { margin-top: 8px; font-size: 0.8rem; color: #888; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; max-width: 500px; } }
</style>
</head>
<body>
  <h1>[Name] the [Modifier] [BaseMeaning]</h1>
  <div class="subtitle">
    <span class="badge element">[Element]</span>
    <span class="badge archetype">[Archetype]</span>
  </div>
  <div class="grid">
    <div class="card">
      <div class="card-label">A</div>
      <img src="file:///tmp/creature-forge-[id]-a.png" alt="Variant A">
      <div class="card-body">
        <p>[Description A text]</p>
        <div class="moves">⚔ [Attack meaning] · ✦ [Ultimate meaning]</div>
      </div>
    </div>
    <div class="card">
      <div class="card-label">B</div>
      <img src="file:///tmp/creature-forge-[id]-b.png" alt="Variant B">
      <div class="card-body">
        <p>[Description B text]</p>
        <div class="moves">⚔ [Attack meaning] · ✦ [Ultimate meaning]</div>
      </div>
    </div>
    <div class="card">
      <div class="card-label">C</div>
      <img src="file:///tmp/creature-forge-[id]-c.png" alt="Variant C">
      <div class="card-body">
        <p>[Description C text]</p>
        <div class="moves">⚔ [Attack meaning] · ✦ [Ultimate meaning]</div>
      </div>
    </div>
  </div>
</body>
</html>
```

**Open in Playwright:**

Use `browser_navigate` to open `file:///tmp/creature-forge-${ID}-preview.html`.

Then take a screenshot so the user can see it inline: `browser_take_screenshot`.

**After viewing, ask:**

> Which visual direction do you prefer? **(A / B / C)** — or tell me what to change.

The user's choice selects the description for the final creature record.

**Error handling:**
- If any `curl` call fails or produces an empty file, show whichever images succeeded and note the failure.
- If all 3 fail, fall back to text-only selection: "Image generation failed — pick based on descriptions above."
````

---

### Task 5: Update Summary Table & Section References

**Files:**
- Modify: `/Users/michia/.claude/skills/creature-forge/skill.md` (summary table section, re-roll section)

**Step 1: Update the section header reference**

Change "After presenting all 8 sections" to "After presenting all 9 sections".

**Step 2: Update re-roll handling**

Add a note that re-rolling Section 8 (descriptions) also regenerates Section 9 (images):

> - "redo 8" — regenerate Description candidates AND re-run Section 9 image generation
> - "redo 9" or "new images" — regenerate images only (re-run Section 9 with current descriptions)

**Step 3: Update section number references in examples**

In the re-roll examples, update old section 7 references to section 8, old section 8 to section 7:

> - "redo 3 and 8" — regenerate Attack Skills and Description
> - "redo 7 but more mysterious" — regenerate Modifier with the constraint

---

### Task 6: Update Checklist

**Files:**
- Modify: `/Users/michia/.claude/skills/creature-forge/skill.md` (checklist section)

**Step 1: Add image generation check**

Add to the checklist:

```markdown
- [ ] Section 9 images were generated (or gracefully skipped if no API key)
- [ ] HTML preview was shown to user via Playwright before description selection
```

---

### Task 7: Final Review & Commit

**Step 1: Read the full updated skill file**

Read `/Users/michia/.claude/skills/creature-forge/skill.md` end-to-end and verify:
- Section numbering is sequential 1-9
- All cross-references use correct section numbers
- No orphaned references to old section ordering
- The two-pass structure is clearly explained
- Section 9 curl commands are syntactically correct

**Step 2: Commit**

```bash
git add /Users/michia/.claude/skills/creature-forge/skill.md
git commit -m "feat(creature-forge): two-pass flow + concept art image generation

Restructure into Pass 1 (identity) and Pass 2 (visuals).
Move Modifier before Description, add appearance sketches.
New Section 9 generates 3 concept art images via gpt-image-1.5
and displays them in a Playwright browser preview."
```
