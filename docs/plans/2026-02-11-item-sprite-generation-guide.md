# Item Sprite Generation Guide

## Goal

Generate 46 item sprites that look like collectible items from a miHoYo game (Genshin Impact, Honkai Star Rail). Every icon should be instantly recognizable at 64px, clean, and stylistically consistent.

## Style Reference: miHoYo Item Icons

miHoYo item icons share these traits:

- **Centered composition**: object floats in the middle of the frame, no cropping
- **Consistent lighting**: soft top-left light source, gentle shadow beneath
- **Clean anime cel-shading**: bold outlines, flat color fills with 2-3 value steps
- **Slight glow or sparkle**: especially on rare/epic/legendary items
- **White or transparent background**: never scene backgrounds or environments
- **Object fills 60-80% of the frame**: not too small, never cropped
- **Single cohesive object**: not two copies, not scattered parts, one clear item

## Technical Requirements

| Parameter | Value |
|-----------|-------|
| Resolution | 512x512 (display at 64-128px) |
| Background | White or transparent |
| Format | PNG |
| Model | Flux (via ComfyUI) |
| Steps | 20-25 |
| CFG | 3.5-4.0 |
| Sampler | euler / normal |

## Prompt Template

```
{object_description}, game item icon, clean anime cel-shaded style, centered composition,
white background, single object, soft lighting from top-left, slight drop shadow,
bold clean outlines, vibrant colors, digital illustration, masterpiece quality
```

**Negative prompt:**
```
photograph, realistic, blurry, cropped, off-center, multiple objects, text, watermark,
busy background, scene, landscape, person, character, hand, fingers
```

## Critical Prompting Rules

1. **Never prompt abstract concepts directly.** "Friend" produces garbage. "A small golden bell charm with a blue ribbon" produces a clear item.
2. **Always describe a specific physical object.** Decide what the item IS before writing the prompt.
3. **Include material and color.** "Jade magatama pendant" beats "green curved bead."
4. **Keep it to ONE object.** Never "two keys" or "a pair of cranes." One item, centered.
5. **Describe the object at resting position.** No action, no motion blur, no particles flying off.
6. **Name the art style explicitly.** "anime cel-shaded game icon" anchors the style.

## Concrete Object Mappings

Every item needs a specific physical object. Abstract concepts are translated into tangible Japanese-themed collectibles.

### Nature & Seasons

| ID | Meaning | Object | Prompt Description |
|----|---------|--------|-------------------|
| water | water | Crystal water flask | A round glass flask filled with glowing blue water, crystal stopper on top, small bubbles inside |
| mountain | mountain | Stone summit charm | A triangular stone amulet carved to look like a mountain peak, grey granite with snow-white tip |
| sky | sky | Cloud orb | A translucent glass orb containing swirling white clouds against blue sky inside |
| nature | nature | Leaf crown wreath | A small circular wreath of green leaves and tiny white flowers, woven together |
| sea | sea | Shell horn | A large spiral conch shell with iridescent pink and blue interior, polished surface |
| summer | summer | Paper fan (uchiwa) | A round Japanese uchiwa fan with a red and orange fireworks pattern, bamboo handle |
| spring | spring | Cherry blossom branch | A small branch with pink cherry blossoms in full bloom, three flowers, a few falling petals |
| autumn | autumn | Red maple leaf brooch | A golden brooch in the shape of a maple leaf, enameled in red and orange gradient |
| winter | winter | Snow crystal | A hexagonal ice crystal ornament, pale blue and white, glittering with frost |

### Food & Drink

| ID | Meaning | Object | Prompt Description |
|----|---------|--------|-------------------|
| cooking | cooking | Cast iron pot | A small black cast iron pot with lid slightly ajar, steam rising, wooden ladle resting on top |
| meal | meal | Bento box | A Japanese bento box with compartments visible, rice, tamagoyaki, and vegetables, lacquered red exterior |
| flavor | flavor | Spice jar set | A small ceramic spice jar with a cork lid, decorative wave pattern in blue and white |
| tea | tea | Yunomi teacup | A Japanese ceramic yunomi teacup filled with green tea, steam wisps rising, blue glaze pattern |
| rice | cooked rice | Rice bowl | A white ceramic rice bowl heaped with steaming white rice, pair of red chopsticks resting on top |
| sake | sake | Tokkuri bottle | A ceramic sake tokkuri bottle with matching ochoko cup, blue wave pattern on white ceramic |
| medicine | medicine | Potion bottle | A small glass apothecary bottle with green glowing liquid inside, cork stopper, ornate label |

### People & Relationships

| ID | Meaning | Object | Prompt Description |
|----|---------|--------|-------------------|
| friend | friend | Friendship bracelet | A braided friendship bracelet with red and blue threads, a small golden star charm dangling from it |
| ally | ally | Bronze shield badge | A small round bronze shield badge with a crossed-swords emblem, polished with a green gem center |
| family | family | Family crest medallion | A round golden medallion with an engraved family crest of a tree with deep roots, hung on a red cord |
| parents | parents | Protective omamori | A Japanese omamori charm bag in purple and gold brocade fabric, kanji embroidered, tassel at bottom |
| lover | lover | Paired rings | A single elegant ring with a heart-shaped ruby set in gold, delicate filigree band |
| siblings | siblings | Matched magatama pair | Two small magatama beads on a shared cord, one red and one blue, nestled together |
| senior | senior | Wisdom scroll | A small rolled-up scroll tied with a golden ribbon, wax seal with a crane emblem |

### Knowledge & Communication

| ID | Meaning | Object | Prompt Description |
|----|---------|--------|-------------------|
| words | words | Ink brush | A traditional Japanese calligraphy brush (fude) with bamboo handle, ink-dipped tip, resting on a small stone rest |
| paper | paper | Washi paper stack | A neat stack of handmade washi paper sheets, slightly textured, with a pressed flower visible on top sheet |
| letter | letter | Sealed envelope | A cream-colored envelope sealed with a red wax seal stamped with a star pattern |
| story | story | Gilded storybook | A thick ornate book with a golden cover, jeweled clasp, celestial star pattern embossed on front |
| book | book | Leather journal | A leather-bound journal with a brass compass rose on the cover, bookmark ribbon trailing out |
| name | name | Name stamp (hanko) | A cylindrical Japanese hanko stamp carved from red stone, character visible on the bottom face |
| music | music | Crystal music box | A small ornate music box with an open lid revealing a tiny spinning ballerina mechanism, golden trim |
| riddle | riddle | Puzzle cube | A small wooden puzzle box (himitsu-bako) with geometric inlay patterns in light and dark wood |

### Abstract Concepts (as Objects)

| ID | Meaning | Object | Prompt Description |
|----|---------|--------|-------------------|
| time | time | Hourglass | A brass hourglass with blue sand flowing, ornate metal frame with gear decorations |
| clock | clock | Pocket watch | A golden pocket watch with the case open, roman numerals on the face, attached chain |
| feeling | feeling | Emotion crystal | A faceted heart-shaped crystal that shifts from pink at the top to blue at the bottom, inner glow |
| heart | heart | Heart locket | A golden heart-shaped locket pendant, slightly open to reveal a tiny glowing light inside |
| promise | promise | Pinky ring | A delicate silver ring with an infinity knot design, small diamond at the center of the knot |
| photograph | photograph | Instant photo | A polaroid-style instant photograph with a white border, the image shows a sunset landscape |

### Travel & Tools

| ID | Meaning | Object | Prompt Description |
|----|---------|--------|-------------------|
| travel | travel | Traveler's compass | A brass pocket compass with a flip-open lid, compass rose visible on the face, leather strap |
| map | map | Treasure map | A rolled parchment map with visible coastlines and a red X mark, tied with a brown string |
| tool | tool | Multi-tool | A compact folding multi-tool with brass and wood handles, several blades partially visible |
| key | key | Ornate key | A single ornate golden key with a heart-shaped bow (top), intricate teeth, slight magical glow |
| clothes | clothes | Kimono sash (obi) | A folded silk obi sash in deep blue with gold crane embroidery, neatly tied |
| thing | thing | Mystery box | A small ornate wooden chest with brass corners and a keyhole, slightly glowing from within |
| present | present | Gift furoshiki | A beautifully wrapped furoshiki bundle in red silk with golden pattern, tied in a decorative knot on top |

### Misc

| ID | Meaning | Object | Prompt Description |
|----|---------|--------|-------------------|
| smell | smell | Incense holder | A small ceramic incense holder shaped like a lotus, a single incense stick with a wisp of smoke |
| money | money | Koban gold coin | A single oval Japanese koban gold coin with stamped characters, gleaming surface |

## Quality Checklist

Before accepting a generated sprite, verify:

- [ ] Object is centered and fills 60-80% of the frame
- [ ] No cropping - entire object visible with padding on all sides
- [ ] Single object only (no duplicates, no mirrored copies)
- [ ] Clean white or near-white background
- [ ] Consistent anime cel-shaded style with bold outlines
- [ ] Instantly recognizable at 64px thumbnail size
- [ ] No text, watermarks, or artifacts
- [ ] Colors are vibrant but not garish
- [ ] Would not look out of place next to a Genshin Impact item icon

## Rarity Visual Tiers

To differentiate rarity, adjust the prompt suffix:

| Rarity | Visual Modifier |
|--------|----------------|
| common | simple design, clean colors |
| uncommon | slight glow effect, richer colors |
| rare | golden trim, magical sparkle particles |
| epic | purple/golden aura, ornate detailing, jewel accents |
| legendary | radiant golden glow, ethereal light rays, divine craftsmanship |

## Generation Workflow

1. Load prompt template + object description + rarity modifier
2. Generate at 512x512
3. Run quality checklist
4. If any check fails, adjust prompt and regenerate (do NOT accept mediocre output)
5. Save as `public/assets/sprites/items/{id}.png`

## V1 Lessons Learned

The first generation attempt produced mixed results because:

1. **Abstract concepts were prompted directly** - "friend", "feeling", "name" produce nonsense
2. **No consistent style anchor** - each prompt drifted to a different art style
3. **No composition guidance** - objects were cropped, off-center, or tiny
4. **No negative prompts** - got unwanted backgrounds, text, multiple objects
5. **Accepted "good enough" too early** - should have regenerated until every icon passes the quality checklist

The fix: every item maps to a **concrete Japanese-themed physical object**, prompted with an explicit style anchor and composition rules.
