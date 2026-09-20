import type { QuestDef } from './types.js';

/** The journal board: four main quests. Jejak Ilmu's three objectives are the ones on the HUD. */
export const QUESTS: QuestDef[] = [
  {
    key: 'jejak-ilmu',
    kind: 'main',
    name: { bm: 'Jejak Ilmu', en: 'Jejak Ilmu' },
    summary: { bm: 'Teroka Dewan Ilmu', en: 'Explore the Central Hall' },
    blurb: { bm: 'Perpustakaan ini menyimpan banyak rahsia. Teroka Dewan Ilmu dan pelajari caranya.', en: 'The library holds many secrets. Explore the Central Hall and learn its ways.' },
    objectives: [
      { key: 'sayap-timur', text: { bm: 'Cari Sayap Timur', en: 'Find the Eastern Wing' }, kind: 'enter-area', target: 'timur-wing' },
      { key: 'pustakawan', text: { bm: 'Bercakap dengan Pustakawan', en: 'Talk to the Librarian' }, kind: 'talk', target: 'pustakawan' },
      { key: 'bilik-tersembunyi', text: { bm: 'Temui bilik tersembunyi', en: 'Discover a Hidden Room' }, kind: 'discover-area', target: 'ruang-tersembunyi' },
    ],
    xp: 300,
  },
  {
    key: 'suara-yang-hilang',
    kind: 'main',
    name: { bm: 'Suara yang Hilang', en: 'Suara yang Hilang' },
    summary: { bm: 'Cari manuskrip yang hilang', en: 'Find the Lost Manuscript' },
    blurb: { bm: 'Sebuah manuskrip hilang dari Ruang Manuskrip. Tok Pustaka percaya ia masih di dalam perpustakaan.', en: 'A manuscript has gone missing from Ruang Manuskrip. Tok Pustaka believes it is still inside the library.' },
    objectives: [
      { key: 'ruang-manuskrip', text: { bm: 'Pergi ke Ruang Manuskrip', en: 'Go to Ruang Manuskrip' }, kind: 'enter-area', target: 'ruang-manuskrip' },
      { key: 'manuskrip', text: { bm: 'Temui manuskrip yang hilang', en: 'Find the lost manuscript' }, kind: 'find-item', target: 'manuskrip-hilang' },
      { key: 'pulang', text: { bm: 'Bawa kembali kepada Tok Pustaka', en: 'Bring it back to Tok Pustaka' }, kind: 'talk', target: 'pustakawan' },
    ],
    ordered: true,
    xp: 600,
    draft: true,
  },
  {
    key: 'peta-nusantara',
    kind: 'main',
    name: { bm: 'Peta Nusantara', en: 'Peta Nusantara' },
    summary: { bm: 'Kumpul peta (0/5)', en: 'Collect the Maps (0/5)' },
    blurb: { bm: 'Lima keping peta lama tersebar di seluruh perpustakaan. Bersama-sama, ia menunjukkan Nusantara seperti yang pernah dilukis.', en: 'Five pieces of an old map are scattered through the library. Together they show the Nusantara as it was once drawn.' },
    objectives: [{ key: 'peta', text: { bm: 'Kumpul kepingan Peta Nusantara', en: 'Collect the pieces of the Nusantara Map' }, kind: 'collect', target: 'peta-nusantara', count: 5 }],
    xp: 800,
    draft: true,
  },
  {
    key: 'empat-cendekia',
    kind: 'main',
    name: { bm: 'Empat Cendekia', en: 'Empat Cendekia' },
    summary: { bm: 'Temui empat cendekia', en: 'Meet the Four Scholars' },
    blurb: { bm: 'Empat cendekia menjaga empat sayap perpustakaan. Setiap seorang ada satu pelajaran, dan satu kunci.', en: 'Four scholars keep the four wings of the library. Each has one lesson, and one key.' },
    objectives: [
      { key: 'sejarah', text: { bm: 'Temui Cendekia Sejarah', en: 'Meet the Scholar of History' }, kind: 'meet', target: 'cendekia-sejarah' },
      { key: 'sains', text: { bm: 'Temui Cendekia Sains', en: 'Meet the Scholar of Science' }, kind: 'meet', target: 'cendekia-sains' },
      { key: 'sastera', text: { bm: 'Temui Cendekia Sastera', en: 'Meet the Scholar of Literature' }, kind: 'meet', target: 'cendekia-sastera' },
      { key: 'manuskrip', text: { bm: 'Temui Cendekia Manuskrip', en: 'Meet the Scholar of Manuscripts' }, kind: 'meet', target: 'cendekia-manuskrip' },
    ],
    xp: 1000,
    draft: true,
  },
];

export const questByKey = (key: string): QuestDef | undefined => QUESTS.find((q) => q.key === key);
