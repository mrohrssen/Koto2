import { Router } from 'express';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  readQueue,
  appendJobs,
  readResults,
  removeResult,
  updateJobStatus
} from '../forge/forge-data.js';

const STAGING_FILES = {
  creature: 'new-creatures-staging.json',
  move: 'new-moves-staging.json',
  item: 'new-items-staging.json',
  npc: 'new-npcs-staging.json',
  area: 'new-areas-staging.json',
  'npc-skill': 'new-npc-skills-staging.json'
};

/**
 * Create Forge Workbench router
 * @param {object} opts
 * @param {string} opts.themesDir - Path to language/themes directory
 * @param {string} opts.dataDir - Path to data directory
 * @returns {Router}
 */
export function createForgeRouter({ themesDir, dataDir }) {
  const router = Router();
  const queuePath = join(dataDir, 'forge-queue.json');
  const resultsPath = join(dataDir, 'forge-results.json');

  // ── GET /themes ──────────────────────────────────────────────
  async function getThemes(_req, res) {
    try {
      const files = readdirSync(themesDir).filter(f => f.endsWith('.json'));
      const themes = files.map(f => {
        const theme = JSON.parse(readFileSync(join(themesDir, f), 'utf8'));
        const words = theme.words || [];
        const assigned = words.filter(w => w.assigned);
        return {
          themeId: theme.themeId,
          areaWord: theme.areaWord,
          areaReading: theme.areaReading,
          areaMeaning: theme.areaMeaning,
          computedStage: theme.computedStage,
          totalWords: words.length,
          assignedWords: assigned.length,
          progress: words.length > 0 ? Math.round((assigned.length / words.length) * 100) : 0
        };
      });
      res.json({ themes });
    } catch (error) {
      console.error('[Forge] Error:', error);
      res.status(500).json({ error: 'Failed to list themes', details: error.message });
    }
  }

  // ── GET /theme/:id ───────────────────────────────────────────
  async function getTheme(req, res) {
    try {
      const { id } = req.params;
      const filePath = join(themesDir, `${id}.json`);
      if (!existsSync(filePath)) {
        return res.status(404).json({ error: `Theme '${id}' not found` });
      }
      const theme = JSON.parse(readFileSync(filePath, 'utf8'));
      res.json(theme);
    } catch (error) {
      console.error('[Forge] Error:', error);
      res.status(500).json({ error: 'Failed to read theme', details: error.message });
    }
  }

  // ── GET /queue ───────────────────────────────────────────────
  async function getQueue(_req, res) {
    try {
      const queue = readQueue(queuePath);
      res.json(queue);
    } catch (error) {
      console.error('[Forge] Error:', error);
      res.status(500).json({ error: 'Failed to read queue', details: error.message });
    }
  }

  // ── POST /queue ──────────────────────────────────────────────
  async function postQueue(req, res) {
    try {
      const { themeId, jobs } = req.body || {};
      if (!themeId) {
        return res.status(400).json({ error: 'Missing required field: themeId' });
      }
      if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
        return res.status(400).json({ error: 'Missing or empty required field: jobs' });
      }
      const created = appendJobs(queuePath, jobs, themeId);
      res.json({ success: true, added: created.length, jobs: created });
    } catch (error) {
      console.error('[Forge] Error:', error);
      res.status(500).json({ error: 'Failed to append jobs', details: error.message });
    }
  }

  // ── GET /results ─────────────────────────────────────────────
  async function getResults(_req, res) {
    try {
      const results = readResults(resultsPath);
      res.json(results);
    } catch (error) {
      console.error('[Forge] Error:', error);
      res.status(500).json({ error: 'Failed to read results', details: error.message });
    }
  }

  // ── POST /approve ────────────────────────────────────────────
  async function postApprove(req, res) {
    try {
      const { jobId, editedData } = req.body || {};
      if (!jobId) {
        return res.status(400).json({ error: 'Missing required field: jobId' });
      }
      if (!editedData) {
        return res.status(400).json({ error: 'Missing required field: editedData' });
      }

      // 1. Find result in results file by jobId
      const resultsData = readResults(resultsPath);
      const result = resultsData.results.find(r => r.jobId === jobId);
      if (!result) {
        return res.status(404).json({ error: `Result not found for jobId: ${jobId}` });
      }

      const role = result.role;

      // 2. Read staging file for the role (or create empty array if doesn't exist)
      const stagingFile = STAGING_FILES[role];
      if (!stagingFile) {
        return res.status(400).json({ error: `Unknown role: ${role}` });
      }
      const stagingPath = join(dataDir, stagingFile);
      let staging = [];
      if (existsSync(stagingPath)) {
        staging = JSON.parse(readFileSync(stagingPath, 'utf8'));
      }

      // 3. Push editedData to staging array (handle single or array)
      const items = Array.isArray(editedData) ? editedData : [editedData];
      staging.push(...items);

      // 4. Write staging file
      writeFileSync(stagingPath, JSON.stringify(staging, null, 2));

      // 5. Find word in theme pool and set assigned
      const themeId = result.themeId;
      if (themeId) {
        const themePath = join(themesDir, `${themeId}.json`);
        if (existsSync(themePath)) {
          const theme = JSON.parse(readFileSync(themePath, 'utf8'));
          const queue = readQueue(queuePath);
          const job = queue.jobs.find(j => j.id === jobId);
          const wordToMatch = job ? job.word : null;

          if (wordToMatch && theme.words) {
            // Assign the matched Japanese word.
            const wordEntry = theme.words.find(w => w.word === wordToMatch);
            if (wordEntry) {
              const ids = items.map(it => it.id).join('+');
              wordEntry.assigned = `${role}:${ids}`;
            }
            // Mark modifier words as used for all items
            for (const item of items) {
              const mod = item.modifier;
              if (mod && mod.word) {
                const modEntry = theme.words.find(w => w.word === mod.word);
                if (modEntry && !modEntry.assigned) {
                  modEntry.assigned = `${role}-modifier:${item.id}`;
                }
              }
            }
            writeFileSync(themePath, JSON.stringify(theme, null, 2));
          }
        }
      }

      // 6. Remove result from results file
      removeResult(resultsPath, jobId);

      // 7. Update job status to 'approved' in queue
      updateJobStatus(queuePath, jobId, 'approved');

      res.json({ success: true, role, id: editedData.id });
    } catch (error) {
      console.error('[Forge] Error:', error);
      res.status(500).json({ error: 'Failed to approve result', details: error.message });
    }
  }

  // ── POST /discard ────────────────────────────────────────────
  async function postDiscard(req, res) {
    try {
      const { jobId } = req.body || {};
      if (!jobId) {
        return res.status(400).json({ error: 'Missing required field: jobId' });
      }

      // 1. Remove result from results file
      removeResult(resultsPath, jobId);

      // 2. Update job status to 'discarded' in queue
      updateJobStatus(queuePath, jobId, 'discarded');

      res.json({ success: true });
    } catch (error) {
      console.error('[Forge] Error:', error);
      res.status(500).json({ error: 'Failed to discard result', details: error.message });
    }
  }

  // ── POST /theme/:id/word ─────────────────────────────────────
  async function postAddWord(req, res) {
    try {
      const { id } = req.params;
      const { word, reading, meaning, rank, roles } = req.body || {};
      if (!word || !meaning) {
        return res.status(400).json({ error: 'Missing required fields: word, meaning' });
      }
      const themePath = join(themesDir, `${id}.json`);
      if (!existsSync(themePath)) {
        return res.status(404).json({ error: `Theme '${id}' not found` });
      }
      const theme = JSON.parse(readFileSync(themePath, 'utf8'));
      if (!theme.words) theme.words = [];

      // Check for duplicate
      if (theme.words.some(w => w.word === word)) {
        return res.status(409).json({ error: `Word '${word}' already exists in this theme` });
      }

      const newWord = {
        word,
        reading: reading || '',
        meaning,
        rank: rank || null,
        roles: roles || [],
        source: 'manual',
        consensus: 0,
        assigned: null,
        existingUses: []
      };
      theme.words.push(newWord);
      writeFileSync(themePath, JSON.stringify(theme, null, 2));
      res.json({ success: true, word: newWord });
    } catch (error) {
      console.error('[Forge] Error:', error);
      res.status(500).json({ error: 'Failed to add word', details: error.message });
    }
  }

  // ── POST /reconcile ─────────────────────────────────────────
  async function postReconcile(_req, res) {
    try {
      // Collect all used words from staging + production data
      // Map: japaneseWord -> { role, id, type: 'base'|'modifier' }[]
      const usedWords = new Map();

      function trackWord(word, role, id, type) {
        if (!word) return;
        if (!usedWords.has(word)) usedWords.set(word, []);
        usedWords.get(word).push({ role, id, type });
      }

      // Scan staging files
      for (const [role, filename] of Object.entries(STAGING_FILES)) {
        const filepath = join(dataDir, filename);
        if (!existsSync(filepath)) continue;
        const entries = JSON.parse(readFileSync(filepath, 'utf8'));
        if (!Array.isArray(entries)) continue;
        for (const entry of entries) {
          const word = entry.name;
          if (word) trackWord(word, role, entry.id, 'base');
          if (entry.modifier?.word) trackWord(entry.modifier.word, role, entry.id, 'modifier');
          // NPC skills use word/verb directly
          if (role === 'npc-skill' && entry.word) trackWord(entry.word, role, entry.id, 'base');
          // Areas have sub-areas with location words
          if (entry.subAreas && Array.isArray(entry.subAreas)) {
            for (const sub of entry.subAreas) {
              if (sub.locationWord) trackWord(sub.locationWord, role, sub.id || entry.id, 'base');
              if (sub.modifier?.word) trackWord(sub.modifier.word, role, sub.id || entry.id, 'modifier');
            }
          }
        }
      }

      // Scan production files
      const prodFiles = { creature: 'creatures.json', item: 'items.json' };
      for (const [role, filename] of Object.entries(prodFiles)) {
        const filepath = join(dataDir, filename);
        if (!existsSync(filepath)) continue;
        const data = JSON.parse(readFileSync(filepath, 'utf8'));
        const entries = Array.isArray(data) ? data : Object.values(data);
        for (const entry of entries) {
          const word = entry.name;
          if (word) trackWord(word, role, entry.id, 'base');
          if (entry.modifier?.word) trackWord(entry.modifier.word, role, entry.id, 'modifier');
        }
      }

      // Reconcile against each theme file
      const themeFiles = readdirSync(themesDir).filter(f => f.endsWith('.json'));
      let totalFixed = 0;
      const fixes = [];

      for (const file of themeFiles) {
        const themePath = join(themesDir, file);
        const theme = JSON.parse(readFileSync(themePath, 'utf8'));
        if (!theme.words) continue;
        let changed = false;

        for (const wordEntry of theme.words) {
          if (wordEntry.assigned) continue; // already assigned, skip
          const uses = usedWords.get(wordEntry.word);
          if (!uses || uses.length === 0) continue;

          // Pick first use as the assignment
          const use = uses[0];
          const assignment = use.type === 'modifier'
            ? `${use.role}-modifier:${use.id}`
            : `${use.role}:${use.id}`;
          wordEntry.assigned = assignment;
          if (!wordEntry.existingUses) wordEntry.existingUses = [];
          if (!wordEntry.existingUses.includes(assignment)) {
            wordEntry.existingUses.push(assignment);
          }
          changed = true;
          totalFixed++;
          fixes.push({ theme: theme.themeId, word: wordEntry.word, assignment });
        }

        if (changed) {
          writeFileSync(themePath, JSON.stringify(theme, null, 2));
        }
      }

      res.json({ success: true, fixed: totalFixed, fixes });
    } catch (error) {
      console.error('[Forge] Reconcile error:', error);
      res.status(500).json({ error: 'Failed to reconcile', details: error.message });
    }
  }

  // ── Mount routes ─────────────────────────────────────────────
  router.get('/themes', getThemes);
  router.get('/theme/:id', getTheme);
  router.get('/queue', getQueue);
  router.post('/queue', postQueue);
  router.get('/results', getResults);
  router.post('/approve', postApprove);
  router.post('/discard', postDiscard);
  router.post('/theme/:id/word', postAddWord);
  router.post('/reconcile', postReconcile);

  // Expose handlers for testing
  router._handlers = { getThemes, getTheme, getQueue, postQueue, getResults, postApprove, postDiscard, postReconcile };

  return router;
}
