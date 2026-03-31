/**
 * Bug Report UI Module
 *
 * Allows users to attach screenshots and submit bug reports.
 */

import { apiUrl, getAuthHeaders } from '../api.js';
import { dom } from '../dom.js';
import { store } from '../store.js';
import { snapshot as getDiagnostics } from '../diagnostics.js';

let modal = null;
let noteInput = null;
let submitBtn = null;
let cancelBtn = null;
let reportBtn = null;
let fileInput = null;
let preview = null;
let selectedFile = null;

/** Initialize bug report UI */
export function init() {
  modal = document.getElementById('bug-report-modal');
  noteInput = document.getElementById('bug-report-note');
  submitBtn = document.getElementById('bug-report-submit');
  cancelBtn = document.getElementById('bug-report-cancel');
  reportBtn = document.getElementById('bug-report-btn');
  fileInput = document.getElementById('bug-report-file');
  preview = document.getElementById('bug-report-preview');

  if (!modal || !reportBtn) {
    console.warn('Bug report elements not found');
    return;
  }

  // Event listeners
  reportBtn.addEventListener('click', openModal);
  cancelBtn.addEventListener('click', closeModal);
  submitBtn.addEventListener('click', submitReport);
  fileInput?.addEventListener('change', handleFileSelect);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

/** Handle file selection */
function handleFileSelect(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  // Validate it's an image
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image');
    return;
  }

  selectedFile = file;

  // Show preview
  if (preview) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      preview.src = ev.target.result;
      preview.style.display = 'block';
    };
    reader.readAsDataURL(file);
  }
}

/** Open the bug report modal */
function openModal() {
  if (modal) {
    modal.classList.add('active');
  }
}

/** Close the bug report modal */
function closeModal() {
  if (modal) {
    modal.classList.remove('active');
    if (noteInput) noteInput.value = '';
    if (fileInput) fileInput.value = '';
    if (preview) {
      preview.src = '';
      preview.style.display = 'none';
    }
    selectedFile = null;
  }
}

/** Read selected file as base64 */
function getScreenshotData() {
  return new Promise((resolve, reject) => {
    if (!selectedFile) {
      resolve(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(selectedFile);
  });
}

/** Get current username (prefer auth username for bug triage) */
function getUsername() {
  // Prefer auth username — identifies the account
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (user.username) return user.username;
    } catch { /* fall through */ }
  }

  // Fall back to in-game player name
  const gameState = store.get('gameState') || {};
  if (gameState.player?.name) return gameState.player.name;

  return 'anonymous';
}

/** Extract key fields from game state without sending the entire object */
function sanitizeGameState(gs) {
  if (!gs) return null;
  try {
    const snapshot = {
      phase: gs.phase,
      player: gs.player ? {
        name: gs.player.name,
        level: gs.player.level,
        hp: gs.player.hp,
        maxHp: gs.player.maxHp,
        credits: gs.player.credits
      } : null,
      run: gs.run ? {
        floor: gs.run.floor,
        roomIndex: gs.run.roomIndex,
        areaId: gs.run.areaId,
        ward: gs.run.ward?.name
      } : null,
      combat: gs.combat ? {
        turn: gs.combat.turn,
        enemyCount: gs.combat.enemies?.length,
        partyAlive: gs.combat.party?.filter(c => c && c.hp > 0).length
      } : null,
      partySize: gs.run?.party?.length || 0
    };
    const json = JSON.stringify(snapshot);
    if (json.length > 50000) {
      return { phase: gs.phase, _truncated: true, sizeBytes: json.length };
    }
    return snapshot;
  } catch {
    return { phase: gs.phase, _error: 'Failed to serialize' };
  }
}

/** Gather game context with full diagnostics */
function gatherContext() {
  const gameState = store.get('gameState') || {};
  const diagnostics = getDiagnostics();

  return {
    screen: gameState.phase || 'unknown',
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight
    },
    devicePixelRatio: window.devicePixelRatio || 1,
    userAgent: navigator.userAgent,
    scrollPositions: {
      main: document.querySelector('.game-app')?.scrollTop || 0
    },
    gameState: sanitizeGameState(gameState),
    consoleErrors: diagnostics.consoleErrors,
    recentActions: diagnostics.recentActions,
    networkErrors: diagnostics.networkErrors,
    performance: diagnostics.performance
  };
}

/** Submit the bug report */
async function submitReport() {
  const note = noteInput?.value.trim() || '';
  const tester = getUsername();

  // Require either a note or a screenshot
  if (!note && !selectedFile) {
    showToast('Add a note or screenshot');
    return;
  }

  // Generate timestamp-based name
  const now = new Date();
  const name = `report-${now.toISOString().slice(0, 19).replace(/[T:]/g, '-')}`;

  // Disable button during submission
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';
  }

  try {
    const screenshot = await getScreenshotData();
    const context = gatherContext();

    const response = await fetch(apiUrl('/api/bug-report'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ name, tester, note, screenshot, context })
    });

    const data = await response.json();

    if (data.success) {
      closeModal();
      showToast('Bug report submitted!');
    } else {
      showToast('Failed to submit report');
    }
  } catch (error) {
    console.error('Bug report submission error:', error);
    showToast('Error submitting report');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
    }
  }
}

/** Show a temporary toast message */
function showToast(message) {
  const toast = dom.sceneToast;
  if (toast) {
    toast.textContent = message;
    toast.classList.add('visible');
    setTimeout(() => toast.classList.remove('visible'), 2000);
  }
}
