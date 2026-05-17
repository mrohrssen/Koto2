import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const moveLearnSource = readFileSync(resolve(repoRoot, 'public/js/ui/move-learn.js'), 'utf8');
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

test('learn move replacement uses the move-select grid with the new move in the rest slot', () => {
  assert.match(moveLearnSource, /import \{ buildMoveCell \} from '\.\/move-select\.js';/);
  assert.match(moveLearnSource, /\$\{hiraganaName\(creature,\s*'This creature'\)\} wants to learn \$\{hiraganaName\(newMove,\s*'this move'\)\}! Choose a move to forget\./);
  assert.match(moveLearnSource, /grid\.className = 'move-grid move-learn-grid'/);
  assert.match(moveLearnSource, /buildMoveCell\(newMove,\s*true/);
  assert.doesNotMatch(moveLearnSource, /textContent = "Don't learn"/);
});

test('learn move auto-learn uses the move-select cell for the learned move', () => {
  assert.match(moveLearnSource, /if \(alreadyLearned \|\| creature\.moves\.length < 3\) \{\s*panel\.classList\.add\('move-learn-panel--grid',\s*'move-learn-panel--auto'\);/);
  assert.match(moveLearnSource, /const grid = document\.createElement\('div'\);\s*grid\.className = 'move-grid move-learn-grid move-learn-auto-grid';\s*const newMoveCell = buildMoveCell\(newMove,\s*true\);\s*newMoveCell\.classList\.add\('move-learn-new-slot'\);\s*grid\.appendChild\(newMoveCell\);\s*panel\.appendChild\(grid\);/s);
  assert.doesNotMatch(moveLearnSource, /buildMoveCard\(newMove/);
  assert.doesNotMatch(moveLearnSource, /msg\.className = 'move-learn-auto'/);
  assert.doesNotMatch(moveLearnSource, /Learned \$\{newMove\.nameEn\}!/);
});

test('learn move replacement stretches to the same width as regular move buttons', () => {
  const panelBody = ruleBody(css, '.move-learn-panel--grid {');
  assert.ok(panelBody, '.move-learn-panel--grid rule not found');
  assert.match(panelBody, /width:\s*100%\s*;/);

  const gridBody = ruleBody(css, '.move-learn-grid {');
  assert.ok(gridBody, '.move-learn-grid rule not found');
  assert.match(gridBody, /width:\s*calc\(100%\s*\+\s*32px\)\s*;/);
  assert.match(gridBody, /margin-left:\s*-16px\s*;/);
  assert.match(gridBody, /margin-right:\s*-16px\s*;/);
});

test('learn move auto-learn reserves a regular move button row height', () => {
  const autoHeaderBody = ruleBody(css, '.move-learn-panel--auto .move-learn-header {');
  assert.ok(autoHeaderBody, '.move-learn-panel--auto .move-learn-header rule not found');
  assert.match(autoHeaderBody, /min-height:\s*38px\s*;/);

  const autoGridBody = ruleBody(css, '.move-learn-auto-grid {');
  assert.ok(autoGridBody, '.move-learn-auto-grid rule not found');
  assert.match(autoGridBody, /grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/);

  const autoOkBody = ruleBody(css, '.move-learn-panel--auto .move-learn-ok-btn {');
  assert.ok(autoOkBody, '.move-learn-panel--auto .move-learn-ok-btn rule not found');
  assert.match(autoOkBody, /position:\s*absolute\s*;/);
  assert.match(autoOkBody, /bottom:\s*0\s*;/);
});

test('learn move replacement confirms before resolving the selected move', () => {
  assert.match(moveLearnSource, /Forget \$\{.*?\} and learn \$\{.*?\}\?/s);
  assert.match(moveLearnSource, /textContent = 'No'/);
  assert.match(moveLearnSource, /textContent = 'Yes'/);
  assert.match(moveLearnSource, /resolve\(\{ action: 'replace', replaceIndex \}\)/);
});

test('learn move replacement lets selecting the new move skip learning', () => {
  assert.match(moveLearnSource, /newMoveCell\.classList\.add\('move-learn-new-slot'\)/);
  assert.doesNotMatch(moveLearnSource, /newMoveCell\.setAttribute\('aria-disabled', 'true'\)/);
  assert.match(moveLearnSource, /Skip learning \$\{moveDisplayName\(newMove\)\}\?/);
  assert.match(moveLearnSource, /resolve\(\{ action: 'skip' \}\)/);
});
