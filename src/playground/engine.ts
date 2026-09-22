// The Playground's engine: a Scene on the shared stage. The same body, controller, camera rig and input as the
// fair, on the course's boxes, with the run's rules fed every simulation step: pads, pickups, rings, the gate, a
// fall. The camera settles to each section's direction so the gaps are always seen from behind; a marker on the
// surface below shows where a body in the air will land. Stars bank the moment they are picked up.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { classByKey } from '../../content';
import { CameraRig } from '../ceritera/game/camera';
import { heldOnly } from '../ceritera/game/controller';
import { loop } from '../ceritera/game/entities';
import { raycast } from '../ceritera/game/physics';
import { Sfx } from '../ceritera/game/sfx';
import { Sim, STEP } from '../ceritera/game/sim';
import { angleDiff, damp, lenXZ, v3 } from '../ceritera/game/v3';
import type { Library } from '../ceritera/game/anim';
import type { FairSink } from '../fair/input';
import { NexoActor, loadNexo, loadNexoLibrary } from '../fair/nexo';
import type { Quality, Scene, Stage } from '../fair/stage';
import { modal, toast } from '../state';
import { api } from '../net/api';
import { buzz, sfx, type Sfx as SfxName } from '../sfx';
import { FALL_Y, JUMP_PAD, PickupIndex, buildCourse, courseBoxes, crossed, platformUnder, sectionAt, type Course, type Gear, type Section } from './course';
import { GEAR, GEAR_READY, boostBody } from './gear';
import { Run, type RunEvent } from './run';
import { pgBalance, pgBest, pgCombo, pgControls, pgFade, pgFuel, pgGear, pgHint, pgMode, pgNearPortal, pgO2, pgRunStars, pgScore, pgStandNote, pgStore, pgSummary, pgUnlocks } from './state';
import type { PlaygroundStore } from './store';
import { PlaygroundWorld } from './world';

const ORBIT_HOLD_MS = 1500, CAM = { min: 2.6, max: 9 };
/** The star's chime, a step higher for each combo level. */
const CHIME: SfxName[] = ['chime1', 'chime2', 'chime3', 'chime4'];
/** The air's warning, once a run, at this many seconds left. */
const O2_WARN = 8;

/** A number that floats up from the body and fades: "+30 ×3". */
interface Float { el: HTMLDivElement; pos: THREE.Vector3; t: number; on: boolean }

export class PlaygroundEngine implements Scene {
  readonly sink: FairSink;
  readonly overlay: HTMLDivElement;
  readonly course: Course;
  private camera = new THREE.PerspectiveCamera(50, 1, 0.35, 1600);
  private rig: CameraRig;
  private sim: Sim;
  private world: PlaygroundWorld;
  private index: PickupIndex;
  /** the one store both worlds share: the server's once the backend has answered who this is, this device's until then */
  private store: PlaygroundStore;
  private actor: NexoActor | null = null;
  private gltf: GLTF | null = null; private lib: Library | null = null;
  private steps = new Sfx();
  private run: Run | null = null;
  private gear: Gear = 'boots';
  private acc = 0; private near: number[] = new Array(64).fill(0);
  private prev = v3(); private section: Section | null = null;
  private orbitAt = 0; private returnAt = 0; private padOn: string | null = null; private standOn: string | null = null;
  private labelEls: { el: HTMLDivElement; pos: THREE.Vector3; gear?: Gear }[] = [];
  private floats: Float[] = [];
  private lv = new THREE.Vector3();
  private hudAt = 0; private jumped = false; private disposed = false; private warned = false;
  private feet: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()]; private lastYaw = 0;
  /** the pinch's scale on the gear's camera distance */
  private zoom = 1;
  private tmpV = new THREE.Vector3(); private thrustOn = false;
  private stops: (() => void)[] = [];

  constructor(private stage: Stage, private quality: Quality, store: PlaygroundStore) {
    this.store = store;
    this.course = buildCourse();
    const boxes = courseBoxes(this.course);
    this.sim = new Sim('pengembara', classByKey('pengembara')!.base, { size: 200, boxes, props: [], spawn: { pos: v3(this.course.spawn.x, this.course.spawn.y, this.course.spawn.z), yaw: this.course.spawn.yaw }, enemies: [], lanterns: [] }, 1, GEAR.boots.movement);
    this.world = new PlaygroundWorld(this.course, quality === 'low', stage.shadowsWanted);
    this.index = new PickupIndex(this.course.pickups);
    this.rig = new CameraRig(this.camera, this.sim.world);
    this.rig.dist = GEAR.boots.camera.dist; this.rig.pitch = GEAR.boots.camera.pitch; this.rig.snapBehind(this.course.spawn.yaw);
    this.sink = {
      onTap: () => this.jump(),
      onOrbit: (dx, dy) => { this.orbitAt = performance.now(); this.rig.turn(dx * 2.2, dy * 1.6); },
      onZoom: (f) => { this.zoom = THREE.MathUtils.clamp(this.zoom * f, 0.6, 1.6); },
      onKey: (a) => { if (a === 'interact') this.jump(); },
      enabled: () => !modal.value,
    };
    this.overlay = Object.assign(document.createElement('div'), { className: 'lbls' }); this.overlay.style.display = 'none'; stage.host.appendChild(this.overlay);
    for (const l of this.world.labels) { const el = Object.assign(document.createElement('div'), { className: `lbl ${l.kind}`, textContent: l.text }); this.overlay.appendChild(el); this.labelEls.push({ el, pos: l.pos, gear: l.gear }); }
    for (let i = 0; i < 6; i++) { const el = Object.assign(document.createElement('div'), { className: 'lbl score' }); this.overlay.appendChild(el); this.floats.push({ el, pos: new THREE.Vector3(), t: 0, on: false }); }
    const wake = () => { this.world.sky.play(); this.steps.unlock(); };
    window.addEventListener('pointerdown', wake, { capture: true }); window.addEventListener('keydown', wake, { capture: true });
    this.stops.push(() => { window.removeEventListener('pointerdown', wake, { capture: true }); window.removeEventListener('keydown', wake, { capture: true }); });
    void Promise.all([loadNexo(), loadNexoLibrary()]).then(([g, lib]) => { if (this.disposed) return; this.gltf = g; this.lib = lib; this.actor?.dispose(); this.actor = this.makeActor(); });
    this.actor = this.makeActor();
    const s = this.store.get(); this.gear = s.gear; this.publishStore(); pgStore.value = this.store; this.markOwned();
    pgControls.value = { jump: () => this.jump(), hold: (on) => this.stage.input.hold(on), again: () => this.again(), leave: () => this.leaveRequested() };
    // the server's word on the balance and the gear, whenever it comes: republish, and step off a gear no longer owned
    this.stops.push(this.store.onChange(() => { this.publishStore(); this.markOwned(); if (!this.store.get().unlocks.includes(this.gear)) this.setGear('boots'); }));
    // a tab going away mid-run sends the run so far
    const hide = () => { if (document.hidden && this.run && !this.run.ended) this.store.flush(this.run.snapshot(), this.gear); };
    document.addEventListener('visibilitychange', hide); this.stops.push(() => document.removeEventListener('visibilitychange', hide));
    if (import.meta.env.DEV) (window as unknown as { __pg?: unknown }).__pg = this;
  }

  private makeActor(): NexoActor { const a = new NexoActor(this.gltf, this.lib, 'visitor', this.quality === 'high'); a.setBlob(!this.world.light.shadows); a.setLocomotion(this.gear === 'skates' ? 'skate' : 'walk'); this.world.scene.add(a.root); return a; }
  private publishStore() { const s = this.store.get(); pgBalance.value = s.stars; pgUnlocks.value = s.unlocks; pgBest.value = s.best?.score ?? null; pgGear.value = this.gear; }
  /** The stands of the gear this player owns read as theirs: no price on the label, the disc lit; the one just
   *  bought swells under the feet. */
  private markOwned(bought: Gear | null = null) {
    for (const g of this.store.get().unlocks) { const l = this.labelEls.find((x) => x.gear === g); if (l) l.el.textContent = GEAR[g].name; this.world.own(g, g === bought); }
  }

  /* ---------------- entering, leaving, the pad ---------------- */

  /** On the pad, facing the course, with the gear last chosen. */
  enter() {
    this.stage.use(this);
    this.gear = this.store.get().gear; // the kit worn in the fair is the gear here
    this.toPad(); pgMode.value = 'pad'; pgSummary.value = null;
    if (this.store.get().runs === 0) pgHint.value = true;
  }
  /** Leaving from the menu or Back: a run under way ends as if the air had run out. */
  leaveRequested() { if (this.run && !this.run.ended) { this.run.leave(); this.finish(); } }
  /** The fair takes the stage back; nothing here is thrown away. */
  onLeft() { pgNearPortal.value = false; pgFade.value = false; }

  private toPad() {
    const s = this.course.spawn; this.teleport(s.x, s.y, s.z, s.yaw); this.rig.snapBehind(s.yaw); this.section = null;
    this.setGear(this.gear); this.world.reset(); this.run = null; this.returnAt = 0;
  }
  private teleport(x: number, y: number, z: number, yaw: number) {
    const p = this.sim.player; p.body.pos.x = x; p.body.pos.y = y; p.body.pos.z = z; p.body.vel = v3(); p.body.grounded = false; p.yaw = yaw; p.peak = y;
    p.action = null; p.dodge = null; p.airDash = null; p.slamming = false; p.jumpBuffer = 0; loop(p, 'idle');
    this.prev.x = x; this.prev.y = y; this.prev.z = z; this.acc = 0; this.lastYaw = yaw;
    p.fuel = this.sim.movement.thrust?.fuel ?? 0; p.thrusting = false; // a full tank wherever the body is put down
    for (const r of this.world.ribbons) r.clear(); this.world.exhaust.clear();
  }
  private setGear(g: Gear) {
    this.gear = g; this.store.choose(g); pgGear.value = g;
    this.sim.movement = GEAR[g].movement; // the controller reads the tuning every step
    this.sim.player.fuel = GEAR[g].movement.thrust?.fuel ?? 0;
    this.actor?.setLocomotion(g === 'skates' ? 'skate' : 'walk');
    for (const r of this.world.ribbons) r.clear();
  }
  /** The summary's Again: back on the pad, straight over the line. */
  again() { this.toPad(); pgMode.value = 'pad'; pgSummary.value = null; }
  jump() { if (pgMode.value === 'summary') return; this.stage.input.press('jump'); }

  /* ---------------- the frame ---------------- */

  frame(now: number, dt: number) {
    const t = now / 1000, p = this.sim.player;
    this.world.update(t, dt);
    const it = this.stage.input.poll();
    if (pgMode.value === 'summary') { it.move.x = it.move.y = 0; it.jump = false; it.thrust = false; }
    this.acc += dt; let n = 0;
    while (this.acc >= STEP - 1e-9 && n < 6) {
      const step = n === 0 ? it : heldOnly(it);
      this.prev.x = p.body.pos.x; this.prev.y = p.body.pos.y; this.prev.z = p.body.pos.z;
      this.sim.camYaw = this.rig.yaw; this.sim.step(step, STEP);
      p.stamina = p.vit.stamina; p.spirit = p.vit.spirit; // no stamina here either
      this.afterStep();
      this.acc -= STEP; n++;
    }
    const b = p.body, sp = lenXZ(b.vel), skating = this.gear === 'skates', flying = this.gear === 'jetpack' && !b.grounded;
    if (this.actor) {
      const yawRate = angleDiff(this.lastYaw, p.yaw) / Math.max(dt, 1e-3); this.lastYaw = p.yaw;
      this.actor.setLean(skating ? THREE.MathUtils.clamp(yawRate * 0.08 * Math.min(1, sp / 6), -0.35, 0.35) : 0);
      this.actor.setFlight(flying);
      // the run's forward lean on the floor; in flight the body tilts into its travel
      const lean = flying ? Math.min(1, sp / 7) * 0.35 : b.grounded ? Math.min(0.8, sp / 11) * (skating ? 0.22 : 0.16) : 0;
      this.actor.place(b.pos.x, b.pos.y, b.pos.z, p.yaw, lean); this.actor.attend(null); this.actor.applySim(p.anim, dt, sp);
      // the skates' ribbons: from the ankles, on the floor, while the body is on the ground and moving
      if (skating && b.grounded && sp > 4 && this.actor.feet(this.feet)) for (let k = 0; k < 2; k++) { const f = this.feet[k]!; this.world.ribbons[k]!.push(f.x, b.pos.y + 0.03, f.z, b.vel.x, b.vel.z); }
      // the jetpack's exhaust: from the backpack while the thrust is on
      if (p.thrusting && this.actor.back(this.tmpV)) this.world.exhaust.push(this.tmpV.x, this.tmpV.y, this.tmpV.z, b.vel.x || 0.01, b.vel.z);
    }
    for (const r of this.world.ribbons) r.update(dt); this.world.exhaust.update(dt);
    this.sounds(sp, b.grounded, dt);
    this.updateCamera(dt);
    this.world.light.follow(b.pos.x, b.pos.z);
    if (!b.grounded) { const hit = raycast(this.sim.world, v3(b.pos.x, b.pos.y + 0.1, b.pos.z), v3(0, -1, 0), 40); if (hit) this.world.placeMarker(b.pos.x, b.pos.y + 0.1 - hit.t, b.pos.z); else this.world.hideMarker(); } else this.world.hideMarker();
    if (this.returnAt && now >= this.returnAt) { this.returnAt = 0; this.toPad(); }
    this.updateLabels(dt);
    if (now - this.hudAt > 100) { this.hudAt = now; this.publishRun(); }
    this.stage.renderer.render(this.world.scene, this.camera);
  }

  /** One simulation step happened: what did the body do? */
  private afterStep() {
    const p = this.sim.player, b = p.body, pos = b.pos, tag = b.groundTag;
    // pads and stands, by the tag of what the feet stand on; a pad pushes once per touch (the tag's edge), however
    // fast the body crosses it, and the air between two pads clears the edge
    const pad = tag && (tag === 'jump' || tag.startsWith('boost:')) ? tag : null;
    if (pad !== this.padOn) {
      this.padOn = pad;
      if (pad === 'jump') { b.vel.y = JUMP_PAD; b.grounded = false; this.steps.play('jump'); }
      else if (pad) { const [dx, dz] = pad.slice(6).split(',').map(Number); boostBody(p, dx!, dz!); this.rig.kick(GEAR[this.gear].camera.kick); this.steps.play('dodge'); }
    }
    const stand = tag?.startsWith('stand:') ? tag.slice(6) : null;
    if (stand !== this.standOn) { this.standOn = stand; if (stand) this.onStand(stand as Gear); else pgStandNote.value = null; }
    const nearPortal = Math.hypot(pos.x - this.course.portal.x, pos.z - this.course.portal.z) < this.course.portal.r + 0.4;
    if (pgNearPortal.value !== nearPortal) pgNearPortal.value = nearPortal;
    if (this.jumped !== !b.grounded) { this.jumped = !b.grounded; if (b.grounded && pgHint.value && p.peak > pos.y + 0.5) pgHint.value = false; }

    if (pgMode.value === 'pad') { if (pos.y < FALL_Y) this.backToPad(); else if (crossed(this.course.start, this.prev, pos)) this.startRun(); return; }
    const run = this.run; if (!run || run.ended) return;
    run.tick(STEP);
    if (!this.warned && run.o2 <= O2_WARN && !run.ended) { this.warned = true; sfx('warn'); buzz([20, 30, 20]); } // the air's warning, once
    // pickups against the chest, every step
    const g = GEAR[this.gear], n = this.index.near(pos.x, pos.y + 0.9, pos.z, g.magnet + 0.36, this.near);
    for (let k = 0; k < n; k++) {
      const i = this.near[k]!; if (this.world.isCollected(i)) continue;
      const kind = this.course.pickups[i]!.kind; if (kind === 'cell' && !this.sim.movement.thrust) continue; // fuel is the Jetpack's
      this.world.collect(i);
      if (kind === 'star') run.star(); else if (kind === 'bubble') run.bubble(); else if (kind === 'cell') run.cell(); else run.diamond();
    }
    for (const r of this.course.rings) if (crossed(r, this.prev, pos)) run.ringAt(r.order);
    if (crossed(this.course.gate, this.prev, pos)) run.gate();
    if (pos.y < FALL_Y && !run.ended) { run.fall(); this.respawn(); }
    for (const e of run.drain()) this.onEvent(e, pos);
    if (run.ended) this.finish();
  }

  private startRun() {
    this.run = new Run(); this.world.reset(); this.warned = false; this.store.beginRun(); pgMode.value = 'run'; pgCombo.value = 1; pgRunStars.value = 0; pgScore.value = 0; pgO2.value = this.run.o2;
    sfx('go');
  }
  /** Off the pad's edge before a run: back on it, after the same dark moment. */
  private backToPad() { const s = this.course.spawn; this.teleport(s.x, s.y, s.z, s.yaw); this.rig.snapBehind(s.yaw); pgFade.value = true; setTimeout(() => { pgFade.value = false; }, 500); }
  /** Back at the last ring, the air a little thinner, after a short dark moment. */
  private respawn() {
    const run = this.run!, back = this.course.rings.find((k) => k.order === run.ring), r = back ? back.at : { x: this.course.start.x + 1, y: 0.05, z: 0, yaw: this.course.spawn.yaw };
    this.teleport(r.x, r.y, r.z, r.yaw); this.rig.snapBehind(r.yaw);
    pgFade.value = true; setTimeout(() => { pgFade.value = false; }, 500);
  }
  /** The run is over: stars were banked as they came; the score and the best are recorded; the summary is up. */
  private finish() {
    const run = this.run; if (!run?.ended) return;
    const s = run.ended, newBest = this.store.record(s, this.gear); this.publishStore();
    pgSummary.value = { ...s, gear: this.gear, newBest, balance: this.store.get().stars };
    pgMode.value = 'summary'; this.publishRun();
    this.returnAt = performance.now() + 900;
    api.track('playground_run', { gear: this.gear, score: s.score, stars: s.stars, comboMax: s.comboMax, seconds: s.seconds, finished: s.reason === 'gate' });
    if (s.reason === 'gate') { sfx('big'); buzz([18, 40, 18]); } else if (s.reason === 'o2') sfx('warn');
  }
  private onStand(gear: Gear) {
    const g = GEAR[gear], s = this.store.get(), tip = gear === 'skates' ? ' · hold the rim to tuck' : gear === 'jetpack' ? ' · hold Jump to fly' : '';
    if (s.unlocks.includes(gear)) { this.setGear(gear); pgStandNote.value = `${g.name} on${tip}`; sfx('tap'); return; }
    if (!GEAR_READY[gear]) { pgStandNote.value = `${g.name}: coming soon`; return; }
    if (this.store.spend(gear, g.price)) { this.publishStore(); this.setGear(gear); this.markOwned(gear); pgStandNote.value = `${g.name} unlocked${tip}`; sfx('big'); buzz([18, 40, 18]); toast(`${g.name} are yours`, `${g.price} stars well spent`, 'xp'); api.track('playground_unlock', { gear }); }
    else pgStandNote.value = `${g.name}: ${g.price - s.stars} more stars`;
  }

  private onEvent(e: RunEvent, pos: { x: number; y: number; z: number }) {
    switch (e.kind) {
      case 'star': this.store.addStars(1); pgBalance.value = this.store.get().stars; pgRunStars.value = this.run!.stars; pgCombo.value = e.combo; this.float(`+${e.score}${e.combo > 1 ? ` ×${e.combo}` : ''}`, pos); sfx(CHIME[e.combo - 1] ?? 'chime4'); buzz(8); break;
      case 'combo': pgCombo.value = e.combo; if (e.combo > 1) sfx('big'); break; // a combo step plays the rise
      case 'bubble': this.float('+6 s', pos); sfx('go'); break;
      case 'diamond': this.store.addStars(25); pgBalance.value = this.store.get().stars; pgRunStars.value = this.run!.stars; this.float('+300 ◆', pos); sfx('big'); buzz([18, 40, 18]); break;
      case 'ring': sfx('tap'); break;
      case 'fall': sfx('warn'); buzz(30); break;
      case 'cell': { const p = this.sim.player, T = this.sim.movement.thrust; if (T) p.fuel = Math.min(T.fuel, p.fuel + T.fuel / 2); this.float('+fuel', pos); sfx('go'); break; }
      case 'end': break;
    }
  }
  private publishRun() {
    const r = this.run; if (!r) return;
    const o2 = Math.ceil(r.o2); if (pgO2.value !== o2) pgO2.value = o2;
    if (pgScore.value !== r.score) pgScore.value = r.score;
    const fuel = Math.round(this.sim.player.fuel); if (pgFuel.value !== fuel) pgFuel.value = fuel;
  }

  /* ---------------- camera, sounds, labels ---------------- */

  /** Behind the body, facing the way the section runs (the body's own heading counts for a quarter), unless the
   *  player has just dragged to look. The gear sets the distance and the tilt. */
  private updateCamera(dt: number) {
    const p = this.sim.player, pos = p.body.pos, g = GEAR[this.gear].camera;
    const sec = sectionAt(this.course, pos.x, pos.z, this.gear); if (sec) this.section = sec;
    if (performance.now() - this.orbitAt > ORBIT_HOLD_MS) {
      const base = this.section?.yaw ?? p.yaw, want = base + angleDiff(base, p.yaw) * 0.25;
      this.rig.yaw += angleDiff(this.rig.yaw, want) * (1 - Math.exp(-2.5 * dt));
      // the jetpack's camera tips up a little while climbing and down while falling
      const pitch = this.sim.movement.thrust ? THREE.MathUtils.clamp(g.pitch - (p.body.vel.y / 6.5) * 0.15, 0.15, 0.5) : g.pitch;
      this.rig.pitch = damp(this.rig.pitch, pitch, 3, dt);
    }
    if (p.thrusting) this.rig.kick(g.kick);
    this.rig.dist = damp(this.rig.dist, THREE.MathUtils.clamp(g.dist * this.zoom, CAM.min, CAM.max), 3, dt);
    this.rig.update(dt, pos, p.body.vel, null, p.gait === 'sprint');
    const under = platformUnder(this.course, this.camera.position.x, this.camera.position.y, this.camera.position.z);
    if (under && this.camera.position.y < under.y + 0.5) this.camera.position.y = under.y + 0.5;
  }
  private stepAcc = 0;
  private sounds(speed: number, grounded: boolean, dt: number) {
    for (const ev of this.sim.events) { if (ev.kind === 'jump' || ev.kind === 'airjump') this.steps.play('jump'); else if (ev.kind === 'land') this.steps.play('land', 0.4 + (ev.power ?? 0)); }
    this.sim.events.length = 0;
    if (this.sim.player.thrusting !== this.thrustOn) { this.thrustOn = this.sim.player.thrusting; if (this.thrustOn) this.steps.play('dodge', 0.5); } // the thrust catching
    if (!grounded || speed < 0.8 || this.gear === 'skates') { this.stepAcc = 0; return; } // skates glide: no footsteps
    this.stepAcc += speed * dt; const stride = this.sim.player.gait === 'sprint' ? 2.1 : 1.45;
    if (this.stepAcc >= stride) { this.stepAcc -= stride; this.steps.play('step', 0.4 + speed / 12); }
  }
  private float(text: string, at: { x: number; y: number; z: number }) {
    const f = this.floats.find((x) => !x.on) ?? this.floats.reduce((a, b) => (a.t > b.t ? a : b));
    f.el.textContent = text; f.pos.set(at.x, at.y + 2.1, at.z); f.t = 0; f.on = true;
  }
  private updateLabels(dt: number) {
    const w = this.stage.host.clientWidth, h = this.stage.host.clientHeight, v = this.lv;
    const put = (el: HTMLDivElement, pos: THREE.Vector3, opacity: number) => {
      v.copy(pos).project(this.camera);
      if (v.z >= 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05 || opacity <= 0) { el.style.opacity = '0'; return; }
      el.style.opacity = opacity.toFixed(2); el.style.transform = `translate(-50%,-50%) translate(${Math.round((v.x * 0.5 + 0.5) * w)}px,${Math.round((-v.y * 0.5 + 0.5) * h)}px)`;
    };
    for (const l of this.labelEls) put(l.el, l.pos, this.camera.position.distanceTo(l.pos) < 40 ? 1 : 0);
    for (const f of this.floats) { if (!f.on) { f.el.style.opacity = '0'; continue; } f.t += dt; f.pos.y += dt * 1.3; put(f.el, f.pos, f.t < 0.5 ? 1 : 1 - (f.t - 0.5) / 0.4); if (f.t > 0.9) f.on = false; }
  }

  /* ---------------- the stage's calls ---------------- */

  resize(w: number, h: number) { this.camera.aspect = w / h; this.rig.baseFov = w < h ? 58 : 50; this.camera.updateProjectionMatrix(); }
  applyLevel(_level: number, shadows: boolean, mapSize: number) { this.world.light.setShadows(this.world.scene, shadows, mapSize); this.actor?.setBlob(!shadows); }
  perfExtra(): string { return `playground · ${pgMode.value}`; }
  dispose() {
    this.disposed = true; this.stops.forEach((s) => s()); this.actor?.dispose(); this.steps.dispose(); this.world.dispose();
    this.overlay.remove();
    if (pgControls.value) pgControls.value = null;
  }
}

