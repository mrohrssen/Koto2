/**
 * Main simulation runner.
 * Drives a simulated player through the Koto game server's real APIs.
 */
import { createSimCaller } from './sim-call.js';
import { createTestUser, seedStartingVocab, advanceTime } from './auth.js';
import { getRoomHandler } from './rooms/index.js';
import { runCrestCycle } from './crest-cycle.js';

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

      // Initialize game player — the game server requires this before start-run
      const initCall = createSimCaller(gameServerUrl, jwt, () => {});
      const createResult = await initCall('POST', '/api/game/create-player', { name: 'SimPlayer' }, 'init');
      if (!createResult.ok) {
        throw new Error(`Failed to create game player: ${createResult.error || createResult.status}`);
      }

      // Select a starter creature (prologue step) — without this the party is empty
      const starters = ['starter-fire', 'starter-water', 'starter-wood'];
      const starterId = starters[Math.floor(Math.random() * starters.length)];
      await initCall('POST', '/api/game/select-starter', { starterId }, 'select starter');
      await initCall('POST', '/api/game/prologue-complete', null, 'prologue complete');
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

      // Snapshot known words at day start
      const dayStartResult = await simCall('GET', '/api/game/known-words', null, `day ${day} start snapshot`);
      const dayStartCount = dayStartResult.ok ? (dayStartResult.data?.words?.length ?? 0) : 0;

      let runsCompleted = 0;
      let runsWiped = 0;
      let wordsImmersedToday = 0;
      let hubReviewsToday = 0;
      const crestDaily = {
        chestsOpenedTotal: 0,
        equipChangesTotal: 0,
        dropsSpentTotal: 0,
        runsWithCrestCycle: 0
      };

      for (let run = 1; run <= effectiveRuns; run++) {
        pos.run = run; pos.room = 0;
        store.updateSimulation(simId, { current_day: day, current_run: run, current_room: 0 });

        // Select team: fetch collection, greedily pick creatures up to 10 points
        let starterIds = null;
        const collResult = await simCall('GET', '/api/game/creature-collection', null, `day ${day} run ${run} collection`);
        if (collResult.ok && collResult.data?.catalog?.length > 0) {
          const catalog = collResult.data.catalog.filter(c => c.owned);
          // Sort cheapest first to maximize team size
          catalog.sort((a, b) => (a.pointCost || 3) - (b.pointCost || 3));
          const picked = [];
          let usedPoints = 0;
          for (const c of catalog) {
            const cost = c.pointCost || 3;
            if (usedPoints + cost <= 10) {
              picked.push(c.id);
              usedPoints += cost;
            }
          }
          if (picked.length > 0) starterIds = picked;
        }

        // Start a new run
        const startRunResult = await simCall('POST', '/api/game/start-run', starterIds ? { starterIds } : null, `day ${day} run ${run}`);
        if (!startRunResult.ok) continue; // Skip this run if start fails

        // Handle initial skill pick (game enters skillMaster phase after start-run)
        const offersResult = await simCall('POST', '/api/game/skill-master-offers', null, `day ${day} run ${run} skill offers`);
        if (offersResult.ok && offersResult.data?.offered?.length > 0) {
          const skill = offersResult.data.offered[0]; // Pick first offered skill
          await simCall('POST', '/api/game/skill-master-choose', { skillId: skill.id }, `day ${day} run ${run} skill choose`);
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

        // Room loop — get current state to find room 0, then proceed through rooms
        let runWiped = false;
        for (let roomIndex = 0; roomIndex < 30; roomIndex++) {
          pos.room = roomIndex;
          store.updateSimulation(simId, { current_room: roomIndex });

          // For room 0: select-area already placed us here. For rooms 1+: proceed.
          let roomData;
          if (roomIndex === 0) {
            // Get current room from game state
            const stateResult = await simCall('GET', '/api/game/state', null, `day ${day} run ${run} room 0 state`);
            if (!stateResult.ok) break;
            const currentRoom = stateResult.data?.run?.rooms?.[0];
            if (!currentRoom) break;
            roomData = currentRoom;
          } else {
            const proceedResult = await simCall('POST', '/api/game/proceed', null, `day ${day} run ${run} room ${roomIndex}`);
            if (!proceedResult.ok) break;
            // proceed returns { room: { room: {...actual room...}, roomNumber, actions }, state }
            const roomWrapper = proceedResult.data?.room;
            roomData = roomWrapper?.room ?? roomWrapper ?? proceedResult.data;
            if (!roomData) break;
          }

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

        // Always forfeit to close the run and capture server's runSummary
        const forfeitResult = await simCall('POST', '/api/game/forfeit',
          { isVictory: !runWiped }, `day ${day} run ${run} forfeit`);

        const serverRunSummary = forfeitResult.data?.runSummary ?? {};
        logEvent(day, run, 0, 'run_summary', {
          wiped: runWiped,
          completed: !runWiped,
          wordsImmersed: serverRunSummary.wordsImmersed ?? 0,
          wordsMastered: serverRunSummary.wordsMastered ?? [],
          creaturesDefeated: serverRunSummary.creaturesDefeated ?? 0,
          creaturesBefriended: serverRunSummary.creaturesBefriended ?? 0,
          itemsCollected: serverRunSummary.itemsCollected ?? 0,
        });
        wordsImmersedToday += serverRunSummary.wordsImmersed ?? 0;

        if (runWiped) {
          runsWiped++;
        } else {
          runsCompleted++;
        }

        // Hub speed review — complete all due reviews between runs
        const dueResult = await simCall('GET', '/api/game/known-words/due-words', null, `day ${day} run ${run} due words`);
        if (dueResult.ok) {
          const dueWords = dueResult.data?.words ?? [];
          for (const entry of dueWords) {
            const word = entry.word ?? entry;
            if (!word) continue;
            const grade = Math.random() < config.speedReviewAccuracy ? 'good' : 'again';
            await simCall('POST', '/api/game/known-words/review', { word, grade }, `hub review ${word}`);
            hubReviewsToday++;
          }
        }

        // Crest meta progression — open all affordable chests and auto-equip best per element.
        pos.room = 0;
        let crestSummary;
        try {
          crestSummary = await runCrestCycle(simCall, logEvent, { day, run });
        } catch (error) {
          throw new Error(`Crest cycle failed on day ${day} run ${run}: ${error.message || String(error)}`);
        }
        crestDaily.chestsOpenedTotal += crestSummary.totalChestsOpened || 0;
        crestDaily.equipChangesTotal += crestSummary.totalEquipChanges || 0;
        crestDaily.dropsSpentTotal += crestSummary.dropsSpentTotal || 0;
        crestDaily.runsWithCrestCycle += 1;
      }

      // Advance time after all runs for the day
      try {
        await advanceTime(gameServerUrl, adminSecret, userId, 1);
      } catch {
        // Non-fatal — log and continue
        logEvent(day, 0, 0, 'api_error', { context: 'advance_time', day });
      }

      // Snapshot known words at day end (server is source of truth)
      const dayEndResult = await simCall('GET', '/api/game/known-words', null, `day ${day} end snapshot`);
      const totalKnownWords = dayEndResult.ok ? (dayEndResult.data?.words?.length ?? 0) : 0;
      const newWordsToday = Math.max(0, totalKnownWords - dayStartCount);

      // Count dialogue and room events (simulator-only analytics)
      const dayEvents = store.getEvents(simId, { day });
      const dialogueLines = dayEvents.filter(e => e.event_type === 'dialogue_seen').length;
      const roomsExplored = dayEvents.filter(e => e.event_type === 'room_entered').length;

      // Save daily snapshot
      store.saveDailySnapshot(simId, day, {
        total_known_words: totalKnownWords,
        new_words_today: newWordsToday,
        words_exposed_today: wordsImmersedToday,
        dialogue_lines_encountered: dialogueLines,
        runs_completed: runsCompleted,
        runs_wiped: runsWiped,
        rooms_explored: roomsExplored,
        speed_reviews_completed: hubReviewsToday,
        unknown_words_in_dialogue: 0,
        snapshot_data: {
          crest: crestDaily
        }
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
