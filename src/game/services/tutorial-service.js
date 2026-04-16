export const TUTORIAL_STEPS = {
  SKILL_SELECTION: 0,
  BEFRIEND: 1,
  ITEM_SHOP: 2,
  DEATH_HUB: 3,
  SPEED_REVIEW: 4,
  CREATURE_FORMATION: 5,
  COMPLETE: 6
};

export function getTutorialStep(meta) {
  return meta?.tutorialStep ?? 6;
}

export function advanceTutorial(meta) {
  if (!meta || meta.tutorialStep >= TUTORIAL_STEPS.COMPLETE) return TUTORIAL_STEPS.COMPLETE;
  meta.tutorialStep += 1;
  return meta.tutorialStep;
}

export function isTutorialActive(meta) {
  return getTutorialStep(meta) < TUTORIAL_STEPS.COMPLETE;
}

export function shouldOverrideSkillOffers(meta) {
  return getTutorialStep(meta) === TUTORIAL_STEPS.SKILL_SELECTION;
}

export function shouldProtectBefriend(meta) {
  return getTutorialStep(meta) === TUTORIAL_STEPS.BEFRIEND;
}

export function shouldFixRoomSequence(meta) {
  return getTutorialStep(meta) < TUTORIAL_STEPS.DEATH_HUB;
}

// Deprecated: elements are no longer a thing
// export function shouldGiftFireDrops(meta) {
//   return getTutorialStep(meta) === TUTORIAL_STEPS.DEATH_HUB && !meta?.tutorialFireDropsGifted;
// }

// Deprecated: chest tutorial removed
// export function shouldHardcodeCrestReward(meta) {
//   return getTutorialStep(meta) === TUTORIAL_STEPS.CHEST_OPEN;
// }

// Deprecated: elements are no longer a thing
// export function giftTutorialFireDrops(meta) {
//   if (!shouldGiftFireDrops(meta)) return false;
//   if (!meta.elementDrops) meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
//   meta.elementDrops.fire += 3;
//   meta.tutorialFireDropsGifted = true;
//   return true;
// }

/** Reset tutorial state so it replays from the beginning. */
export function resetTutorial(meta) {
  meta.tutorialStep = 0;
  meta.tutorialFireDropsGifted = false;
}
