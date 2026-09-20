// The simulation: one fixed-step world holding the player, the shadows, projectiles in flight, patches of floor
// about to be hit, and effects waiting for their moment. It knows nothing about the screen: the renderer reads
// its state and drains its events once a frame. The player's clock is real time; the world's clock can be
// slowed (the Ilmuwan's ultimate), which is why every step carries two dts.
import { MOVEMENT, SKILL_SLOTS, enemyByKey, type ClassKey, type MovementDef, type Stats } from '../../../content';
import { hurt, type CombatCtx, type SimEvent } from './combat';
import { emptyIntent, heldOnly, newPlayer, stepPlayer, type Intent, type Player } from './controller';
import { newEnemy, stepEnemy, type Enemy } from './enemies';
import { loop, newStatus, type Fighter } from './entities';
import { HALL, type LevelDef } from './level';
import { buildGrid, raycast, type World } from './physics';
import type { Pending, Projectile, Zone } from './skills';
import { add, copy, distXZ, len, norm, scale, sub, v3 } from './v3';

export const STEP = 1 / 60;

export class Sim implements CombatCtx {
  readonly world: World;
  readonly player: Player;
  readonly enemies: Enemy[];
  projectiles: Projectile[] = [];
  zones: Zone[] = [];
  pending: Pending[] = [];
  events: SimEvent[] = [];
  time = 0;
  /** The world's clock relative to the player's: 1 normally, less while time is slowed. */
  slow = { factor: 1, left: 0 };
  /** Where the camera looks, so "forward" on the stick means away from it. Set by the screen every frame. */
  camYaw = 0;
  combo = { n: 0, left: 0 };
  /** XP earned since the last time the screen sent it to the server. */
  xpPending = 0;
  private acc = 0;
  private seed: number;

  /** The movement tuning this world runs on: Ceritera's by default, a fair passes its own. */
  constructor(cls: ClassKey, stats: Stats, readonly level: LevelDef = HALL, seed = 1, readonly movement: MovementDef = MOVEMENT) {
    this.world = { boxes: level.boxes, grid: buildGrid(level.boxes) };
    this.player = newPlayer(cls, stats, level.spawn.pos, level.spawn.yaw, movement);
    this.enemies = level.enemies.map((e) => newEnemy(enemyByKey(e.key)!, e.pos, e.yaw));
    this.seed = seed >>> 0 || 1;
  }

  /** Deterministic randomness (mulberry32), so a replay of the same inputs is the same fight. */
  rng = (): number => {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  onKill = (target: Fighter): void => {
    const e = target as Enemy;
    this.xpPending += e.def.xp;
    this.player.kills++;
    this.events.push({ kind: 'kill', pos: e.body.pos, amount: e.def.xp, key: e.def.key });
  };

  /** Back on your feet at the spawn: full vitals, the ilham kept, the shadows where they were. */
  respawnPlayer(): void {
    const p = this.player, s = this.level.spawn;
    p.dead = false; p.deadFor = 0; p.health = p.maxHealth; p.stamina = p.vit.stamina; p.spirit = p.vit.spirit;
    p.status = newStatus(); p.action = null; p.dodge = null; p.airDash = null; p.leap = null; p.slamming = false; p.lock = null; p.hitFlash = 0; p.queued = false;
    copy(p.body.pos, s.pos); p.body.vel = v3(); p.body.grounded = false; p.yaw = s.yaw; p.peak = s.pos.y;
    loop(p, 'idle');
    this.events.push({ kind: 'respawn', pos: s.pos, team: 'player' });
  }

  /** Taps that no tick has seen yet: a frame shorter than a step must not swallow a press. */
  private latched = heldOnly(emptyIntent());

  /** Advance by a frame's worth of real time in fixed steps. Taps fire on the first step that runs, held keys on every step. */
  step(intent: Intent, realDt: number): void {
    const l = this.latched;
    for (const k of ['jump', 'dodge', 'attack', 'slam', 'lock'] as const) if (intent[k]) l[k] = true;
    for (const k of SKILL_SLOTS) if (intent.skills[k]) l.skills[k] = true;
    this.acc += Math.min(realDt, 0.1);
    let n = 0;
    while (this.acc >= STEP - 1e-9 && n < 6) {
      const it = n === 0 ? { ...intent, jump: l.jump, dodge: l.dodge, attack: l.attack, slam: l.slam, lock: l.lock, skills: { ...l.skills } } : heldOnly(intent);
      this.tick(it, STEP);
      this.acc -= STEP;
      if (n === 0) this.latched = heldOnly(emptyIntent());
      n++;
    }
  }

  private tick(it: Intent, dt: number): void {
    const wdt = dt * this.slow.factor;
    this.time += dt;
    if (this.slow.left > 0) {
      this.slow.left -= dt;
      if (this.slow.left <= 0) { this.slow = { factor: 1, left: 0 }; this.events.push({ kind: 'slowmo', pos: this.player.body.pos, power: 0 }); }
    }
    const hitsBefore = this.events.length;
    stepPlayer(this, this.player, it, dt);
    for (const e of this.enemies) stepEnemy(this, e, wdt);
    this.stepProjectiles(dt, wdt);
    const due = this.pending.filter((x) => x.at <= this.time);
    if (due.length) { this.pending = this.pending.filter((x) => x.at > this.time); for (const x of due) x.run(); }
    if (this.zones.length) this.zones = this.zones.filter((z) => z.at > this.time);
    for (let i = hitsBefore; i < this.events.length; i++) {
      const ev = this.events[i]!;
      if (ev.kind === 'hit' && ev.team === 'enemy') { this.combo.n++; this.combo.left = 2.5; }
    }
    if (this.combo.left > 0) { this.combo.left -= dt; if (this.combo.left <= 0) this.combo.n = 0; }
  }

  private stepProjectiles(dt: number, wdt: number): void {
    const keep: Projectile[] = [];
    for (const pr of this.projectiles) {
      const d = pr.team === 'player' ? dt : wdt;
      if (pr.homing > 0) {
        let best: Enemy | null = null, bd = 14;
        for (const e of this.enemies) { if (e.dead || pr.hit.has(e.id)) continue; const dd = distXZ(e.body.pos, pr.pos); if (dd < bd) { bd = dd; best = e; } }
        if (best) {
          const want = norm(sub(v3(best.body.pos.x, best.body.pos.y + 1.2, best.body.pos.z), pr.pos)), cur = norm(pr.vel), k = Math.min(1, pr.homing * d);
          const dir = norm(v3(cur.x + (want.x - cur.x) * k, cur.y + (want.y - cur.y) * k, cur.z + (want.z - cur.z) * k));
          pr.vel = scale(dir, pr.speed);
        }
      }
      const step = scale(pr.vel, d), l = len(step);
      const wall = l > 0 ? raycast(this.world, pr.pos, scale(step, 1 / l), l + pr.radius) : null;
      if (wall) { this.events.push({ kind: 'impact', pos: add(pr.pos, scale(step, Math.max(0, wall.t - pr.radius) / (l || 1))), key: pr.key }); continue; }
      pr.pos = add(pr.pos, step);
      pr.left -= l;
      let gone = false;
      const victims: Fighter[] = pr.team === 'player' ? this.enemies : [this.player];
      for (const f of victims) {
        if (f.dead || pr.hit.has(f.id)) continue;
        if (distXZ(pr.pos, f.body.pos) <= pr.radius + f.hitRadius && pr.pos.y > f.body.pos.y - 0.2 && pr.pos.y < f.body.pos.y + f.body.height + 0.4) {
          hurt(this, f, pr.amount, { from: pr.pos, knockback: pr.knockback, stagger: 0.2, mark: pr.mark || undefined, markFor: pr.markFor || undefined, canCrit: true, attacker: this.player });
          pr.hit.add(f.id);
          this.events.push({ kind: 'impact', pos: v3(pr.pos.x, pr.pos.y, pr.pos.z), key: pr.key });
          if (!pr.pierce) { gone = true; break; }
        }
      }
      if (!gone && pr.left > 0) keep.push(pr);
    }
    this.projectiles = keep;
  }
}
