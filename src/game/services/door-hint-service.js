/**
 * @file door-hint-service.js - Chippy's Door Sense
 *
 * Generates atmospheric Japanese narration for branch door choices.
 * Selects random seed phrases from data/door-hints.json and optionally
 * remixes them via AI using the player's known vocabulary.
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load seed phrases once at startup
const hintsPath = join(__dirname, '../../../data/door-hints.json');
let hintsData = null;

function loadHints() {
  if (!hintsData) {
    hintsData = JSON.parse(readFileSync(hintsPath, 'utf-8'));
  }
  return hintsData;
}

/**
 * Pick a random seed phrase for a room type
 * @param {string} roomType - encounter, shrine, quiz, wordDiscovery, shop
 * @returns {{ id: string, archetype: string, text: string }}
 */
function pickSeed(roomType) {
  const data = loadHints();
  const pool = data.hints[roomType];
  if (!pool || pool.length === 0) {
    return { id: 'fallback', archetype: 'calm', text: '何かを感じる...' };
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Build the AI remix prompt for both doors
 * @param {object} seed1 - Seed phrase for door 1
 * @param {object} seed2 - Seed phrase for door 2
 * @param {object} context - { floor, playerHp, playerMaxHp, wardName }
 * @returns {string} User prompt for AI
 */
function buildRemixPrompt(seed1, seed2, context) {
  const hpPercent = context.playerHp && context.playerMaxHp
    ? Math.round((context.playerHp / context.playerMaxHp) * 100)
    : 100;

  return `チッピーは仲間のデジタル精霊。二つの扉の先を感じ取る能力がある。
今は${context.wardName || 'ダンジョン'}の${context.floor || 1}階。プレイヤーのHP：${hpPercent}%。

以下のヒントを、チッピーの声でリミックスして。意味と感情は同じ。でも言葉を変えて、新鮮にして。

【扉1のヒント原文】
${seed1.text}

【扉2のヒント原文】
${seed2.text}

出力形式（厳守）：
DOOR1: [チッピーのリミックス版。2-4文]
DOOR2: [チッピーのリミックス版。2-4文]

ルール：
- 使える言葉リストの中の言葉だけ使う
- チッピーは「僕」を使う、カジュアルに話す
- 扉1と扉2は全く違う雰囲気にする
- 原文の感情（怖い、楽しい、etc）を保つ
- 日本語だけ。英語禁止`;
}

/**
 * Parse AI response into two door hints
 * @param {string} response - AI response with DOOR1: and DOOR2: markers
 * @returns {{ door1: string, door2: string }}
 */
function parseRemixResponse(response) {
  const door1Match = response.match(/DOOR1:\s*([\s\S]*?)(?=DOOR2:|$)/);
  const door2Match = response.match(/DOOR2:\s*([\s\S]*?)$/);

  return {
    door1: door1Match ? door1Match[1].trim() : null,
    door2: door2Match ? door2Match[1].trim() : null
  };
}

/**
 * Generate door hints for a branch point
 * @param {string} roomType1 - Type of room behind door 1
 * @param {string} roomType2 - Type of room behind door 2
 * @param {object} context - { floor, playerHp, playerMaxHp, wardName }
 * @param {Function|null} chatFn - AI chat function (null = fallback to raw seeds)
 * @param {string[]} vocabulary - Player's known words
 * @param {string} jlptLevel - N5-N1
 * @param {object} aiConfig - { provider, apiKey, openaiModel, openrouterModel }
 * @returns {Promise<{ door1: string, door2: string, seeds: { seed1: object, seed2: object } }>}
 */
export async function generateDoorHints(roomType1, roomType2, context, chatFn, vocabulary, jlptLevel, aiConfig) {
  const seed1 = pickSeed(roomType1);
  const seed2 = pickSeed(roomType2);

  // Fallback: no AI available, return raw seeds
  if (!chatFn || !aiConfig?.apiKey || !vocabulary || vocabulary.length === 0) {
    return {
      door1: seed1.text,
      door2: seed2.text,
      seeds: { seed1, seed2 }
    };
  }

  // Build the remix prompt
  const userPrompt = buildRemixPrompt(seed1, seed2, context);

  const vocabList = vocabulary.slice(0, 8000).join(', ');

  const systemPrompt = `=== チッピー（CHIPPY）===
あなたはチッピー、冒険者の仲間のデジタル精霊。
扉の先にあるものを感じ取る能力がある。

【性格】
・忠実で勇敢だけど、時々怖がり
・カジュアルに話す（「僕」「〜だよ」「〜かも」）
・プレイヤーのことを本当に心配している
・感情豊か：怖い時は怖い、嬉しい時は嬉しい

=== 使える言葉（重要）===
この言葉リストからだけ使う：
${vocabList || '(基本的な言葉)'}

【ルール】
1. リストにない言葉は使わない
2. 助詞OK：は、が、を、に、で、へ、と、も、の、か、よ、ね
3. 擬音OK：ゾクゾク、ビリビリ、フワフワ、ガタガタ
4. 数字は漢字：一、二、三、十

文法：JLPT ${jlptLevel || 'N4'}
日本語だけ出力。英語禁止。`;

  try {
    const response = await chatFn({
      provider: aiConfig.provider,
      apiKey: aiConfig.apiKey,
      messages: [{ role: 'user', content: userPrompt }],
      vocabulary,
      jlptLevel: jlptLevel || 'N4',
      customSystemPrompt: systemPrompt,
      openaiModel: aiConfig.openaiModel,
      openrouterModel: aiConfig.openrouterModel,
      purpose: 'narration'
    });

    if (response) {
      const parsed = parseRemixResponse(response);
      return {
        door1: parsed.door1 || seed1.text,
        door2: parsed.door2 || seed2.text,
        seeds: { seed1, seed2 }
      };
    }
  } catch (error) {
    console.error('[DoorHints] AI remix failed, using raw seeds:', error.message);
  }

  // Fallback to raw seeds
  return {
    door1: seed1.text,
    door2: seed2.text,
    seeds: { seed1, seed2 }
  };
}
