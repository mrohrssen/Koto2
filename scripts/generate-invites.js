#!/usr/bin/env node
import { createInviteCode } from '../src/auth/users.js';

const count = parseInt(process.argv[2]) || 5;
const adminSecret = process.env.ADMIN_SECRET;

if (!adminSecret) {
  console.error('Set ADMIN_SECRET env variable');
  process.exit(1);
}

console.log(`Generating ${count} invite codes...\n`);

for (let i = 0; i < count; i++) {
  const code = createInviteCode(adminSecret);
  console.log(code);
}

console.log('\nDone. Share these with friends to register.');
