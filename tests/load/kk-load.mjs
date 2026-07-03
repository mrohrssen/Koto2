#!/usr/bin/env node
// Bot load harness for Kanji Kombat. Registers throwaway users and plays
// through the REAL API. Regular bots answer via the legacy /answer|/intro|
// /completion-choice routes on a 2-4s jittered cadence. "Subway" bots
// accumulate up to 50 mirrored quiz entries locally, sleep 5-15s (simulating
// an offline subway ride), then dump the batch through /sync in one call —
// mirroring seeds/hashes the same way tests/integration/flows/
// kanji-kombat-sync.test.js and kanji-kombat-sync-batch-perf.test.js do.
//
// Usage: node tests/load/kk-load.mjs --url http://localhost:3000 --bots 10 --minutes 2 --subway 2
import { resolveKanjiKombatAnswerTurn } from '../../src/shared/combat/pve-turn-resolver.js';
import { hashTranscript, createActionId } from '../../src/shared/action-protocol.js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]] : null).filter(Boolean)
);
const BASE = args.url || 'http://localhost:3000';
const BOTS = Number(args.bots || 10);
const MINUTES = Number(args.minutes || 2);
const SUBWAY = Number(args.subway ?? Math.max(1, Math.floor(BOTS / 10)));
const RAMP_SECONDS = Number(args['ramp-seconds'] || 0);
const DEADLINE = Date.now() + MINUTES * 60 * 1000;

// Default starter creature: fresh accounts get creatureCollection ['hi', 'mizu', 'ki']
// (see src/game/state.js createNewPlayer defaults) — 'hi' is always unlocked.
const STARTER_CREATURE_ID = 'hi';

const latencies = new Map(); // label -> number[]
let httpErrors = 0;   // 5xx responses
let netErrors = 0;    // fetch threw (connection refused, timeout, etc.)
let requests = 0;
let runRestarts = 0;  // fresh-run restarts after defeat or the known KO-cursor bug — not errors

// A 30s per-request ceiling so a hung target (unresponsive but not
// connection-refused) can't leave a bot's fetch pending forever — without
// this, a single stuck request would keep Promise.all(bots) in main() from
// ever settling, and the harness would never print its summary or exit.
const REQUEST_TIMEOUT_MS = 30_000;

async function call(label, path, options = {}) {
  const started = performance.now();
  requests += 1;
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await res.json().catch(() => ({}));
    if (!latencies.has(label)) latencies.set(label, []);
    latencies.get(label).push(performance.now() - started);
    if (res.status >= 500) httpErrors += 1;
    return { status: res.status, body };
  } catch (e) {
    netErrors += 1;
    if (!latencies.has(label)) latencies.set(label, []);
    latencies.get(label).push(performance.now() - started);
    return { status: 0, body: { error: e.message } };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function jitter(min, max) { return min + Math.random() * (max - min); }

function pickChoice(prompt) {
  const choices = prompt.quiz?.choices || [];
  // 85% correct to mimic a real player
  const correct = choices.find(c => c.correct);
  const wrong = choices.filter(c => !c.correct);
  return (Math.random() < 0.85 && correct) ? correct : (wrong[0] || correct);
}

// ---------------------------------------------------------------------------
// Registration + run bootstrap
//
// Reconciliation vs the brief: POST /start does NOT gate onboarding via HTTP
// status — it always returns 200 (see src/routes/game/kanji-kombat.js and
// KanjiKombatService#startRunWithCreature). A fresh account's onboarding is
// signaled by state.run.kanjiKombat.onboardingPending === true in the 200
// body, exactly like kanji-kombat-sync-batch-perf.test.js's bootstrap helper
// checks `startState?.run?.kanjiKombat?.onboardingPending`. There is no
// /availability starterIds field to read — starters come from
// gm.meta.creatureCollection, which defaults to ['hi', 'mizu', 'ki'] for a
// fresh registration (src/game/state.js), and /start 400s if the requested
// creatureId isn't in that collection.
// ---------------------------------------------------------------------------

async function registerBot(i) {
  const username = `kkbot_${Date.now().toString(36)}_${i}`;
  const reg = await call('auth', '/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, password: 'loadtest1', aiDataSharingConsent: true }),
  });
  if (!reg.body.token) throw new Error(`register failed: ${JSON.stringify(reg.body)}`);
  const bot = { username, headers: { authorization: `Bearer ${reg.body.token}` } };
  // Mirrors bootstrapKanjiKombatRun in both reference integration tests: a
  // player object must exist before /kanji-kombat/start touches gm.player.
  const created = await call('create-player', '/api/game/create-player', {
    method: 'POST', headers: bot.headers,
    body: JSON.stringify({ name: 'LoadBot' }),
  });
  if (created.status !== 200) throw new Error(`create-player failed: ${JSON.stringify(created.body)}`);
  return bot;
}

// KanjiKombatService#startRunWithCreature throws 'Kanji Kombat is complete
// for the day' (400) once a user has exhausted the day's new-card + due-review
// content (DAILY_NEW_LIMIT / due-card SRS scheduling) — a real end state, not
// a bug. A long-running load bot (or a bot that restarts often after KO
// wipes) can legitimately hit this before the deadline. Detected here so the
// caller can idle the bot instead of crashing it.
function isDailyCompleteError(body) {
  return /complete for the day/i.test(body?.error || '');
}

async function startRun(bot) {
  const start = await call('start', '/api/game/kanji-kombat/start', {
    method: 'POST', headers: bot.headers,
    body: JSON.stringify({ creatureId: STARTER_CREATURE_ID }),
  });
  if (start.status !== 200) {
    if (isDailyCompleteError(start.body)) return null;
    throw new Error(`kk/start failed: ${JSON.stringify(start.body)}`);
  }
  let state = start.body.state;
  if (state?.run?.kanjiKombat?.onboardingPending) {
    const onboard = await call('onboarding', '/api/game/kanji-kombat/onboarding', {
      method: 'POST', headers: bot.headers,
      body: JSON.stringify({ knowsHiragana: false, knowsKatakana: false }),
    });
    if (onboard.status !== 200) throw new Error(`kk/onboarding failed: ${JSON.stringify(onboard.body)}`);
    state = onboard.body.state;
  }
  return state;
}

function head(state) {
  return state?.run?.kanjiKombat?.promptBuffer?.[0] || null;
}

function runEnded(state, lastResult) {
  const defeated = lastResult?.combatEnded === true && lastResult?.victory === false;
  return defeated
    || state?.run?.kanjiKombat?.report?.defeated === true
    || state?.run?.active === false;
}

// The known pre-existing KO-cursor bug (see kanji-kombat-sync-batch-perf.test.js
// header comment and task-8-report.md): resolveKanjiKombatCursorAction can
// compute a stale actionCursor after a KO-swap splice (reachable once a
// streak-12 ally-join has grown the party past 1 creature and a later KO
// removes an ally other than the one at the highest surviving index). It
// surfaces two ways — matching both this function's checks and the '||'
// 400-status branch in kanji-kombat-sync-batch-perf.test.js's
// answerOneForUser: (1) a /sync 'corrected' response with reason
// 'transcript_mismatch' or a raw JS-error-shaped reason, or (2) a 400 from
// the legacy /answer|/intro|/completion-choice route's own cursor
// validation ("... ally action cursor"). A real client would abandon the
// wedged run and start fresh — bots do the same, counted in runRestarts,
// never as an error.
function isKnownCursorBug(res) {
  const body = res?.body ?? res;
  if (body?.status === 'corrected') {
    return body?.reason === 'transcript_mismatch' || /Cannot read propert/i.test(body?.reason || '');
  }
  return res?.status === 400 && /ally action cursor/i.test(body?.error || '');
}

// ---------------------------------------------------------------------------
// Regular bots: play live via the legacy /intro|/answer|/completion-choice
// routes on a jittered 2-4s cadence, one HTTP round-trip per action.
//
// Reconciliation vs the brief: promptRefFromBody (src/routes/game/
// kanji-kombat.js) only reads a nested promptRef from body.payload.promptRef
// (the optimistic-envelope shape) or FLAT promptId/sequence fields directly
// on the body (payload.cardId for cardId). A top-level `promptRef: {...}`
// key — what the brief's actOnHead sent — matches neither branch and is
// silently ignored, so every legacy call would submit against a null
// promptRef. Fixed here by sending promptId/sequence/cardId flat.
// ---------------------------------------------------------------------------

async function actOnHead(bot, state) {
  // A 'corrected' /sync response (or a stale in-memory state) can carry a
  // promptBuffer that still shows a quiz/intro head even though the run
  // already ended in defeat (run.active === false). Restart before touching
  // the head — submitting against a dead run's stale prompt would 400
  // forever without ever making progress.
  if (runEnded(state, null)) {
    runRestarts += 1;
    return startRun(bot);
  }
  const prompt = head(state);
  if (!prompt) {
    runRestarts += 1;
    return startRun(bot);
  }

  if (prompt.kind === 'intro') {
    const res = await call('intro', '/api/game/kanji-kombat/intro', {
      method: 'POST', headers: bot.headers,
      body: JSON.stringify({
        cardId: prompt.cardId,
        choice: Math.random() < 0.5 ? 'known' : 'unknown',
        promptId: prompt.promptId,
        sequence: prompt.sequence,
      }),
    });
    if (isKnownCursorBug(res)) { runRestarts += 1; return startRun(bot); }
    if (res.status !== 200) return state; // transient error — retry same head next tick
    return res.body.state || state;
  }

  if (prompt.kind === 'quiz') {
    const choice = pickChoice(prompt);
    const res = await call('answer', '/api/game/kanji-kombat/answer', {
      method: 'POST', headers: bot.headers,
      body: JSON.stringify({
        answerId: choice?.id,
        promptId: prompt.promptId,
        sequence: prompt.sequence,
        cardId: prompt.cardId,
      }),
    });
    if (isKnownCursorBug(res)) { runRestarts += 1; return startRun(bot); }
    if (res.status !== 200) return state;
    const nextState = res.body.state || state;
    const lastResult = res.body.results?.at(-1) ?? res.body;
    if (runEnded(nextState, lastResult)) { runRestarts += 1; return startRun(bot); }
    return nextState;
  }

  // dailyCompletePrompt / completePrompt → keep going (endless mode)
  const res = await call('completion', '/api/game/kanji-kombat/completion-choice', {
    method: 'POST', headers: bot.headers,
    body: JSON.stringify({
      keepGoing: true,
      promptId: prompt.promptId,
      sequence: prompt.sequence,
    }),
  });
  if (isKnownCursorBug(res)) { runRestarts += 1; return startRun(bot); }
  if (res.status !== 200) return state;
  return res.body.state || state;
}

async function runRegularBot(i) {
  const bot = await registerBot(i);
  let state = await startRun(bot);
  while (Date.now() < DEADLINE) {
    if (!state) {
      // Daily content exhausted (see isDailyCompleteError) — a real client
      // would stop here and show a "come back tomorrow" screen rather than
      // keep hammering /start. Idle out the remaining window in one sleep
      // instead of spinning empty /start retries into the latency table.
      await sleep(Math.max(0, DEADLINE - Date.now()));
      break;
    }
    state = await actOnHead(bot, state);
    await sleep(jitter(2000, 4000));
  }
}

// ---------------------------------------------------------------------------
// Subway bots: mirror seeds/hashes locally to build up to 50 quiz entries
// without any network calls, sleep 5-15s ("underground"), then dump the
// whole batch through one /sync POST — the offline-play pattern /sync exists
// for.
//
// Reconciliation vs the brief: resolveKanjiKombatAnswerTurn's default
// clone:true means each call snapshots its OWN copy of the combat input —
// it does NOT mutate the combat object passed in. The brief's loop called
// resolveKanjiKombatAnswerTurn repeatedly against the SAME initial `combat`
// clone for every entry, so every hash past entry 0 would predict against
// stale (entry-0) allies/enemies HP and actionCursor instead of the
// sequential state the server will actually see when it replays the batch —
// guaranteeing transcript_mismatch on entry 2+. Fixed by threading
// resolved.nextCombat forward as the `combat` input to the next iteration,
// exactly matching the "use resolved.nextCombat as the combat state for the
// next entry" comment in kanji-kombat-sync.test.js's buildQuizEntry doc.
//
// Also added: entry.actionId via createActionId() so the server's action
// ledger (gm.meta.actionLedger, keyed by isActionId()) can dedupe replayed
// entries the same way a real client's retry logic would rely on — the
// brief's entries omitted actionId entirely.
// ---------------------------------------------------------------------------

function buildOfflineBatch(state, count) {
  const kk = state?.run?.kanjiKombat;
  const optimistic = state?.combat?.optimistic;
  if (!kk?.sessionEpoch || !optimistic?.turnSeeds?.length) return null;
  // A 'corrected' sync response can carry a stale promptBuffer (still shows a
  // quiz head) alongside a run that has already ended in defeat (run.active
  // === false, combat.actionCursor.side === 'enemy' since the ally side was
  // fully wiped). resolveKanjiKombatAnswerTurn throws on a non-ally cursor —
  // bail out here so the caller's runEnded() check restarts the run instead
  // of an uncaught exception reaching the bot's event loop.
  if (runEnded(state, null) || state.combat?.actionCursor?.side !== 'ally') return null;

  let combat = structuredClone(state.combat);
  const run = structuredClone(state.run);
  const seeds = [...optimistic.turnSeeds];
  const entries = [];
  let seq = 1;

  for (const prompt of run.kanjiKombat.promptBuffer) {
    if (entries.length >= count || !seeds.length) break;
    if (prompt.kind !== 'quiz') break; // stop at intro/daily boundary — handled live by actOnHead
    const choice = pickChoice(prompt);
    const correct = choice?.correct === true;
    const seed = seeds.shift();
    const resolved = resolveKanjiKombatAnswerTurn({ combat, run, answerCorrect: correct }, { seed });
    entries.push({
      seq: seq++,
      actionId: createActionId('kkl'),
      kind: 'quiz',
      promptId: prompt.promptId,
      sequence: prompt.sequence,
      cardId: prompt.cardId,
      answerId: choice?.id,
      predictedHash: hashTranscript(resolved.transcript),
    });
    // A single-creature starter with no reserves (how every Kanji Kombat run
    // begins) can be wiped by this entry. resolveKanjiKombatAnswerTurn's
    // transcript never simulates the real commit path's post-KO branching
    // (wave respawn vs. run defeat — see combatCycleService.
    // resolveKanjiKombatCursorAction, invoked server-side instead of this
    // shared resolver), so a local mirror has no way to predict what comes
    // after a wipe. Stop the batch here rather than keep predicting entries
    // that are certain to transcript-mismatch — the remaining prompts (if
    // any) get resolved live via actOnHead once the server rejects/accepts
    // this batch.
    if (resolved.transcript.allAlliesDefeated) break;
    combat = resolved.nextCombat; // thread forward — see reconciliation note above
  }
  return entries.length ? { sessionEpoch: kk.sessionEpoch, entries } : null;
}

async function runSubwayBot(i) {
  const bot = await registerBot(i);
  let state = await startRun(bot);
  while (Date.now() < DEADLINE) {
    if (!state) {
      // Daily content exhausted — see the matching comment in runRegularBot.
      await sleep(Math.max(0, DEADLINE - Date.now()));
      break;
    }
    const built = buildOfflineBatch(state, 50);
    if (!built) {
      // Head isn't a quiz (intro/daily boundary) — resolve it live, then retry batching.
      state = await actOnHead(bot, state);
      continue;
    }
    await sleep(jitter(5000, 15000)); // "underground" — no network activity
    const res = await call('sync', '/api/game/kanji-kombat/sync', {
      method: 'POST', headers: bot.headers,
      body: JSON.stringify({ sessionEpoch: built.sessionEpoch, entries: built.entries }),
    });
    if (res.status >= 500) continue; // counted in httpErrors already; retry against current state next loop
    state = res.body.state || res.body.authoritativeState || state;
    // 'corrected' (stale epoch, transcript mismatch, etc.) is normal offline-sync flow, not
    // an error — the client resyncs by taking one live action against the authoritative state.
    if (res.body.status !== 'ok') {
      if (isKnownCursorBug(res)) runRestarts += 1;
      state = await actOnHead(bot, state);
    }
  }
}

// ---------------------------------------------------------------------------
// Run bots, staggered ramp-up, then print the summary table.
// ---------------------------------------------------------------------------

function pct(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

async function main() {
  const bots = [];
  for (let i = 0; i < BOTS; i++) {
    const isSubway = i < SUBWAY;
    // Every throw reachable from a bot loop originates from a checked call()
    // result (e.g. registerBot's `if (!reg.body.token) throw ...`) — the
    // underlying network/5xx failure was already counted inside call() at
    // the moment it happened. Re-incrementing netErrors here would double
    // count the same failure. This catch exists only to stop an early bot
    // death (a whole bot going down, usually because its target is
    // unreachable from the very first request) from becoming an unhandled
    // rejection that kills the rest of the run.
    bots.push((isSubway ? runSubwayBot(i) : runRegularBot(i)).catch(e => {
      console.error(`bot ${i} (${isSubway ? 'subway' : 'regular'}) died:`, e.message);
    }));
    // Ramp-up stagger: if RAMP_SECONDS > 0, spread bots uniformly over
    // that window; otherwise use fixed 150ms stagger for backwards compatibility.
    const delayMs = RAMP_SECONDS > 0
      ? (i / BOTS) * RAMP_SECONDS * 1000
      : 150;
    const prevDelayMs = i === 0 ? 0 : (RAMP_SECONDS > 0
      ? ((i - 1) / BOTS) * RAMP_SECONDS * 1000
      : 150);
    await sleep(delayMs - prevDelayMs);
  }
  await Promise.all(bots);

  const rampLabel = RAMP_SECONDS > 0 ? ` ramp=${RAMP_SECONDS}s` : '';
  console.log(`\n=== kk-load: ${BOTS} bots (${SUBWAY} subway) x ${MINUTES}min vs ${BASE}${rampLabel} ===`);
  console.log(
    `${'endpoint'.padEnd(12)} ${'count'.padEnd(9)} p50      p95      p99`
  );
  for (const [label, values] of latencies) {
    const sorted = [...values].sort((a, b) => a - b);
    console.log(
      `${label.padEnd(12)} n=${String(sorted.length).padEnd(6)} ` +
      `p50=${Math.round(pct(sorted, 50))}ms p95=${Math.round(pct(sorted, 95))}ms p99=${Math.round(pct(sorted, 99))}ms`
    );
  }
  const errors = httpErrors + netErrors;
  const errorRate = requests ? errors / requests : 0;
  console.log(`requests=${requests} errors=${errors} (5xx=${httpErrors} network=${netErrors}) rate=${(errorRate * 100).toFixed(2)}% runRestarts=${runRestarts}`);
  process.exitCode = errorRate > 0.01 ? 1 : 0;
}

await main();
