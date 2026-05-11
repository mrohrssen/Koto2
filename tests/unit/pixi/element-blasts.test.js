import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

const graphicsCreated = [];

class FakeContainer {
  constructor() {
    this.children = [];
  }

  addChild(child) {
    this.children.push(child);
    child.parent = this;
    return child;
  }

  removeChild(child) {
    this.children = this.children.filter(c => c !== child);
    child.parent = null;
    return child;
  }

  destroy() {}
}

class FakeGraphics {
  constructor() {
    this.commands = [];
    this.alpha = 1;
    this.scale = { set: () => {} };
    graphicsCreated.push(this);
  }

  circle(x, y, radius) {
    this.commands.push({ type: 'circle', x, y, radius });
    return this;
  }

  moveTo(x, y) {
    this.commands.push({ type: 'moveTo', x, y });
    return this;
  }

  lineTo(x, y) {
    this.commands.push({ type: 'lineTo', x, y });
    return this;
  }

  fill() {
    return this;
  }

  stroke() {
    return this;
  }

  destroy() {}
}

const tickerCallbacks = new Set();
const fakeApp = {
  ticker: {
    add(fn) { tickerCallbacks.add(fn); },
    remove(fn) { tickerCallbacks.delete(fn); },
  },
};
const fakeLayers = {
  effects: new FakeContainer(),
};

await mock.module('pixi.js', {
  namedExports: {
    Container: FakeContainer,
    Graphics: FakeGraphics,
  },
});

await mock.module('../../../public/js/pixi/app.js', {
  namedExports: {
    getApp: () => ({ app: fakeApp, layers: fakeLayers }),
  },
});

const { fireElementBlast } = await import('../../../public/js/pixi/element-blasts.js');

async function runTickerUntilSettled(promise) {
  let settled = false;
  promise.finally(() => { settled = true; });

  for (let i = 0; i < 40 && !settled; i++) {
    for (const callback of [...tickerCallbacks]) {
      callback({ deltaMS: 100 });
    }
    await Promise.resolve();
  }

  assert.equal(settled, true, 'animation should settle');
  await promise;
}

describe('earth element blast', () => {
  it('spawns the final spike on the target creature ground line', async () => {
    graphicsCreated.length = 0;
    tickerCallbacks.clear();
    fakeLayers.effects.children.length = 0;

    const from = { x: 10, y: 100 };
    const to = { x: 70, y: 40 };

    const blast = fireElementBlast(from, to, 'earth');
    await runTickerUntilSettled(blast);

    const finalSpike = graphicsCreated.find((g) => {
      const [move, peak, base] = g.commands;
      return move?.type === 'moveTo'
        && peak?.type === 'lineTo'
        && base?.type === 'lineTo'
        && move.x === to.x - 4
        && peak.x === to.x
        && base.x === to.x + 4;
    });

    assert.ok(finalSpike, 'final earth spike should be drawn at the target x position');
    assert.equal(finalSpike.commands[0].y, to.y + 20);
    assert.equal(finalSpike.commands[2].y, to.y + 20);
  });
});
