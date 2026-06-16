import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const explorationSource = readFileSync(resolve(import.meta.dirname, '../../../public/js/ui/exploration.js'), 'utf8');

function sourceBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(startIndex, -1, `Missing source start marker: ${start}`);
  assert.notEqual(endIndex, -1, `Missing source end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

describe('word discovery optimistic room flow', () => {
  const wordDiscoverySource = sourceBetween(
    explorationSource,
    'export async function renderWordDiscovery()',
    'function getActiveSpeedReviewRoom'
  );

  it('records review progress on the explore session and keeps verified completion', () => {
    assert.match(wordDiscoverySource, /getExploreSession\(\)\?\.recordRoomAction\('wordDiscovery\.review'/);
    assert.match(wordDiscoverySource, /const grade = detail\.knew \? 'good' : 'again'/);
    assert.match(wordDiscoverySource, /word: detail\.word,\s*grade,/);
    assert.doesNotMatch(wordDiscoverySource, /apiSwipeWord\(currentWord\.word, 'again', true/);
    assert.match(explorationSource, /actionType: 'wordDiscovery\.complete'/);
    assert.match(explorationSource, /apiCompleteDiscovery\(\{ actionId: pending\.actionId \}\)/);
  });

  it('keeps completed word discovery proceed on the reveal-buffer helper', () => {
    assert.match(wordDiscoverySource, /discovery\.completed[\s\S]*proceedWithRevealBuffer\(\)/);
  });

  it('restores authoritative state and shows approved retry copy on corrections', () => {
    assert.match(explorationSource, /result\?\.status === 'corrected'/);
    assert.match(explorationSource, /correctPendingRunAction\(pending, result\)/);
    assert.match(explorationSource, /Word discovery did not save\. Please try again\./);
  });
});
