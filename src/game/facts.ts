// What the game can truthfully say about the show: everything here is counted from floor.json (the organiser's floor
// plan), never written by hand. Booths carry no company names in the plan, so nothing here names an exhibitor.
// Shown when you walk into a hall, and while you sit.
import type { LevelData } from '../../shared/types';

export interface HallCard { hall: number; level: number; booths: number }

export function hallCards(level: LevelData): HallCard[] {
  return level.halls.map((h) => ({ hall: h.id, level: h.deck, booths: level.booths.filter((b) => b.hall === h.id).length }));
}
export const hallLine = (c: HallCard) => `${c.booths} booths`;

/** Short, checkable sentences for the "while you sit" card. */
export function facts(level: LevelData): string[] {
  const booths = level.booths, halls = hallCards(level), places = level.areas.map((a) => a.name);
  const biggest = [...halls].sort((a, b) => b.booths - a.booths)[0]!, smallest = [...halls].sort((a, b) => a.booths - b.booths)[0]!;
  const out = [
    `This game covers Halls ${halls.map((h) => h.hall).sort((a, b) => a - b).join(', ').replace(/, (\d+)$/, ' and $1')} of MITEC: ${booths.length.toLocaleString()} booths.`,
    `Hall ${biggest.hall} is the biggest: ${biggest.booths} booths. Hall ${smallest.hall} has ${smallest.booths}.`,
    `Every booth shows its number. Once its exhibitor registers in the game, their company goes up next to it.`,
    `Lean X Digital is at Booth ${level.hero.id}, in Hall ${level.hero.id.match(/^\d+/)?.[0] ?? ''}. Your tote bag is waiting there once your checkpoints are done.`,
  ];
  if (places.length) out.push(`Besides the booths there are ${places.length} places to visit, including ${places.slice(0, 3).join(', ')}.`);
  out.push(`Tap a booth to see who runs it, or open the map to search by booth number or company.`);
  return out;
}
