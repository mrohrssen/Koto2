import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _npcCache = null;

/**
 * Reads and caches data/npcs.json, returns the full NPC object.
 */
export function loadNpcs() {
  if (!_npcCache) {
    _npcCache = JSON.parse(readFileSync(join(__dirname, '../../../data/npcs.json'), 'utf8'));
  }
  return _npcCache;
}

/**
 * Picks a random NPC from roster, avoids IDs in alreadyUsedNpcIds.
 * Falls back to any NPC if all are used.
 */
export function selectNpcForEncounter(areaNumber, alreadyUsedNpcIds) {
  const npcs = loadNpcs();
  const allEntries = Object.values(npcs);
  const usedSet = new Set(alreadyUsedNpcIds);

  let available = allEntries.filter(npc => !usedSet.has(npc.id));

  // Fall back to full roster if all are used
  if (available.length === 0) {
    available = allEntries;
  }

  const idx = Math.floor(Math.random() * available.length);
  return available[idx];
}

/**
 * Takes array of 3 options [{text, tone}, ...], returns
 * { shuffled: [{text}, ...], toneMap: [tone, tone, tone] }
 * using Fisher-Yates shuffle. The shuffled array strips the tone field.
 */
export function shuffleOptions(options) {
  // Create paired copies for shuffling
  const paired = options.map(o => ({ text: o.text, tone: o.tone }));

  // Fisher-Yates shuffle
  for (let i = paired.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [paired[i], paired[j]] = [paired[j], paired[i]];
  }

  return {
    shuffled: paired.map(({ text }) => ({ text })),
    toneMap: paired.map(({ tone }) => tone)
  };
}

/**
 * Returns meta.npcBonds[npcId] or null.
 */
export function getNpcBond(meta, npcId) {
  if (!meta.npcBonds) return null;
  return meta.npcBonds[npcId] || null;
}

function ensureBondEntry(meta, npcId) {
  if (!meta.npcBonds) {
    meta.npcBonds = {};
  }
  if (!meta.npcBonds[npcId]) {
    meta.npcBonds[npcId] = { bond: 0, encounters: 0, lastInteraction: null };
  }
  return meta.npcBonds[npcId];
}

/**
 * Adds delta to bond, creates entry if missing. Returns the updated entry.
 */
export function updateBond(meta, npcId, delta) {
  const entry = ensureBondEntry(meta, npcId);
  entry.bond += delta;
  return entry;
}

/**
 * Increments encounters count, sets lastInteraction to today's date string (YYYY-MM-DD).
 * Creates entry if missing.
 */
export function recordEncounter(meta, npcId) {
  const entry = ensureBondEntry(meta, npcId);
  entry.encounters += 1;
  entry.lastInteraction = new Date().toISOString().slice(0, 10);
  return entry;
}
