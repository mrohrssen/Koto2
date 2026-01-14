#!/usr/bin/env node
/**
 * Top 10k Japanese Words Mining Script
 *
 * Fetches vocabulary from JPDB deck 81 (~9.5k words) and classifies them
 * into game-relevant categories for the JRPG.
 *
 * Uses existing JPDB API functions with 1000-word batching and rate limiting.
 *
 * Usage: node scripts/mine-top10k.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { chat } from '../src/ai-providers.js';

// Configuration
const DECK_ID = 81;
const JPDB_API_BASE = 'https://jpdb.io/api/v1';
const BATCH_SIZE = 1000;
const MIN_CALL_INTERVAL_MS = 500;
const EXTRA_DELAY_BETWEEN_BATCHES_MS = 1000; // Extra delay between batches to be nice to JPDB

// Load settings
function loadSettings() {
  const settingsPath = '.jrpg-settings.json';
  if (existsSync(settingsPath)) {
    return JSON.parse(readFileSync(settingsPath, 'utf-8'));
  }
  throw new Error('Settings file not found. Please configure .jrpg-settings.json with jpdbApiKey');
}

// Rate-limited fetch
let lastJpdbCall = 0;
async function jpdbFetch(url, options) {
  const now = Date.now();
  const timeSinceLastCall = now - lastJpdbCall;

  if (timeSinceLastCall < MIN_CALL_INTERVAL_MS) {
    await sleep(MIN_CALL_INTERVAL_MS - timeSinceLastCall);
  }

  lastJpdbCall = Date.now();
  return fetch(url, options);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch all vocabulary IDs from a deck
 */
async function fetchDeckVocabIds(apiKey, deckId) {
  console.log(`Fetching vocabulary list from deck ${deckId}...`);

  const response = await jpdbFetch(`${JPDB_API_BASE}/deck/list-vocabulary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({ id: deckId })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Failed to fetch deck: ${error.error_message || response.status}`);
  }

  const data = await response.json();
  return data.vocabulary || [];
}

/**
 * Lookup vocabulary details in batches
 */
async function lookupVocabularyBatched(apiKey, vocabIds) {
  console.log(`Looking up ${vocabIds.length} vocabulary items in batches of ${BATCH_SIZE}...`);

  const allVocab = [];
  const totalBatches = Math.ceil(vocabIds.length / BATCH_SIZE);

  for (let i = 0; i < vocabIds.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const chunk = vocabIds.slice(i, i + BATCH_SIZE);

    console.log(`  Batch ${batchNum}/${totalBatches} (${chunk.length} words)...`);

    try {
      const response = await jpdbFetch(`${JPDB_API_BASE}/lookup-vocabulary`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          list: chunk,
          fields: ['spelling', 'reading', 'part_of_speech', 'meanings_chunks', 'frequency_rank']
        })
      });

      if (response.status === 429) {
        console.warn('  Rate limited! Waiting 30 seconds...');
        await sleep(30000);
        i -= BATCH_SIZE; // Retry this batch
        continue;
      }

      if (!response.ok) {
        console.warn(`  Batch failed with status ${response.status}, skipping...`);
        continue;
      }

      const data = await response.json();
      const vocabInfo = data.vocabulary_info || [];

      for (let j = 0; j < vocabInfo.length; j++) {
        const info = vocabInfo[j];
        if (!info) continue;

        const [spelling, reading, partOfSpeech, meaningsChunks, frequencyRank] = info;

        // Extract meanings from chunks
        const meanings = [];
        if (meaningsChunks && Array.isArray(meaningsChunks)) {
          for (const chunk of meaningsChunks) {
            if (Array.isArray(chunk)) {
              for (const meaning of chunk) {
                if (meaning && typeof meaning === 'string') {
                  meanings.push(meaning);
                }
              }
            }
          }
        }

        allVocab.push({
          spelling,
          reading,
          partOfSpeech: partOfSpeech || [],
          meanings,
          frequencyRank: frequencyRank ?? i + j + 1, // Use index as fallback rank
          vid: chunk[j][0],
          sid: chunk[j][1]
        });
      }

      // Extra delay between batches to be nice to JPDB
      if (i + BATCH_SIZE < vocabIds.length) {
        await sleep(EXTRA_DELAY_BETWEEN_BATCHES_MS);
      }

    } catch (error) {
      console.warn(`  Batch error: ${error.message}`);
    }
  }

  return allVocab;
}

/**
 * Classify vocabulary by part of speech
 * JPDB uses abbreviations: n (noun), v1/v5/vt/vi (verb), adj-i (i-adj), adj-na (na-adj), adv (adverb), int (interjection)
 */
function classifyByPOS(vocabulary) {
  const classified = {
    nouns: [],      // n, n-pref, n-suf, etc. - candidates for items/places/enemies/people
    verbs: [],      // v1, v5, vt, vi, vs, etc. - skill/action candidates
    iAdjectives: [], // adj-i - modifiers
    naAdjectives: [], // adj-na, adj-no - modifiers
    adverbs: [],    // adv - narration flavor
    interjections: [], // int - dialogue/expressions
    other: []       // Everything else
  };

  for (const word of vocabulary) {
    const pos = word.partOfSpeech || [];

    // Check each POS tag
    let categorized = false;

    for (const tag of pos) {
      const t = tag.toLowerCase();

      // Nouns: n, n-pref, n-suf, n-t (temporal noun), etc.
      if (t === 'n' || t.startsWith('n-') || t === 'pn') {
        classified.nouns.push(word);
        categorized = true;
        break;
      }

      // Verbs: v1, v5, v5k, vt, vi, vs, vk, etc.
      if (t.startsWith('v') && !t.startsWith('vi')) {
        classified.verbs.push(word);
        categorized = true;
        break;
      }
      if (t === 'vi' || t === 'vt' || t === 'vs' || t === 'vk') {
        classified.verbs.push(word);
        categorized = true;
        break;
      }

      // i-adjectives: adj-i
      if (t === 'adj-i' || t === 'adj') {
        classified.iAdjectives.push(word);
        categorized = true;
        break;
      }

      // na-adjectives: adj-na, adj-no
      if (t === 'adj-na' || t === 'adj-no' || t === 'adj-t' || t === 'adj-f') {
        classified.naAdjectives.push(word);
        categorized = true;
        break;
      }

      // Adverbs: adv, adv-to
      if (t === 'adv' || t.startsWith('adv-')) {
        classified.adverbs.push(word);
        categorized = true;
        break;
      }

      // Interjections: int
      if (t === 'int') {
        classified.interjections.push(word);
        categorized = true;
        break;
      }
    }

    if (!categorized) {
      classified.other.push(word);
    }
  }

  return classified;
}

/**
 * Use AI to sub-classify nouns into game categories
 */
async function subClassifyNouns(nouns, settings) {
  console.log(`\nSub-classifying ${nouns.length} nouns using AI...`);

  const categories = {
    weapons: [],
    armor: [],
    consumables: [],
    materials: [],
    accessories: [],
    enemies: {
      creatures: [],
      humanoids: [],
      supernatural: []
    },
    places: {
      environments: [],
      structures: [],
      rooms: []
    },
    npcs: {
      roles: [],
      occupations: []
    },
    uncategorized: []
  };

  // Process in smaller batches for AI
  const AI_BATCH_SIZE = 100;
  const totalBatches = Math.ceil(nouns.length / AI_BATCH_SIZE);

  for (let i = 0; i < nouns.length; i += AI_BATCH_SIZE) {
    const batchNum = Math.floor(i / AI_BATCH_SIZE) + 1;
    const batch = nouns.slice(i, i + AI_BATCH_SIZE);

    console.log(`  AI batch ${batchNum}/${totalBatches}...`);

    const wordList = batch.map(w => `${w.spelling} (${w.meanings.slice(0, 2).join(', ')})`).join('\n');

    const prompt = `Classify these Japanese nouns into game categories. Return JSON only, no explanation.

Categories:
- weapon: swords, guns, bows, staffs, etc.
- armor: helmets, body armor, shields, etc.
- consumable: food, drinks, medicine, potions
- material: crafting materials, resources
- accessory: rings, necklaces, badges, etc.
- enemy_creature: animals, monsters, beasts
- enemy_humanoid: human-type enemies, bandits, soldiers
- enemy_supernatural: ghosts, demons, spirits
- place_environment: forests, mountains, oceans, deserts
- place_structure: buildings, temples, castles, shops
- place_room: rooms, halls, chambers
- npc_role: shopkeeper, healer, guard, merchant
- npc_occupation: teacher, doctor, chef, farmer
- none: doesn't fit any category

Words:
${wordList}

Return JSON format: {"word": "category", ...}`;

    try {
      const response = await chat({
        provider: settings.aiProvider || 'openai',
        apiKey: settings.aiApiKey,
        messages: [{ role: 'user', content: prompt }],
        vocabulary: [],
        customSystemPrompt: 'You are a game content classifier. Return only valid JSON.',
        openaiModel: settings.openaiModel || 'gpt-4o-mini',
        openrouterModel: settings.openrouterModel,
        purpose: 'classification'
      });

      // Parse AI response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const classifications = JSON.parse(jsonMatch[0]);

        for (const word of batch) {
          const category = classifications[word.spelling];
          const entry = {
            word: word.spelling,
            reading: word.reading,
            rank: word.frequencyRank,
            meanings: word.meanings.slice(0, 3),
            vid: word.vid,
            sid: word.sid
          };

          switch (category) {
            case 'weapon': categories.weapons.push(entry); break;
            case 'armor': categories.armor.push(entry); break;
            case 'consumable': categories.consumables.push(entry); break;
            case 'material': categories.materials.push(entry); break;
            case 'accessory': categories.accessories.push(entry); break;
            case 'enemy_creature': categories.enemies.creatures.push(entry); break;
            case 'enemy_humanoid': categories.enemies.humanoids.push(entry); break;
            case 'enemy_supernatural': categories.enemies.supernatural.push(entry); break;
            case 'place_environment': categories.places.environments.push(entry); break;
            case 'place_structure': categories.places.structures.push(entry); break;
            case 'place_room': categories.places.rooms.push(entry); break;
            case 'npc_role': categories.npcs.roles.push(entry); break;
            case 'npc_occupation': categories.npcs.occupations.push(entry); break;
            default: categories.uncategorized.push(entry);
          }
        }
      }

      // Rate limit AI calls
      await sleep(500);

    } catch (error) {
      console.warn(`  AI classification error: ${error.message}`);
      // Add to uncategorized on error
      for (const word of batch) {
        categories.uncategorized.push({
          word: word.spelling,
          reading: word.reading,
          rank: word.frequencyRank,
          meanings: word.meanings.slice(0, 3),
          vid: word.vid,
          sid: word.sid
        });
      }
    }
  }

  return categories;
}

/**
 * Create skill suggestions from verbs
 */
function createSkillSuggestions(verbs) {
  return {
    combat: verbs
      .filter(v => {
        const meanings = v.meanings.join(' ').toLowerCase();
        return meanings.includes('attack') || meanings.includes('hit') ||
               meanings.includes('cut') || meanings.includes('strike') ||
               meanings.includes('shoot') || meanings.includes('throw') ||
               meanings.includes('fight') || meanings.includes('kill') ||
               meanings.includes('destroy') || meanings.includes('break');
      })
      .map(v => ({
        word: v.spelling,
        reading: v.reading,
        rank: v.frequencyRank,
        meanings: v.meanings.slice(0, 3),
        suggestion: `Combat skill: ${v.meanings[0] || v.spelling}`
      }))
      .sort((a, b) => a.rank - b.rank),

    utility: verbs
      .filter(v => {
        const meanings = v.meanings.join(' ').toLowerCase();
        return meanings.includes('heal') || meanings.includes('protect') ||
               meanings.includes('help') || meanings.includes('support') ||
               meanings.includes('buff') || meanings.includes('boost') ||
               meanings.includes('restore') || meanings.includes('recover');
      })
      .map(v => ({
        word: v.spelling,
        reading: v.reading,
        rank: v.frequencyRank,
        meanings: v.meanings.slice(0, 3),
        suggestion: `Utility skill: ${v.meanings[0] || v.spelling}`
      }))
      .sort((a, b) => a.rank - b.rank)
  };
}

/**
 * Create dialogue suggestions from interjections and expressions
 */
function createDialogueSuggestions(interjections, adverbs) {
  return {
    greetings: interjections
      .filter(i => {
        const meanings = i.meanings.join(' ').toLowerCase();
        return meanings.includes('hello') || meanings.includes('hi') ||
               meanings.includes('goodbye') || meanings.includes('bye') ||
               meanings.includes('welcome') || meanings.includes('greet');
      })
      .map(i => ({
        word: i.spelling,
        reading: i.reading,
        rank: i.frequencyRank,
        meanings: i.meanings.slice(0, 3)
      }))
      .sort((a, b) => a.rank - b.rank),

    expressions: interjections
      .filter(i => {
        const meanings = i.meanings.join(' ').toLowerCase();
        return meanings.includes('wow') || meanings.includes('oh') ||
               meanings.includes('ah') || meanings.includes('exclaim') ||
               meanings.includes('surprise') || meanings.includes('shock');
      })
      .map(i => ({
        word: i.spelling,
        reading: i.reading,
        rank: i.frequencyRank,
        meanings: i.meanings.slice(0, 3)
      }))
      .sort((a, b) => a.rank - b.rank),

    exclamations: interjections
      .map(i => ({
        word: i.spelling,
        reading: i.reading,
        rank: i.frequencyRank,
        meanings: i.meanings.slice(0, 3)
      }))
      .sort((a, b) => a.rank - b.rank)
  };
}

/**
 * Create modifier suggestions from adjectives
 */
function createModifierSuggestions(iAdjectives, naAdjectives) {
  const allAdjectives = [...iAdjectives, ...naAdjectives];

  return {
    positive: allAdjectives
      .filter(a => {
        const meanings = a.meanings.join(' ').toLowerCase();
        return meanings.includes('strong') || meanings.includes('powerful') ||
               meanings.includes('good') || meanings.includes('great') ||
               meanings.includes('beautiful') || meanings.includes('fast') ||
               meanings.includes('brave') || meanings.includes('holy');
      })
      .map(a => ({
        word: a.spelling,
        reading: a.reading,
        rank: a.frequencyRank,
        meanings: a.meanings.slice(0, 3),
        type: a.partOfSpeech?.includes('形容詞') ? 'i-adj' : 'na-adj'
      }))
      .sort((a, b) => a.rank - b.rank),

    negative: allAdjectives
      .filter(a => {
        const meanings = a.meanings.join(' ').toLowerCase();
        return meanings.includes('dark') || meanings.includes('evil') ||
               meanings.includes('weak') || meanings.includes('bad') ||
               meanings.includes('scary') || meanings.includes('terrible') ||
               meanings.includes('cursed') || meanings.includes('poison');
      })
      .map(a => ({
        word: a.spelling,
        reading: a.reading,
        rank: a.frequencyRank,
        meanings: a.meanings.slice(0, 3),
        type: a.partOfSpeech?.includes('形容詞') ? 'i-adj' : 'na-adj'
      }))
      .sort((a, b) => a.rank - b.rank),

    all: allAdjectives
      .map(a => ({
        word: a.spelling,
        reading: a.reading,
        rank: a.frequencyRank,
        meanings: a.meanings.slice(0, 3),
        type: a.partOfSpeech?.includes('形容詞') ? 'i-adj' : 'na-adj'
      }))
      .sort((a, b) => a.rank - b.rank)
  };
}

/**
 * Main function
 */
async function main() {
  console.log('=== Top 10k Japanese Words Mining Script ===\n');

  // Load settings
  const settings = loadSettings();
  if (!settings.jpdbApiKey) {
    throw new Error('JPDB API key not configured in .jrpg-settings.json');
  }

  // Check if we have an AI key (optional, but needed for noun sub-classification)
  const hasAI = settings.aiApiKey && settings.aiProvider;
  if (!hasAI) {
    console.log('Note: AI provider not configured. Noun sub-classification will be skipped.');
    console.log('Configure aiProvider and aiApiKey in settings to enable.\n');
  }

  // Step 1: Fetch vocabulary IDs
  const vocabIds = await fetchDeckVocabIds(settings.jpdbApiKey, DECK_ID);
  console.log(`Found ${vocabIds.length} vocabulary items in deck ${DECK_ID}\n`);

  // Step 2: Lookup vocabulary details
  const vocabulary = await lookupVocabularyBatched(settings.jpdbApiKey, vocabIds);
  console.log(`\nSuccessfully looked up ${vocabulary.length} words\n`);

  // Step 3: Classify by POS
  console.log('Classifying by part of speech...');
  const byPOS = classifyByPOS(vocabulary);
  console.log(`  Nouns: ${byPOS.nouns.length}`);
  console.log(`  Verbs: ${byPOS.verbs.length}`);
  console.log(`  i-Adjectives: ${byPOS.iAdjectives.length}`);
  console.log(`  na-Adjectives: ${byPOS.naAdjectives.length}`);
  console.log(`  Adverbs: ${byPOS.adverbs.length}`);
  console.log(`  Interjections: ${byPOS.interjections.length}`);
  console.log(`  Other: ${byPOS.other.length}`);

  // Step 4: Sub-classify nouns (if AI available)
  let items;
  if (hasAI) {
    items = await subClassifyNouns(byPOS.nouns, settings);
  } else {
    // Without AI, put all nouns in uncategorized
    items = {
      weapons: [],
      armor: [],
      consumables: [],
      materials: [],
      accessories: [],
      enemies: { creatures: [], humanoids: [], supernatural: [] },
      places: { environments: [], structures: [], rooms: [] },
      npcs: { roles: [], occupations: [] },
      uncategorized: byPOS.nouns.map(n => ({
        word: n.spelling,
        reading: n.reading,
        rank: n.frequencyRank,
        meanings: n.meanings.slice(0, 3),
        vid: n.vid,
        sid: n.sid
      }))
    };
  }

  // Step 5: Create other suggestions
  const skills = createSkillSuggestions(byPOS.verbs);
  const dialogue = createDialogueSuggestions(byPOS.interjections, byPOS.adverbs);
  const modifiers = createModifierSuggestions(byPOS.iAdjectives, byPOS.naAdjectives);

  // Step 6: Build final output
  const output = {
    metadata: {
      sourceDeckId: DECK_ID,
      totalWords: vocabulary.length,
      generatedAt: new Date().toISOString(),
      aiClassification: hasAI
    },
    stats: {
      byPOS: {
        nouns: byPOS.nouns.length,
        verbs: byPOS.verbs.length,
        iAdjectives: byPOS.iAdjectives.length,
        naAdjectives: byPOS.naAdjectives.length,
        adverbs: byPOS.adverbs.length,
        interjections: byPOS.interjections.length,
        other: byPOS.other.length
      },
      classified: {
        weapons: items.weapons.length,
        armor: items.armor.length,
        consumables: items.consumables.length,
        materials: items.materials.length,
        accessories: items.accessories.length,
        enemies: items.enemies.creatures.length + items.enemies.humanoids.length + items.enemies.supernatural.length,
        places: items.places.environments.length + items.places.structures.length + items.places.rooms.length,
        npcs: items.npcs.roles.length + items.npcs.occupations.length,
        skills: skills.combat.length + skills.utility.length,
        uncategorized: items.uncategorized.length
      }
    },
    items: {
      weapons: items.weapons.sort((a, b) => a.rank - b.rank),
      armor: items.armor.sort((a, b) => a.rank - b.rank),
      consumables: items.consumables.sort((a, b) => a.rank - b.rank),
      materials: items.materials.sort((a, b) => a.rank - b.rank),
      accessories: items.accessories.sort((a, b) => a.rank - b.rank)
    },
    enemies: {
      creatures: items.enemies.creatures.sort((a, b) => a.rank - b.rank),
      humanoids: items.enemies.humanoids.sort((a, b) => a.rank - b.rank),
      supernatural: items.enemies.supernatural.sort((a, b) => a.rank - b.rank)
    },
    places: {
      environments: items.places.environments.sort((a, b) => a.rank - b.rank),
      structures: items.places.structures.sort((a, b) => a.rank - b.rank),
      rooms: items.places.rooms.sort((a, b) => a.rank - b.rank)
    },
    npcs: {
      roles: items.npcs.roles.sort((a, b) => a.rank - b.rank),
      occupations: items.npcs.occupations.sort((a, b) => a.rank - b.rank)
    },
    skills,
    dialogue,
    modifiers,
    uncategorized: items.uncategorized.sort((a, b) => a.rank - b.rank)
  };

  // Step 7: Save output
  const outputPath = 'data/game-content-suggestions.json';
  writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`\n=== Complete ===`);
  console.log(`Output saved to: ${outputPath}`);
  console.log(`\nSummary:`);
  console.log(`  Total words processed: ${vocabulary.length}`);
  console.log(`  Weapons: ${items.weapons.length}`);
  console.log(`  Armor: ${items.armor.length}`);
  console.log(`  Consumables: ${items.consumables.length}`);
  console.log(`  Materials: ${items.materials.length}`);
  console.log(`  Accessories: ${items.accessories.length}`);
  console.log(`  Enemies: ${items.enemies.creatures.length + items.enemies.humanoids.length + items.enemies.supernatural.length}`);
  console.log(`  Places: ${items.places.environments.length + items.places.structures.length + items.places.rooms.length}`);
  console.log(`  NPCs: ${items.npcs.roles.length + items.npcs.occupations.length}`);
  console.log(`  Combat skills: ${skills.combat.length}`);
  console.log(`  Utility skills: ${skills.utility.length}`);
  console.log(`  Uncategorized: ${items.uncategorized.length}`);
}

main().catch(error => {
  console.error('Fatal error:', error.message);
  process.exit(1);
});
