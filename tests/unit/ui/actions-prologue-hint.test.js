import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const actionArea = { innerHTML: '' };

await mock.module('../../../public/js/dom.js', {
  exports: { dom: { actionArea } },
});
await mock.module('../../../public/js/audio.js', {
  exports: { playSFX: () => {} },
});
await mock.module('../../../public/js/native/index.js', {
  exports: { hapticMedium: () => {} },
});
await mock.module('../../../public/js/ui/i18n.js', {
  exports: { t: key => key },
});

const actions = await import('../../../public/js/ui/actions.js');

describe('prologue continue hint', () => {
  it('renders the prologue-only continue instruction in the action area', () => {
    assert.equal(typeof actions.showPrologueContinueHint, 'function');

    actionArea.innerHTML = '';
    actions.showPrologueContinueHint();

    assert.match(actionArea.innerHTML, /prologue-continue-hint/);
    assert.match(actionArea.innerHTML, /Tap here to continue!/);
  });
});
