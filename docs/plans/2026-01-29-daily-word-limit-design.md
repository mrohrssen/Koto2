# Daily Word Discovery Limit

## Overview

Add a per-user setting that limits the number of new words discovered per day. Default limit is 10, configurable from 0-50 in the settings menu. Track daily, weekly, and lifetime discovery counts for future leaderboard use.

## User Experience

### Discovery Room Flow

1. Player enters a word discovery room
2. Quiz master narration: "You've learned XX new words today!"
3. **If at limit** (count >= limit OR limit is 0):
   - Show: "Come back tomorrow to learn more!"
   - Auto-proceed to next room (no flash cards shown)
4. **If not at limit**:
   - Show regular discovery intro narration
   - Start flash card sequence
5. **If limit reached mid-room**:
   - After the swipe that hits the limit, stop immediately
   - Show: "Come back tomorrow to learn more!"
   - Skip remaining words, proceed to next room

### Settings

Number input in existing settings modal:
- Label: "Daily Word Limit"
- Range: 0-50
- Default: 10
- Help text: "0 = skip discovery rooms"

## Data Model

### Server Settings

Add to existing `.jrpg-settings.json`:

```javascript
{
  // ... existing settings ...
  dailyWordLimit: 10  // 0-50, default 10
}
```

### Word Tracking

New file `.jrpg-word-tracking.json`:

```javascript
{
  "userId": {
    "today": {
      "date": "2026-01-29",  // Tokyo timezone (JST) date string
      "count": 7
    },
    "weekly": 23,
    "lifetime": 142
  }
}
```

**Daily reset logic**: On any read, compare `today.date` to current Tokyo date. If different, reset `today = { date: currentTokyoDate, count: 0 }`.

**Weekly tracking**: Increment on each discovery. Reset every Monday at midnight Tokyo time.

## API Changes

### New Endpoint: `GET /api/game/discovery-status`

Returns current discovery state for the user.

**Response:**
```javascript
{
  todayCount: 7,
  dailyLimit: 10,
  atLimit: false  // true if todayCount >= dailyLimit OR dailyLimit === 0
}
```

### Modified Endpoint: `POST /api/jpdb/review`

Add optional `isDiscovery` flag to request body.

**Request:**
```javascript
{
  vid: 12345,
  sid: 1,
  grade: 1,
  isDiscovery: true  // new optional field
}
```

**Behavior when `isDiscovery: true`:**
1. Check if user is at daily limit → if so, reject with `{ atLimit: true, todayCount: X }`
2. Submit review to JPDB
3. Increment `today.count`, `weekly`, `lifetime`
4. Return `{ success: true, todayCount: X, atLimit: false }` (or `atLimit: true` if this review hit the limit)

**Behavior when `isDiscovery: false` or omitted:**
- Normal review behavior, no counter increment

### Modified Endpoint: `POST /api/settings`

Accept `dailyWordLimit` field (validate 0-50 integer).

## File Changes

### Server-Side

| File | Change |
|------|--------|
| `server.js` | Add `dailyWordLimit: 10` to default settings |
| `src/word-tracking.js` | **New file** — functions to read/write/increment tracking data, Tokyo timezone handling |
| `src/routes/game/run.js` | Add `GET /api/game/discovery-status` endpoint |
| `src/routes/jpdb.js` | Handle `isDiscovery` flag, increment counters |
| `src/routes/settings.js` | Validate and persist `dailyWordLimit` |

### Client-Side

| File | Change |
|------|--------|
| `public/js/api.js` | Add `apiGetDiscoveryStatus()`, add `isDiscovery` param to review function |
| `public/js/ui/exploration.js` | Fetch status on room enter, show count narration, handle at-limit state, pass `isDiscovery: true` on swipes |
| `public/js/ui/modals.js` | Add daily word limit number input to settings panel |

### Data Files

| File | Description |
|------|-------------|
| `.jrpg-word-tracking.json` | **New file** — persists user word counts |

## Narration Text

| Situation | Japanese | English |
|-----------|----------|---------|
| Count display | 今日は {X} 個の新しい言葉を学びました！ | You've learned {X} new words today! |
| At limit | また明日来てね！ | Come back tomorrow to learn more! |

## Edge Cases

- **User changes limit mid-day**: New limit applies immediately. If new limit <= current count, they're at limit.
- **Limit set to 0**: All discovery rooms show "come back tomorrow" immediately (effectively disables feature).
- **Server restart**: Tracking persists in `.jrpg-word-tracking.json`.
- **First-time user**: Initialize with `{ today: { date: today, count: 0 }, weekly: 0, lifetime: 0 }`.

## Future Considerations (Not in Scope)

- Leaderboard UI for daily/weekly/lifetime stats
- Streak tracking (consecutive days with discoveries)
- Achievements based on discovery milestones
