// Stub — populated in Task 3
export const cachePrefix = 'creature-dialogue-cache';
export const memoryPrefix = 'creature-memory';
export const requiredCardFields = ['id', 'name', 'nameEn', 'personality'];
export function validateShape(obj) { return { valid: false, errors: ['stub'] }; }
export function extractStrings(dialogue) { return []; }
export function buildRepairInstruction(violations) { return ''; }
export function assemblePrompt(params) { return { systemBlocks: [], userPrompt: '' }; }
export function getPreviousLines(cached) { return []; }
export function getMemorySnapshot(mem) { return {}; }
