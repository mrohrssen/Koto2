import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { SPRITE_VERSION } from '../src/shared/asset-versions.js';

const ROOT = process.cwd();
const SPRITE_DIR = join(ROOT, 'public/assets/sprites');
const BG_DIR = join(ROOT, 'public/assets/backgrounds');
const OUT = join(ROOT, 'public/assets/asset-manifest.json');

function stripWebp(name) {
  return name.replace(/\.webp$/i, '');
}

function listWebp(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(name => name.endsWith('.webp'));
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function buildCreatureEntries() {
  const creatureDir = join(SPRITE_DIR, 'creatures');
  const animatedManifestPath = join(SPRITE_DIR, 'creatures-animated/manifest.json');
  const animated = existsSync(animatedManifestPath) ? readJson(animatedManifestPath).animations || {} : {};
  const creatures = {};

  for (const file of listWebp(creatureDir)) {
    if (file.endsWith('-idle.webp')) continue;
    const id = stripWebp(file);
    creatures[id] ||= { static: false };
    creatures[id].static = true;
  }

  for (const [id, entry] of Object.entries(animated)) {
    creatures[id] ||= { static: false };
    creatures[id].animated = entry;
  }

  return creatures;
}

function buildBackgroundEntries() {
  const backgrounds = {};
  if (!existsSync(BG_DIR)) return backgrounds;
  for (const areaId of readdirSync(BG_DIR)) {
    const areaPath = join(BG_DIR, areaId);
    if (!existsSync(areaPath) || !statSync(areaPath).isDirectory()) continue;
    const layers = listWebp(areaPath).map(stripWebp).sort();
    if (layers.length) backgrounds[areaId] = layers;
  }
  return backgrounds;
}

function buildActionEntries() {
  return listWebp(join(SPRITE_DIR, 'actions')).map(stripWebp).sort();
}

function buildSpriteEntries(folder) {
  return listWebp(join(SPRITE_DIR, folder)).map(stripWebp).sort();
}

const manifest = {
  version: SPRITE_VERSION,
  creatures: buildCreatureEntries(),
  backgrounds: buildBackgroundEntries(),
  actions: buildActionEntries(),
  items: buildSpriteEntries('items'),
  npcs: buildSpriteEntries('npcs'),
  objects: buildSpriteEntries('objects'),
};

writeFileSync(OUT, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${OUT}`);
