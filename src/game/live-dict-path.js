import { existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_VOLUME_DIR = '/app/persist';

/**
 * Resolve which live-dictionary.json path to use.
 *
 * - If the volume file already exists, return it.
 * - Else if the volume DIRECTORY exists (prod first-boot), seed the volume
 *   file from the committed repo copy, then return the volume path.
 * - Else fall back to the committed repo path (local dev, CI).
 * - Throw if neither the volume file nor the repo file exists.
 *
 * @param {object} [opts]
 * @param {string} [opts.volumeDir='/app/persist']
 * @param {string} [opts.repoDir=process.cwd()/data]
 * @returns {string} resolved absolute path to live-dictionary.json
 */
export function resolveLiveDictPath({ volumeDir = DEFAULT_VOLUME_DIR, repoDir = join(process.cwd(), 'data') } = {}) {
  const volumeFile = join(volumeDir, 'live-dictionary.json');
  const repoFile = join(repoDir, 'live-dictionary.json');

  if (existsSync(volumeFile)) return volumeFile;

  if (existsSync(volumeDir)) {
    if (!existsSync(repoFile)) {
      throw new Error(`No live-dictionary.json at ${volumeFile} and no seed at ${repoFile}`);
    }
    copyFileSync(repoFile, volumeFile);
    return volumeFile;
  }

  if (existsSync(repoFile)) return repoFile;

  throw new Error(`No live-dictionary.json at ${volumeFile} or ${repoFile}`);
}
