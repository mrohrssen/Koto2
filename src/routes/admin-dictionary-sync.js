import { simpleGit } from 'simple-git';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DEFAULT_WORKING_REPO = '/app/persist/.dictionary-repo';
const DEFAULT_BRANCH = 'dictionary';
const IN_REPO_PATH = 'data/live-dictionary.json';
const AUTHOR_NAME = 'koto-dictionary-bot';
const AUTHOR_EMAIL = 'bot@koto.invalid';

const status = {
  lastCommit: null,  // { word, sha, at }
  lastError: null,   // { word, error, at }
  queueDepth: 0,
};

let queue = Promise.resolve();

function remoteUrlFromToken(token, repoSlug) {
  return `https://x-access-token:${token}@github.com/${repoSlug}.git`;
}

async function ensureWorkingRepo({ workingRepoDir, remoteUrl, branch }) {
  if (!existsSync(workingRepoDir)) {
    mkdirSync(dirname(workingRepoDir), { recursive: true });
    await simpleGit().clone(remoteUrl, workingRepoDir, ['--branch', branch, '--depth', '1']);
  }
  return simpleGit(workingRepoDir);
}

/**
 * Perform a single sync:
 *   - ensure working repo exists (clone if absent)
 *   - fetch + reset hard to latest branch tip
 *   - copy liveDictPath into the repo at IN_REPO_PATH
 *   - commit + push
 *
 * @param {object} opts
 * @param {string} opts.liveDictPath
 * @param {string} opts.workingRepoDir
 * @param {string} opts.remoteUrl
 * @param {string} opts.branch
 * @param {string} opts.word
 * @param {string} [opts.authorName]
 * @param {string} [opts.authorEmail]
 * @returns {Promise<{ ok: boolean, sha?: string, error?: string }>}
 */
export async function runDictionarySync({
  liveDictPath,
  workingRepoDir,
  remoteUrl,
  branch,
  word,
  authorName = AUTHOR_NAME,
  authorEmail = AUTHOR_EMAIL,
}) {
  try {
    const git = await ensureWorkingRepo({ workingRepoDir, remoteUrl, branch });
    await git.addConfig('user.email', authorEmail);
    await git.addConfig('user.name', authorName);

    await git.fetch('origin', branch);
    await git.reset(['--hard', `origin/${branch}`]);

    const targetPath = join(workingRepoDir, IN_REPO_PATH);
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(liveDictPath, targetPath);

    await git.add(IN_REPO_PATH);
    const commitResult = await git.commit(`dict: edit ${word}`);
    if (!commitResult.commit) {
      // Nothing to commit (identical contents). Treat as success no-op.
      return { ok: true, sha: null };
    }
    await git.push('origin', branch);
    return { ok: true, sha: commitResult.commit };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Enqueue a sync. Runs serially. Retries up to 3 times with exponential backoff.
 */
export function enqueueDictionarySync(word, overrides = {}) {
  const token = process.env.DICTIONARY_BOT_GITHUB_TOKEN;
  const repoSlug = process.env.DICTIONARY_REPO_SLUG; // e.g. "anthropic/jrpg"
  const workingRepoDir = overrides.workingRepoDir || DEFAULT_WORKING_REPO;
  const branch = overrides.branch || DEFAULT_BRANCH;
  const liveDictPath = overrides.liveDictPath || '/app/persist/live-dictionary.json';

  if (!token || !repoSlug) {
    status.lastError = { word, error: 'DICTIONARY_BOT_GITHUB_TOKEN or DICTIONARY_REPO_SLUG not set', at: new Date().toISOString() };
    return;
  }

  const remoteUrl = overrides.remoteUrl || remoteUrlFromToken(token, repoSlug);

  status.queueDepth++;
  queue = queue.then(async () => {
    try {
      for (let attempt = 1; attempt <= 3; attempt++) {
        const r = await runDictionarySync({ liveDictPath, workingRepoDir, remoteUrl, branch, word });
        if (r.ok) {
          status.lastCommit = { word, sha: r.sha, at: new Date().toISOString() };
          status.lastError = null;
          return;
        }
        if (attempt === 3) {
          status.lastError = { word, error: r.error, at: new Date().toISOString() };
          return;
        }
        await new Promise(res => setTimeout(res, 500 * 2 ** (attempt - 1)));
      }
    } finally {
      status.queueDepth--;
    }
  });
}

export function getSyncStatus() {
  return { ...status };
}
