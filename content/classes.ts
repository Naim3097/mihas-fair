import type { ClassDef } from './types.js';

/**
 * The six avatars on the board: Ilmuwan, Pendekar, Tabib, Pustakawan, Pengembara, Ahli Falak.
 * Every class's blurb, motto and costume are read straight off its character sheet (English verbatim, the BM a
 * working translation for the writer to sign off). Base stats sum to 6 for every class; growth patterns make
 * Ilmuwan match the character board (Level 3: Knowledge +2, Observation +1, Endurance +1, Curiosity +2).
 */
export const CLASSES: ClassDef[] = [
  {
    key: 'ilmuwan',
    name: 'Ilmuwan',
    title: { bm: 'Pencari', en: 'The Seeker' },
    blurb: {
      bm: 'Pencari ilmu yang rendah hati dari alam Melayu. Kau mengembara, membaca, belajar — dan melalui ilmu, kau temui tempatmu.',
      en: 'A humble seeker from the Malay world. You travel, you read, you learn — and through knowledge, you find your place.',
    },
    motto: { bm: 'Setiap ilmu membuka jalan yang baru.', en: 'Every knowledge opens a new path.' },
    perk: { bm: 'Setiap buku yang habis dibaca memberi lebih ilmu.', en: 'Every book finished gives more knowledge.' },
    look: [
      { bm: 'Rambut disanggul.', en: 'Hair in a bun.' },
      { bm: 'Baju linen krim, lengan digulung.', en: 'Cream linen shirt, sleeves rolled.' },
      { bm: 'Selendang gelap bercorak di bahu.', en: 'Dark patterned shawl over the shoulders.' },
      { bm: 'Samping gelap bercorak di pinggang, seluar longgar diikat di betis.', en: 'Dark patterned samping at the waist over loose trousers bound at the calves.' },
      { bm: 'Beg sandang kulit, gelang tangan, kasut kulit berbalut.', en: 'Leather crossbody satchel, wrist band, wrapped leather boots.' },
      { bm: 'Sebuah kitab kulit bertimbul di tangan.', en: 'An embossed leather book in hand.' },
    ],
    base: { knowledge: 2, observation: 1, endurance: 1, curiosity: 2 },
    growth: [['knowledge', 'curiosity', 'observation'], ['knowledge', 'curiosity', 'endurance']],
    portrait: 'avatar-ilmuwan',
  },
  {
    key: 'pendekar',
    name: 'Pendekar',
    title: { bm: 'Pengembara Jalanan', en: 'The Wanderer' },
    blurb: {
      bm: 'Berdisiplin pada tubuh. Dipandu oleh tujuan. Pengembara yang mencari ilmu melalui pengalaman.',
      en: 'Disciplined in body. Guided by purpose. A wanderer who seeks knowledge through experience.',
    },
    motto: { bm: 'Perjalanan menguatkan diri; ilmu menguatkan jiwa.', en: 'The journey builds the body, knowledge builds the soul.' },
    perk: { bm: 'Berlari lebih jauh sebelum penat.', en: 'Runs further before tiring.' },
    look: [
      { bm: 'Ikat kepala kain gelap bercorak, misai dan janggut nipis.', en: 'Dark patterned headwrap, light stubble.' },
      { bm: 'Baju gelap berlapis dengan tali kulit bersilang di dada.', en: 'Dark layered tunic with leather chest straps crossed at the back.' },
      { bm: 'Selempang bercorak tembaga di pinggang.', en: 'Copper-patterned sash at the waist.' },
      { bm: 'Pedang warisan bersarung, hulu berukir, tersisip di pinggang kiri.', en: 'A sheathed heirloom sword with an engraved hilt, worn at the left hip.' },
      { bm: 'Uncang kulit kecil di pinggang.', en: 'A small leather pouch at the belt.' },
      { bm: 'Pelindung lengan berukir, seluar longgar, kasut berbalut.', en: 'Engraved arm bracer, loose trousers, wrapped boots.' },
    ],
    base: { knowledge: 1, observation: 1, endurance: 3, curiosity: 1 },
    growth: [['endurance', 'observation', 'knowledge'], ['endurance', 'curiosity', 'observation']],
    portrait: 'avatar-pendekar',
  },
  {
    key: 'tabib',
    name: 'Tabib',
    title: { bm: 'Penyembuh', en: 'The Healer' },
    blurb: {
      bm: 'Belas kasihan dalam amalan. Penyembuh yang percaya ilmu ialah satu bentuk rahmat. Melalui alam, pemerhatian dan penjagaan, Tabib memulihkan keseimbangan.',
      en: 'Compassion in practice. A healer who believes knowledge is a form of mercy. Through nature, observation and care, the Tabib restores balance.',
    },
    motto: { bm: 'Merawat bukan sekadar menyembuhkan, tetapi memahami.', en: 'To heal is not only to cure, but to understand.' },
    perk: { bm: 'Mengenal herba dan ramuan di Taman Ilmu.', en: 'Knows the herbs and remedies of Taman Ilmu.' },
    look: [
      { bm: 'Kain kepala krim di atas sanggul, tocang panjang di belakang.', en: 'Cream head cloth over a bun, a long braid down the back.' },
      { bm: 'Baju linen putih; selendang hijau bercorak berjumbai di pinggang.', en: 'White linen shirt; a fringed, patterned green shawl at the waist.' },
      { bm: 'Tali kulit bersilang dengan kancing loyang; uncang herba dengan botol kecil.', en: 'Crossed leather strap with a brass buckle; a herbal pouch holding small vials.' },
      { bm: 'Loket gangsa bercorak daun.', en: 'A bronze pendant with a leaf motif.' },
      { bm: 'Herba dan alatan: gulungan kain, lesung dan alu, catatan lapangan.', en: 'Herbs and tools: a cloth roll, mortar and pestle, field notes.' },
      { bm: 'Balutan lengan; seluar longgar hijau gelap; kasut kulit berbalut.', en: 'Arm wrap; loose dark-green trousers; wrapped leather boots.' },
    ],
    base: { knowledge: 2, observation: 2, endurance: 1, curiosity: 1 },
    growth: [['knowledge', 'observation', 'endurance'], ['knowledge', 'curiosity', 'observation']],
    portrait: 'avatar-tabib',
  },
  {
    key: 'pustakawan',
    name: 'Pustakawan',
    title: { bm: 'Pengarkib', en: 'The Archivist' },
    blurb: {
      bm: 'Penjaga ilmu dan pemelihara cerita. Dia mengkatalog masa lalu, memelihara masa kini, dan membuka pintu ke dunia baharu.',
      en: 'A guardian of knowledge and keeper of stories. She catalogues the past, preserves the present, and opens doors to new worlds.',
    },
    motto: { bm: 'Setiap cerita mempunyai rumah. Tugas kita adalah menjaganya.', en: 'Every story has a home. Our duty is to keep it.' },
    perk: { bm: 'Terasa bilik tersembunyi yang berdekatan.', en: 'Senses hidden rooms nearby.' },
    look: [
      { bm: 'Selendang berhud hitam bercorak emas, dipakai menutup rambut.', en: 'A black hooded shawl with gold pattern, worn over the hair.' },
      { bm: 'Baju krim berlengan luas; skirt berlapis bercorak, berjumbai.', en: 'Cream wide-sleeved shirt; layered, patterned, fringed skirt.' },
      { bm: 'Tali kulit dengan kancing loyang; pelindung lengan kulit.', en: 'Leather strap with a brass buckle; leather bracers.' },
      { bm: 'Loket bintang kompas; beg sandang kulit; bekas skrol.', en: 'Compass-star pendant; leather satchel; scroll case.' },
      { bm: 'Sebuah kitab berkulit bertimbul dipeluk di dada.', en: 'An embossed leather-bound book held to the chest.' },
      { bm: 'Alatan: buku, skrol, dakwat dan pena, tanglung, astrolab.', en: 'Props: books, scrolls, inkwell and pen, lantern, astrolabe.' },
    ],
    base: { knowledge: 3, observation: 1, endurance: 1, curiosity: 1 },
    growth: [['knowledge', 'observation', 'curiosity'], ['knowledge', 'knowledge', 'endurance']],
    portrait: 'avatar-pustakawan',
  },
  {
    key: 'pengembara',
    name: 'Pengembara',
    title: { bm: 'Penjelajah', en: 'The Explorer' },
    blurb: {
      bm: 'Sentiasa mencari ufuk baharu. Penjelajah yang percaya dunia ialah sebuah kitab yang hidup, dan setiap perjalanan membuka bab yang baharu.',
      en: 'Always in search of new horizons. An explorer who believes the world is a living book, and every journey reveals a new chapter.',
    },
    motto: { bm: 'Jalan adalah guru yang paling jujur.', en: 'The road is the truest teacher.' },
    perk: { bm: 'Peta terbuka lebih awal; perjalanan pantas lebih murah.', en: 'The map reveals sooner; fast travel opens earlier.' },
    look: [
      { bm: 'Topi terendak anyaman lebar; selendang gelap di leher.', en: 'Wide conical woven hat; dark scarf at the neck.' },
      { bm: 'Baju linen krim berlengan gulung; kain bercorak berjumbai di pinggang.', en: 'Cream linen shirt with rolled sleeves; a patterned, fringed wrap at the waist.' },
      { bm: 'Tali kulit bersilang dengan kancing loyang; kompas di tali pinggang.', en: 'Crossed leather strap with a brass buckle; a compass on the belt.' },
      { bm: 'Beg galas penjelajah dengan gulungan tidur, labu air dan tanglung.', en: 'Explorer pack with a bedroll, water gourd and lantern.' },
      { bm: 'Tongkat perjalanan di tangan; beg sandang kulit.', en: 'A travel staff in hand; leather satchel.' },
      { bm: 'Alatan: peta dan jurnal, teropong; seluar longgar, kasut berbalut.', en: 'Props: map and journal, spyglass; loose trousers, wrapped boots.' },
    ],
    base: { knowledge: 1, observation: 1, endurance: 2, curiosity: 2 },
    growth: [['curiosity', 'endurance', 'observation'], ['curiosity', 'endurance', 'knowledge']],
    portrait: 'avatar-pengembara',
  },
  {
    key: 'ahli-falak',
    name: 'Ahli Falak',
    title: { bm: 'Pemerhati Bintang', en: 'The Stargazer' },
    blurb: {
      bm: 'Dia membaca langit untuk memahami tempat kita di dunia. Pencari corak, masa dan kemungkinan — menghubungkan ilmu, alam dan yang tidak kelihatan.',
      en: 'He reads the skies to understand our place in the world. A seeker of patterns, time, and possibilities — bridging knowledge, nature, and the unseen.',
    },
    motto: { bm: 'Bintang sentiasa ada, bahkan di saat kita tidak melihat.', en: 'The stars are always there, even when we cannot see them.' },
    perk: { bm: 'Menara Bintang terbuka lebih awal.', en: 'Menara Bintang opens earlier.' },
    look: [
      { bm: 'Kain kepala gelap dengan pin bintang; selendang gelap berlapis di leher.', en: 'Dark headwrap with a star pin; layered dark shawl at the neck.' },
      { bm: 'Jubah gelap bercorak buruj emas; lengan dalam krim bercorak.', en: 'Dark robe patterned with gold constellations; patterned cream inner sleeves.' },
      { bm: 'Loket astrolab gangsa; tali kulit bersilang.', en: 'Bronze astrolabe pendant; crossed leather strap.' },
      { bm: 'Tabung skrol peta bintang di belakang; pelindung lengan berukir bintang.', en: 'Star-map scroll tube on the back; bracer engraved with a star.' },
      { bm: 'Beg sandang kulit; seluar longgar gelap; kasut kulit bertali.', en: 'Leather satchel; loose dark trousers; laced leather boots.' },
      { bm: 'Alatan: astrolab, sekstan, skrol peta bintang, tanglung, buku falak.', en: 'Props: astrolabe, sextant, star map scroll, lantern, astronomy books.' },
    ],
    base: { knowledge: 1, observation: 3, endurance: 1, curiosity: 1 },
    growth: [['observation', 'knowledge', 'curiosity'], ['observation', 'curiosity', 'endurance']],
    portrait: 'avatar-ahli-falak',
  },
];

export const classByKey = (key: string): ClassDef | undefined => CLASSES.find((c) => c.key === key);
