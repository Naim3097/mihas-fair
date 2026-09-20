// Hurting things. One function applies a wound to any fighter (shields, stances, marks, knockback, stagger and
// death all live here) and the shapes a blow can take are tested here, so a strike, a skill and a shadow's swing
// are one rule. The caller supplies the context: the events list, and the player for ilham and counters.
import { ILHAM, type ShapeDef } from '../../../content';
import { oneShot, type Fighter, type Team } from './entities';
import { angleDiff, fromYaw, lenXZ, norm, sub, v3, yawOf, type V3 } from './v3';

export type EventKind =
  | 'hit' | 'dodged' | 'blocked' | 'heal' | 'kill' | 'death' | 'respawn'
  | 'jump' | 'airjump' | 'walljump' | 'dash' | 'dodge' | 'slam' | 'land' | 'footstep'
  | 'swing' | 'cast' | 'ultimate' | 'projectile' | 'impact' | 'telegraph' | 'zone' | 'shield' | 'slowmo' | 'pull' | 'levelup';

/** Something the renderer, the sound and the HUD may want to show. Positions are world metres. */
export interface SimEvent {
  kind: EventKind;
  pos: V3;
  amount?: number;
  crit?: boolean;
  team?: Team;
  yaw?: number;
  range?: number;
  angle?: number;
  radius?: number;
  width?: number;
  shape?: ShapeDef['kind'];
  power?: number;
  key?: string;
  delay?: number;
}

export interface CombatCtx {
  events: SimEvent[];
  time: number;
  rng: () => number;
  /** Where ilham and critical hits come from. */
  player: Fighter & { ilham: number; vit: { crit: number; ilhamRate: number } };
  onKill?: (target: Fighter) => void;
}

export interface HurtOpts {
  /** Where the blow came from, for knockback direction. */
  from?: V3;
  knockback?: number;
  up?: number;
  stagger?: number;
  slow?: number;
  slowFor?: number;
  mark?: number;
  markFor?: number;
  canCrit?: boolean;
  attacker?: Fighter;
}

const DEG = Math.PI / 180;

/** Is a target at `p` (radius `r`) inside a shape cast from `origin` facing `yaw`? Different floors never touch. */
export function inShape(origin: V3, yaw: number, shape: ShapeDef, p: V3, r: number): boolean {
  if (Math.abs(p.y - origin.y) > 3) return false;
  const fwd = fromYaw(yaw);
  switch (shape.kind) {
    case 'self': return false;
    case 'circle': {
      const at = shape.at ?? 0, cx = origin.x + fwd.x * at, cz = origin.z + fwd.z * at;
      return Math.hypot(p.x - cx, p.z - cz) <= shape.range + r;
    }
    case 'arc': {
      const d = sub(p, origin), dist = lenXZ(d);
      if (dist > shape.range + r) return false;
      if (dist <= r) return true;
      const half = ((shape.angle ?? 90) / 2) * DEG, off = Math.abs(angleDiff(yaw, yawOf(d)));
      // a body on the edge of the arc still counts: widen by the angle its radius subtends
      return off <= half + Math.atan2(r, dist);
    }
    case 'line': {
      const d = sub(p, origin), along = d.x * fwd.x + d.z * fwd.z, side = Math.abs(d.x * fwd.z - d.z * fwd.x);
      return along >= -r && along <= shape.range + r && side <= (shape.width ?? 1) / 2 + r;
    }
  }
}

export function targetsIn(origin: V3, yaw: number, shape: ShapeDef, candidates: Fighter[]): Fighter[] {
  return candidates.filter((f) => !f.dead && inShape(origin, yaw, shape, f.body.pos, f.hitRadius));
}

/** Wound a fighter. Returns the damage that landed: 0 when dodged or fully shielded. */
export function hurt(ctx: CombatCtx, target: Fighter, amount: number, o: HurtOpts = {}): number {
  if (target.dead || amount <= 0) return 0;
  const pos = v3(target.body.pos.x, target.body.pos.y + target.body.height * 0.6, target.body.pos.z);
  if (target.status.invuln > 0) { ctx.events.push({ kind: 'dodged', pos, team: target.team }); return 0; }
  const s = target.status;
  let crit = false;
  if (o.canCrit && target.team === 'enemy' && ctx.rng() < ctx.player.vit.crit) { crit = true; amount *= 1.6; }
  if (s.mark > 0) amount *= 1 + s.markBonus;
  if (s.stance > 0) {
    amount *= 1 - s.stanceReduction;
    if (o.attacker && s.stanceCounter > 0 && !o.attacker.dead) hurt(ctx, o.attacker, s.stanceCounter, { from: target.body.pos, knockback: 5, stagger: 0.6 });
  }
  if (s.shield > 0) {
    const took = Math.min(s.shield, amount);
    s.shield -= took; amount -= took;
    ctx.events.push({ kind: 'blocked', pos, amount: Math.round(took), team: target.team });
    if (amount <= 0.5) return 0;
  }
  amount = Math.max(1, Math.round(amount));
  target.health = Math.max(0, target.health - amount);
  target.hitFlash = 0.18;
  s.sinceHurt = 0;
  if (o.mark) { s.mark = Math.max(s.mark, o.markFor ?? 5); s.markBonus = Math.max(s.markBonus, o.mark); }
  if (o.slow) { s.slow = Math.max(s.slow, o.slowFor ?? 2); s.slowMult = Math.min(s.slowMult, o.slow); }
  const from = o.from ?? target.body.pos;
  const away = norm(v3(target.body.pos.x - from.x, 0, target.body.pos.z - from.z));
  if (o.knockback) {
    const k = s.stance > 0 ? o.knockback * 0.2 : o.knockback;
    target.body.vel.x += away.x * k; target.body.vel.z += away.z * k;
  }
  if (o.up && s.stance <= 0) { target.body.vel.y = Math.max(target.body.vel.y, o.up); target.body.grounded = false; }
  const gain = target.team === 'player' ? ILHAM.perDamageTaken : ILHAM.perDamageDealt;
  ctx.player.ilham = Math.min(100, ctx.player.ilham + amount * gain * ctx.player.vit.ilhamRate);
  const killed = target.health <= 0;
  ctx.events.push({ kind: 'hit', pos, amount, crit, team: target.team });
  if (killed) {
    target.dead = true; target.deadFor = 0; s.stagger = 0;
    oneShot(target, 'death');
    ctx.events.push({ kind: 'death', pos: target.body.pos, team: target.team });
    if (target.team === 'enemy') { ctx.player.ilham = Math.min(100, ctx.player.ilham + ILHAM.perKill); ctx.onKill?.(target); }
  } else if (o.stagger && s.stance <= 0) {
    const st = target.team === 'player' ? o.stagger * 0.6 : o.stagger; // the player is harder to stun
    if (st > s.stagger) { s.stagger = st; oneShot(target, 'hit', Math.max(0.3, st)); }
  }
  return amount;
}

export function heal(ctx: CombatCtx, target: Fighter, amount: number): number {
  if (target.dead) return 0;
  const got = Math.min(amount, target.maxHealth - target.health);
  target.health += got;
  if (got > 0.5) ctx.events.push({ kind: 'heal', pos: v3(target.body.pos.x, target.body.pos.y + 1.2, target.body.pos.z), amount: Math.round(got), team: target.team });
  return got;
}
