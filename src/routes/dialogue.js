import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';
import { chat } from '../ai-providers.js';
import { DialogueTranslationCache } from '../dialogue-translation/cache.js';
import {
  TRANSLATION_UNAVAILABLE,
  buildDialogueTranslationConfig,
  translateDialogueText
} from '../dialogue-translation/service.js';

export default function createDialogueRoutes({
  dialogueTranslationCache = new DialogueTranslationCache(),
  dialogueTranslationChatFn = chat,
  getDialogueTranslationConfig = buildDialogueTranslationConfig
} = {}) {
  const router = Router();

  router.use(requireAuth);

  router.post('/translate', async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ ok: false, error: TRANSLATION_UNAVAILABLE });
    }

    const result = await translateDialogueText({
      text,
      entities: req.body?.entities,
      cache: dialogueTranslationCache,
      chatFn: dialogueTranslationChatFn,
      config: getDialogueTranslationConfig()
    });

    if (!result.ok) {
      return res.status(503).json(result);
    }

    return res.json(result);
  });

  return router;
}
