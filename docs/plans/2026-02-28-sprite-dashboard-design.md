# Sprite Review Dashboard — Design

**Date:** 2026-02-28
**Status:** Proposed

## Problem

The developer works from a terminal on a VPS and has no way to visually review the 400+ game sprites (creatures, actions, items, enemies, NPCs, backgrounds). When sprites are generated or regenerated, there's no quick way to see which look good and which need rework.

## Solution

Add a `/dev/sprites` route to the existing game server and run the game server on the VPS via pm2. This provides a password-protected sprite review dashboard accessible from any browser.

## Why the game server, not a standalone tool

- Already loads all data files (creatures.json, moves.json, items.json, enemies.json)
- Already serves `/assets/` as static files
- Already has auth infrastructure
- Avoids duplicating data parsing and file serving
- Bonus: the user gets a playable dev instance for free

## Architecture

### Server-side (2 new files)

**`src/routes/dev.js`** — Express router mounted at `/dev`

- `GET /dev/sprites` — Serves the dashboard HTML page
- `GET /dev/api/manifest` — Returns JSON manifest of all sprites grouped by category, cross-referenced with data files
- `GET /dev/api/feedback` — Returns current feedback data
- `POST /dev/api/feedback` — Save/update feedback for a sprite
- `DELETE /dev/api/feedback/:key` — Clear feedback for a sprite

**Auth middleware** for `/dev/*` routes:
- Simple password check via `DEV_DASHBOARD_PASSWORD` env var
- Cookie-based session (express-session or signed cookie) so you stay logged in
- Rate limiting: 5 login attempts per IP per minute (express-rate-limit, already a dependency or trivial to add)
- Login page is a simple form, no JS required

### Manifest endpoint

Scans sprite directories and cross-references with data files:

```json
{
  "creatures": [
    { "id": "samegaron", "name": "サメガロン", "nameEn": "Samegaron", "static": "/assets/sprites/robots/samegaron.webp", "idle": "/assets/sprites/robots/samegaron-idle.webp", "hasData": true }
  ],
  "actions": [
    { "slug": "dash", "name": "走る", "nameEn": "Dash", "src": "/assets/sprites/actions/dash.webp", "hasData": true },
    { "slug": "bounce", "src": "/assets/sprites/actions/bounce.webp", "hasData": false }
  ],
  "items": [...],
  "enemies": [...],
  "npcs": [...],
  "backgrounds": [...]
}
```

- `hasData: false` marks orphan sprites (icon file exists but no data file reference)
- Manifest is built on server start and cached; a refresh button triggers a rescan

### Frontend (1 new file)

**`public/dev-sprites.html`** — Single self-contained HTML page (inline CSS + JS, no build step)

**Layout:**
- Top bar: category tabs (Creatures | Actions | Items | Enemies | NPCs | Backgrounds), search box, "Show orphans only" toggle, "Review queue" button
- Grid of sprite cards
- Each card: image thumbnail, name (JP + EN), data status badge
- Click card → expanded view with larger image + feedback form
- Feedback form: text area + "Flag" button → POST to `/dev/api/feedback`
- Flagged sprites show a red badge in the grid
- "Review Queue" tab filters to flagged sprites only, shows all feedback notes

**Responsive:** Works on phone (the user may review on mobile).

### Feedback storage

**`tools/sprite-feedback.json`** (gitignored)

```json
{
  "creatures/samegaron": {
    "notes": ["idle animation is choppy", "colors too saturated"],
    "flagged": true,
    "createdAt": "2026-02-28T10:00:00Z",
    "updatedAt": "2026-02-28T12:00:00Z"
  }
}
```

Claude reads this file when asked to act on feedback.

### Deployment on VPS

1. Install pm2: `npm install -g pm2`
2. Create `.env` with `DEV_DASHBOARD_PASSWORD=<chosen-password>`
3. `pm2 start server.js --name koto-dev`
4. `pm2 startup` to survive reboots
5. Access at `http://<vps-ip>:3000/dev/sprites`

## Scope boundaries

- **No image editing** — feedback only, Claude acts on it separately
- **No database** — JSON file on disk
- **No build step** — single HTML file with inline everything
- **Dev only** — `/dev/*` routes should be excluded from production (or gated by env var)

## Files to create/modify

| File | Action |
|---|---|
| `src/routes/dev.js` | Create — dashboard routes + manifest + feedback API |
| `public/dev-sprites.html` | Create — dashboard UI |
| `server.js` | Modify — mount `/dev` router |
| `.gitignore` | Modify — add `tools/sprite-feedback.json` |
| `.env` | Create on VPS — `DEV_DASHBOARD_PASSWORD` |
