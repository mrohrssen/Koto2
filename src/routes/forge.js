/**
 * @fileoverview Forge Workbench API routes
 *
 * Provides endpoints for the Forge dashboard to manage theme-based content
 * generation. Handles theme listing, job queuing, result review, and
 * approval/discard workflows.
 *
 * API ENDPOINTS:
 *   GET  /themes       - List themes with progress stats
 *   GET  /theme/:id    - Full theme pool JSON
 *   GET  /queue        - Read forge queue
 *   POST /queue        - Append jobs to queue
 *   GET  /results      - Read forge results
 *   POST /approve      - Approve result: stage, mark assigned, remove result
 *   POST /discard      - Discard result: remove from results, update job status
 *
 * DEPENDENCIES:
 *   - ../forge/forge-data.js - Data read/write operations
 *   - language/themes/*.json - Theme pool files
 *   - data/forge-queue.json  - Job queue
 *   - data/forge-results.json - Generation results
 */

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
  area: 'new-areas-staging.json'
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

      // 3. Push editedData to staging array
      staging.push(editedData);

      // 4. Write staging file
      writeFileSync(stagingPath, JSON.stringify(staging, null, 2));

      // 5. Find word in theme pool and set assigned
      const themeId = result.themeId;
      if (themeId) {
        const themePath = join(themesDir, `${themeId}.json`);
        if (existsSync(themePath)) {
          const theme = JSON.parse(readFileSync(themePath, 'utf8'));
          // Find the job in the queue to get the word
          const queue = readQueue(queuePath);
          const job = queue.jobs.find(j => j.id === jobId);
          const wordToMatch = job ? job.word : null;
          if (wordToMatch && theme.words) {
            const wordEntry = theme.words.find(w => w.word === wordToMatch);
            if (wordEntry) {
              wordEntry.assigned = `${role}:${editedData.id}`;
              writeFileSync(themePath, JSON.stringify(theme, null, 2));
            }
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

  // ── Mount routes ─────────────────────────────────────────────
  router.get('/themes', getThemes);
  router.get('/theme/:id', getTheme);
  router.get('/queue', getQueue);
  router.post('/queue', postQueue);
  router.get('/results', getResults);
  router.post('/approve', postApprove);
  router.post('/discard', postDiscard);

  // Expose handlers for testing
  router._handlers = { getThemes, getTheme, getQueue, postQueue, getResults, postApprove, postDiscard };

  return router;
}
