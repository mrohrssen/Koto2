import { test, expect } from '@playwright/test';

/**
 * Subway harness: plays a full Kanji Kombat session while the network
 * drops for 60-75s windows, the acceptance gate for the session-log-sync
 * rebuild (docs/superpowers/specs/2026-06-11-kanji-kombat-session-log-sync-design.md).
 *
 * Run with: npm run test:subway   (seeds devtester first)
 *
 * EXPECTED RED before the rebuild lands: quiz answers block on per-turn
 * server verification (`kanjiKombatQueuedVerificationPending` in
 * public/js/ui/combat-loop.js), so taps during the offline window are
 * silently ignored after the first unverified answer.
 *
 * NOTE on server cache: `npm run seed:dev-user` clears kanjiKombatDaily
 * from the devtester SRS file on disk. If the Express server is already
 * running it retains the old in-memory cache; restart the server after
 * seeding to guarantee a fresh daily state across repeated harness runs
 * on the same calendar day.
 */

const ACK_TIMEOUT_MS = 250;

/**
 * CSS selector for a fresh (actionable, non-feedback) quiz choice button.
 * Passed explicitly into waitForFunction to avoid closure-serialisation issues.
 */
const FRESH_CHOICE_SEL =
  '.kanji-kombat-choice:enabled:not(.kanji-kombat-choice--correct-selected):not(.kanji-kombat-choice--wrong-selected)';

/**
 * Returns true when there is at least one actionable prompt in the DOM
 * (a fresh quiz button, an intro button, or a completion button).
 * Designed to be serialised by waitForFunction; receives the selector string
 * as its only argument.
 *
 * @param {string} freshSel - FRESH_CHOICE_SEL value passed from the harness.
 */
const isActionablePromptVisible = (freshSel) => {
  const fresh = document.querySelector(freshSel);
  const intro = document.querySelector('.kanji-kombat-intro-action');
  const complete = document.querySelector('.kanji-kombat-completion-action');
  return !!(fresh || intro || complete);
};

/**
 * Waits for an actionable prompt to appear on the page.
 * @param {import('@playwright/test').Page} page
 * @param {{ timeout?: number }} [opts]
 */
const waitForActionablePrompt = (page, opts = {}) =>
  page.waitForFunction(isActionablePromptVisible, FRESH_CHOICE_SEL, {
    timeout: 30_000,
    ...opts,
  });

const OFFLINE_WINDOWS = [
  { afterInteraction: 4, durationMs: 60_000 },
  { afterInteraction: 12, durationMs: 75_000 },
];
const MAX_INTERACTIONS = 120;

test.describe.serial('Kanji Kombat subway session', () => {
  let page;
  let context;

  test.beforeAll(async ({ browser, request }) => {
    const loginRes = await request.post('/api/auth/login', {
      data: { username: 'devtester', password: 'test1234' },
    });
    expect(loginRes.ok(), 'devtester login should succeed').toBeTruthy();
    const loginBody = await loginRes.json();
    const token = loginBody.token;
    expect(token, 'login response must include token').toBeTruthy();

    context = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 3,
    });
    page = await context.newPage();
    await page.addInitScript(authToken => {
      localStorage.setItem('authToken', authToken);
    }, token);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test.afterAll(async () => {
    await context?.close();
  });

  test('completes a full session through two offline windows', async () => {
    test.setTimeout(600_000);

    // --- Start a Kanji Kombat run via API from inside the page ---
    const start = await page.evaluate(async () => {
      const token = localStorage.getItem('authToken');
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      // Fetch game state to get a creature ID from the devtester collection.
      const stateRes = await fetch('/api/game/state', { headers });
      const state = await stateRes.json();
      const creatureId = state?.meta?.creatureCollection?.[0];
      if (!creatureId) return { error: 'no creature in collection', status: stateRes.status };

      const startRes = await fetch('/api/game/kanji-kombat/start', {
        method: 'POST',
        headers,
        body: JSON.stringify({ creatureId }),
      });
      const startBody = await startRes.json().catch(() => null);

      // Submit onboarding if required (fresh devtester always needs it).
      const needsOnboarding = startBody?.onboardingPending === true
        || startBody?.state?.run?.kanjiKombat?.onboardingPending === true;
      if (needsOnboarding) {
        await fetch('/api/game/kanji-kombat/onboarding', {
          method: 'POST',
          headers,
          body: JSON.stringify({ knowsHiragana: false, knowsKatakana: false }),
        });
      }
      return { status: startRes.status, onboardingHandled: needsOnboarding };
    });

    expect(
      start.error,
      `KK start setup error: ${start.error}`,
    ).toBeUndefined();
    expect(start.status, 'KK start should return 200').toBe(200);

    // Reload so the frontend picks up the kanjiKombat run state.
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Wait until the action area has KK buttons rendered (fresh quiz buttons only).
    // The combat loop initialises asynchronously after load; allow 30s.
    await waitForActionablePrompt(page);

    // --- Main interaction loop ---
    const seenPromptIds = new Set();
    let interactions = 0;
    let quizAnswers = 0;
    let introChoices = 0;
    let offlineIndex = 0;
    let sessionDone = false;
    let restoreAt = null; // ms timestamp when we should go back online

    /**
     * Detect the current actionable prompt type and a stable fingerprint for
     * deduplication from the DOM.
     *
     * For quiz prompts the fingerprint is the sorted join of all data-answer-id
     * attributes — these are unique per quiz instance even for repeated cards.
     * For intro prompts the fingerprint is the prompt text (a new card each time).
     * Only returns a quiz when a FRESH (non-feedback-marked) button is present.
     */
    const headPrompt = async () => {
      return page.evaluate(freshSel => {
        if (document.querySelector('.kanji-kombat-completion-action')) {
          return { kind: 'completePrompt', promptId: null };
        }
        if (document.querySelector('.kanji-kombat-intro-action')) {
          const text = document.querySelector('.kanji-kombat-prompt')?.textContent?.trim() || '';
          return { kind: 'intro', promptId: `intro:${text}` };
        }
        const freshButtons = [...document.querySelectorAll(freshSel)];
        if (freshButtons.length > 0) {
          // Fingerprint: sorted answer IDs unique to this quiz instantiation.
          const ids = freshButtons.map(b => b.dataset.answerId || '').sort().join('|');
          return { kind: 'quiz', promptId: `quiz:${ids}` };
        }
        return null;
      }, FRESH_CHOICE_SEL);
    };

    while (!sessionDone && interactions < MAX_INTERACTIONS) {
      // Restore online if the window has elapsed.
      if (restoreAt !== null && Date.now() >= restoreAt) {
        await context.setOffline(false);
        restoreAt = null;
      }

      // Trigger the next scripted offline window.
      const window_ = OFFLINE_WINDOWS[offlineIndex];
      if (window_ && interactions === window_.afterInteraction) {
        await context.setOffline(true);
        restoreAt = Date.now() + window_.durationMs;
        offlineIndex += 1;
      }

      // Wait for an actionable prompt. For quiz prompts, require a fresh
      // (enabled, non-feedback) button so we don't mistake leftover disabled
      // buttons for a new prompt.
      await waitForActionablePrompt(page).catch(() => {
        throw new Error(
          `stalled prompt: no actionable prompt rendered within 30s `
          + `(interaction ${interactions}, quizAnswers=${quizAnswers}, introChoices=${introChoices}, `
          + `offline=${restoreAt !== null}) — the UI stopped offering taps`,
        );
      });

      const prompt = await headPrompt();
      if (!prompt) {
        // DOM had something a moment ago but cleared - soft pause or playback.
        const hasContent = await page.evaluate(() => {
          const area = document.getElementById('action-area');
          const narration = document.querySelector('.narration-box, .narration');
          return (area && area.children.length > 0) || !!narration;
        });
        expect(hasContent, 'blank action area with no pause copy').toBeTruthy();
        await page.waitForTimeout(1000);
        continue;
      }

      // Deduplication: the same prompt must not be offered twice.
      // Each prompt (intro card or quiz instantiation) is unique within a session.
      // A duplicate means an already-answered prompt was rendered again (client
      // rollback or server replay) — the bug under test.
      if (prompt.promptId && prompt.kind !== 'completePrompt') {
        expect(
          seenPromptIds,
          `prompt "${prompt.promptId}" (kind=${prompt.kind}) rendered twice — an already-answered prompt was offered again`,
        ).not.toContain(prompt.promptId);
        seenPromptIds.add(prompt.promptId);
      }

      if (prompt.kind === 'quiz') {
        // Click the first FRESH (non-feedback, enabled) choice button.
        // Pin the clicked button by its answer ID — the :not(--selected) locator
        // would drift to a different button once the feedback class is applied.
        const button = page.locator(FRESH_CHOICE_SEL).first();
        const clickedAnswerId = await button.getAttribute('data-answer-id');
        await button.click();
        // Acknowledgment: feedback class must appear within 250 ms.
        // This fires synchronously from beforeSubmit before any network call,
        // so 250ms is achievable even on a slow machine.
        await expect(
          page.locator(`.kanji-kombat-choice[data-answer-id="${clickedAnswerId}"]`),
        ).toHaveClass(
          /kanji-kombat-choice--correct-selected|kanji-kombat-choice--wrong-selected/,
          { timeout: ACK_TIMEOUT_MS },
        );
        quizAnswers += 1;
        // Wait for combat playback to finish and the NEXT prompt to render.
        // The next prompt replaces #action-area content entirely, so wait for
        // an enabled .kanji-kombat-choice that does NOT have a feedback class.
        await waitForActionablePrompt(page).catch(() => {
          throw new Error(
            `stalled prompt: next prompt never rendered within 30s of quiz answer #${quizAnswers} `
            + `(interaction ${interactions}, offline=${restoreAt !== null}) — `
            + `taps block on per-turn server verification`,
          );
        });
      } else if (prompt.kind === 'intro') {
        const introTextBefore = await page.evaluate(
          () => document.querySelector('.kanji-kombat-prompt')?.textContent?.trim() || '',
        );
        await page.locator('.kanji-kombat-intro-action[data-choice="unknown"]').click();
        // Acknowledgment: the action area must visibly advance within 250 ms —
        // this intro card must be replaced (next prompt, quiz, or completion).
        // Mere button-disabling does not count as a change.
        await page.waitForFunction(
          prevText => {
            const intro = document.querySelector('.kanji-kombat-intro-action');
            if (!intro) return true; // intro replaced by quiz/completion/next prompt
            const text = document.querySelector('.kanji-kombat-prompt')?.textContent?.trim() || '';
            return text !== prevText; // a different intro card rendered
          },
          introTextBefore,
          { timeout: ACK_TIMEOUT_MS },
        ).catch(() => {
          throw new Error(
            `intro tap not acknowledged within ${ACK_TIMEOUT_MS}ms — action area still shows the same intro card ("${introTextBefore}")`,
          );
        });
        introChoices += 1;
      } else if (prompt.kind === 'completePrompt') {
        // Ensure we're online before ending so the final report can confirm.
        if (restoreAt !== null) {
          const remaining = restoreAt - Date.now();
          if (remaining > 0) await page.waitForTimeout(remaining);
          await context.setOffline(false);
          restoreAt = null;
        }
        await page.locator('.kanji-kombat-completion-action[data-keep-going="false"]').click();
        sessionDone = true;
        break;
      }

      interactions += 1;
    }

    expect(sessionDone, 'session never reached the completion prompt').toBeTruthy();

    // Final report must arrive once we're online.
    // Poll the API because the client-side state object is not on window.
    await page.waitForFunction(
      async () => {
        try {
          const token = localStorage.getItem('authToken');
          const res = await fetch('/api/game/state', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const state = await res.json();
          const report = state?.run?.kanjiKombat?.report;
          return !!report?.completedDaily || typeof report?.cardsReviewed === 'number';
        } catch {
          return false;
        }
      },
      { timeout: 60_000, polling: 1000 },
    );

    // Fetch final server truth.
    const serverReport = await page.evaluate(async () => {
      const token = localStorage.getItem('authToken');
      const res = await fetch('/api/game/state', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const state = await res.json();
      return state?.run?.kanjiKombat?.report || null;
    });

    expect(serverReport, 'server must have a final KK report').toBeTruthy();
    expect(
      serverReport.cardsReviewed,
      `server.cardsReviewed (${serverReport.cardsReviewed}) must equal quizAnswers (${quizAnswers})`,
    ).toBe(quizAnswers);
    expect(
      serverReport.newCardsIntroduced,
      `server.newCardsIntroduced (${serverReport.newCardsIntroduced}) must equal introChoices (${introChoices})`,
    ).toBe(introChoices);
  });
});
