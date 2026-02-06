# Consolidate User Keys Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate duplicate key decryption logic by centralizing `getUserKeys` in `auth/users.js` and using middleware to attach keys to requests.

**Architecture:** Move `getUserKeys` to `auth/users.js`, add `attachUserKeys` middleware to `auth/middleware.js`, apply middleware to vocab routes, remove all inline decryption and `getJpdbApiKey` calls.

**Tech Stack:** Express.js middleware, existing crypto module

---

### Task 1: Add getUserKeys to auth/users.js

**Files:**
- Modify: `src/auth/users.js` (add export at end of file)

**Step 1: Add the getUserKeys function**

Add at the end of `src/auth/users.js`:

```javascript
/**
 * Get decrypted API keys for a user
 * @param {string} userId
 * @returns {object} Decrypted keys or empty object
 */
export function getUserKeys(userId) {
  const user = findUserById(userId);
  if (!user?.encryptedApiKeys) return {};
  try {
    const { decryptKeys } = await import('./crypto.js');
    return decryptKeys(user.encryptedApiKeys, process.env.ENCRYPTION_KEY || 'a'.repeat(64));
  } catch {
    return {};
  }
}
```

Wait - this needs to be sync since `findUserById` is sync. Use static import instead:

```javascript
import { decryptKeys } from './crypto.js';
```

Add to existing imports at top, then add function at end:

```javascript
/**
 * Get decrypted API keys for a user
 * @param {string} userId
 * @returns {object} Decrypted keys or empty object
 */
export function getUserKeys(userId) {
  const user = findUserById(userId);
  if (!user?.encryptedApiKeys) return {};
  try {
    return decryptKeys(user.encryptedApiKeys, process.env.ENCRYPTION_KEY || 'a'.repeat(64));
  } catch {
    return {};
  }
}
```

**Step 2: Run syntax check**

Run: `node --check src/auth/users.js`
Expected: No output (success)

**Step 3: Commit**

```bash
git add src/auth/users.js
git commit -m "feat(auth): add getUserKeys to users.js"
```

---

### Task 2: Add attachUserKeys middleware

**Files:**
- Modify: `src/auth/middleware.js`

**Step 1: Add import and middleware function**

Add to imports:
```javascript
import { getUserKeys } from './users.js';
```

Add new middleware at end of file:
```javascript
/**
 * Middleware to attach decrypted user API keys to request
 * Must be used after requireAuth or optionalAuth
 */
export function attachUserKeys(req, res, next) {
  if (req.user?.id) {
    req.userKeys = getUserKeys(req.user.id);
  } else {
    req.userKeys = {};
  }
  next();
}
```

**Step 2: Run syntax check**

Run: `node --check src/auth/middleware.js`
Expected: No output (success)

**Step 3: Commit**

```bash
git add src/auth/middleware.js
git commit -m "feat(auth): add attachUserKeys middleware"
```

---

### Task 3: Update game/index.js to use shared getUserKeys

**Files:**
- Modify: `src/routes/game/index.js`

**Step 1: Update imports**

Remove:
```javascript
import { decryptKeys } from '../../auth/crypto.js';
```

Change:
```javascript
import { findUserById, getLeaderboard } from '../../auth/users.js';
```
To:
```javascript
import { findUserById, getLeaderboard, getUserKeys } from '../../auth/users.js';
```

**Step 2: Remove local getUserKeys function**

Delete lines 24-33 (the local `getUserKeys` function):
```javascript
/**
 * Get decrypted API keys for a user
 * @param {string} userId
 * @returns {object} Decrypted keys or empty object
 */
function getUserKeys(userId) {
  const user = findUserById(userId);
  if (!user?.encryptedApiKeys) return {};
  try {
    return decryptKeys(user.encryptedApiKeys, process.env.ENCRYPTION_KEY || 'a'.repeat(64));
  } catch {
    return {};
  }
}
```

**Step 3: Run syntax check**

Run: `node --check src/routes/game/index.js`
Expected: No output (success)

**Step 4: Commit**

```bash
git add src/routes/game/index.js
git commit -m "refactor(game): use shared getUserKeys from auth/users"
```

---

### Task 4: Remove getJpdbApiKey from jpdb.js

**Files:**
- Modify: `src/jpdb.js`

**Step 1: Remove imports**

Remove these lines from the imports section:
```javascript
import { findUserById } from './auth/users.js';
import { decryptKeys } from './auth/crypto.js';
```

**Step 2: Remove getJpdbApiKey function**

Delete the entire `getJpdbApiKey` function (lines ~40-65):
```javascript
/**
 * Get JPDB API key from request body or user's encrypted storage
 * @param {object} req - Express request object
 * @returns {string|null} JPDB API key or null
 */
export function getJpdbApiKey(req) {
  // First try request body
  if (req.body?.jpdbApiKey) {
    return req.body.jpdbApiKey;
  }

  // Then try user's encrypted storage if authenticated
  if (req.user?.id) {
    const user = findUserById(req.user.id);
    if (user?.encryptedApiKeys) {
      try {
        const keys = decryptKeys(user.encryptedApiKeys, process.env.ENCRYPTION_KEY || 'a'.repeat(64));
        if (keys.jpdbApiKey) {
          return keys.jpdbApiKey;
        }
      } catch {}
    }
  }

  return null;
}
```

**Step 3: Run syntax check**

Run: `node --check src/jpdb.js`
Expected: No output (success)

**Step 4: Commit**

```bash
git add src/jpdb.js
git commit -m "refactor(jpdb): remove getJpdbApiKey, use middleware instead"
```

---

### Task 5: Update vocab.js to use middleware

**Files:**
- Modify: `src/routes/vocab.js`

**Step 1: Update imports**

Remove `getJpdbApiKey` from jpdb.js import:
```javascript
import {
  testConnection,
  getVocabulary,
  fetchDeckVocabulary,
  fetchAllDecksVocabulary,
  parseText,
  reviewVocabulary,
  invalidateWordStateCache,
  lookupVocabularyMeaning,
  lookupVocabularyBatch
} from '../jpdb.js';
```

Add attachUserKeys import:
```javascript
import { requireAuth, optionalAuth, attachUserKeys } from '../auth/middleware.js';
```

**Step 2: Add middleware to routes that need keys**

For each route using `getJpdbApiKey(req)`, add `attachUserKeys` middleware and change to `req.userKeys?.jpdbApiKey`.

Routes to update:
- `/jpdb/parse` - uses `optionalAuth`, add `attachUserKeys`
- `/jpdb/review` - uses `optionalAuth`, add `attachUserKeys`
- `/vocab/lookup` - uses `optionalAuth`, add `attachUserKeys`
- `/vocab/lookup-batch` - uses `optionalAuth`, add `attachUserKeys`

Example change for `/jpdb/parse`:
```javascript
// Before:
router.post('/jpdb/parse', optionalAuth, async (req, res) => {
  const jpdbApiKey = getJpdbApiKey(req);

// After:
router.post('/jpdb/parse', optionalAuth, attachUserKeys, async (req, res) => {
  const jpdbApiKey = req.userKeys?.jpdbApiKey;
```

Apply same pattern to all 4 routes.

**Step 3: Run syntax check**

Run: `node --check src/routes/vocab.js`
Expected: No output (success)

**Step 4: Commit**

```bash
git add src/routes/vocab.js
git commit -m "refactor(vocab): use attachUserKeys middleware"
```

---

### Task 6: Update game/misc.js to use req.userKeys

**Files:**
- Modify: `src/routes/game/misc.js`

**Step 1: Remove getJpdbApiKey import**

Change:
```javascript
import {
  getVocabulary,
  lookupWordStates,
  getDueWordsWithMeanings,
  fetchDueWordsDirectly,
  parseWordBatch,
  configure as configureJpdb,
  getJpdbApiKey
} from '../../jpdb.js';
```

To:
```javascript
import {
  getVocabulary,
  lookupWordStates,
  getDueWordsWithMeanings,
  fetchDueWordsDirectly,
  parseWordBatch,
  configure as configureJpdb
} from '../../jpdb.js';
```

**Step 2: Replace all getJpdbApiKey(req) calls**

Find and replace all instances of:
```javascript
const jpdbApiKey = getJpdbApiKey(req);
```

With:
```javascript
const jpdbApiKey = req.userKeys?.jpdbApiKey;
```

There are 8 occurrences in misc.js at approximately lines:
- 388, 413, 442, 472, 498, 523 (and possibly more)

**Step 3: Run syntax check**

Run: `node --check src/routes/game/misc.js`
Expected: No output (success)

**Step 4: Commit**

```bash
git add src/routes/game/misc.js
git commit -m "refactor(misc): use req.userKeys instead of getJpdbApiKey"
```

---

### Task 7: Verify with E2E tests

**Step 1: Run e2e tests**

Run: `./scripts/e2e-test.sh`
Expected: 80+/87 tests pass (known flakiness acceptable)

**Step 2: If tests fail, debug and fix**

Check for:
- Missing middleware on routes
- Typos in `req.userKeys?.jpdbApiKey`
- Import errors

**Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address e2e test failures from keys refactor"
```

---

### Task 8: Clean up auth/routes.js (optional)

**Files:**
- Modify: `src/auth/routes.js`

**Step 1: Replace inline decryption with getUserKeys**

Find inline `decryptKeys` calls and replace with `getUserKeys(user.id)`.

This is lower priority since auth routes work differently (they decrypt during login flow, not via middleware).

**Step 2: Commit if changed**

```bash
git add src/auth/routes.js
git commit -m "refactor(auth): use getUserKeys for consistency"
```
