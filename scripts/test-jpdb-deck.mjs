// Test script: fetch deck vocabulary and check card states
// Usage: JPDB_API_KEY=your_key node scripts/test-jpdb-deck.mjs
const API_KEY = process.env.JPDB_API_KEY;
if (!API_KEY) { console.error('Set JPDB_API_KEY env var'); process.exit(1); }
const BASE = 'https://jpdb.io/api/v1';

async function test() {
  // Try deck/list-vocabulary with a card_state filter
  console.log('Call 1: Fetching deck 82 with card_state filter for due...');
  const res = await fetch(`${BASE}/deck/list-vocabulary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({ id: 82, fetch_occurences: false, card_state_filter: ['due', 'failed'] })
  });

  if (!res.ok) {
    console.log('Failed:', res.status, await res.text());
  } else {
    const data = await res.json();
    console.log('Response keys:', Object.keys(data));
    console.log('Vocab entries returned:', data.vocabulary?.length ?? 0);
    console.log('First 5:', JSON.stringify(data.vocabulary?.slice(0, 5)));
  }
}

test().catch(console.error);
