import { escapeHtml } from './html-utils.js';

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

function render() {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return;

  const cookedDish = campfireState?.room?.cookedDish;
  actionArea.innerHTML = `
    <div class="campfire-panel">
      <div class="campfire-tabs">
        <button class="campfire-tab ${activeTab === 'ingredients' ? 'active' : ''}" data-tab="ingredients" type="button">材料</button>
        <button class="campfire-tab ${activeTab === 'recipes' ? 'active' : ''}" data-tab="recipes" type="button">レシピ</button>
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
  const ingredientById = new Map((campfireState?.ingredientCatalog || []).map(ingredient => [ingredient.id, ingredient]));
  const ingredients = Object.entries(campfireState?.ingredients || {});
  const totalSelected = Object.values(selected).reduce((sum, count) => sum + count, 0);

  body.innerHTML = `
    <div class="campfire-grid">
      ${ingredients.map(([id, count]) => {
        const ingredient = ingredientById.get(id) || { word: id, nameEn: id };
        return `
          <button class="campfire-ingredient" data-id="${escapeHtml(id)}" type="button">
            <span class="campfire-ingredient-word">${escapeHtml(ingredient.word)}</span>
            <span class="campfire-ingredient-name">${escapeHtml(ingredient.nameEn)}</span>
            <span class="campfire-ingredient-count">${selected[id] || 0}/${count}</span>
          </button>
        `;
      }).join('')}
    </div>
    <button class="ui-btn ui-btn--primary campfire-cook-btn" type="button" ${totalSelected < 1 || totalSelected > 5 ? 'disabled' : ''}>料理する</button>
  `;

  body.querySelectorAll('.campfire-ingredient').forEach(button => {
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
}

function renderRecipes() {
  const recipes = campfireState?.discoveredRecipes || [];
  const body = document.querySelector('.campfire-body');
  if (recipes.length === 0) {
    body.innerHTML = '<div class="campfire-empty">まだレシピを見つけていない。</div>';
    return;
  }

  body.innerHTML = `
    <div class="campfire-recipe-list">
      ${recipes.map((recipe, index) => `
        <button class="ui-choice campfire-recipe" data-index="${index}" type="button">
          <span class="ui-choice__badge">${escapeHtml(recipe.rarity)}</span>
          <span class="ui-choice__info">
            <span class="ui-choice__title">${escapeHtml(recipe.word)}</span>
            <span class="ui-choice__subtitle">${escapeHtml(recipe.effectDescription || recipe.nameEn)}</span>
          </span>
        </button>
      `).join('')}
    </div>
  `;

  body.querySelectorAll('.campfire-recipe').forEach(button => {
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

function renderCookedDish(dish) {
  const body = document.querySelector('.campfire-body');
  const state = callbacks.getGameState?.() || {};
  const party = state?.run?.creatureParty?.active || state?.creatureParty?.active || [];
  body.innerHTML = `
    <div class="campfire-result">
      <h3>${escapeHtml(dish.word)}</h3>
      <p>${escapeHtml(dish.effectDescription || dish.nameEn)}</p>
      <div class="campfire-target-list">
        ${party.map((creature, index) => `
          <button class="ui-choice campfire-target" data-index="${index}" type="button">
            <span class="ui-choice__info">
              <span class="ui-choice__title">${escapeHtml(creature.name || creature.nameEn || creature.id)}</span>
              <span class="ui-choice__subtitle">HP ${creature.hp}/${creature.maxHp} MP ${creature.mp || 0}/${creature.maxMp || 0}</span>
            </span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  body.querySelectorAll('.campfire-target').forEach(button => {
    button.addEventListener('click', async () => {
      const result = await callbacks.apiFeedCampfireDish(Number(button.dataset.index));
      callbacks.updateGameState?.(result.state);
      callbacks.updateUI?.();
    });
  });
}
