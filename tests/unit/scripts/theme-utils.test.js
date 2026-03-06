import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

// Dynamic import so we get a clear error if module is missing
let validateTheme, loadTheme, saveTheme, listThemes, getThemeWords, markAssigned;

before(async () => {
  const mod = await import('../../../scripts/lib/theme-utils.mjs');
  validateTheme = mod.validateTheme;
  loadTheme = mod.loadTheme;
  saveTheme = mod.saveTheme;
  listThemes = mod.listThemes;
  getThemeWords = mod.getThemeWords;
  markAssigned = mod.markAssigned;
});

// ── Fixture ──────────────────────────────────────────────────────────

const FIXTURE_THEME = {
  themeId: 'test-school',
  areaWord: '学校',
  areaReading: 'がっこう',
  areaMeaning: 'school',
  areaRank: 952,
  avgRank: 2340,
  computedStage: 3,
  generatedAt: '2026-03-06',
  words: [
    { word: '先生', reading: 'せんせい', meaning: 'teacher', rank: 452, roles: ['creature', 'npc'], source: 'occupations', assigned: null, existingUses: [] },
    { word: '机', reading: 'つくえ', meaning: 'desk', rank: 2100, roles: ['item'], source: 'objects', assigned: 'item:tsukue-desk', existingUses: ['item:tsukue-desk'] },
    { word: '教室', reading: 'きょうしつ', meaning: 'classroom', rank: 3200, roles: ['sub-area'], source: 'locations', assigned: null, existingUses: [] },
    { word: '厳しい', reading: 'きびしい', meaning: 'strict; severe', rank: 3400, roles: ['modifier'], source: 'ai-generated', assigned: null, existingUses: [] },
  ],
};

const THEMES_DIR = join(process.cwd(), 'language', 'themes');
const TEST_THEME_PATH = join(THEMES_DIR, 'test-school.json');

// Clean up test theme file after all tests
after(() => {
  try { unlinkSync(TEST_THEME_PATH); } catch { /* ignore */ }
});

// ── Module exports ──────────────────────────────────────────────────

describe('theme-utils module', () => {
  it('exports validateTheme function', () => {
    assert.strictEqual(typeof validateTheme, 'function');
  });

  it('exports loadTheme function', () => {
    assert.strictEqual(typeof loadTheme, 'function');
  });

  it('exports saveTheme function', () => {
    assert.strictEqual(typeof saveTheme, 'function');
  });

  it('exports listThemes function', () => {
    assert.strictEqual(typeof listThemes, 'function');
  });

  it('exports getThemeWords function', () => {
    assert.strictEqual(typeof getThemeWords, 'function');
  });

  it('exports markAssigned function', () => {
    assert.strictEqual(typeof markAssigned, 'function');
  });
});

// ── validateTheme ───────────────────────────────────────────────────

describe('validateTheme', () => {
  it('returns empty array for a valid theme', () => {
    const errors = validateTheme(FIXTURE_THEME);
    assert.deepStrictEqual(errors, []);
  });

  it('reports missing themeId', () => {
    const theme = { ...FIXTURE_THEME, themeId: undefined };
    const errors = validateTheme(theme);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(e => e.includes('themeId')));
  });

  it('reports missing areaWord', () => {
    const theme = { ...FIXTURE_THEME, areaWord: undefined };
    const errors = validateTheme(theme);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(e => e.includes('areaWord')));
  });

  it('reports missing areaReading', () => {
    const theme = { ...FIXTURE_THEME, areaReading: undefined };
    const errors = validateTheme(theme);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(e => e.includes('areaReading')));
  });

  it('reports missing areaMeaning', () => {
    const theme = { ...FIXTURE_THEME, areaMeaning: undefined };
    const errors = validateTheme(theme);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(e => e.includes('areaMeaning')));
  });

  it('reports when words is not an array', () => {
    const theme = { ...FIXTURE_THEME, words: 'not-an-array' };
    const errors = validateTheme(theme);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(e => e.includes('words')));
  });

  it('reports missing words entirely', () => {
    const theme = { ...FIXTURE_THEME, words: undefined };
    const errors = validateTheme(theme);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(e => e.includes('words')));
  });

  it('reports word entry missing word field', () => {
    const theme = {
      ...FIXTURE_THEME,
      words: [{ reading: 'せんせい', meaning: 'teacher', rank: 452, roles: ['creature'] }],
    };
    const errors = validateTheme(theme);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(e => e.includes('word') && e.includes('[0]')));
  });

  it('reports word entry missing reading field', () => {
    const theme = {
      ...FIXTURE_THEME,
      words: [{ word: '先生', meaning: 'teacher', rank: 452, roles: ['creature'] }],
    };
    const errors = validateTheme(theme);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(e => e.includes('reading') && e.includes('[0]')));
  });

  it('reports word entry missing meaning field', () => {
    const theme = {
      ...FIXTURE_THEME,
      words: [{ word: '先生', reading: 'せんせい', rank: 452, roles: ['creature'] }],
    };
    const errors = validateTheme(theme);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(e => e.includes('meaning') && e.includes('[0]')));
  });

  it('reports word entry with non-number rank', () => {
    const theme = {
      ...FIXTURE_THEME,
      words: [{ word: '先生', reading: 'せんせい', meaning: 'teacher', rank: 'high', roles: ['creature'] }],
    };
    const errors = validateTheme(theme);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(e => e.includes('rank') && e.includes('[0]')));
  });

  it('reports word entry with non-array roles', () => {
    const theme = {
      ...FIXTURE_THEME,
      words: [{ word: '先生', reading: 'せんせい', meaning: 'teacher', rank: 452, roles: 'creature' }],
    };
    const errors = validateTheme(theme);
    assert.ok(errors.length > 0);
    assert.ok(errors.some(e => e.includes('roles') && e.includes('[0]')));
  });

  it('reports multiple errors at once', () => {
    const theme = { areaWord: '学校' }; // missing themeId, areaReading, areaMeaning, words
    const errors = validateTheme(theme);
    assert.ok(errors.length >= 3);
  });
});

// ── saveTheme / loadTheme round-trip ────────────────────────────────

describe('saveTheme + loadTheme', () => {
  it('saveTheme writes file and returns path', () => {
    const path = saveTheme(FIXTURE_THEME);
    assert.strictEqual(path, TEST_THEME_PATH);
    assert.ok(existsSync(TEST_THEME_PATH));
  });

  it('loadTheme reads back the saved theme', () => {
    // Ensure file exists from previous test
    saveTheme(FIXTURE_THEME);
    const loaded = loadTheme('test-school');
    assert.deepStrictEqual(loaded, FIXTURE_THEME);
  });

  it('loadTheme returns null for non-existent theme', () => {
    const result = loadTheme('nonexistent-theme-xyz');
    assert.strictEqual(result, null);
  });

  it('saveTheme creates themes directory if needed', () => {
    // This is implicitly tested — the directory gets created by saveTheme
    // if it doesn't already exist. Just verify the file was written.
    saveTheme(FIXTURE_THEME);
    assert.ok(existsSync(TEST_THEME_PATH));
  });

  it('saved file is valid JSON with 2-space indent', () => {
    saveTheme(FIXTURE_THEME);
    const raw = readFileSync(TEST_THEME_PATH, 'utf8');
    // Should be parseable
    const parsed = JSON.parse(raw);
    assert.strictEqual(parsed.themeId, 'test-school');
    // Should use 2-space indent (second line starts with 2 spaces)
    const lines = raw.split('\n');
    assert.ok(lines[1].startsWith('  '), 'Expected 2-space indentation');
  });
});

// ── listThemes ──────────────────────────────────────────────────────

describe('listThemes', () => {
  it('returns array of theme IDs', () => {
    // Ensure at least one theme exists
    saveTheme(FIXTURE_THEME);
    const themes = listThemes();
    assert.ok(Array.isArray(themes));
    assert.ok(themes.includes('test-school'));
  });

  it('does not include .json extension in IDs', () => {
    saveTheme(FIXTURE_THEME);
    const themes = listThemes();
    for (const id of themes) {
      assert.ok(!id.endsWith('.json'), `Theme ID should not end with .json: ${id}`);
    }
  });
});

// ── getThemeWords ───────────────────────────────────────────────────

describe('getThemeWords', () => {
  before(() => {
    saveTheme(FIXTURE_THEME);
  });

  it('returns all words when no filter applied', () => {
    const words = getThemeWords('test-school', {});
    assert.strictEqual(words.length, 4);
  });

  it('filters by role', () => {
    const words = getThemeWords('test-school', { role: 'creature' });
    assert.strictEqual(words.length, 1);
    assert.strictEqual(words[0].word, '先生');
  });

  it('filters by role - item', () => {
    const words = getThemeWords('test-school', { role: 'item' });
    assert.strictEqual(words.length, 1);
    assert.strictEqual(words[0].word, '机');
  });

  it('filters by role - sub-area', () => {
    const words = getThemeWords('test-school', { role: 'sub-area' });
    assert.strictEqual(words.length, 1);
    assert.strictEqual(words[0].word, '教室');
  });

  it('filters by role - modifier', () => {
    const words = getThemeWords('test-school', { role: 'modifier' });
    assert.strictEqual(words.length, 1);
    assert.strictEqual(words[0].word, '厳しい');
  });

  it('filters unassignedOnly = true', () => {
    const words = getThemeWords('test-school', { unassignedOnly: true });
    // 机 is assigned, so 3 remain
    assert.strictEqual(words.length, 3);
    assert.ok(!words.some(w => w.word === '机'));
  });

  it('filters by role AND unassignedOnly combined', () => {
    const words = getThemeWords('test-school', { role: 'item', unassignedOnly: true });
    // 机 is the only item, and it is assigned
    assert.strictEqual(words.length, 0);
  });

  it('filters by role npc includes multi-role word', () => {
    const words = getThemeWords('test-school', { role: 'npc' });
    assert.strictEqual(words.length, 1);
    assert.strictEqual(words[0].word, '先生'); // has roles: ['creature', 'npc']
  });

  it('returns empty array for non-existent theme', () => {
    const words = getThemeWords('nonexistent-theme-xyz', {});
    assert.deepStrictEqual(words, []);
  });

  it('returns empty array for role with no matches', () => {
    const words = getThemeWords('test-school', { role: 'boss' });
    assert.deepStrictEqual(words, []);
  });
});

// ── markAssigned ────────────────────────────────────────────────────

describe('markAssigned', () => {
  before(() => {
    // Reset to clean fixture state
    saveTheme(FIXTURE_THEME);
  });

  it('marks a word as assigned and persists', () => {
    markAssigned('test-school', '先生', 'creature:sensei-owl');

    // Reload from disk and verify
    const theme = loadTheme('test-school');
    const word = theme.words.find(w => w.word === '先生');
    assert.strictEqual(word.assigned, 'creature:sensei-owl');
  });

  it('throws if theme not found', () => {
    assert.throws(
      () => markAssigned('nonexistent-theme-xyz', '先生', 'creature:x'),
      /not found/i,
    );
  });

  it('throws if word not found in theme', () => {
    assert.throws(
      () => markAssigned('test-school', '存在しない', 'creature:x'),
      /not found/i,
    );
  });

  it('updates existingUses when marking assigned', () => {
    // Reset fixture
    saveTheme(FIXTURE_THEME);
    markAssigned('test-school', '教室', 'sub-area:classroom-1');

    const theme = loadTheme('test-school');
    const word = theme.words.find(w => w.word === '教室');
    assert.strictEqual(word.assigned, 'sub-area:classroom-1');
    assert.ok(word.existingUses.includes('sub-area:classroom-1'));
  });

  it('does not duplicate existingUses entry', () => {
    // Reset fixture with a word that already has an existingUse
    saveTheme(FIXTURE_THEME);
    // 机 already has existingUses: ['item:tsukue-desk']
    markAssigned('test-school', '机', 'item:tsukue-desk');

    const theme = loadTheme('test-school');
    const word = theme.words.find(w => w.word === '机');
    const count = word.existingUses.filter(u => u === 'item:tsukue-desk').length;
    assert.strictEqual(count, 1, 'Should not duplicate existingUses entry');
  });
});
