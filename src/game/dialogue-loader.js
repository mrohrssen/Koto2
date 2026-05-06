import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

let _frames = [];
let _barkPool = {};
let _cidScripts = [];
let _npcLines = {};
let _shopPurchaseFrames = [];
let _shopGreetingFrames = [];
let _shrineGreetingFrames = [];
let _gameMasterAskFrames = [];
let _gameMasterFinishFrames = [];
let _befriendFrames = {
  wait: [],
  name: [],
  success: [],
  wrong: [],
};
let _npcDefeatFrames = [];
let _skillSelectFrame = null;
let _gameMasterYesFrame = null;
let _gameMasterNoFrame = null;

export function loadDialoguePools(dataDir) {
  const framesPath = join(dataDir, 'dialogue', 'frames.json');
  if (!existsSync(framesPath)) {
    console.warn('[Dialogue] frames.json not found');
    return;
  }
  _frames = JSON.parse(readFileSync(framesPath, 'utf-8'));
  console.log(`[Dialogue] Loaded ${_frames.length} frames from frames.json`);

  // Partition by category
  _shopPurchaseFrames = _frames.filter(f => f.category === 'shopPurchase');
  _shopGreetingFrames = _frames.filter(f => f.category === 'shopGreeting');
  _shrineGreetingFrames = _frames.filter(f => f.category === 'shrineGreeting');
  _gameMasterAskFrames = _frames.filter(f => f.category === 'gameMaster_ask');
  _gameMasterFinishFrames = _frames.filter(f => f.category === 'gameMaster_finish');
  _npcDefeatFrames = _frames.filter(f => f.category === 'npcDefeat');
  _skillSelectFrame = _frames.find(f => f.category === 'skill_select') || null;
  _gameMasterYesFrame = _frames.find(f => f.category === 'gameMaster_yes') || null;
  _gameMasterNoFrame = _frames.find(f => f.category === 'gameMaster_no') || null;

  // Barks: category "bark_<trigger>" → grouped by trigger
  _barkPool = {};
  for (const f of _frames) {
    if (!f.category.startsWith('bark_')) continue;
    const trigger = f.category.slice(5); // "bark_onHit" → "onHit"
    if (!_barkPool[trigger]) _barkPool[trigger] = [];
    _barkPool[trigger].push(f);
  }

  // CID scripts: category "cid", grouped by group field
  const cidByGroup = {};
  for (const f of _frames) {
    if (f.category !== 'cid') continue;
    const group = f.group || f.id;
    if (!cidByGroup[group]) cidByGroup[group] = [];
    cidByGroup[group].push(f);
  }
  _cidScripts = Object.entries(cidByGroup).map(([id, lines]) => ({ id, lines }));

  // NPC lines: category "npc", grouped by group field "<npcId>_<slot>"
  _npcLines = {};
  for (const f of _frames) {
    if (f.category !== 'npc') continue;
    const group = f.group || '';
    const sepIdx = group.indexOf('_');
    if (sepIdx < 0) continue;
    const npcId = group.slice(0, sepIdx);
    const slot = group.slice(sepIdx + 1);
    if (!_npcLines[npcId]) _npcLines[npcId] = {};
    if (!_npcLines[npcId][slot]) _npcLines[npcId][slot] = [];
    _npcLines[npcId][slot].push(f);
  }

  // Befriend frames: category "befriend_wait", "befriend_name", "befriend_success", "befriend_wrong"
  _befriendFrames = {
    wait: _frames.filter(f => f.category === 'befriend_wait'),
    name: _frames.filter(f => f.category === 'befriend_name'),
    success: _frames.filter(f => f.category === 'befriend_success'),
    wrong: _frames.filter(f => f.category === 'befriend_wrong'),
  };
}

export function getBarkPool() { return _barkPool; }
export function getCidScripts() { return _cidScripts; }
export function getNpcLines() { return _npcLines; }
export function getShopPurchaseFrames() { return _shopPurchaseFrames; }
export function getShopGreetingFrames() { return _shopGreetingFrames; }
export function getShrineGreetingFrames() { return _shrineGreetingFrames; }
export function getGameMasterAskFrames() { return _gameMasterAskFrames; }
export function getGameMasterFinishFrames() { return _gameMasterFinishFrames; }
export function getBefriendFrames() { return _befriendFrames; }
export function getNpcDefeatFrames() { return _npcDefeatFrames; }
export function getSkillSelectFrame() { return _skillSelectFrame; }
export function getGameMasterYesFrame() { return _gameMasterYesFrame; }
export function getGameMasterNoFrame() { return _gameMasterNoFrame; }

export function getDialogueWordSet() {
  const words = new Set();
  for (const frame of _frames) {
    for (const w of (frame.words || [])) words.add(w);
  }
  return words;
}
