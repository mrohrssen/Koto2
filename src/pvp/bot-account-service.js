import { randomBytes } from 'crypto';
import { createUserRecord, loadUsers } from '../auth/users.js';
import { createSeededRandom } from './bot-generation.js';

const NOUNS = [
  'taro', 'pebble', 'moth', 'puddle', 'nagi', 'kumo', 'miso', 'bento',
  'fern', 'lantern', 'sparrow', 'melon', 'raccoon', 'acorn', 'cricket',
  'marimo', 'turnip', 'soba', 'dock', 'button', 'moss', 'tanuki'
];

const ADJECTIVES = [
  'quiet', 'mossy', 'sleepy', 'plain', 'small', 'dusty', 'soft', 'round',
  'little', 'foggy', 'brown', 'green', 'mellow', 'lowkey', 'humble'
];

function title(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function candidateUsername(index, random) {
  const noun = NOUNS[Math.floor(random() * NOUNS.length)];
  const noun2 = NOUNS[Math.floor(random() * NOUNS.length)];
  const adjective = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)];
  const pattern = index % 5;
  if (pattern === 0) return `${noun}${1988 + Math.floor(random() * 18)}`;
  if (pattern === 1) return `${adjective}${noun}`;
  if (pattern === 2) return `${title(adjective)}${title(noun)}`;
  if (pattern === 3) return `${noun}${Math.floor(random() * 90) + 7}`;
  return `${noun}${noun2}`.slice(0, 20);
}

export function createBotUsernameBatch({ count, seed, existingUsernames = new Set() }) {
  const random = createSeededRandom(`usernames:${seed}`);
  const usernames = [];
  const used = new Set([...existingUsernames]);
  let attempts = 0;
  while (usernames.length < count) {
    attempts++;
    if (attempts > count * 100) throw new Error('Unable to create enough unique bot usernames');
    let candidate = candidateUsername(usernames.length + attempts, random).slice(0, 20);
    if (candidate.length < 2) candidate = `${candidate}7`;
    if (used.has(candidate)) continue;
    used.add(candidate);
    usernames.push(candidate);
  }
  return usernames;
}

export async function createBotUserRecord({ username, strength, seed, usersFile }) {
  return createUserRecord({
    username,
    password: `bot-${randomBytes(24).toString('hex')}`,
    isBot: true,
    botProfile: {
      strength,
      seed,
      generatedAt: new Date().toISOString()
    }
  }, usersFile);
}

export function listBotUsers(usersFile) {
  return loadUsers(usersFile).users.filter(user => user.isBot === true);
}
