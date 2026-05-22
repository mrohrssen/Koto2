import { dataPath } from '../data-dir.js';
import { loadUsers } from '../auth/users.js';
import { getManager as defaultGetManager, saveManager as defaultSaveManager, removeManager as defaultRemoveManager } from '../game/manager-registry.js';
import { createBotUsernameBatch, createBotUserRecord } from './bot-account-service.js';
import { generateRankedBotBatch } from './bot-generation.js';

export const RANKED_BOT_SEED = 'ranked-bots-v1';
export const RANKED_BOT_COUNT = 100;

export async function ensureRankedBotAccounts({
  count = RANKED_BOT_COUNT,
  seed = RANKED_BOT_SEED,
  usersFile = dataPath('.jrpg-users.json'),
  getManager = defaultGetManager,
  saveManager = defaultSaveManager,
  removeManager = defaultRemoveManager
} = {}) {
  const users = loadUsers(usersFile).users || [];
  const existingBySeed = new Map(
    users
      .filter(user => user.isBot === true && typeof user.botProfile?.seed === 'string')
      .map(user => [user.botProfile.seed, user])
  );

  const usernames = createBotUsernameBatch({
    count,
    seed,
    existingUsernames: new Set()
  });
  const bots = generateRankedBotBatch({ count, seed, usernames });
  let created = 0;
  let repaired = 0;

  for (const bot of bots) {
    const botSeed = `${seed}:${bot.index}`;
    let user = existingBySeed.get(botSeed);
    let wasCreated = false;

    if (!user) {
      user = await createBotUserRecord({
        username: bot.username,
        strength: bot.strength,
        seed: botSeed,
        usersFile
      });
      created++;
      wasCreated = true;
    }

    const gm = getManager(user.id);
    const meta = gm.getMeta ? gm.getMeta() : gm.meta;
    let changed = false;

    if (!meta.pvpTeams?.some(Boolean)) {
      meta.pvpTeams = [bot.team, null, null];
      changed = true;
    }
    if (!meta.pvpRanked) {
      meta.pvpRanked = bot.ranked;
      changed = true;
    }
    if (!Array.isArray(meta.creatureCollection)) {
      meta.creatureCollection = [];
      changed = true;
    }

    const creatures = [
      ...(bot.team.creatureParty.active || []),
      ...(bot.team.creatureParty.reserves || [])
    ];
    for (const creature of creatures) {
      if (!meta.creatureCollection.includes(creature.id)) {
        meta.creatureCollection.push(creature.id);
        changed = true;
      }
    }

    if (wasCreated || changed) {
      saveManager(user.id);
      if (!wasCreated) repaired++;
    }
    removeManager(user.id);
  }

  return {
    seed,
    expected: count,
    created,
    repaired,
    totalBots: loadUsers(usersFile).users.filter(user => user.isBot === true).length
  };
}
