import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'public/game.css'), 'utf8');

function ruleBody(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} rule should exist`);
  const bodyStart = css.indexOf('{', start) + 1;
  const bodyEnd = css.indexOf('\n}', bodyStart);
  return css.slice(bodyStart, bodyEnd);
}

test('creature dialogue portraits fit by width and stay vertically centered', () => {
  const containerBody = ruleBody('.npc-dialogue-portrait--creature');
  const imageBody = ruleBody('.npc-dialogue-portrait--creature img');

  assert.match(containerBody, /\bplace-items:\s*center;/);
  assert.match(imageBody, /\bwidth:\s*100%;/);
  assert.match(imageBody, /\bheight:\s*auto;/);
  assert.match(imageBody, /\bobject-position:\s*center center;/);
  assert.doesNotMatch(imageBody, /\bwidth:\s*(?:10[1-9]|1[1-9]\d)%/);
  assert.doesNotMatch(imageBody, /\bheight:\s*100%/);
});
