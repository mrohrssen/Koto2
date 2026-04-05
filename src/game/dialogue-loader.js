// src/game/dialogue-loader.js
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

let cidScripts = [];
let npcLines = {};
let barkPool = {};

export function loadDialoguePools(dataDir) {
  const dialogueDir = join(dataDir, 'dialogue');

  const cidPath = join(dialogueDir, 'cid-scripts.json');
  if (existsSync(cidPath)) {
    cidScripts = JSON.parse(readFileSync(cidPath, 'utf-8'));
    console.log(`[Dialogue] Loaded ${cidScripts.length} CID scripts`);
  }

  const npcPath = join(dialogueDir, 'npc-lines.json');
  if (existsSync(npcPath)) {
    npcLines = JSON.parse(readFileSync(npcPath, 'utf-8'));
    console.log(`[Dialogue] Loaded NPC lines for ${Object.keys(npcLines).length} NPCs`);
  }

  const barksPath = join(dialogueDir, 'barks.json');
  if (existsSync(barksPath)) {
    barkPool = JSON.parse(readFileSync(barksPath, 'utf-8'));
    console.log(`[Dialogue] Loaded bark pool with ${Object.keys(barkPool).length} triggers`);
  }
}

export function getCidScripts() { return cidScripts; }
export function getNpcLines() { return npcLines; }
export function getBarkPool() { return barkPool; }

export function getDialogueWordSet() {
  const words = new Set();
  for (const script of cidScripts) {
    for (const line of script.lines) {
      for (const w of (line._contentWords || [])) words.add(w);
    }
  }
  for (const npc of Object.values(npcLines)) {
    for (const slot of Object.values(npc)) {
      if (!Array.isArray(slot)) continue;
      for (const line of slot) {
        for (const w of (line._contentWords || [])) words.add(w);
      }
    }
  }
  for (const trigger of Object.values(barkPool)) {
    if (!Array.isArray(trigger)) continue;
    for (const line of trigger) {
      for (const w of (line._contentWords || [])) words.add(w);
    }
  }
  return words;
}
