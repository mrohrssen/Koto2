import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dataPath } from '../data-dir.js';
const MAX_LOG_ENTRIES = 5;

function emptyNpcState() {
  return {
    counters: { encounters: 0, defeats: 0, liberations: 0 },
    flags: { liberated: false, befriended: false, betrayed: false },
    encounterLog: [],
    narrative: '',
    bond: 0,
    lastEncounter: null
  };
}

export class NpcMemory {
  constructor({ userId, inMemory = false } = {}) {
    this._inMemory = inMemory;
    this._userId = userId;
    this._data = {};

    if (!inMemory && userId) {
      this._filePath = dataPath(`npc-memory-${userId}.json`);
      this._load();
    }
  }

  _load() {
    if (this._inMemory || !this._filePath) return;
    if (existsSync(this._filePath)) {
      try {
        this._data = JSON.parse(readFileSync(this._filePath, 'utf8'));
      } catch {
        this._data = {};
      }
    }
  }

  _save() {
    if (this._inMemory || !this._filePath) return;
    writeFileSync(this._filePath, JSON.stringify(this._data, null, 2));
  }

  _ensure(npcId) {
    if (!this._data[npcId]) {
      this._data[npcId] = emptyNpcState();
    }
    return this._data[npcId];
  }

  getMemory(npcId) {
    return this._data[npcId] || emptyNpcState();
  }

  logEncounter(npcId, outcome, summary) {
    const state = this._ensure(npcId);
    state.counters.encounters++;
    state.encounterLog.push({
      outcome,
      summary,
      timestamp: new Date().toISOString()
    });
    if (state.encounterLog.length > MAX_LOG_ENTRIES) {
      state.encounterLog = state.encounterLog.slice(-MAX_LOG_ENTRIES);
    }
    state.lastEncounter = new Date().toISOString();
    this._save();
  }

  setFlag(npcId, flag, value) {
    const state = this._ensure(npcId);
    state.flags[flag] = value;
    if (flag === 'liberated' && value) {
      state.counters.liberations++;
    }
    this._save();
  }

  updateBond(npcId, delta) {
    const state = this._ensure(npcId);
    state.bond += delta;
    this._save();
  }

  setNarrative(npcId, narrative) {
    const state = this._ensure(npcId);
    state.narrative = narrative;
    this._save();
  }

  incrementDefeat(npcId) {
    const state = this._ensure(npcId);
    state.counters.defeats++;
    this._save();
  }

  getAllMemories() {
    return { ...this._data };
  }
}
