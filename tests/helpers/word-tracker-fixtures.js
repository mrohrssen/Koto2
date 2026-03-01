export const SCAFFOLD_STAGES = {
  FULL: 1,      // furigana + romaji + English (exposures 1-3)
  NO_ROMAJI: 2, // furigana + English (exposures 4-9)
  FURIGANA: 3,  // furigana only (exposures 10+)
  BARE: 4       // no annotations (future FSRS)
};

export const PHASES = {
  BOOTSTRAP: 'bootstrap',
  TRANSITION: 'transition',
  FULL_JAPANESE: 'full-japanese'
};

export const PHASE_THRESHOLDS = {
  TRANSITION_MIN_WORDS: 100,  // words at stage 2+ to enter transition
  FULL_JAPANESE_MIN_WORDS: 250 // words to enter full-japanese
};

export const SAMPLE_TRACKER = {
  userId: 'test-user-1',
  words: {
    '水': { exposures: 7, stage: 2, firstSeen: '2026-03-01', lastSeen: '2026-03-01' },
    '森': { exposures: 3, stage: 1, firstSeen: '2026-03-01', lastSeen: '2026-03-01' },
    '火': { exposures: 12, stage: 3, firstSeen: '2026-02-28', lastSeen: '2026-03-01' }
  },
  totalWordsIntroduced: 3,
  phase: 'bootstrap'
};
