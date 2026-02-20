// Lorebook - World building and character voice definitions
// Used by the narration system for immersive storytelling

// ============ FLOOR LORE ============
// Atmosphere and mood for each dungeon floor
export const FLOOR_LORE = {
  1: {
    name: "入口の洞窟",
    nameEn: "Entrance Caves",
    atmosphere: "暗い洞窟。水滴の音が響く。壁は湿っている。冷たい空気。",
    mood: "不安、期待、緊張",
    senses: {
      sight: ["暗い", "青い光", "影", "湿った壁"],
      sound: ["水の音", "遠い足音", "静寂"],
      touch: ["冷たい空気", "湿った石"],
      smell: ["土の匂い", "カビ"]
    },
    motifs: ["闇と光", "最初の一歩", "未知への恐怖"]
  },
  2: {
    name: "古い遺跡",
    nameEn: "Ancient Ruins",
    atmosphere: "崩れた柱。埃が舞う。古い文字が壁にある。過去の栄光の痕跡。",
    mood: "緊張、好奇心、畏敬",
    senses: {
      sight: ["壊れた柱", "古い文字", "埃", "ひび割れた床"],
      sound: ["風の音", "崩れる石", "こだま"],
      touch: ["粗い石", "埃っぽい空気"],
      smell: ["古い匂い", "石の匂い"]
    },
    motifs: ["過去の栄光", "時の流れ", "忘れられた歴史"]
  },
  3: {
    name: "骨の廊下",
    nameEn: "Bone Corridors",
    atmosphere: "骨が散らばる。死者の気配。冷たい霧が漂う。生命がない。",
    mood: "恐怖、警戒、死の予感",
    senses: {
      sight: ["白い骨", "冷たい霧", "暗い穴"],
      sound: ["骨の音", "かすかな呻き", "完全な静寂"],
      touch: ["氷のような空気", "乾いた骨"],
      smell: ["死の匂い", "冷たい匂い"]
    },
    motifs: ["死と再生", "過去の戦い", "命の重さ"]
  },
  4: {
    name: "炎の道",
    nameEn: "Path of Flames",
    atmosphere: "溶岩の光。熱い空気。赤い壁。炎が揺れている。",
    mood: "危険、圧力、力強さ",
    senses: {
      sight: ["赤い光", "溶岩", "炎", "影"],
      sound: ["炎の音", "岩が割れる音", "熱の唸り"],
      touch: ["熱い空気", "汗", "乾いた肌"],
      smell: ["硫黄", "煙", "熱い石"]
    },
    motifs: ["試練", "浄化", "力の代償"]
  },
  5: {
    name: "闇の森",
    nameEn: "Dark Forest",
    atmosphere: "黒い木々。動く影。不気味な静けさ。何かが見ている。",
    mood: "不気味、孤独、paranoia",
    senses: {
      sight: ["黒い木", "動く影", "光のない空"],
      sound: ["葉の音", "遠い鳴き声", "不気味な静けさ"],
      touch: ["湿った空気", "冷たい風"],
      smell: ["腐った葉", "土", "何か甘い匂い"]
    },
    motifs: ["迷い", "見えない敵", "本能"]
  },
  6: {
    name: "竜の巣",
    nameEn: "Dragon's Nest",
    atmosphere: "巨大な骨。金銀財宝。強い魔力。古い存在の気配。",
    mood: "畏敬、恐怖、興奮",
    senses: {
      sight: ["巨大な骨", "金", "宝石", "巨大な影"],
      sound: ["深い呼吸", "金属の音", "遠い咆哮"],
      touch: ["熱い風", "魔力の振動"],
      smell: ["硫黄", "血", "古い肉"]
    },
    motifs: ["強大な力", "欲望", "最後の試練前"]
  },
  7: {
    name: "影の玉座",
    nameEn: "Shadow Throne",
    atmosphere: "完全な闘。影が生きている。玉座が待っている。終わりの場所。",
    mood: "決意、恐怖、運命",
    senses: {
      sight: ["生きている影", "黒い玉座", "光がない"],
      sound: ["影の囁き", "自分の心臓", "深い沈黙"],
      touch: ["重い空気", "押し潰される感覚"],
      smell: ["無臭", "虚無"]
    },
    motifs: ["最終決戦", "光と闘", "運命の対峙"]
  }
};

// ============ ENEMY VOICE PATTERNS ============
// How each personality type speaks and reacts
export const PERSONALITY_VOICES = {
  // Tier 1 personalities
  wild: {
    description: "原始的、本能的、言葉より音",
    speech: "短い。唸り声が多い。単純な言葉。",
    attack: ["「グルル...」", "「ギャッ！」", "「来い！」"],
    hurt: ["「グッ...！」", "「痛い...」", "「ウゥ...」"],
    dying: ["「まさか...」", "「...」", "「グ...ッ」"],
    taunt: ["「弱い！」", "「食う！」"]
  },
  cunning: {
    description: "狡猾、計算高い、嘲笑",
    speech: "嘲るような笑い。策略を匂わせる。",
    attack: ["「ヒヒヒ...」", "「ここだ！」", "「見えた！」"],
    hurt: ["「チッ...」", "「運がいいな...」", "「くっ...」"],
    dying: ["「馬鹿な...」", "「私が...？」", "「罠だ...」"],
    taunt: ["「遅い！」", "「次は当たらない」"]
  },
  aggressive: {
    description: "攻撃的、直接的、怒り",
    speech: "怒りに満ちている。大きな声。",
    attack: ["「死ね！」", "「殺す！」", "「潰す！」"],
    hurt: ["「このっ...！」", "「痛くない！」", "「怒った！」"],
    dying: ["「嘘だ...」", "「まだ...」", "「お前も...」"],
    taunt: ["「弱すぎる！」", "「それだけか？」"]
  },

  // Tier 2 personalities
  methodical: {
    description: "冷静、計画的、感情がない",
    speech: "無感情。事実だけ。機械的。",
    attack: ["「...攻撃」", "「次」", "「当たる」"],
    hurt: ["「ダメージ確認」", "「...痛み」", "「」"],
    dying: ["「機能停止...」", "「...なぜ」", "「終わり...」"],
    taunt: ["「無駄だ」", "「計算済み」"]
  },

  // Tier 3 personalities
  honorable: {
    description: "名誉、尊敬、騎士道",
    speech: "丁寧だが威厳がある。敵を認める。",
    attack: ["「参る！」", "「覚悟！」", "「見せてもらう！」"],
    hurt: ["「良い一撃...」", "「やるな...」", "「久しぶりだ...」"],
    dying: ["「見事...だ...」", "「名誉ある...死...」", "「強かった...」"],
    taunt: ["「本気を見せろ」", "「まだ終わりではない」"]
  },
  cruel: {
    description: "残酷、サディスティック、楽しんでいる",
    speech: "苦痛を楽しむ。長い笑い。",
    attack: ["「苦しめ...」", "「もっと叫べ」", "「ハハハ！」"],
    hurt: ["「...面白い」", "「良い痛み...」", "「怒った...」"],
    dying: ["「こんな...はずは...」", "「覚えていろ...」", "「許さない...」"],
    taunt: ["「逃げられない」", "「ゆっくり殺す」"]
  },
  slow: {
    description: "遅い、重い、力強い",
    speech: "ゆっくり。短い。重い声。",
    attack: ["「...潰す」", "「動くな」", "「...」"],
    hurt: ["「...効かない」", "「...痛い?」", "「...」"],
    dying: ["「...なぜ...動かない...」", "「...重い...」", "「...」"],
    taunt: ["「...逃げても無駄」", "「...潰す」"]
  },

  // Tier 4 personalities
  silent: {
    description: "無言、影、存在感",
    speech: "ほとんど話さない。囁き。",
    attack: ["「...」", "「......」", "「消えろ」"],
    hurt: ["「......」", "「...痛み...」", "「」"],
    dying: ["「...影に...戻る...」", "「......」", "「...光...」"],
    taunt: ["「...」", "「...見えない」"]
  },
  proud: {
    description: "誇り高い、自信、見下す",
    speech: "上から目線。威厳。",
    attack: ["「虫けらが」", "「消えろ」", "「跪け」"],
    hurt: ["「...この私に...」", "「許さない」", "「...傷...だと...」"],
    dying: ["「馬鹿な...この私が...」", "「認めない...」", "「誇りは...消えない...」"],
    taunt: ["「身の程を知れ」", "「お前如きが」"]
  },

  // Boss personalities
  arrogant: {
    description: "傲慢、王、支配者",
    speech: "王として話す。命令口調。",
    attack: ["「跪け！」", "「王の力を見よ！」", "「死ね、下民！」"],
    hurt: ["「王に傷を...!?」", "「許さない！」", "「この私が...!?」"],
    dying: ["「王が...倒れる...」", "「次の王は...お前か...」", "「栄光は...消えない...」"],
    taunt: ["「王の前に跪け」", "「お前は何者だ？」"]
  },
  fierce: {
    description: "獰猛、群れの長、野生",
    speech: "唸り声。威嚇。本能。",
    attack: ["「ガルルル！」", "「噛み殺す！」", "「群れの力！」"],
    hurt: ["「キャイン...！」", "「この傷...！」", "「怒り...！」"],
    dying: ["「群れを...頼む...」", "「強い...獲物...だった...」", "「...」"],
    taunt: ["「お前は獲物だ」", "「逃げられない」"]
  },
  calculating: {
    description: "計算高い、知性、冷たい",
    speech: "知的。見下す。計画。",
    attack: ["「計算通り」", "「読めている」", "「終わりだ」"],
    hurt: ["「...計算外...」", "「修正する」", "「...データ不足...」"],
    dying: ["「計算...間違い...」", "「こんな...結末...」", "「知識は...残る...」"],
    taunt: ["「全て見えている」", "「お前の動きは読めている」"]
  },
  brutal: {
    description: "残忍、力、破壊",
    speech: "単純。力を誇示。",
    attack: ["「砕ける！」", "「力だ！」", "「潰す！」"],
    hurt: ["「...効いた...」", "「もっと...力を...」", "「痛い...が...」"],
    dying: ["「力が...足りない...」", "「強い...奴...」", "「...」"],
    taunt: ["「弱い」", "「もっと来い」"]
  },
  malevolent: {
    description: "邪悪、地獄、炎",
    speech: "邪悪な笑い。地獄を語る。",
    attack: ["「地獄の炎！」", "「燃えろ！」", "「苦しめ！」"],
    hurt: ["「...この程度か...」", "「炎は消えない」", "「...熱い...」"],
    dying: ["「地獄で...待っている...」", "「炎は...消えない...」", "「また...会おう...」"],
    taunt: ["「地獄を見せてやる」", "「逃げ場はない」"]
  },
  ancient: {
    description: "古代、知恵、圧倒的",
    speech: "ゆっくり。威厳。千年の知恵。",
    attack: ["「若き者よ...」", "「時の力を...」", "「終わりだ...」"],
    hurt: ["「...久しぶりの痛み...」", "「...良い傷だ...」", "「...驚いた...」"],
    dying: ["「千年の命...ここで...」", "「お前は...強い...」", "「良い...戦いだった...」"],
    taunt: ["「千年を生きた私に勝てるか」", "「若さは力ではない」"]
  },
  absolute: {
    description: "絶対、影の支配者、最終",
    speech: "冷たい。絶対的。影そのもの。",
    attack: ["「影に飲まれろ」", "「終わりだ」", "「消えろ」"],
    hurt: ["「...影に傷...？」", "「...面白い...」", "「...光...か...」"],
    dying: ["「影は...消えない...」", "「また...闇の中で...」", "「お前が...新しい...影...」"],
    taunt: ["「全ての影は私だ」", "「光は届かない」"]
  }
};

// ============ ROOM TYPE DESCRIPTIONS ============
export const ROOM_LORE = {
  empty: {
    descriptions: [
      "静かな部屋。何もない。でも、何かの気配がする。",
      "空っぽ。壁だけ。安全か？",
      "何もない部屋。一瞬の休息。"
    ]
  },
  encounter: {
    descriptions: [
      "敵の気配！戦いの準備を。",
      "何かが動いた。来る！",
      "影から何かが現れる..."
    ]
  },
  trap: {
    descriptions: [
      "危険な匂い。罠がある。",
      "床に何か見える。注意しろ。",
      "この部屋は怪しい..."
    ]
  },
  treasure: {
    descriptions: [
      "宝箱が見える！",
      "光るものがある。宝か？",
      "古い箱。中身は？"
    ]
  },
  shrine: {
    descriptions: [
      "祠がある。神聖な気配。",
      "光が見える。休める場所。",
      "古い祠。祈れば何かが起きる。"
    ]
  },
  merchant: {
    descriptions: [
      "商人がいる！こんな場所に...",
      "「いらっしゃい」という声が聞こえる。",
      "誰かが待っている。商人だ。"
    ]
  },
  body: {
    descriptions: [
      "倒れた冒険者がいる。",
      "死体が見える。アイテムがあるかも。",
      "悲しい光景。でも、彼の持ち物は..."
    ]
  }
};

// ============ HELPER FUNCTIONS ============

/**
 * Get floor lore for the current floor
 */
export function getFloorLore(floor) {
  return FLOOR_LORE[floor] || FLOOR_LORE[1];
}

/**
 * Get voice patterns for an enemy's personality
 */
export function getEnemyVoice(personality) {
  return PERSONALITY_VOICES[personality] || PERSONALITY_VOICES.wild;
}

/**
 * Get a random dialogue line for an enemy action
 */
export function getEnemyDialogue(personality, action) {
  const voice = getEnemyVoice(personality);
  const lines = voice[action];
  if (!lines || lines.length === 0) return "「...」";
  return lines[Math.floor(Math.random() * lines.length)];
}

/**
 * Build world context string for narration prompt
 */
export function buildWorldContext(floor, enemy = null) {
  const floorLore = getFloorLore(floor);

  let context = `【この階】${floorLore.name}\n`;
  context += `雰囲気：${floorLore.atmosphere}\n`;
  context += `気分：${floorLore.mood}\n`;

  if (enemy) {
    const voice = getEnemyVoice(enemy.personality);
    context += `\n【敵】${enemy.name}\n`;
    context += `性格：${voice.description}\n`;
    context += `話し方：${voice.speech}\n`;
  }

  return context;
}
