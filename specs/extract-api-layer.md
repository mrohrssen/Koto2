# Extract API Layer from game.js

Extract all network/API code from `public/game.js` into a separate `public/js/api.js` module. This is the first step in breaking up the frontend monolith, and this code will survive the React port unchanged.

## Goals

1. **Single source of truth** for all server communication
2. **Reduce game.js size** by ~500+ lines
3. **Help Claude sessions** avoid duplicating API patterns
4. **Portable to React** - this module works as-is in any framework

## What to Extract

### The apiCall wrapper
The core fetch wrapper that handles:
- POST requests with JSON body
- Error handling and response parsing
- Any retry logic or error display

### All endpoint calls
Every function that calls the server, typically matching patterns like:
- `fetch('/api/...')`
- `apiCall('/api/...')`

These should become exported functions in api.js with clear names like:
- `attackEnemy(targetIndex)`
- `useItem(itemId)`
- `startRun(wardId)`
- `getVocabSuggestions()`

### Endpoint constants (optional)
If helpful, define endpoint paths as constants:
```javascript
const ENDPOINTS = {
  ATTACK: '/api/game/attack',
  USE_ITEM: '/api/game/use-item',
  // ...
};
```

## What NOT to Extract

- DOM manipulation (stays in game.js or future UI modules)
- State management (separate extraction later)
- Callbacks that update UI after API calls (stays with UI code)

## File Structure

```
public/
  js/
    api.js          ← NEW: all API calls
  game.js           ← imports from js/api.js
  game.html         ← add <script type="module"> if needed
```

## API Module Shape

```javascript
// public/js/api.js

// Core wrapper
async function apiCall(endpoint, method, body) { ... }

// Game actions
export async function attackEnemy(targetIndex, attackType) { ... }
export async function useItem(itemId, targetIndex) { ... }
export async function useSkill(skillId, targetIndex) { ... }
export async function defend() { ... }
export async function flee() { ... }

// Run management
export async function startRun(wardId) { ... }
export async function abandonRun() { ... }

// Room actions
export async function enterRoom(roomIndex) { ... }
export async function searchRoom() { ... }
export async function interactWithRoom(action) { ... }

// Shop/economy
export async function buyItem(itemId) { ... }
export async function sellItem(itemId) { ... }
export async function refineChip(chipId) { ... }

// Vocab/JPDB
export async function getVocabSuggestions() { ... }
export async function submitVocabAnswer(word, correct) { ... }

// Settings/meta
export async function saveSettings(settings) { ... }
export async function loadSettings() { ... }

// ... etc (discover all endpoints during extraction)
```

## Migration Steps

1. **Create `public/js/api.js`** with the apiCall wrapper
2. **Find all fetch/apiCall usages** in game.js
3. **Move each to api.js** as an exported function
4. **Update game.js** to import and call the new functions
5. **Test each endpoint** still works (run e2e tests)
6. **Delete dead code** from game.js

## Success Criteria

- [ ] All server calls go through `js/api.js`
- [ ] `game.js` has zero direct `fetch()` or `apiCall()` definitions
- [ ] `npm test` passes
- [ ] No behavior changes (pure refactor)

## Notes

- Keep the same response handling - don't change what gets returned
- If some endpoints have special error handling, preserve it
- This is a pure code-move refactor, no logic changes
