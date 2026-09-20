// Ceritera's character service: one row per player, the class they chose, and their XP. Level and stats are never
// stored — they are computed from XP with the content package's pure functions, so the server, the web tier and the
// Unreal client can never disagree about what level 3 means. XP changes go through award(): a ledger row and the
// cached total commit in one batch (the Mission X pattern), so the ledger is always the truth.
import type { Db, Stmt } from './db/types.js';
import { GameError, cleanText } from './game.js';
import { CLASSES, classByKey, statsAt, xpBar, type ClassDef, type Stats } from '../content/index.js';
import type { XpEvent } from '../shared/types.js';

export interface CharacterView {
  classKey: string;
  name: string;
  level: number;
  xp: number;
  /** XP earned inside the current level, and what the level needs: the bar on the character board. */
  xpIntoLevel: number;
  xpToNext: number;
  stats: Stats;
  createdAt: number;
}

interface Row { player_id: string; class_key: string; name: string; xp: number; created_at: number }

export class Ceritera {
  constructor(readonly db: Db, readonly now: () => number = Date.now) {}

  classes(): ClassDef[] { return CLASSES; }

  private view(r: Row): CharacterView {
    const cls = classByKey(r.class_key);
    if (!cls) throw new GameError('bad_class', 'This character belongs to a class that no longer exists', 500);
    const bar = xpBar(r.xp);
    return { classKey: r.class_key, name: r.name, level: bar.level, xp: r.xp, xpIntoLevel: bar.into, xpToNext: bar.toNext, stats: statsAt(cls, bar.level), createdAt: r.created_at };
  }

  private row(playerId: string) {
    return this.db.get<Row>('SELECT player_id, class_key, name, xp, created_at FROM characters WHERE player_id = ?', [playerId]);
  }

  async character(playerId: string): Promise<CharacterView | null> {
    const r = await this.row(playerId);
    return r ? this.view(r) : null;
  }

  /** New Journey: choose a class. A second call needs `replace`, and starts over at 0 XP; the ledger keeps the history. */
  async create(playerId: string, classKey: unknown, o: { name?: unknown; replace?: boolean } = {}): Promise<CharacterView> {
    const cls = classByKey(String(classKey ?? ''));
    if (!cls) throw new GameError('bad_class', 'Choose one of the six avatars');
    const name = cleanText(o.name, 24) || cls.name;
    if (name.length < 2) throw new GameError('bad_name', 'A name needs at least two characters');
    const t = this.now(), existing = await this.row(playerId);
    if (existing && !o.replace) throw new GameError('exists', 'You already have a character — start a new journey to replace it', 409);
    const write: Stmt = existing
      ? ['UPDATE characters SET class_key = ?, name = ?, xp = 0, created_at = ?, updated_at = ? WHERE player_id = ?', [cls.key, name, t, t, playerId]]
      : ['INSERT INTO characters (player_id, class_key, name, xp, created_at, updated_at) VALUES (?,?,?,0,?,?)', [playerId, cls.key, name, t, t]];
    await this.db.batch([write, ['INSERT INTO ceritera_ledger (player_id, action, xp, detail, created_at) VALUES (?,?,?,?,?)', [playerId, existing ? 'new-journey' : 'begin', 0, cls.key, t]]]);
    return this.view((await this.row(playerId))!);
  }

  /** Statements that pay XP: a ledger row plus the cached total. Callers commit them with their own writes. */
  award(playerId: string, action: string, xp: number, detail: string | null = null): Stmt[] {
    if (!Number.isInteger(xp) || xp < 0) throw new GameError('bad_xp', 'XP must be a whole, positive number', 500);
    const t = this.now();
    return [
      ['INSERT INTO ceritera_ledger (player_id, action, xp, detail, created_at) VALUES (?,?,?,?,?)', [playerId, action, xp, detail, t]],
      ['UPDATE characters SET xp = xp + ?, updated_at = ? WHERE player_id = ?', [xp, t, playerId]],
    ];
  }

  /** XP from the hall: what the shadows paid since the last report. Capped, so a stray client cannot mint levels. */
  async fight(playerId: string, amount: unknown, detail: unknown): Promise<CharacterView> {
    const xp = Number(amount);
    if (!Number.isInteger(xp) || xp < 1 || xp > 600) throw new GameError('bad_xp', 'XP must be a whole number from 1 to 600');
    return (await this.grant(playerId, 'fight', xp, cleanText(detail, 40) || null)).character;
  }

  async grant(playerId: string, action: string, xp: number, detail: string | null = null): Promise<{ character: CharacterView; events: XpEvent[] }> {
    if (!(await this.row(playerId))) throw new GameError('no_character', 'Choose an avatar first', 403);
    await this.db.batch(this.award(playerId, action, xp, detail));
    return { character: this.view((await this.row(playerId))!), events: xp > 0 ? [{ action, xp }] : [] };
  }
}
