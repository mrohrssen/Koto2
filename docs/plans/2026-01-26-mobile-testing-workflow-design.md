# Mobile Testing Workflow Design

> **Goal:** Eliminate the slow deploy-test-fix loop for mobile layout issues by enabling real-device testing locally and adding an in-game bug reporter for Claude-assisted visual QA.

## Part 1: Safari Web Inspector (Fast Iteration)

Test on your real iPhone while editing code locally. See changes in seconds, not minutes.

### How It Works

```
┌─────────────┐      WiFi        ┌─────────────┐
│   Your Mac  │ ←──────────────→ │   iPhone    │
│  (dev server│   192.168.x.x    │  (Safari)   │
│   port 3000)│                  │             │
└─────────────┘                  └─────────────┘
       ↑                                ↑
       │              USB               │
       └────────────────────────────────┘
              Safari Web Inspector
```

Your Mac runs the dev server. Your iPhone loads the game over WiFi. The USB cable enables Safari Web Inspector—full DevTools showing exactly what Safari renders on the real device.

### Why This Beats Chrome DevTools Emulation

Chrome's mobile emulator simulates viewport size but not:
- Safari's rendering engine
- Dynamic viewport behavior (URL bar hiding/showing)
- Real scroll physics and momentum
- iOS-specific CSS bugs

Safari Web Inspector shows the truth.

### Setup Steps

**One-time iPhone setup:**
1. Settings → Safari → Advanced → Enable "Web Inspector"

**One-time Mac setup:**
1. Open Safari
2. Safari → Settings → Advanced → Enable "Show Develop menu in menu bar"

**Each session:**
1. Start dev server: `npm run dev`
2. Find your Mac's IP: `ipconfig getifaddr en0`
3. On iPhone Safari, go to `http://[your-ip]:3000`
4. Connect iPhone via USB
5. In Safari: Develop → [iPhone name] → [webpage]

A Web Inspector window opens with the real DOM, styles, and console from your phone.

---

## Part 2: In-Game Bug Reporter

Capture layout issues the moment you see them. Tap a button, add a note, submit.

### User Flow

```
┌────────────────────────────────┐
│  Report Issue                  │
│                                │
│  Name: [bottom-cutoff_______]  │
│                                │
│  Note: [Buttons get cut off    │
│         when I scroll down___] │
│                                │
│  [Cancel]         [Submit 📸]  │
└────────────────────────────────┘
```

### What Gets Captured

Each report saves to `bug-reports/[name]/`:

**screenshot.png** - Visual state at the moment of report

**report.json:**
```json
{
  "name": "bottom-cutoff",
  "note": "Buttons get cut off when I scroll down",
  "timestamp": "2026-01-26T14:32:01Z",
  "screen": "combat",
  "viewport": { "width": 393, "height": 660 },
  "devicePixelRatio": 3,
  "userAgent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)...",
  "scrollPositions": { "main": 120 },
  "gameState": { "phase": "player-turn", "floor": 3 }
}
```

### Technical Approach

**Screenshot capture:** Use `html2canvas` library to render current DOM to canvas, then convert to PNG.

**Context gathering:** Pull from existing game state objects plus `window` properties.

**Submission:** POST to `/api/bug-report` endpoint, which saves files to `bug-reports/` directory.

**UI:** Small 🐛 button in corner (maybe in settings or debug mode). Tapping opens the report modal.

---

## Part 3: Claude Visual QA Review

Review bug reports together. Claude sees screenshots and context, identifies issues, helps fix them.

### Review Workflow

1. You say: "Let's review the bug reports"
2. Claude reads `bug-reports/` directory
3. For each report, Claude:
   - Reads the context (name, note, device info, game state)
   - Views the screenshot
   - Identifies the visual issue
   - Suggests CSS/HTML fixes
4. Work through fixes together

### What Claude Can Catch

Unlike pixel-diff tools, Claude identifies semantic issues:
- "The action buttons are cut off at the bottom"
- "There's unexpected horizontal scroll"
- "The text runs into the edge with no padding"
- "This modal looks cramped on this screen size"
- "The touch targets look too small for comfortable tapping"

---

## Implementation Plan

### Phase 1: Safari Web Inspector Setup
- Create helper script to display local IP and instructions
- Document the workflow in README or CLAUDE.md

### Phase 2: Bug Reporter Backend
- Add `/api/bug-report` endpoint to server.js
- Create `bug-reports/` directory structure
- Handle screenshot upload and metadata storage

### Phase 3: Bug Reporter Frontend
- Add `html2canvas` dependency
- Create bug report modal component
- Add bug button to game UI (debug/settings area)
- Gather context from game state

### Phase 4: Review Integration
- Test the full flow
- Document the "review bug reports" workflow

---

## Open Questions

1. **Bug button visibility:** Always visible, or hidden behind settings/debug mode?
2. **Report cleanup:** Auto-delete reports after N days, or manual cleanup?
3. **Multiple testers:** If friends test, should reports include a tester name field?
