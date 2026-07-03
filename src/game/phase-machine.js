export const PHASES = {
  NO_SAVE: 'no_save',
  HUB: 'hub',
  RUN_ENDED: 'run_ended',

  AREA_SELECTION: 'area_selection',
  AREA_COMPLETE: 'area_complete',
  EXPLORING: 'exploring',

  ROOM: 'room',
  ROOM_ENCOUNTER: 'room_encounter',
  WORD_DISCOVERY: 'wordDiscovery',
  DEALER: 'dealer',
  WHACK_A_MOLE: 'whackAMole',
  CAMPFIRE: 'campfire',
  SPEED_REVIEW_ROOM: 'speedReviewRoom',
  SKILL_MASTER: 'skillMaster',
  COMBAT: 'combat',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
  NPC_DIALOGUE: 'npc_dialogue',
  FRIENDLY_NPC: 'friendlyNpc',
  NPC_SKILL_SELECTION: 'npc_skill_selection',

  SHOP: 'shop',
  POST_COMBAT_SHOP: 'post_combat_shop',

  RUN_COMPLETE: 'run_complete',

  PVP_LOBBY: 'pvp_lobby',
  PVP_TEAM_SELECT: 'pvp_team_select',
  PVP_BATTLE: 'pvp_battle',
  PVP_RESULT: 'pvp_result'
};

export const VALID_TRANSITIONS = {
  [PHASES.NO_SAVE]: [PHASES.HUB],

  [PHASES.HUB]: [
    PHASES.AREA_SELECTION,
    PHASES.SHOP,
    PHASES.PVP_LOBBY
  ],

  [PHASES.AREA_SELECTION]: [
    PHASES.EXPLORING,
    PHASES.ROOM,
    PHASES.SKILL_MASTER
  ],

  [PHASES.EXPLORING]: [
    PHASES.ROOM,
    PHASES.ROOM_ENCOUNTER,
    PHASES.WHACK_A_MOLE,
    PHASES.CAMPFIRE,
    PHASES.SKILL_MASTER,
    PHASES.SPEED_REVIEW_ROOM,
    PHASES.COMBAT,
    PHASES.SHOP
  ],

  [PHASES.ROOM]: [
    PHASES.ROOM,
    PHASES.ROOM_ENCOUNTER,
    PHASES.WHACK_A_MOLE,
    PHASES.CAMPFIRE,
    PHASES.SKILL_MASTER,
    PHASES.SPEED_REVIEW_ROOM,
    PHASES.COMBAT,
    PHASES.SHOP,
    PHASES.EXPLORING
  ],

  [PHASES.ROOM_ENCOUNTER]: [
    PHASES.COMBAT
  ],

  [PHASES.COMBAT]: [
    PHASES.VICTORY,
    PHASES.DEFEAT,
    PHASES.POST_COMBAT_SHOP
  ],

  [PHASES.VICTORY]: [
    PHASES.NPC_DIALOGUE,
    PHASES.POST_COMBAT_SHOP,
    PHASES.ROOM,
    PHASES.EXPLORING,
    PHASES.AREA_COMPLETE,
    PHASES.RUN_COMPLETE
  ],

  [PHASES.NPC_DIALOGUE]: [
    PHASES.POST_COMBAT_SHOP,
    PHASES.ROOM,
    PHASES.EXPLORING,
    PHASES.AREA_COMPLETE,
    PHASES.RUN_COMPLETE,
    PHASES.NPC_SKILL_SELECTION
  ],

  [PHASES.FRIENDLY_NPC]: [
    PHASES.EXPLORING
  ],

  [PHASES.NPC_SKILL_SELECTION]: [
    PHASES.EXPLORING
  ],

  [PHASES.DEFEAT]: [
    PHASES.RUN_ENDED,
    PHASES.HUB
  ],

  [PHASES.POST_COMBAT_SHOP]: [
    PHASES.ROOM,
    PHASES.EXPLORING
  ],

  [PHASES.SHOP]: [
    PHASES.ROOM,
    PHASES.EXPLORING,
    PHASES.HUB
  ],

  [PHASES.WHACK_A_MOLE]: [PHASES.ROOM],
  [PHASES.CAMPFIRE]: [PHASES.ROOM],
  [PHASES.SKILL_MASTER]: [PHASES.ROOM],
  [PHASES.SPEED_REVIEW_ROOM]: [PHASES.ROOM],

  [PHASES.AREA_COMPLETE]: [
    PHASES.AREA_SELECTION,
    PHASES.RUN_COMPLETE
  ],

  [PHASES.RUN_COMPLETE]: [
    PHASES.HUB
  ],

  [PHASES.RUN_ENDED]: [
    PHASES.HUB
  ],

  [PHASES.PVP_LOBBY]: [PHASES.PVP_TEAM_SELECT, PHASES.HUB],
  [PHASES.PVP_TEAM_SELECT]: [PHASES.PVP_BATTLE, PHASES.PVP_LOBBY, PHASES.HUB],
  [PHASES.PVP_BATTLE]: [PHASES.PVP_RESULT, PHASES.HUB],
  [PHASES.PVP_RESULT]: [PHASES.PVP_TEAM_SELECT, PHASES.HUB]
};

export function canTransition(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function derivePhase(state) {
  const { player, run, combat } = state;

  if (!player) return PHASES.NO_SAVE;
  if (!run) return PHASES.HUB;
  if (!run.active) return PHASES.RUN_ENDED;

  if (run.areaSelectionRequired) return PHASES.AREA_SELECTION;
  // Creature selection pending — area chosen but no creatures yet.
  // Frontend shows creature select modal; server stays in area_selection.
  if (run.currentArea && run.creatureParty?.active?.length === 0) {
    return PHASES.AREA_SELECTION;
  }
  if (run.pendingBranch) {
    // Migration: auto-select first door for saves created before door removal.
    run.pendingBranch = false;
  }

  // Initial party skill pick (once per run, before first room)
  if (run.initialSkillPick && !run.initialSkillPick.chosenId) return PHASES.SKILL_MASTER;

  if (combat?.active) return PHASES.COMBAT;
  if (run.npcDialogue?.active) return PHASES.NPC_DIALOGUE;
  if (run.postCombatShop?.active) return PHASES.POST_COMBAT_SHOP;
  if (run.gameVictoryPending) return PHASES.RUN_COMPLETE;

  if (run.areaCleared) {
    if (run.areasCompleted >= run.areasToWin) return PHASES.RUN_COMPLETE;
    return PHASES.AREA_COMPLETE;
  }

  // Server owns the canonical `run.rooms` spine; the client (which never
  // receives `run.rooms`) carries the current room on `state.room`, kept in
  // sync from `exploreRunway.preparedRooms` by the room-reveal buffer.
  const currentRoom = run.rooms?.[run.currentRoom]
    || state.room
    || null;
  if (currentRoom) {
    if (currentRoom.type === 'shrine'
      && !currentRoom.interacted
      && currentRoom.shrine?.completed !== true
      && currentRoom.shrine?.used !== true) return 'shrine';
    if (currentRoom.type === 'quiz' && !currentRoom.interacted) return 'quiz';
    if (currentRoom.type === 'wordDiscovery' && !currentRoom.interacted) return PHASES.WORD_DISCOVERY;
    if (currentRoom.type === 'dealer' && !currentRoom.interacted) return 'dealer';
    if (currentRoom.type === 'whackAMole' && !currentRoom.interacted) return PHASES.WHACK_A_MOLE;
    if (currentRoom.type === 'campfire' && currentRoom.campfire?.completed !== true) return PHASES.CAMPFIRE;
    if (currentRoom.type === 'speedReviewRoom' && !currentRoom.interacted) return PHASES.SPEED_REVIEW_ROOM;
    if (currentRoom.type === 'skillMaster' && currentRoom.skillMaster?.completed !== true) return PHASES.SKILL_MASTER;
    if (currentRoom.type === 'friendlyNpc' && !currentRoom.interacted) return PHASES.FRIENDLY_NPC;
    if (currentRoom.type === 'npcBattle' && currentRoom.npcBattle?.skillSelectionPending) return PHASES.NPC_SKILL_SELECTION;
    if ((currentRoom.type === 'encounter' || currentRoom.type === 'boss' || currentRoom.type === 'npcBattle') && !currentRoom.interacted) return PHASES.ROOM_ENCOUNTER;
    return PHASES.ROOM;
  }

  return PHASES.EXPLORING;
}

