import { Router } from 'express';

/**
 * Profile management routes.
 * @param {Object} store - SQLite store instance
 * @returns {Router}
 */
export default function createProfileRoutes(store) {
  const router = Router();

  // List all profiles, with latest simulation attached
  router.get('/', (req, res) => {
    try {
      const profiles = store.getAllProfiles();
      for (const profile of profiles) {
        const sims = store.getSimulationsForProfile(profile.id);
        profile.latestSimulation = sims.length > 0 ? sims[0] : null;
      }
      res.json(profiles);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Create a new profile
  router.post('/', (req, res) => {
    const { name, config } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    try {
      const id = store.createProfile(name, config || {});
      res.status(201).json({ id, name, config: config || {} });
    } catch (err) {
      if (err.message?.includes('UNIQUE constraint')) {
        return res.status(409).json({ error: `Profile name "${name}" already exists` });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // Get a single profile
  router.get('/:id', (req, res) => {
    try {
      const profile = store.getProfile(Number(req.params.id));
      if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      res.json(profile);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Update a profile
  router.put('/:id', (req, res) => {
    const { name, config } = req.body;
    try {
      const existing = store.getProfile(Number(req.params.id));
      if (!existing) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      store.updateProfile(
        Number(req.params.id),
        name ?? existing.name,
        config ?? existing.config
      );
      const updated = store.getProfile(Number(req.params.id));
      res.json(updated);
    } catch (err) {
      if (err.message?.includes('UNIQUE constraint')) {
        return res.status(409).json({ error: `Profile name "${name}" already exists` });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // Delete a profile
  router.delete('/:id', (req, res) => {
    try {
      const existing = store.getProfile(Number(req.params.id));
      if (!existing) {
        return res.status(404).json({ error: 'Profile not found' });
      }
      store.deleteProfile(Number(req.params.id));
      res.json({ deleted: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
