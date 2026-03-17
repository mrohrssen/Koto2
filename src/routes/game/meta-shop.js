/**
 * @fileoverview Meta progression shop routes
 *
 * GET /meta-shop — upgrade state + token balance
 * POST /meta-shop/buy — purchase an upgrade level
 */

import { Router } from 'express';
import { getMetaShopState, buyUpgrade } from '../../game/services/meta-shop-service.js';

export default function createMetaShopRoutes() {
  const router = Router();

  router.get('/meta-shop', (req, res) => {
    const meta = req.gameManager.getMeta();
    res.json(getMetaShopState(meta));
  });

  router.post('/meta-shop/buy', (req, res) => {
    const { upgradeId } = req.body;
    if (!upgradeId) return res.status(400).json({ error: 'upgradeId required' });

    const meta = req.gameManager.getMeta();

    // Hub phase check: run must be null
    if (req.gameManager.run) {
      return res.status(400).json({ error: 'Cannot buy upgrades during a run' });
    }

    const result = buyUpgrade(meta, upgradeId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    req.saveGame();
    res.json(getMetaShopState(meta));
  });

  return router;
}
