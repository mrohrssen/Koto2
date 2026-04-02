import { showNpcTrainer, showNpcInDisplay, showDealer, showFormation } from './scene.js';
import { showNpcSprite, hideNpcSprite } from '../pixi/formation.js';
import { SPRITE_VERSION } from './sprite-utils.js';
import { speakText } from '../tts.js';
import * as narrationBox from './narration-box.js';
import { renderEnFirst } from './bootstrap-client.js';
import { combatEvents } from './combat-events.js';

/**
 * Play the room entrance transition.
 * Called between updateGameState() and updateUI() after apiProceed().
 */
export async function playRoomTransition(gameState) {
  const room = gameState.run?.rooms?.[gameState.run?.currentRoom];
  if (!room) return;

  const roomType = room.type;

  if (roomType === 'friendlyNpc') {
    const npc = room.npc;
    if (npc) {
      const spritePath = npc.id
        ? `/assets/sprites/npcs/${npc.id}.webp?v=${SPRITE_VERSION}`
        : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
      showNpcTrainer(npc.nameEn || npc.name, npc.id, npc);
      await showNpcSprite(spritePath, { slideIn: true });
    }
  } else if (roomType === 'whackAMole') {
    showNpcInDisplay('Game Master', `/assets/sprites/npcs/game-master.webp?v=${SPRITE_VERSION}`);
    await showNpcSprite(`/assets/sprites/npcs/game-master.webp?v=${SPRITE_VERSION}`, { slideIn: true });
  } else if (roomType === 'dealer') {
    showDealer();
    await showNpcSprite(`/assets/sprites/traveling_merchant.webp?v=${SPRITE_VERSION}`, { slideIn: true });
  }

  const hasCreatures = gameState.run?.creatureParty?.active?.length > 0;
  if (hasCreatures) combatEvents.emit('explore');
}

/**
 * Play NPC battle intro: NPC slides in, says greeting, slides out.
 */
export async function playNpcBattleIntro(npcData, showNpcSpriteFn, hideNpcSpriteFn) {
  if (!npcData) return;

  const npcName = npcData.nameEn || npcData.name;

  // Hide enemy formation during the NPC intro
  const enemyFormation = document.getElementById('enemy-formation');
  if (enemyFormation) enemyFormation.style.opacity = '0';

  // Show NPC name/info in DOM, sprite on canvas with slide-in
  showNpcSpriteFn(npcName, npcData.id, npcData);
  const spritePath = npcData.id
    ? `/assets/sprites/npcs/${npcData.id}.webp?v=${SPRITE_VERSION}`
    : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
  await showNpcSprite(spritePath, { slideIn: true });

  if (npcData.greeting) {
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
    showNpcSpriteFn(npcName, npcData.id, npcData);
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
