import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Source-level deletion assertions for the explore-subway legacy-layer retirement
// (2026-07-03 spec). The explore session + runway (`exploreRunway.preparedRooms`)
// is the single client room-reveal source; the parallel `revealedRooms` layer is
// deleted, not wrapped.
//
// NOTE: optimistic-run-action.js is intentionally NOT deleted. The task brief
// listed it as orphaned, but public/game.js still uses createPendingRunAction /
// confirm / correct for the post-combat-shop item-selection optimistic flow
// (postCombatShop.select) — a path the explore session never replaced. Deleting
// it broke the client module graph (Vite pre-transform 500). See task-5-report.

test('client no longer reads run.revealedRooms', () => {
  const clientFiles = [
    'public/js/ui/exploration.js',
    'public/js/ui/room-transition.js',
    'public/js/ui/economy.js',
    'public/js/ui/campfire.js',
    'public/js/ui/room-reveal-buffer.js',
  ];
  for (const file of clientFiles) {
    assert.ok(
      !readFileSync(file, 'utf8').includes('revealedRooms'),
      `${file} still references revealedRooms`
    );
  }
});

test('server no longer exposes run.revealedRooms in client state', () => {
  assert.ok(
    !readFileSync('src/game/loop.js', 'utf8').includes('revealedRooms'),
    'src/game/loop.js still exposes revealedRooms in getState()'
  );
});

test('phase-machine no longer reads the legacy reveal buffer', () => {
  const src = readFileSync('src/game/phase-machine.js', 'utf8');
  assert.ok(
    !src.includes('getRoomFromRevealBuffer'),
    'phase-machine.js still reads getRoomFromRevealBuffer (legacy revealedRooms)'
  );
});

test('room-reveal-buffer keeps ensureRoomActionSeq for the sync service', () => {
  // ensureRoomActionSeq is imported by run.js + exploration-service.js and must survive.
  const src = readFileSync('src/game/room-reveal-buffer.js', 'utf8');
  assert.ok(src.includes('export function ensureRoomActionSeq'), 'ensureRoomActionSeq was removed');
  assert.ok(!src.includes('revealedRooms'), 'server room-reveal-buffer still builds revealedRooms');
});
