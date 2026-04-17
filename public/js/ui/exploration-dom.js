import { dom } from '../dom.js';
import { SPRITE_VERSION } from './sprite-utils.js';
import { renderJpSentence, getKnownWords, entityToToken, esc as escHtml } from './bootstrap-client.js';
import { hideFormation, hideEnemy } from './combat-dom.js';
import { getSceneManager } from '../scenes/scene-manager.js';

/**
 * Route an NPC sprite to the active scene's `npcs` layer when available.
 * Scene-aware replacement for the removed legacy `pixiShowNpcSprite` call.
 * When no scene with an `npcs` layer is active (boot / transition gap), the
 * Pixi slide is skipped — the DOM side of the NPC display still renders.
 */
function sceneShowNpc(spritePath) {
  const scene = getSceneManager()?.currentScene;
  if (!scene || scene.disposed || !scene.layers?.npcs) return;
  // Fire-and-forget — callers of showNpcInDisplay / showNpcTrainer are sync.
  scene.showNpcSprite(spritePath).catch(err => {
    console.warn('[exploration-dom] scene.showNpcSprite failed:', err);
  });
}

/* ------------------------------------------------------------------ */
/*  Placeholders (NPC fallback sprites)                                */
/* ------------------------------------------------------------------ */

function removePlaceholder() {
  document.getElementById('enemy-placeholder')?.remove();
}

/* ------------------------------------------------------------------ */
/*  NPC display functions                                              */
/* ------------------------------------------------------------------ */

/** Helper: show an NPC sprite in the npc-display area (no HP bar) */
export function showNpcInDisplay(name, spritePath, { skipPixi = false } = {}) {
  dom.npcDisplay.classList.add('visible');
  hideFormation('enemy');
  dom.enemyName.textContent = name;
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  // Hide DOM sprite — NPC renders on PixiJS canvas now
  dom.enemySprite.src = '';
  dom.enemySprite.classList.remove('visible');
  if (!skipPixi) sceneShowNpc(spritePath);
}

/** Show shrine fox in scene (no HP bar) */
export function showShrineFox() {
  showNpcInDisplay('Shrine Fox', `/assets/sprites/shrine_fox.webp?v=${SPRITE_VERSION}`);
}

/** Show quiz master in scene (no HP bar) */
export function showQuizMaster() {
  showNpcInDisplay('Quiz Master', `/assets/sprites/quiz_master.webp?v=${SPRITE_VERSION}`);
}

/** Show word discovery NPC (knowledge scholar spirit, no HP bar) */
export function showWordDiscoveryNpc() {
  showNpcInDisplay('Knowledge Spirit', `/assets/sprites/word_discovery_npc.webp?v=${SPRITE_VERSION}`);
}

/** Show Cid guide NPC in prologue (no HP bar) */
export function showCid() {
  showNpcInDisplay('Cid', `/assets/sprites/npcs/cid.webp?v=${SPRITE_VERSION}`);
}

/** Hide Cid from scene */
export function hideCid() {
  hideEnemy();
}

/** Show traveling merchant NPC (shop merchant, no HP bar) */
export function showDealer({ skipPixi = false } = {}) {
  showNpcInDisplay('Traveling Merchant', `/assets/sprites/traveling_merchant.webp?v=${SPRITE_VERSION}`, { skipPixi });
}

/** Show Chippy companion sprite (no HP bar) */
export function showChippy() {
  dom.npcDisplay.classList.add('visible');
  hideFormation('enemy');
  dom.enemyName.textContent = 'Chippy';
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  dom.enemySprite.src = `/assets/sprites/chippy.webp?v=${SPRITE_VERSION}`;
  dom.enemySprite.onerror = () => {
    dom.enemySprite.classList.remove('visible');
    removePlaceholder();
    const el = document.createElement('div');
    el.id = 'enemy-placeholder';
    el.style.cssText = 'width:120px;height:120px;border-radius:50%;background:rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-size:48px;box-shadow:0 4px 20px rgba(0,0,0,0.2);z-index:2;position:relative;';
    el.textContent = '\u2728';
    dom.npcDisplay.appendChild(el);
  };
  dom.enemySprite.onload = () => {
    removePlaceholder();
    dom.enemySprite.classList.add('visible');
  };
}

/** Hide Chippy (alias for hideEnemy) */
export function hideChippy() {
  hideEnemy();
}

/** Show NPC trainer in scene (no HP bar) */
export function showNpcTrainer(npcName, npcId, npc, { skipPixi = false } = {}) {
  dom.npcDisplay.classList.add('visible');
  // When skipPixi is true (NPC skill mid-combat), the caller manages enemy
  // formation visibility via opacity toggle — don't destroy Pixi sprites here
  // or dead creatures will be rebuilt as ghost sprites.
  if (!skipPixi) hideFormation('enemy');

  const roleHtml = npc?.role
    ? ' \u2014 ' + renderJpSentence([entityToToken(npc.role)], getKnownWords(), new Map())
    : '';
  const npcNameHtml = `${escHtml(npcName)}${roleHtml}`;
  dom.enemyName.innerHTML = npcNameHtml;
  dom.enemyInfo.classList.add('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';

  // Hide DOM sprite — NPC renders on PixiJS canvas now
  dom.enemySprite.src = '';
  dom.enemySprite.classList.remove('visible');
  if (!skipPixi) {
    const spritePath = npcId
      ? `/assets/sprites/npcs/${npcId}.webp?v=${SPRITE_VERSION}`
      : `/assets/sprites/enemies/systemExecutive.webp?v=${SPRITE_VERSION}`;
    sceneShowNpc(spritePath);
  }
}

/** Hide NPC trainer from scene */
export function hideNpcTrainer() {
  hideEnemy();
}

/** Show NPC skill pills in the enemy skill bar */
export function showNpcSkills(skills) {
  if (!dom.enemySkillBar || !skills?.length) return;
  dom.enemySkillBar.innerHTML = '';
  for (const skill of skills) {
    const pill = document.createElement('span');
    pill.className = 'npc-skill-pill';
    pill.innerHTML = renderJpSentence([entityToToken(skill)], getKnownWords(), new Map());
    dom.enemySkillBar.appendChild(pill);
  }
  dom.enemySkillBar.style.display = 'flex';
}
