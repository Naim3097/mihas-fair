import type { DialogueDef } from './types.js';

/**
 * The dialogue board: Tok Pustaka at his desk, one line, three numbered choices. The replies to choices 1 and 2 are
 * drafts; the shape (a tree of nodes with choices, each choice able to start a quest or tick an objective) is what
 * both runtimes implement.
 */
export const DIALOGUES: DialogueDef[] = [
  {
    key: 'pustakawan-intro',
    npc: 'pustakawan',
    start: 'salam',
    nodes: [
      {
        key: 'salam',
        speaker: 'pustakawan',
        line: { bm: 'Ilmu tidak pernah habis, hanya penanya yang berhenti.', en: 'Knowledge never runs out; only the pen stops.' },
        effect: { completeObjective: 'jejak-ilmu/pustakawan' },
        choices: [
          { text: { bm: 'Saya ingin tahu tentang tempat ini.', en: 'I want to know about this place.' }, next: 'tempat' },
          { text: { bm: 'Adakah anda tahu tentang manuskrip yang hilang?', en: 'Do you know about the lost manuscript?' }, next: 'manuskrip' },
          { text: { bm: 'Terima kasih.', en: 'Thank you.' }, next: null },
        ],
      },
      {
        key: 'tempat',
        speaker: 'pustakawan',
        line: {
          bm: 'Ceritera ialah perpustakaan yang tumbuh daripada sebuah buku terbuka. Setiap sayap ialah satu rak, dan setiap rak ialah satu cabang ilmu. Tatal, angkat, selak — dan kalau berkenan, bawa pulang.',
          en: 'Ceritera is a library that grew from an open book. Every wing is a shelf, and every shelf a branch of knowledge. Walk, lift, turn the pages — and if one speaks to you, take it home.',
        },
        next: 'salam',
      },
      {
        key: 'manuskrip',
        speaker: 'pustakawan',
        line: {
          bm: 'Ada satu naskhah hilang dari Ruang Manuskrip minggu lalu. Tulisan tangan, tiada nama. Kalau kau jumpa, bawa kepada saya — ia bukan untuk dijual.',
          en: 'A manuscript went missing from Ruang Manuskrip last week. Handwritten, unsigned. If you find it, bring it to me — it is not for sale.',
        },
        effect: { startQuest: 'suara-yang-hilang' },
        next: 'salam',
      },
    ],
    draft: true,
  },
];

export const dialogueByKey = (key: string): DialogueDef | undefined => DIALOGUES.find((d) => d.key === key);
