import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _npcCache = null;
let _npcSkillCache = null;

const NPC_SKILL_CHANCE = 0.25;

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
 * Reads and caches data/npc-skills.json. Same pattern as loadNpcs().
 */
export function loadNpcSkills() {
  if (!_npcSkillCache) {
    _npcSkillCache = JSON.parse(readFileSync(join(__dirname, '../../../data/npc-skills.json'), 'utf8'));
  }
  return _npcSkillCache;
}

/**
 * Returns resolved skill objects for a given NPC.
 * @param {object} npc - NPC object with optional skills[] array of skill IDs
 * @returns {object[]} Array of skill objects from npc-skills.json
 */
export function getNpcSkillsForNpc(npc) {
  if (!npc.skills?.length) return [];
  const allSkills = loadNpcSkills();
  const skillMap = new Map(allSkills.map(s => [s.id, s]));
  return npc.skills.map(id => skillMap.get(id)).filter(Boolean);
}

/**
 * 25% chance to return a random skill from the NPC's skill list, else null.
 * @param {object} npc - Full NPC object (must have .skills array of skill IDs)
 * @returns {object|null} A skill object or null
 */
export function rollNpcSkill(npc) {
  const skills = getNpcSkillsForNpc(npc);
  if (skills.length === 0) return null;
  if (Math.random() >= NPC_SKILL_CHANCE) return null;
  return skills[Math.floor(Math.random() * skills.length)];
}

/**
 * Picks the NPC assigned to areaId, skipping if already used.
 * Returns null if no matching NPC is available.
 */
export function selectNpcForEncounter(areaId, alreadyUsedNpcIds) {
  const npcs = loadNpcs();
  const allEntries = Object.values(npcs);
  const usedSet = new Set(alreadyUsedNpcIds);

  const available = allEntries.filter(npc => npc.area === areaId && !usedSet.has(npc.id));

  if (available.length === 0) {
    return null;
  }

  const idx = Math.floor(Math.random() * available.length);
  return available[idx];
}

/**
 * Takes array of 3 options [{text, tone, tts?}, ...], returns
 * { shuffled: [{text, tts?}, ...], toneMap: [tone, tone, tone] }
 * using Fisher-Yates shuffle. The shuffled array strips the tone field
 * but preserves the optional tts field.
 */
export function shuffleOptions(options) {
  // Create paired copies for shuffling
  const paired = options.map(o => ({ text: o.text, tone: o.tone, tts: o.tts }));

  // Fisher-Yates shuffle
  for (let i = paired.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [paired[i], paired[j]] = [paired[j], paired[i]];
  }

  return {
    shuffled: paired.map(({ text, tts }) => {
      const opt = { text };
      if (tts) opt.tts = tts;
      return opt;
    }),
    toneMap: paired.map(({ tone }) => tone)
  };
}

/**
 * Process an NPC dialogue round response.
 * Pure game logic extracted from the /npc-dialogue-respond route.
 *
 * @param {object} gameManager - The GameManager instance
 * @param {object} params - { roundIndex, selectedIndex }
 * @returns {object} Result object with response data, or { error, statusCode } on validation failure
 */
export function handleNpcDialogueResponse(gameManager, { roundIndex, selectedIndex }) {
  const dialogue = gameManager.run?.npcDialogue;

  if (!dialogue?.active) {
    return { error: 'No active NPC dialogue', statusCode: 400 };
  }

  if (roundIndex !== dialogue.currentRound) {
    return { error: 'Wrong round index', statusCode: 400 };
  }

  if (selectedIndex < 0 || selectedIndex > 2) {
    return { error: 'Invalid selection', statusCode: 400 };
  }

  const round = dialogue.rounds[roundIndex];
  const tone = round._toneMap[selectedIndex];
  const delta = tone === 'positive' ? 1 : tone === 'negative' ? -1 : 0;
  dialogue.totalDelta += delta;
  dialogue.currentRound++;

  const dialogueComplete = dialogue.currentRound >= 3;

  if (dialogueComplete) {
    const meta = gameManager.getMeta();
    // Clamp total bond change to +1, 0, or -1
    const totalDelta = Math.max(-1, Math.min(1, dialogue.totalDelta));
    updateBond(meta, dialogue.npcId, totalDelta);
    recordEncounter(meta, dialogue.npcId);
    const bond = meta.npcBonds[dialogue.npcId];
    const npcName = dialogue.npcData.name;
    const npcNameEn = dialogue.npcData.nameEn;
    const npcId = dialogue.npcId;

    gameManager.run.npcDialogue = null;

    // If the current room is an npcBattle room, mark skill selection as pending
    // instead of returning straight to exploring. The player must pick a party skill.
    const currentRoom = gameManager.run?.rooms?.[gameManager.run?.currentRoom];
    if (currentRoom?.type === 'npcBattle') {
      if (!currentRoom.npcBattle) currentRoom.npcBattle = {};
      currentRoom.npcBattle.skillSelectionPending = true;
    }

    return {
      tone,
      delta,
      dialogueComplete: true,
      totalDelta,
      bond: bond.bond,
      npcName,
      npcNameEn,
      npcId
    };
  }

  return {
    tone,
    delta,
    dialogueComplete: false,
    currentRound: dialogue.currentRound
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
