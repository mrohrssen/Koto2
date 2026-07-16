import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = readFileSync(
  resolve(import.meta.dirname, '../../smoke/explore-subway-runway.test.js'),
  'utf8',
);

test('installs corrected-sync tracking before the live Explore run starts', () => {
  const listenerIndex = source.indexOf("page.on('response'");
  const startIndex = source.indexOf('await startExplorationRunThroughUi(page)');

  assert.ok(listenerIndex >= 0, 'missing Explore sync response listener');
  assert.ok(startIndex >= 0, 'missing live Explore run entry');
  assert.ok(
    listenerIndex < startIndex,
    'correction tracking must cover the first in-run action, including setup/entry syncs',
  );
});

test('recognizes only the actionable pending NPC battle reward room shell', async () => {
  const { isPendingNpcBattleRewardState } = await import(
    '../../smoke/explore-subway-state.js'
  );

  assert.equal(isPendingNpcBattleRewardState({
    room: {
      npcBattle: { skillSelectionPending: true, rewardResolved: false },
    },
  }, 'npcBattle'), true);
  assert.equal(isPendingNpcBattleRewardState({
    room: {
      npcBattle: { skillSelectionPending: true, rewardResolved: true },
    },
  }, 'npcBattle'), false);
  assert.equal(isPendingNpcBattleRewardState({
    room: {
      npcBattle: { skillSelectionPending: false, rewardResolved: false },
    },
  }, 'npcBattle'), false);
  assert.equal(isPendingNpcBattleRewardState({
    room: {
      npcBattle: { skillSelectionPending: true, rewardResolved: false },
    },
  }, 'encounter'), false);

  assert.equal(isPendingNpcBattleRewardState({
    phase: 'room',
    room: {
      type: 'npcBattle',
      interacted: true,
      npcBattle: {},
    },
  }, 'npcBattle', { npcDialogueCard: true }), true,
  'the visible post-victory defeat line bridges the pre-arm client shell');
  assert.equal(isPendingNpcBattleRewardState({
    phase: 'room',
    room: {
      type: 'npcBattle',
      interacted: false,
      npcBattle: {},
    },
  }, 'npcBattle', { npcDialogueCard: true }), false,
  'an uninteracted NPC room is not a post-victory reward handoff');
  assert.equal(isPendingNpcBattleRewardState({
    phase: 'room',
    room: {
      type: 'npcBattle',
      interacted: true,
      npcBattle: { rewardResolved: true },
    },
  }, 'npcBattle', { npcDialogueCard: true }), false,
  'a resolved reward cannot reopen the dialogue exemption');
});

test('requires a combat action to append to the live Explore log while truly offline', () => {
  const helperStart = source.indexOf('async function proveOfflineCombatAppend');
  const helperEnd = source.indexOf('\n    async function driveOneInteraction', helperStart);
  assert.ok(helperStart >= 0, 'missing offline combat append proof helper');
  assert.ok(helperEnd > helperStart, 'offline combat append proof helper should be bounded');

  const helper = source.slice(helperStart, helperEnd);
  assert.match(helper, /navigator\.onLine/);
  assert.match(helper, /pendingCount/);
  assert.match(helper, /toBeGreaterThan\(pendingBefore\)/);
  assert.match(helper, /played\.offlineCombatTurns \+= 1/);
  assert.match(source, /expect\(played\.offlineCombatTurns\)\.toBeGreaterThan\(0\)/);
});

test('counts auto-started fights by stable live combat identity', async () => {
  const { liveCombatIdentity } = await import('../../smoke/explore-subway-state.js');

  assert.equal(liveCombatIdentity({ phase: 'room_encounter' }), null);
  assert.equal(liveCombatIdentity({
    phase: 'combat',
    combat: { optimistic: { combatId: 'cmb_auto_1' } },
    run: { currentRoom: 2 },
    room: { id: 'room-2' },
  }), 'combat:cmb_auto_1');
  assert.equal(liveCombatIdentity({
    phase: 'combat',
    combat: { optimistic: null },
    run: { currentRoom: 5 },
    room: { id: 'room-5' },
  }), 'room:5:room-5', 'legacy combat without a combatId still has a stable room owner');
});

test('rejects vacuous party convergence and requires terminal final-room resolution', async () => {
  const {
    hasComparablePartyDigests,
    isFinalExplorePartyCheckpoint,
  } = await import(
    '../../smoke/explore-subway-state.js'
  );

  assert.equal(hasComparablePartyDigests(null, null), false);
  assert.equal(hasComparablePartyDigests({ active: [] }, null), false);
  assert.equal(hasComparablePartyDigests(null, { active: [] }), false);
  assert.equal(
    hasComparablePartyDigests({ active: [] }, { active: [] }),
    true,
  );
  assert.equal(isFinalExplorePartyCheckpoint({ run: null }), false);
  assert.equal(isFinalExplorePartyCheckpoint({
    run: { currentRoom: 8, totalRooms: 10, creatureParty: { active: [] } },
    room: { type: 'encounter', interacted: true },
    combat: { active: false },
  }), false);
  assert.equal(isFinalExplorePartyCheckpoint({
    run: { currentRoom: 9, totalRooms: 10, creatureParty: { active: [] } },
    room: { type: 'boss', interacted: false },
    combat: { active: true },
  }), false, 'a boss-start response is not a terminal checkpoint');
  assert.equal(isFinalExplorePartyCheckpoint({
    run: { currentRoom: 9, totalRooms: 10, creatureParty: { active: [] } },
    room: { type: 'boss', interacted: true },
    combat: { active: true },
  }), false, 'an active final-room combat is not terminal even if the room shell is interacted');
  assert.equal(isFinalExplorePartyCheckpoint({
    run: { currentRoom: 9, totalRooms: 10, creatureParty: { active: [] } },
    room: { type: 'boss', interacted: false },
    combat: { active: false },
  }), false, 'an uninteracted final room is not terminal without a proven victory result');
  assert.equal(isFinalExplorePartyCheckpoint({
    run: { currentRoom: 9, totalRooms: 10, creatureParty: { active: [] } },
    room: { type: 'boss', interacted: true },
    combat: { active: false },
  }), true, 'an interacted final room with inactive combat is terminal');
  assert.equal(isFinalExplorePartyCheckpoint({
    run: { currentRoom: 9, totalRooms: 10, creatureParty: { active: [] } },
    room: { type: 'boss', interacted: false },
    combat: { active: true },
  }, {
    syncResults: [{ seq: 42, actionId: 'boss-win', combatEnded: true, victory: true }],
    syncEntries: [{ seq: 42, actionId: 'boss-win', kind: 'combat.cycle', roomIndex: 9 }],
  }), true, 'a successful sync result can prove terminal victory');
  assert.equal(isFinalExplorePartyCheckpoint({
    run: { currentRoom: 9, totalRooms: 10, creatureParty: { active: [] } },
    room: { type: 'boss', interacted: false },
    combat: { active: true },
  }, {
    syncResults: [{ seq: 42, actionId: 'boss-loss', combatEnded: true, victory: false }],
    syncEntries: [{ seq: 42, actionId: 'boss-loss', kind: 'combat.cycle', roomIndex: 9 }],
  }), false, 'combat end without victory is not terminal Explore resolution');
  assert.equal(isFinalExplorePartyCheckpoint({
    run: { currentRoom: 9, totalRooms: 10, creatureParty: { active: [] } },
    room: { type: 'boss', interacted: false },
    combat: { active: true },
  }, {
    syncResults: [
      { seq: 41, actionId: 'room-eight-win', combatEnded: true, victory: true },
      { seq: 42, actionId: 'boss-start', started: true },
    ],
    syncEntries: [
      { seq: 41, actionId: 'room-eight-win', kind: 'combat.cycle', roomIndex: 8 },
      { seq: 42, actionId: 'boss-start', kind: 'boss.start', roomIndex: 9 },
    ],
  }), false, 'an earlier-room victory in the boss-start batch is not terminal boss resolution');
});

test('anchors party convergence to an exact terminal successful response', () => {
  assert.match(
    source,
    /isFinalExplorePartyCheckpoint\(authoritativeState, \{[\s\S]*?syncResults: isExploreSync \? body\?\.results : \[\][\s\S]*?\}\)/,
  );
  assert.match(source, /syncEntries: isExploreSync \? requestEntries : \[\]/);
  assert.match(source, /partyCheckpointIdentity\(clientState\) === identity/);
  assert.match(source, /terminalPartyCheckpoint = \{ identity, clientDigest, serverDigest \}/);
  assert.match(
    source,
    /hasComparablePartyDigests\([\s\S]*?terminalPartyCheckpoint\?\.clientDigest[\s\S]*?terminalPartyCheckpoint\?\.serverDigest/,
  );
});

test('arms the two real outages on the deterministic support and combat rooms', () => {
  const windowsStart = source.indexOf('const OFFLINE_WINDOWS = [');
  const windowsEnd = source.indexOf('];', windowsStart);
  assert.ok(windowsStart >= 0 && windowsEnd > windowsStart, 'missing offline window schedule');

  const schedule = source.slice(windowsStart, windowsEnd);
  assert.match(schedule, /afterRoom:\s*2/, 'first outage must arm on queued shrine badge 2');
  assert.match(schedule, /afterRoom:\s*5/, 'second outage must arm on queued encounter badge 5');
  assert.doesNotMatch(
    schedule,
    /afterRoom:\s*4/,
    'friendlyNpc badge 4 checkpoints PARTY_STATS and cannot prove offline combat',
  );
});
