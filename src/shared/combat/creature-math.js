export const ELEMENT_CYCLE = ['wood', 'earth', 'water', 'fire', 'metal'];

const DEF_EFFECTIVENESS_SCALE = 0.5;
const DEF_EFFECTIVENESS_AVERAGE = 5;

export function getElementMultiplier(attackerElement, defenderElement) {
  const ai = ELEMENT_CYCLE.indexOf(attackerElement);
  const di = ELEMENT_CYCLE.indexOf(defenderElement);
  if (ai === -1 || di === -1) return 1.0;
  if ((ai + 1) % ELEMENT_CYCLE.length === di) return 1.5;
  if ((di + 1) % ELEMENT_CYCLE.length === ai) return 0.67;
  return 1.0;
}

export function calculateCreatureDamage({
  attackerLevel,
  attack,
  defenderDefense,
  power,
  typeMultiplier,
  variance
}) {
  const def = Math.max(1, Math.floor(Number(defenderDefense) || 1));
  const effectiveDef = def * DEF_EFFECTIVENESS_SCALE
    + DEF_EFFECTIVENESS_AVERAGE * (1 - DEF_EFFECTIVENESS_SCALE);
  const atk = Math.max(1, Math.floor(Number(attack) || 1));
  const lvl = Math.max(1, Number(attackerLevel) || 1);
  const pow = Math.max(1, Number(power) || 1);
  const inner = (2 * lvl / 5 + 2) * pow * atk / effectiveDef;
  const base = Math.floor(inner / 10 + 2);
  const tm = Number(typeMultiplier) > 0 ? typeMultiplier : 1;
  const v = Number(variance) > 0 ? variance : 1;
  return Math.max(1, Math.floor(base * tm * v));
}

export function rollVariance(rng = Math.random) {
  return 0.8 + rng() * 0.4;
}

export function getBuffedAttack(baseAttack, itemBuffs, level = 1) {
  if (!itemBuffs) return baseAttack;
  const mult = itemBuffs.attackMult || 1.0;
  const baseBonus = itemBuffs.baseAttackBonus || 0;
  const levelMult = 1 + ((level || 1) - 1) * 0.1;
  return Math.floor((baseAttack + Math.floor(baseBonus * levelMult)) * mult);
}

export function getBuffedElementMultiplier(typeMultiplier, itemBuffs) {
  if (!itemBuffs?.elementEdge) return typeMultiplier;
  if (typeMultiplier > 1) return typeMultiplier + itemBuffs.elementEdge;
  if (typeMultiplier < 1) return Math.max(0.1, typeMultiplier - itemBuffs.elementEdge);
  return typeMultiplier;
}

export function applyDamageReduction(damage, itemBuffs) {
  const reduction = itemBuffs?.flatDamageReduction || 0;
  return Math.max(0, damage - reduction);
}
