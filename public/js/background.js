/**
 * @fileoverview Background System for ward/floor visual themes
 * @module public/js/background
 *
 * PURPOSE:
 * Manages background images based on game state - hub, floor exploration,
 * and enemy location-specific combat backgrounds. Includes prefetching
 * for smooth transitions.
 *
 * KEY EXPORTS:
 * - update(gameState) - Update background based on current game state
 * - reset() - Reset tracking for new runs
 * - prefetchFloor(floor) - Prefetch backgrounds for a floor
 * - prefetchLocations() - Prefetch all location backgrounds
 */

// ============ CONSTANTS ============

// All location types for enemy-specific backgrounds
const LOCATION_TYPES = [
  'residential', 'school', 'convenience', 'shopping',
  'restaurant', 'station', 'office', 'government', 'hospital'
];

// ============ STATE ============

let currentBackgroundKey = '';
let lastPrefetchedFloor = 0;
let locationBackgroundsPrefetched = false;

// DOM element reference (cached on first use)
let vnBackground = null;

function getVnBackground() {
  if (!vnBackground) {
    vnBackground = document.getElementById('vn-background');
  }
  return vnBackground;
}

// ============ UTILITY ============

/**
 * Simple hash for deterministic variant selection (enables caching)
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Apply background image to the VN stage
 */
function applyBackground(bgPath, key) {
  const bg = getVnBackground();
  if (!bg) return;

  currentBackgroundKey = key;
  bg.style.backgroundImage = `url('${bgPath}')`;
  bg.style.backgroundSize = 'cover';
  bg.style.backgroundPosition = 'center';
  console.log(`Background set to: ${bgPath}`);
}

// ============ PREFETCHING ============

/**
 * Prefetch backgrounds for a floor (call when entering new floor)
 */
export function prefetchFloor(floor) {
  if (floor === lastPrefetchedFloor || floor > 7) return;
  lastPrefetchedFloor = floor;

  // Prefetch all variants for this floor and next floor
  const floorsToPreload = [floor, Math.min(floor + 1, 7)];
  for (const f of floorsToPreload) {
    for (let v = 1; v <= 5; v++) {
      const img = new Image();
      img.src = `assets/backgrounds/floor${f}_${v}.webp`;
    }
  }
  console.log(`Prefetched backgrounds for floors ${floorsToPreload.join(', ')}`);
}

/**
 * Prefetch all location backgrounds (call once when starting a run)
 */
export function prefetchLocations() {
  if (locationBackgroundsPrefetched) return;
  locationBackgroundsPrefetched = true;

  for (const location of LOCATION_TYPES) {
    const img = new Image();
    img.src = `assets/backgrounds/locations/${location}.webp`;
  }
  console.log('Prefetched all location backgrounds');
}

// ============ CORE FUNCTIONS ============

/**
 * Update background based on current game state
 * @param {object} gameState - Current game state
 */
export function update(gameState) {
  if (!getVnBackground()) return;
  if (!gameState) return;

  // If not in a run, show hub background
  if (!gameState.run) {
    if (currentBackgroundKey !== 'hub') {
      applyBackground('assets/backgrounds/hub.webp', 'hub');
    }
    return;
  }

  // In combat - use enemy's location-specific background
  if (gameState.combat?.enemy) {
    const enemy = gameState.combat.enemy;
    // Use enemy's primary location, default to 'residential' if none specified
    const location = enemy.locations?.[0] || 'residential';
    const locationKey = `location-${location}`;

    // Only change if different from current
    if (locationKey !== currentBackgroundKey) {
      applyBackground(`assets/backgrounds/locations/${location}.webp`, locationKey);
    }
    return;
  }

  const floor = gameState.run.floor || 1;
  const currentRoom = gameState.run.currentRoom || 0;

  // Create a unique key for this room position
  const roomKey = `${floor}-${currentRoom}`;

  // Only change background if we've moved to a new room
  if (roomKey === currentBackgroundKey) return;

  // Prefetch next floor backgrounds when entering a new floor
  prefetchFloor(floor);

  // Pick a deterministic variant (1-5) based on floor+room for better caching
  const variant = (hashCode(roomKey) % 5) + 1;

  // Set the background image path
  // Backgrounds are named: floor{N}_{variant}.webp
  applyBackground(`assets/backgrounds/floor${floor}_${variant}.webp`, roomKey);
}

/**
 * Reset background tracking (for new runs)
 */
export function reset() {
  currentBackgroundKey = '';
  lastPrefetchedFloor = 0;
}

/**
 * Get current background key (for debugging)
 */
export function getCurrentKey() {
  return currentBackgroundKey;
}
