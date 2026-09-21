// The MIHAS exhibitor list (public/data/exhibitors.json, from Lean X's spreadsheet via tools/import-exhibitors.py):
// what exhibitors search when they register. `onPlan` = the booth numbers that exist on the game's floor plan.
export interface Listed { company: string; halls: string; booths: string[]; onPlan: string[]; website: string }

let list: Promise<Listed[]> | null = null;
export const directory = (): Promise<Listed[]> =>
  (list ??= fetch('/data/exhibitors.json').then((r) => (r.ok ? r.json() : { exhibitors: [] })).then((j: { exhibitors: Listed[] }) => j.exhibitors).catch(() => []));

/** "7D10, 7D11, 7D12 … +5" for long pavilion lists. */
export const boothList = (ids: string[], n = 3) => (ids.length > n + 1 ? `${ids.slice(0, n).join(', ')} … +${ids.length - n}` : ids.join(', '));
