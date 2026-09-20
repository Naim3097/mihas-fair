// Structural checks that types cannot express: references resolve, graphs are connected, copy is complete.
// Run by content.test.ts; also usable by tools before an export. Returns problems, never throws.
import { CLASSES } from './classes.js';
import { COPY } from './copy.js';
import { DIALOGUES } from './dialogue.js';
import { ITEMS } from './items.js';
import { PROGRESSION } from './progression.js';
import { QUESTS } from './quests.js';
import { STATS } from './stats.js';
import { AREAS, NPCS } from './world.js';
import { CLASS_KEYS, STAT_KEYS, type Text } from './types.js';

const KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const text = (t: Text | undefined, where: string, out: string[]) => {
  if (!t) { out.push(`${where}: missing text`); return; }
  if (!t.bm?.trim()) out.push(`${where}: empty bm`);
  if (!t.en?.trim()) out.push(`${where}: empty en`);
};
const unique = (keys: string[], what: string, out: string[]) => {
  const seen = new Set<string>();
  for (const k of keys) { if (!KEY.test(k)) out.push(`${what} key "${k}" is not kebab-case`); if (seen.has(k)) out.push(`${what} key "${k}" is repeated`); seen.add(k); }
};

export function validateClasses(): string[] {
  const out: string[] = [];
  unique(CLASSES.map((c) => c.key), 'class', out);
  for (const k of CLASS_KEYS) if (!CLASSES.some((c) => c.key === k)) out.push(`class "${k}" from the board is missing`);
  const sums = new Set<number>();
  for (const c of CLASSES) {
    text(c.title, `${c.key}.title`, out); text(c.blurb, `${c.key}.blurb`, out); text(c.perk, `${c.key}.perk`, out);
    if (c.motto) text(c.motto, `${c.key}.motto`, out);
    if (!c.look.length) out.push(`${c.key}: no costume notes`);
    c.look.forEach((l, i) => text(l, `${c.key}.look[${i}]`, out));
    sums.add(STAT_KEYS.reduce((n, k) => n + c.base[k], 0));
    for (const k of STAT_KEYS) if (!Number.isInteger(c.base[k]) || c.base[k] < 0) out.push(`${c.key}: bad base ${k}`);
    if (!c.growth.length) out.push(`${c.key}: no growth pattern`);
    for (const step of c.growth) for (const k of step) if (!(STAT_KEYS as readonly string[]).includes(k)) out.push(`${c.key}: growth names unknown stat "${k}"`);
    if (!c.portrait) out.push(`${c.key}: no portrait`);
  }
  if (sums.size > 1) out.push(`classes do not start with the same number of stat points: ${[...sums].join(', ')}`);
  if (STATS.length !== STAT_KEYS.length) out.push('stats.ts does not define every stat');
  for (const s of STATS) { text(s.name, `stat.${s.key}.name`, out); text(s.blurb, `stat.${s.key}.blurb`, out); }
  return out;
}

export function validateProgression(): string[] {
  const out: string[] = [];
  const p = PROGRESSION;
  if (p.xpToNext.length !== p.maxLevel - 1) out.push(`progression: ${p.xpToNext.length} steps for ${p.maxLevel} levels`);
  for (let i = 1; i < p.xpToNext.length; i++) if (p.xpToNext[i]! <= p.xpToNext[i - 1]!) out.push(`progression: level ${i + 1} is not harder than level ${i}`);
  return out;
}

export function validateWorld(): string[] {
  const out: string[] = [];
  unique(AREAS.map((a) => a.key), 'area', out);
  const keys = new Set(AREAS.map((a) => a.key));
  for (const a of AREAS) {
    text(a.name, `${a.key}.name`, out); text(a.blurb, `${a.key}.blurb`, out); if (a.sign) text(a.sign, `${a.key}.sign`, out);
    if (a.floors < 1) out.push(`${a.key}: floors < 1`);
    for (const c of a.connections) {
      if (!keys.has(c)) out.push(`${a.key} connects to unknown area "${c}"`);
      else if (!AREAS.find((b) => b.key === c)!.connections.includes(a.key)) out.push(`${a.key} → ${c} is not listed from both sides`);
    }
  }
  const spawns = AREAS.filter((a) => a.spawn);
  if (spawns.length !== 1) out.push(`exactly one area must be the spawn (found ${spawns.length})`);
  // every area is reachable from the spawn on foot
  if (spawns[0]) {
    const seen = new Set<string>([spawns[0].key]), stack = [spawns[0].key];
    while (stack.length) {
      const here = stack.pop()!;
      for (const c of AREAS.find((a) => a.key === here)?.connections ?? []) if (!seen.has(c)) { seen.add(c); stack.push(c); }
    }
    for (const a of AREAS) if (!seen.has(a.key)) out.push(`${a.key} cannot be reached from ${spawns[0].key}`);
  }
  unique(NPCS.map((n) => n.key), 'npc', out);
  for (const n of NPCS) { text(n.title, `${n.key}.title`, out); text(n.blurb, `${n.key}.blurb`, out); if (!keys.has(n.area)) out.push(`npc ${n.key} stands in unknown area "${n.area}"`); }
  return out;
}

export function validateItems(): string[] {
  const out: string[] = [];
  unique(ITEMS.map((i) => i.key), 'item', out);
  for (const i of ITEMS) {
    text(i.name, `${i.key}.name`, out); text(i.blurb, `${i.key}.blurb`, out); if (i.quote) text(i.quote, `${i.key}.quote`, out);
    if (i.kind === 'equipment' && !i.slot) out.push(`${i.key}: equipment without a slot`);
    if (i.kind !== 'equipment' && i.slot) out.push(`${i.key}: slot on a non-equipment item`);
  }
  return out;
}

export function validateQuests(): string[] {
  const out: string[] = [];
  unique(QUESTS.map((q) => q.key), 'quest', out);
  const areas = new Set(AREAS.map((a) => a.key)), npcs = new Set(NPCS.map((n) => n.key)), items = new Set(ITEMS.map((i) => i.key));
  for (const q of QUESTS) {
    text(q.name, `${q.key}.name`, out); text(q.summary, `${q.key}.summary`, out); text(q.blurb, `${q.key}.blurb`, out);
    if (!q.objectives.length) out.push(`${q.key}: no objectives`);
    if (!(q.xp > 0)) out.push(`${q.key}: no xp`);
    unique(q.objectives.map((o) => o.key), `${q.key} objective`, out);
    for (const o of q.objectives) {
      text(o.text, `${q.key}/${o.key}.text`, out);
      const where = `${q.key}/${o.key}`;
      switch (o.kind) {
        case 'enter-area': case 'discover-area': if (!areas.has(o.target)) out.push(`${where}: unknown area "${o.target}"`); break;
        case 'talk': case 'meet': if (!npcs.has(o.target)) out.push(`${where}: unknown npc "${o.target}"`); break;
        case 'find-item': case 'collect': if (!items.has(o.target)) out.push(`${where}: unknown item "${o.target}"`); break;
      }
      if (o.kind === 'collect' && !(o.count && o.count > 1)) out.push(`${where}: collect needs a count`);
      if (o.kind !== 'collect' && o.count) out.push(`${where}: count on a non-collect objective`);
    }
  }
  return out;
}

export function validateDialogue(): string[] {
  const out: string[] = [];
  unique(DIALOGUES.map((d) => d.key), 'dialogue', out);
  const npcs = new Set(NPCS.map((n) => n.key)), quests = new Map(QUESTS.map((q) => [q.key, q]));
  const effect = (e: { startQuest?: string; completeObjective?: string } | undefined, where: string) => {
    if (!e) return;
    if (e.startQuest && !quests.has(e.startQuest)) out.push(`${where}: starts unknown quest "${e.startQuest}"`);
    if (e.completeObjective) {
      const [q, o] = e.completeObjective.split('/');
      if (!q || !o || !quests.get(q)?.objectives.some((x) => x.key === o)) out.push(`${where}: completes unknown objective "${e.completeObjective}"`);
    }
  };
  for (const d of DIALOGUES) {
    if (!npcs.has(d.npc)) out.push(`${d.key}: unknown npc "${d.npc}"`);
    unique(d.nodes.map((n) => n.key), `${d.key} node`, out);
    const nodes = new Map(d.nodes.map((n) => [n.key, n]));
    if (!nodes.has(d.start)) out.push(`${d.key}: start node "${d.start}" missing`);
    for (const n of d.nodes) {
      const where = `${d.key}/${n.key}`;
      text(n.line, `${where}.line`, out);
      if (n.speaker !== 'player' && !npcs.has(n.speaker)) out.push(`${where}: unknown speaker "${n.speaker}"`);
      if (n.choices && n.next !== undefined) out.push(`${where}: has both choices and next`);
      if (!n.choices && n.next === undefined) out.push(`${where}: has neither choices nor next`);
      if (n.next && !nodes.has(n.next)) out.push(`${where}: next → unknown node "${n.next}"`);
      effect(n.effect, where);
      n.choices?.forEach((c, i) => { text(c.text, `${where}.choices[${i}]`, out); if (c.next && !nodes.has(c.next)) out.push(`${where}.choices[${i}] → unknown node "${c.next}"`); effect(c.effect, `${where}.choices[${i}]`); });
    }
    // every node is reachable from the start
    const seen = new Set<string>([d.start]), stack = [d.start];
    while (stack.length) {
      const n = nodes.get(stack.pop()!); if (!n) continue;
      for (const k of [n.next, ...(n.choices?.map((c) => c.next) ?? [])]) if (k && !seen.has(k)) { seen.add(k); stack.push(k); }
    }
    for (const n of d.nodes) if (!seen.has(n.key)) out.push(`${d.key}/${n.key} is unreachable`);
  }
  return out;
}

export function validateCopy(): string[] {
  const out: string[] = [];
  for (const [k, t] of Object.entries(COPY)) { if (!/^[a-z]+(\.[a-z]+)+$/.test(k)) out.push(`copy key "${k}" is not screen.thing`); text(t, `copy.${k}`, out); }
  return out;
}

export function validateAll(): string[] {
  return [...validateClasses(), ...validateProgression(), ...validateWorld(), ...validateItems(), ...validateQuests(), ...validateDialogue(), ...validateCopy(), ...validateSkills()];
}

import { SKILLS } from './skills.js';
import { MOVEMENT } from './movement.js';
import { ENEMIES } from './enemies.js';
import { ANIM_KEYS, SKILL_SLOTS } from './types.js';

/** Every class has exactly Q, W, E and an ultimate on R; every shape and number makes sense; the movement numbers are ordered. */
export function validateSkills(): string[] {
  const out: string[] = [];
  unique(SKILLS.map((s) => s.key), 'skill', out);
  for (const k of CLASS_KEYS) for (const slot of SKILL_SLOTS) { const n = SKILLS.filter((s) => s.cls === k && s.slot === slot).length; if (n !== 1) out.push(`${k}: ${n} skills on ${slot.toUpperCase()}`); }
  for (const s of SKILLS) {
    if (s.key !== `${s.cls}-${s.slot}`) out.push(`${s.key}: key should be ${s.cls}-${s.slot}`);
    text(s.name, `${s.key}.name`, out); text(s.blurb, `${s.key}.blurb`, out);
    if ((s.slot === 'r') !== !!s.ultimate) out.push(`${s.key}: only R is the ultimate`);
    if (!s.ultimate && !(s.cooldown > 0)) out.push(`${s.key}: needs a cooldown`);
    if (s.ultimate && s.cost !== 0) out.push(`${s.key}: the ultimate spends ilham, not semangat`);
    if (!(ANIM_KEYS as readonly string[]).includes(s.anim)) out.push(`${s.key}: unknown clip "${s.anim}"`);
    if (!s.effects.length) out.push(`${s.key}: does nothing`);
    for (const [k, v] of Object.entries({ windup: s.windup, recovery: s.recovery, cooldown: s.cooldown, cost: s.cost })) if (!Number.isFinite(v) || v < 0) out.push(`${s.key}: bad ${k}`);
    for (const e of s.effects) {
      if ('shape' in e) {
        const sh = e.shape;
        if (sh.kind === 'arc' && !sh.angle) out.push(`${s.key}: arc without an angle`);
        if (sh.kind === 'line' && !sh.width) out.push(`${s.key}: line without a width`);
        if (sh.kind !== 'self' && !(sh.range > 0)) out.push(`${s.key}: shape without range`);
      }
      if (e.kind === 'damage' && e.repeat && !(e.every && e.every > 0)) out.push(`${s.key}: repeats need "every"`);
    }
  }
  const M = MOVEMENT;
  if (!(M.walk < M.run && M.run < M.sprint && M.sprint <= M.sprintMax)) out.push('movement: walk < run < sprint <= sprintMax must hold');
  for (const [k, v] of Object.entries({ accel: M.accel, decel: M.decel, gravity: M.gravity, jump: M.jump, radius: M.radius, height: M.height, stepHeight: M.stepHeight })) if (!(v > 0)) out.push(`movement: ${k} must be positive`);
  if (M.stepHeight >= M.height / 2) out.push('movement: a step taller than half the body');
  unique(ENEMIES.map((e) => e.key), 'enemy', out);
  for (const e of ENEMIES) {
    text(e.name, `${e.key}.name`, out);
    if (e.model !== 'dummy' && !(CLASS_KEYS as readonly string[]).includes(e.model)) out.push(`${e.key}: unknown model "${e.model}"`);
    if (!(e.health > 0)) out.push(`${e.key}: no health`);
    if (!e.training && !(e.xp > 0)) out.push(`${e.key}: pays no xp`);
  }
  return out;
}
