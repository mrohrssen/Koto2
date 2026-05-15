import {
  actionIconUrlFromSlug,
  backgroundImageUrl,
  creatureStaticUrl,
  itemSpriteUrl,
  npcSpriteUrl,
  spriteUrl,
} from './asset-urls.js';
import { createAssetPreloader } from './asset-preloader.js';
import { startAssetManifestLoad } from './asset-manifest.js';

const UNSAFE_EFFECTIVE_TYPES = new Set(['slow-2g', '2g']);

export const backgroundAssetPreloader = createAssetPreloader({ concurrency: 1 });

export function toAbsoluteAssetUrl(url, origin = globalThis.location?.origin) {
  const absolute = new URL(url, origin);
  absolute.hash = '';
  return absolute.href;
}

function addUrl(urls, url) {
  if (typeof url === 'string' && url.includes('.webp')) urls.add(url);
}

export function collectManifestWebpUrls(manifest) {
  const urls = new Set();

  for (const [id, entry] of Object.entries(manifest?.creatures || {})) {
    if (entry?.static) addUrl(urls, creatureStaticUrl(id));
    addUrl(urls, entry?.animated?.idle);
    addUrl(urls, entry?.animated?.walk);
  }

  for (const [folder, names] of Object.entries(manifest?.backgrounds || {})) {
    if (!Array.isArray(names)) continue;
    for (const name of names) addUrl(urls, backgroundImageUrl([folder, name]));
  }

  for (const slug of manifest?.actions || []) addUrl(urls, actionIconUrlFromSlug(slug));
  for (const id of manifest?.items || []) addUrl(urls, itemSpriteUrl(id));
  for (const id of manifest?.npcs || []) addUrl(urls, npcSpriteUrl(id));
  for (const id of manifest?.objects || []) addUrl(urls, spriteUrl(['objects', id]));

  return [...urls];
}

export function shouldRunBackgroundAssetWarmup({
  navigatorLike = globalThis.navigator,
  cachesImpl = globalThis.caches,
  serviceWorkerLike = globalThis.navigator?.serviceWorker,
} = {}) {
  if (!cachesImpl?.match) return false;
  if (navigatorLike?.onLine === false) return false;
  if (!serviceWorkerLike?.controller) return false;

  const connection = navigatorLike?.connection;
  if (connection?.saveData) return false;
  if (UNSAFE_EFFECTIVE_TYPES.has(connection?.effectiveType)) return false;

  return true;
}

export async function findUncachedUrls(urls, cachesImpl = globalThis.caches, origin = globalThis.location?.origin) {
  if (!cachesImpl?.match) return [];
  const absoluteUrls = [...new Set(urls.map(url => toAbsoluteAssetUrl(url, origin)))];
  const results = await Promise.all(absoluteUrls.map(async (url) => {
    const cached = await cachesImpl.match(url);
    return cached ? null : url;
  }));
  return results.filter(Boolean);
}

export async function startBackgroundAssetWarmup({
  manifestPromise = startAssetManifestLoad(),
  preloader = backgroundAssetPreloader,
  navigatorLike = globalThis.navigator,
  cachesImpl = globalThis.caches,
  serviceWorkerLike = globalThis.navigator?.serviceWorker,
  origin = globalThis.location?.origin,
} = {}) {
  if (!shouldRunBackgroundAssetWarmup({ navigatorLike, cachesImpl, serviceWorkerLike })) {
    return { started: false, enqueued: 0 };
  }

  try {
    await serviceWorkerLike?.ready;
    const manifest = await manifestPromise;
    const urls = collectManifestWebpUrls(manifest);
    const uncachedUrls = await findUncachedUrls(urls, cachesImpl, origin);
    preloader.enqueue(uncachedUrls, { priority: 'normal' });
    return { started: true, enqueued: uncachedUrls.length };
  } catch {
    return { started: false, enqueued: 0 };
  }
}
