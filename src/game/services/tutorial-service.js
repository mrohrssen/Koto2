/**
 * @fileoverview Tutorial state machine for the first-run guided experience.
 * Pure functions — no side effects, no imports beyond constants.
 */

export const TUTORIAL_STEPS = {
  SKILL_SELECTION: 0,
  BEFRIEND: 1,
  ITEM_SHOP: 2,
  DEATH_HUB: 3,
  CHEST_OPEN: 4,
  CREST_EQUIP: 5,
  CREATURE_FORMATION: 6,
  COMPLETE: 7
};

const NARRATIONS = {
  [TUTORIAL_STEPS.SKILL_SELECTION]: [
    'Each run you can get skills to make your party stronger.',
    "Let's just pick the first one."
  ],
  [TUTORIAL_STEPS.BEFRIEND]: [
    'Wow! This creature wants to talk!',
    "Let's try to befriend them."
  ],
  [TUTORIAL_STEPS.ITEM_SHOP]: [
    "Here you'll be offered items to power up. Choose wisely!"
  ],
  [TUTORIAL_STEPS.DEATH_HUB]: [
    'That was tough huh?',
    "Don't worry, no one gets past the Starting Meadow on their first try.",
    'We need to get stronger.',
    'Here, let me show you how. Click Chests!'
  ],
  [TUTORIAL_STEPS.CHEST_OPEN]: [
    'Every run you can use your resources to get stronger.',
    "I'll give you 3 Fire Elements.",
    "Let's open that fire chest!"
  ],
  [TUTORIAL_STEPS.CREST_EQUIP]: [
    "Now let's equip that crest to power up!"
  ],
  [TUTORIAL_STEPS.CREATURE_FORMATION]: [],
  [TUTORIAL_STEPS.COMPLETE]: []
};

const BEFRIEND_WRONG_NARRATION = "No, I don't think that's it... try again.";

export function getTutorialStep(meta) {
  return meta?.tutorialStep ?? 7;
}

export function advanceTutorial(meta) {
  if (!meta || meta.tutorialStep >= TUTORIAL_STEPS.COMPLETE) return TUTORIAL_STEPS.COMPLETE;
  meta.tutorialStep += 1;
  return meta.tutorialStep;
}

export function isTutorialActive(meta) {
  return getTutorialStep(meta) < TUTORIAL_STEPS.COMPLETE;
}

export function getTutorialNarration(step) {
  return NARRATIONS[step] || [];
}

export function getBefriendWrongNarration() {
  return BEFRIEND_WRONG_NARRATION;
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

export function shouldGiftFireDrops(meta) {
  return getTutorialStep(meta) === TUTORIAL_STEPS.DEATH_HUB && !meta?.tutorialFireDropsGifted;
}

export function shouldHardcodeCrestReward(meta) {
  return getTutorialStep(meta) === TUTORIAL_STEPS.CHEST_OPEN;
}

export function giftTutorialFireDrops(meta) {
  if (!shouldGiftFireDrops(meta)) return false;
  if (!meta.elementDrops) meta.elementDrops = { fire: 0, water: 0, earth: 0, wood: 0, metal: 0 };
  meta.elementDrops.fire += 3;
  meta.tutorialFireDropsGifted = true;
  return true;
}

export function getFormationNarration(creatureCount) {
  return [
    `Now you have ${creatureCount} creatures!`,
    'Each creature costs points.',
    "Select your best party and let's go back to the Starting Meadow!"
  ];
}
