import { Router } from 'express';
import { refreshCreatureListUids } from '../../game/creatures.js';
import { normalizeRankedState, toPublicRankedSummary } from '../../pvp/ranked-rating.js';

/**
 * Save the current run's team to a PvP slot.
 * Deep-clones, regenerates uids (snapshot is an independent roster —
 * same-template creatures across slots should be independent instances),
 * restores full HP/MP, clears effects.
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

  // Regenerate uids — the snapshot is a conceptually independent roster,
  // not an alias of the live run's creatures.
  refreshCreatureListUids(snapshot.creatureParty.active);
  refreshCreatureListUids(snapshot.creatureParty.reserves);

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

export function getPvpSummary(gm) {
  if (!gm.meta) gm.meta = {};
  if (!gm.meta.pvpTeams) gm.meta.pvpTeams = [null, null, null];
  gm.meta.pvpRanked = normalizeRankedState(gm.meta.pvpRanked);
  return {
    pvpTeams: gm.meta.pvpTeams,
    ranked: toPublicRankedSummary(gm.meta.pvpRanked)
  };
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
    const summary = getPvpSummary(req.gameManager);
    res.json(summary);
  });

  // Seed PvP teams directly (for playtesting without completing a run)
  router.post('/seed-pvp-teams', (req, res) => {
    const { pvpTeams } = req.body;
    if (!Array.isArray(pvpTeams) || pvpTeams.length !== 3) {
      return res.status(400).json({ error: 'pvpTeams must be array of 3' });
    }
    // Regenerate uids on every creature to prevent client-supplied uid
    // injection (a malicious client could otherwise seed colliding uids
    // across teams and poison spritesByUid lookups).
    for (const team of pvpTeams) {
      if (team?.creatureParty) {
        refreshCreatureListUids(team.creatureParty.active);
        refreshCreatureListUids(team.creatureParty.reserves);
      }
    }
    const gm = req.gameManager;
    gm.meta.pvpTeams = pvpTeams;
    req.saveGame();
    res.json({ ok: true });
  });

  return router;
}
