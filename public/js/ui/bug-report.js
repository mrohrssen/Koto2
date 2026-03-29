/**
 * Bug Report UI Module
 *
 * Allows users to attach screenshots and submit bug reports.
 */

import { apiUrl } from '../api.js';
import { dom } from '../dom.js';
import { store } from '../store.js';

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

/** Get current username */
function getUsername() {
  // Try to get from game state first
  const gameState = store.get('gameState') || {};
  if (gameState.player?.name) return gameState.player.name;

  // Fall back to stored user info
  const userStr = localStorage.getItem('user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      return user.username || 'anonymous';
    } catch {
      return 'anonymous';
    }
  }
  return 'anonymous';
}

/** Gather game context */
function gatherContext() {
  const gameState = store.get('gameState') || {};

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
    gameState: {
      phase: gameState.phase,
      floor: gameState.run?.floor,
      ward: gameState.run?.ward?.name,
      inCombat: !!gameState.combat
    }
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
      headers: { 'Content-Type': 'application/json' },
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
