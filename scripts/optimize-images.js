#!/usr/bin/env node

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

const ASSETS_DIR = path.join(process.cwd(), 'public/assets');
const QUALITY = 80;

async function findPngFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findPngFiles(fullPath));
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
      files.push(fullPath);
    }
  }

  return files;
}

async function shouldConvert(pngPath, webpPath) {
  try {
    const [pngStat, webpStat] = await Promise.all([
      fs.stat(pngPath),
      fs.stat(webpPath)
    ]);
    // Skip if WebP exists and is newer than PNG
    return webpStat.mtime < pngStat.mtime;
  } catch {
    // WebP doesn't exist, need to convert
    return true;
  }
}

async function convertToWebP(pngPath) {
  const webpPath = pngPath.replace(/\.png$/i, '.webp');

  if (!await shouldConvert(pngPath, webpPath)) {
    return { skipped: true, pngPath };
  }

  const pngStat = await fs.stat(pngPath);
  const pngSize = pngStat.size;

  await sharp(pngPath)
    .webp({ quality: QUALITY })
    .toFile(webpPath);

  const webpStat = await fs.stat(webpPath);
  const webpSize = webpStat.size;

  return {
    skipped: false,
    pngPath,
    webpPath,
    pngSize,
    webpSize,
    saved: pngSize - webpSize
  };
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

async function main() {
  console.log('Scanning for PNG files in', ASSETS_DIR);

  const pngFiles = await findPngFiles(ASSETS_DIR);
  console.log(`Found ${pngFiles.length} PNG files\n`);

  let converted = 0;
  let skipped = 0;
  let totalPngSize = 0;
  let totalWebpSize = 0;
  let totalSaved = 0;

  for (const pngPath of pngFiles) {
    const relativePath = path.relative(ASSETS_DIR, pngPath);

    try {
      const result = await convertToWebP(pngPath);

      if (result.skipped) {
        skipped++;
        process.stdout.write('.');
      } else {
        converted++;
        totalPngSize += result.pngSize;
        totalWebpSize += result.webpSize;
        totalSaved += result.saved;

        const reduction = ((result.saved / result.pngSize) * 100).toFixed(0);
        console.log(`✓ ${relativePath}: ${formatBytes(result.pngSize)} → ${formatBytes(result.webpSize)} (-${reduction}%)`);
      }
    } catch (err) {
      console.error(`✗ ${relativePath}: ${err.message}`);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Converted: ${converted} files`);
  console.log(`Skipped: ${skipped} files (already up to date)`);

  if (converted > 0) {
    console.log(`Total PNG size: ${formatBytes(totalPngSize)}`);
    console.log(`Total WebP size: ${formatBytes(totalWebpSize)}`);
    console.log(`Total saved: ${formatBytes(totalSaved)} (${((totalSaved / totalPngSize) * 100).toFixed(0)}% reduction)`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
