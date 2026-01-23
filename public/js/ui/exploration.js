/**
 * Exploration UI Module (Mobile) - Navigation through hub, wards, rooms
 *
 * Renders action buttons and scene overlays for non-combat phases.
 */

let getGameState = null;
let updateGameState = null;
let updateUI = null;
let actions = null;
let sceneModule = null;
let startEncounter = null;
let startBossEncounter = null;
let nextFloor = null;
let startNewRun = null;

// API functions
let apiGetStartingWards = null;
let apiSelectStartingWard = null;
let apiGetNextWardOptions = null;
let apiSelectNextWard = null;
let apiProceed = null;
let apiRoomEncounter = null;

export function init(callbacks) {
  getGameState = callbacks.getGameState;
  updateGameState = callbacks.updateGameState;
  updateUI = callbacks.updateUI;
  actions = callbacks.actions;
  sceneModule = callbacks.scene;
  startEncounter = callbacks.startEncounter;
  startBossEncounter = callbacks.startBossEncounter;
  nextFloor = callbacks.nextFloor;
  startNewRun = callbacks.startNewRun;
  apiGetStartingWards = callbacks.apiGetStartingWards;
  apiSelectStartingWard = callbacks.apiSelectStartingWard;
  apiGetNextWardOptions = callbacks.apiGetNextWardOptions;
  apiSelectNextWard = callbacks.apiSelectNextWard;
  apiProceed = callbacks.apiProceed;
  apiRoomEncounter = callbacks.apiRoomEncounter;
}

/** Hub phase — show Equip Bots + Infiltrate buttons */
export function renderHub() {
  actions.showButtons('Infiltrate');
  // Override the context action for this phase
  const btn = document.getElementById('context-action-btn');
  if (btn) {
    btn.onclick = () => startNewRun();
  }
}

/** Ward selection — show ward cards, proceed button */
export async function renderWardSelection() {
  const gameState = getGameState();
  let wards;
  if (!gameState.run?.currentWard) {
    wards = await apiGetStartingWards();
  } else {
    wards = await apiGetNextWardOptions();
  }

  if (!wards || !wards.wards) {
    actions.setContent('<p style="text-align:center">No wards available</p>');
    return;
  }

  let selectedWardId = null;

  const wardHtml = wards.wards.map(w => `
    <div class="ward-option" data-ward-id="${w.id}">
      <strong>${w.nameEn || w.name}</strong>
      <small>${w.description || ''}</small>
    </div>
  `).join('');

  actions.setContent(`
    <div class="ward-selection-list">${wardHtml}</div>
    <button class="action-btn action-btn-primary" id="ward-proceed-btn" disabled>Proceed</button>
  `);

  document.querySelectorAll('.ward-option').forEach(el => {
    el.addEventListener('click', () => {
      document.querySelectorAll('.ward-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      selectedWardId = el.dataset.wardId;
      const btn = document.getElementById('ward-proceed-btn');
      if (btn) btn.disabled = false;
    });
  });

  document.getElementById('ward-proceed-btn')?.addEventListener('click', async () => {
    if (!selectedWardId) return;
    const result = gameState.run?.currentWard
      ? await apiSelectNextWard(selectedWardId)
      : await apiSelectStartingWard(selectedWardId);
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  });
}

/** Exploring phase — show Proceed or Fight button */
export function renderExploring() {
  const gameState = getGameState();
  const room = gameState.run?.currentRoom;

  if (room?.encounter || gameState.phase === 'room_encounter') {
    actions.setContent(`
      <button class="action-btn action-btn-primary" id="fight-btn">Fight</button>
    `);
    document.getElementById('fight-btn')?.addEventListener('click', () => {
      startEncounter();
    });
    return;
  }

  actions.setContent(`
    <button class="action-btn action-btn-primary" id="proceed-btn">Proceed</button>
  `);
  document.getElementById('proceed-btn')?.addEventListener('click', async () => {
    const result = await apiProceed();
    if (result?.state) {
      updateGameState(result.state);
      updateUI();
    }
  });
}

/** Boss ready phase */
export function renderBossReady() {
  actions.setContent(`
    <button class="action-btn action-btn-primary" id="boss-fight-btn">Fight Boss</button>
  `);
  document.getElementById('boss-fight-btn')?.addEventListener('click', () => {
    startBossEncounter();
  });
}

/** Floor complete — show Continue button */
export function renderFloorComplete() {
  actions.setContent(`
    <button class="action-btn action-btn-primary" id="next-floor-btn">Continue</button>
  `);
  document.getElementById('next-floor-btn')?.addEventListener('click', () => {
    nextFloor();
  });
}

/** Run ended — show Return to Hub */
export function renderRunEnded() {
  actions.setContent(`
    <button class="action-btn action-btn-primary" id="return-hub-btn">Return to Hub</button>
  `);
  document.getElementById('return-hub-btn')?.addEventListener('click', () => {
    window.location.reload();
  });
}
