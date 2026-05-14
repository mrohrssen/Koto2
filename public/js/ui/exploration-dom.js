import { dom } from '../dom.js';
import { renderJpSentence, getKnownWords, entityToToken } from './bootstrap-client.js';
import { hideFormation, hideEnemy } from './combat-dom.js';
import { getSceneManager } from '../scenes/scene-manager.js';
import { npcSpriteUrl, spriteUrl } from '../assets/asset-urls.js';

/**
 * Route an NPC sprite to the active scene's `npcs` layer when available.
 * Scene-aware replacement for the removed legacy `pixiShowNpcSprite` call.
 * When no scene with an `npcs` layer is active (boot / transition gap), the
 * Pixi slide is skipped — the DOM side of the NPC display still renders.
 */
function sceneShowNpc(spritePath) {
  const scene = getSceneManager()?.currentScene;
  if (!scene || scene.disposed || !scene.layers?.npcs) {
    // With HubScene mounted at boot (PR2 fix), there should always be a
    // scene with an npcs layer. If we hit this branch it's a regression in
    // ensureSceneForPhase() or a mid-transition window. Fail loudly instead
    // of rendering an invisible NPC.
    console.error('[exploration-dom] sceneShowNpc: no active scene with npcs layer — sprite will not render', { spritePath });
    return;
  }
  document.getElementById('npc-display')?.setAttribute('data-pixi-backed', '1');
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

function hideNpcNamePill() {
  dom.enemyName.textContent = '';
  dom.enemyName.innerHTML = '';
  dom.enemyInfo.classList.remove('visible');
  dom.enemyHpBar.style.display = 'none';
  if (dom.enemySkillBar) dom.enemySkillBar.style.display = 'none';
}

/** Helper: show an NPC sprite in the npc-display area (no HP bar) */
export function showNpcInDisplay(name, spritePath, { skipPixi = false } = {}) {
  dom.npcDisplay.classList.add('visible');
  hideFormation('enemy');
  hideNpcNamePill();

  // Hide DOM sprite — NPC renders on PixiJS canvas now
  dom.enemySprite.src = '';
  dom.enemySprite.classList.remove('visible');
  if (!skipPixi) sceneShowNpc(spritePath);
}

/** Show shrine fox in scene (no HP bar) */
export function showShrineFox() {
  showNpcInDisplay('Shrine Fox', spriteUrl('shrine_fox'));
}

/** Show quiz master in scene (no HP bar) */
export function showQuizMaster() {
  showNpcInDisplay('Quiz Master', spriteUrl('quiz_master'));
}

/** Show word discovery NPC (knowledge scholar spirit, no HP bar) */
export function showWordDiscoveryNpc() {
  showNpcInDisplay('Knowledge Spirit', spriteUrl('word_discovery_npc'));
}

/** Show Cid guide NPC in prologue (no HP bar) */
export function showCid() {
  showNpcInDisplay('Cid', npcSpriteUrl('cid'));
}

/** Hide Cid from scene */
export function hideCid() {
  hideEnemy();
}

/** Show traveling merchant NPC (shop merchant, no HP bar) */
export function showDealer({ skipPixi = false } = {}) {
  showNpcInDisplay('Traveling Merchant', spriteUrl('traveling_merchant'), { skipPixi });
}

/** Show Chippy companion sprite (no HP bar) */
export function showChippy() {
  dom.npcDisplay.classList.add('visible');
  hideFormation('enemy');
  hideNpcNamePill();

  dom.enemySprite.src = spriteUrl('chippy');
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

  hideNpcNamePill();

  // Hide DOM sprite — NPC renders on PixiJS canvas now
  dom.enemySprite.src = '';
  dom.enemySprite.classList.remove('visible');
  if (!skipPixi) {
    const spritePath = npcId
      ? npcSpriteUrl(npcId)
      : spriteUrl(['enemies', 'systemExecutive']);
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
