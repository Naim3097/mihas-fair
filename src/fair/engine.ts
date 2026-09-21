// The Nexova fair's engine: the same surface Mission X's engine gives the interface (EngineApi), the same server,
// the same rules, with a different body in the world. The Ceritera controller, camera and animation library drive
// Nexo in third person over the MITEC floor plan; tap-to-walk, the guide trail, presence and the holograms of
// other people, labels, lifts, seats and photos are ported from src/game/engine.ts. Nothing here is a rule: the
// server decides everything, this only asks.
import * as THREE from 'three';
import { effect } from '@preact/signals';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Booth, Hologram, LevelData, Lift } from '../../shared/types';
import { STAMP_RADIUS_M, type Pose } from '../../shared/rules';
import { classByKey } from '../../content';
import { api, ApiError } from '../net/api';
import { sfx } from '../sfx';
import type { EngineApi } from '../game/engine-api';
import { hallCards, hallLine } from '../game/facts';
import { NavGrid, pathLength, pointAlong, type P2 } from '../game/nav';
import { BoothPicker } from '../game/pick';
import { placeAt, taken, type Seat } from '../game/places';
import { RemoteTrack } from '../game/remote';
import { atLaunchPad, currentDeck, distToGoal, goalVia, guideOn, guideTarget, herePlace, markSeen, me, modal, moveHint, myBooths, nearLift, nearStation, online, panelStation, photoShot, seated, seen, stampedSet, stationMap, stations, toast } from '../state';
import type { Library } from '../ceritera/game/anim';
import { CameraRig } from '../ceritera/game/camera';
import type { Intent } from '../ceritera/game/controller';
import { loop, oneShot } from '../ceritera/game/entities';
import { Sfx } from '../ceritera/game/sfx';
import { Sim } from '../ceritera/game/sim';
import { fromYaw, lenXZ, v3 } from '../ceritera/game/v3';
import { FairInput } from './input';
import { CX, CY, buildFairLevel, toPlan, toWorld, yScaleAt, type FairLevel } from './level';
import { NexoActor, loadNexo, loadNexoLibrary, type NexoRole } from './nexo';
import { FAIR_MOVEMENT } from './movement';
import { FAIR, FairWorld } from './world';
import { following, gpsTarget, setSiteDeck } from '../onsite';

export type Quality = 'high' | 'low';
export function pickQuality(): Quality {
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || mem <= 4 ? 'low' : 'high';
}

const PING_MS = 2000, TRAIL_STEP = 1.5, TRAIL_MAX = 220, BOOTH_LABELS = 6, BOOTH_LABEL_RANGE = 12, ARRIVAL_FRESH_MS = 10 * 60_000;
const CAM = { dist: 4.6, min: 2.4, max: 12, pitch: 0.3 };
const EMOTE = { wave: { clip: 'wave', ms: 2600 }, cheer: { clip: 'victory', ms: 2600 }, dance: { clip: 'dance', ms: 5200 } } as const;

interface Holo { actor: NexoActor; cls: Hologram['cls']; track: RemoteTrack; label: HTMLDivElement; seen: number; pose: string; tx: number; ty: number }
interface Label { text: string; pos: THREE.Vector3; kind: 'area' | 'gate' | 'hero' | 'lift' }

export class FairEngine implements EngineApi {
  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2600);
  private rig: CameraRig;
  private world: FairWorld;
  private fair: FairLevel;
  private sim: Sim;
  private nav: NavGrid;
  private picker: BoothPicker;
  private input: FairInput;
  private steps = new Sfx();
  private gltf: GLTF | null = null;
  private lib: Library | null = null;
  private player: NexoActor | null = null;
  private started = false;
  private holos = new Map<string, Holo>();
  private labelEls: { el: HTMLDivElement; l: Label }[] = [];
  private labelCache = new WeakMap<HTMLDivElement, { o: string; t: string }>();
  private boothEls: { el: HTMLDivElement; booth: Booth | null; pos: THREE.Vector3 }[] = [];
  private myLabel: HTMLDivElement;
  private buckets = new Map<string, Booth[]>();
  private halls: ReturnType<typeof hallCards>;
  private trail: THREE.InstancedMesh;
  private trailPath: P2[] = [];
  private trailAt = 0;
  private ping: { mesh: THREE.Mesh; t: number };
  /** On site: how sure GPS is of where the player stands, drawn on the floor around them. */
  private gpsRing: THREE.Mesh;
  /** On site: the GPS spot the current route was planned to, so a small wobble does not replan every frame. */
  private followTo: P2 | null = null;
  /** Whether GPS has placed the avatar since following began: the first placement jumps, after that it walks. */
  private gpsPlaced = false;
  private route: P2[] = [];
  private stall = 0;
  private replans = 0;
  private running = false; private last = 0; private pingAt = 0; private proxAt = 0; private firstPing = true; private arrivalSeen = 0;
  private fps = { acc: 0, n: 0, dpr: 1, at: 0 };
  private ui = 1;
  private pose: Pose = ''; private poseUntil = 0;
  private seat: Seat | null = null; private seatGoal: Seat | null = null; private wantBeforeSit = CAM.dist;
  private liftT = 1; private hallNow: number | null = null; private walked = 0; private picked: Booth | null = null;
  private stepAcc = 0; private introT = -1; private orbit = 0.6;
  private stops: (() => void)[] = [];
  private perf: { el: HTMLDivElement; t0: number; frames: number } | null = null;

  constructor(private host: HTMLElement, private level: LevelData, private quality: Quality) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); // throws without WebGL
    this.fps.dpr = Math.min(devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.fps.dpr);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.prepend(this.renderer.domElement);

    this.fair = buildFairLevel(level);
    this.sim = new Sim('pengembara', classByKey('pengembara')!.base, this.fair.def, 1, FAIR_MOVEMENT);
    this.world = new FairWorld(level, this.fair, quality === 'low');
    // the camera collides with what the body does (partitions, counters, glass): in a 2.5 m aisle it rides over the wall tops
    this.rig = new CameraRig(this.camera, this.sim.world);
    this.rig.dist = CAM.dist; this.rig.pitch = CAM.pitch;
    this.halls = hallCards(level);
    this.nav = new NavGrid(level);
    this.picker = new BoothPicker(level);
    for (const b of level.booths) { const k = `${Math.floor(b.x / 6)},${Math.floor(b.y / 6)}`; (this.buckets.get(k) ?? this.buckets.set(k, []).get(k)!).push(b); }

    const onFloor = { depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 } as const;
    this.trail = new THREE.InstancedMesh(new THREE.CircleGeometry(0.26, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: FAIR.blue, ...onFloor }), TRAIL_MAX);
    this.trail.count = 0; this.trail.frustumCulled = false; this.trail.renderOrder = 3; this.world.scene.add(this.trail);
    this.ping = { mesh: new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: FAIR.blue, transparent: true, ...onFloor })), t: 1 };
    this.ping.mesh.visible = false; this.ping.mesh.renderOrder = 3; this.world.scene.add(this.ping.mesh);
    this.gpsRing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: FAIR.blue, transparent: true, opacity: 0.45, ...onFloor }));
    this.gpsRing.visible = false; this.gpsRing.renderOrder = 3; this.world.scene.add(this.gpsRing);

    this.input = new FairInput(this.renderer.domElement, {
      onTap: (x, y) => this.tapMove(x, y),
      onOrbit: (dx, dy) => this.rig.turn(dx * 2.2, dy * 1.6),
      onZoom: (f) => { this.rig.dist = THREE.MathUtils.clamp(this.rig.dist * f, CAM.min, CAM.max); },
      onKey: (a) => { if (a === 'interact') void this.interact(); else if (a === 'map') modal.value = 'map'; else this.emote(a); },
      enabled: () => !modal.value,
    });
    this.stops.push(effect(() => { if (modal.value) this.input.release(); }));

    for (const l of this.world.labels) {
      const el = Object.assign(document.createElement('div'), { className: `lbl ${l.kind}`, textContent: l.text });
      host.appendChild(el); this.labelEls.push({ el, l });
    }
    for (let i = 0; i < BOOTH_LABELS; i++) { const el = Object.assign(document.createElement('div'), { className: 'lbl booth' }); host.appendChild(el); this.boothEls.push({ el, booth: null, pos: new THREE.Vector3() }); }
    this.myLabel = Object.assign(document.createElement('div'), { className: 'lbl holo me' }); host.appendChild(this.myLabel);

    const ro = new ResizeObserver(() => this.resize()); ro.observe(host); this.stops.push(() => ro.disconnect()); this.resize();
    const canvas = this.renderer.domElement;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.running = false; toast('Graphics paused', 'Reloading…', 'warn', 6000); setTimeout(() => location.reload(), 1500); });
    this.stops.push(effect(() => this.world.setStamped(stampedSet.value)));
    this.stops.push(effect(() => this.world.setStations(stations.value)));
    this.stops.push(effect(() => { void guideTarget.value; this.trailAt = 0; }));
    this.stops.push(effect(() => { const a = me.value?.anchor; if (a && this.started && a.at > this.arrivalSeen) this.arriveAt(a.stationId, a.at); }));
    this.stops.push(effect(() => { const role = this.role(); void me.value; this.player?.setRole(role); }));
    // the sky video and sounds may wait for the first gesture
    const wake = () => { this.world.playSky(); this.steps.unlock(); };
    window.addEventListener('pointerdown', wake, { capture: true }); window.addEventListener('keydown', wake, { capture: true });
    this.stops.push(() => { window.removeEventListener('pointerdown', wake, { capture: true }); window.removeEventListener('keydown', wake, { capture: true }); });

    if (new URLSearchParams(location.search).has('perf')) { this.perf = { el: Object.assign(document.createElement('div'), { className: 'perf' }), t0: performance.now(), frames: 0 }; host.appendChild(this.perf.el); }
    if (import.meta.env.DEV) (window as unknown as { __fair?: unknown }).__fair = this;

    void Promise.all([loadNexo(), loadNexoLibrary()]).then(([g, lib]) => { if (!this.running) return; this.gltf = g; this.lib = lib; this.rebuildBodies(); });
    this.loop(true);
  }

  private role(): NexoRole { return me.value?.cls === 'exhibitor' ? 'exhibitor' : 'visitor'; }
  private face = new THREE.Vector3();
  /** The face of the nearest other Nexo within reach, for the player's head to turn to. */
  private nearestFace(x: number, z: number, reach: number): THREE.Vector3 | null {
    let best: Holo | null = null, bd = reach;
    for (const o of this.holos.values()) { if (!o.actor.root.visible) continue; const p = o.actor.root.position, d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = o; } }
    return best ? this.face.set(best.actor.root.position.x, best.actor.root.position.y + 1.3, best.actor.root.position.z) : null;
  }
  private makeActor(role: NexoRole): NexoActor { const a = new NexoActor(this.gltf, this.lib, role); this.world.scene.add(a.root); return a; }
  /** The model file arrived: every body gets it, in place. */
  private rebuildBodies() {
    if (this.player) { this.player.dispose(); this.player = this.makeActor(this.role()); }
    for (const o of this.holos.values()) { o.actor.dispose(); o.actor = this.makeActor(o.cls === 'exhibitor' ? 'exhibitor' : 'visitor'); }
  }

  private resize() {
    const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight;
    this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.fov = w < h ? 58 : 50;
    this.ui = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;
    this.camera.updateProjectionMatrix();
  }

  /** Put the body somewhere on the plan, facing `yaw` (the rotation.y convention: π faces north). */
  private teleport(x: number, y: number, yaw: number) {
    const p = this.sim.player, w = toWorld(x, y, 0);
    p.body.pos.x = w.x; p.body.pos.y = 0.05; p.body.pos.z = w.z; p.body.vel = v3(); p.body.grounded = false; p.yaw = yaw; p.peak = 0;
    p.action = null; p.dodge = null; p.airDash = null; p.slamming = false;
    this.route = []; this.world.mark('goal', null); loop(p, 'idle');
  }

  /** Drop the player in at the Hall 8 entrance and hand over control. The camera settles in from above. */
  start(spawn: 'short' | 'epic') {
    const s = this.level.spawns[spawn], yaw = spawn === 'short' ? Math.PI : -Math.PI / 2;
    this.teleport(s.x, s.y, yaw);
    if (!this.player) this.player = this.makeActor(this.role());
    this.started = true;
    this.rig.dist = 30; this.rig.pitch = 0.6; this.rig.snapBehind(yaw); this.introT = 0;
    this.walked = 0; if (!seen.value.has('hint:move')) moveHint.value = true;
    this.firstPing = true; this.pingAt = 0; this.trailAt = 0;
    const a = me.value?.anchor;
    if (a && Date.now() - a.at < ARRIVAL_FRESH_MS) this.arriveAt(a.stationId, a.at); else if (a) this.arrivalSeen = a.at;
  }

  private arriveAt(stationId: string, at: number) {
    const b = this.level.booths.find((x) => x.id === stationId); this.arrivalSeen = at; if (!b) return;
    const p = this.nav.nearestWalkable(b.x, b.y) ?? { x: b.x, y: b.y };
    this.teleport(p.x, p.y, this.sim.player.yaw); this.firstPing = true; this.pingAt = 0; this.trailAt = 0;
  }

  private loop(first = false) {
    if (first) { this.running = true; this.last = performance.now(); }
    const frame = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      this.tick(now, dt); requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private tick(now: number, dt: number) {
    const t = now / 1000;
    this.world.update(t, dt);
    if (!this.started) {
      // behind the first screen: a slow turn around the X
      this.orbit += dt * 0.08; const h = this.world.heroPos;
      this.camera.position.set(h.x + Math.sin(this.orbit) * 26, 10, h.z + Math.cos(this.orbit) * 26); this.camera.lookAt(h.x, 3.5, h.z);
    } else {
      if (this.introT >= 0) { this.introT += dt; if (this.introT > 0.15) { this.rig.dist = CAM.dist; this.rig.pitch = CAM.pitch; this.introT = -1; } }
      const p = this.sim.player, it = this.intent(dt);
      if (this.seat) {
        if (it.move.x || it.move.y || it.jump || this.route.length) this.stand();
        else { const w = toWorld(this.seat.x, this.seat.y, this.seat.z); p.body.pos.x = w.x; p.body.pos.y = w.y; p.body.pos.z = w.z; p.yaw = this.seat.h; }
      }
      if (!this.seat) {
        this.sim.camYaw = this.rig.yaw; this.sim.step(it, dt);
        p.stamina = p.vit.stamina; p.spirit = p.vit.spirit; // no stamina at a fair: sprint as long as you like
      }
      this.afterMove(now, dt);
      this.proximity(now); this.updateTrail(now, t); this.sync(now); this.updateHolos(now, dt);
      const b = p.body, sp = lenXZ(b.vel);
      if (this.player) { this.player.place(b.pos.x, b.pos.y, b.pos.z, p.yaw, b.grounded ? Math.min(0.8, sp / 11) * 0.16 : 0); this.player.attend(this.nearestFace(b.pos.x, b.pos.z, 6)); this.player.applySim(p.anim, dt, sp); }
      this.sounds(sp, b.grounded, dt);
      this.updateCamera(dt);
    }
    this.updatePing(dt); this.updateGpsRing(); this.updateLabels();
    this.renderer.render(this.world.scene, this.camera);
    this.adaptQuality(now);
    if (this.perf) { const pf = this.perf; pf.frames++; if (now - pf.t0 >= 1000) { const i = this.renderer.info.render; pf.el.textContent = `${Math.round((pf.frames * 1000) / (now - pf.t0))} fps · ${i.calls} calls · ${Math.round(i.triangles / 1000)}k tris · dpr ${this.fps.dpr} · people ${this.holos.size}`; pf.t0 = now; pf.frames = 0; } }
  }

  /* ---------------- movement: the stick, or a route (a tap, "take me there", walking to a seat) ---------------- */

  private intent(dt: number): Intent {
    const it = this.input.poll();
    if (following()) { it.move.x = 0; it.move.y = 0; this.followGps(); } else this.gpsPlaced = false;
    if (it.move.x || it.move.y) { if (this.route.length) { this.route = []; this.world.mark('goal', null); } this.seatGoal = null; return it; }
    if (!this.route.length) return it;
    const pos = this.position, n = this.route[0]!, dx = n.x - pos.x, dy = n.y - pos.y, l = Math.hypot(dx, dy);
    if (l < 0.5) { this.route.shift(); this.stall = 0; if (!this.route.length && this.seatGoal) this.takeSeat(this.seatGoal); return it; }
    // plan (x east, y north) → world (x, −z) → screen (x right, y forward) for the controller
    const wx = dx / l, wz = -dy / l, f = fromYaw(this.rig.yaw), r = fromYaw(this.rig.yaw - Math.PI / 2);
    it.move.x = wx * r.x + wz * r.z; it.move.y = wx * f.x + wz * f.z;
    it.sprint = !following() && (l > 5 || this.route.length > 2); it.walk = following() && l < 3; // on site: a person's pace
    // pressed against something the grid did not know about: plan again from here, then give up
    if (lenXZ(this.sim.player.body.vel) < 0.3) {
      this.stall += dt;
      if (this.stall > 0.6) {
        this.stall = 0;
        if (++this.replans > 3) { this.route = []; this.replans = 0; this.world.mark('goal', null); }
        else { const path = this.nav.path(pos, this.route[this.route.length - 1]!); this.route = path ? path.slice(1) : []; }
      }
    } else this.stall = 0;
    return it;
  }

  /** On site: walk the avatar to where GPS says the person is — along the aisles, not through the stands, never faster
   *  than a person (the server holds on-site movement to walking pace). Only a different level is not walked to: the
   *  person took the stairs or a lift, so the avatar just appears there. */
  private followGps() {
    const f = gpsTarget.value; if (!f) return;
    const pos = this.position, d = Math.hypot(f.x - pos.x, f.y - pos.y), to = this.nav.nearestWalkable(f.x, f.y, 10) ?? f;
    if (!this.gpsPlaced || this.levelOf(pos) !== f.deck) { if (this.seat) this.stand(); this.teleport(to.x, to.y, this.sim.player.yaw); this.followTo = to; this.gpsPlaced = true; return; }
    // close enough: stand still (or stay seated), do not jitter with every wobble of the fix
    if (d < Math.max(1.5, Math.min(4, f.sigma * 0.3)) + (this.seat ? 3 : 0)) { if (!this.route.length) this.followTo = null; return; }
    if (this.followTo && this.route.length && Math.hypot(to.x - this.followTo.x, to.y - this.followTo.y) < 2) return;
    if (this.seat) this.stand();
    const path = this.nav.path(pos, to); if (!path) return;
    this.route = path.slice(1); this.replans = 0; this.stall = 0; this.followTo = to; this.seatGoal = null;
  }

  private updateGpsRing() {
    const f = following() ? gpsTarget.value : null;
    if (!f || f.sigma < 2) { this.gpsRing.visible = false; return; }
    const w = toWorld(f.x, f.y, 0.03), r = Math.min(50, f.sigma);
    this.gpsRing.position.set(w.x, w.y, w.z); this.gpsRing.scale.set(r, 1, r * yScaleAt(f.y)); this.gpsRing.visible = true;
  }

  private afterMove(now: number, dt: number) {
    const p = this.sim.player;
    if (moveHint.value && (this.walked += lenXZ(p.body.vel) * dt) > 4) { moveHint.value = false; markSeen('hint:move'); }
    if (this.pose && this.pose !== 'sit' && now > this.poseUntil) this.pose = '';
  }

  /** Footsteps and the sounds of the body, from what the sim did this frame. */
  private sounds(speed: number, grounded: boolean, dt: number) {
    for (const ev of this.sim.events) {
      if (ev.kind === 'jump' || ev.kind === 'airjump') this.steps.play('jump'); else if (ev.kind === 'land') this.steps.play('land', 0.4 + (ev.power ?? 0));
      else if (ev.kind === 'dodge' || ev.kind === 'dash') this.steps.play('dodge');
    }
    this.sim.events.length = 0;
    if (!grounded || speed < 0.8) { this.stepAcc = 0; return; }
    this.stepAcc += speed * dt;
    const stride = this.sim.player.gait === 'walk' ? 0.75 : this.sim.player.gait === 'sprint' ? 2.1 : 1.45;
    if (this.stepAcc >= stride) { this.stepAcc -= stride; this.steps.play('step', 0.4 + speed / 12); }
  }

  /* ---------------- things to do: expression, sitting, photos. None of it scores; all of it is seen by others. ---------------- */

  emote(pose: 'wave' | 'cheer' | 'dance', ms: number = EMOTE[pose].ms) {
    if (!this.started) return;
    if (this.seat) this.stand();
    const p = this.sim.player;
    this.pose = pose; this.poseUntil = performance.now() + ms;
    p.status.stagger = ms / 1000; // the body holds still for the gesture; the controller leaves the clip alone
    oneShot(p, EMOTE[pose].clip, ms / 1000);
    this.pingAt = Math.min(this.pingAt, performance.now() - PING_MS + 120);
  }
  jump() { if (!this.started) return; if (this.seat) this.stand(); this.input.press('jump'); }

  private freeSeats(pl: NonNullable<typeof herePlace.value>): Seat[] {
    const sitters = [...this.holos.values()].filter((o) => o.pose === 'sit');
    return pl.seats.filter((s, i) => !taken(pl, i) && !sitters.some((o) => Math.hypot(o.tx - s.x, o.ty - s.y) < 0.7));
  }
  sit() {
    const pl = herePlace.value; if (!this.started || !pl || this.seat) return;
    const pos = this.position, d = (s: Seat) => Math.hypot(s.x - pos.x, s.y - pos.y), s = this.freeSeats(pl).reduce<Seat | null>((best, x) => (!best || d(x) < d(best) ? x : best), null);
    if (!s) { toast('Every seat is taken', 'Try again in a moment'); return; }
    if (d(s) < 1.6) return this.takeSeat(s);
    const path = this.nav.path(pos, s); if (!path) return this.takeSeat(s);
    this.route = path.slice(1); this.replans = 0; this.seatGoal = s;
  }
  private takeSeat(s: Seat) {
    this.seatGoal = null;
    const pl = herePlace.value; if (pl && !this.freeSeats(pl).includes(s)) { this.sit(); return; }
    this.seat = s; this.route = [];
    const p = this.sim.player, w = toWorld(s.x, s.y, s.z); p.body.pos.x = w.x; p.body.pos.y = w.y; p.body.pos.z = w.z; p.body.vel = v3(); p.yaw = s.h;
    loop(p, 'idle');
    this.pose = 'sit'; sfx('sit'); seated.value = true; this.wantBeforeSit = this.rig.dist; this.rig.dist = Math.min(this.rig.dist, 4);
    this.pingAt = Math.min(this.pingAt, performance.now() - PING_MS + 120);
  }
  stand() {
    if (!this.seat) return;
    const at = this.nav.nearestWalkable(this.seat.x, this.seat.y, 4) ?? this.seat;
    this.seat = null; seated.value = false; this.pose = '';
    this.teleport(at.x, at.y, this.sim.player.yaw); this.rig.dist = this.wantBeforeSit;
  }

  async interact() {
    if (this.seat) return this.stand();
    const pl = herePlace.value, st = nearStation.value;
    if (pl?.verb === 'photo') return void (await this.photo());
    if (pl?.verb) return this.sit();
    if (st && !stampedSet.value.has(st.id)) await this.stamp(st);
  }

  /** A portrait of Nexo, waving, with whatever is behind: rendered off to the side at a fixed size, framed, and handed to the photo sheet. */
  async photo(): Promise<void> {
    const actor = this.player, p = this.sim.player; if (!actor || !this.started) return;
    if (this.seat) this.stand();
    const spot = herePlace.value?.spot; if (spot) this.teleport(spot.x, spot.y, spot.h);
    const pos = this.position;
    const room = (h: number) => { let d = 0; while (d < 6.8 && this.nav.walkable(pos.x + Math.sin(h) * (d + 0.5), pos.y - Math.cos(h) * (d + 0.5))) d += 0.5; return d; };
    let heading = p.yaw;
    if (!spot && room(heading) < 6) heading = [0.5, -0.5, 1, 0.25, -0.25, 0.75, -0.75].map((k) => heading + k * Math.PI).reduce((best, h) => (room(h) > room(best) ? h : best), heading);
    p.yaw = heading;
    const dist = spot ? 6.6 : Math.max(3, Math.min(6.6, room(heading) - 0.2));
    const W = 1080, H = 1350, cam = new THREE.PerspectiveCamera(Math.min(58, 31 * (6.6 / dist)), W / H, 0.5, 2600), r = this.renderer;
    const b = p.body, fwd = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)), at = new THREE.Vector3(b.pos.x, 1.1, b.pos.z);
    cam.position.copy(at).addScaledVector(fwd, dist).setY(1.5); cam.lookAt(at.x, 0.75, at.z);
    oneShot(p, 'wave', 2); actor.place(b.pos.x, b.pos.y, b.pos.z, heading); actor.applySim(p.anim, 0.7);
    const size = r.getSize(new THREE.Vector2()), pr = r.getPixelRatio(), trail = this.trail.visible;
    this.trail.visible = false; this.ping.mesh.visible = false; this.myLabel.style.opacity = '0';
    sfx('shutter'); r.setPixelRatio(1); r.setSize(W, H, false); r.render(this.world.scene, cam);
    const shot = await createImageBitmap(r.domElement).catch(() => null);
    r.setPixelRatio(pr); r.setSize(size.x, size.y, false); this.trail.visible = trail; loop(p, 'idle');
    if (!shot) { toast('Could not take the photo on this device', undefined, 'warn'); return; }
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!;
    g.drawImage(shot, 0, 0, W, H); g.fillStyle = '#fff'; g.fillRect(0, H - 170, W, 170);
    g.fillStyle = '#1b2130'; g.textBaseline = 'alphabetic'; g.font = '800 46px Urbanist, Arial'; g.fillText(me.value?.callsign ?? 'Mission X', 56, H - 96);
    g.fillStyle = '#5a6172'; g.font = '600 30px Urbanist, Arial'; g.fillText('at MIHAS 2026 · MITEC Kuala Lumpur · Nexova', 56, H - 50);
    g.textAlign = 'right'; g.fillStyle = '#1b2130'; g.font = '800 40px Urbanist, Arial'; g.fillText('MISSION X', W - 56, H - 96); g.fillStyle = '#2457f5'; g.font = '700 30px Urbanist, Arial'; g.fillText('Find the X · Booth 8H18A', W - 56, H - 50);
    photoShot.value = c.toDataURL('image/jpeg', 0.9); modal.value = 'photo'; api.track('photo', { place: herePlace.value?.id ?? null, world: 'nexova' });
  }

  /* ---------------- taps: a booth, or a point on the floor ---------------- */

  private rayAt(cx: number, cy: number): THREE.Ray {
    const r = this.renderer.domElement.getBoundingClientRect(), ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera); return ray.ray;
  }
  private boothAt(cx: number, cy: number): Booth | null {
    const { origin: o, direction: d } = this.rayAt(cx, cy);
    const po = toPlan(o), s = yScaleAt(po.y);
    return this.picker.pick({ ox: po.x, oy: po.y, oz: o.y, dx: d.x, dy: -d.z / s, dz: d.y });
  }
  private tapMove(cx: number, cy: number) {
    if (!this.started) return;
    if (following()) {
      const booth = this.boothAt(cx, cy);
      if (booth && nearStation.value?.id === booth.id) { panelStation.value = booth; modal.value = 'booth'; }
      else toast('You move by walking', 'At MIHAS your avatar follows your phone — walk to where you want to go', 'info', 3600);
      return;
    }
    const booth = this.boothAt(cx, cy); if (booth) return this.goToBooth(booth);
    const hit = this.rayAt(cx, cy).intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3()); if (!hit) return;
    this.pick(null); this.walkTo(toPlan(hit));
  }
  private walkTo(to: P2): boolean {
    if (this.seat) this.stand();
    this.seatGoal = null;
    const path = this.nav.path(this.position, to); if (!path) return false;
    this.route = path.slice(1); this.replans = 0; this.stall = 0;
    const end = path[path.length - 1]!, w = toWorld(end.x, end.y, 0.04); this.ping.mesh.position.set(w.x, w.y, w.z); this.ping.t = 0; sfx('go');
    return true;
  }
  private pick(b: Booth | null) { this.picked = b; this.world.mark('goal', b); }
  private goToBooth(b: Booth) {
    if (b.id === this.level.hero.id) { this.pick(null); this.walkTo(this.level.hero.dock); return; }
    if (nearStation.value?.id === b.id && !this.route.length) { panelStation.value = b; modal.value = 'booth'; return; }
    const pos = this.position, { w, d } = this.level.booth, off = (k: number) => k / 2 + 1.1, dist = (p: P2) => Math.hypot(p.x - pos.x, p.y - pos.y);
    const fronts = [{ x: b.x, y: b.y - off(d) }, { x: b.x, y: b.y + off(d) }, { x: b.x - off(w), y: b.y }, { x: b.x + off(w), y: b.y }].filter((p) => this.nav.walkable(p.x, p.y)).sort((p, q) => dist(p) - dist(q));
    const to = fronts[0] ?? this.nav.nearestWalkable(b.x, b.y, 10); if (!to) return;
    if (this.walkTo(to)) this.pick(b);
  }

  private updatePing(dt: number) {
    const p = this.ping; if (p.t >= 1) { p.mesh.visible = false; return; }
    p.t = Math.min(1, p.t + dt * 2.2); const s = 0.6 + p.t * 1.6;
    p.mesh.visible = true; p.mesh.scale.set(s, 1, s); (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - p.t;
  }

  get position(): P2 { return toPlan(this.sim.player.body.pos); }
  levelOf(p: P2): number { const d = this.level.decks; return (d.find((k) => p.y >= k.y0 - 15 && p.y <= k.y1 + 15) ?? d[0]!).level; }

  private get goal(): P2 {
    const target = guideTarget.value ?? this.level.hero.dock, pos = this.position, here = this.levelOf(pos), there = this.levelOf(target);
    if (here === there) { if (goalVia.value) goalVia.value = null; return target; }
    const lifts = this.level.lifts.filter((l) => l.deck === here), lift = lifts.reduce((a, b) => (Math.hypot(b.x - pos.x, b.y - pos.y) < Math.hypot(a.x - pos.x, a.y - pos.y) ? b : a), lifts[0]!);
    const via = `Take the ${lift.label.toLowerCase()} to Level ${there}`; if (goalVia.value !== via) goalVia.value = via;
    return lift;
  }

  /** Ride a lift: the same shaft on another level. The camera rises and comes back down. */
  useLift(to: Lift) {
    if (this.seat) this.stand();
    if (following()) setSiteDeck(to.deck);
    sfx(to.deck > this.levelOf(this.position) ? 'liftUp' : 'liftDown');
    const at = this.nav.nearestWalkable(to.x, to.y + 1.5) ?? { x: to.x, y: to.y };
    this.teleport(at.x, at.y, Math.PI);
    this.firstPing = true; this.pingAt = 0; this.trailAt = 0; this.liftT = 0;
    toast(`Level ${to.deck}`, this.level.decks.find((d) => d.level === to.deck)?.label.split(' · ')[1] ?? '', 'info', 2600);
  }

  autopilot() {
    if (following()) { guideOn.value = true; toast('Follow the trail', 'Walk along it — your avatar follows your phone', 'info', 3600); return; }
    if (this.seat) this.stand(); this.seatGoal = null; const p = this.nav.path(this.position, this.goal); if (p) { this.route = p.slice(1); this.replans = 0; } }

  /* ---------------- camera ---------------- */

  private updateCamera(dt: number) {
    if (this.liftT < 1) { this.liftT = Math.min(1, this.liftT + dt / 1.5); this.rig.dist = CAM.dist + 26 * Math.sin(Math.PI * this.liftT); }
    const p = this.sim.player;
    this.rig.update(dt, p.body.pos, p.body.vel, null, p.gait === 'sprint');
  }

  /* ---------------- what is next to the player: a booth, the X, a lift; and which booth names to show ---------------- */

  private proximity(now: number) {
    if (now - this.proxAt < 180) return; this.proxAt = now;
    const pos = this.position, gx = Math.floor(pos.x / 6), gy = Math.floor(pos.y / 6), around: { b: Booth; d: number }[] = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const b of this.buckets.get(`${gx + i},${gy + j}`) ?? []) {
      if (b.id === this.level.hero.id) continue;
      const d = Math.hypot(b.x - pos.x, b.y - pos.y); if (d < BOOTH_LABEL_RANGE) around.push({ b, d });
    }
    around.sort((a, b) => a.d - b.d);
    let best = around[0] && around[0].d < STAMP_RADIUS_M - 0.6 ? around[0].b : null;
    const pk = this.picked;
    if (pk) {
      const d = Math.hypot(pk.x - pos.x, pk.y - pos.y);
      if (d < STAMP_RADIUS_M - 0.6) best = pk;
      if (!this.route.length) { this.world.mark('goal', null); if (d > STAMP_RADIUS_M + 2) this.picked = null; }
    }
    if (nearStation.value?.id !== best?.id) nearStation.value = best;

    const sm = stationMap.value, named = around.filter((x) => sm.has(x.b.id)).slice(0, BOOTH_LABELS);
    this.boothEls.forEach((slot, i) => {
      const b = named[i]?.b ?? null; if (slot.booth === b) return;
      slot.booth = b;
      if (b) { slot.el.textContent = sm.get(b.id)?.company || b.name; slot.el.classList.toggle('online', sm.has(b.id)); const w = toWorld(b.x, b.y, this.level.booth.h + 2.7); slot.pos.set(w.x, w.y, w.z); }
    });

    const hall = this.level.halls.find((h) => pos.x >= h.x0 && pos.x <= h.x1 && pos.y >= h.y0 && pos.y <= h.y1)?.id ?? null;
    if (hall !== this.hallNow) { this.hallNow = hall; const c = this.halls.find((h) => h.hall === hall); if (c && markSeen(`hall:${c.hall}`)) toast(`Hall ${c.hall} · Level ${c.level}`, hallLine(c), 'info', 5200); }
    const place = placeAt(this.world.places, pos.x, pos.y);
    if (herePlace.value !== place) { herePlace.value = place; if (place && markSeen(`place:${place.id}`)) toast(place.name, place.blurb, 'info', 4800); }

    const dock = this.level.hero.dock, near = Math.hypot(dock.x - pos.x, dock.y - pos.y) < 4.2;
    if (atLaunchPad.value !== near) atLaunchPad.value = near;
    const lift = this.level.lifts.find((l) => Math.hypot(l.x - pos.x, l.y - pos.y) < 3.4) ?? null;
    if ((nearLift.value?.here ?? null) !== lift) nearLift.value = lift ? { here: lift, others: this.level.lifts.filter((l) => l.id === lift.id && l.deck !== lift.deck).sort((a, b) => a.deck - b.deck) } : null;
    const lv = this.levelOf(pos); if (currentDeck.value !== lv) currentDeck.value = lv;
  }

  /** The server checks distance against the position it last saw, so report position first. */
  async stamp(b: Booth) {
    const pos = this.position;
    try { await api.presence({ x: pos.x, y: pos.y, h: this.sim.player.yaw }); await api.stamp({ stationId: b.id, proof: 'virtual' }); this.emote('cheer', 1300); }
    catch (e) { toast(e instanceof ApiError ? e.message : 'Could not stamp', undefined, 'warn'); }
  }

  /* ---------------- guide trail ---------------- */

  private updateTrail(now: number, t: number) {
    const wanted = guideOn.value && (guideTarget.value != null || (!me.value?.mission.started && me.value?.cls !== 'exhibitor')); // until the mission starts, the trail leads to Lean X
    if (!wanted) { if (this.trail.count) { this.trail.count = 0; distToGoal.value = null; } return; }
    if (now - this.trailAt > 1200) {
      this.trailAt = now; this.trailPath = this.nav.path(this.position, this.goal) ?? [];
      const d = this.trailPath.length ? Math.round(pathLength(this.trailPath)) : null;
      distToGoal.value = d;
      if (guideTarget.value && !goalVia.value && d != null && d < 6) { toast('You have arrived', guideTarget.value.label); guideTarget.value = null; }
    }
    const L = pathLength(this.trailPath), n = Math.min(TRAIL_MAX, Math.floor(L / TRAIL_STEP)), M = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const d = (i + 1) * TRAIL_STEP, q = pointAlong(this.trailPath, d), s = 1 + 0.45 * Math.max(0, Math.sin(d * 0.3 - t * 4));
      M.makeScale(s, 1, s).setPosition(q.x - CX, 0.04, CY - q.y); this.trail.setMatrixAt(i, M);
    }
    this.trail.count = n; this.trail.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- other people ---------------- */

  private sync(now: number) {
    if (now - this.pingAt < PING_MS || document.hidden) return; this.pingAt = now;
    const spawn = this.firstPing; this.firstPing = false;
    const pos = this.position, p = this.sim.player;
    const pose = this.pose || (!p.body.grounded && !this.seat ? 'jump' : '');
    const onDeck = following(), sigma = onDeck ? Math.round(gpsTarget.value!.sigma) : undefined;
    api.presence({ x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), h: +p.yaw.toFixed(2), spawn, pose: pose || undefined, deck: onDeck || undefined, sigma })
      .then((r) => { online.value = r.online; this.applyHolos(r.holograms, now); }).catch(() => {});
  }

  private applyHolos(list: Hologram[], now: number) {
    for (const h of list.slice(0, this.quality === 'high' ? 24 : 12)) {
      let o = this.holos.get(h.id);
      if (o && o.cls !== h.cls) { o.actor.dispose(); o.label.remove(); this.holos.delete(h.id); o = undefined; }
      if (!o) {
        const actor = this.makeActor(h.cls === 'exhibitor' ? 'exhibitor' : 'visitor');
        const label = Object.assign(document.createElement('div'), { className: 'lbl holo' }); this.host.appendChild(label);
        o = { actor, cls: h.cls, track: new RemoteTrack({ t: now, x: h.x, y: h.y, h: h.h }), label, seen: now, pose: '', tx: h.x, ty: h.y }; this.holos.set(h.id, o);
      }
      const text = h.cls === 'exhibitor' && h.company ? h.company : h.callsign;
      if (o.label.textContent !== text) o.label.textContent = text;
      o.label.classList.toggle('exhib', h.cls === 'exhibitor');
      o.pose = h.pose ?? '';
      const snap = { t: now, x: h.x, y: h.y, h: h.h }; if (o.pose === 'sit') o.track.place(snap); else o.track.push(snap);
      o.tx = h.x; o.ty = h.y; o.seen = now;
    }
    for (const [id, o] of this.holos) if (now - o.seen > PING_MS * 3) { o.actor.dispose(); o.label.remove(); this.holos.delete(id); }
  }

  private updateHolos(now: number, dt: number) {
    const far = this.rig.dist * 2.4 + 60, me = this.position;
    for (const o of this.holos.values()) {
      const r = o.track; r.step(now, dt);
      const hidden = Math.abs(r.x - me.x) > far || Math.abs(r.y - me.y) > far;
      o.actor.root.visible = !hidden; if (hidden) continue;
      const w = toWorld(r.x, r.y, 0);
      o.actor.place(w.x, 0, w.z, r.h); const mp = this.sim.player.body.pos; o.actor.attend(Math.hypot(mp.x - w.x, mp.z - w.z) < 6 ? this.face.set(mp.x, mp.y + 1.3, mp.z) : null); o.actor.applyRemote(r.speed, o.pose, dt);
    }
  }

  /* ---------------- labels: HTML, snapped to whole pixels ---------------- */

  private updateLabels() {
    const v = new THREE.Vector3(), w = this.host.clientWidth, h = this.host.clientHeight, taken: [number, number, number, number][] = [];
    const write = (el: HTMLDivElement, opacity: string, transform?: string) => {
      let c = this.labelCache.get(el); if (!c) this.labelCache.set(el, c = { o: '', t: '' });
      if (c.o !== opacity) el.style.opacity = c.o = opacity;
      if (transform && c.t !== transform) el.style.transform = c.t = transform;
    };
    const place = (el: HTMLDivElement, pos: THREE.Vector3, maxD: number, always = false) => {
      const d = this.camera.position.distanceTo(pos); if (!always && d >= maxD) return write(el, '0');
      v.copy(pos).project(this.camera);
      let vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      const x = Math.round((v.x * 0.5 + 0.5) * w), y = Math.round((-v.y * 0.5 + 0.5) * h);
      if (vis) {
        const hw = ((el.textContent?.length ?? 8) * 3.6 + 14) * this.ui, hh = 11 * this.ui, box: [number, number, number, number] = [x - hw, y - hh, x + hw, y + hh];
        if (taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) vis = false; else taken.push(box);
      }
      if (vis) write(el, always ? '1' : THREE.MathUtils.clamp((maxD - d) / (maxD * 0.25), 0, 1).toFixed(2), `translate(-50%,-50%) translate(${x}px,${y}px)`); else write(el, '0');
    };
    const p = new THREE.Vector3();
    if (this.started) {
      const b = this.sim.player.body, mine = this.role() === 'exhibitor' ? (myBooths.value[0]?.company || me.value?.callsign || '') : (me.value?.callsign ?? '');
      if (this.myLabel.textContent !== mine) this.myLabel.textContent = mine;
      this.myLabel.classList.toggle('exhib', this.role() === 'exhibitor');
      place(this.myLabel, p.set(b.pos.x, b.pos.y + 2.05, b.pos.z), 0, true);
    } else write(this.myLabel, '0');
    const hero = this.labelEls.find((x) => x.l.kind === 'hero'); if (hero) place(hero.el, hero.l.pos, 0, true);
    for (const s of this.boothEls) { if (s.booth) place(s.el, s.pos, 52); else write(s.el, '0'); }
    for (const o of this.holos.values()) { if (!o.actor.root.visible) { write(o.label, '0'); continue; } const w2 = toWorld(o.track.x, o.track.y, 2.05); place(o.label, p.set(w2.x, w2.y, w2.z), 40); }
    for (const { el, l } of this.labelEls) if (l.kind !== 'hero') place(el, l.pos, l.kind === 'gate' ? 110 : 80);
  }

  /* ---------------- resolution: start sharp, give a little only if the phone cannot keep up ---------------- */

  private adaptQuality(now: number) {
    const f = this.fps, gap = now - (f.at || now); f.at = now;
    if (gap > 250 || document.hidden) { f.acc = 0; f.n = 0; return; }
    f.acc += gap / 1000; f.n++;
    if (f.acc < 3) return;
    const fps = f.n / f.acc; f.acc = 0; f.n = 0;
    const capped30 = fps > 27 && fps < 33;
    if (fps < 42 && !capped30 && f.dpr > 1) { f.dpr = Math.max(1, f.dpr - 0.25); this.renderer.setPixelRatio(f.dpr); }
  }

  dispose() {
    this.running = false; this.input.dispose(); this.stops.forEach((s) => s());
    for (const o of this.holos.values()) { o.actor.dispose(); o.label.remove(); }
    this.player?.dispose(); this.steps.dispose(); this.world.dispose();
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}
