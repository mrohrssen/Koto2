# Central Dev Hub Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a central dev hub page at `/dev/` linking to all dashboards, plus a Feature Mockups page at `/dev/mockups`.

**Architecture:** Two new static HTML pages served by the existing dev router behind auth. One new API endpoint to auto-discover mockup files. Minimal backend changes (3 new routes in dev.js).

**Tech Stack:** Express routes, vanilla HTML/CSS (dark theme matching existing dev dashboard)

---

### Task 1: Add hub and mockups routes to dev router

**Files:**
- Modify: `src/routes/dev.js:483-486` (add routes before `/sprites`)

**Step 1: Add the three new routes**

Insert after the `POST /login` handler (line 481) and before `GET /sprites` (line 483):

```javascript
  // ── GET / (hub) ──────────────────────────────────────────────
  router.get('/', requireAuth, (_req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'dev-hub.html'));
  });

  // ── GET /mockups ─────────────────────────────────────────────
  router.get('/mockups', requireAuth, (_req, res) => {
    res.sendFile(join(process.cwd(), 'public', 'dev-mockups.html'));
  });

  // ── GET /api/mockups ─────────────────────────────────────────
  router.get('/api/mockups', requireAuth, (_req, res) => {
    const pubDir = join(process.cwd(), 'public');
    const files = readdirSync(pubDir)
      .filter(f => f.startsWith('mockup-') && f.endsWith('.html'))
      .sort()
      .map(f => ({
        file: f,
        name: f.replace('mockup-', '').replace('.html', '').replace(/-/g, ' ')
      }));
    res.json(files);
  });
```

**Step 2: Update login redirect to point to hub instead of sprites**

In `src/routes/dev.js:478`, change:
```javascript
      return res.redirect('/dev/sprites');
```
to:
```javascript
      return res.redirect('/dev/');
```

**Step 3: Syntax check**

Run: `node --check src/routes/dev.js && echo "OK"`
Expected: `OK`

**Step 4: Commit**

```bash
git add src/routes/dev.js
git commit -m "feat: add dev hub and mockups routes to dev router"
```

---

### Task 2: Create dev hub page

**Files:**
- Create: `public/dev-hub.html`

**Step 1: Create the hub HTML**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Koto Dev Hub</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 2rem;
    }
    h1 {
      text-align: center;
      margin-bottom: 2rem;
      font-size: 1.5rem;
      color: #a0c4ff;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 1rem;
      max-width: 900px;
      margin: 0 auto;
    }
    .card {
      background: #16213e;
      border: 1px solid #0f3460;
      border-radius: 8px;
      padding: 1.25rem;
      text-decoration: none;
      color: #e0e0e0;
      transition: border-color 0.2s, transform 0.2s;
    }
    .card:hover {
      border-color: #a0c4ff;
      transform: translateY(-2px);
    }
    .card h2 {
      font-size: 1.1rem;
      margin-bottom: 0.4rem;
      color: #a0c4ff;
    }
    .card p {
      font-size: 0.85rem;
      color: #8899aa;
      line-height: 1.4;
    }
    .card .badge {
      display: inline-block;
      font-size: 0.7rem;
      padding: 0.15rem 0.4rem;
      border-radius: 3px;
      margin-top: 0.5rem;
      background: #0f3460;
      color: #6699cc;
    }
  </style>
</head>
<body>
  <h1>Koto Dev Hub</h1>
  <div class="grid">
    <a class="card" href="/dev/sprites">
      <h2>Sprite Review</h2>
      <p>Quality gate for all game sprites — creatures, items, moves, bosses, NPCs, backgrounds.</p>
      <span class="badge">auth</span>
    </a>
    <a class="card" href="/forge.html">
      <h2>Forge Workbench</h2>
      <p>Theme-based content generation. Assign words, queue jobs, review results.</p>
    </a>
    <a class="card" href="/creatures-gallery.html">
      <h2>Creatures Gallery</h2>
      <p>Visual roster of all creatures, organized by rarity.</p>
    </a>
    <a class="card" href="/regen-review.html">
      <h2>Regen Review</h2>
      <p>QA review for regenerated action icons with vision judge scores.</p>
    </a>
    <a class="card" href="/assets/sprites/items/review.html">
      <h2>Items Review</h2>
      <p>Item sprite review organized by category.</p>
    </a>
    <a class="card" href="/dev/mockups">
      <h2>Feature Mockups</h2>
      <p>Browse UI mockups and design prototypes.</p>
      <span class="badge">auth</span>
    </a>
  </div>
</body>
</html>
```

**Step 2: Verify file exists and syntax**

Run: `ls -la public/dev-hub.html`

**Step 3: Commit**

```bash
git add public/dev-hub.html
git commit -m "feat: add central dev hub page"
```

---

### Task 3: Create feature mockups page

**Files:**
- Create: `public/dev-mockups.html`

**Step 1: Create the mockups HTML**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Feature Mockups — Koto Dev</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 2rem;
    }
    .header {
      max-width: 600px;
      margin: 0 auto 1.5rem;
    }
    .header a {
      color: #6699cc;
      text-decoration: none;
      font-size: 0.85rem;
    }
    .header a:hover { text-decoration: underline; }
    h1 {
      font-size: 1.3rem;
      color: #a0c4ff;
      margin-top: 0.5rem;
    }
    .list {
      max-width: 600px;
      margin: 0 auto;
      list-style: none;
    }
    .list li {
      border-bottom: 1px solid #0f3460;
    }
    .list a {
      display: block;
      padding: 0.75rem 0;
      color: #e0e0e0;
      text-decoration: none;
      text-transform: capitalize;
      font-size: 0.95rem;
    }
    .list a:hover { color: #a0c4ff; }
    .list .filename {
      font-size: 0.75rem;
      color: #556677;
      margin-left: 0.5rem;
    }
    .empty {
      text-align: center;
      color: #556677;
      margin-top: 2rem;
    }
  </style>
</head>
<body>
  <div class="header">
    <a href="/dev/">&larr; Back to Hub</a>
    <h1>Feature Mockups</h1>
  </div>
  <ul class="list" id="mockup-list"></ul>
  <p class="empty" id="empty" style="display:none">No mockups found.</p>
  <script>
    fetch('/dev/api/mockups')
      .then(r => r.json())
      .then(items => {
        const list = document.getElementById('mockup-list');
        if (!items.length) {
          document.getElementById('empty').style.display = '';
          return;
        }
        for (const item of items) {
          const li = document.createElement('li');
          const a = document.createElement('a');
          a.href = '/' + item.file;
          a.target = '_blank';
          a.rel = 'noopener';
          a.textContent = item.name;
          const span = document.createElement('span');
          span.className = 'filename';
          span.textContent = item.file;
          a.appendChild(span);
          li.appendChild(a);
          list.appendChild(li);
        }
      })
      .catch(() => {
        document.getElementById('empty').style.display = '';
        document.getElementById('empty').textContent = 'Failed to load mockups.';
      });
  </script>
</body>
</html>
```

**Step 2: Verify file exists**

Run: `ls -la public/dev-mockups.html`

**Step 3: Commit**

```bash
git add public/dev-mockups.html
git commit -m "feat: add feature mockups page with auto-discovery"
```

---

### Task 4: Test end-to-end

**Step 1: Restart dev server**

Run: `sudo pm2 restart all`
Wait 3s, verify: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000`
Expected: `200`

**Step 2: Verify hub route (unauthenticated redirects to login)**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dev/`
Expected: `302` (redirect to login) if `DEV_DASHBOARD_PASSWORD` is set, or `200` if not

**Step 3: Verify mockups API**

Run: `curl -s http://localhost:3000/dev/api/mockups`
Expected: JSON array with 3 mockup entries (vocab-cards, move-cards, move-horizontal)

**Step 4: Verify mockups page**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/dev/mockups`
Expected: `200` or `302` depending on auth config
