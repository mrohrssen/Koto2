# Consolidate Action-Area Rendering

**Status:** Design complete, blocked on Capacitor/game stability fix
**Date:** 2026-03-30

## Problem

24 different screens render into the `#action-area` div using a mix of `actions.showButtons()`, `actions.setContent()`, `actions.showFlashCards()`, and direct DOM manipulation. Each screen builds its own HTML with its own CSS classes, resulting in massive duplication. Upgrading the visual style means touching dozens of files.

## Decision: Two Components + One Template

After reviewing all 24 screens, they collapse into **3 rendering primitives** in a new `public/js/ui/ui-components.js` module:

### 1. `renderButtons(buttons[], options?)`

A vertical stack of tappable text buttons.

```js
renderButtons([
  { label: '⚡ 潜入', onClick: () => startRun(), primary: true },
  { label: '📦 インベントリ', onClick: () => openInventory() },
], { container: actionArea })
```

**Button descriptor:**
- `label` (string) — text content (can include emoji, `renderJpFirst()` output)
- `onClick` (function) — click handler
- `primary?` (boolean) — accent styling, default false
- `disabled?` (boolean) — greyed out, not clickable

**Shared behavior:**
- Clears container, renders vertical button stack
- Plays `button-tap` SFX on click
- CSS: `.ui-btn`, `.ui-btn--primary`, `.ui-btn--disabled`

**Promise variant for dialogue:**
```js
const index = await renderButtonsAsync([
  { label: 'Yes, I want to help' },
  { label: 'Tell me more first' },
], { container: actionArea })
```

Returns `Promise<number>` with selected index. Replaces `showDialogueChoices()`.

**Screens using renderButtons:**
- Hub (3 buttons)
- Room navigation (Fight/Proceed + Inventory + Equip)
- Area complete ("Next Area" button)
- Run complete/ended ("Return to Hub" button)
- Whack-a-mole pre/post (Play / completion button)
- Combat target back button (single "Back" button below card grid)
- All dialogue choices (prologue, NPC befriend, starter selection)

### 2. `renderChoices(options)`

A list of tappable choice cards with a unified card template. **No title or subtitle** — callers use narration box to instruct the player before showing choices.

```js
renderChoices({
  cards: items.map(item => ({
    sprite: itemSpritePath(item.id),   // optional
    title: `${item.word} (${item.reading})`,
    subtitle: item.nameEn,             // optional
    pills: buildEffectPills(item),     // optional HTML string
    badge: { text: 'RARE', color: '#a855f7' },  // optional
    helpBtn: () => showItemHelp(item), // optional callback
  })),
  onSelect: (index) => applyItem(index),
  disableAfterSelect: true,   // default true — greys out all cards after pick
  container: actionArea,
})
```

**Card descriptor fields (all optional except title):**
- `sprite` (string) — image URL for left-side icon/sprite
- `title` (string) — primary text line (always present)
- `subtitle` (string) — secondary text line
- `pills` (string) — HTML string for effect/status pills
- `badge` ({ text, color }) — overlay badge (e.g., rarity)
- `helpBtn` (function) — renders a "?" button, calls this on click

**Shared behavior:**
- Clears container, renders card list
- Click → SFX → `.ui-choice--selected` class → disable all cards → `onSelect(index)`
- One CSS class set for all cards

**Card template (single unified template):**
```
[BADGE]                  [?]     ← optional badge + help button
[🖼 sprite] [Title line      ]  ← sprite optional, title always
[         ] [Subtitle line   ]  ← optional
[         ] [💚 heal ⬆ boost ]  ← optional pills
```

When no sprite is present, the info stack takes full width. When only title is provided, it looks like a simple text card (functionally similar to a button but styled as a card).

**CSS:** `.ui-choice-list`, `.ui-choice`, `.ui-choice--selected`, `.ui-choice--disabled`, `.ui-choice__sprite`, `.ui-choice__info`, `.ui-choice__title`, `.ui-choice__subtitle`, `.ui-choice__pills`, `.ui-choice__badge`, `.ui-choice__help`

**Screen mapping:**

| Screen | sprite | title | subtitle | pills | badge | helpBtn |
|--------|--------|-------|----------|-------|-------|---------|
| Post-combat shop items | item sprite | word + reading | nameEn | effect pills | rarity | item help |
| Friendly NPC items | item sprite | word + reading | nameEn | effect pills | - | - |
| Shrine creatures | creature sprite | nameEn Lv.X -> Lv.X+1 | rarity / element | - | - | - |
| Combat targets (enemies) | creature sprite | name | nameEn / Lv.X | - | element badge | - |
| Combat targets (allies) | creature sprite | name | nameEn / Lv.X | - | - | - |
| Post-combat target picker | creature sprite | name | nameEn / Lv.X | - | - | - |
| Friendly NPC target picker | creature sprite | name | nameEn / Lv.X | - | - | - |
| Skill master | - | skill name | description | - | - | - |
| NPC battle skill | - | skill name | description | - | - | - |
| Area selection | - | area name | theme | - | - | - |

### 3. `renderFlashCards(options)`

Tap-to-flip, swipe-to-grade vocabulary cards.

```js
renderFlashCards({
  words: [{ word, reading, meanings }, ...],  // 1-3 words
  onSwipe: (direction, wordIndex) => ...,     // 'left' or 'right'
  container: actionArea,
})
```

- 1 word: single centered card (word discovery)
- 2-3 words: side-by-side cards (speed review) — tap to select, then flip + swipe
- Flip animation + swipe gesture with 80px threshold
- Remove all combat action semantics (attack/defend/befriend icons, `getSelectedActionType`, `clearSelectedActionType`)

**CSS:** `.ui-flash-card-container`, `.ui-flash-card`, `.ui-flash-card--flipped`, `.ui-flash-card--selected`, `.ui-flash-card__front`, `.ui-flash-card__back`

## Dead Code Removal

### Files to delete or gut:
- `dialogue-choices.js` — entire file, replaced by `renderButtonsAsync()`

### Functions to remove:
- `actions.js`: `showButtons()`, `showFlashCards()` (dual/triple combat mode), `getSelectedActionType()`, `clearSelectedActionType()`, combat SVG icons
- `exploration.js`: all inline HTML building in `renderShrine()`, `renderSkillMaster()`, `renderFriendlyNpc()`, `renderNpcBattleSkillSelection()`, `renderAreaSelection()` — replaced by `renderChoices()` calls
- `post-combat-shop.js`: `show()` HTML building, `showTargetPicker()` — replaced by `renderChoices()`
- `target-select.js`: `showTargets()` HTML building — replaced by `renderChoices()`

### Functions to keep (in actions.js):
- `setContent()` / `clear()` — still needed by standalone screens (whack-a-mole gameplay, move-select, move-learn)

### CSS to remove:
- `.shrine-creature-*` classes
- `.ward-option`, `.ward-selection-list`
- `.befriend-answer-*` classes
- `.shop-item-card`, `.shop-item-*` classes
- `.target-row`, `.target-sprite-panel`, `.target-info-panel`, `.target-*` classes
- `.dual-flash-card-*` combat card classes
- `.action-btn-primary`, `.action-btn-secondary`, `.action-btn-tertiary` (replaced by `.ui-btn` variants)

### CSS to add:
- `.ui-btn`, `.ui-btn--primary`, `.ui-btn--disabled`
- `.ui-choice-list`, `.ui-choice`, `.ui-choice--selected`, `.ui-choice--disabled`
- `.ui-choice__sprite`, `.ui-choice__info`, `.ui-choice__title`, `.ui-choice__subtitle`, `.ui-choice__pills`, `.ui-choice__badge`, `.ui-choice__help`
- `.ui-flash-card-container`, `.ui-flash-card`, `.ui-flash-card--flipped`, `.ui-flash-card--selected`, `.ui-flash-card__front`, `.ui-flash-card__back`

## Standalone Screens (No Changes)

These are sufficiently unique and stay as-is:
- Move selection (`move-select.js`) — 2x2 grid with special cells
- Move learning (`move-learn.js`) — replace-a-move prompt
- Whack-a-mole gameplay (`whack-a-mole.js`) — 3x3 tile minigame
- Dealer room (`economy.js`) — buy/sell with credits
- Meta shop (`meta-shop.js`) — full-screen overlay with upgrade cards
- Auth screen (`auth.js`) — login/register form
- Collection select (`game.js:showCollectionSelect`) — multi-select grid with budget

## Architecture

```
ui-components.js (new)
  ├── renderButtons(buttons[], options?)
  ├── renderButtonsAsync(buttons[], options?)  → Promise<number>
  ├── renderChoices(options)
  └── renderFlashCards(options)

actions.js (slimmed)
  ├── setContent(html)
  ├── clear()
  └── imports from ui-components.js for its own use

All other modules import directly from ui-components.js
```

## Migration Strategy

Screen-by-screen migration, testing each before moving to the next. Requires a working baseline first — **blocked on fixing Capacitor/game stability issues**.

Suggested order (lowest risk first):
1. Simple button screens (hub, area complete, run complete/ended)
2. Dialogue choices
3. Skill/area selection cards (text-only cards)
4. Creature selection (shrine, target pickers)
5. Item selection (post-combat shop, friendly NPC)
6. Flash cards (remove combat mode, clean up)
7. CSS cleanup pass (remove old classes)
8. Dead code removal pass
