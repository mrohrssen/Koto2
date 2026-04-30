import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const moveSelectSource = readFileSync(resolve(repoRoot, 'public/js/ui/move-select.js'), 'utf8');
const combatLoopSource = readFileSync(resolve(repoRoot, 'public/js/ui/combat-loop.js'), 'utf8');
const css = readFileSync(resolve(repoRoot, 'public/game.css'), 'utf8');

function ruleBody(source, selector) {
  const idx = source.indexOf(selector);
  if (idx === -1) return null;
  const open = source.indexOf('{', idx);
  if (open === -1) return null;
  let depth = 1;
  let i = open + 1;
  while (i < source.length && depth > 0) {
    const c = source[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return source.slice(open + 1, i - 1);
}

test('move select can render an anchored Click here tutorial hint inside the target move', () => {
  assert.match(moveSelectSource, /move-tutorial-hint/, 'move select should render an in-card tutorial hint');
  assert.match(moveSelectSource, /Click here!/, 'first combat hint copy should be exactly "Click here!"');
  assert.match(moveSelectSource, /move-cell--tutorial-target/, 'target move should receive a dedicated anchoring class');
  assert.match(moveSelectSource, /tutorial-highlight/, 'target move should reuse the existing tutorial highlight class');
});

test('first combat tutorial locks the first fire creature to Flame only', () => {
  assert.match(combatLoopSource, /tutorialMoveId:\s*'honoo'/, 'first combat tutorial should target Flame');
  assert.match(combatLoopSource, /creature\?\.id\s*!==\s*'hi'/, 'tutorial should only apply to the Fire starter');
  assert.match(combatLoopSource, /currentCreatureIndex\s*!==\s*0/, 'tutorial should only apply to the first creature selector');
  assert.match(combatLoopSource, /lockToTutorialMove:\s*true/, 'non-target moves should be dimmed and blocked');
});

test('tutorial hint is anchored to the top edge of the highlighted move card', () => {
  const targetBody = ruleBody(css, '.move-cell--tutorial-target .move-tutorial-hint {');
  assert.ok(targetBody, 'anchored move tutorial hint rule not found');
  assert.match(targetBody, /top:\s*0\s*;/, 'hint should be positioned from the move card top');
  assert.match(targetBody, /transform:\s*translateY\(-100%\)/, 'hint should sit just above the move card');
  assert.match(targetBody, /font-size:\s*19\.5px\s*;/, 'hint copy should be 50% larger than the original 13px treatment');
  assert.match(targetBody, /border-radius:\s*20px\s*;/, 'hint should be fully rounded, not squared off like a web tooltip');
  assert.match(targetBody, /color:\s*rgba\(43,\s*22,\s*8,\s*0\.9\)\s*;/, 'hint text should use softened 90% black');
  assert.match(targetBody, /text-shadow:/, 'hint text should have game-ui depth instead of flat website text');

  const pointerBody = ruleBody(css, '.move-cell--tutorial-target .move-tutorial-hint::after {');
  assert.ok(pointerBody, 'anchored move tutorial pointer rule not found');
  assert.match(pointerBody, /bottom:\s*-\d+px\s*;/, 'pointer should cross down through the top of the move card');
  assert.match(pointerBody, /border-left:\s*\d+px solid transparent\s*;/, 'pointer should be a triangle, not a skewed tab');
  assert.match(pointerBody, /border-right:\s*\d+px solid transparent\s*;/, 'pointer should be a triangle, not a skewed tab');
  assert.match(pointerBody, /border-top:\s*\d+px solid #ffc85a\s*;/, 'pointer should be a downward triangle matching the badge fill');

  const pointerBorderBody = ruleBody(css, '.move-cell--tutorial-target .move-tutorial-hint::before {');
  assert.ok(pointerBorderBody, 'pointer should have an outer border triangle fused to the badge border');
  assert.match(pointerBorderBody, /border-top:\s*\d+px solid rgba\(255,\s*248,\s*207,\s*0\.92\)\s*;/, 'pointer border should match the tooltip border');
  assert.doesNotMatch(pointerBody, /filter:\s*drop-shadow/, 'pointer should not rely on a detached drop-shadow layer');
});

test('action area rises above the scene while the move tutorial hint is visible', () => {
  const body = ruleBody(css, '.action-area:has(.move-cell--tutorial-target) {');
  assert.ok(body, 'action area tutorial stacking rule not found');
  assert.match(body, /z-index:\s*20\s*;/, 'action area should stack over the scene during the tutorial hint');
  assert.match(body, /overflow:\s*visible\s*;/, 'action area should let the anchored hint extend over the scene');
});
