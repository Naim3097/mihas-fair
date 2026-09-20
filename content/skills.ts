import type { ClassKey, SkillDef, SkillSlot } from './types.js';

/**
 * Four skills a class: Q and W are the bread and butter, E is the escape or the stance, R is the ultimate and
 * spends the Ilham bar. Every kit has one way to close or open distance and one moment that is unmistakably
 * superhuman. Names are the skill's own (BM first); the English is the writer's to sign off.
 */
export const SKILLS: SkillDef[] = [
  /* Ilmuwan — the seeker: pages, steps, chapters, and the book that slows the world. */
  { key: 'ilmuwan-q', cls: 'ilmuwan', slot: 'q', name: { bm: 'Lembaran Tajam', en: 'Sharp Pages' }, blurb: { bm: 'Tiga helai muka surat meluncur ke hadapan seperti bilah.', en: 'Three pages fly forward like blades.' },
    windup: 0.15, recovery: 0.25, cooldown: 2.5, cost: 12, anim: 'cast',
    effects: [{ kind: 'projectile', amount: 14, speed: 22, range: 14, radius: 0.5, count: 3, spread: 18 }] },
  { key: 'ilmuwan-w', cls: 'ilmuwan', slot: 'w', name: { bm: 'Langkah Ilmu', en: 'Step of Knowledge' }, blurb: { bm: 'Melangkah menembusi apa sahaja di hadapan; tidak boleh disentuh sepanjang langkah itu.', en: 'Step straight through whatever stands ahead; untouchable for the length of the step.' },
    windup: 0, recovery: 0.1, cooldown: 6, cost: 18, anim: 'dodge', mobile: true,
    effects: [{ kind: 'dash', distance: 6, duration: 0.18, invulnerable: true, through: true }] },
  { key: 'ilmuwan-e', cls: 'ilmuwan', slot: 'e', name: { bm: 'Bab Baru', en: 'New Chapter' }, blurb: { bm: 'Membuka lembaran baharu: pulih sedikit, bergerak lebih pantas, dan nyawa kembali lebih cepat seketika.', en: 'Turn a new page: heal a little, move faster, and recover faster for a while.' },
    windup: 0.3, recovery: 0.3, cooldown: 12, cost: 25, anim: 'cast',
    effects: [{ kind: 'heal', amount: 25, shape: { kind: 'self', range: 0 } }, { kind: 'buff', stat: 'regen', mult: 3, duration: 6 }, { kind: 'buff', stat: 'speed', mult: 1.25, duration: 6 }] },
  { key: 'ilmuwan-r', cls: 'ilmuwan', slot: 'r', name: { bm: 'Ensiklopedia', en: 'Encyclopedia' }, blurb: { bm: 'Dunia perlahan; kau tidak. Lima saat, dan setiap serangan lebih berat.', en: 'The world slows; you do not. Five seconds, and every blow lands heavier.' },
    windup: 0.5, recovery: 0.2, cooldown: 0, cost: 0, ultimate: true, anim: 'cast-heavy',
    effects: [{ kind: 'slow-time', factor: 0.3, duration: 5 }, { kind: 'buff', stat: 'damage', mult: 1.5, duration: 5 }] },

  /* Pendekar — the wanderer: fists, a tiger's leap, the stance, and the ground itself. */
  { key: 'pendekar-q', cls: 'pendekar', slot: 'q', name: { bm: 'Tumbuk Berganda', en: 'Twin Strike' }, blurb: { bm: 'Dua tumbukan berat dalam satu nafas; yang kena, terpelanting.', en: 'Two heavy blows in one breath; whatever they hit is thrown back.' },
    windup: 0.2, recovery: 0.35, cooldown: 4, cost: 14, anim: 'attack-2',
    effects: [{ kind: 'damage', amount: 34, shape: { kind: 'arc', range: 2.4, angle: 110 }, knockback: 6, stagger: 0.5 }] },
  { key: 'pendekar-w', cls: 'pendekar', slot: 'w', name: { bm: 'Lompat Harimau', en: 'Tiger Leap' }, blurb: { bm: 'Lompatan lapan meter yang mendarat sebagai hentaman.', en: 'An eight-metre leap that lands as a blow.' },
    windup: 0.1, recovery: 0.2, cooldown: 8, cost: 20, anim: 'jump', mobile: true,
    effects: [{ kind: 'leap', distance: 8, height: 3, land: { amount: 28, radius: 3, knockback: 6, stagger: 0.4 } }] },
  { key: 'pendekar-e', cls: 'pendekar', slot: 'e', name: { bm: 'Kuda-kuda', en: 'The Stance' }, blurb: { bm: 'Berdiri teguh: serangan yang tiba hampir tidak terasa, dan dibalas.', en: 'Stand firm: blows that land barely register, and are answered.' },
    windup: 0, recovery: 0.1, cooldown: 9, cost: 15, anim: 'block',
    effects: [{ kind: 'stance', duration: 1.6, reduction: 0.8, counter: 40 }] },
  { key: 'pendekar-r', cls: 'pendekar', slot: 'r', name: { bm: 'Gelombang Bumi', en: 'Earth Wave' }, blurb: { bm: 'Satu hentakan; lantai dewan bergelombang dan semua di sekeliling terangkat.', en: 'One stamp; the hall floor rolls and everything around is thrown into the air.' },
    windup: 0.6, recovery: 0.5, cooldown: 0, cost: 0, ultimate: true, anim: 'slam',
    effects: [{ kind: 'damage', amount: 90, shape: { kind: 'circle', range: 7 }, knockback: 10, up: 9, stagger: 1.2 }] },

  /* Tabib — the healer: thorns, mist, the wind, and mercy. */
  { key: 'tabib-q', cls: 'tabib', slot: 'q', name: { bm: 'Duri Hutan', en: 'Forest Thorns' }, blurb: { bm: 'Sebaris duri menjalar ke hadapan; yang tercucuk jadi perlahan.', en: 'A line of thorns runs forward; whatever they prick is slowed.' },
    windup: 0.2, recovery: 0.3, cooldown: 3.5, cost: 12, anim: 'cast',
    effects: [{ kind: 'damage', amount: 26, shape: { kind: 'line', range: 9, width: 2 }, stagger: 0.3, slow: 0.5, slowFor: 2.5 }] },
  { key: 'tabib-w', cls: 'tabib', slot: 'w', name: { bm: 'Uap Herba', en: 'Herbal Mist' }, blurb: { bm: 'Kabus ramuan: memulihkan kawan, meracuni lawan, tiga hembusan.', en: 'A mist of remedies: heals friends, poisons foes, three breaths long.' },
    windup: 0.3, recovery: 0.4, cooldown: 10, cost: 22, anim: 'cast',
    effects: [{ kind: 'heal', amount: 30, shape: { kind: 'circle', range: 5 } }, { kind: 'damage', amount: 14, shape: { kind: 'circle', range: 5 }, repeat: 3, every: 0.6 }] },
  { key: 'tabib-e', cls: 'tabib', slot: 'e', name: { bm: 'Langkah Angin', en: 'Wind Step' }, blurb: { bm: 'Berundur sepantas angin, lalu bergerak lebih laju seketika.', en: 'Fall back as fast as the wind, then move quicker for a while.' },
    windup: 0, recovery: 0.1, cooldown: 7, cost: 14, anim: 'dodge', mobile: true,
    effects: [{ kind: 'dash', distance: 5, duration: 0.22, invulnerable: true, back: true }, { kind: 'buff', stat: 'speed', mult: 1.3, duration: 4 }] },
  { key: 'tabib-r', cls: 'tabib', slot: 'r', name: { bm: 'Rahmat', en: 'Mercy' }, blurb: { bm: 'Pulih sepenuhnya, dilindungi, dan lawan di sekeliling terhenti seketika.', en: 'Fully healed, shielded, and every foe around you stops for a moment.' },
    windup: 0.6, recovery: 0.4, cooldown: 0, cost: 0, ultimate: true, anim: 'cast-heavy',
    effects: [{ kind: 'heal', amount: 999, shape: { kind: 'self', range: 0 } }, { kind: 'shield', amount: 60, duration: 8 }, { kind: 'buff', stat: 'regen', mult: 4, duration: 8 }, { kind: 'damage', amount: 20, shape: { kind: 'circle', range: 6 }, stagger: 1.0 }] },

  /* Pustakawan — the archivist: the catalogue, the shelves, a closed chapter, the index of everything. */
  { key: 'pustakawan-q', cls: 'pustakawan', slot: 'q', name: { bm: 'Katalog', en: 'Catalogue' }, blurb: { bm: 'Menanda sasaran: yang bertanda menerima lebih banyak kesakitan.', en: 'Marks a target: the marked take more of everything.' },
    windup: 0.15, recovery: 0.2, cooldown: 3, cost: 10, anim: 'cast',
    effects: [{ kind: 'projectile', amount: 16, speed: 26, range: 16, radius: 0.5, mark: 0.4, markFor: 6 }] },
  { key: 'pustakawan-w', cls: 'pustakawan', slot: 'w', name: { bm: 'Rak Berputar', en: 'Spinning Shelves' }, blurb: { bm: 'Buku-buku mengelilingi kau selama empat saat, memukul apa sahaja yang mendekat.', en: 'Books orbit you for four seconds, striking whatever comes close.' },
    windup: 0.2, recovery: 0.1, cooldown: 11, cost: 24, anim: 'cast', mobile: true,
    effects: [{ kind: 'damage', amount: 12, shape: { kind: 'circle', range: 2.8 }, knockback: 2, repeat: 8, every: 0.5 }] },
  { key: 'pustakawan-e', cls: 'pustakawan', slot: 'e', name: { bm: 'Bab Tertutup', en: 'Closed Chapter' }, blurb: { bm: 'Menutup buku: perisai seketika, dan selangkah ke belakang.', en: 'Close the book: a shield for a moment, and a step back.' },
    windup: 0, recovery: 0.1, cooldown: 9, cost: 16, anim: 'block', mobile: true,
    effects: [{ kind: 'shield', amount: 40, duration: 6 }, { kind: 'dash', distance: 4, duration: 0.2, back: true }] },
  { key: 'pustakawan-r', cls: 'pustakawan', slot: 'r', name: { bm: 'Indeks Agung', en: 'Grand Index' }, blurb: { bm: 'Semua yang berdekatan ditarik ke satu titik, lalu dibuka sekali gus.', en: 'Everything nearby is pulled to one point, then opened all at once.' },
    windup: 0.5, recovery: 0.6, cooldown: 0, cost: 0, ultimate: true, anim: 'cast-heavy',
    effects: [{ kind: 'pull', shape: { kind: 'circle', range: 10 }, strength: 14 }, { kind: 'damage', amount: 70, shape: { kind: 'circle', range: 4 }, delay: 0.6, up: 6, stagger: 1 }] },

  /* Pengembara — the explorer: the staff, the wind, the long leap, the horizon. */
  { key: 'pengembara-q', cls: 'pengembara', slot: 'q', name: { bm: 'Hentak Tongkat', en: 'Staff Strike' }, blurb: { bm: 'Satu libasan tongkat yang menolak semua di hadapan.', en: 'One sweep of the staff that pushes back everything ahead.' },
    windup: 0.18, recovery: 0.3, cooldown: 3.5, cost: 12, anim: 'attack-1',
    effects: [{ kind: 'damage', amount: 30, shape: { kind: 'arc', range: 2.8, angle: 140 }, knockback: 7, stagger: 0.4 }] },
  { key: 'pengembara-w', cls: 'pengembara', slot: 'w', name: { bm: 'Lari Angin', en: 'Wind Run' }, blurb: { bm: 'Lima saat lebih laju daripada sesiapa, dan lompatan yang lebih tinggi.', en: 'Five seconds faster than anyone, and a higher jump.' },
    windup: 0.1, recovery: 0.1, cooldown: 12, cost: 18, anim: 'cast', mobile: true,
    effects: [{ kind: 'buff', stat: 'speed', mult: 1.8, duration: 5 }, { kind: 'buff', stat: 'jump', mult: 1.4, duration: 5 }] },
  { key: 'pengembara-e', cls: 'pengembara', slot: 'e', name: { bm: 'Lompatan Jauh', en: 'Long Leap' }, blurb: { bm: 'Dua belas meter dalam satu lompatan; pendaratannya menggegar.', en: 'Twelve metres in one bound; the landing shakes the floor.' },
    windup: 0.1, recovery: 0.2, cooldown: 8, cost: 18, anim: 'jump', mobile: true,
    effects: [{ kind: 'leap', distance: 12, height: 4, land: { amount: 24, radius: 3.5, knockback: 5, stagger: 0.3 } }] },
  { key: 'pengembara-r', cls: 'pengembara', slot: 'r', name: { bm: 'Ufuk', en: 'Horizon' }, blurb: { bm: 'Meluru lima belas meter menembusi semuanya; dunia perlahan sekejap selepas itu.', en: 'A fifteen-metre rush through everything; the world slows for a moment after.' },
    windup: 0.25, recovery: 0.5, cooldown: 0, cost: 0, ultimate: true, anim: 'attack-3', mobile: true,
    effects: [{ kind: 'dash', distance: 15, duration: 0.35, invulnerable: true, through: true }, { kind: 'damage', amount: 80, shape: { kind: 'line', range: 15, width: 3 }, stagger: 1, knockback: 4 }, { kind: 'slow-time', factor: 0.4, duration: 1.5 }] },

  /* Ahli Falak — the stargazer: arrows, constellations, an eclipse, and the rain of stars. */
  { key: 'ahli-falak-q', cls: 'ahli-falak', slot: 'q', name: { bm: 'Panah Bintang', en: 'Star Arrow' }, blurb: { bm: 'Satu bintang yang mencari sasarannya sendiri.', en: 'One star that finds its own target.' },
    windup: 0.15, recovery: 0.2, cooldown: 2, cost: 10, anim: 'cast',
    effects: [{ kind: 'projectile', amount: 20, speed: 24, range: 20, radius: 0.6, homing: 6 }] },
  { key: 'ahli-falak-w', cls: 'ahli-falak', slot: 'w', name: { bm: 'Buruj', en: 'Constellation' }, blurb: { bm: 'Melukis buruj di lantai di hadapan; sesaat kemudian ia menyala.', en: 'Draw a constellation on the floor ahead; a moment later it ignites.' },
    windup: 0.3, recovery: 0.3, cooldown: 8, cost: 20, anim: 'cast',
    effects: [{ kind: 'damage', amount: 45, shape: { kind: 'circle', range: 4, at: 7 }, delay: 0.9, up: 5, stagger: 0.6 }] },
  { key: 'ahli-falak-e', cls: 'ahli-falak', slot: 'e', name: { bm: 'Gerhana', en: 'Eclipse' }, blurb: { bm: 'Berundur dalam kegelapan; yang berdekatan jadi perlahan.', en: 'Fall back into darkness; everything nearby slows.' },
    windup: 0, recovery: 0.1, cooldown: 8, cost: 16, anim: 'dodge', mobile: true,
    effects: [{ kind: 'dash', distance: 5, duration: 0.2, invulnerable: true, back: true }, { kind: 'damage', amount: 10, shape: { kind: 'circle', range: 4 }, slow: 0.5, slowFor: 3 }] },
  { key: 'ahli-falak-r', cls: 'ahli-falak', slot: 'r', name: { bm: 'Hujan Meteor', en: 'Meteor Rain' }, blurb: { bm: 'Enam bintang jatuh di hadapan, satu demi satu.', en: 'Six stars fall ahead, one after another.' },
    windup: 0.6, recovery: 0.4, cooldown: 0, cost: 0, ultimate: true, anim: 'cast-heavy',
    effects: [{ kind: 'damage', amount: 30, shape: { kind: 'circle', range: 3, at: 6 }, delay: 0.4, repeat: 6, every: 0.45, scatter: 5, up: 6, stagger: 0.5 }] },
];

export const skillsFor = (cls: ClassKey): SkillDef[] => SKILLS.filter((s) => s.cls === cls);
export const skillOf = (cls: ClassKey, slot: SkillSlot): SkillDef | undefined => SKILLS.find((s) => s.cls === cls && s.slot === slot);
