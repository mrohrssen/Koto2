# User Authentication System Design

## Goal

Add basic user login/registration so 10-50 invited friends can each have their own save and API keys on the shared Railway-deployed server.

## Decisions

- **Access model**: Invite codes (you generate, friends use to register)
- **Auth mechanism**: JWT tokens (stateless, 7-day expiry)
- **Storage**: JSON files per user (no database)
- **API keys**: Stored server-side per user, encrypted at rest
- **Target UI**: Mobile-first UI (jrpg-wt-mobile-ui worktree, 430px max-width)

## Data Layout

### New Files

```
.jrpg-users.json              # User registry + invite codes
.jrpg-save-{userId}.json      # Per-user game saves
```

### User Record

```javascript
{
  id: "u_abc123",
  username: "takeshi",
  passwordHash: "...",           // bcrypt (10 rounds)
  apiKeys: {                     // AES-256-GCM encrypted at rest
    jpdbApiKey: "...",
    aiApiKey: "...",
    aiProvider: "openai",
    aiModel: "gpt-4o"
  },
  createdAt: "2026-01-24T..."
}
```

### Users File

```javascript
{
  users: [ ...userRecords ],
  inviteCodes: [
    { code: "NEO-TOKYO-abc123", usedBy: null, createdAt: "..." },
    { code: "NEO-TOKYO-def456", usedBy: "u_abc123", createdAt: "..." }
  ]
}
```

## API Endpoints

### Auth Routes (`/api/auth/`)

```
POST /api/auth/register
  Body: { username, password, inviteCode }
  Returns: { token, user: { id, username } }

POST /api/auth/login
  Body: { username, password }
  Returns: { token, user: { id, username } }

GET /api/auth/me
  Header: Authorization: Bearer <token>
  Returns: { id, username, apiKeys: { aiProvider, aiModel, hasJpdbKey, hasAiKey } }

PUT /api/auth/api-keys
  Header: Authorization: Bearer <token>
  Body: { jpdbApiKey, aiApiKey, aiProvider, aiModel }
  Returns: { success: true }

POST /api/auth/generate-invite
  Header: X-Admin-Secret: <ADMIN_SECRET>
  Returns: { code: "NEO-TOKYO-xyz789" }
```

### Auth Middleware

`requireAuth` middleware on all `/api/game/*` routes:
1. Extracts `Authorization: Bearer <token>` header
2. Verifies JWT signature
3. Attaches `req.user = { id, username }` to request
4. Returns 401 if invalid/expired

## Multi-User GameManager

### Manager Registry (`src/game/manager-registry.js`)

```javascript
const managers = new Map();  // userId -> GameManager

function getManager(userId) {
  if (managers.has(userId)) return managers.get(userId);

  const manager = new GameManager();
  const saveFile = `.jrpg-save-${userId}.json`;

  if (fs.existsSync(saveFile)) {
    const data = JSON.parse(fs.readFileSync(saveFile));
    manager.loadPlayer(data.player);
    manager.initMeta(data.meta);
  }

  managers.set(userId, manager);
  return manager;
}

function saveManager(userId) {
  const manager = managers.get(userId);
  const saveFile = `.jrpg-save-${userId}.json`;
  fs.writeFileSync(saveFile, JSON.stringify(manager.exportState()));
}
```

### Route Changes

Before:
```javascript
app.post('/api/game/attack', (req, res) => {
  const result = gameManager.attack(req.body);
  saveGameData();
});
```

After:
```javascript
app.post('/api/game/attack', requireAuth, (req, res) => {
  const manager = getManager(req.user.id);
  const result = manager.attack(req.body);
  saveManager(req.user.id);
});
```

### API Key Injection

Narration system reads keys from user profile instead of req.body:
```javascript
const user = loadUser(req.user.id);
const userKeys = decryptKeys(user.apiKeys);
```

## Frontend Changes (Mobile UI)

### New Module: `public/js/ui/auth.js`

Renders login/register forms in the action area before the game loads. Uses existing cyberpunk CSS variables and button styles.

### Boot Flow

```
1. Page loads
2. Check localStorage for authToken
3. If token exists -> GET /api/auth/me
   - Valid -> loadGameState() as normal
   - Invalid/expired -> show login screen
4. If no token -> show login screen
5. After login/register -> store token, load game
```

### api.js Changes

```javascript
// Attach JWT to every request (replaces API keys in body)
function apiCall(endpoint, method = 'POST', body = null) {
  return fetch(endpoint, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${localStorage.getItem('authToken')}`
    },
    body: body ? JSON.stringify(body) : null
  });
}
```

### Settings Modal Changes

API key inputs now PUT to `/api/auth/api-keys` instead of localStorage. On open, fetches current keys from `/api/auth/me` to pre-fill.

### Logout

Clear token from localStorage, re-render auth screen.

## Security

### Environment Variables (Railway)

```
JWT_SECRET=<random-64-char-string>
ENCRYPTION_KEY=<random-32-byte-hex>
ADMIN_SECRET=<random-string>
```

### Protections

- bcrypt (10 rounds) for password hashing
- AES-256-GCM (Node crypto) for API key encryption at rest
- Rate limit: 5 login attempts per minute per IP (in-memory counter)
- Single-use invite codes with NEO-TOKYO- prefix

### Not Building (YAGNI)

- Email verification
- Password reset flow
- CSRF tokens (JWT in header is immune)
- Refresh tokens (7-day expiry, re-login is fine)
- Account lockout

## New Dependencies

- `bcrypt` - Password hashing
- `jsonwebtoken` - JWT sign/verify

## Files to Create

```
src/auth/middleware.js        # requireAuth, JWT verify
src/auth/routes.js            # /api/auth/* endpoints
src/auth/crypto.js            # Password hash, API key encrypt/decrypt
src/auth/users.js             # User CRUD, invite code management
src/game/manager-registry.js  # Per-user GameManager instances
public/js/ui/auth.js          # Login/register UI
```

## Files to Modify

```
server.js                     # Mount auth routes, requireAuth on game routes
public/js/api.js              # JWT header instead of API keys in body
public/js/settings.js         # API keys save to server
public/js/ui/modals.js        # Settings modal fetches/saves keys server-side
public/game.js                # Auth gate before game init
public/game.html              # Login/register markup (minimal)
public/game.css               # Auth screen styling
```
