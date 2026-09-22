// Builds public/data/floor.json: Level 2 only (Halls 6–8), the one level the game covers. The format still carries a
// deck on everything, so a level could come back without touching the client.
// Level 2 source: tools/data/level2-source.json (vector-derived from Floor Plan V226, page 2).
// Units: metres, origin = source PDF lower-left, +y = north.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, 'data/level2-source.json'); // vector extraction of Floor Plan V226 page 2, kept with the tools so the build is reproducible
const OUT = resolve(here, '../public/data/floor.json');

const HERO_ID = '8H18A';

// Special areas measured off the cleaned plan (22.2 px/m). kind: pad = walk-around block, zone = open floor you can enter.
const areas = [
  { id: 'cafe', name: 'Café & Visitor Lounge', x0: 74.3, y0: 95.9, x1: 183.7, y1: 107.9, h: 0.4, kind: 'zone' },
  { id: 'wellness', name: 'Wellness Corner', x0: 6.8, y0: 78.8, x1: 69.8, y1: 91.5, h: 0.4, kind: 'zone' },
  { id: 'corner', name: 'MIHAS Corner · Stage', x0: 6.8, y0: 57.3, x1: 18.3, y1: 73.5, h: 0.9, kind: 'pad' },
  { id: 'kitchen', name: 'MIHAS Kitchen', x0: 75.7, y0: 78.8, x1: 91.2, y1: 92.7, h: 1.2, kind: 'pad' },
  { id: 'media', name: 'Media Center', x0: 166.2, y0: 41.9, x1: 176.1, y1: 73.7, h: 2.2, kind: 'pad' },
  { id: 'm2027', name: 'MIHAS 2027', x0: 88.9, y0: 57.8, x1: 95.0, y1: 73.7, h: 2.2, kind: 'pad' },
  { id: 'photo', name: 'Photo Booth', x0: 140.4, y0: 41.9, x1: 146.6, y1: 54.6, h: 2.0, kind: 'pad' },
  { id: 'livebox', name: 'Live Box', x0: 123.2, y0: 82.7, x1: 127.3, y1: 89.4, h: 2.0, kind: 'pad' },
  { id: 'speaker', name: 'Speaker Lounge', x0: 6.3, y0: 48.2, x1: 9.9, y1: 54.6, h: 1.6, kind: 'pad' },
  { id: 'bernama', name: 'Bernama Studio', x0: 6.5, y0: 43.9, x1: 10.0, y1: 48.2, h: 1.6, kind: 'pad' },
  { id: 'merch', name: 'MIHAS Merchandise', x0: 8.8, y0: 35.7, x1: 20.7, y1: 38.8, h: 1.4, kind: 'pad' },
];

// Booths carry only their number: the company on each booth comes from the exhibitor who registers it in the game, never
// from a list (the organiser's list and the spreadsheet named the wrong companies). Our own booth is the one exception.
const HERO_NAME = 'Lean X Digital · nexova';
const raw = JSON.parse(readFileSync(SRC, 'utf8'));
const inside = (o, a) => o.x_m > a.x0 && o.x_m < a.x1 && o.y_m > a.y0 && o.y_m < a.y1;

// Phantoms: the PDF carries a hidden older layer. Everything north of y=75 west of x=95 sits under the Wellness Corner /
// Kitchen; entries inside pads are under those pads; 8J29/8J30 are the Bernama Studio, not booths.
const booths = raw.booths
  .filter((o) => !(o.y_m > 75 && o.x_m < 95))
  .filter((o) => !/^8J(29|30)$/.test(o.booth_id))
  .filter((o) => !areas.some((a) => inside(o, a)))
  .map((o) => ({
    id: o.booth_id,
    hall: Number(/^(\d{1,2})/.exec(o.booth_id)?.[1] ?? 0),
    x: +o.x_m.toFixed(2),
    y: +o.y_m.toFixed(2),
    name: o.booth_id === HERO_ID ? HERO_NAME : '',
    deck: 2,
  }))
  .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));

const hero = booths.find((b) => b.id === HERO_ID);
if (!hero) throw new Error(`hero booth ${HERO_ID} missing from source data`);

const out = {
  level: 2,
  source: 'MIHAS 2026 Floor Plan V226, page 2',
  booth: { w: 2.82, d: 3.06, h: 2.6 },
  // Exhibition hall interior + the two public approaches players spawn in.
  hall: { x0: 3.4, y0: 35.0, x1: 184.0, y1: 110.0 },
  walkable: [
    { x0: 3.4, y0: 35.0, x1: 184.0, y1: 110.0 },   // hall
    { x0: 3.4, y0: 27.0, x1: 184.0, y1: 35.0 },    // south concourse (Hall 6/7/8 doors)
    { x0: 184.0, y0: 50.0, x1: 205.0, y1: 80.0 },  // east concourse (Hall 5 registration)
  ],
  walls: [
    { x0: 3.4, y0: 34.6, x1: 27.0, y1: 35.0 }, { x0: 43.0, y0: 34.6, x1: 89.0, y1: 35.0 },
    { x0: 103.0, y0: 34.6, x1: 150.0, y1: 35.0 }, { x0: 165.0, y0: 34.6, x1: 184.0, y1: 35.0 },
    { x0: 184.0, y0: 35.0, x1: 184.4, y1: 58.0 }, { x0: 184.0, y0: 70.0, x1: 184.4, y1: 110.0 },
  ],
  gates: [
    { id: 'hall8', name: 'Hall 8 entrance', x: 35.1, y: 34.8, axis: 'x' },
    { id: 'hall7', name: 'Hall 7 entrance', x: 96.0, y: 34.8, axis: 'x' },
    { id: 'hall6', name: 'Hall 6 entrance', x: 157.4, y: 34.8, axis: 'x' },
    { id: 'main', name: 'Main entrance · Hall 5', x: 184.2, y: 64.0, axis: 'y' },
  ],
  spawns: {
    short: { x: 35.1, y: 30.0, label: 'Hall 8 entrance', gate: 'hall8' },
    epic: { x: 198.0, y: 64.0, label: 'Main entrance', gate: 'main' },
  },
  hero: { id: HERO_ID, x: hero.x, y: hero.y, open: 'W', dock: { x: +(hero.x - 2.7).toFixed(2), y: hero.y } },
  areas: areas.map((a) => ({ ...a, deck: 2 })),
  booths,
  decks: [{ level: 2, x0: 2, y0: 26, x1: 206, y1: 111, boothD: 3.06, label: 'Deck 2 · Halls 6–8' }],
  halls: [{ id: 8, deck: 2, x0: 3.4, x1: 66.5, y0: 35, y1: 110 }, { id: 7, deck: 2, x0: 66.5, x1: 127, y0: 35, y1: 110 }, { id: 6, deck: 2, x0: 127, x1: 184, y0: 35, y1: 110 }],
  lifts: [], // one level: nowhere for a lift to go
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.log(`floor.json: Level 2, ${booths.length} booths (${raw.booths.length - booths.length} phantoms removed), ${out.halls.length} halls, hero ${HERO_ID} @ ${hero.x},${hero.y}`);
