import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const gameSource = readFileSync(resolve(repoRoot, 'public/game.js'), 'utf8');

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `Missing source start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test('room and legacy NPC dialogue phases use the same retryable recovery path', () => {
  const contentSource = sourceBetween(
    gameSource,
    'function updateGameContent()',
    '// ============ AUTO-PROCEED ============',
  );
  const roomCase = sourceBetween(contentSource, "case 'room':", "case 'shrine':");
  const dialogueCase = sourceBetween(contentSource, "case 'npc_dialogue':", "case 'post_combat_shop':");

  const recoveryIndex = roomCase.indexOf('needsNpcDialogueRecovery(gameState)');
  const proceedIndex = roomCase.indexOf('autoProceed()');
  assert.ok(recoveryIndex >= 0, 'completed NPC battle rooms should be checked for unfinished dialogue');
  assert.ok(proceedIndex > recoveryIndex, 'dialogue recovery must run before normal room auto-proceed');
  assert.match(roomCase, /npcDialogueRecovery\.run\(\)/);
  assert.match(dialogueCase, /npcDialogueRecovery\.run\(\)/);
  assert.doesNotMatch(dialogueCase, /\.then\(\(\) => updateUI\(\)\)/);
});

test('game wiring delegates NPC recovery outcomes and ownership to the behavioral coordinator', () => {
  const recoverySource = sourceBetween(
    gameSource,
    'function showNpcDialogueRecoveryRetry',
    'function handleConnectionOnline',
  );

  assert.match(recoverySource, /createNpcDialogueRecoveryCoordinator\(\{/);
  assert.match(recoverySource, /runDialogue: \(\) => combatLoopUI\.runNpcDialogue\(\)/);
  assert.match(recoverySource, /refreshState: \(\) => loadGameState\(\{ adoptSession: true \}\)/);
  assert.match(recoverySource, /resetDialogueOwnership: \(\) => combatLoopUI\.resetNpcDialogue\?\.\(\)/);
  assert.match(recoverySource, /renderButtons\(\[\{[\s\S]*label: 'Retry Dialogue'/);
  assert.match(recoverySource, /onRecovered: \(\) => updateUI\(\)/);
  assert.match(gameSource, /resetFlags: \(\) => \{[\s\S]*npcDialogueRecovery\.reset\(\)/);
});

test('connection recovery retries unfinished NPC dialogue without duplicate handlers', () => {
  const onlineSource = sourceBetween(
    gameSource,
    'function handleConnectionOnline',
    'function clearClientSessionState()',
  );
  assert.match(onlineSource, /showOnline\(\.\.\.args\)/);
  assert.match(onlineSource, /needsNpcDialogueRecovery\(gameState\)/);
  assert.match(onlineSource, /npcDialogueRecovery\.run\(\)/);
  assert.match(gameSource, /setConnectionCallbacks\(\{ onOffline: showOffline, onOnline: handleConnectionOnline \}\)/);
  assert.match(gameSource, /window\.addEventListener\('online', handleConnectionOnline\)/);
});
