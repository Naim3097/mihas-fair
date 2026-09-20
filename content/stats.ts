import type { StatDef } from './types.js';

/** The four stats on the character board: Knowledge, Observation, Endurance, Curiosity. */
export const STATS: StatDef[] = [
  { key: 'knowledge', name: { bm: 'Ilmu', en: 'Knowledge' }, blurb: { bm: 'Apa yang kau faham daripada apa yang kau baca.', en: 'What you understand of what you read.' } },
  { key: 'observation', name: { bm: 'Pemerhatian', en: 'Observation' }, blurb: { bm: 'Apa yang kau perasan sebelum orang lain.', en: 'What you notice before anyone else.' } },
  { key: 'endurance', name: { bm: 'Ketahanan', en: 'Endurance' }, blurb: { bm: 'Sejauh mana kau boleh berjalan dan memanjat.', en: 'How far you can walk and climb.' } },
  { key: 'curiosity', name: { bm: 'Rasa Ingin Tahu', en: 'Curiosity' }, blurb: { bm: 'Pintu mana yang kau cuba buka.', en: 'Which doors you try.' } },
];
