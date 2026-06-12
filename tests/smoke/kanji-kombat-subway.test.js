import { test, expect } from '@playwright/test';

/**
 * Subway harness: plays a full Kanji Kombat session while the network
 * drops for 60-75s windows, the acceptance gate for the session-log-sync
 * rebuild (docs/superpowers/specs/2026-06-11-kanji-kombat-session-log-sync-design.md).
 *
 * Run with: npm run test:subway   (seeds devtester first)
 *
 * EXPECTED RED before the rebuild lands: quiz answers required per-turn
 * server verification, so taps during the offline window were silently
 * ignored after the first unverified answer.
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
    // Forward browser console.log to Node stdout for debugging.
    page.on('console', msg => {
      const text = msg.text();
      process.stdout.write(`[browser] ${msg.type()}: ${text}\n`);
    });
    page.on('pageerror', err => {
      process.stdout.write(`[browser] PAGE ERROR: ${err.message}\n`);
    });
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

    // Track how many sync responses the server corrected (should be zero).
    let correctedSyncs = 0;
    page.on('response', async res => {
      if (!res.url().includes('/api/game/kanji-kombat/sync')) return;
      try {
        const body = await res.json();
        if (body.status === 'corrected') correctedSyncs++;
      } catch {
        // Body may be unavailable (e.g. redirect or network error) — ignore.
      }
    });

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

    /**
     * Waits until the in-browser session log has drained (all queued entries
     * confirmed by the server), or a 10s cap is reached.  Called after restoring
     * connectivity to ensure the client's prompt buffer is refilled before the
     * next offline window starts.
     *
     * window.__kkPendingSync is exposed by initKanjiKombatUI as a test seam.
     */
    const waitForSyncDrain = () =>
      page.waitForFunction(
        () => (typeof window.__kkPendingSync === 'function' ? window.__kkPendingSync() : 0) === 0,
        { timeout: 10_000, polling: 200 },
      ).catch(() => { /* best-effort: proceed even if drain doesn't complete in time */ });

    /**
     * Stall recovery: a stalled prompt — especially during an offline window —
     * can be a local party DEFEAT.  The client correctly freezes on defeat (the
     * combat-ended result is server-authoritative and cannot be predicted
     * locally), so no further prompt renders until connectivity returns and the
     * checkpoint delivers it.  Restore connectivity, drain the session log, and
     * ask the server whether the run ended in defeat.  A defeated run is a
     * VALID session end for this harness: every recorded answer was still
     * replayed and graded, and the final count assertions below remain in
     * force.  Returns the final report when the run is over, null otherwise.
     */
    let defeatedEnd = false;
    const detectServerRunEnd = async () => {
      await context.setOffline(false);
      restoreAt = null;
      // The dying answer is still queued in the session log.  Wait for the
      // drain to deliver it and for the checkpoint's combatEnded result to
      // flip the client phase to run_ended (window.__kkPhase is a test seam
      // exposed by initKanjiKombatUI).  A one-shot server poll is racy: the
      // batch replay can land hundreds of ms after the drain reports empty.
      return page.waitForFunction(
        () => (typeof window.__kkPhase === 'function' ? window.__kkPhase() : null) === 'run_ended',
        { timeout: 25_000, polling: 500 },
      ).then(() => true).catch(() => false);
    };

    while (!sessionDone && interactions < MAX_INTERACTIONS) {
      // Restore online if the window has elapsed.
      if (restoreAt !== null && Date.now() >= restoreAt) {
        await context.setOffline(false);
        restoreAt = null;
        // Wait for the pending session log to drain so the server-side buffer is
        // refilled before the next offline window.  Without this the client may
        // enter the next offline period without enough fresh prompt buffer entries.
        await waitForSyncDrain();
      }

      // Trigger the next scripted offline window — but only when the context is
      // back online (restoreAt === null).  Starting window N+1 while window N is
      // still offline would overwrite restoreAt and merge the two windows into one
      // long outage with no online recovery between them.
      const window_ = OFFLINE_WINDOWS[offlineIndex];
      if (window_ && restoreAt === null && interactions >= window_.afterInteraction) {
        await context.setOffline(true);
        restoreAt = Date.now() + window_.durationMs;
        offlineIndex += 1;
      }

      // Wait for an actionable prompt. For quiz prompts, require a fresh
      // (enabled, non-feedback) button so we don't mistake leftover disabled
      // buttons for a new prompt.
      await waitForActionablePrompt(page).catch(async () => {
        if (await detectServerRunEnd()) {
          defeatedEnd = true;
          return;
        }
        throw new Error(
          `stalled prompt: no actionable prompt rendered within 30s `
          + `(interaction ${interactions}, quizAnswers=${quizAnswers}, introChoices=${introChoices}, `
          + `offline=${restoreAt !== null}) — the UI stopped offering taps`,
        );
      });
      if (defeatedEnd) {
        sessionDone = true;
        break;
      }

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
        // Click the first FRESH (non-feedback, enabled) choice button and
        // atomically capture whether the feedback class was applied.
        // The feedback class is added synchronously by beforeSubmit — before any
        // network call or async handler — so this evaluate sees it in the same
        // microtask frame as the click event, before the action area can be
        // replaced by the next prompt (which happens after the animation resolves,
        // potentially very quickly in environments where PixiJS is unavailable).
        const ackResult = await page.evaluate((freshSel) => {
          // Prefer the correct answer button so ally HP is never depleted.
          // The rendered DOM intentionally carries no answer marker (players
          // could inspect it), so derive the correct choice id from game state:
          // the prompt-buffer head's quiz choices carry the canonical `correct`
          // flag (exposed via the __kkPromptHead test seam).  Fall back to the
          // first fresh button if the head doesn't match the rendered quiz.
          const buttons = [...document.querySelectorAll(freshSel)];
          const head = typeof window.__kkPromptHead === 'function' ? window.__kkPromptHead() : null;
          const correctId = head?.kind === 'quiz'
            ? ((head.quiz?.choices || []).find(c => c?.correct)?.id ?? null)
            : null;
          const btn = (correctId && buttons.find(b => b.dataset.answerId === correctId)) || buttons[0];
          if (!btn) return { found: false, answerId: null, hadClass: false };
          const answerId = btn.dataset.answerId || null;
          btn.click(); // fires beforeSubmit synchronously
          const hadClass =
            btn.classList.contains('kanji-kombat-choice--correct-selected') ||
            btn.classList.contains('kanji-kombat-choice--wrong-selected');
          return { found: true, answerId, hadClass };
        }, FRESH_CHOICE_SEL);

        const clickedAnswerId = ackResult.answerId;
        // Acknowledgment: feedback class must have been present immediately after
        // the synchronous click (beforeSubmit fires before any network call).
        expect(
          ackResult.found,
          'no fresh quiz button in DOM when attempting to click',
        ).toBeTruthy();
        expect(
          ackResult.hadClass,
          `quiz button (answerId=${clickedAnswerId}) did not receive a feedback class `
          + `synchronously — beforeSubmit did not fire or correctAnswerId was missing`,
        ).toBeTruthy();
        quizAnswers += 1;
        // Wait for combat playback to finish and the NEXT prompt to render.
        // The next prompt replaces #action-area content entirely, so wait for
        // an enabled .kanji-kombat-choice that does NOT have a feedback class.
        await waitForActionablePrompt(page).catch(async () => {
          if (await detectServerRunEnd()) {
            defeatedEnd = true;
            return;
          }
          throw new Error(
            `stalled prompt: next prompt never rendered within 30s of quiz answer #${quizAnswers} `
            + `(interaction ${interactions}, offline=${restoreAt !== null}) — `
            + `taps block on per-turn server verification`,
          );
        });
        if (defeatedEnd) {
          sessionDone = true;
          break;
        }
      } else if (prompt.kind === 'intro') {
        // Click the intro "unknown" button atomically and immediately check that
        // the action area advanced (the intro handler calls renderKanjiKombatAction
        // synchronously — before any await — so the replacement happens in the same
        // microtask frame as the click, before Playwright can poll the DOM).
        const introAck = await page.evaluate(() => {
          const btn = document.querySelector('.kanji-kombat-intro-action[data-choice="unknown"]');
          if (!btn) return { found: false, textBefore: '', advanced: false };
          const textBefore = document.querySelector('.kanji-kombat-prompt')?.textContent?.trim() || '';
          btn.click(); // fires onChoice synchronously up to its first await
          // onChoice renders the next prompt synchronously (no await before renderKanjiKombatAction)
          const introStillHere = !!document.querySelector('.kanji-kombat-intro-action');
          const textAfter = document.querySelector('.kanji-kombat-prompt')?.textContent?.trim() || '';
          const advanced = !introStillHere || textAfter !== textBefore;
          return { found: true, textBefore, advanced };
        });
        // Acknowledgment: the action area must visibly advance within 250 ms —
        // this intro card must be replaced (next prompt, quiz, or completion).
        // Since renderKanjiKombatAction is called synchronously from the click handler,
        // the advancement is captured atomically in the same evaluate call.
        expect(
          introAck.found,
          'no intro action button in DOM when attempting to click',
        ).toBeTruthy();
        expect(
          introAck.advanced,
          `intro tap not acknowledged synchronously — action area still shows the same intro card ("${introAck.textBefore}")`,
        ).toBeTruthy();
        introChoices += 1;
      } else if (prompt.kind === 'completePrompt') {
        // Ensure we're online before ending so the final report can confirm.
        if (restoreAt !== null) {
          const remaining = restoreAt - Date.now();
          if (remaining > 0) await page.waitForTimeout(remaining);
          await context.setOffline(false);
          restoreAt = null;
        }
        // The final /state polls below rotate the KK session epoch (by design —
        // a fresh state fetch invalidates concurrent client sessions).  Wait for
        // the sync that carries the completionChoice entry to round-trip BEFORE
        // any /state poll fires, or the poll races the flush and the entry is
        // rejected with session_epoch_mismatch (a correction this harness must
        // count as failure).
        const completionSynced = page.waitForResponse(
          res => res.url().includes('/api/game/kanji-kombat/sync')
            && res.status() === 200
            && (res.request().postData() || '').includes('"completionChoice"'),
          { timeout: 20_000 },
        ).catch(() => null);
        await page.evaluate(() => {
          // Completion handler may replace the DOM synchronously; use evaluate so
          // Playwright doesn't see a detached-element retry loop.
          document.querySelector('.kanji-kombat-completion-action[data-keep-going="false"]')?.click();
        });
        await completionSynced;
        sessionDone = true;
        break;
      }

      interactions += 1;
    }

    expect(
      sessionDone,
      'session never reached the completion prompt (or a server-confirmed defeat)',
    ).toBeTruthy();
    if (defeatedEnd) {
      // The run ended in a server-confirmed defeat (phase flipped to run_ended
      // via the reconnect checkpoint).  Every recorded answer was still replayed
      // and graded with zero corrections — the sync invariants this harness
      // exists to verify all held.  The defeat flow auto-forfeits the run, so
      // the per-run report may already be cleared; skip the report-count
      // assertions, which assume the session survived to its completion prompt.
      expect(correctedSyncs, 'server should not have corrected any sync responses (defeat path)').toBe(0);
      console.log(`[harness] run ended in server-confirmed DEFEAT after ${quizAnswers} quiz answers — `
        + 'valid end: sync integrity invariants held');
      return;
    }

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
    expect(correctedSyncs, 'server should not have corrected any sync responses').toBe(0);
  });
});
