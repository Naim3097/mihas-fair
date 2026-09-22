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

export const NEXO_URL = '/fair/nexo.glb';
/** The same body at a quarter of the triangles and smaller textures: other people, on the phone tier. */
export const NEXO_LOD_URL = '/fair/nexo-lod.glb';
/** Nexo stands this tall in the fair: a head taller than a booth counter, a head shorter than a booth. */
export const NEXO_HEIGHT = 1.6;
export const ROLE_TINT = { visitor: 0xffffff, exhibitor: 0xf07a1d, crew: 0x2a2f3a } as const;
export type NexoRole = keyof typeof ROLE_TINT;
/** The fair's clips for the sim's locomotion keys, and each clip's natural speed on the source rig, m/s. */
const FAIR_KEYS: Partial<Record<AnimKey, AnimKey>> = { idle: 'idle-calm', 'combat-idle': 'idle-calm', walk: 'stroll', run: 'jog', sprint: 'jog' };
const NATURAL: Partial<Record<AnimKey, number>> = { stroll: 1.05, jog: 3.0, walk: 1.7, run: 4.4, sprint: 7 };
/** The source rig's hip height, m: a body's stride scales with its own. */
const SOURCE_HIPS = 0.96;
const X_AXIS = new THREE.Vector3(1, 0, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);

const models = new Map<string, Promise<GLTF | null>>();
function loadModel(url: string): Promise<GLTF | null> {
  let p = models.get(url);
  if (!p) { p = new Promise((resolve) => { const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder); loader.load(url, (g) => resolve(g), undefined, () => resolve(null)); }); models.set(url, p); }
  return p;
}
export const loadNexo = (): Promise<GLTF | null> => loadModel(NEXO_URL);
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
  private bones: { head?: THREE.Object3D; spine?: THREE.Object3D; hips?: THREE.Object3D } = {};
  private lookTarget: THREE.Vector3 | null = null;
  private look = { yaw: 0, pitch: 0 };
  private attentionWeight = 1;
  private breath = Math.random() * 6.28;
  private tmpQ = new THREE.Quaternion(); private tmpV = new THREE.Vector3(); private tmpV2 = new THREE.Vector3(); private tmpE = new THREE.Euler();
  /** A loop state of our own for bodies the sim does not own (other people). */
  private state: AnimState = { key: 'idle', loop: true, fit: 0, from: 0, serial: 0, rate: 1 };

  /** receive: whether the booths' shadows fall on this body too (a coarse shadow map stripes a curved suit; the phone tier leaves it out). */
  constructor(gltf: GLTF | null, lib: Library | null, role: NexoRole, receive = true) {
    this.tint.set(ROLE_TINT[role]);
    if (gltf) {
      const model = cloneSkeleton(gltf.scene);
      const size = restBox(model).getSize(new THREE.Vector3());
      model.scale.setScalar(NEXO_HEIGHT / Math.max(size.y, 1e-3));
      const box = restBox(model), c = box.getCenter(new THREE.Vector3());
      model.position.set(-c.x, -box.min.y, -c.z);
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        // culled by a sphere with room for the arms and a dance: a body behind the camera costs nothing
        const sk = m as THREE.SkinnedMesh; if (sk.isSkinnedMesh) { sk.computeBoundingSphere(); if (sk.boundingSphere) sk.boundingSphere.radius *= 1.7; }
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
      const clips = lib ? retarget(lib, model) : new Map<AnimKey, THREE.AnimationClip>();
      if (gltf.animations[0]) clips.set('idle', gltf.animations[0]);
      let hips: THREE.Object3D | null = null; model.traverse((o) => { if (o.name === 'Hips') hips = o; if (o.name === 'Head') this.bones.head = o; if (o.name === 'Spine01') this.bones.spine = o; });
      if (hips) this.bones.hips = hips;
      if (hips) { model.updateMatrixWorld(true); const hy = (hips as THREE.Object3D).getWorldPosition(new THREE.Vector3()).y; this.stride = Math.pow(Math.max(0.15, Math.min(1.5, hy / SOURCE_HIPS)), 0.3); }
      this.anims = new AnimSet(model, clips);
      this.root.add(model);
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

  /** The soft blob under the feet stands in for a shadow when the sun throws none. */
  setBlob(on: boolean): void { this.blob.visible = on; }
  /** Far bodies do not throw shadows: the map's texels are better spent on what is near. */
  setCastShadow(on: boolean): void { for (const m of this.meshes) m.castShadow = on; }

  setRole(role: NexoRole): void {
    this.tint.set(ROLE_TINT[role]);
    if (this.suit) this.suit.color.set(ROLE_TINT[role]);
  }

  /** The sim's state in the fair's clips: a stroll for walking, a jog for running and sprinting, a calm idle; loops
   * play at the rate that carries this body's feet at the given speed. Crossing from run to sprint keeps the jog going. */
  private mapped(anim: AnimState, speed: number): AnimState {
    const key = FAIR_KEYS[anim.key] ?? anim.key;
    let serial = anim.serial;
    if (anim.loop && key === this.lastKey) serial = this.lastSerial; else { this.lastKey = anim.loop ? key : null; this.lastSerial = anim.serial; }
    const natural = NATURAL[key];
    const rate = anim.loop && natural ? Math.max(0.5, speed / (natural * this.stride)) : anim.rate;
    return { ...anim, key, serial, rate };
  }

  /** Drive the body from the sim's own animation state (the player); speed is the body's ground speed in m/s. */
  applySim(anim: AnimState, dt: number, speed = 0): void { if (this.anims) { this.anims.apply(this.mapped(anim, speed)); this.anims.update(dt); this.attention(dt, anim.loop); } }

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
      const t = this.root.worldToLocal(this.tmpV.copy(this.lookTarget)), h = this.root.worldToLocal(head.getWorldPosition(this.tmpV2));
      const dx = t.x - h.x, dy = t.y - h.y, dz = t.z - h.z, yaw = Math.atan2(dx, dz);
      if (Math.abs(yaw) < 1.05) { wantYaw = yaw; wantPitch = THREE.MathUtils.clamp(Math.atan2(dy, Math.hypot(dx, dz)), -0.4, 0.4); }
    }
    this.look.yaw = THREE.MathUtils.damp(this.look.yaw, wantYaw, 4, dt); this.look.pitch = THREE.MathUtils.damp(this.look.pitch, wantPitch, 4, dt);
    if (head) head.quaternion.multiply(this.tmpQ.setFromEuler(this.tmpE.set(-this.look.pitch * w, this.look.yaw * w, 0, 'YXZ')));
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
    this.anims?.dispose();
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; m.geometry?.dispose(); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose(); });
    this.root.removeFromParent();
  }
}
