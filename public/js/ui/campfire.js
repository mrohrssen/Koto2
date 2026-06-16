import { escapeHtml } from './html-utils.js';
import { renderJpSentence, getKnownWords, entityToToken } from './bootstrap-client.js';
import { showItemTargetPicker } from './item-target-picker.js';
import { renderButtons } from './ui-components.js';
import { itemSpriteUrl, spriteUrl } from '../assets/asset-urls.js';

let callbacks = {};
let campfireState = null;
let selected = {};
let activeTab = 'ingredients';
let displayMode = 'entry';
const DISPLAY_ONLY = { recordExposure: false };
const CAMPFIRE_FAILURE_COPY = 'Connection is spotty. Your progress will sync when you reconnect.';
const RARITY_RANK = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

export function init(cbs) {
  callbacks = cbs;
}

export async function show() {
  const prepared = callbacks.getExploreSession?.()?.currentPreparedRoom();
  const payload = prepared?.interactionPayload;
  campfireState = normalizeCampfireState(payload || await callbacks.apiGetCampfire());
  selected = {};
  activeTab = 'ingredients';
  displayMode = campfireState?.room?.cookedDish ? 'cooking' : 'entry';
  render();
}

export function renderForTest(state, cbs = {}) {
  callbacks = cbs;
  campfireState = normalizeCampfireState(state);
  selected = {};
  activeTab = 'ingredients';
  displayMode = campfireState?.room?.cookedDish ? 'cooking' : 'entry';
  render();
}

export function cleanup() {
  const sceneArea = document.getElementById('scene-area');
  sceneArea?.querySelectorAll('.campfire-scene').forEach(scene => scene.remove());
  setCookingFocusActive(false);
}

function clearCampfireUi() {
  const actionArea = document.getElementById('action-area');
  if (actionArea) actionArea.innerHTML = '';
  cleanup();
}

function ingredientById() {
  return new Map((campfireState?.ingredientCatalog || []).map(ingredient => [ingredient.id, ingredient]));
}

function getIngredient(id, ingredientsById = ingredientById()) {
  return ingredientsById.get(id) || { id, word: id, reading: id, nameEn: id, meaning: id };
}

function renderEntityName(entity) {
  return renderJpSentence([entityToToken(entity)], getKnownWords(), new Map(), {}, false, DISPLAY_ONLY);
}

function recordIngredientExposure(ingredient) {
  renderJpSentence([entityToToken(ingredient)], getKnownWords(), new Map());
}

function getCurrentGameState() {
  return callbacks.getGameState?.() || campfireState?.state || { run: {} };
}

function showCampfireFailure() {
  if (callbacks.showCampfireFailure) {
    callbacks.showCampfireFailure(CAMPFIRE_FAILURE_COPY);
  } else if (callbacks.showNarration) {
    callbacks.showNarration(CAMPFIRE_FAILURE_COPY, { autoDismiss: 2200 });
  } else {
    callbacks.showToast?.(CAMPFIRE_FAILURE_COPY, 2200);
  }
}

function recordCampfireAction(kind, payload = {}) {
  const session = callbacks.getExploreSession?.();
  let result = null;
  if (kind === 'campfire.cook') {
    result = session?.recordRoomAction('campfire.cook', payload);
  } else if (kind === 'campfire.feed') {
    result = session?.recordRoomAction('campfire.feed', payload);
  } else if (kind === 'campfire.skip') {
    result = session?.recordRoomAction('campfire.skip', payload);
  }
  if (!result?.accepted) {
    showCampfireFailure();
    return null;
  }
  return result;
}

function resetDisplayModeFromState() {
  displayMode = campfireState?.room?.cookedDish ? 'cooking' : 'entry';
}

function cloneValue(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function normalizeCampfireState(state) {
  const next = state?.room?.campfire ? { ...state, room: state.room.campfire } : state;
  return hydrateCampfireRecipes(next);
}

function hydrateCampfireRecipes(state) {
  if (!state) return state;
  const recipeCatalog = new Map();
  for (const recipe of state.recipes || []) {
    if (recipe?.id) recipeCatalog.set(recipe.id, recipe);
  }
  for (const recipe of state.discoveredRecipes || []) {
    if (recipe?.id && !recipeCatalog.has(recipe.id)) recipeCatalog.set(recipe.id, recipe);
  }
  if (recipeCatalog.size === 0 || !Array.isArray(state.discoveredRecipes)) return state;
  return {
    ...state,
    discoveredRecipes: state.discoveredRecipes
      .map(recipe => typeof recipe === 'string' ? recipeCatalog.get(recipe) : recipe)
      .filter(Boolean),
  };
}

function recipeCatalogById() {
  const catalog = new Map();
  for (const recipe of campfireState?.recipes || []) {
    if (recipe?.id) catalog.set(recipe.id, recipe);
  }
  for (const recipe of campfireState?.discoveredRecipes || []) {
    if (recipe?.id) catalog.set(recipe.id, recipe);
  }
  return catalog;
}

function hydrateRecipe(recipe) {
  if (!recipe?.id) return recipe;
  const catalogRecipe = recipeCatalogById().get(recipe.id);
  if (!catalogRecipe) return recipe;
  return {
    ...recipe,
    ...catalogRecipe,
    ingredients: cloneValue(recipe.ingredients || catalogRecipe.ingredients || []),
  };
}

function uniqueObjects(values) {
  return values.filter((value, index, list) => (
    value && list.findIndex(candidate => candidate === value) === index
  ));
}

function currentPreparedRoomDraft(draft) {
  const currentRoom = draft?.run?.currentRoom;
  if (!Number.isInteger(currentRoom)) return null;
  const preparedRooms = draft?.run?.exploreRunway?.preparedRooms;
  if (!Array.isArray(preparedRooms)) return null;
  return preparedRooms.find(preparedRoom => preparedRoom?.index === currentRoom) || null;
}

function activeRoomDrafts(draft) {
  const run = draft?.run;
  const currentRoom = run?.currentRoom;
  const preparedRoom = currentPreparedRoomDraft(draft);
  return uniqueObjects([
    draft?.room,
    Number.isInteger(currentRoom)
      ? run?.revealedRooms?.find(entry => entry?.index === currentRoom)?.room
      : null,
    Number.isInteger(currentRoom) && Array.isArray(run?.rooms)
      ? run.rooms[currentRoom]
      : null,
    preparedRoom?.room,
  ]);
}

function syncPreparedCampfirePayload(draft) {
  const preparedRoom = currentPreparedRoomDraft(draft);
  if (!preparedRoom || !campfireState) return;
  const room = cloneValue(preparedRoom.room || draft?.room || { type: 'campfire' });
  room.campfire = cloneValue(campfireState.room || {});
  if (campfireState.room?.completed || campfireState.room?.fed || campfireState.room?.skipped) {
    room.interacted = true;
  }
  preparedRoom.room = room;
  preparedRoom.interactionPayload = {
    ...cloneValue(campfireState),
    room: cloneValue(room),
  };
}

function updateCampfireGameState(mutator, { phase = null } = {}) {
  const currentState = getCurrentGameState();
  if (!currentState) return null;
  const draft = cloneValue(currentState);
  activeRoomDrafts(draft).forEach(room => mutator(room, draft));
  if (phase) draft.phase = phase;
  syncPreparedCampfirePayload(draft);
  callbacks.updateGameState?.(draft);
  callbacks.getExploreSession?.()?.adoptRunway?.(draft.run?.exploreRunway || null);
  return draft;
}

function escapeAttribute(value) {
  return escapeHtml(String(value ?? '')).replace(/'/g, '&#39;');
}

function renderFrameTokens(framePayload, fallback) {
  if (framePayload?.tokens?.length) {
    return renderJpSentence(framePayload.tokens, getKnownWords(), null, framePayload.overrides || {}, false);
  }
  console.warn(`[campfire] Missing frame tokens for ${fallback}; using literal fallback`);
  return fallback;
}

function yesLabel() {
  return renderFrameTokens(campfireState?.yesTokens, 'はい');
}

function noLabel() {
  return renderFrameTokens(campfireState?.noTokens, 'いいえ');
}

function renderIngredientIcon(entity, className = 'campfire-ingredient-icon') {
  const id = escapeAttribute(entity?.id || 'unknown');
  const word = escapeAttribute(entity?.word || '？');
  const cls = escapeAttribute(className);
  return `<img class="${cls}" src="${itemSpriteUrl(id)}" alt="${word}" onerror="this.outerHTML='<div class=\\'${cls} text-sprite\\'>${word}</div>'">`;
}

function renderCampfireImage() {
  return `
    <img
      class="campfire-fireplace-img"
      src="${spriteUrl(['objects', 'campfire'])}"
      alt="Campfire"
      onerror="this.outerHTML='<div class=\\'campfire-fireplace-fallback\\'>🔥</div>'"
    >
  `;
}

function selectedUnits(ingredientsById = ingredientById()) {
  return Object.entries(selected).flatMap(([id, quantity]) => {
    const ingredient = getIngredient(id, ingredientsById);
    return Array.from({ length: quantity }, () => ingredient);
  }).slice(0, 5);
}

function selectedCountTotal(selection = selected) {
  return Object.values(selection).reduce((sum, count) => sum + count, 0);
}

function requirementQuantity(recipe, id) {
  return (recipe.ingredients || []).find(ingredient => ingredient.id === id)?.quantity || 0;
}

function recipeContainsSelection(recipe, selection = selected) {
  return Object.entries(selection).every(([id, quantity]) => {
    return quantity <= requirementQuantity(recipe, id);
  });
}

function selectionCompletesRecipe(recipe, selection = selected) {
  return (recipe.ingredients || []).every(ingredient => {
    return (selection[ingredient.id] || 0) >= ingredient.quantity;
  });
}

function recipeTotalQuantity(recipe) {
  return (recipe?.ingredients || []).reduce((sum, ingredient) => sum + (ingredient.quantity || 0), 0);
}

function compareRecipePreference(a, b) {
  const sizeDelta = recipeTotalQuantity(b) - recipeTotalQuantity(a);
  if (sizeDelta !== 0) return sizeDelta;
  const rarityDelta = (RARITY_RANK[b?.rarity] || 0) - (RARITY_RANK[a?.rarity] || 0);
  if (rarityDelta !== 0) return rarityDelta;
  return String(a?.id || '').localeCompare(String(b?.id || ''));
}

function bestCompleteRecipe(recipes) {
  return [...(recipes || [])]
    .filter(recipe => selectionCompletesRecipe(recipe))
    .sort(compareRecipePreference)[0] || null;
}

function selectionWithAddedIngredient(id) {
  return {
    ...selected,
    [id]: (selected[id] || 0) + 1,
  };
}

function getRecipeGuidance() {
  const hints = campfireState?.cookableRecipeHints || [];
  const totalSelected = selectedCountTotal();
  const candidateRecipes = hints.filter(recipe => recipeContainsSelection(recipe));
  const hasValidPath = candidateRecipes.length > 0;
  const hasCompleteRecipe = candidateRecipes.some(recipe => selectionCompletesRecipe(recipe));
  const highlightedIngredientIds = new Set();

  if (hasValidPath) {
    Object.keys(selected).forEach(id => highlightedIngredientIds.add(id));
  }

  for (const [id, owned] of Object.entries(campfireState?.ingredients || {})) {
    if ((selected[id] || 0) >= owned) continue;
    if (totalSelected >= 5) continue;
    const nextSelection = selectionWithAddedIngredient(id);
    if (hints.some(recipe => recipeContainsSelection(recipe, nextSelection))) {
      highlightedIngredientIds.add(id);
    }
  }

  return { candidateRecipes, hasCompleteRecipe, highlightedIngredientIds };
}

function shakeCookButton(button = document.querySelector('.campfire-cook-btn')) {
  if (!button) return;
  button.classList.remove('campfire-cook-btn--shake');
  void button.offsetWidth;
  button.classList.add('campfire-cook-btn--shake');
  setTimeout(() => button.classList.remove('campfire-cook-btn--shake'), 320);
}

function setCookingFocusActive(active) {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea) return;
  sceneArea.classList[active ? 'add' : 'remove']('campfire-focus-active');
}

function renderCampfireScene(html, { focus = true } = {}) {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea) return;
  cleanup();
  setCookingFocusActive(focus);
  sceneArea.insertAdjacentHTML('beforeend', html);
}

function renderEntryScene() {
  renderCampfireScene(`
    <div class="campfire-scene campfire-scene--entry">
      <div class="campfire-entry-fire-wrap">
        ${renderCampfireImage()}
      </div>
    </div>
  `, { focus: false });
}

function renderSlotPreview() {
  const sceneArea = document.getElementById('scene-area');
  if (!sceneArea) return;

  const units = selectedUnits();
  const totalSelected = units.length;
  const { hasCompleteRecipe } = getRecipeGuidance();
  const readyClass = hasCompleteRecipe ? ' campfire-focus-wrap--recipe-ready' : '';
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
    <div class="campfire-scene campfire-scene--cooking">
      <div class="campfire-focus-wrap${readyClass}">
        ${renderCampfireImage()}
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
    <div class="campfire-scene campfire-scene--cooking">
      <div class="campfire-focus-wrap">
        ${renderCampfireImage()}
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

function renderEntryPrompt() {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return;
  renderEntryScene();
  actionArea.innerHTML = '<div class="ui-choice-heading">Would you like to cook?</div>';
  renderButtons([
    {
      label: yesLabel(),
      primary: true,
      onClick: () => {
        displayMode = 'cooking';
        render();
      },
    },
    {
      label: noLabel(),
      onClick: () => skipCampfire(),
    },
  ], { container: actionArea, append: true });
}

function render() {
  const actionArea = document.getElementById('action-area');
  if (!actionArea) return;

  if (displayMode === 'entry' && !campfireState?.room?.cookedDish) {
    renderEntryPrompt();
    return;
  }

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
  const totalSelected = selectedCountTotal();
  const { highlightedIngredientIds, hasCompleteRecipe } = getRecipeGuidance();
  const cookButtonLabel = hasCompleteRecipe ? 'Cook' : 'Add more ingredients';

  body.innerHTML = `
    <div class="campfire-ingredient-grid">
      ${ingredients.map(([id, count]) => {
        const ingredient = getIngredient(id, ingredientsById);
        const selectedCount = selected[id] || 0;
        const cardClasses = [
          'campfire-ingredient-card',
          selectedCount > 0 ? 'selected' : '',
          highlightedIngredientIds.has(id) ? 'recipe-valid' : '',
          selectedCount === 0 && !highlightedIngredientIds.has(id) ? 'disabled' : '',
        ].filter(Boolean).join(' ');
        const disabled = selectedCount === 0 && !highlightedIngredientIds.has(id);
        return `
          <button class="${cardClasses}" data-id="${escapeHtml(id)}" type="button" ${disabled ? 'disabled' : ''}>
            ${renderIngredientIcon(ingredient)}
            <span class="campfire-ingredient-name">${renderEntityName(ingredient)}</span>
            <span class="campfire-ingredient-count">${selectedCount}/${count}</span>
          </button>
        `;
      }).join('')}
    </div>
    <div class="campfire-action-row">
      <button class="ui-btn campfire-skip-btn" type="button">Skip</button>
      <button class="ui-btn ui-btn--primary campfire-cook-btn" type="button">${cookButtonLabel}</button>
    </div>
  `;

  for (const [id] of ingredients) {
    const ingredient = getIngredient(id, ingredientsById);
    if (ingredient.word) callbacks.prefetchTTS?.(ingredient.word);
  }

  body.querySelectorAll('.campfire-ingredient-card').forEach(button => {
    button.addEventListener('click', () => {
      if (button.disabled) return;
      const id = button.dataset.id;
      const owned = campfireState.ingredients[id] || 0;
      const current = selected[id] || 0;
      if (current >= owned) {
        delete selected[id];
      } else if (totalSelected < 5) {
        const ingredient = getIngredient(id, ingredientsById);
        selected[id] = current + 1;
        recordIngredientExposure(ingredient);
        if (ingredient.word) callbacks.playTTS?.(ingredient.word);
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
      for (const ingredient of recipe.ingredients) {
        recordIngredientExposure(getIngredient(ingredient.id, ingredientsById));
      }
      activeTab = 'ingredients';
      render();
    });
  });
}

async function cookSelected(event) {
  if (!getRecipeGuidance().hasCompleteRecipe) {
    shakeCookButton(event?.currentTarget || event?.target);
    return;
  }

  const ingredients = Object.entries(selected).map(([id, quantity]) => ({ id, quantity }));
  const queued = recordCampfireAction('campfire.cook', { ingredients });
  if (!queued) return;

  const recipe = bestCompleteRecipe(getRecipeGuidance().candidateRecipes);
  const hydratedRecipe = hydrateRecipe(recipe);
  const cookedDish = cloneValue(hydratedRecipe || selectedUnits()[0] || { id: 'campfire-dish', word: '料理', reading: 'りょうり', meaning: 'cooking' });
  const consumed = cloneValue(hydratedRecipe?.ingredients || recipe?.ingredients || ingredients);
  campfireState.room ||= {};
  campfireState.room.cookedDish = cookedDish;
  campfireState.room.consumed = consumed;
  campfireState.room.resultKind = recipe ? 'recipe' : 'ingredient';
  campfireState.ingredients ||= {};
  for (const ingredient of consumed) {
    const nextCount = (campfireState.ingredients?.[ingredient.id] || 0) - ingredient.quantity;
    if (nextCount > 0) campfireState.ingredients[ingredient.id] = nextCount;
    else delete campfireState.ingredients[ingredient.id];
  }
  updateCampfireGameState((room, draft) => {
    draft.run ||= {};
    draft.run.cooking ||= {};
    draft.run.cooking.ingredients = cloneValue(campfireState.ingredients || {});
    room.campfire ||= {};
    room.campfire.cookedDish = cloneValue(cookedDish);
    room.campfire.consumed = cloneValue(consumed);
    room.campfire.resultKind = recipe ? 'recipe' : 'ingredient';
  }, { phase: 'campfire' });
  selected = {};
  displayMode = 'cooking';
  if (campfireState?.room?.cookedDish) {
    recordIngredientExposure(campfireState.room.cookedDish);
  }
  render();
}

function clearActionArea() {
  const actionArea = document.getElementById('action-area');
  if (actionArea) actionArea.innerHTML = '';
}

async function skipCampfire() {
  const queued = recordCampfireAction('campfire.skip', {});
  if (!queued) return;
  campfireState.room ||= {};
  campfireState.room.completed = true;
  campfireState.room.skipped = true;
  updateCampfireGameState(room => {
    room.campfire ||= {};
    room.campfire.completed = true;
    room.campfire.skipped = true;
    room.interacted = true;
  }, { phase: 'room' });
  clearActionArea();
  cleanup();
  callbacks.updateUI?.();
}

function renderCookedDish(dish) {
  const state = callbacks.getGameState?.() || {};
  const party = state?.run?.creatureParty?.active || state?.creatureParty?.active || [];

  showItemTargetPicker(party, async (targetIndex) => {
    const queued = recordCampfireAction('campfire.feed', { targetCreatureIndex: targetIndex });
    if (!queued) return;
    campfireState.room ||= {};
    campfireState.room.fed = true;
    campfireState.room.completed = true;
    campfireState.room.targetCreatureIndex = targetIndex;
    updateCampfireGameState(room => {
      room.campfire ||= {};
      room.campfire.fed = true;
      room.campfire.completed = true;
      room.campfire.targetCreatureIndex = targetIndex;
      room.interacted = true;
    }, { phase: 'room' });
    clearCampfireUi();
    callbacks.updateUI?.();
  });
}
