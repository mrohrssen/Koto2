import { escapeHtml } from './html-utils.js';
import { renderJpSentence, getKnownWords } from './bootstrap-client.js';
import { SPRITE_VERSION } from './sprite-utils.js';
import { showItemTargetPicker } from './item-target-picker.js';

let callbacks = {};
let campfireState = null;
let selected = {};
let activeTab = 'ingredients';

export function init(cbs) {
  callbacks = cbs;
}

export async function show() {
  campfireState = await callbacks.apiGetCampfire();
  selected = {};
  activeTab = 'ingredients';
  render();
}

export function renderForTest(state, cbs = {}) {
  callbacks = cbs;
  campfireState = state;
  selected = {};
  activeTab = 'ingredients';
  render();
}

export function cleanup() {
  const sceneArea = document.getElementById('scene-area');
  sceneArea?.querySelector('.campfire-scene')?.remove();
}

function ingredientById() {
  return new Map((campfireState?.ingredientCatalog || []).map(ingredient => [ingredient.id, ingredient]));
}

function getIngredient(id, ingredientsById = ingredientById()) {
  return ingredientsById.get(id) || { id, word: id, reading: id, nameEn: id, meaning: id };
}

function renderEntityName(entity) {
  const surface = entity?.word || entity?.name || entity?.baseWord || entity?.id || '？';
  const reading = entity?.reading || entity?.baseReading || surface;
  const meaning = entity?.meaning || entity?.nameEn || entity?.baseMeaning || surface;
  return renderJpSentence([{ surface, base: surface, reading, meaning, entity: true }], getKnownWords(), new Map());
}

function escapeAttribute(value) {
  return escapeHtml(String(value ?? '')).replace(/'/g, '&#39;');
}

function renderIngredientIcon(entity, className = 'campfire-ingredient-icon') {
  const id = escapeAttribute(entity?.id || 'unknown');
  const word = escapeAttribute(entity?.word || '？');
  const cls = escapeAttribute(className);
  return `<img class="${cls}" src="/assets/sprites/items/${id}.webp?v=${SPRITE_VERSION}" alt="${word}" onerror="this.outerHTML='<div class=\\'${cls} text-sprite\\'>${word}</div>'">`;
}

function selectedUnits(ingredientsById = ingredientById()) {
  return Object.entries(selected).flatMap(([id, quantity]) => {
    const ingredient = getIngredient(id, ingredientsById);
    return Array.from({ length: quantity }, () => ingredient);
  }).slice(0, 5);
}

function renderCampfireScene(html) {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea) return;
  cleanup();
  sceneArea.insertAdjacentHTML('beforeend', html);
}

function renderSlotPreview() {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea) return;

  const units = selectedUnits();
  const totalSelected = units.length;
  const slots = Array.from({ length: 5 }, (_, index) => {
    const ingredient = units[index];
    if (!ingredient) {
      return `<div class="campfire-slot campfire-slot--empty">Slot ${index + 1}</div>`;
    }
    return `
      <div class="campfire-slot">
        ${renderIngredientIcon(ingredient, 'campfire-slot-icon')}
        <div class="campfire-slot-name">${renderEntityName(ingredient)}</div>
      </div>
    `;
  }).join('');

  renderCampfireScene(`
    <div class="campfire-scene">
      <div class="campfire-scene-bg"></div>
      <div class="campfire-scene-ground"></div>
      <div class="campfire-flame-wrap">
        <div class="campfire-flame"></div>
        <div class="campfire-logs"></div>
      </div>
      <div class="campfire-slot-preview">
        <div class="campfire-slot-preview__header">
          <span>Cooking slots</span>
          <span>${totalSelected} / 5</span>
        </div>
        <div class="campfire-slot-row">${slots}</div>
      </div>
    </div>
  `);
}

function renderCookedDishScene(dish) {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea) return;

  renderCampfireScene(`
    <div class="campfire-scene">
      <div class="campfire-scene-bg"></div>
      <div class="campfire-scene-ground"></div>
      <div class="campfire-flame-wrap">
        <div class="campfire-flame"></div>
        <div class="campfire-logs"></div>
      </div>
      <div class="campfire-cooked-dish-display">
        ${renderIngredientIcon(dish, 'campfire-cooked-dish-icon')}
        <div class="campfire-cooked-dish-name">${renderEntityName(dish)}</div>
        <div class="campfire-cooked-dish-effect">${escapeHtml(dish.effectDescription || dish.nameEn || '')}</div>
      </div>
    </div>
  `);
}

function recipeCanCook(recipe) {
  return (recipe.ingredients || []).every(ingredient => {
    return (campfireState?.ingredients?.[ingredient.id] || 0) >= ingredient.quantity;
  });
}

function renderRequirementPills(recipe, ingredientsById = ingredientById()) {
  return (recipe.ingredients || []).map(ingredient => {
    const catalogIngredient = getIngredient(ingredient.id, ingredientsById);
    return `<span class="campfire-recipe-pill">${escapeHtml(catalogIngredient.word)} x${ingredient.quantity}</span>`;
  }).join('');
}

function render() {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return;

  const cookedDish = campfireState?.room?.cookedDish;
  if (cookedDish) renderCookedDishScene(cookedDish);
  else renderSlotPreview();
  actionArea.innerHTML = `
    <div class="campfire-panel">
      <div class="campfire-tabs">
        <button class="campfire-tab ${activeTab === 'ingredients' ? 'active' : ''}" data-tab="ingredients" type="button">Ingredients</button>
        <button class="campfire-tab ${activeTab === 'recipes' ? 'active' : ''}" data-tab="recipes" type="button">Recipes</button>
      </div>
      <div class="campfire-body"></div>
    </div>
  `;

  actionArea.querySelectorAll('.campfire-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      render();
    });
  });

  if (cookedDish) renderCookedDish(cookedDish);
  else if (activeTab === 'recipes') renderRecipes();
  else renderIngredients();
}

function renderIngredients() {
  const body = document.querySelector('.campfire-body');
  const ingredientsById = ingredientById();
  const ingredients = Object.entries(campfireState?.ingredients || {});
  const totalSelected = Object.values(selected).reduce((sum, count) => sum + count, 0);

  body.innerHTML = `
    <div class="campfire-ingredient-grid">
      ${ingredients.map(([id, count]) => {
        const ingredient = getIngredient(id, ingredientsById);
        const selectedCount = selected[id] || 0;
        return `
          <button class="campfire-ingredient-card ${selectedCount > 0 ? 'selected' : ''}" data-id="${escapeHtml(id)}" type="button">
            ${renderIngredientIcon(ingredient)}
            <span class="campfire-ingredient-name">${renderEntityName(ingredient)}</span>
            <span class="campfire-ingredient-count">${selectedCount}/${count}</span>
          </button>
        `;
      }).join('')}
    </div>
    <div class="campfire-action-row">
      <button class="ui-btn campfire-skip-btn" type="button">Skip</button>
      <button class="ui-btn ui-btn--primary campfire-cook-btn" type="button" ${totalSelected < 1 || totalSelected > 5 ? 'disabled' : ''}>Cook</button>
    </div>
  `;

  body.querySelectorAll('.campfire-ingredient-card').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      const owned = campfireState.ingredients[id] || 0;
      const current = selected[id] || 0;
      if (current >= owned) {
        delete selected[id];
      } else if (totalSelected < 5) {
        selected[id] = current + 1;
      }
      render();
    });
  });

  body.querySelector('.campfire-cook-btn')?.addEventListener('click', cookSelected);
  body.querySelector('.campfire-skip-btn')?.addEventListener('click', skipCampfire);
}

function renderRecipes() {
  const recipes = campfireState?.discoveredRecipes || [];
  const body = document.querySelector('.campfire-body');
  const ingredientsById = ingredientById();
  if (recipes.length === 0) {
    body.innerHTML = '<div class="campfire-empty">No recipes discovered yet.</div>';
    return;
  }

  body.innerHTML = `
    <div class="campfire-recipe-list">
      ${recipes.map((recipe, index) => {
        const canCook = recipeCanCook(recipe);
        return `
          <button class="campfire-recipe-card ${canCook ? 'ready' : ''}" data-index="${index}" type="button">
            <span class="campfire-recipe-badge ${canCook ? 'ready' : 'need'}">${canCook ? 'Ready' : 'Need'}</span>
            ${renderIngredientIcon(recipe)}
            <span class="campfire-recipe-info">
              <span class="campfire-recipe-title">${renderEntityName(recipe)}</span>
              <span class="campfire-recipe-effect">${escapeHtml(recipe.effectDescription || recipe.nameEn || '')}</span>
              <span class="campfire-recipe-pills">${renderRequirementPills(recipe, ingredientsById)}</span>
            </span>
          </button>
        `;
      }).join('')}
    </div>
  `;

  body.querySelectorAll('.campfire-recipe-card').forEach(button => {
    button.addEventListener('click', () => {
      const recipe = recipes[Number(button.dataset.index)];
      selected = Object.fromEntries(recipe.ingredients.map(ingredient => [ingredient.id, ingredient.quantity]));
      activeTab = 'ingredients';
      render();
    });
  });
}

async function cookSelected() {
  const ingredients = Object.entries(selected).map(([id, quantity]) => ({ id, quantity }));
  campfireState = await callbacks.apiCookAtCampfire(ingredients);
  render();
}

async function skipCampfire() {
  const result = await callbacks.apiSkipCampfire?.();
  if (result?.state) {
    cleanup();
    callbacks.updateGameState?.(result.state);
    callbacks.updateUI?.();
  }
}

function renderCookedDish(dish) {
  const state = callbacks.getGameState?.() || {};
  const party = state?.run?.creatureParty?.active || state?.creatureParty?.active || [];

  showItemTargetPicker(party, async (targetIndex) => {
    const result = await callbacks.apiFeedCampfireDish(targetIndex);
    if (result?.state) {
      cleanup();
      callbacks.updateGameState?.(result.state);
      callbacks.updateUI?.();
    }
  });
}
