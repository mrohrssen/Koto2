import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { chat } from '../ai-providers.js';
import { DialogueTranslationCache } from '../dialogue-translation/cache.js';
import {
  TRANSLATION_UNAVAILABLE,
  buildDialogueTranslationConfig,
  translateDialogueText
} from '../dialogue-translation/service.js';
import {
  CRYSTAL_COSTS,
  CRYSTAL_REASONS,
  prepareCrystalSpend,
  recordCrystalSpend,
  withCrystalActionInFlight
} from '../game/services/crystal-wallet-service.js';

export default function createDialogueRoutes({
  dialogueTranslationCache = new DialogueTranslationCache(),
  dialogueTranslationChatFn = chat,
  getDialogueTranslationConfig = buildDialogueTranslationConfig,
  getManager,
  saveManager
} = {}) {
  const router = Router();

  router.use(requireAuth);

  router.post('/translate', async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ ok: false, error: TRANSLATION_UNAVAILABLE });
    }

    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    if (!idempotencyKey) {
      return res.status(400).json({ ok: false, error: 'missing_idempotency_key' });
    }

    const gameManager = getManager(req.user.id);
    const meta = gameManager.getMeta();
    const preparedSpend = prepareCrystalSpend(meta, {
      reason: CRYSTAL_REASONS.translate,
      key: idempotencyKey,
      cost: CRYSTAL_COSTS.translate
    });
    if (!preparedSpend.ok) {
      return res.status(402).json(preparedSpend);
    }

    const response = await withCrystalActionInFlight({
      userId: req.user.id,
      reason: CRYSTAL_REASONS.translate,
      key: idempotencyKey,
      action: async () => {
        const latestSpend = prepareCrystalSpend(meta, {
          reason: CRYSTAL_REASONS.translate,
          key: idempotencyKey,
          cost: CRYSTAL_COSTS.translate
        });

        const result = await translateDialogueText({
          text,
          entities: req.body?.entities,
          cache: dialogueTranslationCache,
          chatFn: dialogueTranslationChatFn,
          config: getDialogueTranslationConfig()
        });

        if (!result.ok) {
          return { status: 503, body: result };
        }

        const spendResult = latestSpend.crystals?.alreadyCharged
          ? latestSpend
          : recordCrystalSpend(meta, {
              reason: CRYSTAL_REASONS.translate,
              key: idempotencyKey,
              cost: CRYSTAL_COSTS.translate
            });

        if (!spendResult.ok) {
          return { status: 402, body: spendResult };
        }

        saveManager(req.user.id);
        return {
          status: 200,
          body: {
            ...result,
            crystals: spendResult.crystals
          }
        };
      }
    });

    return res.status(response.status).json(response.body);
  });

  return router;
}
