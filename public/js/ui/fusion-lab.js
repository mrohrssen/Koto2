import { creatureSpriteHtml } from './sprite-utils.js';
import { renderChoices } from './ui-components.js';
import { escapeHtml } from './html-utils.js';
import { flashElement, spawnParticles } from './dom-effects.js';
import { playSFX } from '../audio.js';
import { hapticLight } from '../native/index.js';

let callbacks = {};
let fusionState = null;
let catalogById = new Map();
let selectedRecipeId = null;

export function init(cbs) {
  callbacks = cbs;
}

export async function show() {
  const actionArea = document.getElementById('action-area');
  if (actionArea) actionArea.innerHTML = '<div class="fusion-loading">Loading Fusion Lab...</div>';

  try {
    const [nextFusionState, collectionResult] = await Promise.all([
      callbacks.apiGetFusionState(),
      callbacks.apiGetCreatureCollection()
    ]);

    fusionState = nextFusionState;
    catalogById = new Map((collectionResult?.catalog || []).map(creature => [creature.id, creature]));
    selectedRecipeId = selectedRecipeId || fusionState?.recipes?.[0]?.id || null;
    render();
  } catch (error) {
    console.error('[FusionLab] Failed to load:', error);
    actionArea.innerHTML = '<div class="fusion-error">Fusion Lab failed to load.</div>';
  }
}

export function cleanup() {
  document.getElementById('scene-area')?.querySelector('.fusion-lab-scene')?.remove();
}

function getSelectedRecipe() {
  return fusionState?.recipes?.find(recipe => recipe.id === selectedRecipeId) || fusionState?.recipes?.[0] || null;
}

function getCreature(id) {
  return catalogById.get(id) || { id, name: id, nameEn: id, element: 'fire' };
}

function render() {
  const recipe = getSelectedRecipe();
  if (!recipe) {
    cleanup();
    document.getElementById('action-area').innerHTML = '<div class="fusion-error">No fusion recipes available.</div>';
    return;
  }

  renderScene(recipe);
  renderRecipeTiles();
}

function renderRecipeTiles() {
  const recipes = fusionState?.recipes || [];
  renderChoices({
    cards: recipes.map(recipe => {
      const result = getCreature(recipe.resultId);
      return {
        sprite: creatureSpriteHtml(result.id, result.name || result.baseWord, result.element, 'fusion-recipe-sprite'),
        title: escapeHtml(recipe.nameEn),
        subtitle: recipe.alreadyUnlocked ? 'Unlocked' : recipe.canFuse ? 'Ready to fuse' : getRequirementText(recipe),
        pills: `<span class="fusion-core-pill">${recipe.cost.fusionCores} Fusion Core</span>`,
        badge: recipe.alreadyUnlocked
          ? { text: 'Unlocked', color: '#5e8f62' }
          : { text: recipe.canFuse ? 'Ready' : 'Locked', color: recipe.canFuse ? '#ef8f35' : '#777' }
      };
    }),
    disableAfterSelect: false,
    onSelect: (index) => {
      selectedRecipeId = recipes[index]?.id || selectedRecipeId;
      render();
    }
  });

  const actionArea = document.getElementById('action-area');
  const footer = document.createElement('div');
  footer.className = 'fusion-action-footer';
  footer.innerHTML = `
    <div class="fusion-core-balance">Fusion Cores: ${fusionState?.fusionCores || 0}</div>
    <button class="ui-btn fusion-back-btn" type="button">Back to Hub</button>
  `;
  actionArea.appendChild(footer);
  footer.querySelector('.fusion-back-btn')?.addEventListener('click', () => {
    cleanup();
    callbacks.onBack?.();
  });
}

function renderScene(recipe, result = null) {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea) return;

  cleanup();

  const selectedIds = recipe.ingredientIds.slice(0, 5);
  while (selectedIds.length < 5) selectedIds.push(null);

  const resultCreature = getCreature(recipe.resultId);
  const scene = document.createElement('div');
  scene.className = 'fusion-lab-scene';
  scene.innerHTML = `
    <div class="fusion-lab-bg"></div>
    <div class="fusion-lab-orbit"></div>
    <div class="fusion-lab-content">
      <div class="fusion-lab-title">Fusion Lab</div>
      <div class="fusion-slot-row">
        ${selectedIds.map((id, index) => renderIngredientSlot(id, recipe, index)).join('')}
      </div>
      <div class="fusion-result-pedestal ${result ? 'fusion-result-pedestal--revealed' : ''}">
        ${creatureSpriteHtml(resultCreature.id, resultCreature.name || resultCreature.baseWord, resultCreature.element, 'fusion-result-sprite')}
      </div>
      <div class="fusion-result-name">${escapeHtml(resultCreature.nameEn)}${result ? ' Unlocked!' : ''}</div>
      <div class="fusion-requirements">${escapeHtml(getRequirementText(recipe))}</div>
      <button class="ui-btn ui-btn--primary fusion-start-btn" type="button" ${recipe.canFuse ? '' : 'disabled'}>
        Start Fusion
      </button>
    </div>
  `;

  sceneArea.appendChild(scene);

  const startBtn = scene.querySelector('.fusion-start-btn');
  startBtn?.addEventListener('click', async () => {
    if (!recipe.canFuse) return;
    await beginFusion(recipe);
  });
}

function renderIngredientSlot(id, recipe, index) {
  if (!id) {
    return `<div class="fusion-slot fusion-slot--empty"><span>Slot ${index + 1}</span></div>`;
  }

  const creature = getCreature(id);
  const isMissing = recipe.missingIngredientIds.includes(id);
  return `
    <div class="fusion-slot ${isMissing ? 'fusion-slot--missing' : ''}">
      <div class="fusion-slot-sprite">
        ${creatureSpriteHtml(creature.id, creature.name || creature.baseWord, creature.element, 'fusion-ingredient-sprite')}
      </div>
      <div class="fusion-slot-name">${escapeHtml(creature.nameEn)}</div>
    </div>
  `;
}

function getRequirementText(recipe) {
  if (recipe.alreadyUnlocked) return 'Fire Cat is already unlocked.';
  if (recipe.missingIngredientIds.length > 0) {
    const missing = recipe.missingIngredientIds.map(id => getCreature(id).nameEn).join(', ');
    return `Missing: ${missing}`;
  }
  if (!recipe.hasEnoughCores) return `Needs ${recipe.cost.fusionCores} Fusion Core.`;
  return `${recipe.cost.fusionCores} Fusion Core required.`;
}

async function beginFusion(recipe) {
  const scene = document.querySelector('.fusion-lab-scene');
  const startBtn = scene?.querySelector('.fusion-start-btn');
  if (startBtn) {
    startBtn.disabled = true;
    startBtn.textContent = 'Fusing...';
  }

  playSFX('button-tap');
  hapticLight();
  scene?.classList.add('fusion-lab-scene--shaking');

  const result = await callbacks.apiStartFusion(recipe.id);
  if (result?.error) {
    callbacks.showToast?.(result.error, 2000);
    scene?.classList.remove('fusion-lab-scene--shaking');
    if (startBtn) startBtn.textContent = 'Start Fusion';
    await show();
    return;
  }

  if (result?.state) {
    callbacks.updateGameState?.({ ...result.state, phase: 'fusion_lab' });
  }
  fusionState = result;
  const nextRecipe = getSelectedRecipe();

  await new Promise(resolve => setTimeout(resolve, 450));
  renderScene(nextRecipe, result);

  const pedestal = document.querySelector('.fusion-result-pedestal');
  flashElement(pedestal, 3);
  spawnParticles(pedestal, 22, '#ffb74d');
}
