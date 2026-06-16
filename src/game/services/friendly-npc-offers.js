import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ITEMS_PATH = join(__dirname, '../../../data/items.json');

/**
 * Roll 3 item offers for a friendly NPC room.
 * @param {'food'|'equipment'} category - Legacy category hint; friendly NPCs now offer equipment only
 * @param {string[]|null} areaIds - Area IDs the player has reached (cumulative); null disables filtering
 * @param {Array} [itemPool] - Optional override item pool (defaults to data/items.json)
 * @returns {Array} Up to 3 item objects matching the category
 */
export function rollFriendlyNpcOffers(category, areaIds = null, itemPool = null) {
  if (!itemPool) {
    try {
      itemPool = JSON.parse(readFileSync(DEFAULT_ITEMS_PATH, 'utf8'));
    } catch (e) {
      itemPool = [];
    }
  }

  const offerCategory = 'equipment';

  // Filter by category and area progression
  const eligible = itemPool.filter(item =>
    item.category === offerCategory &&
    (!areaIds || !item.area || areaIds.includes(item.area))
  );

  // Randomly select up to 3 without duplicates
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3).map(item => ({ ...item }));
}
