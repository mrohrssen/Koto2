#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const STATS_SOURCE_CANDIDATES = [
  process.env.APPROVED_CREATURE_STATS_CSV,
  '/Users/michiarohrssen/Documents/Claude/koto-wt-approved-creature-roster-stats/output/approved-creature-roster-stats-proposal.csv'
].filter(Boolean);
const ROSTER_SOURCE_CANDIDATES = [
  process.env.ROSTER_METADATA_CSV,
  resolve(REPO_ROOT, 'output/roster-expansion-suggestions-master.csv'),
  '/Users/michiarohrssen/Documents/Claude/koto-dev/output/roster-expansion-suggestions-master.csv'
].filter(Boolean);
const STATS_SOURCE = STATS_SOURCE_CANDIDATES.find(path => existsSync(path));
const ROSTER_SOURCE = ROSTER_SOURCE_CANDIDATES.find(path => existsSync(path));
if (!STATS_SOURCE) throw new Error(`Could not find approved creature stats CSV. Tried: ${STATS_SOURCE_CANDIDATES.join(', ')}`);
if (!ROSTER_SOURCE) throw new Error(`Could not find roster metadata CSV. Tried: ${ROSTER_SOURCE_CANDIDATES.join(', ')}`);

const CREATURES_PATH = resolve(REPO_ROOT, 'data/creatures.json');
const CREATED_AT = '2026-05-06';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (quoted && ch === '"' && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (!quoted && ch === ',') {
      row.push(cell);
      cell = '';
    } else if (!quoted && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some(value => value.length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [headers, ...dataRows] = rows;
  return dataRows.map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

const ID_OVERRIDES = new Map([
  ['光', 'hikari'],
  ['月', 'tsuki'],
  ['影', 'kage'],
  ['星', 'hoshi'],
  ['馬', 'uma'],
  ['雪', 'yuki'],
  ['鬼', 'oni'],
  ['雲', 'kumo'],
  ['竜', 'ryuu'],
  ['雷', 'kaminari'],
  ['蛇', 'hebi'],
  ['幽霊', 'yuurei'],
  ['狼', 'ookami'],
  ['牛', 'ushi'],
  ['熊', 'kuma'],
  ['猿', 'saru'],
  ['豚', 'buta'],
  ['虎', 'tora'],
  ['鹿', 'shika'],
  ['妖精', 'yousei'],
  ['狐', 'kitsune'],
  ['羊', 'hitsuji'],
  ['亀', 'kame'],
  ['鼠', 'nezumi'],
  ['蛙', 'kaeru'],
  ['鴨', 'kamo'],
  ['鯨', 'kujira'],
  ['氷', 'koori'],
  ['土', 'tsuchi'],
  ['悪魔', 'akuma'],
  ['天使', 'tenshi'],
  ['砂', 'suna'],
  ['タコ', 'tako'],
  ['鶴', 'tsuru'],
  ['トカゲ', 'tokage'],
  ['イカ', 'ika'],
  ['猪', 'inoshishi'],
  ['カニ', 'kani'],
  ['獣', 'kemono'],
  ['エルフ', 'erufu'],
  ['ゴブリン', 'goburin'],
  ['骨', 'hone'],
  ['水晶', 'suishou'],
  ['スライム', 'suraimu']
]);

const NAME_EN_OVERRIDES = new Map([
  ['土', 'Dirt'],
  ['鼠', 'Mouse']
]);

function number(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected number, got ${value}`);
  return parsed;
}

const statsRows = parseCsv(readFileSync(STATS_SOURCE, 'utf8'));
const rosterRows = parseCsv(readFileSync(ROSTER_SOURCE, 'utf8'));
const metadataByJapanese = new Map();

for (const row of rosterRows) {
  if (!metadataByJapanese.has(row.Japanese)) metadataByJapanese.set(row.Japanese, row);
}

const existing = JSON.parse(readFileSync(CREATURES_PATH, 'utf8'));
const existingIds = new Set(existing.map(creature => creature.id));
const imported = [];

for (const row of statsRows) {
  const japanese = row.japanese;
  const metadata = metadataByJapanese.get(japanese);
  if (!metadata) throw new Error(`No roster metadata for ${row.creature} / ${japanese}`);

  const id = ID_OVERRIDES.get(japanese);
  if (!id) throw new Error(`No id override for ${row.creature} / ${japanese}`);
  if (existingIds.has(id)) continue;

  imported.push({
    id,
    name: japanese,
    nameEn: NAME_EN_OVERRIDES.get(japanese) || row.creature,
    reading: metadata.Reading,
    meaning: metadata.Definition,
    rank: number(metadata['JPDB Rank']),
    element: row.element,
    rarity: row.rarity,
    baseHp: number(row.baseHp),
    baseAttack: number(row.baseAttack),
    baseMp: number(row.baseMp),
    baseDefense: number(row.baseDefense),
    baseDex: number(row.baseDex),
    archetype: row.archetype,
    isStarter: false,
    learnset: [],
    stage: 1,
    createdAt: CREATED_AT
  });
}

writeFileSync(CREATURES_PATH, `${JSON.stringify([...existing, ...imported], null, 2)}\n`);
console.log(`Imported ${imported.length} creatures from ${statsRows.length} approved rows`);
