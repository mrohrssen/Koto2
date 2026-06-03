export const TUTORIAL_STEPS = {
  SKILL_SELECTION: 0,
  BEFRIEND: 1,
  ITEM_SHOP: 2,
  DEATH_HUB: 3,
  SPEED_REVIEW: 4,
  CREATURE_FORMATION: 5,
  COMPLETE: 6
};

export const TUTORIAL_FUSION_CREATURE_ID = 'hinoneko';

export function ensureTutorialFusionState(meta) {
  if (!meta) return meta;
  if (!Array.isArray(meta.tutorialFusionDataUnlocked)) {
    meta.tutorialFusionDataUnlocked = [];
  }
  if (typeof meta.tutorialFusionCoreAwarded !== 'boolean') {
    meta.tutorialFusionCoreAwarded = false;
  }
  if (typeof meta.tutorialFusionComplete !== 'boolean') {
    meta.tutorialFusionComplete = false;
  }
  if (typeof meta.tutorialPostFusionNarrationShown !== 'boolean') {
    meta.tutorialPostFusionNarrationShown = !!meta.tutorialFusionComplete;
  }
  return meta;
}

export function hasTutorialFusionData(meta, creatureId = TUTORIAL_FUSION_CREATURE_ID) {
  ensureTutorialFusionState(meta);
  return !!meta?.tutorialFusionDataUnlocked?.includes(creatureId);
}

export function unlockTutorialFusionData(meta, creatureId = TUTORIAL_FUSION_CREATURE_ID) {
  ensureTutorialFusionState(meta);
  if (!meta) return { unlocked: false, creatureId };
  if (meta.tutorialFusionDataUnlocked.includes(creatureId)) {
    return { unlocked: false, creatureId };
  }
  meta.tutorialFusionDataUnlocked.push(creatureId);
  return {
    unlocked: true,
    creatureId,
    message: 'Obtained Hinoneko Fusion Data!'
  };
}

export function canUseFusionLab(meta) {
  return hasTutorialFusionData(meta, TUTORIAL_FUSION_CREATURE_ID);
}

export function awardTutorialFusionCore(meta) {
  ensureTutorialFusionState(meta);
  if (!hasTutorialFusionData(meta, TUTORIAL_FUSION_CREATURE_ID)) {
    throw new Error('Hinoneko fusion data is required before awarding a tutorial Fusion Core');
  }
  if (meta.tutorialFusionCoreAwarded) {
    return {
      awarded: false,
      fusionCores: Number.isFinite(meta.fusionCores) ? meta.fusionCores : 0
    };
  }
  meta.fusionCores = (Number.isFinite(meta.fusionCores) ? meta.fusionCores : 0) + 1;
  meta.tutorialFusionCoreAwarded = true;
  return {
    awarded: true,
    fusionCores: meta.fusionCores,
    message: 'Obtained 1x Fusion Core!'
  };
}

export function markTutorialFusionComplete(meta) {
  ensureTutorialFusionState(meta);
  if (!meta) return { completed: false };
  meta.tutorialFusionComplete = true;
  meta.tutorialStep = TUTORIAL_STEPS.COMPLETE;
  return { completed: true, tutorialStep: meta.tutorialStep };
}

export function markTutorialPostFusionNarrationShown(meta) {
  ensureTutorialFusionState(meta);
  if (!meta) return { marked: false };
  if (!meta.tutorialFusionComplete || !meta.creatureCollection?.includes(TUTORIAL_FUSION_CREATURE_ID)) {
    return { marked: false };
  }
  if (meta.tutorialPostFusionNarrationShown) return { marked: false };
  meta.tutorialPostFusionNarrationShown = true;
  return { marked: true };
}

export function shouldForceStartingMeadowCatEncounter(meta, run) {
  ensureTutorialFusionState(meta);
  const currentRoom = run?.rooms?.[run?.currentRoom || 0];
  return run?.currentArea?.id === 'hajimari-no-hiroba'
    && (run?.currentRoom || 0) === 0
    && currentRoom?.type === 'encounter'
    && !hasTutorialFusionData(meta, TUTORIAL_FUSION_CREATURE_ID);
}

function getCurrentRoom(run) {
  return run?.rooms?.[run?.currentRoom || 0] || null;
}

export function isStartingMeadowHinonekoBoss(run) {
  const room = getCurrentRoom(run);
  return run?.currentArea?.id === 'hajimari-no-hiroba'
    && room?.type === 'boss'
    && room?.boss?.creatureId === TUTORIAL_FUSION_CREATURE_ID;
}

export function shouldShowStartingMeadowHinonekoIntro(meta, run) {
  return isStartingMeadowHinonekoBoss(run)
    && !hasTutorialFusionData(meta, TUTORIAL_FUSION_CREATURE_ID);
}

export function collectStartingMeadowHinonekoVictoryReward(meta, run, combat) {
  if (!combat?.isBoss) return null;
  const bossId = combat?.enemies?.[0]?.id;
  if (bossId !== TUTORIAL_FUSION_CREATURE_ID) return null;
  if (!isStartingMeadowHinonekoBoss(run)) return null;
  const result = unlockTutorialFusionData(meta, TUTORIAL_FUSION_CREATURE_ID);
  if (!result.unlocked) return null;
  if (getTutorialStep(meta) < TUTORIAL_STEPS.SPEED_REVIEW) {
    meta.tutorialStep = TUTORIAL_STEPS.SPEED_REVIEW;
  }
  return {
    type: 'fusionData',
    creatureId: TUTORIAL_FUSION_CREATURE_ID,
    message: result.message
  };
}

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
  meta.tutorialFusionDataUnlocked = [];
  meta.tutorialFusionCoreAwarded = false;
  meta.tutorialFusionComplete = false;
  meta.tutorialPostFusionNarrationShown = false;
}
