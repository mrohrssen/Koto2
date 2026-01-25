# Lookup Mode Design

A toggle-able mode that lets learners click any Japanese word on screen to see its definition.

## User Flow

### Activating Lookup Mode
1. User clicks the lookup icon button (between stats and reset run in bottom toolbar)
2. Button turns green to indicate mode is active
3. All visible Japanese text on screen is parsed via JPDB API
4. Parsed words receive a subtle dotted underline
5. Cursor changes to pointer when hovering over words

### Using Lookup
1. User clicks any underlined word
2. Compact popup appears near the clicked word
3. Popup shows: word, reading, meanings, part of speech, card state
4. User clicks outside popup OR clicks X to dismiss
5. Can click another word immediately (mode stays active)

### Deactivating
1. User clicks the lookup button again
2. Button returns to default color
3. Underlines are removed, text returns to normal
4. Any open popup is dismissed

## Technical Architecture

### New Files
- `public/js/ui/lookup-mode.js` - Main module handling state, parsing, and coordination

### Modified Files
- `public/js/api.js` - Add `parseText()` and `lookupVocabulary()` frontend functions
- `public/game.css` - Styles for underlines, popup, and active button state
- `public/game.html` - Add lookup button to bottom toolbar, popup container

### Data Flow
1. Toggle ON → Call `/api/jpdb/parse` with all visible text
2. Response contains tokens with `vid`/`sid` for each word
3. Replace text nodes with `<span data-vid="X" data-sid="Y">word</span>`
4. Click handler → Call `/api/jpdb/lookup` with vid/sid
5. Response populates popup with definition data

### State Management
- `lookupModeActive` boolean tracks toggle state
- Store original text content before parsing (for clean restoration on toggle off)
- Cache parsed results per text element (avoid re-parsing unchanged content)

### Text Elements to Parse
- Narration box (`#narration-text`)
- Enemy name/dialogue areas
- Button labels in action area
- Any other visible Japanese text containers

## Popup Modal Design

### Layout
```
┌─────────────────────────────────────┐
│  言葉  ことば                    ✕  │  ← Word + reading + close button
├─────────────────────────────────────┤
│  noun                               │  ← Part of speech (small, muted)
├─────────────────────────────────────┤
│  • word, words                      │  ← Meanings (bulleted list)
│  • language, speech                 │
├─────────────────────────────────────┤
│  ● Learning                         │  ← Card state badge (colored dot)
└─────────────────────────────────────┘
```

### Visual Style
- Uses existing theme variables (`var(--bg-card)`, `var(--text-primary)`, etc.)
- Border uses accent color from current theme
- Max-width ~280px to stay compact
- Positioned near clicked word, flips up/down to stay in viewport
- Uses existing shadow variable (`var(--shadow-card)`)

### Card State Colors
- New: red dot
- Learning: yellow dot
- Known: green dot
- Never looked up: gray dot

### Interactions
- Click outside → closes
- Click ✕ → closes
- Click another word → closes current, opens new

## Button Design

### Placement
- Located in bottom toolbar, between stats button and reset run button
- Icon-only (magnifying glass or similar)
- Same size/style as neighboring buttons for visual consistency

### States
- **Inactive:** Default button styling (matches stats/reset buttons)
- **Active:** Green background or green icon color to indicate lookup mode is on
- **Loading:** Brief spinner or pulse animation while parsing text

### Activation Behavior
1. Click button → button turns green immediately
2. Show brief loading state while JPDB parse API runs
3. Once parsed, underlines appear on all recognized words
4. If parse fails (no API key, network error), show toast error and revert button to inactive

### Deactivation Behavior
1. Click green button → reverts to default color
2. All underlines removed instantly
3. Any open popup dismissed
4. Original text restored (no visual trace of lookup mode)

### Persisting Across Screens
- Lookup mode stays active when navigating (e.g., opening inventory, changing rooms)
- Re-parses new text automatically when screen content changes
- Only deactivates on explicit toggle or page refresh

## Error Handling

### No JPDB API Key
- On activation, check if API key is configured
- If missing, show toast: "Set JPDB API key in settings to use lookup"
- Button stays inactive

### Parse API Failure
- Show toast: "Couldn't parse text. Try again."
- Revert button to inactive state
- Don't leave UI in broken half-parsed state

### Lookup API Failure
- Show popup with error message: "Couldn't load definition"
- Include retry option or just let user click word again

### Words JPDB Doesn't Recognize
- Particles, punctuation, unknown words return without vid/sid
- These don't get underlines - left as plain text
- User sees which words are "learnable" vs structural

### Empty Text Elements
- Skip parsing elements with no text content
- No errors, just no underlines

### Rapid Toggling
- Debounce activation to prevent spam API calls
- If parsing in progress, ignore toggle until complete

### Text Changes While Active
- When new text appears (enemy dialogue, room transition), auto-parse it
- Listen for DOM changes or hook into existing render functions
