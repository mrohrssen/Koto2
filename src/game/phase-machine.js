/**
 * @fileoverview Phase State Machine for game state transitions
 * @module src/game/phase-machine
 *
 * PURPOSE:
 * Centralizes game phase logic into an explicit state machine with valid
 * transitions. Extracts phase derivation from GameManager to enable:
 * - Clear documentation of all game phases
 * - Validation of phase transitions
 * - Easier testing of phase logic
 *
 * KEY EXPORTS:
 * - PHASES (object) - All valid game phase constants
 * - VALID_TRANSITIONS (object) - Map of phase -> valid next phases
 * - canTransition(from, to) - Check if transition is valid
 * - derivePhase(state) - Derive current phase from game state
 */

export const PHASES = {
  NO_SAVE: 'no_save',
  HUB: 'hub',
  LEVEL_SELECT: 'level_select',
  RUN_ENDED: 'run_ended',

  AREA_SELECTION: 'area_selection',
  AREA_COMPLETE: 'area_complete',
  EXPLORING: 'exploring',

  ROOM: 'room',
  ROOM_ENCOUNTER: 'room_encounter',
  WORD_DISCOVERY: 'wordDiscovery',
  DEALER: 'dealer',
  BRANCH_SELECTION: 'branch_selection',

  COMBAT: 'combat',
  VICTORY: 'victory',
  DEFEAT: 'defeat',
  NPC_DIALOGUE: 'npc_dialogue',

  SHOP: 'shop',
  BLACKSMITH: 'blacksmith',
  POST_COMBAT_SHOP: 'post_combat_shop',

  RUN_COMPLETE: 'run_complete'
};

export const VALID_TRANSITIONS = {
  [PHASES.NO_SAVE]: [PHASES.HUB],

  [PHASES.HUB]: [
    PHASES.LEVEL_SELECT,
    PHASES.AREA_SELECTION,
    PHASES.SHOP,
    PHASES.BLACKSMITH
  ],

  [PHASES.LEVEL_SELECT]: [
    PHASES.HUB,
    PHASES.AREA_SELECTION
  ],

  [PHASES.AREA_SELECTION]: [
    PHASES.EXPLORING,
    PHASES.ROOM
  ],

  [PHASES.EXPLORING]: [
    PHASES.ROOM,
    PHASES.ROOM_ENCOUNTER,
    PHASES.COMBAT,
    PHASES.SHOP,
    PHASES.BLACKSMITH
  ],

  [PHASES.ROOM]: [
    PHASES.ROOM,
    PHASES.ROOM_ENCOUNTER,
    PHASES.COMBAT,
    PHASES.SHOP,
    PHASES.BLACKSMITH,
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
    PHASES.RUN_COMPLETE
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

  [PHASES.BLACKSMITH]: [
    PHASES.ROOM,
    PHASES.EXPLORING,
    PHASES.HUB
  ],

  [PHASES.AREA_COMPLETE]: [
    PHASES.AREA_SELECTION,
    PHASES.RUN_COMPLETE
  ],

  [PHASES.RUN_COMPLETE]: [
    PHASES.HUB,
    PHASES.LEVEL_SELECT
  ],

  [PHASES.RUN_ENDED]: [
    PHASES.HUB,
    PHASES.LEVEL_SELECT
  ]
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
  if (run.pendingBranch) return PHASES.BRANCH_SELECTION;
  if (combat?.active) return PHASES.COMBAT;
  if (run.npcDialogue?.active) return PHASES.NPC_DIALOGUE;
  if (run.postCombatShop?.active) return PHASES.POST_COMBAT_SHOP;
  if (run.gameVictoryPending) return PHASES.RUN_COMPLETE;

  if (run.areaCleared) {
    if (run.areasCompleted >= run.areasToWin) return PHASES.RUN_COMPLETE;
    return PHASES.AREA_COMPLETE;
  }

  const currentRoom = run.rooms?.[run.currentRoom];
  if (currentRoom) {
    if (currentRoom.type === 'shrine' && !currentRoom.interacted) return 'shrine';
    if (currentRoom.type === 'quiz' && !currentRoom.interacted) return 'quiz';
    if (currentRoom.type === 'wordDiscovery' && !currentRoom.interacted) return PHASES.WORD_DISCOVERY;
    if (currentRoom.type === 'dealer' && !currentRoom.interacted) return 'dealer';
    if (currentRoom.type === 'encounter' && !currentRoom.interacted) return PHASES.ROOM_ENCOUNTER;
    return PHASES.ROOM;
  }

  return PHASES.EXPLORING;
}

export function getPhaseName(phase) {
  const names = {
    [PHASES.NO_SAVE]: 'No Save',
    [PHASES.HUB]: 'Hub',
    [PHASES.RUN_ENDED]: 'Run Ended',
    [PHASES.AREA_SELECTION]: 'Area Selection',
    [PHASES.AREA_COMPLETE]: 'Area Complete',
    [PHASES.EXPLORING]: 'Exploring',
    [PHASES.ROOM]: 'Room',
    [PHASES.ROOM_ENCOUNTER]: 'Room Encounter',
    [PHASES.COMBAT]: 'Combat',
    [PHASES.VICTORY]: 'Victory',
    [PHASES.DEFEAT]: 'Defeat',
    [PHASES.NPC_DIALOGUE]: 'NPC Dialogue',
    [PHASES.SHOP]: 'Shop',
    [PHASES.BLACKSMITH]: 'Blacksmith',
    [PHASES.POST_COMBAT_SHOP]: 'Post-Combat Shop',
    [PHASES.LEVEL_SELECT]: 'Level Select',
    [PHASES.RUN_COMPLETE]: 'Run Complete'
  };
  return names[phase] || phase;
}
