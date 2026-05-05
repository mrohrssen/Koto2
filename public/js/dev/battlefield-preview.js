const LOCAL_PREVIEW_HOSTS = new Set(['localhost', '127.0.0.1']);

const PREVIEW_CREATURES = [
  {
    id: 'hi',
    name: '火',
    nameEn: 'Fire',
    element: 'fire',
    baseReading: 'ひ',
    moveId: 'honoo',
  },
  {
    id: 'mizu',
    name: '水',
    nameEn: 'Water',
    element: 'water',
    baseReading: 'みず',
    moveId: 'nagasu',
  },
  {
    id: 'ki',
    name: '木',
    nameEn: 'Tree',
    element: 'wood',
    baseReading: 'き',
    moveId: 'sasu',
  },
];

function createPreviewCreature(template, side) {
  const hp = side === 'ally' ? 64 : 58;
  return {
    id: template.id,
    uid: `preview-${side}-${template.id}`,
    name: template.name,
    nameEn: template.nameEn,
    element: template.element,
    rarity: 'common',
    level: 5,
    hp,
    currentHp: hp,
    maxHp: hp,
    mp: 30,
    currentMp: 30,
    maxMp: 30,
    attack: 18,
    defense: 6,
    baseReading: template.baseReading,
    moves: [
      {
        id: template.moveId,
        name: template.name,
        nameEn: `${template.nameEn} Strike`,
        element: template.element,
        target: 'single_enemy',
        mpCost: 0,
      },
    ],
    activeEffects: [],
    statStages: {},
  };
}

export function isLocalPreviewHost(hostname = '') {
  return LOCAL_PREVIEW_HOSTS.has(hostname);
}

export function createBattlefieldPreviewState({ areaId = 'starter_meadow' } = {}) {
  const allies = PREVIEW_CREATURES.map(template => createPreviewCreature(template, 'ally'));
  const enemies = PREVIEW_CREATURES.map(template => createPreviewCreature(template, 'enemy'));
  const currentArea = {
    id: areaId,
    parallaxId: areaId,
    name: '始まりの草原',
    nameEn: 'Starting Meadow',
    description: 'A bright, open meadow where new adventurers begin their journey.',
  };

  return {
    phase: 'combat',
    player: { name: 'Preview', hp: 100, maxHp: 100, credits: 0 },
    meta: {},
    run: {
      active: true,
      currentArea,
      areaPath: [areaId],
      background: null,
      creatureParty: {
        active: allies,
        reserves: [],
        maxTotal: 6,
      },
      currentRoom: 0,
      rooms: [],
      partySkills: [],
      itemBuffs: {
        attackMult: 1,
        hpMult: 1,
        elementEdge: 0,
      },
    },
    combat: {
      allies,
      enemies,
      enemy: enemies[0],
      isBoss: false,
      round: 1,
      currentTurn: 'player',
      npcData: null,
    },
  };
}

export function registerBattlefieldPreview({
  windowObj = globalThis.window,
  updateGameState,
  renderBattlefieldPreview,
  autoStartFromUrl = true,
} = {}) {
  if (!windowObj || !isLocalPreviewHost(windowObj.location?.hostname)) return false;

  const start3v3Battlefield = async (options = {}) => {
    const state = createBattlefieldPreviewState(options);
    updateGameState?.(state);
    await renderBattlefieldPreview?.(state);
    return state;
  };

  windowObj.__kotoPreview = {
    ...(windowObj.__kotoPreview || {}),
    start3v3Battlefield,
  };

  if (autoStartFromUrl && windowObj.location?.search) {
    const params = new URLSearchParams(windowObj.location.search);
    const areaId = params.get('devBattlefieldPreview');
    if (areaId) {
      setTimeout(() => {
        start3v3Battlefield({ areaId }).catch(err => {
          console.error('[battlefield-preview] failed to start', err);
        });
      }, 0);
    }
  }

  return true;
}
