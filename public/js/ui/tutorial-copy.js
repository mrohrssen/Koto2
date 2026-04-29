/** @type {Record<number, string[]>} */
const TUTORIAL_NARRATION_BY_STEP = {
  0: [
    'Each run you can get skills to make your party stronger.',
    "Let's just pick the first one."
  ],
  1: [
    'Wow! This creature wants to talk!',
    "Let's try to befriend them."
  ],
  2: [
    "Here you'll be offered items to power up. Choose wisely!"
  ],
  3: [
    'That was tough huh?',
    "Don't worry, you'll get stronger each run!"
  ],
  4: [
    'Hey! It looks like you\'re starting to learn some Japanese.',
    'The Translator detected {dueCount} words for you to review.',
    'If you pass the review, you\'ll just see the Japanese for these words from now on.',
    'But don\'t worry, you can always click them to see the full translation.',
    'Keep exploring and watch your Japanese grow!'
  ],
  5: [],
  6: []
};

const BEFRIEND_WRONG_NARRATION = "No, I don't think that's it... try again.";

/**
 * @param {number} step
 * @param {{ dueCount?: number }} [options] — required for step 4 (speed review intro)
 * @returns {string[]}
 */
export function getTutorialNarration(step, { dueCount = 0 } = {}) {
  if (step === 4) {
    return TUTORIAL_NARRATION_BY_STEP[4].map((line) =>
      line.replace('{dueCount}', String(dueCount))
    );
  }
  const pages = TUTORIAL_NARRATION_BY_STEP[step];
  return pages ? [...pages] : [];
}

export function getBefriendWrongNarration() {
  return BEFRIEND_WRONG_NARRATION;
}

/**
 * @param {number} creatureCount
 * @returns {string[]}
 */
export function getFormationNarration(creatureCount) {
  return [
    `Now you have ${creatureCount} creatures!`,
    'Each creature costs points.',
    "Select your best party and let's go back to the Starting Meadow!"
  ];
}

export function getPostHinekoReviewNarration(dueCount = 0) {
  return [
    'Nice work beating Hineko!',
    ...getTutorialNarration(4, { dueCount })
  ];
}

export function getFusionCoreNarration() {
  return [
    'Oh! You got a fusion core!',
    "The next area is tough, let's use it to get stronger."
  ];
}

export function getFusionLabNarration() {
  return [
    'Look! We unlocked the data for hineko. Select it',
    'Now click Fuse'
  ];
}

export function getPostFusionNarration() {
  return [
    'With hineko in your party, you should be strong enough for the next area!',
    'Keep exploring, discovering new creatures, and getting stronger.'
  ];
}
