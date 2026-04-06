import { Router } from 'express';
import { runSimulation } from '../engine/runner.js';

/**
 * Simulation control routes.
 * @param {Object} store - SQLite store instance
 * @param {string} gameServerUrl - Base URL of the Koto game server
 * @param {string} adminSecret - Admin secret for privileged endpoints
 * @returns {Router}
 */
export default function createSimulationRoutes(store, gameServerUrl, adminSecret) {
  const router = Router();

  /** Track running simulations for pause/resume control */
  const runningSimulations = new Map();

  // Start a new simulation
  router.post('/start', (req, res) => {
    const { profileId } = req.body;
    if (!profileId) {
      return res.status(400).json({ error: 'profileId is required' });
    }

    try {
      const profile = store.getProfile(Number(profileId));
      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }

      const simId = store.createSimulation(profile.id);
      const control = { paused: false };
      runningSimulations.set(simId, control);

      // Fire-and-forget: run simulation in background
      runSimulation(profile.config, store, simId, gameServerUrl, adminSecret, {
        onDayComplete: null,
        onPause: () => control.paused
      }).then(() => {
        runningSimulations.delete(simId);
      }).catch((err) => {
        console.error(`Simulation ${simId} errored:`, err.message);
        runningSimulations.delete(simId);
      });

      res.status(201).json({ simId, status: 'running' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Pause a running simulation
  router.post('/:id/pause', (req, res) => {
    const simId = Number(req.params.id);
    const control = runningSimulations.get(simId);
    if (!control) {
      return res.status(404).json({ error: 'Simulation is not currently running' });
    }
    control.paused = true;
    res.json({ simId, status: 'pausing' });
  });

  // Resume a paused simulation
  router.post('/:id/resume', (req, res) => {
    const simId = Number(req.params.id);
    try {
      const sim = store.getSimulation(simId);
      if (!sim) {
        return res.status(404).json({ error: 'Simulation not found' });
      }
      if (sim.status !== 'paused') {
        return res.status(400).json({ error: `Simulation is ${sim.status}, not paused` });
      }

      const profile = store.getProfile(sim.profile_id);
      if (!profile) {
        return res.status(404).json({ error: 'Associated profile not found' });
      }

      const control = { paused: false };
      runningSimulations.set(simId, control);

      // Re-run from current_day (runner picks up where it left off)
      runSimulation(profile.config, store, simId, gameServerUrl, adminSecret, {
        onDayComplete: null,
        onPause: () => control.paused
      }).then(() => {
        runningSimulations.delete(simId);
      }).catch((err) => {
        console.error(`Simulation ${simId} errored on resume:`, err.message);
        runningSimulations.delete(simId);
      });

      res.json({ simId, status: 'resuming' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get simulation details
  router.get('/:id', (req, res) => {
    try {
      const sim = store.getSimulation(Number(req.params.id));
      if (!sim) {
        return res.status(404).json({ error: 'Simulation not found' });
      }
      sim.isRunning = runningSimulations.has(sim.id);
      res.json(sim);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
