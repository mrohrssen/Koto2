import { showFormation, hideFormation } from './combat-dom.js';
import { showNpcTrainer, showNpcInDisplay, showDealer } from './exploration-dom.js';
import { SPRITE_VERSION } from './sprite-utils.js';
import { renderEnFirst } from './bootstrap-client.js';
import { showNpcDialogueCard } from './npc-dialogue-card.js';
import { combatEvents } from './combat-events.js';
import { showIngredientDropPopups } from './word-level-up.js';
import { getSceneManager } from '../scenes/scene-manager.js';
import { ExplorationScene } from '../scenes/exploration-scene.js';
import {
  setScrollState,
  startParallax,
  EXPLORATION_SCROLL_SPEED,
  ROOM_TRAVEL_DURATION_MS,
  ROOM_TRAVEL_SCROLL_SPEED,
  BATTLE_SKY_DRIFT_SPEED,
} from '../pixi/parallax.js';

const NPC_BATTLE_STRENGTH_PROMPT = "Let's see how strong you are!";
const CAMPFIRE_SPRITE_PATH = `/assets/sprites/objects/campfire.webp?v=${SPRITE_VERSION}`;

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getTravelIngredientDropDelays(drops, durationMs) {
  if (!Array.isArray(drops) || drops.length === 0) return [];
  return drops.map((_, index) => durationMs * (index + 1) / (drops.length + 1));
}

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
export async function playRoomTransition(gameState, { waitFn = wait, ingredientDrops = [] } = {}) {
  const room = gameState.run?.rooms?.[gameState.run?.currentRoom];
  if (!room) return;

  // Clear stale enemy formation from previous room before showing the new one
  hideFormation('enemy');
  setScrollState('scrolling');
  startParallax(ROOM_TRAVEL_SCROLL_SPEED);

  const ingredientDropDelays = getTravelIngredientDropDelays(ingredientDrops, ROOM_TRAVEL_DURATION_MS);
  if (ingredientDropDelays.length > 0) {
    showIngredientDropPopups(ingredientDrops, { delaysMs: ingredientDropDelays });
  }

  // Transition to ExplorationScene. Bumping to a new scene here tears down
  // the previous scene's NPC sprite (via registry disposal + beforeExit) so
  // we never stack NPC sprites from room to room, and ensures player-formation
  // sprites render in non-combat rooms (bug #6).
  const mgr = getSceneManager();
  const allies = gameState.run?.creatureParty?.active ?? [];
  try {
    if (mgr.transitioning && typeof mgr.waitForIdle === 'function') {
      await mgr.waitForIdle();
    }
    const roomId = gameState.run?.currentRoom ?? null;
    const currentScene = mgr.currentScene;
    if (
      currentScene instanceof ExplorationScene
      && !currentScene.disposed
      && !currentScene._exiting
      && typeof currentScene.resetForRoom === 'function'
    ) {
      await currentScene.resetForRoom({ roomId, allies, parallaxSpeed: ROOM_TRAVEL_SCROLL_SPEED });
    } else {
      await mgr.transition(ExplorationScene, { roomId, allies, parallaxSpeed: ROOM_TRAVEL_SCROLL_SPEED });
    }
  } catch (err) {
    console.error('[RoomTransition] ExplorationScene transition failed', err);
  }

  const scene = mgr.currentScene;
  // If the transition failed (scene === null or not an ExplorationScene), the
  // per-room NPC slide-in below would attempt to call showNpcSprite on the
  // wrong scene. Guard so we don't throw from _guard() on a disposed scene.
  const canShowNpc = scene instanceof ExplorationScene;

  if (canShowNpc && typeof scene.playRoomTravel === 'function') {
    await scene.playRoomTravel({ durationMs: ROOM_TRAVEL_DURATION_MS, waitFn });
  } else {
    await waitFn(ROOM_TRAVEL_DURATION_MS);
  }
  startParallax(EXPLORATION_SCROLL_SPEED);

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
  } else if (roomType === 'shrine') {
    const spritePath = `/assets/sprites/shrine_fox.webp?v=${SPRITE_VERSION}`;
    showNpcInDisplay('Shrine Fox', spritePath, { skipPixi: true });
    if (canShowNpc) await scene.showNpcSprite(spritePath, { slideIn: true });
  } else if (roomType === 'whackAMole') {
    showNpcInDisplay('Game Master', `/assets/sprites/npcs/game-master.webp?v=${SPRITE_VERSION}`, { skipPixi: true });
    if (canShowNpc) await scene.showNpcSprite(`/assets/sprites/npcs/game-master.webp?v=${SPRITE_VERSION}`, { slideIn: true });
  } else if (roomType === 'campfire') {
    showNpcInDisplay('Campfire', CAMPFIRE_SPRITE_PATH, { skipPixi: true });
    if (canShowNpc) await scene.showNpcSprite(CAMPFIRE_SPRITE_PATH, { slideIn: true });
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
 * Play NPC battle intro: NPC slides in, says greeting, slides out, then —
 * if `enemies` is supplied — reveals the enemy formation via
 * `scene.syncCreatures`. The caller mounts BattleScene with `enemies: []`
 * so the stage starts clean; this function owns the reveal choreography so
 * the player sees NPC-alone → NPC-speaks → NPC-leaves → enemies-slide-in
 * instead of everything materialising concurrently (Bug #9).
 *
 * Runs against the currently-active scene (BattleScene after the pre-combat
 * transition in game.js::startEncounter). The NPC layer exists on
 * HubScene, ExplorationScene, and BattleScene, so this works regardless of
 * which scene is active at call time. If no scene with an `npcs` layer is
 * active (boot window / transition failure), the Pixi slide-in is skipped
 * and only the DOM side of the intro plays.
 *
 * @param {object} npcData - NPC record (id, name, nameEn, greeting).
 * @param {Function} showNpcSpriteFn - DOM-side NPC display callback.
 * @param {Function} hideNpcSpriteFn - DOM-side NPC hide callback.
 * @param {object|null} npcDialogue - Optional bootstrap dialogue payload.
 * @param {{ enemies?: Array, allies?: Array }} [opts] - If `enemies` is
 *   provided, the active scene's `syncCreatures` is called AFTER the NPC
 *   slides out to reveal the enemy formation with the normal slide-in
 *   animation. Callers that have already placed enemies via the initial
 *   scene mount can omit this to preserve the legacy behaviour.
 */
export async function playNpcBattleIntro(
  npcData,
  showNpcSpriteFn,
  hideNpcSpriteFn,
  npcDialogue,
  { enemies = null, allies = null, isBoss = false } = {},
) {
  if (!npcData) return;

  const npcName = npcData.nameEn || npcData.name;
  const scene = getSceneManager().currentScene;
  const hasScene = !!scene && !scene.disposed && !scene._exiting && !!scene.layers?.npcs;

  // Hide any DOM enemy formation markup during the NPC intro. When the
  // caller opted into scene-managed enemy reveal (enemies != null), the Pixi
  // side starts empty — this opacity toggle only affects residual DOM from
  // a prior screen.
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
  let showedIntroLine = false;
  if (bootstrapLine?.tokens?.length) {
    await new Promise(r => setTimeout(r, 100));
    await showNpcDialogueCard({
      speaker: npcName,
      speakerId: npcData.id,
      tokens: bootstrapLine.tokens,
      overrides: bootstrapLine.overrides || {},
      useKanji: npcDialogue.useKanji || false,
    });
    showedIntroLine = true;
  } else if (npcData.greeting) {
    // Legacy fallback for AI-generated greetings
    await new Promise(r => setTimeout(r, 100));
    await showNpcDialogueCard({
      speaker: npcName,
      speakerId: npcData.id,
      html: renderEnFirst(npcData.greeting),
    });
    showedIntroLine = true;
  }

  if (showedIntroLine) {
    await showNpcDialogueCard({
      speaker: npcName,
      speakerId: npcData.id,
      text: NPC_BATTLE_STRENGTH_PROMPT,
    });
  }

  // Scene may have changed while narration was showing; re-resolve.
  const currentScene = getSceneManager().currentScene;
  if (currentScene && !currentScene.disposed && !currentScene._exiting && currentScene.layers?.npcs && currentScene.npcSprite) {
    await currentScene.hideNpcSprite({ slideOut: true });
  }
  hideNpcSpriteFn();

  // Bug #9 fix: reveal enemies AFTER the NPC slides out so the player sees
  // them materialise one-by-one on the cleared stage rather than alongside
  // the NPC. Only fires when the caller opted in by passing `enemies`.
  if (Array.isArray(enemies)) {
    // Build DOM enemy formation BEFORE scene.syncCreatures so that
    // spawnFormationSprite's `.formation-slot[data-index="X"] .formation-sprite--pixi-anchor`
    // lookup finds a real anchor. Without this, multi-enemy layouts fall back
    // to percentage-based positioning (fires the 3-creature scatter bug).
    // Kept hidden (opacity:0) until the Pixi sprites finish sliding in below.
    await showFormation('enemy', enemies, { isBoss });
    const revealScene = getSceneManager().currentScene;
    if (revealScene && !revealScene.disposed && !revealScene._exiting && typeof revealScene.syncCreatures === 'function') {
      await revealScene.syncCreatures({
        allies:  allies || [],
        enemies,
        initial: true,  // triggers enemy slide-in (see BattleScene._diff skipEnter logic)
      });
    }
    // Restore the DOM formation opacity so the HP bars + name labels built
    // by combat-dom.showFormation become visible alongside the revealed
    // Pixi sprites.
    const freshEf = document.getElementById('enemy-formation');
    if (freshEf) freshEf.style.opacity = '1';
  }
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
  const hasScene = !!scene && !scene.disposed && !scene._exiting && !!scene.layers?.npcs;

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
  if (currentScene && !currentScene.disposed && !currentScene._exiting && currentScene.layers?.npcs && currentScene.npcSprite) {
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

const CID_TUTORIAL_NPC = { id: 'cid', name: 'Cid', nameEn: 'Cid' };

export async function playTutorialBossInterjection(
  lines,
  showCidSpriteFn,
  hideCidSpriteFn,
  showNarrationFn,
  enemies,
  { waitFn = (ms) => new Promise(resolve => setTimeout(resolve, ms)), settleMs = 500 } = {},
) {
  if (!Array.isArray(lines) || lines.length === 0) return;

  // Cid's first interjection runs in startEncounter BEFORE startCombatLoop has
  // mounted BattleScene, so the parallax gate may still be off (or running at
  // ExplorationScene's walking speed) when Cid slides in. Pin it to the
  // combat sky-drift speed and freeze the battleground here so the player
  // sees the clouds drift behind Cid on the very first encounter — same
  // setup BattleScene.onEnter does, just earlier in the sequence.
  startParallax(BATTLE_SKY_DRIFT_SPEED);
  setScrollState('encounter');

  await waitFn(settleMs);
  await playNpcSkillAnimation(
    CID_TUTORIAL_NPC,
    showCidSpriteFn,
    hideCidSpriteFn,
    async () => {
      for (const line of lines) {
        await showNarrationFn(line, { speaker: 'Cid' });
      }
    },
    enemies,
  );
}
