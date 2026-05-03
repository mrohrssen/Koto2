export const BATTLEFIELD_COLUMNS = {
  player: 0.195,
  enemy: 0.805,
};

export const BATTLEFIELD_ROWS = [
  { name: 'top', y: 0.435, scale: 0.90, shadow: { width: 46, height: 12, alpha: 0.22 } },
  { name: 'middle', y: 0.652, scale: 0.98, shadow: { width: 54, height: 14, alpha: 0.28 } },
  { name: 'bottom', y: 0.870, scale: 1.08, shadow: { width: 64, height: 16, alpha: 0.34 } },
];

const ROWS_FOR_TOTAL = {
  1: [1],
  2: [0, 2],
  3: [0, 1, 2],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function rowForFormationIndex(index, total) {
  const rows = ROWS_FOR_TOTAL[total] || ROWS_FOR_TOTAL[3];
  const clampedIndex = clamp(index, 0, rows.length - 1);
  return rows[clampedIndex];
}

export function getBattlefieldSlot(side, rowIndex, screenWidth, screenHeight) {
  const clampedRowIndex = clamp(rowIndex, 0, BATTLEFIELD_ROWS.length - 1);
  const row = BATTLEFIELD_ROWS[clampedRowIndex];
  const normalizedX = BATTLEFIELD_COLUMNS[side] ?? BATTLEFIELD_COLUMNS.player;
  return {
    side,
    rowIndex: clampedRowIndex,
    rowName: row.name,
    x: normalizedX * screenWidth,
    y: row.y * screenHeight,
    normalizedX,
    normalizedY: row.y,
  };
}

export function getBattlefieldSpriteScale(rowIndex) {
  const row = BATTLEFIELD_ROWS[clamp(rowIndex, 0, BATTLEFIELD_ROWS.length - 1)];
  return row.scale;
}

export function getBattlefieldShadowSpec(rowIndex) {
  const row = BATTLEFIELD_ROWS[clamp(rowIndex, 0, BATTLEFIELD_ROWS.length - 1)];
  return { ...row.shadow };
}

export function getBattlefieldLabelRect({
  slotX,
  slotY,
  spriteHeight,
  labelWidth,
  labelHeight,
  sceneWidth,
  sceneHeight,
  gap = 7,
  margin = 4,
}) {
  const left = clamp(slotX - labelWidth / 2, margin, sceneWidth - labelWidth - margin);
  const top = clamp(
    slotY - spriteHeight / 2 - gap - labelHeight,
    margin,
    sceneHeight - labelHeight - margin
  );
  return { left, top, width: labelWidth, height: labelHeight };
}
