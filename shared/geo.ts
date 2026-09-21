// GPS → floor plan. The plan is in metres but not on the globe: each level is drawn at its own offset in one plan space
// (they are stacked in reality), and level 2's page is drawn 8 % taller than it is. So each level gets its own affine
// map from ground metres (east, north of the venue centre) to plan metres, fitted from calibration points the crew
// records on site: stand at a booth, record a GPS fix, repeat. 3+ points → full affine (rotation, scale, stretch);
// 2 → rotation and scale only; 1 → borrow the shape of the best-calibrated level and fit just the offset.

export interface GeoCalPoint { id: number; deck: number; x: number; y: number; lat: number; lon: number; acc: number; label?: string }
/** x = a·e + b·n + tx, y = c·e + d·n + ty, with (e, n) in metres east and north of (lat0, lon0). */
export interface GeoMap { a: number; b: number; c: number; d: number; tx: number; ty: number; kind: 'affine' | 'similarity' | 'borrowed'; points: number; /** root-mean-square miss over the points, plan metres */ rms: number }
export interface GeoCalibration { lat0: number; lon0: number; decks: Record<number, GeoMap> }

const R = 6_371_000, RAD = Math.PI / 180;

/** Metres east and north of the origin. Flat-earth is exact enough across one venue. */
export function toLocal(lat0: number, lon0: number, lat: number, lon: number): { e: number; n: number } {
  return { e: (lon - lon0) * RAD * R * Math.cos(lat0 * RAD), n: (lat - lat0) * RAD * R };
}

export function applyMap(m: GeoMap, e: number, n: number): { x: number; y: number } {
  return { x: m.a * e + m.b * n + m.tx, y: m.c * e + m.d * n + m.ty };
}

/** Plan metres per ground metre: how big a GPS accuracy circle is on the plan. */
export const mapScale = (m: GeoMap): number => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));

type Pt = { e: number; n: number; x: number; y: number };

function solve3(A: number[][], b: number[]): number[] | null {
  const M = A.map((r, i) => [...r, b[i]!]);
  for (let c = 0; c < 3; c++) {
    let p = c; for (let r = c + 1; r < 3; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    if (Math.abs(M[p]![c]!) < 1e-9) return null;
    [M[c], M[p]] = [M[p]!, M[c]!];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = M[r]![c]! / M[c]![c]!; for (let k = c; k < 4; k++) M[r]![k]! -= f * M[c]![k]!; }
  }
  return [0, 1, 2].map((i) => M[i]![3]! / M[i]![i]!);
}

function rms(m: Omit<GeoMap, 'rms'>, pts: Pt[]): number {
  if (!pts.length) return 0;
  const s = pts.reduce((acc, p) => { const q = applyMap({ ...m, rms: 0 }, p.e, p.n); return acc + (q.x - p.x) ** 2 + (q.y - p.y) ** 2; }, 0);
  return Math.sqrt(s / pts.length);
}

/** Least-squares affine, or null when the points are (nearly) on one line and cannot fix a stretch. */
function fitAffine(pts: Pt[]): GeoMap | null {
  if (pts.length < 3) return null;
  const ce = pts.reduce((s, p) => s + p.e, 0) / pts.length, cn = pts.reduce((s, p) => s + p.n, 0) / pts.length;
  let see = 0, snn = 0, sen = 0; for (const p of pts) { see += (p.e - ce) ** 2; snn += (p.n - cn) ** 2; sen += (p.e - ce) * (p.n - cn); }
  // spread across the thinner direction: under ~6 m the points are a line, and a line cannot tell stretch from rotation
  const tr = see + snn, det = see * snn - sen * sen, minor = tr / 2 - Math.sqrt(Math.max(0, (tr / 2) ** 2 - det));
  if (Math.sqrt(minor / pts.length) < 6) return null;
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  for (const p of pts) {
    const v = [p.e, p.n, 1];
    for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) A[i]![j]! += v[i]! * v[j]!; bx[i]! += v[i]! * p.x; by[i]! += v[i]! * p.y; }
  }
  const X = solve3(A, bx), Y = solve3(A, by); if (!X || !Y) return null;
  const m = { a: X[0]!, b: X[1]!, tx: X[2]!, c: Y[0]!, d: Y[1]!, ty: Y[2]!, kind: 'affine' as const, points: pts.length };
  return { ...m, rms: rms(m, pts) };
}

/** Rotation + uniform scale + offset (the least-squares fit, which for two points is exact). */
function fitSimilarity(pts: Pt[]): GeoMap | null {
  if (pts.length < 2) return null;
  const ce = pts.reduce((s, p) => s + p.e, 0) / pts.length, cn = pts.reduce((s, p) => s + p.n, 0) / pts.length;
  const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length, cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  let num1 = 0, num2 = 0, den = 0;
  for (const p of pts) { const e = p.e - ce, n = p.n - cn, x = p.x - cx, y = p.y - cy; num1 += e * x + n * y; num2 += e * y - n * x; den += e * e + n * n; }
  if (Math.sqrt(den / pts.length) < 5) return null; // two fixes a few metres apart say nothing about direction
  const s = num1 / den, r = num2 / den; // x = s·e − r·n, y = r·e + s·n
  const m = { a: s, b: -r, c: r, d: s, tx: cx - s * ce + r * cn, ty: cy - r * ce - s * cn, kind: 'similarity' as const, points: pts.length };
  return { ...m, rms: rms(m, pts) };
}

/** Fit every level from the crew's points. Levels with no usable fit are left out: no GPS placement there. */
export function calibrate(lat0: number, lon0: number, points: GeoCalPoint[]): GeoCalibration {
  const byDeck = new Map<number, Pt[]>();
  for (const p of points) { const l = toLocal(lat0, lon0, p.lat, p.lon); (byDeck.get(p.deck) ?? byDeck.set(p.deck, []).get(p.deck)!).push({ ...l, x: p.x, y: p.y }); }
  const decks: Record<number, GeoMap> = {};
  for (const [deck, pts] of byDeck) { const m = fitAffine(pts) ?? fitSimilarity(pts); if (m) decks[deck] = m; }
  // a level with a single point takes the shape of the best-fitted level (they are one building) and fits only the offset
  const donor = Object.values(decks).sort((p, q) => q.points - p.points)[0];
  if (donor) for (const [deck, pts] of byDeck) {
    if (decks[deck] || pts.length !== 1) continue;
    const p = pts[0]!, m = { ...donor, tx: p.x - donor.a * p.e - donor.b * p.n, ty: p.y - donor.c * p.e - donor.d * p.n, kind: 'borrowed' as const, points: 1 };
    decks[deck] = { ...m, rms: 0 };
  }
  return { lat0, lon0, decks };
}

/** Where a GPS fix lands on a level's plan, and how wide its uncertainty is there. null = that level is not calibrated. */
export function geoToPlan(cal: GeoCalibration, deck: number, lat: number, lon: number, acc: number): { x: number; y: number; sigma: number } | null {
  const m = cal.decks[deck]; if (!m) return null;
  const l = toLocal(cal.lat0, cal.lon0, lat, lon), p = applyMap(m, l.e, l.n);
  return { ...p, sigma: acc * mapScale(m) };
}
