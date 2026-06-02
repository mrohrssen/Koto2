import { Router } from 'express';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join, resolve, sep } from 'path';
import { dataPath } from '../data-dir.js';
import { findUserByUsername } from '../auth/users.js';
import { optionalAuth } from '../auth/middleware.js';
import { getErrors } from '../server-error-buffer.js';

const BUG_REPORTS_DIR = dataPath('bug-reports');
const MAX_REPORTS = 50;
const BUG_REPORT_ID_PATTERN = /^[a-zA-Z0-9_-]+-\d+$/;

export function isSafeBugReportId(id) {
  return typeof id === 'string' && BUG_REPORT_ID_PATTERN.test(id);
}

export function resolveBugReportDir(rootDir, reportId) {
  if (!isSafeBugReportId(reportId)) {
    throw new Error('Invalid report id');
  }

  const root = resolve(rootDir);
  const reportDir = resolve(root, reportId);
  if (reportDir !== root && !reportDir.startsWith(`${root}${sep}`)) {
    throw new Error('Invalid report id');
  }

  return reportDir;
}

function requireAdminSecret(req, res, next) {
  const secret = process.env.ADMIN_SECRET || '';
  if (!secret) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (req.headers['x-admin-secret'] !== secret) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  return next();
}

// Ensure directory exists
if (!existsSync(BUG_REPORTS_DIR)) {
  mkdirSync(BUG_REPORTS_DIR, { recursive: true });
}

/** Prune oldest reports beyond MAX_REPORTS limit */
function pruneOldReports() {
  try {
    const dirs = readdirSync(BUG_REPORTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const reportPath = join(BUG_REPORTS_DIR, d.name, 'report.json');
        let timestamp = 0;
        if (existsSync(reportPath)) {
          try {
            const data = JSON.parse(readFileSync(reportPath, 'utf-8'));
            timestamp = new Date(data.timestamp).getTime() || 0;
          } catch { /* use 0 */ }
        }
        return { name: d.name, timestamp };
      })
      .sort((a, b) => b.timestamp - a.timestamp); // newest first

    if (dirs.length <= MAX_REPORTS) return;

    const toDelete = dirs.slice(MAX_REPORTS);
    for (const dir of toDelete) {
      rmSync(join(BUG_REPORTS_DIR, dir.name), { recursive: true });
    }
    console.log(`Pruned ${toDelete.length} old bug reports (kept ${MAX_REPORTS})`);
  } catch (err) {
    console.error('Bug report prune error:', err.message);
  }
}

export default function createBugReportRoutes() {
  const router = Router();

  // POST /api/bug-report - Submit a new bug report
  router.post('/bug-report', optionalAuth, (req, res) => {
    try {
      const { name, tester, note, screenshot, context } = req.body;

      if (!name || (!screenshot && !note)) {
        return res.status(400).json({ error: 'Name and either screenshot or note required' });
      }

      // Sanitize name for filesystem
      const safeName = name.replace(/[^a-zA-Z0-9-_]/g, '-').substring(0, 50);
      const timestamp = new Date().toISOString();
      const reportId = `${safeName}-${Date.now()}`;
      const reportDir = join(BUG_REPORTS_DIR, reportId);

      mkdirSync(reportDir, { recursive: true });

      // Save screenshot if provided (base64 PNG)
      if (screenshot) {
        const base64Data = screenshot.replace(/^data:image\/(png|jpeg|webp);base64,/, '');
        writeFileSync(join(reportDir, 'screenshot.png'), base64Data, 'base64');
      }

      // Attach server-side errors if user is identified
      const serverErrors = req.user?.id ? getErrors(req.user.id) : [];

      // Save metadata with diagnostic streams
      const report = {
        name: safeName,
        tester: tester || 'anonymous',
        userId: req.user?.id || null,
        note: note || '',
        timestamp,
        ...context,
        serverErrors
      };
      writeFileSync(join(reportDir, 'report.json'), JSON.stringify(report, null, 2));

      res.json({ success: true, reportId });

      // Async cleanup - don't block response
      setImmediate(pruneOldReports);
    } catch (error) {
      console.error('Bug report error:', error);
      res.status(500).json({ error: 'Failed to save bug report', detail: error.message });
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
      const reportDir = resolveBugReportDir(BUG_REPORTS_DIR, req.params.id);
      const reportPath = join(reportDir, 'report.json');

      if (!existsSync(reportPath)) {
        return res.status(404).json({ error: 'Report not found' });
      }

      const report = JSON.parse(readFileSync(reportPath, 'utf-8'));
      res.json({ id: req.params.id, ...report });
    } catch (error) {
      if (error.message === 'Invalid report id') {
        return res.status(400).json({ error: 'Invalid report id' });
      }
      console.error('Get bug report error:', error);
      res.status(500).json({ error: 'Failed to get bug report' });
    }
  });

  // GET /api/bug-reports/:id/screenshot - Get screenshot image
  router.get('/bug-reports/:id/screenshot', (req, res) => {
    try {
      const reportDir = resolveBugReportDir(BUG_REPORTS_DIR, req.params.id);
      const screenshotPath = join(reportDir, 'screenshot.png');

      if (!existsSync(screenshotPath)) {
        return res.status(404).json({ error: 'Screenshot not found' });
      }

      res.sendFile(screenshotPath);
    } catch (error) {
      if (error.message === 'Invalid report id') {
        return res.status(400).json({ error: 'Invalid report id' });
      }
      console.error('Get screenshot error:', error);
      res.status(500).json({ error: 'Failed to get screenshot' });
    }
  });

  // DELETE /api/bug-reports/:id - Delete a report
  router.delete('/bug-reports/:id', requireAdminSecret, (req, res) => {
    try {
      const reportDir = resolveBugReportDir(BUG_REPORTS_DIR, req.params.id);

      if (!existsSync(reportDir)) {
        return res.status(404).json({ error: 'Report not found' });
      }

      rmSync(reportDir, { recursive: true });
      res.json({ success: true });
    } catch (error) {
      if (error.message === 'Invalid report id') {
        return res.status(400).json({ error: 'Invalid report id' });
      }
      console.error('Delete bug report error:', error);
      res.status(500).json({ error: 'Failed to delete bug report' });
    }
  });

  // GET /api/diagnostic/npc-dialogue-cache/:username - Dump NPC dialogue cache for a user
  router.get('/diagnostic/npc-dialogue-cache/:username', (req, res) => {
    try {
      const user = findUserByUsername(req.params.username);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const cachePath = dataPath(`npc-dialogue-cache-${user.id}.json`);
      if (!existsSync(cachePath)) {
        return res.json({ userId: user.id, username: user.username, npcCount: 0, cache: {} });
      }

      const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
      const npcCount = Object.keys(cache).length;
      res.json({ userId: user.id, username: user.username, npcCount, cache });
    } catch (error) {
      console.error('Diagnostic npc-dialogue-cache error:', error);
      res.status(500).json({ error: 'Failed to read cache' });
    }
  });

  // GET /api/diagnostic/creature-dialogue-cache/:username - Dump creature befriend dialogue cache
  router.get('/diagnostic/creature-dialogue-cache/:username', (req, res) => {
    try {
      const user = findUserByUsername(req.params.username);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const cachePath = dataPath(`creature-dialogue-cache-${user.id}.json`);
      if (!existsSync(cachePath)) {
        return res.json({ userId: user.id, username: user.username, creatureCount: 0, cache: {} });
      }

      const cache = JSON.parse(readFileSync(cachePath, 'utf8'));
      const creatureCount = Object.keys(cache).length;
      res.json({ userId: user.id, username: user.username, creatureCount, cache });
    } catch (error) {
      console.error('Diagnostic creature-dialogue-cache error:', error);
      res.status(500).json({ error: 'Failed to read cache' });
    }
  });

  return router;
}
