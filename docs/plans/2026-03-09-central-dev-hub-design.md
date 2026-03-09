# Central Dev Hub Design

**Date:** 2026-03-09
**Status:** Approved

## Problem

Koto has 5 dev dashboards scattered across different URLs with no central entry point. Developers must remember individual URLs. Additionally, feature mockup HTML files have no browsable index.

## Solution

A central dev hub page at `/dev/` that links to all dashboards, plus a new Feature Mockups page that auto-discovers mockup files.

## Dashboards

| # | Name | URL | Notes |
|---|------|-----|-------|
| 1 | Sprite Review | `/dev/sprites` | Existing, auth-protected |
| 2 | Forge Workbench | `/forge.html` | Existing, public static |
| 3 | Creatures Gallery | `/creatures-gallery.html` | Existing, public static |
| 4 | Regen Review | `/regen-review.html` | Existing, public static |
| 5 | Items Review | `/assets/sprites/items/review.html` | Existing, public static |
| 6 | Feature Mockups | `/dev/mockups` | **New**, auth-protected |

## Central Hub (`/dev/`)

- **Route:** `GET /dev/` serves `public/dev-hub.html`
- **Auth:** Behind existing dev auth (password + session cookie)
- **Layout:** Card grid, dark theme (`#1a1a2e` / `#16213e`), matching existing dev dashboard style
- **Cards:** Each has name, one-line description, click to navigate
- **Change:** `/dev/` currently redirects to `/dev/sprites` — will now serve the hub instead

## Feature Mockups Page (`/dev/mockups`)

- **Route:** `GET /dev/mockups` serves `public/dev-mockups.html`
- **API:** `GET /dev/api/mockups` returns JSON list of mockup files (auto-discovered from `public/mockup-*.html`)
- **Auth:** Behind existing dev auth
- **UI:** Simple link list, each opens in new tab. Dark theme matching hub.
- **Auto-discovery:** Reads `public/` directory for files matching `mockup-*.html` pattern, so new mockups appear without code changes.

## Files Changed

- `src/routes/dev.js` — Add `GET /` hub route, `GET /mockups` route, `GET /api/mockups` endpoint
- `public/dev-hub.html` — New hub page (card grid)
- `public/dev-mockups.html` — New mockups list page
