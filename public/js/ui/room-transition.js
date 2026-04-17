import { showFormation, hideFormation } from './combat-dom.js';
import { showNpcTrainer, showNpcInDisplay, showDealer } from './exploration-dom.js';
import { SPRITE_VERSION } from './sprite-utils.js';
import { speakText } from '../tts.js';
import * as narrationBox from './narration-box.js';
import { renderEnFirst, renderJpSentence, getKnownWords } from './bootstrap-client.js';
import { combatEvents } from './combat-events.js';
import { getSceneManager } from '../scenes/scene-manager.js';
import { ExplorationScene } from '../scenes/exploration-scene.js';

/**
 * Play the room entrance transition.
 * Called between updateGameState() and updateUI() after apiProceed().
 *
 * Transitions to a fresh ExplorationScene so player formation sprites + any
 * room NPC (friendlyNpc / whackAMole / dealer) spawn on the new scene. The
 * prior scene's registry.dispose() (in SceneManager.transition) cleans up
 * the outgoing room's NPC sprite — fixes bugs #3 and #5 (NPC sprite did not
 * clear on re-entry or on walking into a new NPC room).
 */
export async function playRoomTransition(gameState) {
  const room = gameState.run?.rooms?.[gameState.run?.currentRoom];
  if (!room) return;

  // Clear stale enemy formation from previous room before showing the new one
  hideFormation('enemy');

  // Transition to ExplorationScene. Bumping to a new scene here tears down
  // the previous scene's NPC sprite (via registry disposal + beforeExit) so
  // we never stack NPC sprites from room to room, and ensures player-formation
  // sprites render in non-combat rooms (bug #6).
  const mgr = getSceneManager();
  const allies = gameState.run?.creatureParty?.active ?? [];
  try {
    await mgr.transition(ExplorationScene, {
      roomId: gameState.run?.currentRoom ?? null,
      allies,
    });
  } catch (err) {
    console.error('[RoomTransition] ExplorationScene transition failed', err);
  }

  const scene = mgr.currentScene;
  // If the transition failed (scene === null or not an ExplorationScene), the
  // per-room NPC slide-in below would attempt to call showNpcSprite on the
  // wrong scene. Guard so we don't throw from _guard() on a disposed scene.
  const canShowNpc = scene instanceof ExplorationScene;

  const roomType = room.type;

  if (roomType === 'friendlyNpc') {
    const npc = room.npc;
    if (npc) {
      const spritePath = npc.id
        ? `/assets/sprites/npcs/${npc.id}.webp?v=${SPRITE_VERSION}`
        : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
      showNpcTrainer(npc.nameEn || npc.name, npc.id, npc, { skipPixi: true });
      if (canShowNpc) await scene.showNpcSprite(spritePath, { slideIn: true });
    }
  } else if (roomType === 'whackAMole') {
    showNpcInDisplay('Game Master', `/assets/sprites/npcs/game-master.webp?v=${SPRITE_VERSION}`, { skipPixi: true });
    if (canShowNpc) await scene.showNpcSprite(`/assets/sprites/npcs/game-master.webp?v=${SPRITE_VERSION}`, { slideIn: true });
  } else if (roomType === 'dealer') {
    showDealer({ skipPixi: true });
    if (canShowNpc) await scene.showNpcSprite(`/assets/sprites/traveling_merchant.webp?v=${SPRITE_VERSION}`, { slideIn: true });
  }

  const hasCreatures = allies.length > 0;
  if (hasCreatures) combatEvents.emit('explore');
}

/**
 * Toggle Pixi visibility of a formation side on the active scene's formation
 * ctx. Scene-aware replacement for the removed legacy `setFormationVisible`
 * export — reaches into `scene.formation.{player,enemy}Container` + any
 * status-label pills stashed on sprites.
 */
function setSceneFormationVisible(side, visible) {
  const scene = getSceneManager()?.currentScene;
  const ctx = scene?.formation;
  if (!ctx) return;
  const container = side === 'player' ? ctx.playerContainer : ctx.enemyContainer;
  if (container) container.visible = visible;
  const sprites = ctx.creatureSprites?.[side];
  if (sprites) {
    for (const sprite of sprites.values()) {
      if (!sprite?.statusLabels) continue;
      for (const pill of sprite.statusLabels) {
        pill.visible = visible;
      }
    }
  }
}

/**
 * Play NPC battle intro: NPC slides in, says greeting, slides out.
 *
 * Runs against the currently-active scene (BattleScene after Task 17's
 * pre-combat transition in game.js::startEncounter). The NPC layer exists on
 * both ExplorationScene and BattleScene, so this works regardless of which
 * scene is active at call time. If no scene with an `npcs` layer is active
 * (boot window / transition failure), the Pixi slide-in is skipped and only
 * the DOM side of the intro plays.
 */
export async function playNpcBattleIntro(npcData, showNpcSpriteFn, hideNpcSpriteFn, npcDialogue) {
  if (!npcData) return;

  const npcName = npcData.nameEn || npcData.name;
  const scene = getSceneManager().currentScene;
  const hasScene = !!scene && !scene.disposed && !!scene.layers?.npcs;

  // Hide enemy formation during the NPC intro
  const enemyFormation = document.getElementById('enemy-formation');
  if (enemyFormation) enemyFormation.style.opacity = '0';

  // Show NPC name/info in DOM; skip pixi spawn since we slide in below
  showNpcSpriteFn(npcName, npcData.id, npcData, { skipPixi: true });
  const spritePath = npcData.id
    ? `/assets/sprites/npcs/${npcData.id}.webp?v=${SPRITE_VERSION}`
    : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
  if (hasScene) {
    await scene.showNpcSprite(spritePath, { slideIn: true });
  }

  // Show bootstrap word-gated fightStart line, fall back to legacy AI greeting
  const bootstrapLine = npcDialogue?.fightStart;
  if (bootstrapLine?.tokens?.length) {
    await new Promise(r => setTimeout(r, 100));
    narrationBox.forceHide();
    const knownWords = getKnownWords();
    const wordDict = new Map(Object.entries(window.gameState?.wordDictionary || {}));
    const html = renderJpSentence(
      bootstrapLine.tokens,
      knownWords,
      wordDict,
      bootstrapLine.overrides || {},
      npcDialogue.useKanji || false
    );
    await narrationBox.show(html, { speaker: npcName, html: true });
  } else if (npcData.greeting) {
    // Legacy fallback for AI-generated greetings
    await new Promise(r => setTimeout(r, 100));
    narrationBox.forceHide();
    speakText(npcData.greeting);
    await narrationBox.show(renderEnFirst(npcData.greeting), { speaker: npcName, html: true });
  }

  // Scene may have changed while narration was showing; re-resolve.
  const currentScene = getSceneManager().currentScene;
  if (currentScene && !currentScene.disposed && currentScene.layers?.npcs && currentScene.npcSprite) {
    await currentScene.hideNpcSprite({ slideOut: true });
  }
  hideNpcSpriteFn();
}

/**
 * Wrap NPC skill activation with slide-in/out animation.
 *
 * Runs against the currently-active scene (always BattleScene during combat).
 * If no scene is active (shouldn't normally happen mid-combat) we skip the
 * Pixi slide but still run the skill callback + DOM enemy formation toggle.
 */
export async function playNpcSkillAnimation(npcData, showNpcSpriteFn, hideNpcSpriteFn, skillCallback, enemies) {
  const enemyFormation = document.getElementById('enemy-formation');
  const npcName = npcData?.nameEn || npcData?.name;
  const scene = getSceneManager().currentScene;
  const hasScene = !!scene && !scene.disposed && !!scene.layers?.npcs;

  // Hide both DOM formation (opacity) and Pixi sprites (container.visible)
  if (enemyFormation) enemyFormation.style.opacity = '0';
  setSceneFormationVisible('enemy', false);

  if (npcData && showNpcSpriteFn) {
    showNpcSpriteFn(npcName, npcData.id, npcData, { skipPixi: true });
    const spritePath = npcData.id
      ? `/assets/sprites/npcs/${npcData.id}.webp?v=${SPRITE_VERSION}`
      : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
    if (hasScene) {
      await scene.showNpcSprite(spritePath, { slideIn: true });
    }
  }

  await skillCallback();

  const currentScene = getSceneManager().currentScene;
  if (currentScene && !currentScene.disposed && currentScene.layers?.npcs && currentScene.npcSprite) {
    await currentScene.hideNpcSprite({ slideOut: true });
  }
  if (hideNpcSpriteFn) hideNpcSpriteFn();

  if (enemies?.length) {
    await showFormation('enemy', enemies);
  }

  // Mark already-dead enemy slots as defeated before making formation visible,
  // so their HP bars don't flash in during the opacity restore
  const freshFormation = document.getElementById('enemy-formation');
  if (freshFormation) {
    freshFormation.querySelectorAll('.formation-slot').forEach(slot => {
      const hp = Number(slot.dataset.hp);
      if (hp <= 0 && !slot.classList.contains('defeated')) {
        slot.classList.add('defeated');
      }
    });
  }

  // Restore both DOM and Pixi visibility
  setSceneFormationVisible('enemy', true);
  if (freshFormation) freshFormation.style.opacity = '1';
}
