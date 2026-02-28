import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Creates an isolated temp directory for a test.
 * Call cleanup() in afterEach/after to remove it.
 */
export async function createTestTmpDir(prefix = 'koto-test-') {
  const path = await mkdtemp(join(tmpdir(), prefix));
  return {
    path,
    async cleanup() {
      await rm(path, { recursive: true, force: true });
    }
  };
}
