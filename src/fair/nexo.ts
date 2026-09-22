// Nexo, the mascot, as a body in the fair: the generated rigged model with the shared clip library retargeted onto
// it, a soft shadow under the feet, and the suit tinted by role (visitors white, exhibitors MIHAS orange) without
// touching the black visor or the blue LED line. Until the model file exists or while it loads, a Nexo of primitives
// stands in, so the fair works with or without the asset.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AnimKey } from '../../content';
import { AnimSet, loadLibrary, retarget, type Library } from '../ceritera/game/anim';
import type { AnimState } from '../ceritera/game/entities';
import { clipAbove } from './clip';

export const NEXO_URL = '/fair/nexo.glb';
/** The same body at a quarter of the triangles and smaller textures: other people, on the phone tier. */
export const NEXO_LOD_URL = '/fair/nexo-lod.glb';
/** Nexo stands this tall in the fair: a head taller than a booth counter, a head shorter than a booth. */
export const NEXO_HEIGHT = 1.6;
export const ROLE_TINT = { visitor: 0xffffff, exhibitor: 0xf07a1d, crew: 0x2a2f3a } as const;
export type NexoRole = keyof typeof ROLE_TINT;
/** The fair's clips for the sim's locomotion keys, and each clip's natural speed on the source rig, m/s. */
/** The flight pose: the jump clip held this far in (its apex), under a serial of its own. */
const FLIGHT_FROM = 0.42, FLIGHT_SERIAL = -7;
const FAIR_KEYS: Partial<Record<AnimKey, AnimKey>> = { idle: 'idle-calm', 'combat-idle': 'idle-calm', walk: 'stroll', run: 'jog', sprint: 'jog' };
const NATURAL: Partial<Record<AnimKey, number>> = { stroll: 1.05, jog: 3.0, walk: 1.7, run: 4.4, sprint: 7 };
/** The source rig's hip height, m: a body's stride scales with its own. */
const SOURCE_HIPS = 0.96;
const X_AXIS = new THREE.Vector3(1, 0, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);
/** The meshopt decode off the main thread: the body and the clip library both carry it. */
(MeshoptDecoder as { useWorkers?: (n: number) => void }).useWorkers?.(1);
/** What every body cut from one file shares: its rest bounds, its skinned meshes' culling spheres and the library
 *  retargeted onto its skeleton, all measured on the first body so the next ones cost no skinned pass. */
const SHARED = new Map<GLTF, { box: THREE.Box3; spheres: THREE.Sphere[]; clips: Map<AnimKey, THREE.AnimationClip> | null }>();

const models = new Map<string, Promise<GLTF | null>>();
function loadModel(url: string): Promise<GLTF | null> {
  let p = models.get(url);
  if (!p) { p = new Promise((resolve) => { const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); loader.load(url, (g) => resolve(g), undefined, () => resolve(null)); }); models.set(url, p); }
  return p;
}
export const loadNexo = (): Promise<GLTF | null> => loadModel(NEXO_URL);

/** The kits, built like the body (Tripo H3.1 from the reference sheets, tools/rig/export-item.mjs): a left skate with its
 *  origin under the wheels and its toe along +z, and the jetpack centred on its origin, its straps toward +z. */
export type Kit = 'boots' | 'skates' | 'jetpack';
const KIT_URL = { skates: '/fair/skate.glb', jetpack: '/fair/jetpack.glb' } as const;
const kits = new Map<string, Promise<THREE.Object3D | null>>();
/** A kit's model, loaded once and made matte like the suit with its lights kept; every body that wears it, and every
 *  stand that shows it, gets a clone. show: the whole item, for a stand; otherwise the part that is worn, which for the
 *  skate is its frame and wheels alone, cut from the same file at the sole (the boot part sits inside Nexo's own boot
 *  and is never seen; the cut shares the file's vertex buffers and paint). */
export function loadKit(kit: 'skates' | 'jetpack', show = false): Promise<THREE.Object3D | null> {
  const key = kit + (show ? ':show' : ':worn');
  let p = kits.get(key);
  if (!p) {
    p = loadModel(KIT_URL[kit]).then((g) => {
      if (!g) return null;
      const scene = g.scene.clone(); // a tree of its own over the file's geometry and material
      scene.traverse((o) => {
        const m = o as THREE.Mesh; if (!m.isMesh) return;
        m.receiveShadow = false;
        if (kit === 'skates' && !show) m.geometry = clipAbove(m.geometry, SKATE.cut);
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) { const s = mat as THREE.MeshStandardMaterial; if (s.isMeshStandardMaterial) { s.metalness = 0; s.roughness = Math.max(0.55, s.roughness); s.envMapIntensity = 0; } }
      });
      return scene;
    });
    kits.set(key, p);
  }
  return p;
}
/** Where a kit sits on the rig, in metres along the body's own axes (the rig's joints rest unrotated, so a joint's
 *  frame is the body's, moved to the joint). The skate frame: its top under the sole, the body riding up by the frame's
 *  height, centred under the boot, which is longer than the frame. The jetpack: over the suit's own pack (its back at
 *  z −0.38), a hair embedded so no gap opens when the chest breathes; the flames under its two tanks. */
const SKATE = { scale: 1.3, ankle: 0.17, forward: 0.05, lift: 0.117, cut: 0.14 }, JET = { scale: 1.35, up: 0.1, back: -0.48, nozzle: 0.13, flameY: -0.2 };
const FLAME_GEO = new THREE.ConeGeometry(0.045, 0.24, 12, 1, true).rotateX(Math.PI).translate(0, -0.12, 0);
const FLAME_MAT = new THREE.MeshBasicMaterial({ color: 0x9be9ff, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
export const loadNexoLod = (): Promise<GLTF | null> => loadModel(NEXO_LOD_URL);
export const loadNexoLibrary = (): Promise<Library | null> => loadLibrary();

/** Tint only the light, unsaturated parts of the texture: the suit turns orange, the visor stays black, the LED stays blue. */
function tintSuit(mat: THREE.MeshStandardMaterial, tint: THREE.Color): void {
  const u = { value: tint };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTint = u;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uTint;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  { float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    float sat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
    float k = smoothstep(0.45, 0.8, lum) * (1.0 - smoothstep(0.12, 0.35, sat));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uTint, k); }`);
  };
  mat.customProgramCacheKey = () => 'nexo-tint';
  mat.userData.tint = u;
}

/** Bounds of a model in its rest pose. A freshly cloned skeleton has no bone matrices yet, so they are computed first. */
function restBox(model: THREE.Object3D): THREE.Box3 {
  model.updateMatrixWorld(true);
  const out = new THREE.Box3(), b = new THREE.Box3();
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    if (m.isSkinnedMesh) { m.skeleton.update(); m.computeBoundingBox(); b.copy(m.boundingBox!); }
    else { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); b.copy(m.geometry.boundingBox!); }
    b.applyMatrix4(m.matrixWorld);
    out.union(b);
  });
  return out;
}

/** The stand-in: helmet, visor, LED line, body, boots. Same silhouette, no file. */
function primitiveNexo(tint: number): { group: THREE.Group; suit: THREE.MeshLambertMaterial } {
  const g = new THREE.Group();
  const suit = new THREE.MeshLambertMaterial({ color: tint }), visor = new THREE.MeshLambertMaterial({ color: 0x0a0a0a }), led = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  add(new THREE.SphereGeometry(0.42, 20, 14), suit, 0, 1.18, 0);
  add(new THREE.SphereGeometry(0.34, 20, 14), visor, 0, 1.16, 0.14).scale.set(1, 0.8, 0.6);
  add(new THREE.BoxGeometry(0.26, 0.03, 0.02), led, 0, 1.1, 0.46);
  add(new THREE.CapsuleGeometry(0.28, 0.32, 4, 12), suit, 0, 0.62, 0);
  for (const s of [-1, 1]) { add(new THREE.CapsuleGeometry(0.09, 0.3, 3, 8), suit, s * 0.36, 0.62, 0); add(new THREE.BoxGeometry(0.2, 0.16, 0.3), suit, s * 0.13, 0.08, 0.02); }
  return { group: g, suit };
}

export class NexoActor {
  readonly root = new THREE.Group();
  readonly anims: AnimSet | null;
  private mats: THREE.MeshStandardMaterial[] = [];
  private tint = new THREE.Color(0xffffff);
  private blob: THREE.Mesh;
  private meshes: THREE.Mesh[] = [];
  private suit: THREE.MeshLambertMaterial | null = null;
  /** How much of the source rig's stride this body has: the hip-height ratio, damped (power 0.3) so a small body
   * steps quicker than a tall one but keeps a cadence people read as natural; the rest is foot slide. */
  private stride = 1;
  private lastKey: AnimKey | null = null; private lastSerial = -1;
  /** The attention layer: breathing, a slow sway, the head turning to whoever is near. */
  private bones: { head?: THREE.Object3D; spine?: THREE.Object3D; hips?: THREE.Object3D; lUp?: THREE.Object3D; lLow?: THREE.Object3D; lFoot?: THREE.Object3D; rUp?: THREE.Object3D; rLow?: THREE.Object3D; rFoot?: THREE.Object3D } = {};
  /** How the body moves over the ground: on its feet, or on skates (a held glide over a still clip, in by speed). */
  private loco: 'walk' | 'skate' = 'walk';
  private glide = 0; private speed = 0; private lean = 0; private leanWant = 0;
  /** The kit worn: skate frames on the feet, or the jetpack on the back with its flames; on skates the body rides up by the frames. */
  private worn: Kit = 'boots'; private attachments: THREE.Object3D[] = []; private jetpack: THREE.Object3D | null = null; private flames: THREE.Mesh[] = [];
  private wearLift = 0; private thrust = 0; private flameK = 0; private shadows = true;
  private model: THREE.Object3D | null = null; private modelY = 0;
  /** Airborne on a jetpack: the jump clip's apex held, the body tilted by the engine's lean. */
  private flight = false;
  private lookTarget: THREE.Vector3 | null = null;
  private look = { yaw: 0, pitch: 0 };
  private attentionWeight = 1;
  private breath = Math.random() * 6.28;
  private tmpQ = new THREE.Quaternion(); private tmpV = new THREE.Vector3(); private tmpV2 = new THREE.Vector3(); private tmpE = new THREE.Euler(); private tmpM = new THREE.Matrix4();
  /** The sim's state mapped onto the fair's clips, one object rewritten each frame. */
  private out: AnimState = { key: 'idle', loop: true, fit: 0, from: 0, serial: 0, rate: 1 };
  /** A loop state of our own for bodies the sim does not own (other people). */
  private state: AnimState = { key: 'idle', loop: true, fit: 0, from: 0, serial: 0, rate: 1 };

  /** receive: whether the booths' shadows fall on this body too (a coarse shadow map stripes a curved suit; the phone tier leaves it out). */
  constructor(gltf: GLTF | null, lib: Library | null, role: NexoRole, receive = true) {
    this.tint.set(ROLE_TINT[role]);
    if (gltf) {
      const model = cloneSkeleton(gltf.scene);
      let shared = SHARED.get(gltf); if (!shared) { shared = { box: restBox(model), spheres: [], clips: null }; SHARED.set(gltf, shared); }
      const S = shared, box = S.box, k = NEXO_HEIGHT / Math.max(box.max.y - box.min.y, 1e-3); // the rest box scales with the body
      model.scale.setScalar(k);
      model.position.set(-k * (box.min.x + box.max.x) / 2, -k * box.min.y, -k * (box.min.z + box.max.z) / 2);
      let skinned = 0;
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        // culled by a sphere with room for the arms and a dance: a body behind the camera costs nothing
        const sk = m as THREE.SkinnedMesh; if (sk.isSkinnedMesh) { let sp = S.spheres[skinned]; if (!sp) { sk.computeBoundingSphere(); sp = (sk.boundingSphere ?? new THREE.Sphere()).clone(); sp.radius *= 1.7; S.spheres[skinned] = sp; } sk.boundingSphere = sp.clone(); skinned++; }
        m.frustumCulled = true; m.castShadow = true; m.receiveShadow = receive; this.meshes.push(m);
        const src = Array.isArray(m.material) ? m.material : [m.material];
        const cloned = src.map((mat) => {
          const s = (mat as THREE.MeshStandardMaterial).clone();
          if (s.isMeshStandardMaterial) {
            // a matte plastic suit: the generator's metalness map would only reflect a sky the fair does not light with
            // the web copy's only emissive map is the LED strip, which glows through the visor
            if (s.emissiveMap) s.emissive.set(0xffffff); else s.emissive.set(0x000000); s.metalnessMap = null; s.metalness = 0; s.roughness = Math.max(0.55, s.roughness); s.envMapIntensity = 0;
            tintSuit(s, this.tint); this.mats.push(s);
          }
          return s;
        });
        m.material = Array.isArray(m.material) ? cloned : cloned[0]!;
      });
      let clips = S.clips; // clips name their bones, so one retargeting serves every body cut from the file
      if (!clips) { clips = lib ? retarget(lib, model) : new Map<AnimKey, THREE.AnimationClip>(); if (gltf.animations[0]) clips.set('idle', gltf.animations[0]); if (lib) S.clips = clips; }
      let hips: THREE.Object3D | null = null;
      const B = this.bones, want: Record<string, keyof typeof B> = { Head: 'head', Spine01: 'spine', LeftUpLeg: 'lUp', LeftLeg: 'lLow', LeftFoot: 'lFoot', RightUpLeg: 'rUp', RightLeg: 'rLow', RightFoot: 'rFoot' };
      model.traverse((o) => { if (o.name === 'Hips') hips = o; const k = want[o.name]; if (k) B[k] = o; });
      if (hips) this.bones.hips = hips;
      if (hips) { model.updateMatrixWorld(true); const hy = (hips as THREE.Object3D).getWorldPosition(new THREE.Vector3()).y; this.stride = Math.pow(Math.max(0.15, Math.min(1.5, hy / SOURCE_HIPS)), 0.3); }
      this.anims = new AnimSet(model, clips);
      this.root.add(model); this.model = model; this.modelY = model.position.y;
    } else {
      this.anims = null;
      const { group, suit } = primitiveNexo(ROLE_TINT[role]);
      this.suit = suit;
      group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; this.meshes.push(m); } });
      this.root.add(group);
    }
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1b2130, transparent: true, opacity: 0.16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.blob.position.y = 0.02;
    this.root.add(this.blob);
  }

  /** Skates or feet: on skates the walk and run clips give way to a still one under a held glide. */
  setLocomotion(m: 'walk' | 'skate'): void { this.loco = m; }
  /** Put the kit on the body: a skate frame under each boot (the right one the left mirrored), or the jetpack on the
   *  back with its two flames; Boots take everything off. The model arrives when it arrives; a kit changed meanwhile wins. */
  wear(kit: Kit): void {
    if (this.worn === kit) return;
    this.worn = kit; this.undress();
    if (kit === 'boots') return;
    void loadKit(kit).then((g) => { if (!g || this.worn !== kit || !this.model) return; this.dress(kit, g); });
  }
  private dress(kit: Kit, g: THREE.Object3D): void {
    this.undress(); // two loads racing (a kit taken off and put back before it arrived) never stack
    const { lFoot, rFoot, spine } = this.bones;
    if (kit === 'skates' && lFoot && rFoot) {
      for (const [bone, right] of [[lFoot, false], [rFoot, true]] as const) {
        const ws = bone.getWorldScale(this.tmpV).x || 1, k = SKATE.scale / ws, s = g.clone();
        s.position.set(0, -(SKATE.ankle + SKATE.lift) / ws, SKATE.forward / ws); s.scale.set(right ? -k : k, k, k); bone.add(s); this.attachments.push(s);
      }
      this.wearLift = SKATE.lift;
    } else if (kit === 'jetpack' && spine) {
      const ws = spine.getWorldScale(this.tmpV).x || 1, k = JET.scale / ws, j = g.clone();
      j.position.set(0, JET.up / ws, JET.back / ws); j.scale.setScalar(k); spine.add(j); this.attachments.push(j); this.jetpack = j;
      for (const x of [-JET.nozzle, JET.nozzle]) { const f = new THREE.Mesh(FLAME_GEO, FLAME_MAT); f.position.set(x, JET.flameY, 0); f.scale.set(1, 0.001, 1); f.visible = false; j.add(f); this.flames.push(f); }
    }
    for (const a of this.attachments) a.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== FLAME_MAT) m.castShadow = this.shadows; }); // the kit throws a shadow on the tiers the body does
  }
  private undress(): void { for (const a of this.attachments) a.removeFromParent(); this.attachments = []; this.flames = []; this.jetpack = null; this.wearLift = 0; this.flameK = 0; }
  /** How hard the jetpack fires, 0..1: the flames under its tanks follow, eased and flickering. */
  setThrust(k: number): void { this.thrust = k; }
  /** How far the torso leans into a turn (radians, signed, left positive); the engine sets it from the yaw rate. */
  setLean(z: number): void { this.leanWant = z; }
  /** In the air on a jetpack, or not: on, the jump clip's apex is held until the feet touch. */
  setFlight(on: boolean): void { this.flight = on; }
  /** Where a backpack sits: behind the chest, in the world. False without a rigged body. */
  back(out: THREE.Vector3): boolean {
    if (this.jetpack) { this.jetpack.updateWorldMatrix(true, false); out.set(0, JET.flameY - 0.03, 0).applyMatrix4(this.jetpack.matrixWorld); return true; }
    const { spine } = this.bones; if (!spine) return false;
    spine.getWorldPosition(out); // brings the chain up to date itself
    const yaw = this.root.rotation.y; out.x -= Math.sin(yaw) * 0.28; out.z -= Math.cos(yaw) * 0.28; return true;
  }
  /** Where the ankles are in the world, for a trail. False without a rigged body. */
  feet(out: [THREE.Vector3, THREE.Vector3]): boolean {
    if (this.worn === 'skates' && this.attachments.length === 2) { for (let k = 0; k < 2; k++) this.attachments[k]!.getWorldPosition(out[k]!); return true; } // the wheels
    const { lFoot, rFoot } = this.bones; if (!lFoot || !rFoot) return false;
    lFoot.getWorldPosition(out[0]); rFoot.getWorldPosition(out[1]); return true;
  }

  /** The soft blob under the feet stands in for a shadow when the sun throws none. */
  setBlob(on: boolean): void { this.blob.visible = on; }
  /** Far bodies do not throw shadows: the map's texels are better spent on what is near. */
  setCastShadow(on: boolean): void { this.shadows = on; for (const m of this.meshes) m.castShadow = on; for (const a of this.attachments) a.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.material !== FLAME_MAT) m.castShadow = on; }); }

  setRole(role: NexoRole): void {
    this.tint.set(ROLE_TINT[role]);
    if (this.suit) this.suit.color.set(ROLE_TINT[role]);
  }

  /** The sim's state in the fair's clips: a stroll for walking, a jog for running and sprinting, a calm idle; loops
   * play at the rate that carries this body's feet at the given speed. Crossing from run to sprint keeps the jog going. */
  private mapped(anim: AnimState, speed: number): AnimState {
    const o = this.out;
    if (this.flight) { this.lastKey = null; o.key = 'jump'; o.loop = true; o.fit = 0; o.from = FLIGHT_FROM; o.serial = FLIGHT_SERIAL; o.rate = 0; return o; }
    let key = FAIR_KEYS[anim.key] ?? anim.key;
    if (this.loco === 'skate' && (key === 'stroll' || key === 'jog')) key = 'idle-calm'; // the glide is a pose, not a clip
    let serial = anim.serial;
    if (anim.loop && key === this.lastKey) serial = this.lastSerial; else { this.lastKey = anim.loop ? key : null; this.lastSerial = anim.serial; }
    const natural = NATURAL[key];
    o.key = key; o.loop = anim.loop; o.fit = anim.fit; o.from = anim.from; o.serial = serial; o.rate = anim.loop && natural ? Math.max(0.5, speed / (natural * this.stride)) : anim.rate;
    return o;
  }

  /** Drive the body from the sim's own animation state (the player); speed is the body's ground speed in m/s. */
  applySim(anim: AnimState, dt: number, speed = 0): void { if (this.anims) { this.anims.apply(this.mapped(anim, speed)); this.anims.update(dt); this.speed = speed; this.attention(dt, anim.loop); } }

  /** Where the head should turn to, in world space; null looks ahead. The engine sets it every tick. */
  attend(target: THREE.Vector3 | null): void { this.lookTarget = target; }

  /** Life on top of the clip, added after the mixer has posed the body: a breath through the chest, a slow sway of
   * the hips, and the head turning to the target within a comfortable range, eased. Faded out while a one-shot
   * (a wave, a jump) has the body, so it never fights a gesture. */
  private attention(dt: number, loop: boolean): void {
    const w = (this.attentionWeight = THREE.MathUtils.damp(this.attentionWeight, loop ? 1 : 0, 6, dt));
    this.breath += dt;
    const { head, spine, hips } = this.bones;
    if (spine) spine.quaternion.multiply(this.tmpQ.setFromAxisAngle(X_AXIS, Math.sin(this.breath * 1.55) * 0.02 * w));
    if (hips) hips.quaternion.multiply(this.tmpQ.setFromAxisAngle(Z_AXIS, Math.sin(this.breath * 0.47) * 0.018 * w));
    let wantYaw = 0, wantPitch = 0;
    if (this.lookTarget && head) {
      const inv = this.tmpM.copy(this.root.matrixWorld).invert(), t = this.tmpV.copy(this.lookTarget).applyMatrix4(inv), h = head.getWorldPosition(this.tmpV2).applyMatrix4(inv); // one inversion for both
      const dx = t.x - h.x, dy = t.y - h.y, dz = t.z - h.z, yaw = Math.atan2(dx, dz);
      if (Math.abs(yaw) < 1.05) { wantYaw = yaw; wantPitch = THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.4, 0.4); }
    }
    this.look.yaw = THREE.MathUtils.damp(this.look.yaw, wantYaw, 4, dt); this.look.pitch = THREE.MathUtils.damp(this.look.pitch, wantPitch, 4, dt);
    if (head) head.quaternion.multiply(this.tmpQ.setFromEuler(this.tmpE.set(-this.look.pitch * w, this.look.yaw * w, 0, 'YXZ')));
    // the glide on skates: knees bent, the left leg leading, the feet flat, the torso forward and into the turn, the
    // hips a hair lower so the feet stay on the floor; in by speed, out for a jump or a stop
    const g = (this.glide = THREE.MathUtils.damp(this.glide, this.loco === 'skate' && loop ? THREE.MathUtils.clamp((this.speed - 0.6) / 2, 0, 1) : 0, 6, dt));
    this.lean = THREE.MathUtils.damp(this.lean, this.leanWant, 6, dt);
    if (this.model) this.model.position.y = this.modelY - 0.04 * g + this.wearLift;
    if (this.flames.length) { this.flameK = THREE.MathUtils.damp(this.flameK, this.thrust, 12, dt); const on = this.flameK > 0.02, s = this.flameK * (0.85 + 0.25 * Math.sin(this.breath * 41)); for (const f of this.flames) { f.visible = on; f.scale.set(1, Math.max(0.001, s), 1); } }
    if (g > 0.001) {
      const { lUp, lLow, lFoot, rUp, rLow, rFoot } = this.bones, bend = (o: THREE.Object3D | undefined, a: number) => { if (o) o.quaternion.multiply(this.tmpQ.setFromAxisAngle(X_AXIS, a * g)); };
      bend(lUp, -0.45); bend(lLow, 0.55); bend(lFoot, -0.1); bend(rUp, -0.1); bend(rLow, 0.55); bend(rFoot, -0.45);
      if (spine) { spine.quaternion.multiply(this.tmpQ.setFromAxisAngle(X_AXIS, 0.18 * g)); spine.quaternion.multiply(this.tmpQ.setFromAxisAngle(Z_AXIS, -this.lean * g)); }
    }
  }

  /** Drive a body we only hear about: walk or run by speed, or hold a pose. Speeds in m/s. */
  applyRemote(speed: number, pose: string, dt: number): void {
    if (!this.anims) return;
    const s = this.state;
    const want: AnimKey | null = pose === 'wave' ? 'wave' : pose === 'cheer' ? 'victory' : pose === 'dance' ? 'dance' : pose === 'jump' ? 'jump' : null;
    if (want) { if (!(s.key === want && !s.loop)) { s.key = want; s.loop = false; s.fit = 0; s.from = 0; s.serial++; } }
    else {
      const key: AnimKey = speed < 0.3 ? 'idle-calm' : speed < 2.2 ? 'stroll' : 'jog', rate = key === 'idle-calm' ? 1 : Math.max(0.5, speed / (NATURAL[key]! * this.stride));
      if (!(s.key === key && s.loop)) { s.key = key; s.loop = true; s.fit = 0; s.from = 0; s.serial++; }
      s.rate = rate;
    }
    this.anims.apply(s);
    this.anims.update(dt);
    this.attention(dt, s.loop);
  }

  /** Where the feet are and which way the body faces. Airborne bodies lift their shadow with them. */
  place(x: number, y: number, z: number, yaw: number, lean = 0): void {
    this.root.position.set(x, y, z);
    this.root.rotation.set(lean, yaw, 0, 'YXZ');
    this.blob.position.y = 0.02 - y; // the shadow stays on the floor when the body is in the air
  }

  dispose(): void {
    this.undress(); this.worn = 'boots'; // the kits' meshes are shared: they leave before the body's own are thrown away
    this.anims?.dispose();
    // the model's geometry belongs to the file and every other body cut from it; the materials are this body's own
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; if (!this.model || !this.meshes.includes(m)) m.geometry?.dispose(); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose(); });
    this.root.removeFromParent();
  }
}
