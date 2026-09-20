# Nexo — source assets (20 Sep 2026)

The Nexova mascot as a body in the fair (`/fair.html`). Same Phase 1 pipeline as the six library avatars
(docs/ceritera-build-plan.md §4.3 and §5), same shared animation library retargeted onto it.

- References: `nexo references/` at the repository root — the full render (`nexo full image 3d.jpeg`, 1145×1373),
  two reference sheets (turnaround, head angles, LED expressions, hand gestures, feet, materials, poses, palette:
  white #FFFFFF, silver #D9D9D9, light grey #F0F0F0, black #0A0A0A, accent blue #00E5FF), and the space background
  (`nexova world background.mp4/.jpeg`, the fair's sky).
- `views/` — FRONT is the full render scaled to 1024 tall; LEFT, BACK and RIGHT are the turnaround cells of sheet 1
  (x 405–550, 780–930, 1150–1295; y 100–400) upscaled ×3 with Lanczos. `crop-views.mjs` (needs `sharp`) cuts them.
- Generated with Meshy multi-image-to-3D: textured, PBR, A-pose, rigged at 1.6 m, idle clip 0, 30k triangles
  (38 credits). Job `6e0de4de-a948-4b75-a24e-ab61b1aba41b`.
- Web copy: `public/fair/nexo.glb` (WebP textures + meshopt, 1.01 MB, 24 joints). `src/fair/nexo.ts` scales it to
  1.6 m, drops the emissive copy of the colour map, makes the suit matte (metalness 0, roughness ≥ 0.55: the fair
  lights with a hemisphere and a sun and no environment map, under which the generator's metallic values rendered
  black), and tints only the light unsaturated texels by role (visitors white, exhibitors MIHAS orange `#F07A1D`)
  so the black visor and the blue LED line keep their colour. While the file loads, a Nexo of primitives stands in.
- **The rig is ours (20 Sep, fix plan 1).** Meshy's auto-rig put the knees inside the boots (8 cm off the floor,
  below the ankles), left the spine with no skin and the hips 3.6 cm off mirror: the limp the user saw. `rig.json`
  holds the 24 joints (left side and centre; the right side is mirrored) read off the body's cross-sections
  (`PROFILE=1 node tools/rig/fit-mascot-rig.mjs assets-src/characters/nexo/nexo-raw.glb`), the capsule radii and
  the rigid parts (helmet, shoulder pads, boots). `node tools/rig/fit-mascot-rig.mjs` writes `nexo-rig2.glb` (raw),
  `public/fair/nexo.glb` (WebP + meshopt) and `rig-report.json`, which `src/fair/nexo-rig.test.ts` checks. Rest
  rotations are identity, so `anim.ts` retargets the library's world-space deltas straight onto it. Meshy's own idle
  is gone with the old skeleton; the fair plays the library's calm idle, stroll and jog on Nexo (`src/fair/nexo.ts`).
- Poses for the fair: wave (Big_Wave_Hello 28), cheer (Victory_Cheer 59), dance (All_Night_Dance 64), jump
  (Regular_Jump 466) come from the shared library (`assets-src/animation/README.md`).
