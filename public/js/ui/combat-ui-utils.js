/** Display names for stat stages (used in stat-change labels). */
export const SC_NAMES = { atk: 'ATK', def: 'DEF' };

/**
 * CSS variable token for HP bar fill color from current HP percentage.
 * @param {number} pct - HP as 0–100 (e.g. (hp / maxHp) * 100)
 * @param {'player'|'enemy'} [side='player']
 * @returns {string}
 */
export function getHpColor(pct, side = 'player') {
  if (side === 'enemy') return 'var(--hp-enemy)';
  if (pct > 50) return 'var(--hp-green)';
  if (pct > 25) return 'var(--hp-yellow)';
  return 'var(--hp-red)';
}

/**
 * Playback guard for merged-initiative attack records. Returns true when the
 * record should be pruned because its target (or resolvable attacker) is
 * already at hp ≤ 0 in the progressive HP maps — i.e. an earlier record in
 * the same playback stream already downed it.
 *
 * Fixes from the 04:57–05:47 playtest batch:
 *  - "Neko countered a dead enemy" — counter was computed server-side against
 *    an alive target, rendered after an earlier attack brought it to 0.
 *  - "Confuse after it's dead" — status application on an enemy chain-killed
 *    earlier in the turn.
 *  - AoE hits on a slot already downed by a prior record in the same move.
 *
 * Buff / shield moves are NOT gated on `enemyHpMap`: their `targetIndex`
 * references an ally slot, so an enemy-map lookup would be meaningless.
 *
 * @param {'player'|'enemy'} side
 * @param {object} atk       - merged-initiative attack record
 * @param {Record<number, { hp: number, maxHp: number, index: number }>} enemyHpMap
 * @param {Record<string, { hp: number, maxHp: number }>} allyHpMap
 * @param {object} result    - full server response (for defender/attacker id lookup)
 * @returns {boolean}
 */
export function shouldSkipAttackRecord(side, atk, enemyHpMap, allyHpMap, result) {
  if (!atk) return false;
  const isBuffCategory = atk.category === 'buff' || atk.category === 'shield';

  if (side === 'player' && atk.type === 'counter') {
    const tIdx = atk.targetIndex;
    if (typeof tIdx === 'number' && enemyHpMap?.[tIdx] && enemyHpMap[tIdx].hp <= 0) return true;
    const dIdx = atk.defenderIndex;
    if (typeof dIdx === 'number') {
      const defender = result?.allies?.[dIdx];
      if (defender?.id && allyHpMap?.[defender.id] && allyHpMap[defender.id].hp <= 0) return true;
    }
    return false;
  }

  if (side === 'player') {
    if (!isBuffCategory) {
      const tIdx = atk.targetIndex;
      if (typeof tIdx === 'number' && enemyHpMap?.[tIdx] && enemyHpMap[tIdx].hp <= 0) return true;
    }
    if (atk.attackerId) {
      const attackerEntry = allyHpMap?.[atk.attackerId];
      if (attackerEntry && attackerEntry.hp <= 0) return true;
    }
    return false;
  }

  if (side === 'enemy') {
    if (atk.targetId && allyHpMap?.[atk.targetId] && allyHpMap[atk.targetId].hp <= 0) return true;
    return false;
  }

  return false;
}

/** Stable key for remembering which enemy KO animations already played. */
export function enemyKoAnimationKey(enemy, index, fallbackId = null) {
  if (enemy?.uid) return `uid:${enemy.uid}`;
  if (fallbackId) return `id:${fallbackId}`;
  return `idx:${index}`;
}

/**
 * Return dead enemy slots that still need their KO animation, recording them
 * as claimed so later combat responses do not replay the same particle puff.
 */
export function collectPendingEnemyKoAnimationIndices(enemies, alreadyAnimatedKeys, currentPlaybackKeys = new Set()) {
  const pending = [];
  if (!Array.isArray(enemies)) return pending;

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!enemy || enemy.hp > 0 || enemy.befriended) continue;

    const key = enemyKoAnimationKey(enemy, i);
    if (alreadyAnimatedKeys?.has(key) || currentPlaybackKeys?.has(key)) continue;

    alreadyAnimatedKeys?.add(key);
    currentPlaybackKeys?.add(key);
    pending.push(i);
  }

  return pending;
}

export function collectExistingEnemyKoAnimationKeys(enemies) {
  const keys = new Set();
  if (!Array.isArray(enemies)) return keys;

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy && enemy.hp <= 0 && !enemy.befriended) {
      keys.add(enemyKoAnimationKey(enemy, i));
    }
  }

  return keys;
}

/** Keep the current BattleScene mounted while the defeated NPC offers a reward. */
export function shouldKeepNpcBattleSceneForReward(state) {
  return state?.phase === 'npc_skill_selection';
}

/** Derive status icon keys from a creature's activeEffects + statStages. */
export function getCreatureStatusKeys(creature) {
  // Dead creatures shouldn't show status labels — the effects no longer
  // tick against a zero-HP target and the lingering pill looks like a bug
  // (e.g. stun pill hanging off a corpse).
  const hp = creature.currentHp ?? creature.hp ?? 0;
  if (hp <= 0) return [];

  const keys = [];
  if (creature.activeEffects) {
    for (const e of creature.activeEffects) {
      if (!keys.includes(e.type)) keys.push(e.type);
    }
  }
  if (creature.statStages) {
    for (const [stat, stage] of Object.entries(creature.statStages)) {
      if (stage > 0) keys.push(`${stat}_up`);
      else if (stage < 0) keys.push(`${stat}_down`);
    }
  }
  return keys;
}
