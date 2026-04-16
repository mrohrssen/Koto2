// tests/unit/ui/intent-log.test.js
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createIntentLog } from '../../../public/js/intent-log.js';

describe('IntentLog', () => {
  let log;
  let lines;

  beforeEach(() => {
    lines = [];
    log = createIntentLog({
      output: (line) => lines.push(line),
      getErrorCount: () => 0,
    });
  });

  it('logs act/expect/check cycle with pass', () => {
    log.act('Player attacks Enemy #0');
    log.expect('Enemy #0 HP: 20→5');
    log.check({ ok: true });

    assert.equal(lines.length, 3);
    assert.match(lines[0], /^\[ACT\] Player attacks Enemy #0$/);
    assert.match(lines[1], /^\[EXP\] Enemy #0 HP: 20→5$/);
    assert.match(lines[2], /^\[CHK\] ✓$/);
  });

  it('logs check failure with tag', () => {
    log.act('Combat ended');
    log.expect('Enemy row cleared');
    log.check({ ok: false, tag: 'DOM_GHOST', detail: 'Enemy #2 HP bar in DOM but KO' });

    assert.match(lines[2], /^\[CHK\] ✗ DOM_GHOST: Enemy #2 HP bar in DOM but KO$/);
  });

  it('detects console errors between act and check', () => {
    let errorCount = 0;
    log = createIntentLog({
      output: (line) => lines.push(line),
      getErrorCount: () => errorCount,
    });

    log.act('Player receives item');
    errorCount = 1; // simulate console error fired
    log.check({ ok: true }); // even if checks pass, error means failure

    assert.match(lines[1], /^\[ERR\] 1 console error\(s\) during action$/);
    assert.match(lines[2], /^\[CHK\] ✗ ERROR_THROWN$/);
  });

  it('supports multiple expect lines', () => {
    log.act('KO Enemy #1');
    log.expect('Sprite: animateKO');
    log.expect('HP bar: remove');
    log.expect('Turn order: exclude');
    log.check({ ok: true });

    assert.equal(lines.length, 5); // 1 act + 3 expect + 1 check
  });

  it('resets context after check', () => {
    log.act('First action');
    log.check({ ok: true });
    log.act('Second action');
    log.check({ ok: true });

    assert.equal(lines.length, 4);
    assert.match(lines[2], /^\[ACT\] Second action$/);
  });

  it('calls onFailure callback on check failure', () => {
    const failures = [];
    log = createIntentLog({
      output: (line) => lines.push(line),
      getErrorCount: () => 0,
      onFailure: (f) => failures.push(f),
    });

    log.act('Item use');
    log.check({ ok: false, tag: 'LOGIC_BUG', detail: 'Item not in inventory' });

    assert.equal(failures.length, 1);
    assert.equal(failures[0].tag, 'LOGIC_BUG');
    assert.equal(failures[0].detail, 'Item not in inventory');
  });

  it('calls onFailure on ERROR_THROWN', () => {
    let errorCount = 0;
    const failures = [];
    log = createIntentLog({
      output: (line) => lines.push(line),
      getErrorCount: () => errorCount,
      onFailure: (f) => failures.push(f),
    });

    log.act('Skill learn');
    errorCount = 1;
    log.check({ ok: true });

    assert.equal(failures.length, 1);
    assert.equal(failures[0].tag, 'ERROR_THROWN');
  });
});
