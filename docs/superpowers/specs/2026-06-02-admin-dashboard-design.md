# Admin Dashboard Design

**Date:** 2026-06-02
**Status:** Approved mockup
**Approved visual reference:** `tmp/admin-dashboard-tabs-mockup.html` in the main `koto-dev` worktree

## Goal

Build a real Koto admin dashboard at `/admin/` that consolidates the useful existing admin and dev tools into a modern operations console. The first implementation should feel like a proper backend system, not a link farm or tabbed prototype.

The dashboard should start with the existing useful tools and lightweight live admin views. It should also make future consolidation obvious: standalone operational pages can be linked from workflow modules today, then absorbed into first-class dashboard screens over time.

## Product Shape

The approved direction is a modern admin app shell:

- Persistent left sidebar, grouped by workflow.
- Sticky top bar with context title, command/search input, and high-value quick actions.
- Overview-first command center with stats and prioritized work queue.
- Data tables and queues for operational views.
- Tool links shown inside workflow modules, not as global top tabs.
- No `Legacy Tools` section.
- No `/dev/mockups` section.
- Simulator dashboards included as their own analysis module.

The visual language should be restrained, dense enough for repeated operations, and aligned with modern tools like Retool, Linear, Stripe, or Railway dashboards. Avoid marketing-style cards, oversized hero treatments, or decorative gradients.

## Navigation

### Command Center

**Overview**

The default landing page. It answers "what needs attention?" before listing tools.

First-pass content:

- Stat cards:
  - Open bug reports
  - Language alerts
  - Asset queue
  - Simulator readiness or recent simulator activity
- Prioritized work queue:
  - Critical bug reports
  - Language tokenization/dictionary review
  - Sprite review queue
  - Simulator run review
- Operational snapshot panel:
  - Simple summary chart using static seed data until live metrics exist
  - Future space for recent bug report thumbnails and quick links

**Bug Reports**

Live admin view backed by existing bug report APIs:

- `GET /api/bug-reports`
- `GET /api/bug-reports/:id`
- `GET /api/bug-reports/:id/screenshot`
- `DELETE /api/bug-reports/:id`

UI:

- Environment selector: production/dev where practical.
- Reports table with note, timestamp, viewport, DPR, device/user agent summary, phase, and quick actions.
- Detail panel or drawer for selected report metadata.
- Screenshot preview/download action.
- Copy game state action.
- Delete report action with confirmation.

**Users & Data**

Live admin view backed by existing `/api/admin` endpoints:

- `GET /api/admin/list-users`
- `GET /api/admin/word-knowledge/:userId`
- `POST /api/admin/delete-user`

UI:

- Searchable users table.
- User detail panel with ID, username, created date, save/data summary where available.
- Word knowledge viewer entry point.
- Destructive delete user flow gated behind typed username confirmation and a second confirm action.

The following simulator maintenance endpoints are intentionally not mixed into Users & Data because their purpose is analysis support, not normal account administration:

- `POST /api/admin/advance-time`
- `POST /api/admin/seed-vocab`
- `POST /api/admin/cleanup-sim-user`
- `POST /api/admin/balance-simulations/*`

Those remain implementation details of simulator workflows.

### Production Tools

**Language QA**

Links and future homes for language-learning safety tools:

- Word Exposure Dashboard: `/admin-word-exposures.html`
- Frame Audit: `/admin-frame-audit.html`
- Dictionary Editing: currently nested in Word Exposure; future first-class sub-view.
- Frame Comparison: currently nested in Word Exposure; future first-class sub-view.

This module is high priority because it protects dictionary accuracy and i+1 constraints.

**Content Studio**

Existing content tooling:

- Forge Workbench: `/forge.html`
- Content Browser: `/dev/content`
- Creature Move Preview: `/creature-move-preview.html`

Future consolidation can embed these views or route them as subpages under `/admin/content/*`.

**Asset Pipeline**

Live asset tooling only:

- Sprite Review Dashboard: `/dev/sprites`
- Sprite Forge: `/forge.html?tab=sprites`

Do not include old static one-off review pages here.

### Analysis

**Simulators**

Actual simulator dashboards belong here. This is not a list of low-level simulator admin endpoints.

First-pass links:

- Learning Simulator: `http://localhost:3100/#profiles`
- Simulator Compare: `http://localhost:3100/#compare`
- Balance Simulator: `http://localhost:3100/#balance`

The dashboard should make clear that the simulator is a separate service. If it is unavailable, show a useful disabled/offline state rather than presenting it as a broken in-app page.

Future consolidation can embed recent simulator runs, show last-run summaries, and trigger balance jobs directly, but the first pass can link out.

## Explicit Exclusions

Do not include a `Legacy Tools` nav section.

Do not include these old one-off pages in the admin dashboard IA:

- `/regen-review.html`
- `/assets/sprites/items/review.html`
- `/creatures-gallery.html`
- `/dev/mockups`

`/dev/mockups` should be removed as a route and removed from existing dev navigation. Individual `public/mockup-*.html` files can remain for now unless a later cleanup explicitly deletes them.

Simulator operations should not be presented as raw maintenance buttons in Users & Data. The simulators themselves belong under the Simulators module.

## Routing And Page Structure

First implementation:

- Add `/admin/` route serving a new dashboard page.
- Keep the existing standalone pages working.
- Use the dashboard as a shell and launch point for existing tools.
- Implement Bug Reports and Users & Data as live dashboard views.
- Keep simulator links external in the first pass.

Recommended files:

- `public/admin.html` or `public/admin/index.html` for the dashboard shell.
- `public/js/admin-dashboard.js` for dashboard state and API calls.
- `public/admin-dashboard.css` or a scoped stylesheet block if the repo pattern favors single-file admin pages.
- `src/routes/dev.js` update to remove `/dev/mockups`.
- `public/dev-hub.html`, `public/dev-sprites.html`, `public/dev-content.html`, `public/forge.html`, and any other nav-bearing dev pages should remove `/dev/mockups` links.

If the implementation chooses a different file split, preserve the same module boundaries:

- App shell/navigation
- Overview
- Bug Reports
- Users & Data
- Tool directory modules
- API client helpers

## Auth And Safety

Existing admin APIs use `X-Admin-Secret`. The dashboard should follow that model in the first pass.

Auth behavior:

- Load existing `/api/admin/secret` behavior in local/dev where available.
- Store a manually entered admin secret in `sessionStorage`.
- Send `x-admin-secret` for `/api/admin/*` calls.
- Show 403/404 auth failures clearly.

Safety behavior:

- Delete user requires typed username confirmation.
- Delete bug report requires a confirmation click.
- Any future dictionary edits must preserve the existing dictionary-edit validation and read-only behavior.
- Do not expose simulator time-advance or cleanup buttons in the generic admin UI.

## Data Flow

Overview:

- Reads Bug Reports and Users endpoints where available.
- Uses static seed data for the asset/language/simulator queue entries until more live metrics exist.
- Links to Language QA, Content Studio, Asset Pipeline, and Simulators.

Bug Reports:

1. Fetch report list.
2. Render table.
3. Selecting a report fetches metadata detail.
4. Screenshot action uses the screenshot endpoint.
5. Delete removes the report and refreshes the list.

Users & Data:

1. Fetch user list from `/api/admin/list-users`.
2. Render searchable table.
3. User selection can fetch word knowledge by user ID.
4. Delete posts username to `/api/admin/delete-user` after confirmations.

Simulators:

- Links to the standalone simulator dashboard routes.
- Optionally checks `http://localhost:3100/api/health` in local development if CORS and environment allow it.
- If no health check is practical, treat simulator links as external tools.

## Error Handling

- Show empty states for no reports/users.
- Show auth state separately from data-empty state.
- For missing `ADMIN_SECRET`, explain that admin APIs are unavailable.
- For simulator links, show "standalone simulator service" context so a user understands why a link may not respond.
- Do not block non-admin link modules if an admin API fails.

## Visual Requirements

Match the approved mockup direction:

- Dark operations console.
- Left sidebar grouped into Command Center, Production Tools, and Analysis.
- No top tab row.
- No `Legacy Tools`.
- Compact stat cards and tables.
- Clear destructive action styling.
- Minimal badges used for status and counts, not decoration.
- Responsive collapse should keep navigation usable on mobile, but desktop is the primary admin workflow.

## Testing And Verification

Automated checks:

- `node --check` for any new JS files.
- Focused route/API tests if new server routes are added beyond static serving.
- Existing relevant admin route tests should continue passing.

Manual/browser verification:

- `/admin/` loads.
- Sidebar navigation switches modules without layout breakage.
- Bug Reports list loads or shows an auth/error state.
- Users & Data list loads or shows an auth/error state.
- Delete buttons are gated and do not fire immediately.
- Existing tool links point to the correct pages.
- `/dev/mockups` is no longer reachable as a dev route or shown in nav.
- Simulators module shows Learning Simulator, Simulator Compare, and Balance Simulator links.
- No Legacy Tools section appears.

Visual verification is required before claiming implementation complete because this is a dashboard UI change.
