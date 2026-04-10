import { Router } from 'express';

/**
 * Simulation result / analytics routes.
 * @param {Object} store - SQLite store instance
 * @param {string} gameServerUrl - Base URL of the Koto game server
 * @param {string} adminSecret - Admin secret for privileged endpoints
 * @returns {Router}
 */
export default function createResultRoutes(store, gameServerUrl, adminSecret) {
  const router = Router();

  // Get daily snapshots for a simulation
  router.get('/:simId/snapshots', (req, res) => {
    try {
      const snapshots = store.getDailySnapshots(Number(req.params.simId));
      res.json(snapshots);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get events for a simulation (with optional filters)
  router.get('/:simId/events', (req, res) => {
    try {
      const filters = {};
      if (req.query.day !== undefined) filters.day = Number(req.query.day);
      if (req.query.type !== undefined) filters.event_type = req.query.type;
      if (req.query.limit !== undefined) filters.limit = Number(req.query.limit);

      const events = store.getEvents(Number(req.params.simId), filters);
      res.json(events);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get event type counts for a simulation
  router.get('/:simId/event-counts', (req, res) => {
    try {
      const counts = store.getEventCounts(Number(req.params.simId));
      res.json(counts);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get vocabulary tally for a simulation (word knowledge from game server)
  router.get('/:simId/vocabulary', async (req, res) => {
    try {
      const sim = store.getSimulation(Number(req.params.simId));
      if (!sim) return res.status(404).json({ error: 'Simulation not found' });
      if (!sim.test_user_id) return res.json({ words: [] });

      const resp = await fetch(
        `${gameServerUrl}/api/admin/word-knowledge/${sim.test_user_id}`,
        { headers: { 'x-admin-secret': adminSecret } }
      );
      if (!resp.ok) {
        return res.status(resp.status).json({ error: `Game server error: ${resp.status}` });
      }
      const data = await resp.json();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Compare multiple simulations
  router.post('/compare', (req, res) => {
    const { simIds } = req.body;
    if (!Array.isArray(simIds) || simIds.length === 0) {
      return res.status(400).json({ error: 'simIds must be a non-empty array' });
    }
    try {
      const data = store.getComparisonData(simIds.map(Number));
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
