import sharp from 'sharp';
import { FLOOR_BAND, SKY_KEY } from './config.mjs';

function isKeyPixel(r, g, b, key = SKY_KEY) {
  const exactKey = Math.abs(r - key.r) <= key.tolerance
    && Math.abs(g - key.g) <= key.tolerance
    && Math.abs(b - key.b) <= key.tolerance;
  const nearGeneratedWhite = r >= 232 && g >= 232 && b >= 232;
  return exactKey || nearGeneratedWhite;
}

export async function chromaKeyBattleground({
  inputPath,
  outputPath,
  floorTopRatio = FLOOR_BAND.topRatio,
} = {}) {
  if (!inputPath || !outputPath) {
    throw new Error('chromaKeyBattleground requires inputPath and outputPath.');
  }

  const image = sharp(inputPath).ensureAlpha();
  const metadata = await image.metadata();
  const { width = 0, height = 0 } = metadata;
  const pixels = await image.raw().toBuffer();
  const floorTopY = Math.round(height * floorTopRatio);
  let keyedPixels = 0;
  let floorKeyedPixels = 0;

  for (let offset = 0; offset < pixels.length; offset += 4) {
    const pixelIndex = offset / 4;
    const y = Math.floor(pixelIndex / width);
    if (isKeyPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2])) {
      keyedPixels += 1;
      if (y >= floorTopY) floorKeyedPixels += 1;
      pixels[offset + 3] = 0;
    }
  }

  if (floorKeyedPixels > 0) {
    throw new Error(`Sky key leaked into playable floor (${floorKeyedPixels} pixels).`);
  }

  await sharp(pixels, { raw: { width, height, channels: 4 } })
    .png()
    .toFile(outputPath);

  return {
    width,
    height,
    keyedPixels,
    floorKeyedPixels,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [inputPath, outputPath] = process.argv.slice(2);
  const result = await chromaKeyBattleground({ inputPath, outputPath });
  console.log(JSON.stringify(result, null, 2));
}
