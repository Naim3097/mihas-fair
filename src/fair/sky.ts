// The Nexova sky: one closed dome, drawn last. Stars everywhere and a faint blue toward the horizon; the video
// projected once into a window over the north end, on a cylinder so nothing is squashed, with its own horizon
// line at floor level so the luminous band sits where the platforms float; and a halo of the frame's blurred
// edge colour so the window ends nowhere. No lid, no seam, no repeat. The fair and the Playground share it.
import * as THREE from 'three';

/** The video's window on the sky: half its width in radians of azimuth; its height on a unit cylinder (the width
 * of arc divided by the frame's 1.973 aspect, so nothing is squashed); how far up the frame its horizon line sits. */
const SKY = { halfWidth: 1.134, height: 2.268 / 1.973, horizon: 0.21, centre: -0.5 } as const; // centre: the window's middle 29° west of north puts the planet due north

export class Sky {
  readonly dome: THREE.Mesh;
  readonly still: THREE.Texture;
  private mat: THREE.ShaderMaterial;
  private video: HTMLVideoElement | null = null;
  private videoTex: THREE.VideoTexture | null = null;
  /** Called once the video plays, with its texture: the fair puts it on the hero booth's screen. */
  onVideo: ((tex: THREE.Texture) => void) | null = null;

  /** lean: the phone tier keeps the still, no decode and no texture upload every frame. */
  constructor(lean: boolean) {
    const still = new THREE.TextureLoader().load('/fair/space.jpg', () => { this.mat.uniformsNeedUpdate = true; });
    still.colorSpace = THREE.SRGBColorSpace; still.wrapS = still.wrapT = THREE.ClampToEdgeWrapping; still.minFilter = THREE.LinearMipmapLinearFilter; still.generateMipmaps = true;
    this.still = still;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uVideo: { value: still }, uHalo: { value: still }, uTime: { value: 0 },
        uWindow: { value: new THREE.Vector4(SKY.halfWidth, SKY.height, SKY.centre, SKY.horizon) },
        uHorizon: { value: new THREE.Color(0x1a2c55) }, uZenith: { value: new THREE.Color(0x090f1f) },
      },
      vertexShader: `varying vec3 vDir; void main() { vec4 wp = modelMatrix * vec4(position, 1.0); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `
        uniform sampler2D uVideo; uniform sampler2D uHalo; uniform float uTime; uniform vec4 uWindow; uniform vec3 uHorizon; uniform vec3 uZenith;
        varying vec3 vDir;
        float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float stars(vec3 d, float scale, float density, float size) {
          vec3 p = d * scale, c = floor(p), f = p - c;
          if (hash(c) > density) return 0.0;
          vec3 sp = vec3(hash(c + 1.7), hash(c + 3.1), hash(c + 5.3));
          return smoothstep(size, 0.0, length(f - sp)) * (0.45 + 0.55 * hash(c + 9.1));
        }
        void main() {
          vec3 d = normalize(vDir);
          float el = asin(clamp(d.y, -1.0, 1.0)), az = atan(d.x, -d.z);
          vec3 col = mix(uHorizon, uZenith, smoothstep(-0.25, 0.55, d.y));
          float tw = 0.8 + 0.2 * sin(uTime * 1.6 + hash(floor(d * 60.0)) * 6.2832);
          col += vec3(0.85, 0.92, 1.0) * (stars(d, 60.0, 0.45, 0.09) + 0.6 * stars(d, 150.0, 0.35, 0.07)) * tw;
          // the video window: azimuth linear, elevation as a cylinder, its horizon at uWindow.w up the frame
          float dAz = az - uWindow.z; dAz = atan(sin(dAz), cos(dAz));
          vec2 uv = vec2(0.5 + dAz / (2.0 * uWindow.x), uWindow.w + tan(clamp(el, -1.2, 1.2)) / uWindow.y);
          vec2 span = vec2(2.0 * uWindow.x, uWindow.y);
          vec2 outside = max(vec2(0.0), max(-uv, uv - 1.0)) * span;
          float outDist = length(outside);
          vec2 edge = min(uv, 1.0 - uv) * span;
          float inside = step(0.0, min(edge.x, edge.y));
          float feather = smoothstep(0.0, 0.14, min(edge.x, edge.y)) * inside;
          vec2 cuv = clamp(uv, 0.0, 1.0);
          vec3 halo = texture2D(uHalo, cuv, 5.0).rgb;
          float haloA = exp(-outDist * outDist / (2.0 * 0.17 * 0.17)) * 0.85;
          col = mix(col, halo, haloA);
          col = mix(col, texture2D(uVideo, cuv).rgb, feather);
          gl_FragColor = vec4(col, 1.0);
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1200, 48, 32), this.mat);
    this.dome.frustumCulled = false; this.dome.renderOrder = 100; // last of the opaque: only the sky that shows is shaded
    if (lean) return;
    const video = document.createElement('video');
    video.src = '/fair/space.mp4'; video.muted = true; video.loop = true; video.playsInline = true; video.preload = 'auto'; video.crossOrigin = 'anonymous';
    const tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    video.addEventListener('playing', () => { this.mat.uniforms.uVideo!.value = tex; this.onVideo?.(tex); }, { once: true });
    this.video = video; this.videoTex = tex;
    this.play();
  }

  /** Autoplay is allowed muted; some browsers still want a gesture first, so the engine calls this again on the first touch. */
  play() { void this.video?.play().catch(() => {}); }

  update(t: number) { this.mat.uniforms.uTime!.value = t; }

  dispose() {
    this.video?.pause(); this.video?.removeAttribute('src'); this.videoTex?.dispose(); this.still.dispose();
    this.dome.geometry.dispose(); this.mat.dispose();
  }
}
