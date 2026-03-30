import { Router } from 'express';

/**
 * Save the current run's team to a PvP slot.
 * Deep-clones, restores full HP/MP, clears effects.
 */
export function savePvpTeam(gm, slotIndex) {
  if (slotIndex < 0 || slotIndex > 2) return false;
  if (!gm.run?.creatureParty) return false;

  if (!gm.meta.pvpTeams) gm.meta.pvpTeams = [null, null, null];

  const snapshot = JSON.parse(JSON.stringify({
    creatureParty: gm.run.creatureParty,
    partySkills: gm.run.partySkills || [],
    itemBuffs: gm.run.itemBuffs || {}
  }));

  const allCreatures = [
    ...(snapshot.creatureParty.active || []),
    ...(snapshot.creatureParty.reserves || [])
  ];
  for (const c of allCreatures) {
    if (!c) continue;
    c.hp = c.maxHp;
    c.mp = c.maxMp;
    c.activeEffects = [];
  }

  snapshot.savedAt = Date.now();
  gm.meta.pvpTeams[slotIndex] = snapshot;
  return true;
}

export function createPvpRoutes() {
  const router = Router();

  router.post('/save-pvp-team', (req, res) => {
    const { slotIndex } = req.body;
    const gm = req.gameManager;
    if (typeof slotIndex !== 'number' || slotIndex < 0 || slotIndex > 2) {
      return res.status(400).json({ error: 'Invalid slot index (0-2)' });
    }
    const saved = savePvpTeam(gm, slotIndex);
    if (!saved) {
      return res.status(400).json({ error: 'No active run to save' });
    }
    req.saveGame();
    res.json({ ok: true, pvpTeams: gm.meta.pvpTeams });
  });

  router.get('/pvp-teams', (req, res) => {
    const gm = req.gameManager;
    const pvpTeams = gm.meta?.pvpTeams || [null, null, null];
    res.json({ pvpTeams });
  });

  // Dev-only: seed PvP teams directly (for playtesting)
  router.post('/seed-pvp-teams', (req, res) => {
    if (process.env.RAILWAY_ENVIRONMENT_NAME === 'production') {
      return res.status(403).json({ error: 'Not available in production' });
    }
    const { pvpTeams } = req.body;
    if (!Array.isArray(pvpTeams) || pvpTeams.length !== 3) {
      return res.status(400).json({ error: 'pvpTeams must be array of 3' });
    }
    const gm = req.gameManager;
    gm.meta.pvpTeams = pvpTeams;
    req.saveGame();
    res.json({ ok: true });
  });

  return router;
}
