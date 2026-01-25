/**
 * Chip Drag Module - Long-press drag-and-drop reordering for chip slots
 *
 * Usage:
 *   import * as chipDrag from './chip-drag.js';
 *   chipDrag.init({ onReorder, isBlocked, getChipIds });
 *   // Call chipDrag.attach(chipRowElement) after each render
 */

import { playSFX } from '../audio.js';

// ============ CONFIGURATION ============
const LONG_PRESS_MS = 400;
const MOVE_THRESHOLD_PX = 10;
const LIFT_SCALE = 1.15;
const ANIMATION_MS = 150;

// ============ STATE ============
let enabled = true;
let onReorder = null;      // (chipIds: string[]) => void
let isBlocked = null;      // () => boolean
let getChipIds = null;     // () => (string|null)[]

// Drag state
let dragState = null;

let chipRowEl = null;
let slotEls = [];

// ============ INITIALIZATION ============

/**
 * Initialize chip drag module
 */
export function init(callbacks) {
  onReorder = callbacks.onReorder;
  isBlocked = callbacks.isBlocked;
  getChipIds = callbacks.getChipIds;

  // Global listeners for drag continuation/end
  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleEnd);
  document.addEventListener('touchmove', handleMove, { passive: false });
  document.addEventListener('touchend', handleEnd);
  document.addEventListener('touchcancel', handleCancel);
}

/**
 * Attach drag handlers to chip row (call after each render)
 */
export function attach(chipRow) {
  chipRowEl = chipRow;
  slotEls = Array.from(chipRow.querySelectorAll('.chip-slot'));

  slotEls.forEach((slot, index) => {
    slot.removeEventListener('mousedown', handleStart);
    slot.removeEventListener('touchstart', handleStart);

    if (!slot.querySelector('.chip-icon.empty')) {
      slot.addEventListener('mousedown', handleStart);
      slot.addEventListener('touchstart', handleStart, { passive: false });
    }
  });
}

/**
 * Enable or disable dragging globally
 */
export function setEnabled(isEnabled) {
  enabled = isEnabled;
  if (!isEnabled && dragState) {
    cancelDrag();
  }
}

// ============ EVENT HANDLERS ============

function handleStart(e) {
  if (!enabled || (isBlocked && isBlocked())) return;

  const slot = e.currentTarget;
  const index = parseInt(slot.dataset.index, 10);
  const chipIds = getChipIds ? getChipIds() : [];
  const chipId = chipIds[index];

  if (!chipId) return;

  const point = getEventPoint(e);

  dragState = {
    slotIndex: index,
    chipId,
    startX: point.x,
    startY: point.y,
    currentX: point.x,
    currentY: point.y,
    pressTimer: null,
    isDragging: false,
    draggedEl: null,
    placeholderIndex: index
  };

  dragState.pressTimer = setTimeout(() => {
    if (dragState) {
      startDrag();
    }
  }, LONG_PRESS_MS);
}

function handleMove(e) {
  if (!dragState) return;

  const point = getEventPoint(e);
  dragState.currentX = point.x;
  dragState.currentY = point.y;

  if (!dragState.isDragging) {
    const dx = point.x - dragState.startX;
    const dy = point.y - dragState.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > MOVE_THRESHOLD_PX) {
      cancelDrag();
    }
  } else {
    e.preventDefault();
    updateDragPosition();
    updatePlaceholder();
  }
}

function handleEnd(e) {
  if (!dragState) return;

  if (dragState.isDragging) {
    completeDrop();
  } else {
    cancelDrag();
  }
}

function handleCancel() {
  if (dragState) {
    cancelDrag();
  }
}

// ============ DRAG OPERATIONS ============

function startDrag() {
  if (!dragState || dragState.isDragging) return;

  dragState.isDragging = true;
  dragState.pressTimer = null;

  playSFX('chip-lift');

  const slot = slotEls[dragState.slotIndex];
  const icon = slot.querySelector('.chip-icon');

  dragState.draggedEl = icon.cloneNode(true);
  dragState.draggedEl.classList.add('chip-dragging');

  const rect = icon.getBoundingClientRect();
  dragState.draggedEl.style.position = 'fixed';
  dragState.draggedEl.style.left = `${rect.left}px`;
  dragState.draggedEl.style.top = `${rect.top}px`;
  dragState.draggedEl.style.width = `${rect.width}px`;
  dragState.draggedEl.style.height = `${rect.height}px`;
  dragState.draggedEl.style.zIndex = '1000';
  dragState.draggedEl.style.pointerEvents = 'none';
  dragState.draggedEl.style.transition = `transform ${ANIMATION_MS}ms ease-out, box-shadow ${ANIMATION_MS}ms ease-out`;

  document.body.appendChild(dragState.draggedEl);

  requestAnimationFrame(() => {
    if (dragState?.draggedEl) {
      dragState.draggedEl.style.transform = `scale(${LIFT_SCALE})`;
      dragState.draggedEl.style.boxShadow = '0 8px 24px rgba(0,0,0,0.4)';
    }
  });

  icon.style.opacity = '0';
  slot.classList.add('chip-slot-source');
}

function updateDragPosition() {
  if (!dragState?.draggedEl) return;

  const slot = slotEls[dragState.slotIndex];
  const icon = slot.querySelector('.chip-icon');
  const rect = icon.getBoundingClientRect();

  const dx = dragState.currentX - dragState.startX;
  const dy = dragState.currentY - dragState.startY;

  dragState.draggedEl.style.left = `${rect.left + dx}px`;
  dragState.draggedEl.style.top = `${rect.top + dy}px`;
}

function updatePlaceholder() {
  if (!dragState?.isDragging) return;

  const targetIndex = getSlotIndexAtPoint(dragState.currentX, dragState.currentY);

  if (targetIndex !== -1 && targetIndex !== dragState.placeholderIndex) {
    dragState.placeholderIndex = targetIndex;
    animateSlotPreview();
  }
}

function getSlotIndexAtPoint(x, y) {
  for (let i = 0; i < slotEls.length; i++) {
    const rect = slotEls[i].getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return i;
    }
  }

  let closest = -1;
  let closestDist = Infinity;
  for (let i = 0; i < slotEls.length; i++) {
    const rect = slotEls[i].getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const dist = Math.abs(x - centerX);
    if (dist < closestDist) {
      closestDist = dist;
      closest = i;
    }
  }
  return closest;
}

function animateSlotPreview() {
  slotEls.forEach((slot, i) => {
    const icon = slot.querySelector('.chip-icon');
    if (icon && i !== dragState.slotIndex) {
      icon.style.transition = `transform ${ANIMATION_MS}ms ease-out`;
      icon.style.transform = '';
    }
  });

  const fromIndex = dragState.slotIndex;
  const toIndex = dragState.placeholderIndex;

  if (fromIndex === toIndex) return;

  const direction = toIndex > fromIndex ? -1 : 1;
  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);

  for (let i = start; i <= end; i++) {
    if (i === fromIndex) continue;
    const slot = slotEls[i];
    const icon = slot.querySelector('.chip-icon');
    if (icon) {
      const slotWidth = slot.getBoundingClientRect().width + 8;
      const shiftDir = i < fromIndex ? 1 : -1;
      icon.style.transform = `translateX(${shiftDir * slotWidth * direction}px)`;
    }
  }
}

function completeDrop() {
  if (!dragState?.isDragging) return;

  const fromIndex = dragState.slotIndex;
  const toIndex = dragState.placeholderIndex;

  if (dragState.draggedEl) {
    const targetSlot = slotEls[toIndex];
    const targetRect = targetSlot.getBoundingClientRect();

    dragState.draggedEl.style.transition = `all ${ANIMATION_MS}ms ease-out`;
    dragState.draggedEl.style.left = `${targetRect.left}px`;
    dragState.draggedEl.style.top = `${targetRect.top}px`;
    dragState.draggedEl.style.transform = 'scale(1)';
    dragState.draggedEl.style.boxShadow = 'none';
  }

  const chipIds = getChipIds ? getChipIds() : [];
  const newOrder = reorderArray(chipIds, fromIndex, toIndex);

  setTimeout(() => {
    cleanup();

    if (onReorder && fromIndex !== toIndex) {
      onReorder(newOrder);
    }
  }, ANIMATION_MS);
}

function cancelDrag() {
  if (dragState?.pressTimer) {
    clearTimeout(dragState.pressTimer);
  }

  if (dragState?.isDragging && dragState.draggedEl) {
    const slot = slotEls[dragState.slotIndex];
    const rect = slot.querySelector('.chip-icon').getBoundingClientRect();

    dragState.draggedEl.style.transition = `all ${ANIMATION_MS}ms ease-out`;
    dragState.draggedEl.style.left = `${rect.left}px`;
    dragState.draggedEl.style.top = `${rect.top}px`;
    dragState.draggedEl.style.transform = 'scale(1)';
    dragState.draggedEl.style.boxShadow = 'none';

    setTimeout(cleanup, ANIMATION_MS);
  } else {
    cleanup();
  }
}

function cleanup() {
  if (dragState?.draggedEl) {
    dragState.draggedEl.remove();
  }

  slotEls.forEach((slot, i) => {
    const icon = slot.querySelector('.chip-icon');
    if (icon) {
      icon.style.opacity = '';
      icon.style.transform = '';
      icon.style.transition = '';
    }
    slot.classList.remove('chip-slot-source');
  });

  dragState = null;
}

// ============ UTILITIES ============

function getEventPoint(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  if (e.changedTouches && e.changedTouches.length > 0) {
    return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
}

function reorderArray(arr, fromIndex, toIndex) {
  const result = [...arr];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);
  return result;
}
