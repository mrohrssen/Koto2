import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { getUserKeys } from '../auth/users.js';
import { chat } from '../ai-providers.js';
import { DialogueTranslationCache } from '../dialogue-translation/cache.js';
import {
  TRANSLATION_UNAVAILABLE,
  buildDialogueTranslationConfig,
  translateDialogueText
} from '../dialogue-translation/service.js';
import { DialogueLearnCache } from '../dialogue-learn/cache.js';
import {
  buildDialogueLearnConfig,
  generateDialogueLearnLesson
} from '../dialogue-learn/service.js';
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
  dialogueLearnCache = new DialogueLearnCache(),
  dialogueLearnChatFn = chat,
  getDialogueLearnConfig = buildDialogueLearnConfig,
  getManager,
  saveManager
} = {}) {
  const router = Router();

  router.use(requireAuth);

  function hasAiDataSharingConsent(req) {
    if (process.env.SKIP_AUTH === 'true') return true;
    return getUserKeys(req.user.id).aiDataSharingConsent === true;
  }

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

        const config = getDialogueTranslationConfig();
        if (config && !hasAiDataSharingConsent(req)) {
          return { status: 403, body: { ok: false, error: 'ai_data_sharing_consent_required' } };
        }

        const result = await translateDialogueText({
          text,
          entities: req.body?.entities,
          cache: dialogueTranslationCache,
          chatFn: dialogueTranslationChatFn,
          config
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

  router.post('/learn', async (req, res) => {
    const text = String(req.body?.text || '').trim();
    const tokens = Array.isArray(req.body?.tokens) ? req.body.tokens : [];
    if (!text) {
      return res.status(400).json({ ok: false, error: 'learn_lesson_invalid_request', reason: 'missing_text' });
    }
    if (tokens.length === 0) {
      return res.status(400).json({ ok: false, error: 'learn_lesson_invalid_request', reason: 'missing_tokens' });
    }

    const idempotencyKey = String(req.body?.idempotencyKey || '').trim();
    if (!idempotencyKey) {
      return res.status(400).json({ ok: false, error: 'missing_idempotency_key' });
    }

    const gameManager = getManager(req.user.id);
    const meta = gameManager.getMeta();
    const preparedSpend = prepareCrystalSpend(meta, {
      reason: CRYSTAL_REASONS.learn,
      key: idempotencyKey,
      cost: CRYSTAL_COSTS.learn
    });
    if (!preparedSpend.ok) {
      return res.status(402).json(preparedSpend);
    }

    const response = await withCrystalActionInFlight({
      userId: req.user.id,
      reason: CRYSTAL_REASONS.learn,
      key: idempotencyKey,
      action: async () => {
        const latestSpend = prepareCrystalSpend(meta, {
          reason: CRYSTAL_REASONS.learn,
          key: idempotencyKey,
          cost: CRYSTAL_COSTS.learn
        });

        const config = getDialogueLearnConfig();
        if (config && !hasAiDataSharingConsent(req)) {
          return { status: 403, body: { ok: false, error: 'ai_data_sharing_consent_required' } };
        }

        const result = await generateDialogueLearnLesson({
          text,
          tokens,
          entities: req.body?.entities,
          cache: dialogueLearnCache,
          chatFn: dialogueLearnChatFn,
          config
        });

        if (!result.ok) {
          return { status: 503, body: result };
        }

        const spendResult = latestSpend.crystals?.alreadyCharged
          ? latestSpend
          : recordCrystalSpend(meta, {
              reason: CRYSTAL_REASONS.learn,
              key: idempotencyKey,
              cost: CRYSTAL_COSTS.learn
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
