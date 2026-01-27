/**
 * Bug Report UI Module
 *
 * Captures screenshots and submits bug reports to the server.
 */

import { dom } from '../dom.js';
import { store } from '../store.js';

const TESTER_KEY = 'bugReportTester';

let modal = null;
let nameInput = null;
let testerInput = null;
let noteInput = null;
let submitBtn = null;
let cancelBtn = null;
let reportBtn = null;

/** Initialize bug report UI */
export function init() {
  modal = document.getElementById('bug-report-modal');
  nameInput = document.getElementById('bug-report-name');
  testerInput = document.getElementById('bug-report-tester');
  noteInput = document.getElementById('bug-report-note');
  submitBtn = document.getElementById('bug-report-submit');
  cancelBtn = document.getElementById('bug-report-cancel');
  reportBtn = document.getElementById('bug-report-btn');

  if (!modal || !reportBtn) {
    console.warn('Bug report elements not found');
    return;
  }

  // Load saved tester name
  const savedTester = localStorage.getItem(TESTER_KEY);
  if (savedTester && testerInput) {
    testerInput.value = savedTester;
  }

  // Event listeners
  reportBtn.addEventListener('click', openModal);
  cancelBtn.addEventListener('click', closeModal);
  submitBtn.addEventListener('click', submitReport);

  // Close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
}

/** Open the bug report modal */
function openModal() {
  if (modal) {
    modal.classList.add('active');
    nameInput?.focus();
  }
}

/** Close the bug report modal */
function closeModal() {
  if (modal) {
    modal.classList.remove('active');
    // Clear form but keep tester name
    if (nameInput) nameInput.value = '';
    if (noteInput) noteInput.value = '';
  }
}

/** Capture screenshot using html2canvas */
async function captureScreenshot() {
  // Hide modal and bug button during capture
  const wasActive = modal?.classList.contains('active');
  modal?.classList.remove('active');
  reportBtn.style.display = 'none';

  // Small delay for DOM update
  await new Promise(r => setTimeout(r, 50));

  try {
    const canvas = await html2canvas(document.querySelector('.game-app'), {
      scale: window.devicePixelRatio || 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null
    });
    return canvas.toDataURL('image/png');
  } finally {
    // Restore UI
    reportBtn.style.display = '';
    if (wasActive) modal?.classList.add('active');
  }
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
  const name = nameInput?.value.trim();
  const tester = testerInput?.value.trim();
  const note = noteInput?.value.trim();

  if (!name) {
    nameInput?.focus();
    return;
  }

  // Save tester name for next time
  if (tester) {
    localStorage.setItem(TESTER_KEY, tester);
  }

  // Disable button during submission
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Capturing...';
  }

  try {
    const screenshot = await captureScreenshot();
    const context = gatherContext();

    const response = await fetch('/api/bug-report', {
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
