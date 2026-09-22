// One stage for every world: the renderer and its canvas, the one-thumb input, the frame loop that stops on a hidden
// tab, the quality ladder and the perf box. A world (the fair, the Playground) is a Scene the stage drives; one is
// on at a time, and switching worlds is only a matter of which one gets the frames and the input.
import * as THREE from 'three';
import { toast } from '../state';
import { FairInput, type FairSink } from './input';

export type Quality = 'high' | 'low';
export function pickQuality(): Quality {
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || mem <= 4 ? 'low' : 'high';
}

/** What a world gives the stage. */
export interface Scene {
  /** where the input goes while this world is on */
  readonly sink: FairSink;
  /** one frame: simulate, then draw with the stage's renderer */
  frame(now: number, dt: number): void;
  resize(w: number, h: number): void;
  /** the ladder's step: 0 is everything; whether shadows are on at it, and how fine the map is */
  applyLevel(level: number, shadows: boolean, mapSize: number): void;
  /** the tail of the perf box's second line */
  perfExtra(): string;
  /** the scene's HTML labels: shown only while it has the stage */
  readonly overlay?: HTMLElement;
}

const IDLE_SINK: FairSink = { onTap() {}, onOrbit() {}, onZoom() {}, onKey() {}, enabled: () => false };

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly input: FairInput;
  readonly shadowsWanted = new URLSearchParams(location.search).get('shadows') !== '0';
  private active: Scene | null = null;
  private running = false; private paused = false; private last = 0; private disposed = false;
  /** The quality ladder: 0 is everything; each step gives a little (a finer shadow map first, then pixels, then the shadows) and comes back when the phone can. */
  private fps = { acc: 0, n: 0, dpr: 1, at: 0, level: 0, good: 0, changedAt: 0 };
  private perf: { el: HTMLDivElement; t0: number; frames: number } | null = null;
  private clock = { cpu: 0, gpu: 0 };
  private gpu: GpuClock | null = null;
  private size = { w: 1, h: 1 };
  private stops: (() => void)[] = [];

  constructor(readonly host: HTMLElement, readonly quality: Quality) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); // throws without WebGL
    this.fps.dpr = Math.min(devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.fps.dpr);
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = this.shadowsWanted; this.renderer.shadowMap.type = quality === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    host.prepend(this.renderer.domElement);
    this.input = new FairInput(this.renderer.domElement, IDLE_SINK);
    const ro = new ResizeObserver(() => this.resize()); ro.observe(host); this.stops.push(() => ro.disconnect()); this.resize();
    this.renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.running = false; toast('Graphics paused', 'Reloading…', 'warn', 6000); setTimeout(() => location.reload(), 1500); });
    // a hidden tab draws nothing; back in view, the loop picks up from now
    const vis = () => { if (!document.hidden && this.paused && this.running) { this.paused = false; this.loop(true); } };
    document.addEventListener('visibilitychange', vis); this.stops.push(() => document.removeEventListener('visibilitychange', vis));
    const q = new URLSearchParams(location.search);
    if (q.has('perf')) {
      this.perf = { el: Object.assign(document.createElement('div'), { className: 'perf' }), t0: performance.now(), frames: 0 }; host.appendChild(this.perf.el);
      if (q.has('gpu')) this.gpu = new GpuClock(this.renderer.getContext() as WebGL2RenderingContext); // ?perf&gpu: the queries stall some drivers, so only when asked
    }
    if (import.meta.env.DEV) (window as unknown as { __stage?: unknown }).__stage = this;
  }

  get level(): number { return this.fps.level; }
  get dpr(): number { return this.fps.dpr; }
  /** Shadows are on until the ladder's third step. */
  get shadows(): boolean { return this.shadowsWanted && this.fps.level < 3; }
  mapSize(): number { const fine = this.quality === 'high' ? 2048 : 1024; return this.fps.level >= 1 ? fine / 2 : fine; }
  get scene(): Scene | null { return this.active; }

  /** Hand the stage to a world: from now on it gets the frames, the input and the quality step. */
  use(scene: Scene) {
    if (this.active === scene) return;
    if (this.active?.overlay) this.active.overlay.style.display = 'none';
    this.active = scene; if (scene.overlay) scene.overlay.style.display = '';
    this.input.release(); this.input.setSink(scene.sink);
    scene.resize(this.size.w, this.size.h); scene.applyLevel(this.fps.level, this.shadows, this.mapSize());
    this.last = performance.now();
    if (!this.running && !this.disposed) this.loop(true);
  }

  private resize() {
    const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight;
    this.size = { w, h }; this.renderer.setSize(w, h); this.active?.resize(w, h);
  }

  private loop(first = false) {
    if (first) { this.running = true; this.last = performance.now(); }
    const frame = (now: number) => {
      if (!this.running) return;
      if (document.hidden) { this.paused = true; return; }
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      this.frame(now, dt); requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private frame(now: number, dt: number) {
    const t0 = this.perf ? performance.now() : 0;
    this.gpu?.begin();
    this.active?.frame(now, dt);
    this.gpu?.end();
    if (this.perf) { this.clock.cpu = this.clock.cpu * 0.9 + (performance.now() - t0) * 0.1; if (this.gpu) this.clock.gpu = this.gpu.ms; }
    this.adaptQuality(now);
    if (this.perf) {
      const pf = this.perf; pf.frames++;
      if (now - pf.t0 >= 1000) {
        const i = this.renderer.info.render;
        pf.el.textContent = `${Math.round((pf.frames * 1000) / (now - pf.t0))} fps · ${i.calls} calls · ${Math.round(i.triangles / 1000)}k tris · dpr ${this.fps.dpr} · q${this.fps.level}${this.shadows ? '' : ' no-shadow'}\ncpu ${this.clock.cpu.toFixed(1)} ms${this.gpu?.available ? ` · gpu ${this.clock.gpu.toFixed(1)} ms` : ''} · ${this.active?.perfExtra() ?? ''}`;
        pf.t0 = now; pf.frames = 0;
      }
    }
  }

  private adaptQuality(now: number) {
    const f = this.fps, gap = now - (f.at || now); f.at = now;
    if (gap > 250 || document.hidden) { f.acc = 0; f.n = 0; return; }
    f.acc += gap / 1000; f.n++;
    if (f.acc < 3) return;
    const fps = f.n / f.acc; f.acc = 0; f.n = 0;
    const capped30 = fps > 27 && fps < 33; // a display that runs at 30 is not a phone in trouble
    if (fps < 42 && !capped30) { f.good = 0; if (f.level < 4) this.setLevel(f.level + 1, now); }
    else if (fps > 56 && now - f.changedAt > 8000 && ++f.good >= 2 && f.level > 0) { f.good = 0; this.setLevel(f.level - 1, now); }
    else if (fps <= 56) f.good = 0;
  }

  /** 0: everything. 1: a coarser shadow map. 2: a quarter fewer pixels. 3: half, and no shadows. 4: one pixel per CSS pixel. */
  private setLevel(level: number, now: number) {
    const f = this.fps, max = Math.min(devicePixelRatio || 1, 2);
    f.level = level; f.changedAt = now;
    f.dpr = Math.max(1, level >= 4 ? 1 : level >= 3 ? max - 0.5 : level >= 2 ? max - 0.25 : max); this.renderer.setPixelRatio(f.dpr);
    this.renderer.shadowMap.enabled = this.shadows;
    this.active?.applyLevel(level, this.shadows, this.mapSize());
  }

  dispose() {
    this.disposed = true; this.running = false; this.paused = false; this.active = null;
    this.input.dispose(); this.stops.forEach((s) => s()); this.perf?.el.remove();
    this.renderer.dispose(); this.renderer.domElement.remove();
  }
}

/** GPU time of one frame, when the browser will say (EXT_disjoint_timer_query_webgl2: desktop Chrome does, phones
 *  mostly do not). A query wraps each frame; results are read a few frames later and smoothed. */
class GpuClock {
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  ms = 0;
  constructor(private gl: WebGL2RenderingContext) { this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as GpuClock['ext']; }
  get available(): boolean { return !!this.ext; }
  begin() { if (!this.ext || this.pending.length > 4) return; const q = this.gl.createQuery(); if (!q) return; this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q); this.active = q; }
  end() {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.pending.push(this.active); this.active = null;
    while (this.pending.length) {
      const q = this.pending[0]!;
      if (!this.gl.getQueryParameter(q, this.gl.QUERY_RESULT_AVAILABLE)) break;
      if (!this.gl.getParameter(this.ext.GPU_DISJOINT_EXT)) { const ns = this.gl.getQueryParameter(q, this.gl.QUERY_RESULT) as number; this.ms = this.ms ? this.ms * 0.9 + (ns / 1e6) * 0.1 : ns / 1e6; }
      this.gl.deleteQuery(q); this.pending.shift();
    }
  }
}
