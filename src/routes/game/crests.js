/**
 * @fileoverview Crest meta-progression routes
 *
 * GET  /crests       — crest state (drops, inventory, equipped)
 * POST /crests/open  — open a chest (element required)
 * POST /crests/equip — equip a crest (crestId required)
 * POST /crests/unequip — unequip a slot (element required)
 */

import { Router } from 'express';
import { getCrestState, openChest, equipCrest, unequipCrest } from '../../game/services/crest-service.js';

export default function createCrestRoutes() {
  const router = Router();

  router.get('/crests', (req, res) => {
    const meta = req.gameManager.getMeta();
    res.json(getCrestState(meta));
  });

  router.post('/crests/open', (req, res) => {
    const { element } = req.body;
    if (!element) return res.status(400).json({ error: 'element required' });

    const meta = req.gameManager.getMeta();

    // Hub phase check
    if (req.gameManager.run) {
      return res.status(400).json({ error: 'Cannot open chests during a run' });
    }

    const result = openChest(meta, element);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    req.saveGame();
    res.json({ crest: result.crest, ...getCrestState(meta) });
  });

  router.post('/crests/equip', (req, res) => {
    const { crestId } = req.body;
    if (!crestId) return res.status(400).json({ error: 'crestId required' });

    const meta = req.gameManager.getMeta();
    const result = equipCrest(meta, crestId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    req.saveGame();
    res.json(getCrestState(meta));
  });

  router.post('/crests/unequip', (req, res) => {
    const { element } = req.body;
    if (!element) return res.status(400).json({ error: 'element required' });

    const meta = req.gameManager.getMeta();
    const result = unequipCrest(meta, element);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    req.saveGame();
    res.json(getCrestState(meta));
  });

  return router;
}
