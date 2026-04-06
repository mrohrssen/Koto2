/**
 * Main simulation runner.
 * Drives a simulated player through the Koto game server's real APIs.
 */
import { createSimCaller } from './sim-call.js';
import { createTestUser, seedStartingVocab, advanceTime } from './auth.js';
import { getRoomHandler } from './rooms/index.js';

const PROFILE_DEFAULTS = {
  durationDays: 30,
  runsPerDay: 2,
  speedReviewAccuracy: 0.7,
  wordDiscoveryAccuracy: 0.9,
  combatSkill: 0.5,
  dailyPlayMinutes: 60,
  startingVocab: [],
  aiDialogueMode: 'skip',
  aiModel: null,
};

const ESTIMATED_MINUTES_PER_RUN = 20;

/**
 * Run a full simulation.
 *
 * @param {Object} profile - Merged profile config (PROFILE_DEFAULTS + user overrides)
 * @param {Object} store - SQLite store instance
 * @param {number} simId - Simulation record ID
 * @param {string} gameServerUrl - Base URL of the game server
 * @param {string} adminSecret - Admin secret for privileged endpoints
 * @param {Object} [options] - { onDayComplete, onPause }
 */
export async function runSimulation(profile, store, simId, gameServerUrl, adminSecret, options = {}) {
  const { onDayComplete, onPause } = options;
  const config = { ...PROFILE_DEFAULTS, ...profile };

  try {
    // Get simulation record
    let sim = store.getSimulation(simId);
    if (!sim) throw new Error(`Simulation ${simId} not found`);

    const startDay = sim.current_day || 1;

    // Create test user if needed
    let jwt = sim.jwt_token;
    let userId = sim.test_user_id;

    if (!jwt || !userId) {
      const user = await createTestUser(gameServerUrl, config.name ?? 'sim', adminSecret);
      jwt = user.token;
      userId = user.userId;

      // Seed starting vocab
      if (config.startingVocab.length > 0) {
        await seedStartingVocab(gameServerUrl, adminSecret, userId, config.startingVocab);
      }

      store.updateSimulation(simId, {
        test_user_id: userId,
        jwt_token: jwt,
        status: 'running',
        started_at: new Date().toISOString()
      });
    } else {
      store.updateSimulation(simId, { status: 'running' });
    }

    // Track current position for simCall error logging
    const pos = { day: 1, run: 1, room: 0 };

    // Create simCall with logging — uses live pos object, not stale closure
    const logFn = (entry) => {
      store.logEvent(simId, pos.day, pos.run, pos.room, 'api_error', entry);
    };
    const simCall = createSimCaller(gameServerUrl, jwt, logFn);

    // Bound logEvent to this simulation
    const logEvent = (day, run, room, eventType, data) => {
      store.logEvent(simId, day, run, room, eventType, data);
    };

    // Main day loop
    for (let day = startDay; day <= config.durationDays; day++) {
      pos.day = day;
      const effectiveRuns = Math.min(
        config.runsPerDay,
        Math.floor(config.dailyPlayMinutes / ESTIMATED_MINUTES_PER_RUN)
      );

      let runsCompleted = 0;
      let runsWiped = 0;

      for (let run = 1; run <= effectiveRuns; run++) {
        pos.run = run; pos.room = 0;
        store.updateSimulation(simId, { current_day: day, current_run: run, current_room: 0 });

        // Start a new run
        const startRunResult = await simCall('POST', '/api/game/start-run', null, `day ${day} run ${run}`);

        if (startRunResult.ok) {
          // Log CID dialogue from cidScript
          const cidScript = startRunResult.data?.cidScript ?? startRunResult.data?.cid?.script;
          if (cidScript) {
            const lines = Array.isArray(cidScript) ? cidScript : [cidScript];
            for (const line of lines) {
              if (line) {
                logEvent(day, run, 0, 'dialogue_seen', {
                  source: 'cid',
                  line: typeof line === 'string' ? line : line.text ?? JSON.stringify(line)
                });
              }
            }
          }
        }

        // Pick an area
        const areasResult = await simCall('GET', '/api/game/area-options', null, `day ${day} run ${run} areas`);
        if (areasResult.ok) {
          const areas = areasResult.data?.areas ?? areasResult.data ?? [];
          if (areas.length > 0) {
            const area = areas[Math.floor(Math.random() * areas.length)];
            const areaId = area.id ?? area.areaId;
            await simCall('POST', '/api/game/select-area', { areaId }, `day ${day} run ${run} select area`);
          }
        }

        // Room loop
        let runWiped = false;
        for (let roomIndex = 1; roomIndex <= 30; roomIndex++) {
          pos.room = roomIndex;
          store.updateSimulation(simId, { current_room: roomIndex });

          // Proceed to next room
          const proceedResult = await simCall('POST', '/api/game/proceed', null, `day ${day} run ${run} room ${roomIndex}`);

          if (!proceedResult.ok) {
            // Could mean run is over (no more rooms)
            break;
          }

          const roomData = proceedResult.data;
          if (!roomData) break;

          const roomType = roomData.type ?? roomData.roomType;
          if (!roomType) break;

          // Dispatch to handler
          const handler = getRoomHandler(roomType);
          const handlerContext = {
            day,
            run,
            roomIndex,
            combatSkill: config.combatSkill,
            speedReviewAccuracy: config.speedReviewAccuracy,
            wordDiscoveryAccuracy: config.wordDiscoveryAccuracy
          };

          const result = await handler(simCall, roomData, handlerContext, logEvent);

          if (result?.outcome === 'wiped') {
            runWiped = true;
            break;
          }
        }

        // Log run summary
        logEvent(day, run, 0, 'run_summary', {
          wiped: runWiped,
          completed: !runWiped
        });

        if (runWiped) {
          runsWiped++;
        } else {
          runsCompleted++;
        }
      }

      // Advance time after all runs for the day
      try {
        await advanceTime(gameServerUrl, adminSecret, userId, 1);
      } catch {
        // Non-fatal — log and continue
        logEvent(day, 0, 0, 'api_error', { context: 'advance_time', day });
      }

      // Get total known words
      let totalKnownWords = 0;
      const knownWordsResult = await simCall('GET', '/api/game/known-words', null, `day ${day} known words`);
      if (knownWordsResult.ok) {
        const kw = knownWordsResult.data;
        // Game server returns { words: [...] } from GET /api/game/known-words
        totalKnownWords = kw?.words?.length ?? kw?.total ?? kw?.count ?? (Array.isArray(kw) ? kw.length : 0);
      }

      // Count today's events
      const dayEvents = store.getEvents(simId, { day });
      const newWordsToday = dayEvents.filter(e => e.event_type === 'word_learned').length;
      const wordsExposedToday = dayEvents.filter(e => e.event_type === 'word_exposure').length;
      const dialogueLines = dayEvents.filter(e => e.event_type === 'dialogue_seen').length;
      const roomsExplored = dayEvents.filter(e => e.event_type === 'room_entered').length;
      const speedReviews = dayEvents.filter(e =>
        e.event_type === 'word_exposure' && e.data?.source === 'speed_review'
      ).length;

      // Save daily snapshot
      store.saveDailySnapshot(simId, day, {
        total_known_words: totalKnownWords,
        new_words_today: newWordsToday,
        words_exposed_today: wordsExposedToday,
        dialogue_lines_encountered: dialogueLines,
        runs_completed: runsCompleted,
        runs_wiped: runsWiped,
        rooms_explored: roomsExplored,
        speed_reviews_completed: speedReviews,
        unknown_words_in_dialogue: 0
      });

      // Callback
      if (onDayComplete) {
        onDayComplete({ simId, day, totalKnownWords, runsCompleted, runsWiped });
      }

      // Check pause
      if (onPause && onPause({ simId, day })) {
        store.updateSimulation(simId, { status: 'paused', current_day: day });
        return;
      }
    }

    // Simulation complete
    store.updateSimulation(simId, {
      status: 'complete',
      completed_at: new Date().toISOString()
    });

  } catch (err) {
    store.updateSimulation(simId, {
      status: 'errored',
      error_message: err.message ?? String(err)
    });
    throw err;
  }
}

export { PROFILE_DEFAULTS, ESTIMATED_MINUTES_PER_RUN };
