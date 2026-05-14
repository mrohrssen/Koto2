import { preloadImage } from './asset-loader.js';

function defaultScheduleIdle(fn) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: 1500 });
  } else {
    setTimeout(fn, 0);
  }
}

export function createAssetPreloader({
  concurrency = 2,
  loadImage = preloadImage,
  scheduleIdle = defaultScheduleIdle,
} = {}) {
  const queued = [];
  const seen = new Set();
  const inFlight = new Set();
  let pumping = false;

  function enqueue(urls, { priority = 'normal' } = {}) {
    for (const url of urls.filter(Boolean)) {
      if (seen.has(url)) continue;
      seen.add(url);
      if (priority === 'immediate') queued.unshift(url);
      else queued.push(url);
    }
    pump();
  }

  function pump() {
    if (pumping) return;
    pumping = true;
    scheduleIdle(() => {
      pumping = false;
      while (inFlight.size < concurrency && queued.length) {
        const url = queued.shift();
        const promise = loadImage(url).catch(() => {}).finally(() => {
          inFlight.delete(promise);
          pump();
        });
        inFlight.add(promise);
      }
    });
  }

  async function flushForTests() {
    while (queued.length || inFlight.size || pumping) {
      await Promise.resolve();
      await Promise.allSettled([...inFlight]);
    }
  }

  return { enqueue, flushForTests };
}

export const assetPreloader = createAssetPreloader();
