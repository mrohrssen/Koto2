import { showNpcTrainer, showNpcInDisplay, showDealer, showFormation, hideFormation } from './scene.js';
import { showNpcSprite, hideNpcSprite } from '../pixi/formation.js';
import { SPRITE_VERSION } from './sprite-utils.js';
import { speakText } from '../tts.js';
import * as narrationBox from './narration-box.js';
import { renderEnFirst, renderJpSentence, getKnownWords } from './bootstrap-client.js';
import { combatEvents } from './combat-events.js';

/**
 * Play the room entrance transition.
 * Called between updateGameState() and updateUI() after apiProceed().
 */
export async function playRoomTransition(gameState) {
  const room = gameState.run?.rooms?.[gameState.run?.currentRoom];
  if (!room) return;

  // Clear stale enemy formation from previous room before showing the new one
  hideFormation('enemy');

  const roomType = room.type;

  if (roomType === 'friendlyNpc') {
    const npc = room.npc;
    if (npc) {
      const spritePath = npc.id
        ? `/assets/sprites/npcs/${npc.id}.webp?v=${SPRITE_VERSION}`
        : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
      showNpcTrainer(npc.nameEn || npc.name, npc.id, npc, { skipPixi: true });
      await showNpcSprite(spritePath, { slideIn: true });
    }
  } else if (roomType === 'whackAMole') {
    showNpcInDisplay('Game Master', `/assets/sprites/npcs/game-master.webp?v=${SPRITE_VERSION}`, { skipPixi: true });
    await showNpcSprite(`/assets/sprites/npcs/game-master.webp?v=${SPRITE_VERSION}`, { slideIn: true });
  } else if (roomType === 'dealer') {
    showDealer({ skipPixi: true });
    await showNpcSprite(`/assets/sprites/traveling_merchant.webp?v=${SPRITE_VERSION}`, { slideIn: true });
  }

  const hasCreatures = gameState.run?.creatureParty?.active?.length > 0;
  if (hasCreatures) combatEvents.emit('explore');
}

/**
 * Play NPC battle intro: NPC slides in, says greeting, slides out.
 */
export async function playNpcBattleIntro(npcData, showNpcSpriteFn, hideNpcSpriteFn, npcDialogue) {
  if (!npcData) return;

  const npcName = npcData.nameEn || npcData.name;

  // Hide enemy formation during the NPC intro
  const enemyFormation = document.getElementById('enemy-formation');
  if (enemyFormation) enemyFormation.style.opacity = '0';

  // Show NPC name/info in DOM; skip pixi spawn since we slide in below
  showNpcSpriteFn(npcName, npcData.id, npcData, { skipPixi: true });
  const spritePath = npcData.id
    ? `/assets/sprites/npcs/${npcData.id}.webp?v=${SPRITE_VERSION}`
    : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
  await showNpcSprite(spritePath, { slideIn: true });

  // Prefer bootstrap word-gated greeting over legacy AI greeting
  const bootstrapGreeting = npcDialogue?.greeting;
  if (bootstrapGreeting?.tokens?.length) {
    await new Promise(r => setTimeout(r, 100));
    narrationBox.forceHide();
    const knownWords = getKnownWords();
    const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
    const html = renderJpSentence(
      bootstrapGreeting.tokens,
      knownWords,
      wordDict,
      bootstrapGreeting.overrides || {},
      npcDialogue.useKanji || false
    );
    await narrationBox.show(html, { speaker: npcName, html: true });
  } else if (npcData.greeting) {
    await new Promise(r => setTimeout(r, 100));
    narrationBox.forceHide();
    speakText(npcData.greeting);
    await narrationBox.show(renderEnFirst(npcData.greeting), { speaker: npcName, html: true });
  }

  await hideNpcSprite({ slideOut: true });
  hideNpcSpriteFn();
}

/**
 * Wrap NPC skill activation with slide-in/out animation.
 */
export async function playNpcSkillAnimation(npcData, showNpcSpriteFn, hideNpcSpriteFn, skillCallback, enemies) {
  const enemyFormation = document.getElementById('enemy-formation');
  const npcName = npcData?.nameEn || npcData?.name;

  if (enemyFormation) enemyFormation.style.opacity = '0';

  if (npcData && showNpcSpriteFn) {
    showNpcSpriteFn(npcName, npcData.id, npcData, { skipPixi: true });
    const spritePath = npcData.id
      ? `/assets/sprites/npcs/${npcData.id}.webp?v=${SPRITE_VERSION}`
      : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
    await showNpcSprite(spritePath, { slideIn: true });
  }

  await skillCallback();

  await hideNpcSprite({ slideOut: true });
  if (hideNpcSpriteFn) hideNpcSpriteFn();

  if (enemies?.length) {
    showFormation('enemy', enemies);
  }

  const freshFormation = document.getElementById('enemy-formation');
  if (freshFormation) freshFormation.style.opacity = '1';
}
