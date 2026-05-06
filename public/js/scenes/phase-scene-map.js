const HUB_PHASES = new Set([
  'no_save',
  'hub',
  'area_selection',
]);

const EXPLORATION_PHASES = new Set([
  'skillMaster',
]);

const EXTERNAL_PHASES = new Set([
  'combat',
  'exploring',
  'room',
  'room_encounter',
  'post_combat_shop',
  'friendlyNpc',
  'whackAMole',
  'materials',
  'campfire',
  'dealer',
  'shrine',
  'quiz',
  'wordDiscovery',
  'speedReviewRoom',
  'npc_skill_selection',
  'npc_dialogue',
  'run_complete',
  'run_ended',
  'pvp_lobby',
  'pvp_team_select',
  'pvp_arena',
]);

export function sceneKindForPhase(phase) {
  if (HUB_PHASES.has(phase)) return 'hub';
  if (EXPLORATION_PHASES.has(phase)) return 'exploration';
  if (EXTERNAL_PHASES.has(phase)) return 'external';
  return 'external';
}
