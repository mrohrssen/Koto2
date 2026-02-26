import { readFileSync, readdirSync } from 'fs';
const dir = 'language/categories';
const files = readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('.'));
for (const f of files.sort()) {
  const data = JSON.parse(readFileSync(dir + '/' + f));
  const invalid = data.filter(e => !e.rank || !e.word || !e.reading || !e.meaning);
  if (invalid.length > 0) {
    console.log(f + ': ' + invalid.length + ' invalid entries');
    invalid.slice(0, 5).forEach(e => console.log('  ', JSON.stringify(e)));
    if (invalid.length > 5) console.log('  ... and ' + (invalid.length - 5) + ' more');
  }
}
