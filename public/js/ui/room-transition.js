import { animate as anime } from 'animejs';
import { showNpcTrainer, showNpcInDisplay, showDealer, showFormation } from './scene.js';
import { SPRITE_VERSION } from './sprite-utils.js';
import { speakText } from '../tts.js';
import * as narrationBox from './narration-box.js';
import { renderEnFirst } from './bootstrap-client.js';
import { combatEvents } from './combat-events.js';

/**
 * Bounce player formation slots in place.
 * Resolves after the given duration.
 */
export function bouncePlayerParty(duration = 500) {
  const slots = document.querySelectorAll('#player-formation .formation-slot');
  if (!slots.length) return Promise.resolve();

  // Fire-and-forget looping bounce
  anime(slots, {
    translateY: [0, -8, 0],
  }, {
    duration: 300,
    loop: true,
    ease: 'inOutSine',
  });

  return new Promise(resolve => {
    setTimeout(() => {
      // Reset transform (same pattern as screenShake cleanup)
      slots.forEach(s => s.style.transform = '');
      resolve();
    }, duration);
  });
}

/**
 * Slide an element in from off-screen right.
 */
export function slideFromRight(element, duration = 400) {
  if (!element) return Promise.resolve();
  element.style.opacity = '1';

  let resolved = false;
  return new Promise(resolve => {
    const done = () => {
      if (resolved) return;
      resolved = true;
      element.style.transform = '';
      resolve();
    };

    anime(element, {
      translateX: [window.innerWidth, 0],
    }, {
      duration,
      ease: 'outBack',
      onComplete: done
    });

    // Safety timeout in case onComplete doesn't fire
    setTimeout(done, duration + 100);
  });
}

/**
 * Slide an element out to off-screen right.
 */
export function slideToRight(element, duration = 300) {
  if (!element) return Promise.resolve();

  let resolved = false;
  return new Promise(resolve => {
    const done = () => {
      if (resolved) return;
      resolved = true;
      element.style.transform = 'translateX(100vw)';
      resolve();
    };

    anime(element, {
      translateX: [0, window.innerWidth],
    }, {
      duration,
      ease: 'inQuad',
      onComplete: done
    });

    setTimeout(done, duration + 100);
  });
}

/**
 * Fade an element in (opacity 0 → 1).
 */
export function fadeIn(element, duration = 300) {
  if (!element) return Promise.resolve();
  element.style.opacity = '0';

  let resolved = false;
  return new Promise(resolve => {
    const done = () => {
      if (resolved) return;
      resolved = true;
      element.style.opacity = '1';
      resolve();
    };

    anime(element, {
      opacity: [0, 1],
    }, {
      duration,
      ease: 'outQuad',
      onComplete: done
    });

    setTimeout(done, duration + 100);
  });
}

/**
 * Fade an element out (opacity 1 → 0).
 */
export function fadeOut(element, duration = 300) {
  if (!element) return Promise.resolve();

  let resolved = false;
  return new Promise(resolve => {
    const done = () => {
      if (resolved) return;
      resolved = true;
      resolve();
    };

    anime(element, {
      opacity: [1, 0],
    }, {
      duration,
      ease: 'outQuad',
      onComplete: done
    });

    setTimeout(done, duration + 100);
  });
}

/**
 * Play the room entrance transition.
 * Called between updateGameState() and updateUI() after apiProceed().
 */
export async function playRoomTransition(gameState) {
  const hasCreatures = gameState.run?.creatureParty?.active?.length > 0;
  const room = gameState.run?.rooms?.[gameState.run?.currentRoom];
  if (!room) return;

  if (hasCreatures) {
    await bouncePlayerParty(500);
  }

  const roomType = room.type;


  // Pre-position npc-display offscreen before making visible (prevents flash)
  const npcDisplay = document.getElementById('npc-display');

  if (roomType === 'friendlyNpc') {
    const npc = room.npc;
    if (npc) {
      if (npcDisplay) npcDisplay.style.transform = 'translateX(100vw)';
      showNpcTrainer(npc.nameEn || npc.name, npc.id, npc);
      await slideFromRight(npcDisplay);
    }
  } else if (roomType === 'whackAMole') {
    if (npcDisplay) npcDisplay.style.transform = 'translateX(100vw)';
    showNpcInDisplay('Game Master', `/assets/sprites/npcs/game-master.webp?v=${SPRITE_VERSION}`);
    await slideFromRight(npcDisplay);
  } else if (roomType === 'dealer') {
    if (npcDisplay) npcDisplay.style.transform = 'translateX(100vw)';
    showDealer();
    await slideFromRight(npcDisplay);
  }

  if (hasCreatures) combatEvents.emit('explore');
}

/**
 * Animate enemy creatures entering one-by-one from the right.
 * Call AFTER showFormation('enemy', enemies) has rendered the slots.
 */
export async function enterEnemiesOneByOne(enemies) {
  const formation = document.getElementById('enemy-formation');
  if (!formation) return;

  const slots = formation.querySelectorAll('.formation-slot');
  if (!slots.length) return;

  slots.forEach(slot => {
    slot.style.transform = 'translateX(100vw)';
  });

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const creature = enemies[i];

    await slideFromRight(slot, 400);

    if (creature) {
      speakText(creature.baseReading || creature.baseWord || creature.name);
    }

    if (i < slots.length - 1) {
      await new Promise(r => setTimeout(r, 700));
    }
  }

  await new Promise(r => setTimeout(r, 200));
}

/**
 * Play NPC battle intro: NPC slides in, says greeting, slides out.
 */
export async function playNpcBattleIntro(npcData, showNpcSpriteFn, hideNpcSpriteFn) {
  if (!npcData) return;

  const npcName = npcData.nameEn || npcData.name;

  // Also hide enemy formation during the NPC intro to prevent any stale creatures from showing
  const enemyFormation = document.getElementById('enemy-formation');
  if (enemyFormation) enemyFormation.style.opacity = '0';

  // Pre-position npc-display offscreen BEFORE making it visible
  // to prevent a flash of the NPC at its final CSS position
  const npcDisplay = document.getElementById('npc-display');
  if (npcDisplay) npcDisplay.style.transform = 'translateX(100vw)';

  showNpcSpriteFn(npcName, npcData.id, npcData);
  await slideFromRight(npcDisplay);

  if (npcData.greeting) {
    // Small delay to let DOM settle after slide animation
    await new Promise(r => setTimeout(r, 100));
    // Clear any stale narration state before showing greeting
    narrationBox.forceHide();
    speakText(npcData.greeting);
    await narrationBox.show(renderEnFirst(npcData.greeting), { speaker: npcName, html: true });
  }

  await slideToRight(npcDisplay);
  hideNpcSpriteFn();
}

/**
 * Wrap NPC skill activation with slide-in/out animation.
 * Note: showNpcSpriteFn calls showNpcTrainer which destroys enemy formation,
 * so we re-render it after NPC slides out.
 */
export async function playNpcSkillAnimation(npcData, showNpcSpriteFn, hideNpcSpriteFn, skillCallback, enemies) {
  const enemyFormation = document.getElementById('enemy-formation');
  const npcName = npcData?.nameEn || npcData?.name;

  if (enemyFormation) await fadeOut(enemyFormation);

  if (npcData && showNpcSpriteFn) {
    // Pre-position offscreen before making visible
    const npcDisplay = document.getElementById('npc-display');
    if (npcDisplay) npcDisplay.style.transform = 'translateX(100vw)';
    showNpcSpriteFn(npcName, npcData.id, npcData);
    await slideFromRight(npcDisplay);
  }

  await skillCallback();

  const npcDisplay = document.getElementById('npc-display');
  if (npcDisplay) await slideToRight(npcDisplay);
  if (hideNpcSpriteFn) hideNpcSpriteFn();

  if (enemies?.length) {
    showFormation('enemy', enemies);
  }

  const freshFormation = document.getElementById('enemy-formation');
  if (freshFormation) {
    freshFormation.style.opacity = '0';
    await fadeIn(freshFormation);
  }
}
