import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import express from 'express';
import { createDevRouter } from '../../../src/routes/dev.js';

const TEST_DIR = join(import.meta.dirname, '../../../tmp/test-dev-content-api');

// Helper: create an Express app with the dev router (no auth)
function createApp(dataDir) {
  const app = express();
  app.use(express.json());
  app.use('/dev', createDevRouter({ password: '', dataDir }));
  return app;
}

// Helper: make an HTTP request to the app and return { status, body }
async function req(app, method, path, body) {
  const http = await import('http');
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const url = new URL(`http://127.0.0.1:${port}${path}`);
      const headers = {};
      let payload;

      if (body !== undefined) {
        payload = JSON.stringify(body);
        headers['content-type'] = 'application/json';
        headers['content-length'] = Buffer.byteLength(payload);
      }

      const r = http.request(url, { method, headers }, res => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          server.close();
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      });
      r.on('error', err => { server.close(); reject(err); });
      if (payload) r.write(payload);
      r.end();
    });
  });
}

// ── Fixtures ────────────────────────────────────────────────────────

const CREATURES = [
  { id: 'kamedor', name: 'カメドル', nameEn: 'Kamedor', element: 'water' },
  { id: 'timbark', name: 'ティムバーク', nameEn: 'Timbark', element: 'earth' }
];

const MOVES = [
  { id: 'hashiru', name: '走る', nameEn: 'Dash', element: 'neutral' }
];

const ITEMS = [
  { id: 'curry-bread', word: 'カレーパン', meaning: 'curry bread', rarity: 'common' }
];

const NPCS = {
  nagi: { id: 'nagi', name: 'ナギ', nameEn: 'Nagi', area: 'forest' },
  hoshi: { id: 'hoshi', name: 'ホシ', nameEn: 'Hoshi', area: 'city' }
};

const NPC_SKILLS = [
  { id: 'npc-aoe-attack', name: 'NPC Attack', nameEn: 'NPC Attack' }
];

const AREAS = [
  { id: 'okunomori', name: '奥の森', nameEn: 'Deep Forest' }
];

function writeFixtures(dataDir) {
  writeFileSync(join(dataDir, 'creatures.json'), JSON.stringify(CREATURES, null, 2));
  writeFileSync(join(dataDir, 'moves.json'), JSON.stringify(MOVES, null, 2));
  writeFileSync(join(dataDir, 'items.json'), JSON.stringify(ITEMS, null, 2));
  writeFileSync(join(dataDir, 'npcs.json'), JSON.stringify(NPCS, null, 2));
  writeFileSync(join(dataDir, 'npc-skills.json'), JSON.stringify(NPC_SKILLS, null, 2));
  writeFileSync(join(dataDir, 'areas.json'), JSON.stringify(AREAS, null, 2));
}

// ── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  writeFixtures(TEST_DIR);
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('GET /dev/api/content/:type', () => {
  it('returns creatures array', async () => {
    const app = createApp(TEST_DIR);
    const res = await req(app, 'GET', '/dev/api/content/creatures');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.strictEqual(res.body.length, 2);
    assert.strictEqual(res.body[0].id, 'kamedor');
    assert.strictEqual(res.body[1].id, 'timbark');
  });

  it('returns moves array', async () => {
    const app = createApp(TEST_DIR);
    const res = await req(app, 'GET', '/dev/api/content/moves');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].id, 'hashiru');
  });

  it('returns items array', async () => {
    const app = createApp(TEST_DIR);
    const res = await req(app, 'GET', '/dev/api/content/items');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].id, 'curry-bread');
  });

  it('normalizes npcs from object to array', async () => {
    const app = createApp(TEST_DIR);
    const res = await req(app, 'GET', '/dev/api/content/npcs');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.strictEqual(res.body.length, 2);
    // Should contain both NPCs with their IDs
    const ids = res.body.map(n => n.id);
    assert.ok(ids.includes('nagi'));
    assert.ok(ids.includes('hoshi'));
  });

  it('returns npc-skills array', async () => {
    const app = createApp(TEST_DIR);
    const res = await req(app, 'GET', '/dev/api/content/npc-skills');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].id, 'npc-aoe-attack');
  });

  it('returns areas array', async () => {
    const app = createApp(TEST_DIR);
    const res = await req(app, 'GET', '/dev/api/content/areas');
    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body));
    assert.strictEqual(res.body.length, 1);
    assert.strictEqual(res.body[0].id, 'okunomori');
  });

  it('returns 400 for unknown content type', async () => {
    const app = createApp(TEST_DIR);
    const res = await req(app, 'GET', '/dev/api/content/weapons');
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error);
  });
});

describe('PATCH /dev/api/content/:type', () => {
  it('updates a field and persists to file', async () => {
    const app = createApp(TEST_DIR);
    const res = await req(app, 'PATCH', '/dev/api/content/creatures', {
      changes: [{ id: 'kamedor', field: 'nameEn', value: 'Kamezilla' }]
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.updated, 1);

    // Verify persisted to disk
    const data = JSON.parse(readFileSync(join(TEST_DIR, 'creatures.json'), 'utf-8'));
    const creature = data.find(c => c.id === 'kamedor');
    assert.strictEqual(creature.nameEn, 'Kamezilla');
  });

  it('handles npcs (object-keyed format)', async () => {
    const app = createApp(TEST_DIR);
    const res = await req(app, 'PATCH', '/dev/api/content/npcs', {
      changes: [{ id: 'nagi', field: 'nameEn', value: 'Nagisa' }]
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.updated, 1);

    // Verify persisted - npcs.json should remain an object
    const data = JSON.parse(readFileSync(join(TEST_DIR, 'npcs.json'), 'utf-8'));
    assert.ok(!Array.isArray(data), 'npcs.json should remain an object, not array');
    assert.strictEqual(data.nagi.nameEn, 'Nagisa');
  });

  it('rejects unknown content type', async () => {
    const app = createApp(TEST_DIR);
    const res = await req(app, 'PATCH', '/dev/api/content/weapons', {
      changes: [{ id: 'x', field: 'y', value: 'z' }]
    });
    assert.strictEqual(res.status, 400);
    assert.ok(res.body.error);
  });

  it('reports errors for unknown IDs', async () => {
    const app = createApp(TEST_DIR);
    const res = await req(app, 'PATCH', '/dev/api/content/creatures', {
      changes: [
        { id: 'kamedor', field: 'nameEn', value: 'Kamezilla' },
        { id: 'nonexistent', field: 'nameEn', value: 'Ghost' }
      ]
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.ok, true);
    assert.strictEqual(res.body.updated, 1);
    assert.strictEqual(res.body.errors.length, 1);
    assert.ok(res.body.errors[0].includes('nonexistent'));
  });

  it('prevents modifying id field', async () => {
    const app = createApp(TEST_DIR);
    const res = await req(app, 'PATCH', '/dev/api/content/creatures', {
      changes: [{ id: 'kamedor', field: 'id', value: 'hacked' }]
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.updated, 0);
    assert.strictEqual(res.body.errors.length, 1);
    assert.ok(res.body.errors[0].includes('id'));

    // Verify id was NOT changed on disk
    const data = JSON.parse(readFileSync(join(TEST_DIR, 'creatures.json'), 'utf-8'));
    assert.strictEqual(data[0].id, 'kamedor');
  });

  it('requires non-empty changes array', async () => {
    const app = createApp(TEST_DIR);

    const res1 = await req(app, 'PATCH', '/dev/api/content/creatures', {});
    assert.strictEqual(res1.status, 400);

    const app2 = createApp(TEST_DIR);
    const res2 = await req(app2, 'PATCH', '/dev/api/content/creatures', { changes: [] });
    assert.strictEqual(res2.status, 400);
  });

  it('applies multiple changes to different entries', async () => {
    const app = createApp(TEST_DIR);
    const res = await req(app, 'PATCH', '/dev/api/content/creatures', {
      changes: [
        { id: 'kamedor', field: 'nameEn', value: 'Kamezilla' },
        { id: 'timbark', field: 'nameEn', value: 'Treebark' }
      ]
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.updated, 2);
    assert.strictEqual(res.body.errors.length, 0);

    const data = JSON.parse(readFileSync(join(TEST_DIR, 'creatures.json'), 'utf-8'));
    assert.strictEqual(data.find(c => c.id === 'kamedor').nameEn, 'Kamezilla');
    assert.strictEqual(data.find(c => c.id === 'timbark').nameEn, 'Treebark');
  });
});
