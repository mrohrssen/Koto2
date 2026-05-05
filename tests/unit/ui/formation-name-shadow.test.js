import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'public/game.css'), 'utf8');

function ruleBody(selector) {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `${selector} rule should exist`);
  const bodyStart = css.indexOf('{', start) + 1;
  const bodyEnd = css.indexOf('\n}', bodyStart);
  return css.slice(bodyStart, bodyEnd);
}

describe('formation creature name shadows', () => {
  it('keeps the nameplate drop shadow reduced by half', () => {
    const body = ruleBody('.formation-info');
    assert.match(body, /drop-shadow\(0 1px 1px rgba\(0,0,0,0\.41\)\)/);
  });

  it('keeps the romaji and hiragana text shadow opacity reduced by half', () => {
    const romaji = ruleBody('.formation-romaji');
    assert.match(romaji, /rgba\(0,0,0,0\.48\)/);
    assert.match(romaji, /rgba\(0,0,0,0\.45\)/);

    const hira = ruleBody('.formation-hira');
    assert.match(hira, /rgba\(0,0,0,0\.48\)/);
    assert.match(hira, /rgba\(0,0,0,0\.38\)/);
  });
});
