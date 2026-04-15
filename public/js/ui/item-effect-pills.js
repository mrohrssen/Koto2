export function buildItemEffectPills(item) {
  const effect = item.effect || {};
  const pills = [];
  if (effect.healPercent) pills.push(`💚 +${Math.round(effect.healPercent * 100)}% HP`);
  if (effect.healAllPercent) pills.push(`💚 +${Math.round(effect.healAllPercent * 100)}% all`);
  if (effect.healMostDamaged) pills.push('💚 Full heal (weakest)');
  if (effect.mpRestorePercent) {
    pills.push(`🔵 +${Math.round(effect.mpRestorePercent * 100)}% max MP (party)`);
  }
  if (effect.revivePercent) pills.push(`💫 Revive ${Math.round(effect.revivePercent * 100)}%`);
  if (effect.field === 'attackMult') pills.push(`⬆️ ATK +${Math.round(effect.value * 100)}%`);
  if (effect.field === 'hpMult') pills.push(`💚 HP +${Math.round(effect.value * 100)}%`);
  if (effect.field === 'defenseMult') pills.push(`🛡️ DEF +${Math.round(effect.value * 100)}%`);
  if (effect.field === 'flatDamageReduction') pills.push(`🛡️ -${effect.value} dmg`);
  if (effect.field === 'elementEdge') pills.push(`✨ Elem +${Math.round(effect.value * 100)}%`);
  if (effect.tempBoost) {
    pills.push(`⬆️ +${effect.tempBoost.value} ATK (${effect.tempBoost.turns}t)`);
  }
  if (item.type === 'xpCharm') pills.push(`✨ XP ×${(1 + (effect.value || 0)).toFixed(2)}`);
  if (item.type === 'xpBalance') pills.push(`⚖️ XP balance +${effect.value || 0}`);

  if (pills.length === 0 && item.description) {
    pills.push(item.description);
  }

  return pills.map(p => `<span class="shop-stat-pill">${p}</span>`).join('');
}
