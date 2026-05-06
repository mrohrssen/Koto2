import { Router } from 'express';
import { awardDailyLoginCrystals } from '../../game/services/crystal-wallet-service.js';

function nowForCrystalAward() {
  return process.env.NODE_ENV === 'test' && process.env.CRYSTAL_TEST_NOW
    ? new Date(process.env.CRYSTAL_TEST_NOW)
    : new Date();
}

export default function createCrystalRoutes() {
  const router = Router();

  router.post('/crystals/daily-login', (req, res) => {
    const meta = req.gameManager.getMeta();
    const result = awardDailyLoginCrystals(meta, nowForCrystalAward());
    if (result.awarded) req.saveGame();
    res.json({ ok: true, ...result });
  });

  return router;
}
