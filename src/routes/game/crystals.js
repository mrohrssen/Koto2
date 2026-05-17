import { Router } from 'express';
import { canUseDebugSuperAttack } from '../../game/debug-super-attack-access.js';
import {
  DAILY_CRYSTAL_BONUS,
  awardDailyLoginCrystals,
  ensureCrystalMeta
} from '../../game/services/crystal-wallet-service.js';

const DEBUG_CRYSTAL_GRANT = 100;

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

  router.post('/crystals/debug-add-100', (req, res) => {
    if (!canUseDebugSuperAttack(req.user)) {
      return res.status(403).json({ ok: false, error: 'debug_crystals_forbidden' });
    }

    const meta = req.gameManager.getMeta();
    ensureCrystalMeta(meta);
    meta.crystals += DEBUG_CRYSTAL_GRANT;
    req.saveGame();
    res.json({ ok: true, amount: DEBUG_CRYSTAL_GRANT, balance: meta.crystals });
  });

  return router;
}
