# Daily & Weekly Leaderboard Design

## Overview

Add a leaderboard showing number of cards reviewed per user, ranked from #1 downward. Users toggle between daily and weekly views. Accessible via an icon in the bottom utility row.

## Data Model

Each user in `.jrpg-users.json` gets a `reviews` array of timestamped events:

```javascript
{
  id: 'u_abc123',
  username: 'player1',
  // ...existing fields...
  reviews: [
    { ts: 1706140800000 },  // Unix ms timestamp
    { ts: 1706141100000 },
  ]
}
```

- One entry per review (pass or fail, both count)
- Pruned to last 7 days on each write
- No distinction between grade — just the timestamp matters

## Time Boundaries

All boundaries use Tokyo time (JST, UTC+9):

- **Daily:** Reviews since midnight JST today
- **Weekly:** Reviews since Monday 00:00 JST of the current week

## API

### `GET /api/game/leaderboard?period=daily|weekly`

Requires auth. Returns:

```javascript
{
  period: 'daily' | 'weekly',
  entries: [
    { rank: 1, username: 'player1', count: 47 },
    { rank: 2, username: 'player2', count: 32 },
  ],
  currentUser: { rank: 5, count: 12 }
}
```

Only users with count > 0 are included. Entries sorted descending by count.

### Review tracking hook

The existing `POST /api/jpdb/review` handler gets one addition: after sending the review to JPDB, append `{ ts: Date.now() }` to the requesting user's `reviews` array and prune entries older than 7 days.

## Frontend UI

### Utility row

New leaderboard button (trophy icon) added to `.utility-row` alongside settings, reset, and logout buttons.

### Modal panel

Uses existing modal/panel styles from the codebase:

- **Header:** "Leaderboard" title with close button
- **Toggle:** Two tab buttons — "Daily" | "Weekly" — active tab highlighted
- **List:** Numbered entries: `#rank username — count`. Current user's row highlighted
- **Empty state:** "No reviews yet" message when no data

### Behavior

- Click leaderboard icon -> fetch `GET /api/game/leaderboard?period=daily` -> show modal
- Toggle tabs -> re-fetch with selected period
- Close button or clicking outside dismisses modal

## File Changes

### Modified

- `src/auth/users.js` — add `reviews` array to user schema, add `addReview(userId)`, `pruneReviews(userId)`, `getLeaderboard(period)` helpers
- `src/routes/vocab.js` — in `/api/jpdb/review` handler, call `addReview(userId)` after JPDB submission
- `src/routes/game/index.js` — register `GET /api/game/leaderboard` route
- `public/game.html` — add leaderboard button to `.utility-row`, add modal markup, import new JS file

### New

- `public/js/ui/leaderboard.js` — modal rendering, fetch logic, daily/weekly toggle

### No new CSS

Reuse existing modal, button, and layout styles throughout.
