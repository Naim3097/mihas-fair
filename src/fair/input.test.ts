// The one-thumb controls, driven by synthetic pointer and key events on a stand-in for the canvas: a push on the
// stick jogs and only a held full push sprints; a touch lifted in place is a tap with a finger's tolerance and a
// click is exact; a drag orbits; a mouse resting on the world hovers; the keys steer and Shift sprints.
import { test } from 'node:test';
import assert from 'node:assert/strict';

type Listener = (e: unknown) => void;
class FakeEl {
  style: Record<string, string> = {}; className = ''; textContent = ''; hidden = false;
  private listeners = new Map<string, Listener[]>();
  addEventListener(k: string, f: Listener) { (this.listeners.get(k) ?? this.listeners.set(k, []).get(k)!).push(f); }
  removeEventListener(k: string, f: Listener) { const l = this.listeners.get(k); if (l) l.splice(l.indexOf(f), 1); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 800 }; }
  setPointerCapture() {} appendChild() {} remove() {}
  fire(k: string, e: unknown) { for (const f of [...(this.listeners.get(k) ?? [])]) f(e); }
}
const doc = Object.assign(new FakeEl(), { body: new FakeEl(), createElement: () => new FakeEl() }), win = new FakeEl();
Object.assign(globalThis, { document: doc, window: win, HTMLInputElement: class {}, HTMLTextAreaElement: class {}, HTMLSelectElement: class {}, HTMLElement: class {} });
const { FairInput } = await import('./input');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ptr = (id: number, type: 'touch' | 'mouse', x: number, y: number, buttons = 1) => ({ pointerId: id, pointerType: type, clientX: x, clientY: y, buttons });
const key = (code: string, type: 'keydown' | 'keyup' = 'keydown') => win.fire(type, { code, target: null, repeat: false, preventDefault() {} });

function rig() {
  const el = new FakeEl(), got = { tap: [] as [number, number, boolean][], orbit: [] as [number, number][], zoom: [] as number[], hover: [] as ({ x: number; y: number } | null)[] };
  const input = new FairInput(el as unknown as HTMLElement, {
    onTap: (x, y, c) => got.tap.push([x, y, c]), onOrbit: (a, b) => got.orbit.push([a, b]), onZoom: (f) => got.zoom.push(f), onHover: (h) => got.hover.push(h), onKey: () => {}, enabled: () => true,
  });
  return { el, got, input };
}

test('the stick: a push jogs, a flick to the rim still jogs, a held full push sprints, lifting stops', async () => {
  const { el, got, input } = rig();
  el.fire('pointerdown', ptr(1, 'touch', 60, 700)); // lower left: the stick zone
  assert.ok(!input.stickHeld, 'not a stick until the thumb moves');
  el.fire('pointermove', ptr(1, 'touch', 60, 660)); // 40 px up
  let it = input.poll();
  assert.ok(input.stickHeld); assert.ok(it.move.y > 0.65 && it.move.y < 0.8, `forward ${it.move.y}`); assert.ok(Math.abs(it.move.x) < 1e-9); assert.ok(!it.sprint);
  el.fire('pointermove', ptr(1, 'touch', 60, 600)); // past the rim: the base follows, the push is full
  it = input.poll(); assert.ok(it.move.y > 0.999, 'full'); assert.ok(!it.sprint, 'a flick is a jog');
  await sleep(340);
  it = input.poll(); assert.ok(it.sprint, 'held out there, a sprint');
  el.fire('pointermove', ptr(1, 'touch', 60, 640)); it = input.poll(); assert.ok(!it.sprint, 'eased back: a jog again');
  el.fire('pointerup', ptr(1, 'touch', 60, 640));
  it = input.poll(); assert.equal(it.move.x, 0); assert.equal(it.move.y, 0); assert.ok(!it.sprint); assert.ok(!input.stickHeld);
  assert.equal(got.tap.length, 0, 'a push is not a tap');
  input.dispose();
});

test('taps: a touch lifted in place is a tap with tolerance, a click is exact, a drag is not a tap', () => {
  const { el, got, input } = rig();
  el.fire('pointerdown', ptr(2, 'touch', 80, 720)); el.fire('pointerup', ptr(2, 'touch', 82, 721)); // in the stick zone, lifted in place
  assert.deepEqual(got.tap, [[82, 721, true]]);
  el.fire('pointerdown', ptr(3, 'touch', 300, 200)); el.fire('pointerup', ptr(3, 'touch', 300, 200)); // elsewhere
  assert.deepEqual(got.tap[1], [300, 200, true]);
  el.fire('pointerdown', ptr(4, 'mouse', 300, 100)); el.fire('pointerup', ptr(4, 'mouse', 300, 100));
  assert.deepEqual(got.tap[2], [300, 100, false], 'a mouse is exact');
  el.fire('pointerdown', ptr(5, 'mouse', 300, 100)); el.fire('pointermove', ptr(5, 'mouse', 330, 110)); el.fire('pointerup', ptr(5, 'mouse', 330, 110));
  assert.equal(got.tap.length, 3, 'a drag is not a tap'); assert.deepEqual(got.orbit, [[30, 10]], 'it looks around');
  input.dispose();
});

test('a mouse resting on the world hovers; a wheel zooms; leaving clears the hover', () => {
  const { el, got, input } = rig();
  el.fire('pointermove', ptr(6, 'mouse', 200, 300, 0));
  assert.deepEqual(got.hover, [{ x: 200, y: 300 }]);
  el.fire('wheel', { deltaY: 100, preventDefault() {} });
  assert.ok(Math.abs(got.zoom[0]! - Math.exp(0.12)) < 1e-9);
  el.fire('pointerleave', ptr(6, 'mouse', -1, -1, 0));
  assert.equal(got.hover[1], null);
  input.dispose();
});

test('keys: WASD steers at a jog, Shift sprints, letting go stops', () => {
  const { input } = rig();
  key('KeyW'); let it = input.poll(); assert.equal(it.move.y, 1); assert.equal(it.move.x, 0); assert.ok(!it.sprint, 'a jog by default');
  key('ShiftLeft'); it = input.poll(); assert.ok(it.sprint, 'Shift sprints');
  key('KeyD'); it = input.poll(); assert.ok(Math.abs(it.move.x - Math.SQRT1_2) < 1e-9 && Math.abs(it.move.y - Math.SQRT1_2) < 1e-9, 'diagonals are unit length');
  key('KeyW', 'keyup'); key('KeyD', 'keyup'); key('ShiftLeft', 'keyup');
  it = input.poll(); assert.equal(it.move.x, 0); assert.equal(it.move.y, 0); assert.ok(!it.sprint);
  key('Space'); it = input.poll(); assert.ok(it.jump); it = input.poll(); assert.ok(!it.jump, 'a tap is read once');
  input.dispose();
});
