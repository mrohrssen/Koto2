# Bug Reporter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an in-game bug reporter that captures screenshots, game context, and user notes, with API endpoints for review.

**Architecture:** Frontend uses html2canvas to capture screenshots. A floating bug button opens a modal for name/tester/note input. Reports POST to `/api/bug-report` which saves to `bug-reports/<name>/`. List/fetch/delete endpoints enable Claude-assisted review.

**Tech Stack:** html2canvas (CDN), Express.js endpoints, file-based storage

---

## Task 1: Add html2canvas to Frontend

**Files:**
- Modify: `public/game.html`

**Step 1: Add html2canvas script tag**

Add before the closing `</body>` tag (before the game.js script around line 165):

```html
  <!-- Bug Reporter Screenshot Library -->
  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>

  <script type="module" src="game.js"></script>
```

**Step 2: Verify it loads**

Run: `npm run dev`
Open browser console, type: `typeof html2canvas`
Expected: `"function"`

**Step 3: Commit**

```bash
git add public/game.html
git commit -m "feat(bug-report): add html2canvas for screenshot capture"
```

---

## Task 2: Add Bug Button to UI

**Files:**
- Modify: `public/game.html`
- Modify: `public/game.css`

**Step 1: Add bug button HTML**

Add after the utility-row closing div (after line 99, before the Lookup Popup):

```html
    <!-- Bug Report Button -->
    <button class="bug-report-btn" id="bug-report-btn" aria-label="Report Bug">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3 3 0 1 1 6 0v1"/>
        <path d="M12 20c-3.3 0-6-2.7-6-6v-3a6 6 0 0 1 12 0v3c0 3.3-2.7 6-6 6"/>
        <path d="M12 20v2M6 13H2M6 17H2M22 13h-4M22 17h-4"/>
      </svg>
    </button>
```

**Step 2: Add bug button CSS**

Add to end of game.css:

```css
/* ===== BUG REPORT BUTTON ===== */
.bug-report-btn {
  position: fixed;
  bottom: calc(76px + env(safe-area-inset-bottom));
  right: 12px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--accent-red);
  color: white;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-card);
  z-index: 100;
  cursor: pointer;
  transition: transform var(--transition-fast), background var(--transition-fast);
}

.bug-report-btn:active {
  transform: scale(0.95);
  background: #c0392b;
}
```

**Step 3: Test visually**

Run: `npm run dev`
Open game in browser - bug button should appear bottom-right, above utility row

**Step 4: Commit**

```bash
git add public/game.html public/game.css
git commit -m "feat(bug-report): add floating bug report button"
```

---

## Task 3: Add Bug Report Modal HTML/CSS

**Files:**
- Modify: `public/game.html`
- Modify: `public/game.css`

**Step 1: Add modal HTML**

Add immediately after the bug-report-btn:

```html
    <!-- Bug Report Modal -->
    <div class="bug-report-modal" id="bug-report-modal">
      <div class="bug-report-content">
        <h3 class="bug-report-title">Report Issue</h3>
        <label class="bug-report-label">
          Name
          <input type="text" id="bug-report-name" class="bug-report-input"
            placeholder="e.g. bottom-cutoff" maxlength="50">
        </label>
        <label class="bug-report-label">
          Tester
          <input type="text" id="bug-report-tester" class="bug-report-input"
            placeholder="Your name" maxlength="30">
        </label>
        <label class="bug-report-label">
          Note
          <textarea id="bug-report-note" class="bug-report-input bug-report-textarea"
            placeholder="What's wrong?" maxlength="500"></textarea>
        </label>
        <div class="bug-report-buttons">
          <button class="bug-report-cancel" id="bug-report-cancel">Cancel</button>
          <button class="bug-report-submit" id="bug-report-submit">Submit</button>
        </div>
      </div>
    </div>
```

**Step 2: Add modal CSS**

Add to end of game.css (after the bug button CSS):

```css
/* ===== BUG REPORT MODAL ===== */
.bug-report-modal {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 20px;
}

.bug-report-modal.active {
  display: flex;
}

.bug-report-content {
  background: var(--bg-card);
  border-radius: var(--radius-md);
  padding: 20px;
  width: 100%;
  max-width: 320px;
  box-shadow: var(--shadow-card);
}

.bug-report-title {
  margin: 0 0 16px 0;
  font-size: 18px;
  color: var(--text-primary);
}

.bug-report-label {
  display: block;
  margin-bottom: 12px;
  font-size: 14px;
  color: var(--text-secondary);
}

.bug-report-input {
  width: 100%;
  margin-top: 4px;
  padding: 10px 12px;
  border: 1px solid #e0e0e0;
  border-radius: var(--radius-sm);
  font-size: 16px;
  font-family: inherit;
}

.bug-report-input:focus {
  outline: none;
  border-color: var(--accent-blue);
}

.bug-report-textarea {
  min-height: 80px;
  resize: vertical;
}

.bug-report-buttons {
  display: flex;
  gap: 12px;
  margin-top: 16px;
}

.bug-report-cancel,
.bug-report-submit {
  flex: 1;
  padding: 12px;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
}

.bug-report-cancel {
  background: #e0e0e0;
  color: var(--text-primary);
}

.bug-report-submit {
  background: var(--accent-red);
  color: white;
}

.bug-report-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

**Step 3: Test visually**

Manually add `active` class to modal in dev tools - should display centered

**Step 4: Commit**

```bash
git add public/game.html public/game.css
git commit -m "feat(bug-report): add report modal UI"
```

---

## Task 4: Create Bug Report API Endpoints

**Files:**
- Create: `src/routes/bug-reports.js`
- Modify: `src/routes/index.js`

**Step 1: Create bug-reports route module**

Create `src/routes/bug-reports.js`:

```javascript
/**
 * Bug Report Routes
 *
 * Handles screenshot + metadata capture for mobile testing.
 * Reports stored in bug-reports/<name>/
 */

import { Router } from 'express';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { dataPath } from '../data-dir.js';

const BUG_REPORTS_DIR = dataPath('bug-reports');

// Ensure directory exists
if (!existsSync(BUG_REPORTS_DIR)) {
  mkdirSync(BUG_REPORTS_DIR, { recursive: true });
}

export default function createBugReportRoutes() {
  const router = Router();

  // POST /api/bug-report - Submit a new bug report
  router.post('/bug-report', (req, res) => {
    try {
      const { name, tester, note, screenshot, context } = req.body;

      if (!name || !screenshot) {
        return res.status(400).json({ error: 'Name and screenshot are required' });
      }

      // Sanitize name for filesystem
      const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-').substring(0, 50);
      const timestamp = new Date().toISOString();
      const reportDir = join(BUG_REPORTS_DIR, `${safeName}-${Date.now()}`);

      mkdirSync(reportDir, { recursive: true });

      // Save screenshot (base64 PNG)
      const base64Data = screenshot.replace(/^data:image\/png;base64,/, '');
      writeFileSync(join(reportDir, 'screenshot.png'), base64Data, 'base64');

      // Save metadata
      const report = {
        name: safeName,
        tester: tester || 'anonymous',
        note: note || '',
        timestamp,
        ...context
      };
      writeFileSync(join(reportDir, 'report.json'), JSON.stringify(report, null, 2));

      res.json({ success: true, reportId: `${safeName}-${Date.now()}` });
    } catch (error) {
      console.error('Bug report error:', error);
      res.status(500).json({ error: 'Failed to save bug report' });
    }
  });

  // GET /api/bug-reports - List all bug reports
  router.get('/bug-reports', (req, res) => {
    try {
      if (!existsSync(BUG_REPORTS_DIR)) {
        return res.json({ reports: [] });
      }

      const reports = readdirSync(BUG_REPORTS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => {
          const reportPath = join(BUG_REPORTS_DIR, d.name, 'report.json');
          if (existsSync(reportPath)) {
            const data = JSON.parse(readFileSync(reportPath, 'utf-8'));
            return { id: d.name, ...data };
          }
          return { id: d.name, name: d.name };
        })
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      res.json({ reports });
    } catch (error) {
      console.error('List bug reports error:', error);
      res.status(500).json({ error: 'Failed to list bug reports' });
    }
  });

  // GET /api/bug-reports/:id - Get specific report metadata
  router.get('/bug-reports/:id', (req, res) => {
    try {
      const reportDir = join(BUG_REPORTS_DIR, req.params.id);
      const reportPath = join(reportDir, 'report.json');

      if (!existsSync(reportPath)) {
        return res.status(404).json({ error: 'Report not found' });
      }

      const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
      res.json({ id: req.params.id, ...report });
    } catch (error) {
      console.error('Get bug report error:', error);
      res.status(500).json({ error: 'Failed to get bug report' });
    }
  });

  // GET /api/bug-reports/:id/screenshot - Get screenshot image
  router.get('/bug-reports/:id/screenshot', (req, res) => {
    try {
      const screenshotPath = join(BUG_REPORTS_DIR, req.params.id, 'screenshot.png');

      if (!existsSync(screenshotPath)) {
        return res.status(404).json({ error: 'Screenshot not found' });
      }

      res.sendFile(screenshotPath);
    } catch (error) {
      console.error('Get screenshot error:', error);
      res.status(500).json({ error: 'Failed to get screenshot' });
    }
  });

  // DELETE /api/bug-reports/:id - Delete a report
  router.delete('/bug-reports/:id', (req, res) => {
    try {
      const reportDir = join(BUG_REPORTS_DIR, req.params.id);

      if (!existsSync(reportDir)) {
        return res.status(404).json({ error: 'Report not found' });
      }

      rmSync(reportDir, { recursive: true });
      res.json({ success: true });
    } catch (error) {
      console.error('Delete bug report error:', error);
      res.status(500).json({ error: 'Failed to delete bug report' });
    }
  });

  return router;
}
```

**Step 2: Register routes in index.js**

In `src/routes/index.js`, add import at top (after line 5):

```javascript
import createBugReportRoutes from './bug-reports.js';
```

Add route registration before the `return router;` statement (around line 64):

```javascript
  // Bug report routes: /api/bug-report, /api/bug-reports/*
  router.use(createBugReportRoutes());
```

**Step 3: Test endpoints**

Run: `npm run dev`

```bash
# Test list (should return empty)
curl http://localhost:3000/api/bug-reports
# Expected: {"reports":[]}
```

**Step 4: Commit**

```bash
git add src/routes/bug-reports.js src/routes/index.js
git commit -m "feat(bug-report): add API endpoints for submit/list/get/delete"
```

---

## Task 5: Create Bug Report Frontend Module

**Files:**
- Create: `public/js/ui/bug-report.js`

**Step 1: Create the module**

Create `public/js/ui/bug-report.js`:

```javascript
/**
 * Bug Report UI Module
 *
 * Captures screenshots and submits bug reports to the server.
 */

import { dom } from '../dom.js';
import { store } from '../store.js';

const TESTER_KEY = 'bugReportTester';

let modal = null;
let nameInput = null;
let testerInput = null;
let noteInput = null;
let submitBtn = null;
let cancelBtn = null;
let reportBtn = null;

/** Initialize bug report UI */
export function init() {
  modal = document.getElementById('bug-report-modal');
  nameInput = document.getElementById('bug-report-name');
  testerInput = document.getElementById('bug-report-tester');
  noteInput = document.getElementById('bug-report-note');
  submitBtn = document.getElementById('bug-report-submit');
  cancelBtn = document.getElementById('bug-report-cancel');
  reportBtn = document.getElementById('bug-report-btn');

  if (!modal || !reportBtn) {
    console.warn('Bug report elements not found');
    return;
  }

  // Load saved tester name
  const savedTester = localStorage.getItem(TESTER_KEY);
  if (savedTester && testerInput) {
    testerInput.value = savedTester;
  }

  // Event listeners
  reportBtn.addEventListener('click', openModal);
  cancelBtn.addEventListener('click', closeModal);
  submitBtn.addEventListener('click', submitReport);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

/** Open the bug report modal */
function openModal() {
  if (modal) {
    modal.classList.add('active');
    nameInput?.focus();
  }
}

/** Close the bug report modal */
function closeModal() {
  if (modal) {
    modal.classList.remove('active');
    // Clear form but keep tester name
    if (nameInput) nameInput.value = '';
    if (noteInput) noteInput.value = '';
  }
}

/** Capture screenshot using html2canvas */
async function captureScreenshot() {
  // Hide modal and bug button during capture
  const wasActive = modal?.classList.contains('active');
  modal?.classList.remove('active');
  reportBtn.style.display = 'none';

  // Small delay for DOM update
  await new Promise(r => setTimeout(r, 50));

  try {
    const canvas = await html2canvas(document.querySelector('.game-app'), {
      scale: window.devicePixelRatio || 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null
    });
    return canvas.toDataURL('image/png');
  } finally {
    // Restore UI
    reportBtn.style.display = '';
    if (wasActive) modal?.classList.add('active');
  }
}

/** Gather game context */
function gatherContext() {
  const gameState = store.get('gameState') || {};

  return {
    screen: gameState.phase || 'unknown',
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    devicePixelRatio: window.devicePixelRatio || 1,
    userAgent: navigator.userAgent,
    scrollPositions: {
      main: document.querySelector('.game-app')?.scrollTop || 0
    },
    gameState: {
      phase: gameState.phase,
      floor: gameState.run?.floor,
      ward: gameState.run?.ward?.name,
      inCombat: !!gameState.combat
    }
  };
}

/** Submit the bug report */
async function submitReport() {
  const name = nameInput?.value.trim();
  const tester = testerInput?.value.trim();
  const note = noteInput?.value.trim();

  if (!name) {
    nameInput?.focus();
    return;
  }

  // Save tester name for next time
  if (tester) {
    localStorage.setItem(TESTER_KEY, tester);
  }

  // Disable button during submission
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Capturing...';
  }

  try {
    const screenshot = await captureScreenshot();
    const context = gatherContext();

    const response = await fetch('/api/bug-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, tester, note, screenshot, context })
    });

    const data = await response.json();

    if (data.success) {
      closeModal();
      showToast('Bug report submitted!');
    } else {
      showToast('Failed to submit report');
    }
  } catch (error) {
    console.error('Bug report submission error:', error);
    showToast('Error submitting report');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    }
  }
}

/** Show a temporary toast message */
function showToast(message) {
  const toast = dom.sceneToast;
  if (toast) {
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2000);
  }
}
```

**Step 2: Commit**

```bash
git add public/js/ui/bug-report.js
git commit -m "feat(bug-report): add frontend capture and submission module"
```

---

## Task 6: Wire Up Bug Report Module in game.js

**Files:**
- Modify: `public/game.js`

**Step 1: Add import**

Add after the lookup import (after line 54):

```javascript
import * as bugReport from './js/ui/bug-report.js';
```

**Step 2: Initialize module**

Find the `initGame()` function (around line 583) and add after `leaderboard.init();` (line 585):

```javascript
bugReport.init();
```

**Step 3: Test full flow**

Run: `npm run dev`
1. Open game in browser
2. Click bug button
3. Fill in name: "test-report", tester: "dev", note: "Testing"
4. Click Submit
5. Check `bug-reports/` directory for saved report

**Step 4: Commit**

```bash
git add public/game.js
git commit -m "feat(bug-report): wire up bug report module to game"
```

---

## Task 7: Add DOM References (Optional)

**Files:**
- Modify: `public/js/dom.js`

**Note:** The bug-report.js module uses `document.getElementById()` directly, but for consistency with other modules, add references to dom.js.

**Step 1: Add bug report getters**

Add after the lookup mode getters (after line 82, before the closing `};`):

```javascript

  // Bug report
  get bugReportBtn() { return el('bug-report-btn'); },
  get bugReportModal() { return el('bug-report-modal'); },
  get bugReportName() { return el('bug-report-name'); },
  get bugReportTester() { return el('bug-report-tester'); },
  get bugReportNote() { return el('bug-report-note'); },
  get bugReportSubmit() { return el('bug-report-submit'); },
  get bugReportCancel() { return el('bug-report-cancel'); },
```

**Step 2: Commit**

```bash
git add public/js/dom.js
git commit -m "feat(bug-report): add DOM references for bug report elements"
```

---

## Task 8: Test Full Integration

**Step 1: Syntax check**

```bash
node --check public/game.js && echo "OK"
node --check public/js/ui/bug-report.js && echo "OK"
```

**Step 2: Run e2e tests to ensure nothing broke**

```bash
./scripts/e2e-test.sh
```

Expected: 80+ tests passing (same as baseline)

**Step 3: Manual test on local**

1. `npm run dev`
2. Open http://localhost:3000
3. Login and start a game
4. Click bug button, submit a test report
5. Verify report saved:
   ```bash
   ls bug-reports/
   cat bug-reports/*/report.json
   ```

**Step 4: Test API endpoints**

```bash
# List reports
curl http://localhost:3000/api/bug-reports

# Get specific report (use actual ID from list)
curl http://localhost:3000/api/bug-reports/<id>

# View screenshot in browser
open http://localhost:3000/api/bug-reports/<id>/screenshot
```

**Step 5: Commit final changes**

```bash
git add -A
git commit -m "feat(bug-report): complete bug reporter integration"
```

---

## Task 9: Create Local Testing Helper Script

**Files:**
- Create: `scripts/mobile-test.sh`

**Step 1: Create the helper script**

Create `scripts/mobile-test.sh`:

```bash
#!/bin/bash
# Mobile Testing Helper
# Shows your local IP and instructions for Safari Web Inspector testing

# Get local IP (macOS)
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)

if [ -z "$LOCAL_IP" ]; then
  echo "Could not detect local IP. Make sure you're connected to WiFi."
  exit 1
fi

echo ""
echo "=== Mobile Testing Setup ==="
echo ""
echo "1. On your iPhone:"
echo "   Settings → Safari → Advanced → Enable 'Web Inspector'"
echo ""
echo "2. On your Mac:"
echo "   Safari → Settings → Advanced → Enable 'Show Develop menu'"
echo ""
echo "3. Open this URL on your iPhone Safari:"
echo "   http://${LOCAL_IP}:3000"
echo ""
echo "4. Connect iPhone via USB cable"
echo ""
echo "5. In Mac Safari menu:"
echo "   Develop → [Your iPhone] → [The webpage]"
echo ""
echo "Starting dev server..."
echo ""
npm run dev
```

**Step 2: Make executable**

```bash
chmod +x scripts/mobile-test.sh
```

**Step 3: Test it**

```bash
./scripts/mobile-test.sh
```

**Step 4: Commit**

```bash
git add scripts/mobile-test.sh
git commit -m "feat(bug-report): add mobile testing helper script"
```

---

## Summary

After completing all tasks:

1. **Bug button** - Always visible, bottom-right corner
2. **Bug modal** - Name, tester, note fields with submit
3. **Screenshot capture** - Uses html2canvas, captures game-app div
4. **API endpoints** - Submit, list, get, delete reports
5. **File storage** - Reports in `bug-reports/<name>-<timestamp>/`
6. **Mobile testing script** - Shows local IP and Safari setup instructions

**To review bug reports:**
```bash
# List all reports
curl http://localhost:3000/api/bug-reports

# Or on Railway
curl https://jrpg-production.up.railway.app/api/bug-reports
```

Then share report IDs with Claude for visual review of screenshots.
