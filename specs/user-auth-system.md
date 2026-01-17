# User Authentication System Specification

> **Status**: Draft
> **Created**: 2026-01-17
> **Branch**: `claude/user-auth-system-O1Io8`

## Overview

This specification describes a user registration and login system for NEO TOKYO: System Liberation. The system will enable per-user storage of settings, API keys, game saves, and meta-progression data on the server side.

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth Method | Username + Password | Self-contained, no third-party dependencies |
| API Key Storage | Server-side encrypted | Secure, syncs across devices |
| Database | SQLite | File-based, zero config, works with Railway |
| Guest Mode | Disabled | Simplifies data model, all progress always saved |

---

## Table of Contents

1. [Database Schema](#1-database-schema)
2. [File Structure](#2-file-structure)
3. [Dependencies](#3-dependencies)
4. [Implementation Phases](#4-implementation-phases)
   - [Phase 1: Database Setup](#phase-1-database-setup)
   - [Phase 2: Authentication Backend](#phase-2-authentication-backend)
   - [Phase 3: Per-User Data Layer](#phase-3-per-user-data-layer)
   - [Phase 4: Frontend Auth UI](#phase-4-frontend-auth-ui)
   - [Phase 5: Migration & Cleanup](#phase-5-migration--cleanup)
5. [API Reference](#5-api-reference)
6. [Security Considerations](#6-security-considerations)
7. [Testing Plan](#7-testing-plan)

---

## 1. Database Schema

### 1.1 Schema File: `src/db/schema.sql`

```sql
-- ============================================================
-- NEO TOKYO: System Liberation - User Authentication Schema
-- ============================================================

-- Enable foreign keys (SQLite requires this per-connection)
PRAGMA foreign_keys = ON;

-- ============================================================
-- USERS TABLE
-- ============================================================
-- Core user account information
-- Password is hashed with bcrypt (cost factor 12)

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login_at DATETIME,

    -- Constraints
    CHECK (length(username) >= 3 AND length(username) <= 32),
    CHECK (username GLOB '[a-zA-Z0-9_]*')  -- Alphanumeric + underscore only
);

-- Index for fast username lookups during login
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ============================================================
-- USER SETTINGS TABLE
-- ============================================================
-- Per-user configuration including encrypted API keys
-- All API keys are encrypted using AES-256-GCM with a server secret

CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- API Keys (encrypted with AES-256-GCM)
    -- Format: "iv:authTag:ciphertext" (all base64 encoded)
    jpdb_api_key_encrypted TEXT,
    ai_api_key_encrypted TEXT,

    -- AI Provider Configuration
    ai_provider TEXT DEFAULT 'anthropic' CHECK (ai_provider IN ('openai', 'anthropic', 'google', 'openrouter')),
    ai_model TEXT,  -- e.g., 'gpt-4', 'claude-3-opus', etc.

    -- TTS Configuration (VOICEVOX)
    tts_enabled INTEGER DEFAULT 1 CHECK (tts_enabled IN (0, 1)),
    tts_speaker_id INTEGER DEFAULT 3,
    tts_speed REAL DEFAULT 1.0 CHECK (tts_speed >= 0.5 AND tts_speed <= 2.0),
    tts_volume REAL DEFAULT 1.0 CHECK (tts_volume >= 0.0 AND tts_volume <= 1.0),

    -- JPDB Configuration
    jpdb_deck_id TEXT,
    jlpt_level INTEGER DEFAULT 5 CHECK (jlpt_level >= 1 AND jlpt_level <= 5),
    review_type TEXT DEFAULT 'jpdb' CHECK (review_type IN ('jpdb', 'local', 'none')),

    -- Timestamps
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Trigger to auto-update updated_at timestamp
CREATE TRIGGER IF NOT EXISTS user_settings_updated_at
AFTER UPDATE ON user_settings
BEGIN
    UPDATE user_settings SET updated_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
END;

-- ============================================================
-- USER SAVES TABLE
-- ============================================================
-- Per-user game save data (player state and meta-progression)
-- JSON columns store serialized game state

CREATE TABLE IF NOT EXISTS user_saves (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    -- Game State (JSON serialized)
    player_json TEXT,  -- Player object from state.js createNewPlayer()
    meta_json TEXT,    -- Meta-progression from state.js createMetaProgression()

    -- Run State (optional - for resuming in-progress runs)
    run_json TEXT,     -- Current run state if mid-run

    -- Timestamps
    saved_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Statistics
    total_playtime_seconds INTEGER DEFAULT 0
);

-- Trigger to auto-update saved_at timestamp
CREATE TRIGGER IF NOT EXISTS user_saves_saved_at
AFTER UPDATE ON user_saves
BEGIN
    UPDATE user_saves SET saved_at = CURRENT_TIMESTAMP WHERE user_id = NEW.user_id;
END;

-- ============================================================
-- SESSIONS TABLE
-- ============================================================
-- Used by connect-sqlite3 for express-session storage
-- This table is auto-managed by the session store

CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expire DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expire ON sessions(expire);
```

### 1.2 Schema Notes

- **Username validation**: 3-32 chars, alphanumeric + underscore only, case-insensitive uniqueness
- **Password storage**: bcrypt hash with cost factor 12 (~250ms hash time)
- **API key encryption**: AES-256-GCM with server-side secret key
- **Cascading deletes**: Deleting a user removes all their settings and saves
- **Session expiry**: Default 7 days, configurable via environment variable

---

## 2. File Structure

### 2.1 New Files to Create

```
src/
├── db/
│   ├── index.js          # Database connection, initialization, query helpers
│   └── schema.sql        # SQL schema (copied above)
├── auth/
│   ├── index.js          # Auth logic: register, login, verify password
│   ├── middleware.js     # Express middleware: session setup, requireAuth
│   └── crypto.js         # API key encryption/decryption utilities
```

### 2.2 Files to Modify

```
package.json              # Add dependencies
server.js                 # Session config, auth routes, protect endpoints
src/game/loop.js          # Add userId parameter, database persistence
src/game/state.js         # Minor: ensure serialization is clean JSON
public/game.html          # Add login/register modal HTML
public/game.js            # Auth state management, remove localStorage keys
public/game.css           # Modal styling
```

---

## 3. Dependencies

### 3.1 New npm Packages

```json
{
  "dependencies": {
    "better-sqlite3": "^9.4.3",
    "bcrypt": "^5.1.1",
    "express-session": "^1.18.0",
    "connect-sqlite3": "^0.9.15"
  }
}
```

### 3.2 Dependency Details

| Package | Purpose | Notes |
|---------|---------|-------|
| `better-sqlite3` | SQLite driver | Synchronous API, fast, no native compilation issues |
| `bcrypt` | Password hashing | Industry standard, adaptive cost factor |
| `express-session` | Session management | Cookie-based sessions with server-side storage |
| `connect-sqlite3` | Session store | Stores sessions in SQLite instead of memory |

### 3.3 Installation Command

```bash
npm install better-sqlite3 bcrypt express-session connect-sqlite3
```

---

## 4. Implementation Phases

---

### Phase 1: Database Setup

#### Step 1.1: Create `src/db/index.js`

```javascript
/**
 * @file src/db/index.js
 * @description SQLite database connection and initialization
 *
 * PURPOSE:
 * - Initialize SQLite database connection
 * - Run schema migrations on startup
 * - Provide query helper functions
 *
 * EXPORTS:
 * - db: The better-sqlite3 database instance
 * - initializeDatabase(): Run migrations, return db instance
 * - getUser(userId): Get user by ID
 * - getUserByUsername(username): Get user by username
 * - createUser(username, passwordHash): Insert new user
 * - getUserSettings(userId): Get user settings
 * - updateUserSettings(userId, settings): Update settings
 * - getUserSave(userId): Get user's game save
 * - updateUserSave(userId, player, meta, run): Update game save
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database file path - stored in project root
const DB_PATH = process.env.DB_PATH || '.jrpg-database.sqlite';

let db = null;

/**
 * Initialize the database connection and run migrations
 * @returns {Database} The database instance
 */
export function initializeDatabase() {
    if (db) return db;

    console.log(`[DB] Initializing database at ${DB_PATH}`);

    // Create database connection
    db = new Database(DB_PATH);

    // Enable foreign keys and WAL mode for better performance
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');

    // Run schema migrations
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');

    // Execute schema (CREATE IF NOT EXISTS is idempotent)
    db.exec(schema);

    console.log('[DB] Database initialized successfully');

    return db;
}

/**
 * Get database instance (must call initializeDatabase first)
 * @returns {Database}
 */
export function getDb() {
    if (!db) {
        throw new Error('Database not initialized. Call initializeDatabase() first.');
    }
    return db;
}

// ============================================================
// USER QUERIES
// ============================================================

/**
 * Get user by ID
 * @param {number} userId
 * @returns {Object|undefined} User object or undefined
 */
export function getUser(userId) {
    const stmt = getDb().prepare('SELECT id, username, created_at, last_login_at FROM users WHERE id = ?');
    return stmt.get(userId);
}

/**
 * Get user by username (case-insensitive)
 * @param {string} username
 * @returns {Object|undefined} User object with password_hash or undefined
 */
export function getUserByUsername(username) {
    const stmt = getDb().prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username);
}

/**
 * Create a new user
 * @param {string} username
 * @param {string} passwordHash - bcrypt hash
 * @returns {Object} { id, username, created_at }
 */
export function createUser(username, passwordHash) {
    const stmt = getDb().prepare(`
        INSERT INTO users (username, password_hash)
        VALUES (?, ?)
    `);

    const result = stmt.run(username, passwordHash);

    // Also create empty settings and save rows
    const settingsStmt = getDb().prepare('INSERT INTO user_settings (user_id) VALUES (?)');
    settingsStmt.run(result.lastInsertRowid);

    const saveStmt = getDb().prepare('INSERT INTO user_saves (user_id) VALUES (?)');
    saveStmt.run(result.lastInsertRowid);

    return {
        id: result.lastInsertRowid,
        username,
        created_at: new Date().toISOString()
    };
}

/**
 * Update user's last login timestamp
 * @param {number} userId
 */
export function updateLastLogin(userId) {
    const stmt = getDb().prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?');
    stmt.run(userId);
}

// ============================================================
// SETTINGS QUERIES
// ============================================================

/**
 * Get user settings
 * @param {number} userId
 * @returns {Object|undefined} Settings object
 */
export function getUserSettings(userId) {
    const stmt = getDb().prepare('SELECT * FROM user_settings WHERE user_id = ?');
    return stmt.get(userId);
}

/**
 * Update user settings (partial update)
 * @param {number} userId
 * @param {Object} settings - Key-value pairs to update
 */
export function updateUserSettings(userId, settings) {
    const allowedKeys = [
        'jpdb_api_key_encrypted', 'ai_api_key_encrypted',
        'ai_provider', 'ai_model',
        'tts_enabled', 'tts_speaker_id', 'tts_speed', 'tts_volume',
        'jpdb_deck_id', 'jlpt_level', 'review_type'
    ];

    // Filter to allowed keys only
    const updates = Object.entries(settings)
        .filter(([key]) => allowedKeys.includes(key));

    if (updates.length === 0) return;

    const setClause = updates.map(([key]) => `${key} = ?`).join(', ');
    const values = updates.map(([, value]) => value);

    const stmt = getDb().prepare(`UPDATE user_settings SET ${setClause} WHERE user_id = ?`);
    stmt.run(...values, userId);
}

// ============================================================
// SAVE QUERIES
// ============================================================

/**
 * Get user's game save
 * @param {number} userId
 * @returns {Object} { player, meta, run } parsed from JSON
 */
export function getUserSave(userId) {
    const stmt = getDb().prepare('SELECT player_json, meta_json, run_json, saved_at FROM user_saves WHERE user_id = ?');
    const row = stmt.get(userId);

    if (!row) return null;

    return {
        player: row.player_json ? JSON.parse(row.player_json) : null,
        meta: row.meta_json ? JSON.parse(row.meta_json) : null,
        run: row.run_json ? JSON.parse(row.run_json) : null,
        savedAt: row.saved_at
    };
}

/**
 * Update user's game save
 * @param {number} userId
 * @param {Object|null} player - Player state object
 * @param {Object|null} meta - Meta-progression object
 * @param {Object|null} run - Current run state (optional)
 */
export function updateUserSave(userId, player, meta, run = null) {
    const stmt = getDb().prepare(`
        UPDATE user_saves
        SET player_json = ?, meta_json = ?, run_json = ?
        WHERE user_id = ?
    `);

    stmt.run(
        player ? JSON.stringify(player) : null,
        meta ? JSON.stringify(meta) : null,
        run ? JSON.stringify(run) : null,
        userId
    );
}

/**
 * Close database connection (for graceful shutdown)
 */
export function closeDatabase() {
    if (db) {
        db.close();
        db = null;
        console.log('[DB] Database connection closed');
    }
}

export { db };
```

#### Step 1.2: Create `src/db/schema.sql`

Copy the schema from Section 1.1 above.

#### Step 1.3: Update `server.js` - Database Initialization

Add to the top of `server.js` after other imports:

```javascript
import { initializeDatabase, closeDatabase } from './src/db/index.js';

// Initialize database before starting server
initializeDatabase();

// Graceful shutdown
process.on('SIGTERM', () => {
    closeDatabase();
    process.exit(0);
});
```

---

### Phase 2: Authentication Backend

#### Step 2.1: Create `src/auth/crypto.js`

```javascript
/**
 * @file src/auth/crypto.js
 * @description Encryption utilities for sensitive data (API keys)
 *
 * PURPOSE:
 * - Encrypt API keys before storing in database
 * - Decrypt API keys when needed for API calls
 * - Use AES-256-GCM for authenticated encryption
 *
 * SECURITY NOTES:
 * - Encryption key derived from AUTH_SECRET environment variable
 * - Each encryption uses a random IV (stored with ciphertext)
 * - GCM mode provides authentication (tamper detection)
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// Derive encryption key from AUTH_SECRET
// Using scrypt for key derivation adds protection if secret is weak
const AUTH_SECRET = process.env.AUTH_SECRET || 'development-secret-change-in-production';
const ENCRYPTION_KEY = scryptSync(AUTH_SECRET, 'neo-tokyo-salt', 32); // 256-bit key

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

/**
 * Encrypt a plaintext string
 * @param {string} plaintext - The text to encrypt
 * @returns {string} Format: "iv:authTag:ciphertext" (all base64)
 */
export function encrypt(plaintext) {
    if (!plaintext) return null;

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Combine IV, auth tag, and ciphertext
    return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext}`;
}

/**
 * Decrypt an encrypted string
 * @param {string} encrypted - Format: "iv:authTag:ciphertext"
 * @returns {string|null} Decrypted plaintext or null if invalid
 */
export function decrypt(encrypted) {
    if (!encrypted) return null;

    try {
        const [ivBase64, authTagBase64, ciphertext] = encrypted.split(':');

        if (!ivBase64 || !authTagBase64 || !ciphertext) {
            throw new Error('Invalid encrypted format');
        }

        const iv = Buffer.from(ivBase64, 'base64');
        const authTag = Buffer.from(authTagBase64, 'base64');

        const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        decipher.setAuthTag(authTag);

        let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
        plaintext += decipher.final('utf8');

        return plaintext;
    } catch (error) {
        console.error('[Crypto] Decryption failed:', error.message);
        return null;
    }
}
```

#### Step 2.2: Create `src/auth/index.js`

```javascript
/**
 * @file src/auth/index.js
 * @description Core authentication logic
 *
 * PURPOSE:
 * - User registration with password hashing
 * - User login with password verification
 * - Password strength validation
 *
 * EXPORTS:
 * - registerUser(username, password): Create new user account
 * - loginUser(username, password): Verify credentials, return user
 * - validatePassword(password): Check password strength
 * - validateUsername(username): Check username format
 */

import bcrypt from 'bcrypt';
import { createUser, getUserByUsername, updateLastLogin } from '../db/index.js';

const BCRYPT_ROUNDS = 12; // ~250ms hash time, good security/performance balance

// ============================================================
// VALIDATION
// ============================================================

/**
 * Validate username format
 * @param {string} username
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateUsername(username) {
    if (!username || typeof username !== 'string') {
        return { valid: false, error: 'Username is required' };
    }

    const trimmed = username.trim();

    if (trimmed.length < 3) {
        return { valid: false, error: 'Username must be at least 3 characters' };
    }

    if (trimmed.length > 32) {
        return { valid: false, error: 'Username must be 32 characters or less' };
    }

    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
        return { valid: false, error: 'Username can only contain letters, numbers, and underscores' };
    }

    // Reserved usernames
    const reserved = ['admin', 'system', 'root', 'moderator', 'mod', 'support'];
    if (reserved.includes(trimmed.toLowerCase())) {
        return { valid: false, error: 'This username is reserved' };
    }

    return { valid: true };
}

/**
 * Validate password strength
 * @param {string} password
 * @returns {{ valid: boolean, error?: string }}
 */
export function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required' };
    }

    if (password.length < 8) {
        return { valid: false, error: 'Password must be at least 8 characters' };
    }

    if (password.length > 128) {
        return { valid: false, error: 'Password must be 128 characters or less' };
    }

    // Require at least one letter and one number
    if (!/[a-zA-Z]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one letter' };
    }

    if (!/[0-9]/.test(password)) {
        return { valid: false, error: 'Password must contain at least one number' };
    }

    return { valid: true };
}

// ============================================================
// REGISTRATION
// ============================================================

/**
 * Register a new user
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ success: boolean, user?: Object, error?: string }>}
 */
export async function registerUser(username, password) {
    // Validate username
    const usernameValidation = validateUsername(username);
    if (!usernameValidation.valid) {
        return { success: false, error: usernameValidation.error };
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
        return { success: false, error: passwordValidation.error };
    }

    const normalizedUsername = username.trim();

    // Check if username exists
    const existing = getUserByUsername(normalizedUsername);
    if (existing) {
        return { success: false, error: 'Username already taken' };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create user
    try {
        const user = createUser(normalizedUsername, passwordHash);
        return { success: true, user };
    } catch (error) {
        console.error('[Auth] Registration error:', error);
        return { success: false, error: 'Failed to create account' };
    }
}

// ============================================================
// LOGIN
// ============================================================

/**
 * Authenticate a user
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ success: boolean, user?: Object, error?: string }>}
 */
export async function loginUser(username, password) {
    if (!username || !password) {
        return { success: false, error: 'Username and password are required' };
    }

    // Find user
    const user = getUserByUsername(username.trim());
    if (!user) {
        // Use same error to prevent username enumeration
        return { success: false, error: 'Invalid username or password' };
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
        return { success: false, error: 'Invalid username or password' };
    }

    // Update last login
    updateLastLogin(user.id);

    // Return user without password hash
    return {
        success: true,
        user: {
            id: user.id,
            username: user.username,
            created_at: user.created_at
        }
    };
}
```

#### Step 2.3: Create `src/auth/middleware.js`

```javascript
/**
 * @file src/auth/middleware.js
 * @description Express middleware for authentication
 *
 * PURPOSE:
 * - Configure express-session with SQLite store
 * - Provide requireAuth middleware for protected routes
 * - Attach user info to request object
 *
 * EXPORTS:
 * - configureSession(app): Set up session middleware
 * - requireAuth: Middleware to require authentication
 * - optionalAuth: Middleware that attaches user if logged in
 */

import session from 'express-session';
import SQLiteStore from 'connect-sqlite3';

const SQLiteStoreSession = SQLiteStore(session);

/**
 * Configure session middleware for Express app
 * @param {Express} app
 */
export function configureSession(app) {
    const isProduction = process.env.NODE_ENV === 'production';

    // Session configuration
    const sessionConfig = {
        store: new SQLiteStoreSession({
            db: 'sessions.sqlite',  // Separate file for sessions
            dir: '.',               // Current directory
            table: 'sessions'
        }),
        secret: process.env.SESSION_SECRET || 'neo-tokyo-dev-secret-change-me',
        name: 'neo_tokyo_sid',      // Custom cookie name
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: isProduction,   // HTTPS only in production
            httpOnly: true,         // Not accessible via JavaScript
            maxAge: 7 * 24 * 60 * 60 * 1000,  // 7 days
            sameSite: 'lax'         // CSRF protection
        }
    };

    // Trust first proxy in production (for Railway, etc.)
    if (isProduction) {
        app.set('trust proxy', 1);
    }

    app.use(session(sessionConfig));

    console.log('[Auth] Session middleware configured');
}

/**
 * Middleware: Require authentication
 * Returns 401 if not logged in
 */
export function requireAuth(req, res, next) {
    if (!req.session || !req.session.userId) {
        return res.status(401).json({
            error: 'Authentication required',
            code: 'AUTH_REQUIRED'
        });
    }

    // Attach userId to request for convenience
    req.userId = req.session.userId;
    next();
}

/**
 * Middleware: Optional authentication
 * Attaches userId if logged in, continues regardless
 */
export function optionalAuth(req, res, next) {
    if (req.session && req.session.userId) {
        req.userId = req.session.userId;
    }
    next();
}

/**
 * Middleware: Require NOT authenticated
 * For login/register pages that shouldn't be accessible when logged in
 */
export function requireGuest(req, res, next) {
    if (req.session && req.session.userId) {
        return res.status(400).json({
            error: 'Already logged in',
            code: 'ALREADY_AUTHENTICATED'
        });
    }
    next();
}
```

#### Step 2.4: Add Auth Routes to `server.js`

Add after session configuration:

```javascript
import { configureSession, requireAuth, requireGuest } from './src/auth/middleware.js';
import { registerUser, loginUser } from './src/auth/index.js';
import { getUser, getUserSettings, updateUserSettings } from './src/db/index.js';
import { encrypt, decrypt } from './src/auth/crypto.js';

// Configure sessions (before routes)
configureSession(app);

// ============================================================
// AUTH ROUTES
// ============================================================

/**
 * POST /api/auth/register
 * Create a new user account
 * Body: { username: string, password: string }
 */
app.post('/api/auth/register', requireGuest, async (req, res) => {
    try {
        const { username, password } = req.body;

        const result = await registerUser(username, password);

        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        // Auto-login after registration
        req.session.userId = result.user.id;
        req.session.username = result.user.username;

        res.json({
            success: true,
            user: result.user
        });
    } catch (error) {
        console.error('[Auth] Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * POST /api/auth/login
 * Authenticate and create session
 * Body: { username: string, password: string }
 */
app.post('/api/auth/login', requireGuest, async (req, res) => {
    try {
        const { username, password } = req.body;

        const result = await loginUser(username, password);

        if (!result.success) {
            return res.status(401).json({ error: result.error });
        }

        // Create session
        req.session.userId = result.user.id;
        req.session.username = result.user.username;

        res.json({
            success: true,
            user: result.user
        });
    } catch (error) {
        console.error('[Auth] Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /api/auth/logout
 * Destroy session
 */
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('[Auth] Logout error:', err);
            return res.status(500).json({ error: 'Logout failed' });
        }
        res.clearCookie('neo_tokyo_sid');
        res.json({ success: true });
    });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
app.get('/api/auth/me', (req, res) => {
    if (!req.session || !req.session.userId) {
        return res.json({ authenticated: false });
    }

    const user = getUser(req.session.userId);
    if (!user) {
        // Session exists but user doesn't - clear session
        req.session.destroy();
        return res.json({ authenticated: false });
    }

    res.json({
        authenticated: true,
        user: {
            id: user.id,
            username: user.username,
            created_at: user.created_at
        }
    });
});

/**
 * GET /api/auth/settings
 * Get current user's settings (with decrypted API keys)
 */
app.get('/api/auth/settings', requireAuth, (req, res) => {
    try {
        const settings = getUserSettings(req.userId);

        if (!settings) {
            return res.status(404).json({ error: 'Settings not found' });
        }

        // Decrypt API keys for response
        res.json({
            jpdbApiKey: decrypt(settings.jpdb_api_key_encrypted) || '',
            aiApiKey: decrypt(settings.ai_api_key_encrypted) || '',
            aiProvider: settings.ai_provider,
            aiModel: settings.ai_model,
            ttsEnabled: Boolean(settings.tts_enabled),
            ttsSpeakerId: settings.tts_speaker_id,
            ttsSpeed: settings.tts_speed,
            ttsVolume: settings.tts_volume,
            jpdbDeckId: settings.jpdb_deck_id,
            jlptLevel: settings.jlpt_level,
            reviewType: settings.review_type
        });
    } catch (error) {
        console.error('[Auth] Get settings error:', error);
        res.status(500).json({ error: 'Failed to get settings' });
    }
});

/**
 * PUT /api/auth/settings
 * Update current user's settings
 */
app.put('/api/auth/settings', requireAuth, (req, res) => {
    try {
        const updates = {};

        // Map camelCase request body to snake_case database columns
        const mapping = {
            jpdbApiKey: 'jpdb_api_key_encrypted',
            aiApiKey: 'ai_api_key_encrypted',
            aiProvider: 'ai_provider',
            aiModel: 'ai_model',
            ttsEnabled: 'tts_enabled',
            ttsSpeakerId: 'tts_speaker_id',
            ttsSpeed: 'tts_speed',
            ttsVolume: 'tts_volume',
            jpdbDeckId: 'jpdb_deck_id',
            jlptLevel: 'jlpt_level',
            reviewType: 'review_type'
        };

        for (const [camelKey, snakeKey] of Object.entries(mapping)) {
            if (req.body[camelKey] !== undefined) {
                let value = req.body[camelKey];

                // Encrypt API keys
                if (camelKey === 'jpdbApiKey' || camelKey === 'aiApiKey') {
                    value = value ? encrypt(value) : null;
                }

                // Convert boolean to integer for SQLite
                if (camelKey === 'ttsEnabled') {
                    value = value ? 1 : 0;
                }

                updates[snakeKey] = value;
            }
        }

        updateUserSettings(req.userId, updates);

        res.json({ success: true });
    } catch (error) {
        console.error('[Auth] Update settings error:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});
```

---

### Phase 3: Per-User Data Layer

#### Step 3.1: Update `src/game/loop.js` - Add User Context

Modify the `GameManager` class to support user-specific data:

```javascript
// Add to GameManager class

/**
 * Set the current user context
 * @param {number} userId
 */
setUser(userId) {
    this.userId = userId;
    this.loadUserData();
}

/**
 * Load user's game data from database
 */
loadUserData() {
    if (!this.userId) return;

    const save = getUserSave(this.userId);

    if (save) {
        if (save.player) {
            this.player = save.player;
        }
        if (save.meta) {
            this.meta = save.meta;
        }
        if (save.run) {
            this.run = save.run;
        }
    }
}

/**
 * Save user's game data to database
 */
saveUserData() {
    if (!this.userId) return;

    updateUserSave(
        this.userId,
        this.player,
        this.meta,
        this.run
    );
}
```

#### Step 3.2: Update `server.js` - Protect Game Endpoints

Replace the current save/load logic with per-user database operations:

```javascript
// Replace saveGameData() function
function saveGameData() {
    // This is now handled per-request based on userId
    // See gameManager.saveUserData()
}

// Add middleware to inject user's GameManager state
app.use('/api/game', requireAuth, (req, res, next) => {
    // Load user's data into GameManager for this request
    gameManager.setUser(req.userId);
    next();
});

// After each game mutation, save user data
// Add this after every endpoint that modifies game state:
gameManager.saveUserData();
```

#### Step 3.3: Update API Endpoints

For each `/api/game/*` endpoint that modifies state, ensure it:
1. Uses `req.userId` for user context
2. Calls `gameManager.saveUserData()` after mutations
3. Gets API keys from user settings instead of request body

Example modification for attack endpoint:

```javascript
// BEFORE
app.post('/api/game/attack', async (req, res) => {
    const { jpdbApiKey, aiApiKey } = req.body;
    // ...
});

// AFTER
app.post('/api/game/attack', requireAuth, async (req, res) => {
    // Get API keys from user settings
    const settings = getUserSettings(req.userId);
    const jpdbApiKey = decrypt(settings.jpdb_api_key_encrypted);
    const aiApiKey = decrypt(settings.ai_api_key_encrypted);

    // ... rest of endpoint logic

    // Save after mutation
    gameManager.saveUserData();
});
```

---

### Phase 4: Frontend Auth UI

#### Step 4.1: Add Login Modal to `game.html`

Insert before closing `</body>` tag:

```html
<!-- Auth Modal -->
<div id="auth-modal" class="modal hidden">
    <div class="modal-content auth-modal-content">
        <div class="auth-tabs">
            <button class="auth-tab active" data-tab="login">Login</button>
            <button class="auth-tab" data-tab="register">Register</button>
        </div>

        <!-- Login Form -->
        <form id="login-form" class="auth-form">
            <h2>Welcome Back, Operator</h2>
            <p class="auth-subtitle">Enter credentials to access the network</p>

            <div class="form-group">
                <label for="login-username">Username</label>
                <input type="text" id="login-username" name="username"
                       autocomplete="username" required
                       minlength="3" maxlength="32"
                       pattern="[a-zA-Z0-9_]+">
            </div>

            <div class="form-group">
                <label for="login-password">Password</label>
                <input type="password" id="login-password" name="password"
                       autocomplete="current-password" required
                       minlength="8">
            </div>

            <div id="login-error" class="auth-error hidden"></div>

            <button type="submit" class="btn btn-primary btn-block">
                <span class="btn-text">Access Network</span>
                <span class="btn-loading hidden">Authenticating...</span>
            </button>
        </form>

        <!-- Register Form -->
        <form id="register-form" class="auth-form hidden">
            <h2>New Operator Registration</h2>
            <p class="auth-subtitle">Create your identity in the network</p>

            <div class="form-group">
                <label for="register-username">Username</label>
                <input type="text" id="register-username" name="username"
                       autocomplete="username" required
                       minlength="3" maxlength="32"
                       pattern="[a-zA-Z0-9_]+">
                <span class="form-hint">3-32 characters, letters, numbers, underscore</span>
            </div>

            <div class="form-group">
                <label for="register-password">Password</label>
                <input type="password" id="register-password" name="password"
                       autocomplete="new-password" required
                       minlength="8" maxlength="128">
                <span class="form-hint">At least 8 characters with letters and numbers</span>
            </div>

            <div class="form-group">
                <label for="register-confirm">Confirm Password</label>
                <input type="password" id="register-confirm" name="confirm"
                       autocomplete="new-password" required>
            </div>

            <div id="register-error" class="auth-error hidden"></div>

            <button type="submit" class="btn btn-primary btn-block">
                <span class="btn-text">Create Identity</span>
                <span class="btn-loading hidden">Processing...</span>
            </button>
        </form>
    </div>
</div>
```

#### Step 4.2: Add Auth Styles to `game.css`

```css
/* ============================================================
   AUTH MODAL STYLES
   ============================================================ */

.auth-modal-content {
    width: 100%;
    max-width: 400px;
    background: var(--bg-dark);
    border: 1px solid var(--primary);
    border-radius: 8px;
    padding: 2rem;
    box-shadow: 0 0 30px rgba(0, 255, 255, 0.2);
}

.auth-tabs {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    border-bottom: 1px solid var(--border);
    padding-bottom: 1rem;
}

.auth-tab {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1rem;
    padding: 0.5rem 1rem;
    cursor: pointer;
    transition: color 0.2s, border-color 0.2s;
    border-bottom: 2px solid transparent;
    margin-bottom: -1rem;
    padding-bottom: calc(1rem + 2px);
}

.auth-tab:hover {
    color: var(--text);
}

.auth-tab.active {
    color: var(--primary);
    border-bottom-color: var(--primary);
}

.auth-form h2 {
    margin: 0 0 0.5rem 0;
    color: var(--primary);
    font-size: 1.5rem;
}

.auth-subtitle {
    color: var(--text-muted);
    margin: 0 0 1.5rem 0;
    font-size: 0.9rem;
}

.form-group {
    margin-bottom: 1.25rem;
}

.form-group label {
    display: block;
    margin-bottom: 0.5rem;
    color: var(--text);
    font-size: 0.9rem;
}

.form-group input {
    width: 100%;
    padding: 0.75rem;
    background: var(--bg-darker);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    font-size: 1rem;
    transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input:focus {
    outline: none;
    border-color: var(--primary);
    box-shadow: 0 0 0 2px rgba(0, 255, 255, 0.1);
}

.form-group input:invalid:not(:placeholder-shown) {
    border-color: var(--danger);
}

.form-hint {
    display: block;
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-top: 0.25rem;
}

.auth-error {
    background: rgba(255, 0, 0, 0.1);
    border: 1px solid var(--danger);
    border-radius: 4px;
    padding: 0.75rem;
    margin-bottom: 1rem;
    color: var(--danger);
    font-size: 0.9rem;
}

.btn-block {
    width: 100%;
}

.btn-primary {
    background: var(--primary);
    color: var(--bg-dark);
    border: none;
    padding: 0.875rem 1.5rem;
    border-radius: 4px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s;
}

.btn-primary:hover {
    background: var(--primary-light);
}

.btn-primary:active {
    transform: scale(0.98);
}

.btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.btn-loading {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
}

.btn-loading::before {
    content: '';
    width: 1rem;
    height: 1rem;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}
```

#### Step 4.3: Add Auth JavaScript to `game.js`

```javascript
// ============================================================
// AUTH STATE MANAGEMENT
// ============================================================

const authState = {
    authenticated: false,
    user: null,
    settings: null
};

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>}
 */
async function checkAuth() {
    try {
        const response = await fetch('/api/auth/me');
        const data = await response.json();

        authState.authenticated = data.authenticated;
        authState.user = data.user || null;

        if (authState.authenticated) {
            await loadUserSettings();
        }

        return authState.authenticated;
    } catch (error) {
        console.error('[Auth] Check failed:', error);
        return false;
    }
}

/**
 * Load user settings from server
 */
async function loadUserSettings() {
    try {
        const response = await fetch('/api/auth/settings');
        if (response.ok) {
            authState.settings = await response.json();
        }
    } catch (error) {
        console.error('[Auth] Failed to load settings:', error);
    }
}

/**
 * Show auth modal
 */
function showAuthModal() {
    document.getElementById('auth-modal').classList.remove('hidden');
}

/**
 * Hide auth modal
 */
function hideAuthModal() {
    document.getElementById('auth-modal').classList.add('hidden');
}

/**
 * Handle login form submission
 */
async function handleLogin(event) {
    event.preventDefault();

    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const errorDiv = document.getElementById('login-error');

    const username = form.username.value.trim();
    const password = form.password.value;

    // Disable button, show loading
    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-text').classList.add('hidden');
    submitBtn.querySelector('.btn-loading').classList.remove('hidden');
    errorDiv.classList.add('hidden');

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        authState.authenticated = true;
        authState.user = data.user;

        hideAuthModal();
        await loadUserSettings();
        initializeGame();

    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').classList.remove('hidden');
        submitBtn.querySelector('.btn-loading').classList.add('hidden');
    }
}

/**
 * Handle register form submission
 */
async function handleRegister(event) {
    event.preventDefault();

    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const errorDiv = document.getElementById('register-error');

    const username = form.username.value.trim();
    const password = form.password.value;
    const confirm = form.confirm.value;

    // Client-side validation
    if (password !== confirm) {
        errorDiv.textContent = 'Passwords do not match';
        errorDiv.classList.remove('hidden');
        return;
    }

    // Disable button, show loading
    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-text').classList.add('hidden');
    submitBtn.querySelector('.btn-loading').classList.remove('hidden');
    errorDiv.classList.add('hidden');

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        authState.authenticated = true;
        authState.user = data.user;

        hideAuthModal();
        initializeGame();

    } catch (error) {
        errorDiv.textContent = error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        submitBtn.disabled = false;
        submitBtn.querySelector('.btn-text').classList.remove('hidden');
        submitBtn.querySelector('.btn-loading').classList.add('hidden');
    }
}

/**
 * Handle logout
 */
async function handleLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
        console.error('[Auth] Logout error:', error);
    }

    authState.authenticated = false;
    authState.user = null;
    authState.settings = null;

    showAuthModal();
}

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize auth UI event listeners
 */
function initAuthUI() {
    // Tab switching
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;

            // Update tab states
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show/hide forms
            document.getElementById('login-form').classList.toggle('hidden', tabName !== 'login');
            document.getElementById('register-form').classList.toggle('hidden', tabName !== 'register');
        });
    });

    // Form submissions
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    document.getElementById('register-form').addEventListener('submit', handleRegister);
}

/**
 * Main initialization
 */
async function init() {
    initAuthUI();

    const isAuthenticated = await checkAuth();

    if (!isAuthenticated) {
        showAuthModal();
    } else {
        initializeGame();
    }
}

// Replace current DOMContentLoaded handler
document.addEventListener('DOMContentLoaded', init);
```

#### Step 4.4: Update `apiCall` Function

Remove localStorage API keys, rely on server-side storage:

```javascript
/**
 * Make an API call to the game server
 * @param {string} endpoint
 * @param {string} method
 * @param {Object} body
 * @returns {Promise<Object>}
 */
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include'  // Include cookies for session
    };

    if (body) {
        options.body = JSON.stringify(body);
    }

    const response = await fetch(endpoint, options);

    // Handle auth errors
    if (response.status === 401) {
        authState.authenticated = false;
        showAuthModal();
        throw new Error('Authentication required');
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'API call failed');
    }

    return data;
}
```

---

### Phase 5: Migration & Cleanup

#### Step 5.1: Remove Old File-Based Storage

After the new system is working:

1. Remove `.jrpg-save.json` file handling code
2. Remove `.jrpg-settings.json` file handling code
3. Remove `loadGameSave()` and `saveGameData()` functions
4. Remove `loadSettings()` and `saveSettings()` functions

#### Step 5.2: Clean Up localStorage References

Remove from `game.js`:
- `getStoredApiKeys()` function
- `saveStoredApiKeys()` function
- All `localStorage.getItem('jrpg_*')` calls
- All `localStorage.setItem('jrpg_*')` calls

#### Step 5.3: Update Settings Modal

The existing settings modal needs to:
1. Load values from `authState.settings`
2. Save changes via `PUT /api/auth/settings`
3. Remove localStorage save logic

---

## 5. API Reference

### Authentication Endpoints

| Method | Endpoint | Body | Response | Auth |
|--------|----------|------|----------|------|
| POST | `/api/auth/register` | `{ username, password }` | `{ success, user }` | No |
| POST | `/api/auth/login` | `{ username, password }` | `{ success, user }` | No |
| POST | `/api/auth/logout` | - | `{ success }` | No |
| GET | `/api/auth/me` | - | `{ authenticated, user? }` | No |
| GET | `/api/auth/settings` | - | Settings object | Yes |
| PUT | `/api/auth/settings` | Partial settings | `{ success }` | Yes |

### Error Codes

| Code | Description |
|------|-------------|
| `AUTH_REQUIRED` | Session expired or not logged in |
| `ALREADY_AUTHENTICATED` | Trying to login/register while logged in |
| `INVALID_CREDENTIALS` | Wrong username or password |
| `USERNAME_TAKEN` | Username already exists |
| `VALIDATION_ERROR` | Input validation failed |

---

## 6. Security Considerations

### 6.1 Password Security

- **Hashing**: bcrypt with cost factor 12 (~250ms)
- **No plaintext storage**: Passwords only stored as hashes
- **No password hints**: Error messages don't reveal if username exists

### 6.2 Session Security

- **HttpOnly cookies**: Not accessible via JavaScript
- **Secure flag**: HTTPS only in production
- **SameSite=Lax**: CSRF protection
- **7-day expiry**: Balance between security and convenience

### 6.3 API Key Security

- **Server-side storage**: Keys never sent to client unnecessarily
- **AES-256-GCM encryption**: Authenticated encryption at rest
- **Key derivation**: PBKDF2 from server secret

### 6.4 Input Validation

- **Username**: 3-32 chars, alphanumeric + underscore
- **Password**: 8-128 chars, must have letter + number
- **SQL injection**: Parameterized queries via better-sqlite3
- **XSS**: No user input rendered as HTML

### 6.5 Rate Limiting (Future)

Consider adding:
- Max 5 failed login attempts per IP per 15 minutes
- Max 3 registration attempts per IP per hour

---

## 7. Testing Plan

### 7.1 Unit Tests

```javascript
// tests/auth.test.js

describe('Auth validation', () => {
    test('validateUsername rejects short names', () => {
        expect(validateUsername('ab').valid).toBe(false);
    });

    test('validateUsername rejects special characters', () => {
        expect(validateUsername('user@name').valid).toBe(false);
    });

    test('validatePassword requires letter and number', () => {
        expect(validatePassword('12345678').valid).toBe(false);
        expect(validatePassword('abcdefgh').valid).toBe(false);
        expect(validatePassword('abcd1234').valid).toBe(true);
    });
});

describe('Crypto', () => {
    test('encrypt/decrypt roundtrip', () => {
        const original = 'my-api-key-12345';
        const encrypted = encrypt(original);
        const decrypted = decrypt(encrypted);
        expect(decrypted).toBe(original);
    });

    test('different IVs for same plaintext', () => {
        const encrypted1 = encrypt('same');
        const encrypted2 = encrypt('same');
        expect(encrypted1).not.toBe(encrypted2);
    });
});
```

### 7.2 E2E Tests

```javascript
// tests/e2e/auth.spec.js

import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
    test('shows login modal on first visit', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('#auth-modal')).toBeVisible();
    });

    test('can register new account', async ({ page }) => {
        await page.goto('/');

        // Switch to register tab
        await page.click('[data-tab="register"]');

        // Fill form
        await page.fill('#register-username', 'testuser123');
        await page.fill('#register-password', 'TestPass123');
        await page.fill('#register-confirm', 'TestPass123');

        // Submit
        await page.click('#register-form button[type="submit"]');

        // Should hide modal and show game
        await expect(page.locator('#auth-modal')).toBeHidden();
        await expect(page.locator('#game-container')).toBeVisible();
    });

    test('can login with existing account', async ({ page }) => {
        // ... similar to register test
    });

    test('shows error for invalid credentials', async ({ page }) => {
        await page.goto('/');

        await page.fill('#login-username', 'nonexistent');
        await page.fill('#login-password', 'wrongpass');
        await page.click('#login-form button[type="submit"]');

        await expect(page.locator('#login-error')).toBeVisible();
        await expect(page.locator('#login-error')).toContainText('Invalid');
    });

    test('persists session across page reload', async ({ page }) => {
        // Login first
        // ... login steps

        // Reload page
        await page.reload();

        // Should not show login modal
        await expect(page.locator('#auth-modal')).toBeHidden();
    });
});
```

---

## 8. Environment Variables

### Required in Production

```bash
# Session encryption
SESSION_SECRET=<random-64-char-string>

# API key encryption
AUTH_SECRET=<random-64-char-string>

# Database path (optional, defaults to .jrpg-database.sqlite)
DB_PATH=/path/to/database.sqlite
```

### Generating Secrets

```bash
# Generate secure random strings
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 9. Deployment Checklist

- [ ] Set `SESSION_SECRET` environment variable
- [ ] Set `AUTH_SECRET` environment variable
- [ ] Ensure persistent storage for SQLite files
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS (required for secure cookies)
- [ ] Test registration flow
- [ ] Test login flow
- [ ] Test game save persistence
- [ ] Test settings persistence

---

## 10. Future Enhancements

### Not in Scope for Initial Implementation

1. **Password Reset**: Requires email service integration
2. **OAuth**: Google/Discord login
3. **Two-Factor Auth**: TOTP support
4. **Account Deletion**: GDPR compliance
5. **Session Management**: View/revoke active sessions
6. **Rate Limiting**: Brute force protection
7. **Audit Logging**: Track login attempts

---

*End of Specification*
