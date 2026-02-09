/**
 * @file index.js - UI Module Barrel Export
 *
 * PURPOSE:
 * Re-exports all UI modules for convenient importing. Allows other parts
 * of the codebase to import multiple UI modules from a single path.
 *
 * USAGE:
 *   import { actions, scene, combatLoop } from './ui/index.js';
 *   // Or import all:
 *   import * as ui from './ui/index.js';
 *
 * EXPORTED MODULES:
 * - actions: Bottom action area and flash cards
 * - takeover: Full-screen slide-in panels
 * - hpBar: Player HP display
 * - chipRow: Equipped chip slots
 * - scene: Background and enemy sprites
 * - character: HP bar coordinator
 * - exploration: Non-combat navigation
 * - economy: Chip shops
 * - modals: Settings panel
 * - combatLoop: Turn-based combat
 * - lookup: Japanese word lookup mode
 */

export * as actions from './actions.js';
export * as takeover from './takeover.js';
export * as hpBar from './hp-bar.js';
export * as chipRow from './chip-row.js';
export * as scene from './scene.js';
export * as character from './character.js';
export * as exploration from './exploration.js';
export * as economy from './economy.js';
export * as modals from './modals.js';
export * as combatLoop from './combat-loop.js';
export * as lookup from './lookup.js';
export * as robotRow from './robot-row.js';
export * as postCombatShop from './post-combat-shop.js';
