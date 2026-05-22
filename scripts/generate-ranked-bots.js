#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { dataPath, getDataDir } from '../src/data-dir.js';
import { getManager, saveManager, removeManager } from '../src/game/manager-registry.js';
import { createBotUsernameBatch, createBotUserRecord } from '../src/pvp/bot-account-service.js';
import {
  generateRankedBotBatch,
  generateRankedBotProfile,
  summarizeBotForReview,
  validateGeneratedBotProfile
} from '../src/pvp/bot-generation.js';
import { loadUsers } from '../src/auth/users.js';

function argValue(name, fallback = null) {
  const flag = process.argv.find(arg => arg.startsWith(`${name}=`));
  if (flag) return flag.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const count = Number(argValue('--count', '100'));
const seed = argValue('--seed', 'ranked-bots-v1');
const strengthArg = argValue('--strength', null);
const write = process.argv.includes('--write');
const usersFile = argValue('--users-file', dataPath('.jrpg-users.json'));
const outputDir = argValue('--output-dir', join(process.cwd(), 'output'));

if (!Number.isInteger(count) || count <= 0) throw new Error('--count must be a positive integer');
if (strengthArg != null && (!Number.isInteger(Number(strengthArg)) || Number(strengthArg) < 1 || Number(strengthArg) > 10)) {
  throw new Error('--strength must be an integer from 1 to 10');
}
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

const existingUsernames = new Set(loadUsers(usersFile).users.map(user => user.username));
const usernames = createBotUsernameBatch({ count, seed, existingUsernames });
const bots = strengthArg
  ? Array.from({ length: count }, (_, index) =>
      generateRankedBotProfile({ index, strength: Number(strengthArg), seed, username: usernames[index] })
    )
  : generateRankedBotBatch({ count, seed, usernames });

const invalid = bots
  .map(bot => ({ bot, validation: validateGeneratedBotProfile(bot) }))
  .filter(row => !row.validation.ok);

if (invalid.length > 0) {
  throw new Error(`Generated invalid bots: ${invalid.map(row => `${row.bot.username}:${row.validation.errors.join(',')}`).join('; ')}`);
}

if (write) {
  for (const bot of bots) {
    const user = await createBotUserRecord({
      username: bot.username,
      strength: bot.strength,
      seed: `${seed}:${bot.index}`,
      usersFile
    });
    const gm = getManager(user.id);
    gm.createPlayer(bot.username);
    gm.meta.pvpRanked = bot.ranked;
    gm.meta.pvpTeams = [bot.team, null, null];
    gm.meta.creatureCollection = [...new Set([
      ...(gm.meta.creatureCollection || []),
      ...bot.team.creatureParty.active.map(c => c.id),
      ...bot.team.creatureParty.reserves.map(c => c.id)
    ])];
    saveManager(user.id);
    removeManager(user.id);
  }
}

const review = bots.map(summarizeBotForReview);
const outputPath = join(outputDir, `${seed}-ranked-bots-review.json`);
writeFileSync(outputPath, JSON.stringify({
  seed,
  count,
  write,
  generatedAt: new Date().toISOString(),
  bots: review
}, null, 2));

console.log(JSON.stringify({ ok: true, write, count, outputPath, dataDir: getDataDir() }, null, 2));
