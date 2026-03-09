import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export function readQueue(filePath) {
  if (!existsSync(filePath)) return { jobs: [] };
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function appendJobs(filePath, newJobs, themeId) {
  const queue = readQueue(filePath);
  const created = newJobs.map(job => ({
    id: `forge_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    themeId,
    word: job.word,
    reading: job.reading || '',
    meaning: job.meaning || '',
    rank: job.rank || null,
    role: job.role,
    notes: job.notes || '',
    previousResult: job.previousResult || null,
    reforgeHistory: job.reforgeHistory || [],
    status: 'pending',
    submittedAt: new Date().toISOString()
  }));
  queue.jobs.push(...created);
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(queue, null, 2));
  return created;
}

export function readResults(filePath) {
  if (!existsSync(filePath)) return { results: [] };
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function writeResult(filePath, result) {
  const data = readResults(filePath);
  const idx = data.results.findIndex(r => r.jobId === result.jobId);
  if (idx >= 0) {
    data.results[idx] = result;
  } else {
    data.results.push(result);
  }
  ensureDir(filePath);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function updateJobStatus(filePath, jobId, status) {
  const queue = readQueue(filePath);
  const job = queue.jobs.find(j => j.id === jobId);
  if (job) {
    job.status = status;
    writeFileSync(filePath, JSON.stringify(queue, null, 2));
  }
}

export function removeResult(filePath, jobId) {
  const data = readResults(filePath);
  data.results = data.results.filter(r => r.jobId !== jobId);
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function ensureDir(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}
