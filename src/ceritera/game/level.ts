// Dewan Ilmu as a playable greybox: the hall's floor, walls, ring of columns, reading tables, two wings of
// three-metre shelves, twin stairs to a gallery, and where everyone starts. The same boxes are what the body
// collides with and what the renderer dresses, so what you see is what you can stand on. Metres; the spawn is
// at the south end facing north (+Z).
import { box, type Box } from './physics';
import { v3, type V3 } from './v3';

export type PropKind = 'floor' | 'wall' | 'column' | 'shelf' | 'step' | 'gallery' | 'rail' | 'table' | 'dais' | 'pedestal';
export interface Prop { kind: PropKind; box: Box }
export interface Placement { key: string; pos: V3; yaw: number }
export interface LevelDef {
  /** Half the width of the hall. */
  size: number;
  boxes: Box[];
  props: Prop[];
  spawn: { pos: V3; yaw: number };
  enemies: Placement[];
  lanterns: V3[];
}

function build(): LevelDef {
  const S = 40, props: Prop[] = [];
  const add = (kind: PropKind, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => props.push({ kind, box: box(x0, y0, z0, x1, y1, z1, kind) });

  add('floor', -S, -1, -S, S, 0, S);
  add('wall', -S - 1, 0, -S - 1, S + 1, 14, -S);
  add('wall', -S - 1, 0, S, S + 1, 14, S + 1);
  add('wall', -S - 1, 0, -S, -S, 14, S);
  add('wall', S, 0, -S, S + 1, 14, S);

  // the rotunda: twelve columns, a low dais with the armillary's pedestal, six reading tables
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, x = Math.cos(a) * 15, z = Math.sin(a) * 15; add('column', x - 0.7, 0, z - 0.7, x + 0.7, 12, z + 0.7); }
  add('dais', -4, 0, -4, 4, 0.4, 4);
  add('pedestal', -0.6, 0.4, -0.6, 0.6, 1.4, 0.6);
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6, x = Math.cos(a) * 9, z = Math.sin(a) * 9; add('table', x - 1.5, 0, z - 0.6, x + 1.5, 0.8, z + 0.6); }

  // two wings of shelves, five stacks a row with cross-aisles between them
  for (const side of [-1, 1]) for (const col of [24, 30, 36]) for (let k = 0; k < 5; k++) { const z0 = -30 + k * 13, x = side * col; add('shelf', x - 0.6, 0, z0, x + 0.6, 3, z0 + 10); }

  // twin stairs to the gallery along the north wall: twenty steps of 25 cm, then a slab with a railing
  for (const sx of [-12, 12]) for (let i = 0; i < 20; i++) add('step', sx - 1.5, 0, 26 + i * 0.35, sx + 1.5, (i + 1) * 0.25, S);
  add('gallery', -S, 4, 33, S, 5, S);
  for (const [a, b] of [[-S, -13.5], [-10.5, -3], [3, 10.5], [13.5, S]] as const) add('rail', a, 5, 33, b, 6, 33.3);
  add('shelf', -38, 5, 38.4, 38, 9, S);

  const lanterns: V3[] = [];
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; lanterns.push(v3(Math.cos(a) * 13.2, 6.5, Math.sin(a) * 13.2)); }
  for (const side of [-1, 1]) for (const z of [-24, -11, 2, 15, 28]) lanterns.push(v3(side * 27, 4.2, z));
  lanterns.push(v3(-6, 7.5, 36), v3(6, 7.5, 36), v3(0, 5.5, -32));

  return {
    size: S,
    boxes: props.map((p) => p.box),
    props,
    spawn: { pos: v3(0, 0, -30), yaw: 0 },
    enemies: [
      { key: 'patung-latihan', pos: v3(-5, 0, -23), yaw: Math.PI },
      { key: 'patung-latihan', pos: v3(0, 0, -25), yaw: Math.PI },
      { key: 'patung-latihan', pos: v3(5, 0, -23), yaw: Math.PI },
      { key: 'bayang-pendekar', pos: v3(-11, 0, 0), yaw: Math.PI },
      { key: 'bayang-pengembara', pos: v3(11, 0, 0), yaw: Math.PI },
      { key: 'bayang-ilmuwan', pos: v3(-6, 0, 12), yaw: Math.PI },
      { key: 'bayang-ahli-falak', pos: v3(6, 0, 12), yaw: Math.PI },
      { key: 'bayang-pendekar', pos: v3(0, 5, 36), yaw: Math.PI },
    ],
    lanterns,
  };
}

export const HALL: LevelDef = build();
