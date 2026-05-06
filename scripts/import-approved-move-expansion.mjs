#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(new URL('..', import.meta.url).pathname);
const SOURCE_CANDIDATES = [
  process.env.MOVE_EXPANSION_CSV,
  resolve(REPO_ROOT, 'output/move-verb-expansion-approved-mechanics.csv'),
  '/Users/michiarohrssen/Documents/Claude/koto-dev/output/move-verb-expansion-approved-mechanics.csv'
].filter(Boolean);
const SOURCE = SOURCE_CANDIDATES.find(path => existsSync(path));
if (!SOURCE) {
  throw new Error(`Could not find approved move CSV. Tried: ${SOURCE_CANDIDATES.join(', ')}`);
}
const MOVES_PATH = resolve(REPO_ROOT, 'data/moves.json');
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

const KANA = new Map(Object.entries({
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', を: 'wo', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo'
}));

function kataToHira(input) {
  return input.replace(/[\u30a1-\u30f6]/g, ch =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

function kanaToRomaji(reading) {
  const hira = kataToHira(reading.normalize('NFKC')).replace(/[・\s/-]+/g, '_');
  let out = '';
  let doubleNext = false;
  for (let i = 0; i < hira.length; i++) {
    const ch = hira[i];
    if (ch === '_') {
      out += '_';
      continue;
    }
    if (ch === 'っ') {
      doubleNext = true;
      continue;
    }
    const pair = hira.slice(i, i + 2);
    let romaji = KANA.get(pair);
    if (romaji) {
      i++;
    } else {
      romaji = KANA.get(ch) || '_';
    }
    if (doubleNext && /^[bcdfghjklmnpqrstvwxyz]/.test(romaji)) {
      romaji = romaji[0] + romaji;
    }
    doubleNext = false;
    out += romaji;
  }
  return out.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
}

function slugifyName(nameEn) {
  return nameEn.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseStatChanges(value) {
  if (!value || !value.trim()) return undefined;
  return JSON.parse(value);
}

const sourceRows = parseCsv(readFileSync(SOURCE, 'utf8'))
  .filter(row => row['Human Judgement'].startsWith('Add'));

const existingMoves = JSON.parse(readFileSync(MOVES_PATH, 'utf8'));
const existingBySignature = new Map(existingMoves.map(move => [`${move.name}|${move.reading}|${move.nameEn}`, move]));
const usedIds = new Set(existingMoves.map(move => move.id));
const imported = [];

for (const row of sourceRows) {
  const name = row.Japanese;
  const reading = row.Reading;
  const nameEn = row['Approved Move Name'];
  const signature = `${name}|${reading}|${nameEn}`;
  if (existingBySignature.has(signature)) continue;

  let id = kanaToRomaji(reading) || slugifyName(nameEn);
  if (usedIds.has(id)) id = `${id}_${slugifyName(nameEn)}`;

  let uniqueId = id;
  let counter = 2;
  while (usedIds.has(uniqueId)) uniqueId = `${id}_${counter++}`;
  usedIds.add(uniqueId);

  const move = {
    id: uniqueId,
    name,
    nameEn,
    reading,
    meaning: row.Definition,
    rank: parseNumber(row['JPDB Rank']),
    element: row.Element,
    category: row.Category,
    target: row.Target,
    power: parseNumber(row.Power),
    mpCost: parseNumber(row['MP Cost']),
    statusEffect: row['Status Effect'] ? row['Status Effect'] : null,
    statusChance: parseNumber(row['Status Chance']),
    statusDuration: parseNumber(row['Status Duration']),
    tier: parseNumber(row.Tier),
    description: row.Description,
    stage: 1,
    createdAt: CREATED_AT
  };

  const statChanges = parseStatChanges(row['Stat Changes']);
  if (statChanges) move.statChanges = statChanges;

  imported.push(move);
}

writeFileSync(MOVES_PATH, `${JSON.stringify([...existingMoves, ...imported], null, 2)}\n`);
console.log(`Imported ${imported.length} moves from ${sourceRows.length} approved rows`);
