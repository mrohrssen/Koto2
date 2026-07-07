#!/usr/bin/env node
// One-time backfill: create question-word vocab cards for every existing
// user (safe + idempotent — skips cards that already exist).
// Usage: node scripts/backfill-question-word-cards.js
import { loadUsers } from '../src/auth/users.js';
import { ensureQuestionWordCards, QUESTION_WORDS } from '../src/game/question-word-cards.js';

const { users } = loadUsers();
let touched = 0;
for (const user of users) {
  const created = ensureQuestionWordCards(user.id);
  if (created.length > 0) {
    touched++;
    console.log(`${user.username || user.id}: created ${created.join(', ')}`);
  }
}
console.log(`Done. ${touched}/${users.length} users backfilled with [${QUESTION_WORDS.join(' ')}] cards.`);
