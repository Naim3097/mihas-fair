import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOVEMENT, classByKey, skillOf } from '../../../content';
import { emptyIntent, type Intent } from './controller';
import { Sim, STEP } from './sim';
import { HALL } from './level';
import { newBody, overlapsAny } from './physics';
import { lenXZ, v3 } from './v3';

const base = (cls: 'ilmuwan' | 'pendekar' | 'pengembara') => classByKey(cls)!.base;
const run = (sim: Sim, it: Intent, seconds: number) => { for (let i = 0; i < Math.round(seconds / STEP); i++) sim.step(it, STEP); };
const press = (sim: Sim, it: Partial<Intent>) => { sim.step({ ...emptyIntent(), ...it }, STEP); };
const forward: Intent = { ...emptyIntent(), move: { x: 0, y: 1 } };
const skill = (slot: 'q' | 'w' | 'e' | 'r') => ({ skills: { q: slot === 'q', w: slot === 'w', e: slot === 'e', r: slot === 'r' } });

test('running: the avatar reaches the jog speed heading away from the camera, and stops when the stick is released', () => {
  const sim = new Sim('ilmuwan', base('ilmuwan'));
  sim.camYaw = Math.PI; // face south, where the hall is empty
  const z0 = sim.player.body.pos.z;
  run(sim, forward, 1.5);
  assert.ok(Math.abs(lenXZ(sim.player.body.vel) - MOVEMENT.run) < 0.05, `speed ${lenXZ(sim.player.body.vel)}`);
  assert.ok(sim.player.body.pos.z < z0 - 4, 'went south');
  assert.equal(sim.player.anim.key, 'run');
  run(sim, emptyIntent(), 1);
  assert.ok(lenXZ(sim.player.body.vel) < 0.01);
  assert.equal(sim.player.anim.key, 'idle');
});

test('sprinting drains stamina and builds past the sprint speed; standing still gets it back', () => {
  const sim = new Sim('pendekar', base('pendekar'));
  sim.camYaw = Math.PI / 2; // east, along the empty south aisle
  const p = sim.player, full = p.stamina;
  run(sim, { ...forward, sprint: true }, 2);
  assert.ok(p.stamina < full - 10, `stamina ${p.stamina}`);
  assert.ok(lenXZ(p.body.vel) > MOVEMENT.sprint + 0.5, `speed ${lenXZ(p.body.vel)}`);
  assert.equal(p.anim.key, 'sprint');
  run(sim, emptyIntent(), 4);
  assert.ok(p.stamina > full - 1);
});

test('a jump peaks near 1.1 m; a second press near the apex adds another hop; a third does nothing', () => {
  const sim = new Sim('ilmuwan', base('ilmuwan'));
  const p = sim.player;
  run(sim, emptyIntent(), 0.2);
  press(sim, { jump: true });
  let top = 0;
  for (let i = 0; i < 17; i++) { sim.step(emptyIntent(), STEP); top = Math.max(top, p.body.pos.y); }
  assert.ok(top > 0.9 && top < 1.2, `single jump apex ${top}`);
  assert.ok(!p.body.grounded);
  press(sim, { jump: true });
  assert.ok(p.body.vel.y > 5, 'the air jump kicked');
  assert.equal(p.airJumps, 0);
  press(sim, { jump: true });
  assert.ok(p.body.vel.y < 6.6, 'no third jump');
  let top2 = top;
  for (let i = 0; i < 60; i++) { sim.step(emptyIntent(), STEP); top2 = Math.max(top2, p.body.pos.y); }
  assert.ok(top2 > 1.5, `double jump apex ${top2}`);
  run(sim, emptyIntent(), 1.5);
  assert.ok(p.body.grounded && Math.abs(p.body.pos.y) < 1e-3);
});

test('a running jump keeps its momentum in the air, and the stick steers without braking', () => {
  const sim = new Sim('pengembara', base('pengembara'));
  sim.camYaw = Math.PI / 2;
  const p = sim.player;
  run(sim, forward, 1.5);
  press(sim, { ...forward, jump: true });
  run(sim, emptyIntent(), 0.25);
  assert.ok(!p.body.grounded);
  assert.ok(Math.abs(lenXZ(p.body.vel) - MOVEMENT.run) < 0.05, `kept ${lenXZ(p.body.vel)} in the air`);
});

test('the strike chain wounds the training post in front and not the ones beside it', () => {
  const sim = new Sim('pendekar', base('pendekar'));
  const p = sim.player, post = sim.enemies[1]!, side = sim.enemies[0]!;
  p.body.pos = v3(0, 0, -27); p.yaw = 0; // two metres south of the middle post, facing it
  run(sim, emptyIntent(), 0.1);
  press(sim, { attack: true });
  run(sim, emptyIntent(), 0.4);
  assert.ok(post.health < post.maxHealth, 'the post took the first strike');
  assert.equal(side.health, side.maxHealth);
  press(sim, { attack: true });
  run(sim, emptyIntent(), 0.5);
  press(sim, { attack: true });
  run(sim, emptyIntent(), 0.8);
  assert.ok(sim.events.filter((e) => e.kind === 'hit' && e.team === 'enemy').length >= 3, 'three strikes landed');
  assert.ok(sim.combo.n >= 3);
});

test('skills spend semangat and go on cooldown; the ultimate waits for a full ilham bar', () => {
  const sim = new Sim('ilmuwan', base('ilmuwan'));
  const p = sim.player, q = skillOf('ilmuwan', 'q')!;
  p.yaw = Math.PI; // cast south into empty floor
  run(sim, emptyIntent(), 0.1);
  const spirit = p.spirit;
  press(sim, skill('q'));
  assert.ok(p.spirit <= spirit - q.cost + 0.5, 'paid');
  assert.ok(p.cooldowns.q > q.cooldown - 0.1);
  run(sim, emptyIntent(), 0.3);
  assert.equal(sim.projectiles.length, 3, 'three pages in the air');
  press(sim, skill('q'));
  assert.equal(sim.projectiles.length, 3, 'nothing more while on cooldown');
  press(sim, skill('r'));
  assert.equal(sim.slow.factor, 1, 'no ultimate without ilham');
  p.ilham = 100;
  press(sim, skill('r'));
  run(sim, emptyIntent(), 0.6);
  assert.equal(sim.slow.factor, 0.3, 'the world slowed');
  assert.equal(p.ilham, 0);
});

test('while time is slowed a chasing shadow covers far less ground than the player does', () => {
  const sim = new Sim('ilmuwan', base('ilmuwan'));
  const shadow = sim.enemies.find((e) => e.def.key === 'bayang-pengembara')!;
  shadow.body.pos = v3(0, 0, -36); shadow.alert = true; // behind the player, awake
  sim.player.body.pos = v3(0, 0, -30);
  sim.slow = { factor: 0.3, left: 5 };
  const p0 = sim.player.body.pos.z, e0 = shadow.body.pos.z;
  run(sim, forward, 1);
  const playerMoved = sim.player.body.pos.z - p0, shadowMoved = shadow.body.pos.z - e0;
  assert.ok(playerMoved > 3, `player ${playerMoved}`);
  assert.ok(shadowMoved > 0 && shadowMoved < playerMoved * 0.5, `shadow ${shadowMoved}`);
});

test('Tiger Leap carries the Pendekar eight metres and the landing wounds what stands there', () => {
  const sim = new Sim('pendekar', base('pendekar'));
  const p = sim.player, post = sim.enemies[1]!;
  p.body.pos = v3(0, 0, -33); p.yaw = 0; // eight metres south of the middle post
  run(sim, emptyIntent(), 0.1);
  press(sim, skill('w'));
  let top = 0;
  for (let i = 0; i < 120; i++) { sim.step(emptyIntent(), STEP); top = Math.max(top, p.body.pos.y); }
  assert.ok(top > 2.5, `leapt ${top} high`);
  assert.ok(p.body.grounded);
  assert.ok(Math.abs(p.body.pos.z - -25) < 1.6, `landed at z ${p.body.pos.z}`);
  assert.ok(post.health < post.maxHealth, 'the post was under the landing');
});

test('a shadow that notices the player closes in and lands a blow; rolling through the swings is untouchable', () => {
  const sim = new Sim('ilmuwan', base('ilmuwan'), undefined, 7);
  const p = sim.player, shadow = sim.enemies.find((e) => e.def.key === 'bayang-pendekar')!;
  shadow.body.pos = v3(0, 0, -34); shadow.yaw = 0;
  run(sim, emptyIntent(), 4);
  assert.ok(p.health < p.maxHealth, 'the shadow got through');
  assert.ok(sim.events.some((e) => e.kind === 'swing' && e.team === 'enemy'));
  const before = p.health;
  let dodged = 0;
  for (let i = 0; i < 240; i++) {
    const swing = sim.events.some((e) => e.kind === 'swing' && e.team === 'enemy');
    sim.events.length = 0;
    sim.step({ ...emptyIntent(), dodge: swing }, STEP);
    dodged += sim.events.filter((e) => e.kind === 'dodged').length;
  }
  assert.ok(dodged > 0 || p.health === before, 'the roll made at least one swing miss');
});

test('a kill pays the shadow’s XP, counts, and the shadow comes back after a while', () => {
  const sim = new Sim('pendekar', base('pendekar'));
  const shadow = sim.enemies.find((e) => e.def.key === 'bayang-ilmuwan')!;
  shadow.health = 5;
  sim.player.body.pos = v3(shadow.body.pos.x, 0, shadow.body.pos.z - 1.5); sim.player.yaw = 0;
  run(sim, emptyIntent(), 0.1);
  press(sim, { attack: true });
  run(sim, emptyIntent(), 0.5);
  assert.ok(shadow.dead);
  assert.equal(sim.xpPending, shadow.def.xp);
  assert.equal(sim.player.kills, 1);
  assert.ok(sim.player.ilham > 0);
  run(sim, emptyIntent(), 9);
  assert.ok(!shadow.dead && shadow.health === shadow.maxHealth, 'back at full health');
});

test('the Pengembara’s Q pushes a shadow back and staggers it', () => {
  const sim = new Sim('pengembara', base('pengembara'));
  const shadow = sim.enemies.find((e) => e.def.key === 'bayang-pendekar')!;
  shadow.body.pos = v3(-20, 0, -10); shadow.home = v3(-20, 0, -10); // open floor in the west
  sim.player.body.pos = v3(-20, 0, -11.8); sim.player.yaw = 0;
  run(sim, emptyIntent(), 0.1);
  const z0 = shadow.body.pos.z;
  press(sim, skill('q'));
  run(sim, emptyIntent(), 0.25);
  assert.ok(shadow.status.stagger > 0 || shadow.anim.key === 'hit', 'staggered');
  run(sim, emptyIntent(), 0.5);
  assert.ok(shadow.body.pos.z > z0 + 0.5, `knocked back ${shadow.body.pos.z - z0}`);
});

test('nobody spawns inside a shelf, a table or a column, and everybody spawns on a floor', () => {
  const world = { boxes: HALL.boxes };
  for (const e of [HALL.spawn, ...HALL.enemies]) {
    const b = newBody(v3(e.pos.x, e.pos.y + 0.01, e.pos.z), MOVEMENT.radius, MOVEMENT.height);
    assert.ok(!overlapsAny(world, b), `spawn at ${e.pos.x},${e.pos.y},${e.pos.z} is inside something`);
    b.pos.y -= 0.02;
    assert.ok(overlapsAny(world, b), `spawn at ${e.pos.x},${e.pos.y},${e.pos.z} has no floor under it`);
  }
});

test('a tap in a frame slightly shorter than a step is kept until the step runs, and fires once', () => {
  const sim = new Sim('ilmuwan', base('ilmuwan'));
  run(sim, emptyIntent(), 0.2);
  sim.step({ ...emptyIntent(), jump: true }, STEP * 0.9); // no step runs yet
  assert.ok(sim.player.body.grounded, 'nothing happened in the short frame');
  sim.step(emptyIntent(), STEP * 0.9); // the step runs now, with the earlier tap
  assert.ok(sim.player.body.vel.y > 5, 'the jump fired');
  for (let i = 0; i < 60; i++) sim.step(emptyIntent(), STEP);
  assert.ok(sim.player.body.grounded, 'and only once');
});
