#!/usr/bin/env node

import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

const USAGE = 'Usage: node scripts/network-bench/generate-report.mjs --summary output/network-bench/<run-id>/summary.json --out docs/reports/YYYY-MM-DD-dev-ios-combat-network-benchmark.md';

function parseArgs(argv) {
  const summaryIndex = argv.indexOf('--summary');
  const outIndex = argv.indexOf('--out');
  const summary = summaryIndex === -1 ? undefined : argv[summaryIndex + 1];
  const out = outIndex === -1 ? undefined : argv[outIndex + 1];

  if (!summary || !out) {
    throw new Error(USAGE);
  }

  return { summary, out };
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function numberCell(value) {
  return Number.isFinite(Number(value)) ? String(Number(value)) : '0';
}

function textCell(value) {
  const text = value === undefined || value === null || value === '' ? '-' : String(value);
  return text.replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
}

function reportDate(summary) {
  const parsed = Date.parse(summary?.generatedAt);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10);
  }

  return new Date().toISOString().slice(0, 10);
}

function categoryTable(categories = {}) {
  const rows = Object.entries(asObject(categories))
    .sort(([, a], [, b]) => Number(b?.p95Ms || 0) - Number(a?.p95Ms || 0));

  if (!rows.length) {
    return 'No captured requests.';
  }

  return [
    '| Category | Requests | Failures | p50 ms | p95 ms | max ms |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map(([category, stats]) => [
      textCell(category),
      numberCell(stats?.count),
      numberCell(stats?.failures),
      numberCell(stats?.p50Ms),
      numberCell(stats?.p95Ms),
      numberCell(stats?.maxMs),
    ].join(' | ')).map((row) => `| ${row} |`),
  ].join('\n');
}

function slowRequestTable(requests = []) {
  const rows = asArray(requests).slice(0, 10);

  if (!rows.length) {
    return 'No captured requests.';
  }

  return [
    '| Method | Path | Category | Status | Duration ms | Injected delay ms | Injected failure |',
    '| --- | --- | --- | ---: | ---: | ---: | --- |',
    ...rows.map((request) => [
      textCell(request.method),
      textCell(request.path),
      textCell(request.category),
      numberCell(request.status),
      numberCell(request.durationMs),
      numberCell(request.injectedDelayMs),
      request.injectedFailure ? 'Yes' : 'No',
    ].join(' | ')).map((row) => `| ${row} |`),
  ].join('\n');
}

function getCategoryP95(profile, categoryName) {
  return numberCell(asObject(profile.categories)[categoryName]?.p95Ms);
}

function getAssetPain(profile) {
  const categories = asObject(profile.categories);
  const assetP95s = Object.entries(categories)
    .filter(([category]) => !['api', 'tts'].includes(category))
    .map(([, stats]) => Number(stats?.p95Ms || 0));

  return String(assetP95s.length ? Math.max(...assetP95s) : 0);
}

function worstVisibleSymptom(profile) {
  const appLog = asObject(profile.appLog);
  const connectionCount = asArray(appLog.connection).length;
  const combatCount = asArray(appLog.combatTiming).length;
  const apiCount = asArray(appLog.apiTiming).length;
  const failures = Number(profile.failureCount || 0);

  if (connectionCount) {
    return `${connectionCount} connection log(s)`;
  }
  if (failures) {
    return `${failures} failed request(s)`;
  }
  if (combatCount) {
    return `${combatCount} combat timing log(s)`;
  }
  if (apiCount) {
    return `${apiCount} API timing log(s)`;
  }
  return 'No timing symptom logged';
}

function profileDelayAnchorRows(profiles) {
  const rows = asArray(profiles);

  if (!rows.length) {
    return 'No profile summaries were captured.';
  }

  return [
    '| Profile | p95 API ms | p95 TTS ms | p95 asset pain ms | Worst visible symptom |',
    '| --- | ---: | ---: | ---: | --- |',
    ...rows.map((profile) => [
      textCell(profile.profile),
      getCategoryP95(profile, 'api'),
      getCategoryP95(profile, 'tts'),
      getAssetPain(profile),
      textCell(worstVisibleSymptom(profile)),
    ].join(' | ')).map((row) => `| ${row} |`),
  ].join('\n');
}

function appLogCounts(profile) {
  const appLog = asObject(profile.appLog);
  return [
    `- API timing logs: ${asArray(appLog.apiTiming).length}`,
    `- Combat timing logs: ${asArray(appLog.combatTiming).length}`,
    `- Connection logs: ${asArray(appLog.connection).length}`,
  ].join('\n');
}

function outcomeCell(outcomes) {
  const rows = Object.entries(asObject(outcomes))
    .sort(([a], [b]) => a.localeCompare(b));

  if (!rows.length) {
    return '-';
  }

  return rows
    .map(([outcome, count]) => `${textCell(outcome)}: ${numberCell(count)}`)
    .join(', ');
}

function combatSummaryTable(profile) {
  const combat = asObject(asObject(profile.appLog).combat);

  return [
    '| Requests | Turns | Server logs | Failed turns | Max request ms | Max turn total ms | Max server total ms | Max server resolve ms | Max server save ms | Outcomes |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
    `| ${[
      numberCell(combat.requestCount),
      numberCell(combat.turnCount),
      numberCell(combat.serverCount),
      numberCell(combat.failedTurns),
      numberCell(combat.maxRequestMs),
      numberCell(combat.maxTurnTotalMs),
      numberCell(combat.maxServerTotalMs),
      numberCell(combat.maxServerResolveMs),
      numberCell(combat.maxServerSaveMs),
      outcomeCell(combat.outcomes),
    ].join(' | ')} |`,
  ].join('\n');
}

function delayBucketTable(profile) {
  const rows = Object.entries(asObject(profile.delayBuckets));

  if (!rows.length) {
    return 'No delay buckets captured.';
  }

  return [
    '| Bucket | Count | max ms |',
    '| --- | ---: | ---: |',
    ...rows.map(([bucket, stats]) => [
      textCell(bucket),
      numberCell(stats?.count),
      numberCell(stats?.maxMs),
    ].join(' | ')).map((row) => `| ${row} |`),
  ].join('\n');
}

function rawArtifacts(profiles) {
  const rows = [
    '- Run summary: `summary.json`',
    ...asArray(profiles).flatMap((profile) => {
      const name = textCell(profile.profile);
      return [
        `- ${name}: \`summary.json\``,
        `- ${name}: \`flows.jsonl\``,
        `- ${name}: \`app.log\``,
      ];
    }),
  ];

  return rows.join('\n');
}

function renderProfileSection(profile) {
  return [
    `## Profile: ${textCell(profile.profile)}`,
    '',
    `Requests: ${numberCell(profile.requestCount)}`,
    `Failures: ${numberCell(profile.failureCount)}`,
    '',
    '### Category Summary',
    '',
    categoryTable(profile.categories),
    '',
    '### Slowest Requests',
    '',
    slowRequestTable(profile.slowestRequests),
    '',
    '### App Timing Log Counts',
    '',
    appLogCounts(profile),
    '',
    '### Combat Timing Summary',
    '',
    combatSummaryTable(profile),
    '',
    '### Delay Buckets',
    '',
    delayBucketTable(profile),
  ].join('\n');
}

function renderReport(summary) {
  const profiles = asArray(summary?.profiles);

  return [
    '# Dev iOS Combat Network Benchmark Report',
    '',
    `Date: ${reportDate(summary)}`,
    `Generated At: ${textCell(summary?.generatedAt)}`,
    'App Mode: Dev iOS combat flow',
    'Network Harness: mitmproxy',
    '',
    '## Executive Summary',
    '',
    'This benchmark captures dev iOS combat flow behavior under targeted combat API and asset delay profiles. The summary connects captured requests, app timing logs, and classified delay buckets for follow-up remediation.',
    '',
    '## Setup',
    '',
    '- App mode: Dev iOS combat flow',
    '- Network harness: mitmproxy',
    '- Profiles: combat-focused profile directories present in the run artifact',
    '- Inputs: per-profile `flows.jsonl` request captures and `app.log` timing logs',
    '',
    '## Ranked Findings Rules',
    '',
    '- Rank categories by p95 latency descending.',
    '- Treat injected failures, HTTP 5xx, and status 0 as request failures.',
    '- Use the slowest-request table for concrete endpoint examples.',
    '- Use app timing log counts to connect network pain to visible player symptoms.',
    '',
    ...profiles.map(renderProfileSection).flatMap((section) => [section, '']),
    '## Profile Delay Anchor',
    '',
    profileDelayAnchorRows(profiles),
    '',
    '## Recommended Fix Themes',
    '',
    '- Placeholder: add recommendations after reviewing the captured baseline.',
    '',
    '## Raw Artifacts',
    '',
    rawArtifacts(profiles),
    '',
  ].join('\n');
}

async function main() {
  const { summary: summaryPath, out } = parseArgs(process.argv.slice(2));
  const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
  const report = renderReport(summary);

  await fs.mkdir(dirname(out), { recursive: true });
  await fs.writeFile(out, report);
  console.log(`Wrote ${out}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
