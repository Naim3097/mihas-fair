// Plain vector maths for the simulation. The sim never touches three.js, so it runs under node:test and reads the
// same in Unreal C++; the renderer copies these numbers into Object3Ds once a frame. Y is up; a heading of 0 faces
// +Z and turns toward +X, the way an Object3D's rotation.y does.
export interface V3 { x: number; y: number; z: number }

export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });
export const copy = (out: V3, a: V3): V3 => { out.x = a.x; out.y = a.y; out.z = a.z; return out; };
export const set = (out: V3, x: number, y: number, z: number): V3 => { out.x = x; out.y = y; out.z = z; return out; };
export const add = (a: V3, b: V3): V3 => v3(a.x + b.x, a.y + b.y, a.z + b.z);
export const sub = (a: V3, b: V3): V3 => v3(a.x - b.x, a.y - b.y, a.z - b.z);
export const scale = (a: V3, s: number): V3 => v3(a.x * s, a.y * s, a.z * s);
export const dot = (a: V3, b: V3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a: V3): number => Math.hypot(a.x, a.y, a.z);
export const lenXZ = (a: V3): number => Math.hypot(a.x, a.z);
export const dist = (a: V3, b: V3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const distXZ = (a: V3, b: V3): number => Math.hypot(a.x - b.x, a.z - b.z);
export const norm = (a: V3): V3 => { const l = len(a); return l > 1e-9 ? scale(a, 1 / l) : v3(); };
export const lerp = (a: V3, b: V3, t: number): V3 => v3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
/** Frame-rate independent smoothing: where `a` ends up moving toward `b` for `dt` seconds at rate `k`. */
export const damp = (a: number, b: number, k: number, dt: number): number => a + (b - a) * (1 - Math.exp(-k * dt));
/** Heading of a direction: atan2(x, z), so +Z is 0 and +X is π/2. */
export const yawOf = (d: V3): number => Math.atan2(d.x, d.z);
export const fromYaw = (yaw: number, l = 1): V3 => v3(Math.sin(yaw) * l, 0, Math.cos(yaw) * l);
export const wrapAngle = (a: number): number => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
export const angleDiff = (from: number, to: number): number => wrapAngle(to - from);
/** Turn `from` toward `to` by at most `max` radians. */
export const turnToward = (from: number, to: number, max: number): number => { const d = angleDiff(from, to); return Math.abs(d) <= max ? to : from + Math.sign(d) * max; };
/** Move a number toward a target by at most `max`. */
export const approach = (from: number, to: number, max: number): number => (Math.abs(to - from) <= max ? to : from + Math.sign(to - from) * max);
