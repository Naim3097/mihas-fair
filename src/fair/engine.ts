// The Nexova fair's engine: the same surface Mission X's engine gives the interface (EngineApi), the same server,
// the same rules, with a different body in the world. The Ceritera controller, camera and animation library drive
// Nexo in third person over the MITEC floor plan; tap-to-walk, the guide trail, presence and the holograms of
// other people, labels, lifts, seats and photos are ported from src/game/engine.ts. Nothing here is a rule: the
// server decides everything, this only asks.
import * as THREE from 'three';
import { effect } from '@preact/signals';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Booth, Hologram, LevelData, Lift } from '../../shared/types';
import { STAMP_RADIUS_M, boothLabel, type Pose } from '../../shared/rules';
import { classByKey } from '../../content';
import { api, ApiError } from '../net/api';
import { sfx } from '../sfx';
import type { EngineApi } from '../game/engine-api';
import { hallCards, hallLine } from '../game/facts';
import { NavGrid, dotsAlong, nearestOnPath, pathLength, type P2 } from '../game/nav';
import { BoothPicker } from '../game/pick';
import { placeAt, type Seat } from '../game/places';
import { RemoteTrack } from '../game/remote';
import { atLaunchPad, boothAction, currentDeck, distToGoal, goalVia, guideOn, guideTarget, herePlace, markSeen, me, modal, moveHint, myBooths, nearLift, nearStation, online, panelStation, photoShot, routing, seated, seen, stampedSet, stationMap, stations, toast } from '../state';
import type { Library } from '../ceritera/game/anim';
import { CameraRig } from '../ceritera/game/camera';
import type { Intent } from '../ceritera/game/controller';
import { loop, oneShot } from '../ceritera/game/entities';
import { Sfx } from '../ceritera/game/sfx';
import { Sim } from '../ceritera/game/sim';
import { angleDiff, lenXZ, v3 } from '../ceritera/game/v3';
import type { FairInput, FairSink } from './input';
import type { Quality, Scene, Stage } from './stage';
export { pickQuality, type Quality } from './stage';
import { CX, CY, buildFairLevel, fixY, toPlan, toWorld, type FairLevel } from './level';
import { NexoActor, loadNexo, loadNexoLibrary, loadNexoLod, type NexoRole } from './nexo';
import { FAIR_MOVEMENT } from './movement';
import { Reach } from './reach';
import { RouteFollower } from './route';
import { FAIR, FairWorld } from './world';

/** Players at MIHAS meet each other, so their position goes out every 2 s. A player from elsewhere is seen by nobody:
 *  every 12 s keeps them in the "here now" count (15 s window) at a sixth of the load; a stamp still sends its own. */
/** Everyone sees everyone, so everyone reports where they are this often (~330 req/s for 1,000 players). */
const PING_MS = 3000, TRAIL_STEP = 1.5, TRAIL_MAX = 220, BOOTH_LABELS = 6, BOOTH_LABEL_RANGE = 12, ARRIVAL_FRESH_MS = 10 * 60_000;
const CAM = { dist: 4.6, min: 2.4, max: 12, pitch: 0.3 };
/** The camera settles in from above over this long at the start. */
const INTRO = { dist: 30, pitch: 0.6, s: 1.6 };
/** A finger's tolerance when picking a booth (CSS px), and how long after a drag the camera leaves the view alone. */
const TAP_TOL = 14, ORBIT_HOLD_MS = 1500;
const EMOTE = { wave: { clip: 'wave', ms: 2600 }, cheer: { clip: 'victory', ms: 2600 }, dance: { clip: 'dance', ms: 5200 } } as const;

interface Holo { actor: NexoActor; cls: Hologram['cls']; track: RemoteTrack; label: HTMLDivElement; seen: number; pose: string; tx: number; ty: number }
interface Label { text: string; pos: THREE.Vector3; kind: 'area' | 'gate' | 'hero' | 'lift' }

export class FairEngine implements EngineApi, Scene {
  private renderer: THREE.WebGLRenderer;
  private host: HTMLElement;
  readonly sink: FairSink;
  private camera = new THREE.PerspectiveCamera(50, 1, 0.35, 1600);
  private rig: CameraRig;
  private world: FairWorld;
  private fair: FairLevel;
  private sim: Sim;
  private nav: NavGrid;
  private picker: BoothPicker;
  private reach: Reach;
  private follower: RouteFollower;
  private input: FairInput;
  private steps = new Sfx();
  private gltf: GLTF | null = null;
  /** the body other people get: the lighter copy on the phone tier, the same file on the desktop tier */
  private gltfOthers: GLTF | null = null;
  private lib: Library | null = null;
  private player: NexoActor | null = null;
  private started = false;
  private holos = new Map<string, Holo>();
  private labelEls: { el: HTMLDivElement; l: Label }[] = [];
  private labelCache = new WeakMap<HTMLDivElement, { o: string; t: string; key: string | null; hw: number; hh: number }>();
  private boothEls: { el: HTMLDivElement; booth: Booth | null; pos: THREE.Vector3 }[] = [];
  private myLabel: HTMLDivElement;
  /** the tag over the booth under the mouse */
  private tip: HTMLDivElement; private tipPos = new THREE.Vector3(); private hovered: Booth | null = null;
  private caster = new THREE.Raycaster(); private ndc = new THREE.Vector2(); private floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); private hit = new THREE.Vector3();
  private buckets = new Map<string, Booth[]>();
  private halls: ReturnType<typeof hallCards>;
  private trail: THREE.InstancedMesh;
  private trailPath: P2[] = [];
  private trailAt = 0;
  private dots: P2[] = Array.from({ length: TRAIL_MAX }, () => ({ x: 0, y: 0 })); private trailM = new THREE.Matrix4();
  private ping: { mesh: THREE.Mesh; t: number };
  private disposed = false; private pingAt = 0; private proxAt = 0; private firstPing = true; private arrivalSeen = 0;
  private pose: Pose = ''; private poseUntil = 0;
  private seat: Seat | null = null; private seatGoal: Seat | null = null; private wantBeforeSit = CAM.dist;
  private liftT = 1; private hallNow: number | null = null; private walked = 0; private picked: Booth | null = null;
  private stepAcc = 0; private introT = -1; private orbit = 0.6; private orbitAt = 0;
  private stops: (() => void)[] = [];

  constructor(private stage: Stage, private level: LevelData, private quality: Quality) {
    this.renderer = stage.renderer; const host = this.host = stage.host;

    this.fair = buildFairLevel(level);
    this.sim = new Sim('pengembara', classByKey('pengembara')!.base, this.fair.def, 1, FAIR_MOVEMENT);
    this.world = new FairWorld(level, this.fair, quality === 'low', stage.shadowsWanted);
    // the camera collides with what the body does (partitions, counters, glass): in a 2.5 m aisle it rides over the wall tops
    this.rig = new CameraRig(this.camera, this.sim.world);
    this.rig.dist = CAM.dist; this.rig.pitch = CAM.pitch;
    this.halls = hallCards(level);
    this.nav = new NavGrid(level);
    this.picker = new BoothPicker(level, fixY); // rays come in world-derived y, the space level 2 is drawn in
    this.reach = new Reach(level, this.fair.stands);
    this.follower = new RouteFollower(this.nav);
    for (const b of level.booths) { const k = `${Math.floor(b.x / 6)},${Math.floor(b.y / 6)}`; (this.buckets.get(k) ?? this.buckets.set(k, []).get(k)!).push(b); }

    const onFloor = { depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 } as const;
    this.trail = new THREE.InstancedMesh(new THREE.CircleGeometry(0.26, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: FAIR.blue, ...onFloor }), TRAIL_MAX);
    this.trail.count = 0; this.trail.frustumCulled = false; this.trail.renderOrder = 3; this.world.scene.add(this.trail);
    this.ping = { mesh: new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: FAIR.blue, transparent: true, ...onFloor })), t: 1 };
    this.ping.mesh.visible = false; this.ping.mesh.renderOrder = 3; this.world.scene.add(this.ping.mesh);

    this.input = stage.input;
    this.sink = {
      onTap: (x, y, coarse) => this.tapMove(x, y, coarse),
      onOrbit: (dx, dy) => { this.orbitAt = performance.now(); this.rig.turn(dx * 2.2, dy * 1.6); },
      onZoom: (f) => { if (this.introT >= 0) { this.introT = -1; this.rig.pitch = CAM.pitch; this.rig.dist = CAM.dist; } this.rig.dist = THREE.MathUtils.clamp(this.rig.dist * f, CAM.min, CAM.max); },
      onHover: (at) => this.hover(at),
      onKey: (a) => { if (a === 'interact') void this.interact(); else if (a === 'map') modal.value = 'map'; else this.emote(a); },
      enabled: () => !modal.value,
    };
    this.stops.push(effect(() => { if (modal.value && stage.scene === this) { this.input.release(); this.hover(null); } }));

    for (const l of this.world.labels) {
      const el = Object.assign(document.createElement('div'), { className: `lbl ${l.kind}`, textContent: l.text });
      host.appendChild(el); this.labelEls.push({ el, l });
    }
    for (let i = 0; i < BOOTH_LABELS; i++) { const el = Object.assign(document.createElement('div'), { className: 'lbl booth' }); host.appendChild(el); this.boothEls.push({ el, booth: null, pos: new THREE.Vector3() }); }
    this.myLabel = Object.assign(document.createElement('div'), { className: 'lbl holo me' }); host.appendChild(this.myLabel);
    this.tip = Object.assign(document.createElement('div'), { className: 'lbl booth tip' }); host.appendChild(this.tip);

    this.stops.push(effect(() => this.world.setStamped(stampedSet.value)));
    this.stops.push(effect(() => this.world.setStations(stations.value)));
    this.stops.push(effect(() => { void guideTarget.value; this.trailAt = 0; }));
    this.stops.push(effect(() => { const a = me.value?.anchor; if (a && this.started && a.at > this.arrivalSeen) this.arriveAt(a.stationId, a.at); }));
    this.stops.push(effect(() => { const role = this.role(); void me.value; this.player?.setRole(role); }));
    // the sky video and sounds may wait for the first gesture
    const wake = () => { this.world.playSky(); this.steps.unlock(); };
    window.addEventListener('pointerdown', wake, { capture: true }); window.addEventListener('keydown', wake, { capture: true });
    this.stops.push(() => { window.removeEventListener('pointerdown', wake, { capture: true }); window.removeEventListener('keydown', wake, { capture: true }); });

    if (import.meta.env.DEV) (window as unknown as { __fair?: unknown }).__fair = this;

    const lod = quality === 'low' && new URLSearchParams(location.search).get('lod') !== '0';
    void Promise.all([loadNexo(), lod ? loadNexoLod() : loadNexo(), loadNexoLibrary()]).then(([g, o, lib]) => { if (this.disposed) return; this.gltf = g; this.gltfOthers = o ?? g; this.lib = lib; this.rebuildBodies(); });
    stage.use(this);
  }

  private role(): NexoRole { return me.value?.cls === 'exhibitor' ? 'exhibitor' : 'visitor'; }
  private face = new THREE.Vector3();
  /** The face of the nearest other Nexo within reach, for the player's head to turn to. */
  private nearestFace(x: number, z: number, reach: number): THREE.Vector3 | null {
    let best: Holo | null = null, bd = reach;
    for (const o of this.holos.values()) { if (!o.actor.root.visible) continue; const p = o.actor.root.position, d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = o; } }
    return best ? this.face.set(best.actor.root.position.x, best.actor.root.position.y + 1.3, best.actor.root.position.z) : null;
  }
  private makeActor(role: NexoRole, mine = false): NexoActor { const a = new NexoActor(mine ? this.gltf : this.gltfOthers ?? this.gltf, this.lib, role, this.quality === 'high'); a.setBlob(!this.world.shadows); this.world.scene.add(a.root); return a; }
  /** The model file arrived: every body gets it, in place. */
  private rebuildBodies() {
    if (this.player) { this.player.dispose(); this.player = this.makeActor(this.role(), true); }
    for (const o of this.holos.values()) { o.actor.dispose(); o.actor = this.makeActor(o.cls === 'exhibitor' ? 'exhibitor' : 'visitor'); }
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h; this.rig.baseFov = w < h ? 58 : 50;
    if (!this.started) this.camera.fov = this.rig.baseFov; // in play the rig eases the lens to it
    this.camera.updateProjectionMatrix();
  }

  /** Put the body somewhere on the plan, facing `yaw` (the rotation.y convention: π faces north). */
  private teleport(x: number, y: number, yaw: number) {
    const p = this.sim.player, w = toWorld(x, y, 0);
    p.body.pos.x = w.x; p.body.pos.y = 0.05; p.body.pos.z = w.z; p.body.vel = v3(); p.body.grounded = false; p.yaw = yaw; p.peak = 0;
    p.action = null; p.dodge = null; p.airDash = null; p.slamming = false;
    this.stopRoute(); loop(p, 'idle');
  }

  /** Drop the player in at the Hall 8 entrance and hand over control. The camera settles in from above. */
  start(spawn: 'short' | 'epic') {
    const s = this.level.spawns[spawn], yaw = spawn === 'short' ? Math.PI : -Math.PI / 2;
    this.teleport(s.x, s.y, yaw);
    if (!this.player) this.player = this.makeActor(this.role(), true);
    this.started = true;
    this.rig.dist = INTRO.dist; this.rig.pitch = INTRO.pitch; this.rig.snapBehind(yaw); this.introT = 0; this.orbitAt = 0;
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

  frame(now: number, dt: number) {
    const t = now / 1000;
    this.world.update(t, dt);
    if (!this.started) {
      // behind the first screen: a slow turn around the X
      this.orbit += dt * 0.08; const h = this.world.heroPos;
      this.camera.position.set(h.x + Math.sin(this.orbit) * 26, 10, h.z + Math.cos(this.orbit) * 26); this.camera.lookAt(h.x, 3.5, h.z);
      this.world.followSun(h.x, h.z);
    } else {
      if (this.introT >= 0) { // settle in from above, easing out, rather than cut
        this.introT += dt; const k = Math.min(1, this.introT / INTRO.s), e = 1 - Math.pow(1 - k, 3);
        this.rig.dist = INTRO.dist + (CAM.dist - INTRO.dist) * e; this.rig.pitch = INTRO.pitch + (CAM.pitch - INTRO.pitch) * e;
        if (k >= 1) this.introT = -1;
      }
      const p = this.sim.player, it = this.intent(dt);
      if (this.seat) {
        if (it.move.x || it.move.y || it.jump || this.follower.active) this.stand();
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
      this.updateCamera(dt, it);
      this.world.followSun(b.pos.x, b.pos.z);
    }
    this.updatePing(dt); this.updateLabels();
    this.renderer.render(this.world.scene, this.camera);
  }

  /* ---------------- movement: the stick, or a route (a tap, "take me there", walking to a seat) ---------------- */

  private intent(dt: number): Intent {
    const it = this.input.poll();
    if (it.move.x || it.move.y) { if (this.follower.active) this.stopRoute(); this.seatGoal = null; return it; } // the thumb wins
    const r = this.follower.step(it, this.position, this.rig.yaw, lenXZ(this.sim.player.body.vel), dt);
    if (r === 'arrived') { this.setRouting(false); if (this.seatGoal) this.takeSeat(this.seatGoal); }
    else if (r === 'lost') this.stopRoute(); // pressed against something three plans could not get round: let the player take it from here
    return it;
  }

  /** The body sets off along a path, or does not (none): the ping, the sound and the Stop button follow. */
  private setRoute(path: P2[] | null): boolean {
    if (!this.follower.set(path)) { this.setRouting(false); return false; }
    const end = path![path!.length - 1]!, w = toWorld(end.x, end.y, 0.04); this.ping.mesh.position.set(w.x, w.y, w.z); this.ping.t = 0; sfx('go');
    this.setRouting(true);
    return true;
  }
  private stopRoute() { this.follower.clear(); this.seatGoal = null; this.world.mark('goal', null); this.setRouting(false); }
  private setRouting(v: boolean) { if (routing.value !== v) routing.value = v; }

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
    return pl.seats.filter((s) => !sitters.some((o) => Math.hypot(o.tx - s.x, o.ty - s.y) < 0.7));
  }
  sit() {
    const pl = herePlace.value; if (!this.started || !pl || this.seat) return;
    const pos = this.position, d = (s: Seat) => Math.hypot(s.x - pos.x, s.y - pos.y), s = this.freeSeats(pl).reduce<Seat | null>((best, x) => (!best || d(x) < d(best) ? x : best), null);
    if (!s) { toast('Every seat is taken', 'Try again in a moment'); return; }
    if (d(s) < 1.6) return this.takeSeat(s);
    if (!this.setRoute(this.nav.path(pos, s))) return this.takeSeat(s);
    this.seatGoal = s;
  }
  private takeSeat(s: Seat) {
    this.seatGoal = null;
    const pl = herePlace.value; if (pl && !this.freeSeats(pl).includes(s)) { this.sit(); return; }
    this.seat = s; this.follower.clear(); this.setRouting(false);
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
    const act = boothAction(st);
    if (act === 'stamp') await this.stamp(st!);
    else if (act === 'swap') { panelStation.value = st; modal.value = 'booth'; }
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
    const W = 1080, H = 1350, cam = new THREE.PerspectiveCamera(Math.min(58, 31 * (6.6 / dist)), W / H, 0.5, 1600), r = this.renderer;
    const b = p.body, fwd = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)), at = new THREE.Vector3(b.pos.x, 1.1, b.pos.z);
    cam.position.copy(at).addScaledVector(fwd, dist).setY(1.5); cam.lookAt(at.x, 0.75, at.z);
    oneShot(p, 'wave', 2); actor.place(b.pos.x, b.pos.y, b.pos.z, heading); actor.applySim(p.anim, 0.7);
    const trail = this.trail.visible;
    this.trail.visible = false; this.ping.mesh.visible = false; this.myLabel.style.opacity = '0';
    sfx('shutter');
    // drawn into a target of its own, so the screen's buffer is never resized under the player's feet
    const rt = new THREE.WebGLRenderTarget(W, H, { colorSpace: THREE.SRGBColorSpace, samples: 4 }), px = new Uint8Array(W * H * 4);
    let ok = true;
    try { r.setRenderTarget(rt); r.render(this.world.scene, cam); r.readRenderTargetPixels(rt, 0, 0, W, H, px); } catch { ok = false; } finally { r.setRenderTarget(null); rt.dispose(); }
    this.trail.visible = trail; loop(p, 'idle');
    if (!ok) { toast('Could not take the photo on this device', undefined, 'warn'); return; }
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!, img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4); // the target's rows come bottom first
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    g.putImageData(img, 0, 0); g.fillStyle = '#fff'; g.fillRect(0, H - 170, W, 170);
    g.fillStyle = '#1b2130'; g.textBaseline = 'alphabetic'; g.font = '800 46px Urbanist, Arial'; g.fillText(me.value?.callsign ?? 'Mission X', 56, H - 96);
    g.fillStyle = '#5a6172'; g.font = '600 30px Urbanist, Arial'; g.fillText('at MIHAS 2026 · MITEC Kuala Lumpur · Nexova', 56, H - 50);
    g.textAlign = 'right'; g.fillStyle = '#1b2130'; g.font = '800 40px Urbanist, Arial'; g.fillText('MISSION X', W - 56, H - 96); g.fillStyle = '#2457f5'; g.font = '700 30px Urbanist, Arial'; g.fillText('Find the X · Booth 8H18A', W - 56, H - 50);
    photoShot.value = c.toDataURL('image/jpeg', 0.9); modal.value = 'photo'; api.track('photo', { place: herePlace.value?.id ?? null, world: 'nexova' });
  }

  /* ---------------- taps: a booth, or a point on the floor ---------------- */

  private rayAt(cx: number, cy: number): THREE.Ray {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.caster.setFromCamera(this.ndc, this.camera); return this.caster.ray;
  }
  /** The booth under a point on the screen. With a tolerance (a finger), the booth most of a ring of points round it lands on. */
  private boothAt(cx: number, cy: number, tol = 0): Booth | null {
    const at = (x: number, y: number) => {
      const { origin: o, direction: d } = this.rayAt(x, y); // plan x, drawn y (world −z), height: the space the picker was built in
      return this.picker.pick({ ox: o.x + CX, oy: CY - o.z, oz: o.y, dx: d.x, dy: -d.z, dz: d.y });
    };
    const centre = at(cx, cy); if (centre || !tol) return centre;
    const votes = new Map<string, { b: Booth; n: number }>();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, b = at(cx + Math.cos(a) * tol, cy + Math.sin(a) * tol); if (b) (votes.get(b.id) ?? votes.set(b.id, { b, n: 0 }).get(b.id)!).n++; }
    let best: Booth | null = null, bn = 0; for (const v of votes.values()) if (v.n > bn) { bn = v.n; best = v.b; }
    return best;
  }
  /** The mouse over the world: a frame and a tag on the booth under it, and a pointing hand. */
  private hover(at: { x: number; y: number } | null) {
    const b = at && this.started ? this.boothAt(at.x, at.y) : null;
    if (b?.id === this.hovered?.id) return;
    this.hovered = b; this.world.mark('hover', b); this.input.setCursor(b ? 'pointer' : 'grab');
    if (b) {
      const w = toWorld(b.x, b.y, this.level.booth.h + 1.4); this.tipPos.set(w.x, w.y, w.z);
      this.tip.textContent = b.id === this.level.hero.id ? `${b.id} · ${b.name}` : boothLabel(b.id, stationMap.value.get(b.id)?.company || b.name || null);
    }
  }
  private tapMove(cx: number, cy: number, coarse: boolean) {
    if (!this.started) return;
    const booth = this.boothAt(cx, cy, coarse ? TAP_TOL : 0); if (booth) return this.goToBooth(booth);
    const hit = this.rayAt(cx, cy).intersectPlane(this.floor, this.hit); if (!hit) return;
    this.pick(null); this.walkTo(toPlan(hit));
  }
  private walkTo(to: P2): boolean {
    if (this.seat) this.stand();
    this.seatGoal = null;
    return this.setRoute(this.nav.path(this.position, to));
  }
  private pick(b: Booth | null) { this.picked = b; this.world.mark('goal', b); }
  /** Press a booth: walk to the front of it (its open side), or, standing at it already, open its sheet. */
  private goToBooth(b: Booth) {
    if (b.id === this.level.hero.id) { this.pick(null); this.walkTo(this.level.hero.dock); return; }
    if (nearStation.value?.id === b.id && !this.follower.active) { panelStation.value = b; modal.value = 'booth'; return; }
    const to = this.reach.approach(b, this.position, this.nav); if (!to) return;
    if (this.walkTo(to)) this.pick(b);
  }
  /** The booth a trail target is, when it is one (the sheets and the map hand over a booth's own centre). */
  private boothAtPoint(p: P2): Booth | null { return this.level.booths.find((b) => Math.abs(b.x - p.x) < 0.01 && Math.abs(b.y - p.y) < 0.01) ?? null; }

  private updatePing(dt: number) {
    const p = this.ping; if (p.t >= 1) { p.mesh.visible = false; return; }
    p.t = Math.min(1, p.t + dt * 2.2); const s = 0.6 + p.t * 1.6;
    p.mesh.visible = true; p.mesh.scale.set(s, 1, s); (p.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - p.t;
  }

  get position(): P2 { return toPlan(this.sim.player.body.pos); }
  levelOf(p: P2): number { const d = this.level.decks; return (d.find((k) => p.y >= k.y0 - 15 && p.y <= k.y1 + 15) ?? d[0]!).level; }

  /** Where the trail leads: the place the player chose, or Lean X Digital until the mission starts. Null: nowhere. */
  private get target(): { x: number; y: number; label: string } | null {
    const t = guideTarget.value; if (t) return t;
    const m = me.value; if (m && !m.mission.started && m.cls !== 'exhibitor') return { ...this.level.hero.dock, label: 'Lean X Digital · Booth ' + this.level.hero.id };
    return null;
  }
  /** Where to walk for a target: the front of the booth when it is one, the point itself otherwise; on another level, the nearest lift first. */
  private goalFor(t: P2): P2 {
    const pos = this.position, here = this.levelOf(pos), there = this.levelOf(t);
    if (here === there) {
      if (goalVia.value) goalVia.value = null;
      const b = this.boothAtPoint(t); return b && b.id !== this.level.hero.id ? this.reach.approach(b, pos, this.nav) ?? t : t;
    }
    const lifts = this.level.lifts.filter((l) => l.deck === here), lift = lifts.reduce((a, b) => (Math.hypot(b.x - pos.x, b.y - pos.y) < Math.hypot(a.x - pos.x, a.y - pos.y) ? b : a), lifts[0]!);
    const via = `Take the ${lift.label.toLowerCase()} to Level ${there}`; if (goalVia.value !== via) goalVia.value = via;
    return lift;
  }

  /** Ride a lift: the same shaft on another level. The camera rises and comes back down. */
  useLift(to: Lift) {
    if (this.seat) this.stand();
    sfx(to.deck > this.levelOf(this.position) ? 'liftUp' : 'liftDown');
    const at = this.nav.nearestWalkable(to.x, to.y + 1.5) ?? { x: to.x, y: to.y };
    this.teleport(at.x, at.y, Math.PI);
    this.firstPing = true; this.pingAt = 0; this.trailAt = 0; this.liftT = 0;
    toast(`Level ${to.deck}`, this.level.decks.find((d) => d.level === to.deck)?.label.split(' · ')[1] ?? '', 'info', 2600);
  }

  autopilot() {
    const t = this.target; if (!t || !this.started) return;
    if (this.walkTo(this.goalFor(t))) this.pick(goalVia.value ? null : this.boothAtPoint(t));
  }
  stop() { if (this.follower.active) this.stopRoute(); }

  /* ---------------- camera ---------------- */

  private updateCamera(dt: number, it: Intent) {
    if (this.liftT < 1) { this.liftT = Math.min(1, this.liftT + dt / 1.5); this.rig.dist = CAM.dist + 26 * Math.sin(Math.PI * this.liftT); }
    const p = this.sim.player;
    // The view comes round behind the body on its own: briskly along a route, gently while a thumb holds the stick
    // (more the further forward it is pushed, not at all pulling back toward the camera). Never within a moment of a
    // drag, and never for the keys: a mouse is there to look around with.
    if (!this.seat && this.introT < 0 && performance.now() - this.orbitAt > ORBIT_HOLD_MS && lenXZ(p.body.vel) > 0.5) {
      const k = this.follower.active ? 1.5 : this.input.stickHeld ? 0.8 * Math.max(0, (1 + it.move.y) / 2) : 0;
      if (k > 0) this.rig.yaw += angleDiff(this.rig.yaw, p.yaw) * (1 - Math.exp(-k * dt));
    }
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
    const pk = this.picked, best = this.reach.atBooth(around.map((x) => x.b), pos, nearStation.value, pk);
    if (pk && !this.follower.active) { this.world.mark('goal', null); if (Math.hypot(pk.x - pos.x, pk.y - pos.y) > STAMP_RADIUS_M + 2) this.picked = null; } // the frame stays until you arrive
    if (nearStation.value?.id !== best?.id) nearStation.value = best;

    const sm = stationMap.value, named = around.filter((x) => sm.has(x.b.id)).slice(0, BOOTH_LABELS);
    this.boothEls.forEach((slot, i) => {
      const b = named[i]?.b ?? null; if (slot.booth === b) return;
      slot.booth = b;
      if (b) { slot.el.textContent = boothLabel(b.id, sm.get(b.id)?.company); slot.el.classList.toggle('online', sm.has(b.id)); const w = toWorld(b.x, b.y, this.level.booth.h + 2.7); slot.pos.set(w.x, w.y, w.z); }
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
    const target = this.target, wanted = guideOn.value && target != null;
    if (!wanted) { this.trail.count = 0; if (distToGoal.value != null) distToGoal.value = null; if (goalVia.value) goalVia.value = null; return; }
    if (now - this.trailAt > 1200) {
      this.trailAt = now; this.trailPath = this.nav.path(this.position, this.goalFor(target)) ?? [];
      const d = this.trailPath.length ? Math.round(pathLength(this.trailPath)) : null;
      if (distToGoal.value !== d) distToGoal.value = d;
      // arrived: standing at the booth (the chip is up), or on the spot when it is not a booth. Not while still walking there.
      if (guideTarget.value && !goalVia.value && !this.follower.active) {
        const b = this.boothAtPoint(target), here = b ? nearStation.value?.id === b.id : d != null && d < 2;
        if (here) { toast('You have arrived', target.label); guideTarget.value = null; }
      }
    }
    // laid from where the body is now, not from where the route was planned: the first dot a metre ahead of the feet, nothing behind
    const n = dotsAlong(this.trailPath, nearestOnPath(this.trailPath, this.position, 8), 1, TRAIL_STEP, TRAIL_MAX, this.dots), M = this.trailM;
    for (let i = 0; i < n; i++) {
      const q = this.dots[i]!, d = 1 + i * TRAIL_STEP, s = 1 + 0.45 * Math.max(0, Math.sin(d * 0.3 - t * 4));
      const w = toWorld(q.x, q.y, 0.04); M.makeScale(s, 1, s).setPosition(w.x, w.y, w.z); this.trail.setMatrixAt(i, M); // toWorld: level 2 is drawn compressed, the raw plan y put the dots up to 3 m off
    }
    this.trail.count = n; this.trail.instanceMatrix.needsUpdate = true;
  }

  /* ---------------- other people ---------------- */

  private sync(now: number) {
    if (now - this.pingAt < PING_MS || document.hidden) return; this.pingAt = now;
    const spawn = this.firstPing; this.firstPing = false;
    const pos = this.position, p = this.sim.player;
    const pose = this.pose || (!p.body.grounded && !this.seat ? 'jump' : '');
    api.presence({ x: +pos.x.toFixed(2), y: +pos.y.toFixed(2), h: +p.yaw.toFixed(2), spawn, pose: pose || undefined })
      .then((r) => { online.value = r.online; this.applyHolos(r.holograms, now); }).catch(() => {});
  }

  private applyHolos(list: Hologram[], now: number) {
    // how many other people a phone draws: twelve, six once the quality ladder has taken the shadows away
    for (const h of list.slice(0, this.quality === 'high' ? 24 : this.stage.level >= 3 ? 6 : 12)) {
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

  private holoFrame = 0;
  private updateHolos(now: number, dt: number) {
    const far = this.rig.dist * 2.4 + 60, me = this.position, mp = this.sim.player.body.pos; this.holoFrame++;
    let n = 0;
    for (const o of this.holos.values()) {
      const r = o.track; r.step(now, dt); n++;
      const hidden = Math.abs(r.x - me.x) > far || Math.abs(r.y - me.y) > far;
      o.actor.root.visible = !hidden; if (hidden) continue;
      const w = toWorld(r.x, r.y, 0), d = Math.hypot(mp.x - w.x, mp.z - w.z);
      o.actor.place(w.x, 0, w.z, r.h); o.actor.attend(d < 6 ? this.face.set(mp.x, mp.y + 1.3, mp.z) : null);
      o.actor.setCastShadow(d < 18); // the shadow map's texels go to the people near you
      if (d > 30 && (this.holoFrame + n) % 2) { o.actor.applyRemote(r.speed, o.pose, dt * 2); continue; } // far bodies animate at half rate, every other frame with a double step
      if (d > 30) continue;
      o.actor.applyRemote(r.speed, o.pose, dt);
    }
  }

  /* ---------------- labels: HTML, snapped to whole pixels, measured for real, never over each other or the body ---------------- */

  private lv = new THREE.Vector3(); private lp = new THREE.Vector3(); private taken: [number, number, number, number][] = [];
  private updateLabels() {
    const v = this.lv, w = this.host.clientWidth, h = this.host.clientHeight, taken = this.taken; taken.length = 0;
    const write = (el: HTMLDivElement, opacity: string, transform?: string) => {
      let c = this.labelCache.get(el); if (!c) this.labelCache.set(el, c = { o: '', t: '', key: null, hw: 0, hh: 0 });
      if (c.o !== opacity) el.style.opacity = c.o = opacity;
      if (transform && c.t !== transform) el.style.transform = c.t = transform;
    };
    const place = (el: HTMLDivElement, pos: THREE.Vector3, maxD: number, always = false) => {
      const d = this.camera.position.distanceTo(pos); if (!always && d >= maxD) return write(el, '0');
      v.copy(pos).project(this.camera);
      let vis = v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      const x = Math.round((v.x * 0.5 + 0.5) * w), y = Math.round((-v.y * 0.5 + 0.5) * h);
      if (vis) {
        let c = this.labelCache.get(el); if (!c) this.labelCache.set(el, c = { o: '', t: '', key: null, hw: 0, hh: 0 });
        if (c.key !== el.textContent) { c.key = el.textContent; c.hw = el.offsetWidth / 2 + 3; c.hh = el.offsetHeight / 2 + 2; } // measured once per text, not guessed from its length
        const hw = c.hw, hh = c.hh, box: [number, number, number, number] = [x - hw, y - hh, x + hw, y + hh];
        if (taken.some((t) => box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1])) vis = false; else taken.push(box);
      }
      if (vis) write(el, always ? '1' : THREE.MathUtils.clamp((maxD - d) / (maxD * 0.25), 0, 1).toFixed(2), `translate(-50%,-50%) translate(${x}px,${y}px)`); else write(el, '0');
    };
    const p = this.lp;
    if (this.started) {
      const b = this.sim.player.body, mine = this.role() === 'exhibitor' ? (myBooths.value[0]?.company || me.value?.callsign || '') : (me.value?.callsign ?? '');
      if (this.myLabel.textContent !== mine) this.myLabel.textContent = mine;
      this.myLabel.classList.toggle('exhib', this.role() === 'exhibitor');
      place(this.myLabel, p.set(b.pos.x, b.pos.y + 2.05, b.pos.z), 0, true);
      if (this.hovered) place(this.tip, this.tipPos, 0, true); else write(this.tip, '0');
      // the body's own patch of screen: no place name is written across the helmet
      const feet = v.set(b.pos.x, b.pos.y, b.pos.z).project(this.camera), head = p.set(b.pos.x, b.pos.y + 2.0, b.pos.z).project(this.camera);
      if (feet.z < 1 && head.z < 1) {
        const fy = (-feet.y * 0.5 + 0.5) * h, hy = (-head.y * 0.5 + 0.5) * h, cx = (head.x * 0.5 + 0.5) * w, half = Math.abs(fy - hy) * 0.28;
        taken.push([cx - half, Math.min(fy, hy), cx + half, Math.max(fy, hy)]);
      }
    } else { write(this.myLabel, '0'); write(this.tip, '0'); }
    const hero = this.labelEls.find((x) => x.l.kind === 'hero'); if (hero) place(hero.el, hero.l.pos, 0, true);
    for (const s of this.boothEls) { if (s.booth) place(s.el, s.pos, 52); else write(s.el, '0'); }
    for (const o of this.holos.values()) { if (!o.actor.root.visible) { write(o.label, '0'); continue; } const w2 = toWorld(o.track.x, o.track.y, 2.05); place(o.label, p.set(w2.x, w2.y, w2.z), 40); }
    for (const { el, l } of this.labelEls) if (l.kind !== 'hero') place(el, l.pos, l.kind === 'gate' ? 110 : 80);
  }

  /* ---------------- resolution: start sharp, give a little only if the phone cannot keep up ---------------- */

  /** The stage's quality step: shadows on or off and how fine, and the feet's blob when there are none. */
  applyLevel(_level: number, shadows: boolean, mapSize: number) {
    this.world.setShadows(shadows, mapSize);
    this.player?.setBlob(!shadows); for (const o of this.holos.values()) o.actor.setBlob(!shadows);
  }
  perfExtra(): string { return `people ${this.holos.size}`; }

  dispose() {
    this.disposed = true; this.stops.forEach((s) => s());
    for (const o of this.holos.values()) { o.actor.dispose(); o.label.remove(); }
    this.player?.dispose(); this.steps.dispose(); this.world.dispose(); this.tip.remove();
    for (const { el } of this.labelEls) el.remove(); for (const { el } of this.boothEls) el.remove(); this.myLabel.remove();
  }
}

