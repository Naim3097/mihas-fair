import type { AreaDef, NpcDef } from './types.js';

/**
 * The map on the world board: eight areas around Dewan Ilmu. Connections are read off the isometric map and are
 * a draft until the level design fixes them. `catalogue` lists the buku.my categories (bukku's district ids)
 * whose books fill each area's shelves.
 */
export const AREAS: AreaDef[] = [
  {
    key: 'dewan-ilmu',
    name: { bm: 'Dewan Ilmu', en: 'Central Hall' },
    kind: 'hall',
    floors: 2,
    blurb: { bm: 'Dewan besar di tengah perpustakaan: lantai marmar, rak setinggi tiga tingkat, dan bola falak emas di atas kepala.', en: 'The great hall at the heart of the library: marble floors, shelves three storeys high, a golden armillary sphere overhead.' },
    catalogue: ['hot-selling'],
    connections: ['timur-wing', 'barat-wing', 'ruang-manuskrip', 'taman-ilmu', 'ruang-tersembunyi'],
    fastTravel: true,
    spawn: true,
  },
  {
    key: 'timur-wing',
    name: { bm: 'Sayap Timur', en: 'Timur Wing' },
    kind: 'wing',
    sign: { bm: 'Sastera', en: 'Literature' },
    floors: 2,
    blurb: { bm: 'Sayap sastera: novel, puisi dan cerita di bawah cahaya pelita.', en: 'The literature wing: novels, poetry and stories under lantern light.' },
    catalogue: ['novel', 'novel-2'],
    connections: ['dewan-ilmu', 'menara-bintang'],
    fastTravel: true,
    draft: true,
  },
  {
    key: 'barat-wing',
    name: { bm: 'Sayap Barat', en: 'Barat Wing' },
    kind: 'wing',
    sign: { bm: 'Sejarah', en: 'History' },
    floors: 2,
    blurb: { bm: 'Sayap sejarah: warisan, kemerdekaan dan peta lama di sebalik tembok tua.', en: 'The history wing: heritage, independence and old maps behind old walls.' },
    catalogue: ['sejarah-1', 'merdeka'],
    connections: ['dewan-ilmu', 'arsip-diraja'],
    fastTravel: true,
    draft: true,
  },
  {
    key: 'ruang-manuskrip',
    name: { bm: 'Ruang Manuskrip', en: 'Ruang Manuskrip' },
    kind: 'room',
    sign: { bm: 'Agama & Manuskrip', en: 'Faith & Manuscripts' },
    floors: 1,
    blurb: { bm: 'Bilik senyap tempat manuskrip lama dijaga: agama, sirah dan tulisan tangan yang hampir hilang.', en: 'A quiet room where old manuscripts are kept: faith, sirah, and handwriting almost lost.' },
    catalogue: ['agama-1', 'sirah'],
    connections: ['dewan-ilmu', 'menara-bintang'],
    fastTravel: true,
    draft: true,
  },
  {
    key: 'taman-ilmu',
    name: { bm: 'Taman Ilmu', en: 'Taman Ilmu' },
    kind: 'garden',
    floors: 1,
    blurb: { bm: 'Taman ilmu yang tenang, di mana alam dan pengetahuan bertemu.', en: 'A calm garden of knowledge, where nature and learning meet.' },
    catalogue: ['komik-kanak-kanak', 'iqra', 'umum-1'],
    connections: ['dewan-ilmu'],
    fastTravel: true,
  },
  {
    key: 'menara-bintang',
    name: { bm: 'Menara Bintang', en: 'Menara Bintang' },
    kind: 'tower',
    sign: { bm: 'Sains', en: 'Science' },
    floors: 3,
    blurb: { bm: 'Menara cerapan di atas perpustakaan: sains, falak dan langit malam.', en: 'The observation tower above the library: science, astronomy and the night sky.' },
    catalogue: ['sains', 'bisnes', 'kewangan'],
    connections: ['timur-wing', 'ruang-manuskrip'],
    fastTravel: true,
    draft: true,
  },
  {
    key: 'arsip-diraja',
    name: { bm: 'Arsip Diraja', en: 'Arsip Diraja' },
    kind: 'archive',
    floors: 1,
    blurb: { bm: 'Arkib yang berkunci. Naskhah jarang dan tempahan awal, untuk mereka yang sudah membuktikan diri.', en: 'The locked archive. Rare volumes and pre-orders, for those who have proven themselves.' },
    catalogue: ['pre-order'],
    connections: ['barat-wing'],
    fastTravel: true,
    locked: 'story',
    draft: true,
  },
  {
    key: 'ruang-tersembunyi',
    name: { bm: 'Ruang Tersembunyi', en: 'Ruang Tersembunyi' },
    kind: 'hidden',
    floors: 1,
    blurb: { bm: 'Bilik yang tiada pada peta. Ditemui, bukan ditunjukkan.', en: 'A room that is not on the map. Found, not shown.' },
    catalogue: [],
    connections: ['dewan-ilmu'],
    fastTravel: false,
    hidden: true,
    draft: true,
  },
];

/** The people of the library. Pustakawan is bukku's Tok Pustaka; the four scholars are the "Empat Cendekia" quest. */
export const NPCS: NpcDef[] = [
  { key: 'pustakawan', name: 'Tok Pustaka', title: { bm: 'Pustakawan', en: 'The Librarian' }, area: 'dewan-ilmu', blurb: { bm: 'Penjaga rak-rak ini, di mejanya di Dewan Ilmu.', en: 'Keeper of these shelves, at his desk in Dewan Ilmu.' } },
  { key: 'cendekia-sejarah', name: 'Cendekia Sejarah', title: { bm: 'Cendekia', en: 'Scholar of History' }, area: 'barat-wing', blurb: { bm: 'Yang mengingati apa yang orang lain lupa.', en: 'The one who remembers what others forget.' }, draft: true },
  { key: 'cendekia-sains', name: 'Cendekia Sains', title: { bm: 'Cendekia', en: 'Scholar of Science' }, area: 'menara-bintang', blurb: { bm: 'Yang bertanya sebelum percaya.', en: 'The one who asks before believing.' }, draft: true },
  { key: 'cendekia-sastera', name: 'Cendekia Sastera', title: { bm: 'Cendekia', en: 'Scholar of Literature' }, area: 'timur-wing', blurb: { bm: 'Yang tahu setiap cerita ada pembacanya.', en: 'The one who knows every story finds its reader.' }, draft: true },
  { key: 'cendekia-manuskrip', name: 'Cendekia Manuskrip', title: { bm: 'Cendekia', en: 'Scholar of Manuscripts' }, area: 'ruang-manuskrip', blurb: { bm: 'Yang menjaga tulisan yang hampir hilang.', en: 'The one who keeps the writing almost lost.' }, draft: true },
];

export const areaByKey = (key: string): AreaDef | undefined => AREAS.find((a) => a.key === key);
export const npcByKey = (key: string): NpcDef | undefined => NPCS.find((n) => n.key === key);
