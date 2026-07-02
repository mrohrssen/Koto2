import { renameSync, unlinkSync, writeFileSync } from 'fs';

/**
 * Write a file atomically: write `${filePath}.tmp`, then rename over the
 * target. A crash mid-write can never leave a truncated target file.
 * Throws on failure (caller decides whether that is fatal); the tmp file
 * is cleaned up best-effort.
 */
export function writeFileAtomicSync(filePath, contents) {
  const tmpPath = `${filePath}.tmp`;
  try {
    writeFileSync(tmpPath, contents);
    renameSync(tmpPath, filePath);
  } catch (error) {
    try { unlinkSync(tmpPath); } catch { /* best effort */ }
    throw error;
  }
}
