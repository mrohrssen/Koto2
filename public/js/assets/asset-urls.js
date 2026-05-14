import {
  SPRITE_VERSION,
  BACKGROUND_VERSION,
  AUDIO_VERSION,
} from '../../../src/shared/asset-versions.js';

export { SPRITE_VERSION, BACKGROUND_VERSION, AUDIO_VERSION };

function encodePathSegment(value) {
  return encodeURIComponent(String(value));
}

export function withVersion(path, version) {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}v=${version}`;
}

export function actionIconSlug(nameEn = '') {
  return String(nameEn)
    .split(';')[0]
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

export function creatureStaticUrl(id) {
  return withVersion(`/assets/sprites/creatures/${encodePathSegment(id)}.webp`, SPRITE_VERSION);
}

export function creatureIdleUrl(id) {
  return withVersion(`/assets/sprites/creatures/${encodePathSegment(id)}-idle.webp`, SPRITE_VERSION);
}

export function npcSpriteUrl(id) {
  return withVersion(`/assets/sprites/npcs/${encodePathSegment(id)}.webp`, SPRITE_VERSION);
}

export function itemSpriteUrl(id) {
  return withVersion(`/assets/sprites/items/${encodePathSegment(id)}.webp`, SPRITE_VERSION);
}

export function actionIconUrl(nameEn) {
  const slug = actionIconSlug(nameEn);
  return slug ? withVersion(`/assets/sprites/actions/${slug}.webp`, SPRITE_VERSION) : '';
}

export function backgroundLayerUrl(areaId, layerName) {
  return withVersion(`/assets/backgrounds/${encodePathSegment(areaId)}/${encodePathSegment(layerName)}.webp`, BACKGROUND_VERSION);
}

export function sfxUrl(name) {
  return withVersion(`/assets/audio/sfx/${encodePathSegment(name)}.mp3`, AUDIO_VERSION);
}

export function bgmUrl(track) {
  return withVersion(`/assets/audio/bgm/${encodePathSegment(track)}.mp3`, AUDIO_VERSION);
}
