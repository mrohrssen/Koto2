#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import sharp from 'sharp';

const ICON_SIZE = 128;
const MIN_GAP_WIDTH = 5;

function parseCli() {
  const { values } = parseArgs({
    options: {
      manifest: { type: 'string' },
      batch: { type: 'string' },
      grid: { type: 'string' },
      out: { type: 'string' },
      sliced: { type: 'string' },
      overwrite: { type: 'boolean' },
    },
    strict: true,
  });

  for (const key of ['manifest', 'batch', 'grid', 'out', 'sliced']) {
    if (!values[key]) throw new Error(`Missing required --${key}`);
  }

  return {
    manifestPath: values.manifest,
    batchIndex: Number(values.batch),
    gridPath: values.grid,
    outDir: values.out,
    slicedDir: values.sliced,
    overwrite: values.overwrite || false,
  };
}

function alphaAt(alpha, width, x, y) {
  return alpha[y * width + x];
}

function rowProfile(alpha, width, height) {
  return Array.from({ length: height }, (_, y) => {
    let total = 0;
    for (let x = 0; x < width; x++) {
      if (alphaAt(alpha, width, x, y) > 0) total++;
    }
    return total;
  });
}

function colProfile(alpha, width, height) {
  return Array.from({ length: width }, (_, x) => {
    let total = 0;
    for (let y = 0; y < height; y++) {
      if (alphaAt(alpha, width, x, y) > 0) total++;
    }
    return total;
  });
}

function smooth(profile) {
  return profile.map((_, index) => {
    let sum = 0;
    let count = 0;
    for (let offset = -2; offset <= 2; offset++) {
      const i = index + offset;
      if (i >= 0 && i < profile.length) {
        sum += profile[i];
        count++;
      }
    }
    return sum / count;
  });
}

function findGapSplits(profile, nSplits) {
  const smoothed = smooth(profile);
  const max = smoothed.reduce((best, value) => Math.max(best, value), 0);
  const threshold = Math.max(max * 0.05, 1);
  const gaps = [];
  let inGap = false;
  let gapStart = 0;

  for (let i = 0; i < smoothed.length; i++) {
    if (smoothed[i] < threshold && !inGap) {
      inGap = true;
      gapStart = i;
    } else if (smoothed[i] >= threshold && inGap) {
      inGap = false;
      const gapEnd = i;
      const mid = Math.floor((gapStart + gapEnd) / 2);
      if (mid > smoothed.length * 0.1 && mid < smoothed.length * 0.9 && gapEnd - gapStart >= MIN_GAP_WIDTH) {
        gaps.push({ start: gapStart, end: gapEnd, mid });
      }
    }
  }

  if (inGap) {
    const gapEnd = smoothed.length;
    const mid = Math.floor((gapStart + gapEnd) / 2);
    if (mid > smoothed.length * 0.1 && mid < smoothed.length * 0.9 && gapEnd - gapStart >= MIN_GAP_WIDTH) {
      gaps.push({ start: gapStart, end: gapEnd, mid });
    }
  }

  gaps.sort((a, b) => (b.end - b.start) - (a.end - a.start));
  const splits = gaps.slice(0, nSplits).map(gap => gap.mid).sort((a, b) => a - b);
  if (splits.length < nSplits) {
    const step = Math.floor(smoothed.length / (nSplits + 1));
    return Array.from({ length: nSplits }, (_, i) => step * (i + 1));
  }
  return splits;
}

function findContentBounds(alpha, width, x1, y1, x2, y2) {
  let left = x2;
  let right = x1;
  let top = y2;
  let bottom = y1;

  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      if (alphaAt(alpha, width, x, y) > 0) {
        left = Math.min(left, x);
        right = Math.max(right, x + 1);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y + 1);
      }
    }
  }

  if (left >= right || top >= bottom) return null;
  return { left, top, width: right - left, height: bottom - top };
}

function getBatch(manifest, batchIndex) {
  const job = manifest.jobs?.find(item => item.batchIndex === batchIndex);
  if (!job) throw new Error(`Batch ${batchIndex} not found in manifest`);
  return job.moves || [];
}

function getAlphaRange(alpha) {
  let minAlpha = 255;
  let maxAlpha = 0;
  for (const value of alpha) {
    if (value < minAlpha) minAlpha = value;
    if (value > maxAlpha) maxAlpha = value;
  }
  return { minAlpha, maxAlpha };
}

async function main() {
  const opts = parseCli();
  const manifest = JSON.parse(await readFile(opts.manifestPath, 'utf8'));
  const job = manifest.jobs?.find(item => item.batchIndex === opts.batchIndex);
  if (!job) throw new Error(`Batch ${opts.batchIndex} not found in manifest`);
  const moves = getBatch(manifest, opts.batchIndex).filter(move => !move.filler);

  const { data, info } = await sharp(opts.gridPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const alpha = Buffer.alloc(info.width * info.height);
  for (let i = 0, p = 0; i < data.length; i += info.channels, p++) {
    alpha[p] = data[i + 3];
  }

  const { minAlpha, maxAlpha } = getAlphaRange(alpha);
  if (minAlpha === 255 || maxAlpha === 0) {
    throw new Error('Scenario transparent grid has no transparent pixels; refusing to slice');
  }

  const colSplits = findGapSplits(colProfile(alpha, info.width, info.height), 2);
  const rowSplits = findGapSplits(rowProfile(alpha, info.width, info.height), 2);
  const colBounds = [0, ...colSplits, info.width];
  const rowBounds = [0, ...rowSplits, info.height];

  await mkdir(opts.outDir, { recursive: true });
  await mkdir(opts.slicedDir, { recursive: true });

  const sliced = [];
  for (const move of moves) {
    const outWebp = `${opts.outDir}/${move.slug}.webp`;
    if (existsSync(outWebp) && !opts.overwrite) {
      throw new Error(`Refusing to overwrite existing action sprite: ${move.slug}`);
    }

    const r = Math.floor(move.index / 3);
    const c = move.index % 3;
    const bounds = findContentBounds(alpha, info.width, colBounds[c], rowBounds[r], colBounds[c + 1], rowBounds[r + 1]);
    if (!bounds) throw new Error(`${move.slug}: no alpha content found in cell`);

    const scale = Math.min((ICON_SIZE * 0.88) / bounds.width, (ICON_SIZE * 0.88) / bounds.height);
    const resizedWidth = Math.max(1, Math.round(bounds.width * scale));
    const resizedHeight = Math.max(1, Math.round(bounds.height * scale));
    const left = Math.floor((ICON_SIZE - resizedWidth) / 2);
    const top = Math.floor((ICON_SIZE - resizedHeight) / 2);

    const iconPng = await sharp(opts.gridPath)
      .ensureAlpha()
      .extract(bounds)
      .resize(resizedWidth, resizedHeight, { kernel: 'lanczos3' })
      .toBuffer();

    const pngBuffer = await sharp({
      create: {
        width: ICON_SIZE,
        height: ICON_SIZE,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([{ input: iconPng, left, top }])
      .png()
      .toBuffer();

    const slicedPng = `${opts.slicedDir}/${move.slug}.png`;
    await writeFile(slicedPng, pngBuffer);
    await sharp(pngBuffer).webp({ quality: 90 }).toFile(outWebp);
    sliced.push({ slug: move.slug, png: slicedPng, webp: outWebp });
    console.log(`Wrote ${move.slug} -> ${outWebp}`);
  }

  job.results = {
    ...(job.results || {}),
    sliced,
    savedAt: new Date().toISOString(),
  };
  await writeFile(opts.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
