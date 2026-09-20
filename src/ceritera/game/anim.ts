// Animation for the avatars: one shared library of clips, generated once and stored as deltas from the source
// rig's rest pose, is retargeted to each model by joint name against that model's own rest pose. Each delta is
// carried into world space through the source rest hierarchy and back into the target's, so a rig with other
// proportions (Nexo's) turns each joint by the same world rotation the source did; a rig with the source's own
// rest pose comes out as before. Each fighter then owns an AnimSet: a mixer, one action per clip, and the small
// rules that turn the sim's AnimState into crossfades, loops fitted to the feet, and one-shots fitted to the
// mechanics' timing.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { AnimKey } from '../../../content';
import type { AnimState } from './entities';

export interface Library {
  clips: Map<AnimKey, THREE.AnimationClip>;
  /** The source rig's rest pose: for each animated joint, its parent's world rotation. */
  rest: Map<string, { parentWorld: THREE.Quaternion }>;
}

/** Which part of a generated clip to use, in seconds: the generator's clips often hold repeats and long holds. */
const WINDOW: Partial<Record<AnimKey, [number, number]>> = {
  'attack-1': [0.6, 1.5],
  'attack-2': [0.3, 1.9],
  'attack-3': [1.6, 3.6],
  cast: [0.1, 1.3],
  'cast-heavy': [0.2, 2.3],
  slam: [0.2, 2.2],
  spin: [0.2, 2.7],
  block: [0.15, 1.8],
  hit: [0, 1.1],
  dodge: [0.1, 1.6],
  jump: [0.1, 1.75],
  death: [0.1, 2.1],
  victory: [0.2, 3.6],
  wave: [0.3, 2.4],
  dance: [0.2, 5.4],
  stroll: [7.67, 10.2], // the cleanest loop in a 24 s look-around walk (tools/anim/loop-window.mjs)
};
/** Clips whose hips height the physics supplies: the character must not rise twice. */
const NO_HIPS_Y = new Set<AnimKey>(['jump', 'spin']);
/** When a clip is missing, what to show instead. */
const FALLBACK: Partial<Record<AnimKey, AnimKey>> = { 'combat-idle': 'idle', fall: 'jump', sprint: 'run', victory: 'idle', spin: 'cast-heavy', wave: 'cast', dance: 'victory', 'idle-calm': 'idle', stroll: 'walk', jog: 'run' };

let libPromise: Promise<Library | null> | null = null;

/** For every joint of a rest-posed hierarchy: its parent's world rotation, which is the frame its local delta lives in. */
function restOf(root: THREE.Object3D, isJoint: (o: THREE.Object3D) => boolean): Library['rest'] {
  root.updateMatrixWorld(true);
  const out: Library['rest'] = new Map();
  root.traverse((o) => {
    if (!isJoint(o)) return;
    const parentWorld = new THREE.Quaternion();
    o.parent?.getWorldQuaternion(parentWorld);
    out.set(o.name, { parentWorld });
  });
  return out;
}

/** The shared library, fetched once. Resolves null when it cannot be loaded: the models still idle. */
export function loadLibrary(url = '/ceritera/anim/library.glb'): Promise<Library | null> {
  return (libPromise ??= new Promise((resolve) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.load(url, (g) => {
      const animated = new Set<string>();
      for (const c of g.animations) for (const t of c.tracks) animated.add(t.name.slice(0, t.name.lastIndexOf('.')));
      resolve({ clips: new Map(g.animations.map((c) => [c.name as AnimKey, c])), rest: restOf(g.scene, (o) => animated.has(o.name)) });
    }, undefined, () => resolve(null));
  }));
}

/** Delta clips → clips for one model, using the bones' current (rest) transforms. Call before anything animates it. */
export function retarget(lib: Library, root: THREE.Object3D): Map<AnimKey, THREE.AnimationClip> {
  const bones = new Map<string, THREE.Object3D>();
  root.traverse((o) => { if ((o as THREE.Bone).isBone || o.name === 'Hips') bones.set(o.name, o); });
  const rest = new Map<string, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  for (const [name, b] of bones) rest.set(name, { q: b.quaternion.clone(), p: b.position.clone() });
  const tgt = restOf(root, (o) => bones.has(o.name));
  const hips = bones.get('Hips');
  const hipsHeight = hips ? hips.position.length() || 1 : 1;
  const d = new THREE.Quaternion(), q = new THREE.Quaternion(), spInv = new THREE.Quaternion(), tpInv = new THREE.Quaternion(), up = new THREE.Vector3();
  const out = new Map<AnimKey, THREE.AnimationClip>();
  for (const [key, clip] of lib.clips) {
    const [w0, w1] = WINDOW[key] ?? [0, clip.duration];
    const tracks: THREE.KeyframeTrack[] = [];
    for (const tr of clip.tracks) {
      const dot = tr.name.lastIndexOf('.');
      const name = tr.name.slice(0, dot), prop = tr.name.slice(dot + 1);
      const r = rest.get(name), t = tgt.get(name);
      if (!r || !t) continue;
      const times = tr.times, vals = tr.values, idx: number[] = [];
      for (let i = 0; i < times.length; i++) if (times[i]! >= w0 - 1e-6 && times[i]! <= w1 + 1e-6) idx.push(i);
      if (idx.length < 2) continue;
      const tt = new Float32Array(idx.map((i) => Math.max(0, times[i]! - w0)));
      // the source parent's rest frame carries the delta into world space and the target parent's brings it back;
      // a joint the library never saw keeps its delta local
      const sp = lib.rest.get(name)?.parentWorld ?? t.parentWorld, tp = t.parentWorld;
      spInv.copy(sp).invert(); tpInv.copy(tp).invert();
      if (prop === 'quaternion') {
        const nv = new Float32Array(idx.length * 4);
        idx.forEach((i, k) => {
          d.set(vals[i * 4]!, vals[i * 4 + 1]!, vals[i * 4 + 2]!, vals[i * 4 + 3]!);
          q.copy(tpInv).multiply(sp).multiply(d).multiply(spInv).multiply(tp).multiply(r.q);
          nv[k * 4] = q.x; nv[k * 4 + 1] = q.y; nv[k * 4 + 2] = q.z; nv[k * 4 + 3] = q.w;
        });
        tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, tt, nv));
      } else if (prop === 'position' && name === 'Hips') {
        const nv = new Float32Array(idx.length * 3), keepY = !NO_HIPS_Y.has(key);
        up.set(0, 1, 0).applyQuaternion(tpInv); // world up, in the hips' parent frame
        idx.forEach((i, k) => {
          const h = keepY ? vals[i * 3 + 1]! * hipsHeight : 0;
          nv[k * 3] = r.p.x + up.x * h; nv[k * 3 + 1] = r.p.y + up.y * h; nv[k * 3 + 2] = r.p.z + up.z * h;
        });
        tracks.push(new THREE.VectorKeyframeTrack(`${name}.position`, tt, nv));
      }
    }
    if (tracks.length) out.set(key, new THREE.AnimationClip(key, w1 - w0, tracks));
  }
  return out;
}

export class AnimSet {
  readonly mixer: THREE.AnimationMixer;
  private actions = new Map<AnimKey, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private serial = -1;
  private key: AnimKey | null = null;

  constructor(root: THREE.Object3D, clips: Map<AnimKey, THREE.AnimationClip>) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const [k, c] of clips) this.actions.set(k, this.mixer.clipAction(c));
  }

  has(key: AnimKey): boolean { return this.actions.has(key); }

  private resolve(key: AnimKey): THREE.AnimationAction | null {
    let k: AnimKey | undefined = key;
    for (let i = 0; i < 4 && k; i++) { const a = this.actions.get(k); if (a) return a; k = FALLBACK[k]; }
    return this.actions.get('idle') ?? null;
  }

  /** Bring the mixer in line with the sim's wish: a new one-shot restarts, a new loop crossfades, a loop's rate follows the feet. */
  apply(s: AnimState): void {
    const a = this.resolve(s.key);
    if (!a) return;
    if (s.serial === this.serial && s.key === this.key) {
      if (s.loop) a.timeScale = s.rate;
      return;
    }
    const clip = a.getClip(), dur = Math.max(0.01, clip.duration);
    a.reset();
    a.enabled = true;
    a.setLoop(s.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !s.loop;
    a.time = s.from * dur;
    a.timeScale = s.loop ? s.rate : s.fit > 0 ? (dur * (1 - s.from)) / s.fit : 1;
    const fade = s.loop ? 0.22 : 0.08;
    if (this.current && this.current !== a) { this.current.fadeOut(fade); a.fadeIn(fade); } else a.setEffectiveWeight(1);
    a.play();
    this.current = a; this.serial = s.serial; this.key = s.key;
  }

  update(dt: number): void { this.mixer.update(dt); }

  dispose(): void { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.mixer.getRoot()); }
}
