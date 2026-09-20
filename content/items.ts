import type { ItemDef } from './types.js';

/** The inventory board: twelve things in the grid, and the four equipment slots on the character board. */
export const ITEMS: ItemDef[] = [
  {
    key: 'kitab-nusantara',
    name: { bm: 'Kitab Nusantara', en: 'Kitab Nusantara' },
    kind: 'key',
    blurb: { bm: 'Catatan lama tentang zaman, orang, dan tempat yang telah hampir dilupakan.', en: 'Old notes on eras, people and places that were almost forgotten.' },
    quote: { bm: 'Yang lalu tidak hilang, ia menunggu untuk ditemui semula.', en: 'What is past is not lost; it waits to be found again.' },
    icon: 'item-kitab-nusantara',
  },
  { key: 'manuskrip-hilang', name: { bm: 'Manuskrip yang Hilang', en: 'The Lost Manuscript' }, kind: 'key', blurb: { bm: 'Tulisan tangan yang tiada siapa ingat menulisnya. Ia yang dicari Tok Pustaka.', en: 'Handwriting nobody remembers writing. The one Tok Pustaka is looking for.' }, draft: true },
  { key: 'buku-biru', name: { bm: 'Buku Biru', en: 'Blue Tome' }, kind: 'book', blurb: { bm: 'Sebuah buku bersampul biru dengan lambang bintang.', en: 'A blue-bound book with a star emblem.' }, draft: true },
  { key: 'pena-bulu', name: { bm: 'Pena Bulu', en: 'Quill' }, kind: 'item', blurb: { bm: 'Untuk menulis catatan dalam jurnal.', en: 'For writing notes in the journal.' }, usable: true, draft: true },
  { key: 'ramuan', name: { bm: 'Ramuan', en: 'Remedy' }, kind: 'item', blurb: { bm: 'Ramuan tabib dalam botol kaca kecil. Memulihkan ketahanan.', en: 'A healer\'s remedy in a small glass flask. Restores endurance.' }, usable: true, draft: true },
  { key: 'kompas', name: { bm: 'Kompas', en: 'Compass' }, kind: 'item', blurb: { bm: 'Kompas loyang dalam bekas bulat. Jarumnya menunjuk ke Dewan Ilmu.', en: 'A brass compass in a round tin. Its needle points to Dewan Ilmu.' }, draft: true },
  { key: 'kunci', name: { bm: 'Kunci', en: 'Key' }, kind: 'key', blurb: { bm: 'Kunci besi lama. Sesuatu di perpustakaan ini dikunci dengannya.', en: 'An old iron key. Something in this library is locked with it.' }, draft: true },
  { key: 'daun-ubat', name: { bm: 'Daun Ubat', en: 'Herb' }, kind: 'item', blurb: { bm: 'Sehelai daun dari Taman Ilmu. Tabib tahu gunanya.', en: 'A leaf from Taman Ilmu. A tabib knows its use.' }, usable: true, draft: true },
  { key: 'tanglung', name: { bm: 'Tanglung', en: 'Lantern' }, kind: 'item', blurb: { bm: 'Tanglung minyak. Menerangi lorong yang gelap.', en: 'An oil lantern. Lights the dark aisles.' }, usable: true, draft: true },
  { key: 'kitab-ilmu', name: { bm: 'Kitab Ilmu', en: 'Book of Knowledge' }, kind: 'book', blurb: { bm: 'Buku tebal berkulit gelap, penuh catatan tepi.', en: 'A thick dark-bound book, full of notes in the margins.' }, draft: true },
  { key: 'alat', name: { bm: 'Alat', en: 'Tool' }, kind: 'item', blurb: { bm: 'Alat kecil untuk membaiki rak dan membuka peti.', en: 'A small tool for mending shelves and opening chests.' }, draft: true },
  { key: 'peta-nusantara', name: { bm: 'Peta Nusantara', en: 'Nusantara Map' }, kind: 'key', blurb: { bm: 'Sekeping daripada lima. Bersama-sama, ia menunjukkan Nusantara seperti yang pernah dilukis.', en: 'One piece of five. Together they show the Nusantara as it was once drawn.' }, draft: true },
  { key: 'beg-sandang', name: { bm: 'Beg Sandang', en: 'Satchel' }, kind: 'equipment', slot: 'hand', blurb: { bm: 'Beg kulit sandang. Membawa lebih banyak buku.', en: 'A leather crossbody satchel. Carries more books.' }, draft: true },

  /* the four equipment slots on the character board, as the Ilmuwan wears them */
  { key: 'selendang', name: { bm: 'Selendang', en: 'Shawl' }, kind: 'equipment', slot: 'head', blurb: { bm: 'Selendang gelap bercorak di bahu.', en: 'A dark patterned shawl over the shoulders.' }, draft: true },
  { key: 'baju-linen', name: { bm: 'Baju Linen', en: 'Linen Shirt' }, kind: 'equipment', slot: 'body', blurb: { bm: 'Baju linen krim, lengan digulung.', en: 'A cream linen shirt, sleeves rolled.' }, draft: true },
  { key: 'samping', name: { bm: 'Samping', en: 'Samping' }, kind: 'equipment', slot: 'legs', blurb: { bm: 'Samping gelap bercorak di atas seluar longgar.', en: 'A dark patterned samping over loose trousers.' }, draft: true },
  { key: 'kasut-berbalut', name: { bm: 'Kasut Berbalut', en: 'Wrapped Boots' }, kind: 'equipment', slot: 'feet', blurb: { bm: 'Kasut kulit dengan tali berbalut hingga betis.', en: 'Leather boots with laces wrapped to the calf.' }, draft: true },
];

export const itemByKey = (key: string): ItemDef | undefined => ITEMS.find((i) => i.key === key);
