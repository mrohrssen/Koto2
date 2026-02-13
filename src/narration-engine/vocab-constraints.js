const MAX_VOCAB = 8000;
const PARTICLES = 'は、が、を、に、で、へ、と、も、の、か、よ、ね、や、から、まで、より';

/**
 * Build the vocab constraint section for a prompt.
 */
export function buildVocabSection(words, jlptLevel) {
  const limited = words.length > MAX_VOCAB ? words.slice(0, MAX_VOCAB) : words;
  const vocabList = limited.join(', ');

  return `=== 使える言葉（重要）===
この言葉リストからだけ使う：
${vocabList || '(基本的な言葉)'}

【ルール】
1. リストにない言葉は使わない。例外なし。
2. 助詞はOK：${PARTICLES}
3. 数字OK。句読点OK。擬音OK。
4. 1文に知らない言葉は最大1つまで。
5. 表現できない場合はもっと簡単な言い方にする。

文法レベル：JLPT ${jlptLevel}`;
}

/**
 * Check if cached dialogue is stale due to vocab growth.
 * Uses percentage-based threshold with minimum of 10 words.
 */
export function isVocabStale(snapshotCount, currentCount) {
  const threshold = Math.max(snapshotCount * 0.03, 10);
  return (currentCount - snapshotCount) >= threshold;
}
