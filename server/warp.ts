// Warp: across the fair to a booth on Mission X in one ride through the sky, for a player who bought it in the
// Playground, while the crew's switch for it is on. The fair's speed check refuses a body that moves faster than a
// person runs, so the server puts the body at the booth itself, as a spawn is put, having checked what it believes: the
// player's last place (a warp saves a real walk, never a few steps), the booth (online on Mission X, or the X at
// Booth 7E17), the arrival (beside it, within stamping reach) and the minute since the last. A ping sent from the old
// place just before a warp can arrive after it; it is forgiven for a few seconds, never taken for a jump.
import { Game, GameError } from './game.js';
import type { Playground } from './playground.js';
import type { WarpInput, WarpResult } from '../shared/types.js';
import { STAMP_RADIUS_M } from '../shared/rules.js';
import { WARP_COOLDOWN_MS, WARP_GRACE_MS, WARP_MIN_M } from '../shared/playground.js';

export class Warps {
  /** `on`: whether the crew's switch for Warp is on (LiveOps' flag). */
  constructor(private g: Game, private pg: Playground, private on: () => Promise<boolean>) {}

  async warp(id: string, input: Partial<WarpInput>): Promise<WarpResult> {
    if (!(await this.on())) throw new GameError('paused', 'Warp is resting for a moment: try again shortly', 503);
    if (!(await this.pg.owns(id, 'warp'))) throw new GameError('not_owned', 'Warp is bought with stars in the Playground');
    const stationId = typeof input.stationId === 'string' ? input.stationId : '', x = Number(input.x), y = Number(input.y), h = Number.isFinite(input.h) ? Number(input.h) : 0;
    const booth = this.g.level.booths.find((b) => b.id === stationId);
    if (!booth) throw new GameError('bad_booth', 'No such booth');
    if (stationId !== this.g.level.hero.id) {
      const st = await this.g.db.get<{ status: string }>('SELECT status FROM stations WHERE station_id = ?', [stationId]);
      if (!st || st.status === 'revoked') throw new GameError('not_hosted', 'Warp goes to the booths on Mission X');
    }
    if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x - booth.x, y - booth.y) > STAMP_RADIUS_M) throw new GameError('bad_pos', 'That is not beside the booth');
    const t = this.g.now(), here = await this.g.presence.position(id, t);
    if (!here) throw new GameError('not_here', 'Step into the hall first');
    if (Math.hypot(here.x - x, here.y - y) < WARP_MIN_M) throw new GameError('near', 'It is just ahead: walk there');
    const last = await this.g.db.get<{ created_at: number }>('SELECT created_at FROM warps WHERE player_id = ? ORDER BY created_at DESC LIMIT 1', [id]);
    if (last && t - Number(last.created_at) < WARP_COOLDOWN_MS) throw new GameError('soon', `Warp is charging: ${Math.ceil((WARP_COOLDOWN_MS - (t - Number(last.created_at))) / 1000)} s`, 429);
    // the body at the booth, as a spawn is put: the kit it wears comes with the next ping
    await this.g.presence.update(await this.g.hologramOf(id, { x, y, h, deck: false, sigma: 0 }), t, true);
    await this.g.db.run('INSERT INTO warps (player_id, station_id, from_x, from_y, to_x, to_y, created_at) VALUES (?,?,?,?,?,?,?)', [id, stationId, here.x, here.y, x, y, t]);
    return { at: t, nextAt: t + WARP_COOLDOWN_MS };
  }

  /** Did this player warp in the last few seconds? Their ping from the old place is then no jump. (The table, not
   *  memory: on serverless the ping may reach another instance than the warp did.) */
  async justWarped(id: string, t: number): Promise<boolean> {
    return !!(await this.g.db.get('SELECT 1 AS x FROM warps WHERE player_id = ? AND created_at > ? AND created_at <= ? LIMIT 1', [id, t - WARP_GRACE_MS, t]));
  }
}
