#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { aggregateProfile, aggregateRun } from './summary-lib.mjs';

const USAGE = 'Usage: node scripts/network-bench/summarize-run.mjs --run-dir output/network-bench/<run-id>';

function parseArgs(argv) {
  const runDirIndex = argv.indexOf('--run-dir');
  const runDir = runDirIndex === -1 ? undefined : argv[runDirIndex + 1];

  if (!runDir) {
    throw new Error(USAGE);
  }

  return { runDir };
}

async function readTextIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

function parseJsonl(text, filePath) {
  return text
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim())
    .map(({ line, lineNumber }) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Failed to parse ${filePath}:${lineNumber}: ${error.message}`);
      }
    });
}

async function main() {
  const { runDir } = parseArgs(process.argv.slice(2));
  const entries = await fs.readdir(runDir, { withFileTypes: true });
  const profileDirs = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(runDir, entry.name))
    .sort();

  const profileSummaries = [];

  for (const profileDir of profileDirs) {
    const profile = basename(profileDir);
    const flowsPath = join(profileDir, 'flows.jsonl');
    const appLogPath = join(profileDir, 'app.log');
    const flows = parseJsonl(await readTextIfExists(flowsPath), flowsPath);
    const appLog = (await readTextIfExists(appLogPath)).split(/\r?\n/).filter(Boolean);
    const summary = aggregateProfile(profile, flows, appLog);

    await fs.writeFile(join(profileDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    profileSummaries.push(summary);
  }

  const runSummary = aggregateRun(profileSummaries);
  const outPath = join(runDir, 'summary.json');
  await fs.writeFile(outPath, `${JSON.stringify(runSummary, null, 2)}\n`);
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
