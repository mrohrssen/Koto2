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
 *
 * USAGE:
 *   import { PHASES, derivePhase, canTransition } from './phase-machine.js';
 *
 *   const phase = derivePhase({ player, run, combat });
 *   if (canTransition(currentPhase, PHASES.COMBAT)) { ... }
 */

/**
 * All valid game phases
 * Phases represent discrete UI/interaction states
 */
export const PHASES = {
  // Meta states
  NO_SAVE: 'no_save',           // No player exists
  HUB: 'hub',                   // In town between runs
  RUN_ENDED: 'run_ended',       // Run finished (victory or defeat)

  // Run progression
  WARD_SELECTION: 'ward_selection',  // Choosing starting/next ward
  EXPLORING: 'exploring',            // In dungeon, generic exploring state

  // Room states
  ROOM: 'room',                      // In a room (general)
  ROOM_ENCOUNTER: 'room_encounter',  // Room has unhandled encounter
  BOSS_READY: 'boss_ready',          // At boss room, ready to fight

  // Combat states
  COMBAT: 'combat',             // In active battle
  VICTORY: 'victory',           // Just won combat (before rewards)
  DEFEAT: 'defeat',             // Just lost combat

  // Economy states
  SHOP: 'shop',                 // In merchant shop
  BLACKSMITH: 'blacksmith',     // At blacksmith
  POST_COMBAT_SHOP: 'post_combat_shop',  // Buying drops after combat

  // Floor progression
  FLOOR_COMPLETE: 'floor_complete',  // Boss defeated, floor cleared
  BOSS_DEFEATED: 'boss_defeated',    // Alias for floor_complete (legacy)
  RUN_COMPLETE: 'run_complete'       // Beat final boss, game won
};

/**
 * Valid phase transitions
 * Maps each phase to an array of phases it can transition to
 */
export const VALID_TRANSITIONS = {
  [PHASES.NO_SAVE]: [PHASES.HUB],

  [PHASES.HUB]: [
    PHASES.WARD_SELECTION,  // Start new run
    PHASES.SHOP,            // Visit town shop
    PHASES.BLACKSMITH       // Visit town blacksmith
  ],

  [PHASES.WARD_SELECTION]: [
    PHASES.EXPLORING,       // Enter dungeon
    PHASES.ROOM             // Enter first room
  ],

  [PHASES.EXPLORING]: [
    PHASES.ROOM,            // Enter room
    PHASES.ROOM_ENCOUNTER,  // Encounter in room
    PHASES.COMBAT,          // Start fight
    PHASES.SHOP,            // Find merchant
    PHASES.BLACKSMITH,      // Find blacksmith
    PHASES.BOSS_READY       // Reach boss room
  ],

  [PHASES.ROOM]: [
    PHASES.ROOM,            // Move to next room
    PHASES.ROOM_ENCOUNTER,  // Encounter appears
    PHASES.COMBAT,          // Start fight
    PHASES.SHOP,            // Merchant room
    PHASES.BLACKSMITH,      // Blacksmith room
    PHASES.BOSS_READY,      // Reach boss
    PHASES.EXPLORING        // Continue exploring
  ],

  [PHASES.ROOM_ENCOUNTER]: [
    PHASES.COMBAT           // Engage encounter
  ],

  [PHASES.BOSS_READY]: [
    PHASES.COMBAT           // Start boss fight
  ],

  [PHASES.COMBAT]: [
    PHASES.VICTORY,         // Win fight
    PHASES.DEFEAT,          // Lose fight
    PHASES.POST_COMBAT_SHOP // Normal enemy defeated
  ],

  [PHASES.VICTORY]: [
    PHASES.POST_COMBAT_SHOP,  // Loot drops
    PHASES.ROOM,              // Continue exploring
    PHASES.EXPLORING,         // Continue exploring
    PHASES.FLOOR_COMPLETE,    // Boss defeated
    PHASES.RUN_COMPLETE       // Final boss defeated
  ],

  [PHASES.DEFEAT]: [
    PHASES.RUN_ENDED,       // Run ends
    PHASES.HUB              // Return to hub
  ],

  [PHASES.POST_COMBAT_SHOP]: [
    PHASES.ROOM,            // Continue to next room
    PHASES.EXPLORING        // Continue exploring
  ],

  [PHASES.SHOP]: [
    PHASES.ROOM,            // Leave shop
    PHASES.EXPLORING,       // Continue exploring
    PHASES.HUB              // Return to hub (town shop)
  ],

  [PHASES.BLACKSMITH]: [
    PHASES.ROOM,            // Leave blacksmith
    PHASES.EXPLORING,       // Continue exploring
    PHASES.HUB              // Return to hub (town blacksmith)
  ],

  [PHASES.FLOOR_COMPLETE]: [
    PHASES.WARD_SELECTION,  // Choose next ward
    PHASES.RUN_COMPLETE     // Was final floor
  ],

  [PHASES.BOSS_DEFEATED]: [
    PHASES.WARD_SELECTION,  // Choose next ward
    PHASES.RUN_COMPLETE     // Was final floor
  ],

  [PHASES.RUN_COMPLETE]: [
    PHASES.HUB              // Return to hub
  ],

  [PHASES.RUN_ENDED]: [
    PHASES.HUB              // Return to hub
  ]
};

/**
 * Check if a phase transition is valid
 * @param {string} from - Current phase
 * @param {string} to - Target phase
 * @returns {boolean} True if transition is allowed
 */
export function canTransition(from, to) {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Derive the current game phase from state
 * Extracted from GameManager.getPhase() for centralized phase logic
 *
 * @param {object} state - Game state object
 * @param {object|null} state.player - Player data (null if no save)
 * @param {object|null} state.run - Current run data (null if in hub)
 * @param {object|null} state.combat - Current combat data (null if not fighting)
 * @returns {string} Current phase from PHASES
 */
export function derivePhase(state) {
  const { player, run, combat } = state;

  // No player exists
  if (!player) return PHASES.NO_SAVE;

  // No active run - in hub
  if (!run) return PHASES.HUB;

  // Run exists but not active - run ended
  if (!run.active) return PHASES.RUN_ENDED;

  // Ward selection required at start or between floors
  if (run.wardSelectionRequired) return PHASES.WARD_SELECTION;

  // In active combat
  if (combat?.active) return PHASES.COMBAT;

  // Post-combat shop active
  if (run.postCombatShop?.active) return PHASES.POST_COMBAT_SHOP;

  // Boss was just defeated
  if (run.bossDefeated) return PHASES.FLOOR_COMPLETE;

  // Room-based phases
  const currentRoom = run.rooms?.[run.currentRoom];
  if (currentRoom) {
    // At boss room
    if (currentRoom.isBossRoom) return PHASES.BOSS_READY;

    // Shrine room (not yet used)
    if (currentRoom.type === 'shrine' && !currentRoom.interacted) {
      return 'shrine';
    }

    // Quiz room (not yet rewarded)
    if (currentRoom.type === 'quiz' && !currentRoom.interacted) {
      return 'quiz';
    }

    // Room has unhandled encounter
    if (currentRoom.type === 'encounter' && !currentRoom.interacted) {
      return PHASES.ROOM_ENCOUNTER;
    }

    // Generic room state
    return PHASES.ROOM;
  }

  // Fallback for old system - boss ready if encounters complete
  if (run.encountersCompleted >= run.encountersNeeded) {
    return PHASES.BOSS_READY;
  }

  // Default exploring state
  return PHASES.EXPLORING;
}

/**
 * Get human-readable phase name (for debugging/logging)
 * @param {string} phase - Phase constant
 * @returns {string} Human-readable name
 */
export function getPhaseName(phase) {
  const names = {
    [PHASES.NO_SAVE]: 'No Save',
    [PHASES.HUB]: 'Hub',
    [PHASES.RUN_ENDED]: 'Run Ended',
    [PHASES.WARD_SELECTION]: 'Ward Selection',
    [PHASES.EXPLORING]: 'Exploring',
    [PHASES.ROOM]: 'Room',
    [PHASES.ROOM_ENCOUNTER]: 'Room Encounter',
    [PHASES.BOSS_READY]: 'Boss Ready',
    [PHASES.COMBAT]: 'Combat',
    [PHASES.VICTORY]: 'Victory',
    [PHASES.DEFEAT]: 'Defeat',
    [PHASES.SHOP]: 'Shop',
    [PHASES.BLACKSMITH]: 'Blacksmith',
    [PHASES.POST_COMBAT_SHOP]: 'Post-Combat Shop',
    [PHASES.FLOOR_COMPLETE]: 'Floor Complete',
    [PHASES.BOSS_DEFEATED]: 'Boss Defeated',
    [PHASES.RUN_COMPLETE]: 'Run Complete'
  };
  return names[phase] || phase;
}
