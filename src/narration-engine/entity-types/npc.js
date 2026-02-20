// Stub — populated in Task 2
export const cachePrefix = 'npc-dialogue-cache';
export const memoryPrefix = 'npc-memory';
export const requiredCardFields = ['id', 'name', 'nameEn', 'personality', 'exampleDialogue', 'goals'];
export function validateShape(obj) { return { valid: false, errors: ['stub'] }; }
export function extractStrings(dialogue) { return []; }
export function buildRepairInstruction(violations) { return ''; }
export function assemblePrompt(params) { return { systemBlocks: [], userPrompt: '' }; }
export function getPreviousLines(cached) { return []; }
export function getMemorySnapshot(mem) { return {}; }
