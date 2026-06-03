function hashStringToUint32(input) {
  let h = 2166136261 >>> 0;
  const text = String(input);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function createSeededRng(seed) {
  let t = hashStringToUint32(seed);
  return function rng() {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomFloat(rng, min = 0, max = 1) {
  return min + rng() * (max - min);
}

export function randomInt(rng, minInclusive, maxExclusive) {
  return Math.floor(randomFloat(rng, minInclusive, maxExclusive));
}

export function randomChoice(rng, values) {
  if (!Array.isArray(values) || values.length === 0) return undefined;
  return values[randomInt(rng, 0, values.length)];
}
