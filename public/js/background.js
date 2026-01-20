/**
 * Background module - handles ward/floor background images
 *
 * Manages background image updates based on game state:
 * - Hub background when not in a run
 * - Location-specific backgrounds during combat (based on enemy location)
 * - Floor-variant backgrounds during exploration
 * - Prefetching for smooth transitions
 */

// Module state
let vnBackground = null;
let gameState = null;
let currentBackgroundKey = '';
let lastPrefetchedFloor = 0;
let locationBackgroundsPrefetched = false;

// All location types for enemy-specific backgrounds
const LOCATION_TYPES = ['residential', 'school', 'convenience', 'shopping', 'restaurant', 'station', 'office', 'government', 'hospital'];

/**
 * Initialize the background module with DOM element and state getter
 * @param {HTMLElement} bgElement - The vn-background DOM element
 * @param {Function} stateGetter - Function that returns current gameState
 */
export function init(bgElement, stateGetter) {
  vnBackground = bgElement;
  gameState = stateGetter;
}

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
 * Prefetch backgrounds for a floor (call when entering new floor)
 */
export function prefetchFloorBackgrounds(floor) {
  if (floor === lastPrefetchedFloor || floor > 7) return;
  lastPrefetchedFloor = floor;

  // Prefetch all variants for this floor and next floor
  const floorsToPreload = [floor, Math.min(floor + 1, 7)];
  for (const f of floorsToPreload) {
    for (let v = 1; v <= 5; v++) {
      const img = new Image();
      img.src = `assets/backgrounds/floor${f}_${v}.png`;
    }
  }
  console.log(`Prefetched backgrounds for floors ${floorsToPreload.join(', ')}`);
}

/**
 * Prefetch all location backgrounds (call once when starting a run)
 */
export function prefetchLocationBackgrounds() {
  if (locationBackgroundsPrefetched) return;
  locationBackgroundsPrefetched = true;

  for (const location of LOCATION_TYPES) {
    const img = new Image();
    img.src = `assets/backgrounds/locations/${location}.png`;
  }
  console.log('Prefetched all location backgrounds');
}

/**
 * Update background based on current floor with deterministic variant
 */
export function updateBackground() {
  if (!vnBackground) return;

  const state = typeof gameState === 'function' ? gameState() : gameState;
  if (!state) return;

  // If not in a run, show hub background
  if (!state.run) {
    if (currentBackgroundKey !== 'hub') {
      currentBackgroundKey = 'hub';
      vnBackground.style.backgroundImage = `url('assets/backgrounds/hub.png')`;
      vnBackground.style.backgroundSize = 'cover';
      vnBackground.style.backgroundPosition = 'center';
      console.log('Background set to: hub');
    }
    return;
  }

  // In combat - use enemy's location-specific background
  if (state.combat?.enemy) {
    const enemy = state.combat.enemy;
    // Use enemy's primary location, default to 'residential' if none specified
    const location = enemy.locations?.[0] || 'residential';
    const locationKey = `location-${location}`;

    // Only change if different from current
    if (locationKey !== currentBackgroundKey) {
      currentBackgroundKey = locationKey;
      const bgPath = `assets/backgrounds/locations/${location}.png`;
      vnBackground.style.backgroundImage = `url('${bgPath}')`;
      vnBackground.style.backgroundSize = 'cover';
      vnBackground.style.backgroundPosition = 'center';
      console.log(`Background set to: ${bgPath} (enemy location: ${location})`);
    }
    return;
  }

  const floor = state.run.floor || 1;
  const currentRoom = state.run.currentRoom || 0;

  // Create a unique key for this room position
  const roomKey = `${floor}-${currentRoom}`;

  // Only change background if we've moved to a new room
  if (roomKey === currentBackgroundKey) return;
  currentBackgroundKey = roomKey;

  // Prefetch next floor backgrounds when entering a new floor
  prefetchFloorBackgrounds(floor);

  // Pick a deterministic variant (1-5) based on floor+room for better caching
  const variant = (hashCode(roomKey) % 5) + 1;

  // Set the background image path
  // Backgrounds are named: floor{N}_{variant}.png
  const bgPath = `assets/backgrounds/floor${floor}_${variant}.png`;

  vnBackground.style.backgroundImage = `url('${bgPath}')`;
  vnBackground.style.backgroundSize = 'cover';
  vnBackground.style.backgroundPosition = 'center';

  console.log(`Background set to: ${bgPath}`);
}

/**
 * Reset background tracking (for new runs)
 */
export function resetBackground() {
  currentBackgroundKey = '';
  lastPrefetchedFloor = 0;
}
