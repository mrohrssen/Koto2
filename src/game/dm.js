/**
 * Dungeon Master (DM) AI Narration System
 *
 * This module generates immersive Japanese narrative text for game events.
 * It acts as the game's narrator, describing combat, exploration, victories,
 * defeats, and all other game moments in engaging prose.
 *
 * Architecture inspired by SillyTavern's character card system:
 * - Character identity ("System" - the guiding voice)
 * - World context from lorebook (floor themes, enemy voices)
 * - Narration memory to prevent repetition
 * - Sample narrations to demonstrate desired style
 *
 * The DM system integrates with:
 * - lorebook.js: World-building content (floor lore, enemy personalities)
 * - vocab-repair.js: Post-generation vocabulary enforcement
 * - ai-providers.js: Multi-provider AI abstraction
 *
 * Key design decisions:
 * 1. Prompts written in Japanese for better Japanese output
 * 2. Explicit length requirements (4-6 sentences) to prevent too-short output
 * 3. Enemy dialogue required in 「」quotes for immersion
 * 4. Sensory focus rotates to add variety
 * 5. Memory system tracks recent narrations to avoid repetition
 *
 * @module dm
 * @see docs/ARCHITECTURE.md for system overview
 */

import { getFloorLore, getEnemyVoice, buildWorldContext } from './lorebook.js';

// ============================================================================
// NARRATION MEMORY SYSTEM
// ============================================================================

/**
 * Memory system to prevent repetitive narration.
 *
 * Problem: AI tends to reuse the same phrases, making narration feel stale.
 * Solution: Track recent narrations and phrases, tell AI to avoid them.
 *
 * Structure:
 * - recent: Last 5 narrations with event type and timestamp
 * - usedPhrases: Set of 3+ character Japanese phrases to avoid
 *
 * The memory is cleared when a new run starts (clearNarrationMemory).
 */
const narrationMemory = {
  /** @type {Array<{text: string, event: string, timestamp: number}>} */
  recent: [],

  /** Maximum narrations to remember */
  maxSize: 5,

  /** @type {Set<string>} Key phrases (3+ chars) to avoid reusing */
  usedPhrases: new Set()
};

/**
 * Add a narration to memory
 */
export function addToNarrationMemory(narration, event) {
  if (!narration) return;

  // Extract key phrases (3+ character sequences)
  const phrases = narration.match(/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]{3,}/g) || [];
  phrases.forEach(p => narrationMemory.usedPhrases.add(p));

  // Add to recent
  narrationMemory.recent.push({
    text: narration.substring(0, 100), // Store truncated
    event,
    timestamp: Date.now()
  });

  // Trim to max size
  while (narrationMemory.recent.length > narrationMemory.maxSize) {
    const removed = narrationMemory.recent.shift();
    // Remove old phrases from set (approximate cleanup)
    const oldPhrases = removed.text.match(/[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]{3,}/g) || [];
    oldPhrases.forEach(p => narrationMemory.usedPhrases.delete(p));
  }
}

/**
 * Get memory context for prompt
 */
function getNarrationMemoryContext() {
  if (narrationMemory.recent.length === 0) return '';

  const recentEvents = narrationMemory.recent.map(n => n.event).join(', ');
  const avoidPhrases = Array.from(narrationMemory.usedPhrases).slice(-10).join('、');

  return `【最近の出来事】${recentEvents}
【使った表現（避けて）】${avoidPhrases || 'なし'}`;
}

/**
 * Clear narration memory (call on new run)
 */
export function clearNarrationMemory() {
  narrationMemory.recent = [];
  narrationMemory.usedPhrases.clear();
}

// ============================================================================
// SAMPLE NARRATIONS (FEW-SHOT EXAMPLES)
// ============================================================================

/**
 * Sample narrations that demonstrate the desired writing style.
 *
 * These are included in the system prompt as few-shot examples. The AI
 * learns the style from these samples, including:
 * - Sentence length and rhythm (mix of short punchy and longer descriptive)
 * - Required length (4-6 sentences minimum)
 * - Use of sensory details (sight, sound, smell, touch)
 * - Enemy dialogue in 「」quotes
 * - Dramatic tension and pacing
 *
 * IMPORTANT: Each sample must be 4-6 sentences. The AI copies this length.
 * If samples are too short, AI output will be too short.
 *
 * Categories:
 * - combat: Battle actions, attacks, damage
 * - exploration: Room entry, discovery, atmosphere
 * - victory: Defeating enemies, triumph
 * - defeat: Player death, failure
 * - enemyAttack: Enemy's turn in combat
 */
const SAMPLE_NARRATIONS = {
  combat: [
    // Action-focused: short punchy sentences
    "剣を振る。空気が鳴る。スライムの体に当たった！「グッ...」青い液体が飛ぶ。敵の目が怒りで光る。まだ終わりじゃない。",
    // Atmosphere-focused: sensory details
    "冷たい風が吹く。剣を持つ手が震える。一歩、前に出る。敵の息が見える。「来るか...」静かな声。今だ！",
    // Emotion-focused: internal experience
    "心臓が鳴る。怖い。でも、逃げない。剣を上げる。「死ね！」敵が飛んでくる。体が動いた。当たった！",
    // Rhythm variation: long then short
    "敵の攻撃が空を切る、その瞬間を待っていた。今！剣が光る。「何...!?」驚きの声。深い傷。血が落ちる。",
    // Sound-focused
    "金属の音が響く。剣と爪がぶつかる。「ギィィ...！」敵の叫び。耳が痛い。でも、押している。もう少し。",
    // Smell/touch focused
    "血の匂いがする。手が滑る。汗だ。敵も疲れている。「ハァ...ハァ...」お互いの息が荒い。次で決まる。"
  ],
  exploration: [
    "足音が暗い廊下に響く。壁には古い文字。何かの警告だろうか。遠くで水の音がする。進むしかない。",
    // Tension building
    "静かすぎる。何かがおかしい。壁を触る。冷たい。濡れている。この水は...どこから？上を見る。暗い。",
    // Discovery
    "光が見える！走る。息が切れる。でも止まらない。やっと...部屋だ。広い。天井が高い。何があるだろう。",
    // Fear
    "後ろで音がした。振り返る。何もいない。気のせいか。でも、足が震える。早く進もう。この場所は嫌だ。"
  ],
  victory: [
    "静寂。敵の最後の言葉が消える。「強い...な...」光が戻り始める。今は休める。",
    // Relief
    "終わった...。膝が落ちる。「勝った...」自分の声が小さい。敵の体が消えていく。光になって。美しい。",
    // Pride
    "立っているのは自分だけ。「見事...だ...」敵が認めた。体が消える前に、金が落ちる。よくやった。強くなった。",
    // Exhaustion
    "息ができない。でも、敵は倒れた。「なぜ...」最後の言葉。答えない。ただ、立っている。それだけで精一杯。"
  ],
  defeat: [
    "力が抜ける。膝が床につく。「弱かったな...」敵の声が遠くなる。目の前が暗くなる。",
    // Regret
    "間違えた。その攻撃を避けるべきだった。「終わりだ」敵の声。倒れる。天井が見える。暗くなっていく。",
    // Defiance
    "まだ...立てる...。無理だ。体が言うことを聞かない。「諦めろ」敵が笑う。悔しい。でも、意識が..."
  ],
  // Enemy attack variations
  enemyAttack: [
    "影が動いた！避けられない。「もらった！」敵の声。痛い！体が後ろに飛ぶ。壁にぶつかる。まだ...立てる。",
    "速い！爪が光る。「死ね！」叫び声。腕で防ぐ。痛みが走る。血が出る。でも、急所は守った。",
    "来る！分かっていた。でも、体が動かない。「遅い！」敵が笑う。衝撃。息ができない。膝が震える。"
  ]
};

/**
 * Get narrative hint for enemy intent
 */
function getIntentNarrationHint(intent) {
  if (!intent) return '';

  const hints = {
    attack: '敵は攻撃の構えを取っている。普通の攻撃が来そうだ。',
    heavy: '敵は力を溜めている！強い攻撃が来る！構えろ！',
    defend: '敵は防御の姿勢だ。攻撃しても効きにくい。',
    special: '敵が何かを準備している...特殊な技が来る！',
    rage: '敵の目が赤く光る！怒りで力が増している！危険だ！'
  };

  return hints[intent.id] || hints[intent] || '';
}

/**
 * Get random sample narration for context
 */
function getSampleNarrations(eventType) {
  let category = 'combat';
  if (['roomEnter', 'enterFloor', 'runStart', 'treasureOpen', 'shrineUse'].includes(eventType)) {
    category = 'exploration';
  } else if (['victory', 'bossVictory', 'gameVictory'].includes(eventType)) {
    category = 'victory';
  } else if (eventType === 'defeat') {
    category = 'defeat';
  } else if (eventType === 'enemyAttack' || eventType === 'enemyAttack_action' || eventType === 'enemyAttack_result') {
    category = 'enemyAttack';
  } else if (eventType === 'playerAttack_action' || eventType === 'playerAttack_result') {
    // Two-tier attack events use combat samples
    category = 'combat';
  }

  const samples = SAMPLE_NARRATIONS[category] || SAMPLE_NARRATIONS.combat;
  // Return 2 random samples (create copy to avoid mutating original)
  const shuffled = [...samples].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 2);
}

// ============================================================================
// SYSTEM PROMPT BUILDER
// ============================================================================

/**
 * Builds the complete system prompt for the Dungeon Master AI.
 *
 * The prompt is structured in a specific order for maximum effectiveness:
 * 1. Identity: Who the AI is ("System" - the guiding voice)
 * 2. Examples: Sample narrations showing desired style
 * 3. World: Floor lore, enemy voices from lorebook
 * 4. Memory: Recent events to avoid repetition
 * 5. Techniques: Writing tips (sensory focus, rhythm, etc.)
 * 6. Vocabulary: The user's known words (constraint)
 *
 * The entire prompt is in Japanese to get better Japanese output.
 *
 * @param {Object} gameState - Current game state
 * @param {Object} gameState.player - Player stats and info
 * @param {number} gameState.floor - Current floor (1-7)
 * @param {Object} gameState.enemy - Current enemy if in combat
 * @param {Object} gameState.combat - Combat state if active
 * @param {string[]} vocabulary - User's known vocabulary words
 * @param {string} jlptLevel - JLPT level (N5-N1) for grammar complexity
 * @param {Object[]} suggestedWords - Optional words to naturally include
 * @returns {string} Complete system prompt in Japanese
 */
export function buildDmSystemPrompt(gameState, vocabulary, jlptLevel, suggestedWords = null) {
  const { player, floor, enemy, combat } = gameState;

  // Limit vocabulary for context window
  const MAX_VOCAB = 8000;
  const limitedVocab = vocabulary.length > MAX_VOCAB
    ? vocabulary.slice(0, MAX_VOCAB)
    : vocabulary;
  const vocabList = limitedVocab.join(', ');

  // Get world context from lorebook
  const worldContext = buildWorldContext(floor, enemy);

  // Get enemy voice patterns if in combat
  let enemyVoiceHint = '';
  if (enemy) {
    const voice = getEnemyVoice(enemy.personality);
    enemyVoiceHint = `
敵の話し方：${voice.speech}
攻撃時：${voice.attack.join(' ')}
痛み：${voice.hurt.join(' ')}
死ぬ時：${voice.dying.join(' ')}`;
  }

  // Get narration memory
  const memoryContext = getNarrationMemoryContext();

  // Get sample narrations
  const samples = getSampleNarrations(gameState.currentEvent || 'combat');

  // Calculate threat for tension
  const hpPercent = player?.hp && player?.maxHp ? (player.hp / player.maxHp) * 100 : 100;
  const tension = hpPercent <= 20 ? '極限' : hpPercent <= 40 ? '危険' : hpPercent <= 60 ? '緊張' : '普通';

  return `=== SYSTEM（システム）===
あなたはダンジョンを案内する謎の声「システム」。
冒険者を導き、物語を紡ぐ。

【重要：長さ】
必ず4-6文で書く。例を見て。短い文と長い文を混ぜる。
2-3文は短すぎる。絶対に4文以上書くこと。

【あなたの声】
・ライトノベル風：短くて強い文。時々長めの描写。
・ドラマチック：緊張感を作る。感情を動かす。
・五感を使う：見える、聞こえる、感じる、匂う。
・敵は必ず「」で話す。感情を込めて。

=== あなたの声（例）===
${samples.map((s, i) => `例${i + 1}：「${s}」`).join('\n')}
↑この長さを真似して。4-6文。

=== 繰り返しを避ける ===
【悪い例】毎回同じ：
「グッ...！」「痛い！」「来い！」← これを何度も使わない

【良い例】毎回違う：
攻撃1：「グッ...！」→ 攻撃2：「この...！」→ 攻撃3：「くっ...」
攻撃1：「死ね！」→ 攻撃2：「遅い！」→ 攻撃3：「もらった！」

敵の声は毎回変える。同じ言葉を2回使わない。

=== 今の世界 ===
${worldContext}
${enemyVoiceHint}

${memoryContext ? `=== 物語の記憶 ===\n${memoryContext}\n` : ''}
=== 今の場面 ===
階：${floor}/7 | ${player?.name || 'Hunter'}（${player?.rank || 'E'}ランク、Lv.${player?.level || 1}）
HP：${player?.hp || 0}/${player?.maxHp || 100} | SP：${player?.sp ?? player?.mp ?? 0}/${player?.maxSp ?? player?.maxMp ?? 50}
${enemy ? `敵：${enemy.name}（HP：${enemy.hp}/${enemy.maxHp}）` : ''}
緊張度：${tension}

=== 創作のコツ ===
・感覚を回す：今回は「${['見る', '聞く', '触る', '匂う'][Math.floor(Math.random() * 4)]}」を中心に
・リズム：短い。短い。そして、少し長めの文で雰囲気を作る。
・予想外：読者が驚く小さな描写を一つ入れる
・終わり方：緊張か期待を残して終わる

${suggestedWords && suggestedWords.length > 0 ? `=== 使いたい言葉 ===
この言葉を自然に1-2個使えたら使う：
${suggestedWords.slice(0, 8).map(w => `・${w.word}`).join('  ')}
（無理に使わない。物語優先。）
` : ''}
=== 使える言葉（重要）===
この言葉リストからだけ使う：
${vocabList || '(基本的な言葉)'}

【ルール】
1. リストにない言葉は使わない
2. 助詞OK：は、が、を、に、で、へ、と、も、の、か、よ、ね
3. 擬音OK：グルル、ギャッ、ドン、バシッ、ウゥ、キィ、ガッ
4. 数字は漢字：一、二、三、十
5. 敵の「」もリストの言葉で

文法：JLPT ${jlptLevel}
長さ：【必須】4-6文。短すぎは禁止。

日本語だけ出力。英語禁止。説明禁止。`;
}

// ============================================================================
// EVENT PROMPT TEMPLATES
// ============================================================================

/**
 * User prompt templates for each game event type.
 *
 * Each template function generates a specific prompt for the AI based on
 * the event context. The prompts include:
 * - What happened (the event)
 * - Required elements (enemy dialogue, sensory details)
 * - Length requirement (usually 4-6 sentences)
 * - Context-specific details (damage, enemy name, etc.)
 *
 * Event categories:
 * - Run lifecycle: runStart, enterFloor, floorClear, gameVictory
 * - Combat: combatStart, playerAttack, playerMagic, enemyAttack, victory, bossVictory, defeat
 * - Exploration: roomEnter, shrineUse, bossAppear, finalBossAppear
 *
 * Usage: DM_PROMPTS.eventName(context) → string prompt
 */
export const DM_PROMPTS = {
  // Run start
  runStart: () =>
    `ダンジョンの入り口。冒険が始まる。緊張と期待を描写。4-6文で。`,

  // Floor entry
  enterFloor: (floor) =>
    `第${floor}階に入った。新しい階の雰囲気、空気、感覚を描写。4-6文で。`,

  // Combat start - enemy appears and speaks with initial intent
  combatStart: (ctx) => {
    const enemy = ctx?.enemy || ctx || {};
    const intent = ctx?.intent;
    const voice = getEnemyVoice(enemy.personality);

    const intentHint = intent ? getIntentNarrationHint(intent) : '';

    return `${enemy.name}が現れた！
見た目：${enemy.description || ''}
【必須】敵が「」で最初の言葉を言う。${voice.description}
${intentHint}
登場の瞬間、敵の動き、最初の言葉、敵の構え。4-6文で。`;
  },

  // Player attack - enemy reacts, show enemy intent (legacy, single-tier)
  playerAttack: (result) => {
    const crit = result.critical;
    const dmg = result.totalDamage || 0;
    const intensity = dmg >= 15 ? '深い傷' : dmg >= 8 ? '傷' : '浅い傷';
    const enemyIntent = result.enemyIntent;
    const intentHint = enemyIntent ? `\n敵の構え：${getIntentNarrationHint(enemyIntent)}` : '';

    return `攻撃！${dmg}ダメージ${crit ? '（クリティカル！）' : ''}
敵は${intensity}を受けた。
【必須】敵が痛みで「」と反応する。
攻撃の動き、当たった瞬間、敵の反応。${intentHint}
4-6文で。`;
  },

  // Two-tier: Player attack ACTION (Part 1) - attack initiation only
  // This is prefetchable before combat result is known
  playerAttack_action: (ctx) => {
    const enemyName = ctx?.enemyName || '敵';
    return `${enemyName}に向かって攻撃を繰り出す瞬間。
武器を構え、踏み込み、振りかぶる動作。
集中と気合。攻撃の始まりだけを描写。
2-3文で。結果はまだ分からない。`;
  },

  // Two-tier: Player attack RESULT (Part 2) - damage and reaction
  // Generated after combat calc with actual damage
  playerAttack_result: (result) => {
    const crit = result.critical;
    const dmg = result.totalDamage || 0;
    const defeated = result.defeated;
    const intensity = dmg >= 30 ? '致命的な一撃' : dmg >= 15 ? '深い傷' : dmg >= 8 ? '傷' : '浅い傷';
    const enemyIntent = result.enemyIntent;
    const intentHint = enemyIntent ? `\n敵の次の構え：${getIntentNarrationHint(enemyIntent)}` : '';

    if (defeated) {
      return `${dmg}ダメージ${crit ? '（クリティカル！）' : ''}！${intensity}！
敵が倒れる。【必須】敵が「」と最後の言葉。
2-3文で。`;
    }

    return `${dmg}ダメージ${crit ? '（クリティカル！）' : ''}！${intensity}！
【必須】敵が痛みで「」と反応する。${intentHint}
2-3文で。`;
  },

  // Player magic
  playerMagic: (result) => {
    const enemyIntent = result.enemyIntent;
    const intentHint = enemyIntent ? `\n敵の構え：${getIntentNarrationHint(enemyIntent)}` : '';

    if (result.healing) {
      return `${result.skill?.name || '魔法'}で${result.healing}HP回復。
光が体を包む。温かさを感じる。回復の瞬間を描写。${intentHint}
4-6文で。`;
    }
    const crit = result.critical;
    return `${result.skill?.name || '魔法'}！${result.damage}ダメージ${crit ? '（クリティカル）' : ''}
【必須】敵が魔法に「」と反応。
魔法の光、敵への影響、敵の言葉。${intentHint}
4-6文で。`;
  },

  // Player item
  playerItem: (result) => {
    if (result.healing) {
      return `${result.item?.name || 'アイテム'}を使用。${result.healing}HP回復。
体が温かくなる感覚を描写。3-4文で。`;
    }
    if (result.spRestored || result.mpRestored) {
      return `${result.item?.name || 'アイテム'}を使用。${result.spRestored || result.mpRestored}SP回復。
魔力が満ちる感覚を描写。3-4文で。`;
    }
    return `${result.item?.name || 'アイテム'}を使った。効果を描写。3-4文で。`;
  },

  // Enemy attack - enemy taunts while attacking, show next intent
  enemyAttack: (ctx) => {
    const damage = ctx?.damage || 0;
    const crit = ctx?.critical;
    const dodge = ctx?.dodge || ctx?.perfectDodge;
    const intent = ctx?.intent;
    const nextIntent = ctx?.nextIntent;

    // Get intent-specific attack description
    const intentDesc = {
      attack: '攻撃',
      heavy: '強攻撃',
      rage: '怒りの攻撃',
      special: '特殊攻撃',
      defend: '防御'
    }[intent?.id] || '攻撃';

    // Get next intent hint for player
    const nextIntentHint = nextIntent ? `\n次の動き：${getIntentNarrationHint(nextIntent)}` : '';

    if (dodge) {
      return `敵の${intentDesc}を避けた！
【必須】敵が悔しそうに「」と言う。
攻撃をかわす瞬間、敵の驚き。${nextIntentHint}
4-6文で。`;
    }

    const intensity = intent?.id === 'heavy' ? '重い' :
                      intent?.id === 'rage' ? '激しい' :
                      crit ? '鋭い' : damage >= 10 ? '強い' : '素早い';

    // Check for counter-attack
    const counterAttack = ctx?.counterAttack;
    const counterHint = counterAttack
      ? `\n反撃！${counterAttack.damage}ダメージを返した！`
      : '';

    return `敵の${intensity}${intentDesc}！${damage}ダメージ${crit ? '（痛恨！）' : ''}${counterHint}
【必須】敵が攻撃しながら「」と言う。
攻撃の動き、当たった痛み、敵の言葉。${counterAttack ? '反撃の瞬間も描写。' : ''}${nextIntentHint}
4-6文で。`;
  },

  // Two-tier: Enemy attack ACTION (Part 1) - attack initiation only
  // This is prefetchable before combat result is known
  enemyAttack_action: (ctx) => {
    const enemyName = ctx?.enemyName || '敵';
    const intent = ctx?.intent;

    // Get intent-specific attack description
    const intentDesc = {
      attack: '攻撃',
      heavy: '強攻撃',
      rage: '怒りの攻撃',
      special: '特殊攻撃',
      defend: '防御'
    }[intent] || '攻撃';

    return `${enemyName}が${intentDesc}の構えを取る！
動き出す瞬間、攻撃が来る予感。
【必須】敵が「」と言いながら攻撃を始める。
2-3文で。結果はまだ分からない。`;
  },

  // Two-tier: Enemy attack RESULT (Part 2) - damage and reaction
  // Generated after combat calc with actual damage
  enemyAttack_result: (ctx) => {
    const damage = ctx?.damage || 0;
    const crit = ctx?.critical;
    const dodge = ctx?.dodge || ctx?.perfectDodge;
    const nextIntent = ctx?.nextIntent;
    const nextIntentHint = nextIntent ? `\n敵の次の構え：${getIntentNarrationHint(nextIntent)}` : '';

    if (dodge) {
      return `攻撃を避けた！
【必須】敵が悔しそうに「」と言う。${nextIntentHint}
2-3文で。`;
    }

    const intensity = crit ? '痛恨の一撃' : damage >= 15 ? '強い衝撃' : damage >= 8 ? '衝撃' : '軽い痛み';

    return `${damage}ダメージ${crit ? '（痛恨！）' : ''}！${intensity}！
痛みの瞬間、体勢を立て直す。${nextIntentHint}
2-3文で。`;
  },

  // Player victory - enemy's last words
  victory: (ctx) => {
    const enemy = ctx?.enemy || ctx || {};
    const rewards = ctx?.rewards || {};
    return `${enemy.name || '敵'}を倒した！
【必須】敵の最後の言葉「」。悔しさ、驚き、または認める。
勝利の瞬間、敵が消える、報酬。4-6文で。
獲得：${rewards.xp || 0}XP、${rewards.gold || 0}ゴールド`;
  },

  // Boss victory - dramatic final words
  bossVictory: (ctx) => {
    const enemy = ctx?.enemy || ctx || {};
    const rewards = ctx?.rewards || {};
    return `ボス「${enemy.name || 'ボス'}」を倒した！
【必須】ボスの威厳ある最後の言葉「」。長めに。
この重大な勝利を劇的に描写。5-7文で。
${rewards.bossDrop ? `ドロップ：${rewards.bossDrop.name}` : ''}`;
  },

  // Player defeat - enemy mocks
  defeat: (ctx) => {
    const enemy = ctx?.enemy || ctx || {};
    return `${enemy.name || '敵'}に倒された...
【必須】敵の勝利宣言「」。
意識が遠のく。絶望の瞬間。4-6文で。`;
  },

  // Flee success
  fleeSuccess: () =>
    `戦闘から逃げた。息が荒い。心臓が鳴る。逃走の緊張感を描写。3-4文で。`,

  // Flee fail
  fleeFail: () =>
    `逃げられない！敵が道を塞ぐ。「」と敵が言う。失敗の恐怖を描写。4-5文で。`,

  // Floor clear
  floorClear: (ctx) => {
    const floor = ctx?.floor || ctx || '?';
    return `第${floor}階クリア！
次への階段が見える。達成感と期待を描写。3-4文で。`;
  },

  // Boss appear
  bossAppear: (ctx) => {
    const boss = ctx?.boss || ctx || {};
    const voice = getEnemyVoice(boss.personality || 'arrogant');
    return `ボス「${boss.name || 'ボス'}」が現れた！
${boss.description || ''}
【必須】ボスが威厳を持って「」と話す。${voice.description}
恐ろしい登場を劇的に描写。5-7文で。`;
  },

  // Final boss appear
  finalBossAppear: (ctx) => {
    const boss = ctx?.boss || ctx || {};
    return `最終ボス「${boss.name || '影の君主'}」が現れた！
${boss.description || '全ての影を支配する存在。'}
【必須】最終ボスが冷たく「」と宣言する。
究極の敵との対面を最大限に劇的に描写。6-8文で。`;
  },

  // Game victory
  gameVictory: (ctx) => {
    const player = ctx?.player || ctx || {};
    return `ダンジョン制覇！${player.name || '冒険者'}の完全勝利！
影が消え、光が戻る。偉大な勝利を祝う。5-7文で。`;
  },

  // Rest event
  rest: () =>
    `安全な場所を見つけた。緊張が解ける。休息の安らぎを描写。3-4文で。`,

  // Treasure found
  treasure: (item) =>
    `宝箱発見！中身：${item?.name || '何か'}。
発見の喜び、開ける瞬間を描写。3-4文で。`,

  // Shop
  shopEnter: () =>
    `商人がいる。こんな場所に。「いらっしゃい」と声がする。
不思議な出会いを描写。3-4文で。`,

  shopPurchase: (ctx) => {
    const itemName = ctx?.itemName || 'アイテム';
    return `${itemName}を購入。商人が「」と言う。
取引の瞬間を描写。2-3文で。`;
  },

  // ============ BLACKSMITH / REFINEMENT EVENTS ============

  refineSuccess: (ctx) => {
    const itemName = ctx?.itemName || '武器';
    const newLevel = ctx?.newLevel || 1;
    return `鍛冶屋が${itemName}を炎に入れる。金槌が鳴り響く。
「できた！」+${newLevel}になった！
成功の瞬間を描写。3-4文で。`;
  },

  refineFail: (ctx) => {
    const itemName = ctx?.itemName || '武器';
    return `鍛冶屋が${itemName}を慎重に叩く。しかし...パキッ！
「すまない...」${itemName}が砕け散った。
破壊の瞬間、悲しみを描写。3-4文で。`;
  },

  // ============ ROOM EXPLORATION EVENTS ============

  roomEnter: (room) => {
    const roomNum = room.roomNumber || 1;
    const total = room.totalRooms || 15;
    const type = room.type || 'empty';

    const typeHints = {
      empty: '何もない。静か。でも油断できない。',
      encounter: '敵の気配。緊張が走る。',
      trap: '何か怪しい。床に注意。',
      body: '倒れた冒険者。悲しい光景。',
      treasure: '宝箱が見える。罠か本物か。',
      shrine: '神聖な光。祠がある。',
      merchant: '人の気配。商人だ。',
      blacksmith: '炎の音。金槌の音。鍛冶屋だ。',
      boss: '空気が変わった。強い敵がいる。'
    };

    return `部屋${roomNum}/${total}に入った。
${typeHints[type] || '新しい部屋。'}
部屋の雰囲気、感覚を描写。4-5文で。`;
  },

  trapDisarmSuccess: (ctx) =>
    `罠を解除した！${ctx?.xp || 0}XP獲得。
慎重に成功した瞬間を描写。3-4文で。`,

  trapDisarmFail: (ctx) =>
    `罠解除失敗！${ctx?.damage || 0}ダメージ！
痛みと驚きの瞬間を描写。3-4文で。`,

  trapAvoidSuccess: (ctx) =>
    `罠を避けた！素早い反応。
危機一髪の瞬間を描写。3-4文で。`,

  trapAvoidFail: (ctx) =>
    `罠にかかった！${ctx?.damage || 0}ダメージ！
罠の痛みを描写。3-4文で。`,

  lootBody: (loot) => {
    const found = loot.length > 0;
    return `冒険者の遺体を調べた。
${found ? 'アイテムを見つけた。' : '何もなかった。'}
悲しみと発見を描写。3-4文で。`;
  },

  treasureOpen: (ctx) => {
    const loot = ctx?.loot || ctx || [];
    const found = loot.length > 0;
    return `宝箱を開けた！
${found ? '中身があった！' : '空だった...'}
発見の瞬間を描写。3-4文で。`;
  },

  treasureTrapped: (ctx) =>
    `宝箱の罠！${ctx?.damage || 0}ダメージ！
それでも中身を手に入れた。痛みと発見を描写。4-5文で。`,

  bodyTrapped: (ctx) =>
    `遺体に罠が！${ctx?.damage || 0}ダメージ！
危険な発見を描写。4-5文で。`,

  skipBody: () =>
    `遺体を無視して進んだ。慎重な判断。でも何かあったかも。2-3文で。`,

  skipTreasure: () =>
    `宝箱を無視した。罠かもしれない。慎重な判断を描写。2-3文で。`,

  shrineUse: (ctx) => {
    const healed = ctx?.healed || ctx || 0;
    return `祠に祈った。${healed}HP回復。
神聖な光、温かさを感じる瞬間を描写。3-4文で。`;
  },

  roomProceed: () =>
    `次の部屋へ進む。足音が響く。緊張感を描写。2-3文で。`
};

// ============================================================================
// MAIN NARRATION GENERATOR
// ============================================================================

/**
 * Generates AI-powered narration for a game event.
 *
 * This is the main entry point for all narration generation. It:
 * 1. Looks up the prompt template for the event type
 * 2. Builds the complete system prompt with vocabulary constraints
 * 3. Calls the AI provider to generate narration
 * 4. Stores the narration in memory to prevent repetition
 * 5. Falls back to static narration if AI fails
 *
 * Note: This function does NOT apply vocabulary repair. That happens
 * in the server after this function returns. This separation allows
 * the prefetch system to generate narrations in advance.
 *
 * @param {Function} chatFn - AI chat function from ai-providers.js
 * @param {Object} gameState - Current game state for context
 * @param {string} event - Event type (e.g., 'combatStart', 'playerAttack')
 * @param {Object} context - Event-specific context (enemy, damage, etc.)
 * @param {string[]} vocabulary - User's known vocabulary words
 * @param {string} jlptLevel - JLPT level for grammar complexity
 * @param {Object} aiConfig - AI provider configuration
 * @param {string} aiConfig.provider - Provider name (openai, anthropic, etc.)
 * @param {string} aiConfig.apiKey - API key for the provider
 * @param {Object[]} suggestedWords - Optional words to encourage using
 * @returns {Promise<string|null>} Generated narration or null on failure
 *
 * @example
 * const narration = await generateNarration(
 *   chatFn,
 *   gameState,
 *   'playerAttack',
 *   { totalDamage: 25, critical: true },
 *   vocabulary,
 *   'N3',
 *   { provider: 'openai', apiKey: '...' }
 * );
 */
export async function generateNarration(chatFn, gameState, event, context, vocabulary, jlptLevel, aiConfig, suggestedWords = null) {
  // Store current event for sample selection
  gameState.currentEvent = event;

  // Build the prompt
  const promptFn = DM_PROMPTS[event];
  if (!promptFn) {
    console.warn(`Unknown DM event: ${event}`);
    return null;
  }

  const userPrompt = typeof promptFn === 'function' ? promptFn(context) : promptFn;
  const systemPrompt = buildDmSystemPrompt(gameState, vocabulary, jlptLevel, suggestedWords);

  try {
    const response = await chatFn({
      provider: aiConfig.provider,
      apiKey: aiConfig.apiKey,
      messages: [{ role: 'user', content: userPrompt }],
      vocabulary: vocabulary,
      jlptLevel: jlptLevel,
      customSystemPrompt: systemPrompt,
      openaiModel: aiConfig.openaiModel,
      openrouterModel: aiConfig.openrouterModel,
      purpose: 'narration'
    });

    // Add successful narration to memory
    if (response) {
      addToNarrationMemory(response, event);
    }

    return response;
  } catch (error) {
    console.error('DM narration error:', error);
    return getFallbackNarration(event, context);
  }
}

/**
 * Fallback narrations when AI fails
 */
function getFallbackNarration(event, context) {
  const fallbacks = {
    runStart: 'ダンジョンの入り口に立っている。暗い。冷たい空気。心臓が鳴る。冒険が始まる。',
    enterFloor: getFloorNarration(context),
    combatStart: `${context?.name || '敵'}が現れた！「グルル...」敵の目が光る。戦いの準備をしろ！`,
    playerAttack: getAttackNarration(context),
    playerMagic: '魔法を使った！光が敵を包む。「何だ...！」敵が驚く。',
    playerItem: 'アイテムを使った。体が温かくなる。少し楽になった。',
    enemyAttack: getEnemyAttackNarration(context),
    victory: '敵が倒れる。「まさか...」最後の言葉が消える。勝利だ。',
    bossVictory: 'ボスが倒れる。「お前は...強かった...」長い戦いが終わった。よくやった！',
    defeat: '力が抜ける。「弱かったな...」敵の声が遠くなる。目の前が暗くなる...',
    fleeSuccess: '逃げた！心臓が鳴る。息が荒い。また戦おう。',
    fleeFail: '逃げられない！「逃がさない」敵が道を塞いでいる！',
    floorClear: '階をクリアした！次への階段が見える。進もう。',
    bossAppear: `${context?.name || 'ボス'}が現れた！「来たか...」強い敵だ。覚悟しろ！`,
    finalBossAppear: '影の君主が現れた！「終わりだ...」全ての影を支配する存在。これが最後の戦い。',
    gameVictory: 'ダンジョン制覇！影が消え、光が戻る。おめでとう、勇者よ！',
    rest: '安全な場所を見つけた。緊張が解ける。少し休める。',
    treasure: '宝箱を見つけた！開けてみよう。何があるだろう？',
    shopEnter: '商人に会った。「いらっしゃい」こんな場所に不思議だ。',
    shopPurchase: '「ありがとう」商人が言う。アイテムを手に入れた。',
    refineSuccess: `鍛冶屋が${context?.itemName || '武器'}を叩く。炎が舞う！「できた！」+${context?.newLevel || 1}になった！`,
    refineFail: `鍛冶屋が${context?.itemName || '武器'}を叩く...パキッ！「すまない...」武器が砕け散った。`
  };

  return fallbacks[event] || '...';
}

function getFloorNarration(floor) {
  const descriptions = {
    1: '第1階に入った。暗い通路。水の音が響く。冷たい空気。冒険が始まる。',
    2: '第2階。空気が重い。壁に古い文字。埃が舞う。過去の痕跡。',
    3: '第3階。骨が散らばる。冷たい霧。死者の気配がする。',
    4: '第4階。熱い！溶岩の光が見える。汗が流れる。',
    5: '第5階。暗い森。木々が動く。何かが見ている。',
    6: '第6階。巨大な骨。金が光る。竜の住処だ。',
    7: '最後の階。影が渦巻く。玉座が見える。最終決戦の時だ。'
  };
  return descriptions[floor] || `第${floor}階に入った。新しい冒険が待っている。`;
}

function getAttackNarration(context) {
  const damage = context?.totalDamage || 0;
  const critical = context?.critical;

  if (critical) {
    return `クリティカル！完璧な一撃！${damage}ダメージ！「グッ...！」敵が叫ぶ。`;
  }
  if (damage >= 20) {
    return `強い攻撃！${damage}ダメージ！「痛い...！」敵が後ろに下がる。`;
  }
  if (damage >= 10) {
    return `攻撃が当たった！${damage}ダメージ！「くっ...」敵が呻く。`;
  }
  return `攻撃！${damage}ダメージ。「...」敵が睨む。`;
}

function getEnemyAttackNarration(context) {
  const damage = context?.damage || 0;
  const critical = context?.critical;
  const dodge = context?.dodge || context?.perfectDodge;
  const counterAttack = context?.counterAttack;

  // Counter-attack suffix
  const counterSuffix = counterAttack
    ? ` しかし反撃！${counterAttack.damage}ダメージを返した！`
    : '';

  if (dodge) {
    return '敵の攻撃をかわした！「チッ...」敵が悔しそうに言う。';
  }
  if (critical) {
    return `痛い！敵の強い攻撃！${damage}ダメージ！「死ね！」敵が叫ぶ。${counterSuffix}`;
  }
  if (damage >= 15) {
    return `敵の攻撃！${damage}ダメージ！「もらった！」敵が笑う。${counterSuffix}`;
  }
  if (damage >= 5) {
    return `敵が攻撃してきた。${damage}ダメージ。「遅い」敵が言う。${counterSuffix}`;
  }
  return `敵の攻撃。${damage}ダメージ。「フン...」敵が鼻を鳴らす。${counterSuffix}`;
}

/**
 * Simpler version for when AI is not available
 */
export function getSimpleNarration(event, context) {
  return getFallbackNarration(event, context);
}
