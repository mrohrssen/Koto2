export function restoreBefriendQuizEnemyUi({
  quizData = {},
  result = {},
  gameState = {},
  hideEnemy,
  showFormation,
} = {}) {
  const enemies = result?.enemies || gameState?.combat?.enemies || [];
  const targetIndex = typeof quizData.targetIndex === 'number'
    ? quizData.targetIndex
    : enemies.findIndex(enemy => enemy && enemy.hp > 0 && !enemy.befriended);

  const target = enemies[targetIndex]
    && enemies[targetIndex].hp > 0
    && !enemies[targetIndex].befriended
    ? enemies[targetIndex]
    : enemies.find(enemy => enemy && enemy.hp > 0 && !enemy.befriended) || null;

  hideEnemy?.();
  if (target) {
    showFormation?.('enemy', [target]);
  }
  return target;
}
