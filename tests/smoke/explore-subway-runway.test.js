import { test, expect } from '@playwright/test';

/**
 * Subway harness: plays a full regular-explore area run while the network
 * drops for 75-100s windows. This is the acceptance gate for the explore
 * subway-stability rebuild
 * (docs/superpowers/specs — explore subway stability design/plan).
 *
 * Run with:
 *   EXPLORE_SUBWAY_SMOKE=1 npx playwright test \
 *     tests/smoke/explore-subway-runway.test.js \
 *     --config tests/smoke/playwright.subway.config.js
 *
 * Add EXPLORE_SUBWAY_COMBAT=1 to additionally require fights to PROCEED while
 * offline (Stage-2 exit gate). Without it, the rooms tier soft-pauses at
 * combat doors during an outage and only fights while online.
 *
 * EXPECTED RED before Stage 1/2 land. In the ROOMS tier, every distinct
 * failure captured against current code is the deliverable of Task 1 — see
 * docs/superpowers/plans/2026-07-03-explore-subway-baseline-findings.md.
 *
 * Server/URL note: the subway Playwright config
 * (tests/smoke/playwright.subway.config.js) owns the dev server on isolated
 * ports (Vite 5199 / API 3099) via its `webServer` block and sets `baseURL`.
 * This harness therefore uses RELATIVE paths (page.request / fetch) that
 * resolve against that baseURL — it never hardcodes localhost:5173 — so it
 * cannot collide with, or accidentally test against, another session's dev
 * server on the default ports.
 */

const DEV_USER = 'devtester';
const DEV_PASS = 'test1234';
const ROOMS_TIER = process.env.EXPLORE_SUBWAY_SMOKE === '1';
const COMBAT_TIER = process.env.EXPLORE_SUBWAY_COMBAT === '1';

// devtester owns these; hi/mizu/ki is a valid 3-creature team.
const DEV_TEAM = ['hi', 'mizu', 'ki'];

const TAP_ACK_MS = 250;
const MAX_INTERACTIONS = 400;

// Two offline windows with an online recovery gap between them, mirroring the
// KK harness. Windows are keyed to ROOM PROGRESS (the "N/10" room-progress
// badge) rather than proceeds/interactions: most rooms auto-advance after their
// action (combat victory -> next room; shrine choice -> next room) so explicit
// "進む" proceeds are rare, and combat dominates the earliest interactions. Keying
// to room number guarantees the outage overlaps the flowing room-to-room path —
// the rooms-tier subject. Windows never overlap (the next arms only once back
// online).
const OFFLINE_WINDOWS = [
  { afterRoom: 2, durationMs: 75_000 },
  { afterRoom: 4, durationMs: 100_000 },
];

// Copy that must NEVER appear anywhere on the page during a subway session.
// The sanctioned soft-pause copy ("Connection is spotty...") is explicitly NOT
// in this list — it is allowed and asserted separately.
const FORBIDDEN_COPY = ['did not save', 'Invalid choice', 'Synced with server'];

// The sanctioned soft-pause copy (public/js/ui/exploration.js EXPLORE_SPOTTY_COPY).
// Rendered inside the (auto-dismissing) narration box, so we match on substring.
// Note: #narration-box is always in the DOM; only `.narration-box.visible` means
// a narration is actually showing (see domSignals).
const PAUSE_COPY = 'Connection is spotty';

/**
 * Log in as devtester and load the game with the auth token pre-seeded.
 * Mirrors the KK harness: POST /api/auth/login, stash the token in
 * localStorage via an init script, then navigate.
 */
async function login(page) {
  const loginRes = await page.request.post('/api/auth/login', {
    data: { username: DEV_USER, password: DEV_PASS },
  });
  expect(loginRes.ok(), 'devtester login should succeed').toBeTruthy();
  const loginBody = await loginRes.json();
  const token = loginBody.token;
  expect(token, 'login response must include token').toBeTruthy();

  await page.addInitScript(authToken => {
    localStorage.setItem('authToken', authToken);
  }, token);
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  return token;
}

/**
 * Client game state. Prefer the in-page test seam window.__gameState when the
 * bundle exposes it; otherwise fall back to the authoritative server state so
 * the harness keeps working even before that seam is wired. (As of the baseline
 * run the seam is not present, so this resolves to server truth.)
 */
async function gameState(page) {
  const inPage = await page.evaluate(() => (window.__gameState ?? null)).catch(() => null);
  if (inPage) return inPage;
  return serverState(page).catch(() => null);
}

/**
 * Authoritative server state via GET /api/game/state with the bearer token.
 * Throws if the fetch itself fails while online; returns null on abort/offline.
 */
async function serverState(page) {
  return page.evaluate(async () => {
    const token = localStorage.getItem('authToken');
    const res = await fetch('/api/game/state', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`GET /api/game/state failed with ${res.status}: ${JSON.stringify(body)}`);
    }
    return body;
  });
}

/**
 * Current room number (1-based) read from the room-progress badge ("N/10").
 * Works online and offline; returns 0 if the badge is not present.
 */
async function currentRoomNumber(page) {
  return page.evaluate(() => {
    const text = document.getElementById('room-progress-badge')?.textContent || '';
    const m = text.match(/(\d+)\s*\/\s*\d+/);
    return m ? parseInt(m[1], 10) : 0;
  });
}

/**
 * Drive devtester from the hub (run === null) into an active exploration run:
 * start-run -> select-area -> confirm-creatures -> initial skill pick.
 * Uses the same real endpoints as the integration game-flow helper, executed
 * from inside the page so the client picks up the run on the next reload.
 */
async function startExplorationRun(page) {
  const result = await page.evaluate(async ({ team }) => {
    const token = localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const post = async (path, body) => {
      const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
      const json = await res.json().catch(() => null);
      return { status: res.status, body: json };
    };
    const get = async (path) => {
      const res = await fetch(path, { headers });
      const json = await res.json().catch(() => null);
      return { status: res.status, body: json };
    };

    // devtester starts with 0 crystals; start-run costs 25. Claim the daily
    // login bonus (500) first so start-run is not rejected with 402.
    await post('/api/game/crystals/daily-login', {}).catch(() => null);

    const startRes = await post('/api/game/start-run', {});
    if (startRes.status !== 200) return { error: `start-run ${startRes.status}`, detail: startRes.body };

    const areaOptions = await get('/api/game/area-options');
    const areaId = areaOptions.body?.[0]?.id;
    if (!areaId) return { error: 'no area options', detail: areaOptions.body };

    const selectRes = await post('/api/game/select-area', { areaId });
    if (selectRes.status !== 200) return { error: `select-area ${selectRes.status}`, detail: selectRes.body };

    const confirmRes = await post('/api/game/confirm-creatures', { starterIds: team });
    if (confirmRes.status !== 200) return { error: `confirm-creatures ${confirmRes.status}`, detail: confirmRes.body };

    // Complete the initial party skill pick if one is offered.
    const offersRes = await post('/api/game/skill-master-offers', {});
    if (offersRes.status === 200 && offersRes.body?.offered?.length > 0) {
      const skillId = offersRes.body.offered[0].id;
      const chooseRes = await post('/api/game/skill-master-choose', { skillId });
      if (chooseRes.status !== 200) return { error: `skill-master-choose ${chooseRes.status}`, detail: chooseRes.body };
    }

    return { ok: true, areaId };
  }, { team: DEV_TEAM });

  expect(result.error, `run setup failed: ${result.error} ${JSON.stringify(result.detail || {})}`).toBeUndefined();
  expect(result.ok, 'run setup should complete').toBeTruthy();
  return result;
}

/** Derive the current room type from client/server state (currentRoom is an int index). */
function roomTypeFor(state) {
  const idx = state?.run?.currentRoom;
  if (state?.room?.type) return state.room.type;
  const prepared = state?.run?.exploreRunway?.preparedRooms;
  if (Array.isArray(prepared)) {
    const match = prepared.find(r => r?.index === idx);
    if (match?.room?.type) return match.room.type;
  }
  const rooms = state?.run?.rooms;
  if (Array.isArray(rooms) && Number.isInteger(idx) && rooms[idx]?.type) return rooms[idx].type;
  return null;
}

/**
 * Final server-vs-played reconciliation. Explicit expects against server truth.
 * The client's proceed count must be reflected by the server room cursor, and
 * the total committed actions must be at least what we played.
 */
function assertServerMatchesPlayed(server, played) {
  expect(server, 'server state must be fetchable at end of session').toBeTruthy();

  const serverRoom = server?.run?.currentRoom;
  expect(
    Number.isInteger(serverRoom),
    `server run.currentRoom should be an integer index (got ${JSON.stringify(serverRoom)})`,
  ).toBeTruthy();

  // Each accepted proceed advances the server cursor by one room. The server
  // cursor must have caught up to at least the number of proceeds we played.
  expect(
    serverRoom,
    `server room cursor (${serverRoom}) should be >= played proceeds (${played.proceeds})`,
  ).toBeGreaterThanOrEqual(played.proceeds);

  // Support-room interactions (shrine/dealer/friendlyNpc/minigame-decline) each
  // complete a room and advance the run. Combined with combat victories and
  // explicit proceeds, every room-advancing action we played should be reflected
  // in the server cursor: if we performed ANY room-advancing action, the server
  // must have moved past room 0. (A per-room `interacted`-flag audit is the
  // stronger check once the runway/sync path accepts support actions online — see
  // finding F1; today the harness fails before reaching here.)
  const roomAdvancingActions = played.proceeds + played.supportActions + played.combatStarts;
  if (roomAdvancingActions > 0) {
    expect(
      serverRoom,
      `server room cursor (${serverRoom}) should have advanced past room 0 after `
      + `${roomAdvancingActions} room-advancing actions `
      + `(proceeds=${played.proceeds}, support=${played.supportActions}, combats=${played.combatStarts})`,
    ).toBeGreaterThan(0);
  }

  // If the run reached area completion, the server must report it.
  if (played.reachedEnd) {
    const phase = server?.phase;
    expect(
      phase === 'area_complete' || phase === 'run_complete' || server?.run?.areaCleared === true,
      `run reached end locally but server phase is "${phase}"`,
    ).toBeTruthy();
  }
}

test.describe('explore subway full session', () => {
  test('full area run survives scripted offline windows', async ({ page, context }) => {
    test.skip(!ROOMS_TIER && !COMBAT_TIER, 'on-demand: EXPLORE_SUBWAY_SMOKE=1 [EXPLORE_SUBWAY_COMBAT=1]');
    test.setTimeout(600_000);

    // Surface browser console + page errors to Node stdout for triage.
    page.on('console', msg => process.stdout.write(`[browser] ${msg.type()}: ${msg.text()}\n`));
    page.on('pageerror', err => process.stdout.write(`[browser] PAGE ERROR: ${err.message}\n`));

    await login(page);
    await startExplorationRun(page);

    // Reload so the client adopts the freshly-created run + exploreRunway.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await page.addStyleTag({ path: 'public/dev-safe-area.css' }).catch(() => {});

    // Wait until the client has an exploration runway with prepared rooms.
    await expect
      .poll(async () => {
        const s = await gameState(page);
        return s?.run?.exploreRunway?.preparedRooms?.length || 0;
      }, { timeout: 20_000 })
      .toBeGreaterThan(0);

    // --- offline window machinery (KK harness pattern) ---
    let offline = false;
    let correctedSyncs = 0;
    page.on('response', async res => {
      if (!res.url().includes('/api/game/explore/sync')) return;
      const body = await res.json().catch(() => null);
      if (body?.status === 'corrected') correctedSyncs += 1;
    });
    async function goOffline() {
      offline = true;
      await context.route('**/api/**', route => route.abort('failed'));
    }
    async function goOnline() {
      offline = false;
      await context.unroute('**/api/**').catch(() => {});
    }

    // --- action ledger for the final server comparison ---
    const played = {
      proceeds: 0,
      supportActions: 0,
      combatStarts: 0,
      combatTurns: 0,
      reachedEnd: false,
    };

    /**
     * Tap a locator and assert the tap is acknowledged within TAP_ACK_MS —
     * either #action-area mutates, or a room transition begins. A tap that
     * neither changes the action area nor advances within the budget is a
     * responsiveness failure (the core subway invariant).
     */
    async function tapAndAssertAck(locator) {
      const before = await page.locator('#action-area').innerHTML().catch(() => '');
      await locator.click();
      await expect
        .poll(async () => {
          const now = await page.locator('#action-area').innerHTML().catch(() => before);
          return now !== before;
        }, { timeout: TAP_ACK_MS + 200 })
        .toBeTruthy();
    }

    /**
     * Advance the split-attack-card. Its continue listener is bound to
     * #action-area and only accepts a tap inside the SAC or directly on
     * #action-area (with the SAC as first child) — a .scene-area tap is ignored.
     * Click the SAC element itself so card.contains(target) is satisfied.
     */
    async function tapContinueSac(pg) {
      const sac = pg.locator('.split-attack-card').first();
      if (await sac.count()) {
        await sac.click({ force: true }).catch(() => {});
      }
    }

    /**
     * Snapshot every decision-relevant DOM signal in ONE evaluate. Purely
     * DOM-based so it works offline (server /state is unreachable while the API
     * is routed to abort, and there is no in-page __gameState seam to fall back
     * on). `phase`/`roomType` from gameState are only best-effort hints used
     * when online.
     */
    async function domSignals() {
      return page.evaluate(() => {
        const q = sel => document.querySelector(sel);
        const bodyText = document.body?.innerText || '';
        const actionArea = document.getElementById('action-area');
        const buttons = actionArea ? [...actionArea.querySelectorAll('button')] : [];
        const labels = buttons.map(b => (b.innerText || b.textContent || '').trim());
        const heading = (q('.ui-choice-heading')?.textContent || '').trim();
        const activeTakeover = q('.takeover.active');
        return {
          bodyText,
          takeoverActive: !!activeTakeover,
          takeoverId: activeTakeover?.id || null,
          narrationVisible: !!q('.narration-box.visible'),
          npcDialogueCard: !!q('.npc-dialogue-card'),
          fightButton: labels.some(l => l.includes('戦う')),
          moveCells: document.querySelectorAll('.move-cell:not(.disabled)').length,
          splitAttackCard: !!q('.split-attack-card'),
          // Combat move-target picker: renderChoices with the "Choose target"
          // heading and .ui-choice target cards (distinct from support rooms).
          chooseTarget: heading === 'Choose target',
          choiceCards: document.querySelectorAll('#action-area .ui-choice').length,
          heading,
          proceedButton: labels.some(l => l.includes('進む')),
          actionButtonCount: buttons.length,
          actionLabels: labels,
          actionAreaEmpty: !actionArea || actionArea.innerHTML.trim() === '',
        };
      });
    }

    async function driveOneInteraction() {
      // Best-effort state hints (null while offline — never relied on for control).
      const state = offline ? null : await gameState(page);
      const phase = state?.phase;
      const roomType = roomTypeFor(state);
      const d = await domSignals();

      // 1) Sanctioned soft pause? Assert it is legitimate (we ARE offline) and
      // wait for it to lift. Checked BEFORE narration dismissal because the pause
      // is itself rendered in the narration box — we must not click it away.
      const pauseVisible = d.bodyText.includes(PAUSE_COPY);
      if (pauseVisible) {
        expect(offline, `soft pause "${PAUSE_COPY}" shown while ONLINE`).toBeTruthy();
        await page.waitForTimeout(1000);
        return 'paused';
      }

      // 1.5) A takeover overlay (speed-review room, settings, etc.) is active
      // and covers the action area. Try to close it (its × button); a speed-
      // review ROOM takeover locks close until reviews are committed — that is a
      // minigame this harness does not model (out of scope), so fail with a
      // precise message rather than looping or false-firing the blank-area check.
      if (d.takeoverActive) {
        const closeBtn = page.locator(`#${d.takeoverId} .takeover-close`).first();
        const closable = (await closeBtn.count())
          && !(await closeBtn.getAttribute('class').catch(() => '') || '').includes('speed-review-close-locked');
        if (closable) {
          await closeBtn.click().catch(() => {});
          await page.waitForTimeout(500);
          return 'takeover-close';
        }
        expect(
          false,
          `active takeover "${d.takeoverId}" cannot be closed — an unmodeled takeover room `
          + `(likely a speed-review room whose close is locked until completion); `
          + `driving this minigame is out of the harness's scope (offline=${offline})`,
        ).toBeTruthy();
        return 'takeover-blocked';
      }

      // 2) Combat (DOM-detected so it holds offline): fight door, move cells, a
      // move-target picker, or a split-attack-card in flight. Current creature
      // combat is: tap "⚔️ 戦う" to enter -> tap a .move-cell -> pick a target
      // (.ui-choice under the "Choose target" heading) -> SAC ("Attack result")
      // -> tap the scene to continue. (The legacy dual-flash vocab card is gone.)
      const inCombatDom = d.fightButton || d.moveCells > 0 || d.splitAttackCard || d.chooseTarget;
      if (inCombatDom) {
        // Rooms tier: combat cannot proceed while offline (per-turn server
        // verification), so hold here until connectivity returns.
        if (offline && !COMBAT_TIER) { await page.waitForTimeout(1000); return 'combat-offline-wait'; }
        if (d.fightButton) {
          await tapAndAssertAck(page.locator('button:has-text("戦う")').first());
          played.combatStarts += 1;
          return 'combat-start';
        }
        // Move-target picker takes priority over move-cells: after selecting a
        // move the picker replaces the grid; tap the FIRST target card (never the
        // "Back" ui-btn, which cancels the move and loops forever).
        if (d.chooseTarget && d.choiceCards > 0) {
          await page.locator('.ui-choice').first().click();
          played.combatTurns += 1;
          await page.waitForTimeout(300);
          return 'combat-target';
        }
        if (d.moveCells > 0) {
          await page.locator('.move-cell:not(.disabled)').first().click();
          await page.waitForTimeout(300);
          return 'combat-move';
        }
        // SAC in flight: the continue listener is bound to #action-area and only
        // fires when the tap lands on #action-area (with the SAC as its first
        // child) or inside the SAC — NOT on .scene-area. Tap the SAC itself.
        if (d.splitAttackCard) {
          await tapContinueSac(page);
          await page.waitForTimeout(400);
          return 'combat-sac';
        }
        // Animation/verification in flight: yield and re-evaluate.
        await page.waitForTimeout(500);
        return 'combat-anim';
      }

      // 3) NPC dialogue card in an action area with NO actionable control yet
      // (shrine/dealer/friendlyNpc/minigame intro speech) -> dismiss by clicking
      // OUTSIDE the box, then re-loop so the room's choices render.
      if (d.npcDialogueCard && d.actionButtonCount === 0 && d.choiceCards === 0) {
        await page.evaluate(() => document.querySelector('.scene-area')?.click());
        await page.waitForTimeout(500);
        return 'dialogue-dismiss';
      }

      // 4) Plain narration box (non-pause) -> dismiss by clicking OUTSIDE.
      if (d.narrationVisible && d.actionButtonCount === 0 && d.choiceCards === 0) {
        await page.evaluate(() => document.querySelector('.scene-area')?.click());
        await page.waitForTimeout(600);
        return 'narration';
      }

      // 5) Proceed button present -> the room is cleared; proceed through the
      // runway. This is the subway-critical tap: it must be acknowledged fast
      // even offline (queued into the session), which tapAndAssertAck checks.
      if (d.proceedButton) {
        await tapAndAssertAck(page.locator('#action-area button:has-text("進む")').first());
        played.proceeds += 1;
        return 'proceed';
      }

      // 6) Support-room choice cards (shrine blessing, dealer, friendlyNpc offer,
      // or a minigame intro's play/decline). Tap the FIRST .ui-choice: for shrine
      // that is heal-all (applies + advances, no sub-list); for others it is a
      // valid choice that advances the room. Keeps focus on the runway/sync
      // invariant rather than minigame gameplay (out of scope).
      if (d.choiceCards > 0) {
        if (offline && !COMBAT_TIER) { await page.waitForTimeout(1000); return 'choice-offline-wait'; }
        await page.locator('#action-area .ui-choice').first().click();
        await page.waitForTimeout(700);
        played.supportActions += 1;
        return 'choice';
      }

      // 7) Any other action button (e.g. a minigame's play/skip ui-btn, or a
      // dealer "leave"): tap the LAST one, which is the decline/skip/leave
      // affordance that advances without playing the minigame.
      if (d.actionButtonCount > 0) {
        if (offline && !COMBAT_TIER) { await page.waitForTimeout(1000); return 'button-offline-wait'; }
        const buttons = page.locator('#action-area button');
        const n = await buttons.count();
        await buttons.nth(n - 1).click();
        await page.waitForTimeout(600);
        played.supportActions += 1;
        return 'button-skip';
      }

      // 8) No tap available and no pause copy. If the action area has content
      // (SAC/dialogue not caught above), it is not blank — yield and re-evaluate.
      if (!d.actionAreaEmpty) {
        await page.waitForTimeout(500);
        return 'busy-no-button';
      }

      // A momentarily empty action area is normal during transitions (e.g. the
      // victory -> post-combat-shop/proceed handoff tears combat down before the
      // next control renders). Poll a grace window for ANY actionable signal
      // before concluding it is stuck. A PERSISTENTLY empty action area with no
      // soft-pause copy is the reportable subway bug: offline the client must
      // show the pause, and online it must render the next control — never
      // nothing. The grace window mirrors the KK harness's stalled-prompt wait.
      const recovered = await page.waitForFunction(() => {
        const aa = document.getElementById('action-area');
        const hasControl = aa && (
          aa.innerHTML.trim() !== ''
          || document.querySelector('.split-attack-card')
          || document.querySelector('.move-cell')
        );
        const pause = (document.body?.innerText || '').includes('Connection is spotty');
        const takeover = !!document.querySelector('.takeover.active');
        const narration = !!document.querySelector('.narration-box.visible');
        const dialogue = !!document.querySelector('.npc-dialogue-card');
        return hasControl || pause || takeover || narration || dialogue;
      }, { timeout: 8000, polling: 400 }).then(() => true).catch(() => false);

      if (recovered) return 'transition';

      expect(
        false,
        `blank action area with no pause copy for >8s `
        + `(offline=${offline}, phase=${phase}, roomType=${roomType})`,
      ).toBeTruthy();
      return 'waiting';
    }

    // --- main loop ---
    let interactions = 0;
    let windowIndex = 0;
    let restoreAt = null;
    while (interactions < MAX_INTERACTIONS) {
      // Restore online if the current window has elapsed (do this BEFORE arming
      // the next window so windows never merge into one long outage).
      if (restoreAt !== null && Date.now() >= restoreAt) {
        await goOnline();
        restoreAt = null;
        // Let the reconnect drain refill the client buffer before the next window.
        await page.waitForTimeout(2000);
      }

      // Arm the next scripted offline window only while online, once we have
      // reached the target room number (read from the room-progress badge, which
      // is present online and offline).
      const win = OFFLINE_WINDOWS[windowIndex];
      const roomNo = await currentRoomNumber(page);
      if (win && restoreAt === null && roomNo >= win.afterRoom) {
        await goOffline();
        restoreAt = Date.now() + win.durationMs;
        windowIndex += 1;
      }

      // End-check only while online (server state is unreadable offline, and an
      // area can never complete mid-outage because combat blocks offline).
      if (!offline) {
        const state = await gameState(page);
        if (state?.phase === 'area_complete' || state?.phase === 'run_complete'
          || state?.run?.areaCleared === true || state?.run?.victory) {
          played.reachedEnd = true;
          break;
        }
      }

      // Forbidden copy is asserted every iteration, offline or online.
      const bodyText = await page.locator('body').innerText().catch(() => '');
      for (const copy of FORBIDDEN_COPY) {
        expect(bodyText.includes(copy), `forbidden copy "${copy}" (offline=${offline})`).toBeFalsy();
      }

      await driveOneInteraction();
      interactions += 1;
    }

    // --- final assertions ---
    if (restoreAt !== null) await goOnline();
    await page.waitForTimeout(3000); // allow the final sync drain to land
    const server = await serverState(page).catch(() => null);
    assertServerMatchesPlayed(server, played);
    expect(correctedSyncs, 'no corrected syncs on the happy path').toBe(0);
    expect(interactions, 'session should finish before MAX_INTERACTIONS').toBeLessThan(MAX_INTERACTIONS);
  });
});
