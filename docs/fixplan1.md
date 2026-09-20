# Fix plan 1 — Nexo's body and the Nexova sky

20 Sep 2026. Scope: `/fair.html` only. Sections 1–4 are the audit and the plan as written before any change;
the status below records what landed the same day. No step touches Mission X (`/`) or Ceritera (`/play.html`).

## Status — landed 20 Sep 2026

- **A, the rig.** `tools/rig/fit-mascot-rig.mjs` with `assets-src/characters/nexo/rig.json`: the 24 joints, the
  right side mirrored from the left, identity rest rotations, capsule skin with rigid helmet, shoulder pads and
  boots, two smoothing passes, a report checked by `src/fair/nexo-rig.test.ts`. One change from the plan: the mesh
  is too sparse in places (a boot's side wall is a handful of vertices) for the tool to find the landmarks on its
  own, so the joint heights come from a per-character config written from the tool's own profile dump
  (`PROFILE=1`), and the tool does the mirroring, skinning, report and file assembly. Result: knees at 50 % of the
  leg, mirror error 0, the spine chain carrying 91 % of the torso, skin mirror agreement 96 %; the web file went
  from 1.01 MB to 0.95 MB (the duplicate emissive map dropped). The jog, wave, jump and calm idle all read as a
  body now; the boots stay boots.
- **B, movement.** `src/fair/movement.ts` (walk 1.3, jog 2.7, sprint 4.2 m/s, no jump in the air) reaches the
  controller through a `movement` on `Sim`; Ceritera's hall keeps `MOVEMENT`. The stride factor is the hip-height
  ratio to the power 0.3 (0.75 for Nexo), not the square root: at 0.62 the jog looked hurried, at 0.75 the cadence
  reads natural and the boots slide a little. Camera 4.6 m.
- **C, clips and life.** Three clips generated on the Ilmuwan rig into the shared library (24 credits):
  Idle_02 → `idle-calm`, Walk_Slowly_and_Look_Around → `stroll` (its cleanest loop, 7.67–10.20 s, found by the new
  `tools/anim/loop-window.mjs`), Run_02 → `jog`. Nexo maps idle, walk, run and sprint onto them, so a run-to-sprint
  change no longer restarts the clip. The attention layer (`NexoActor.attention`): a breath through the chest, a
  slow sway of the hips, the head turning to the nearest Nexo within 6 m and 60°, eased, faded out during a
  gesture. The LED blink was dropped: the LED is painted in the colour texture and a blink needs its own material.
- **D, the sky.** One closed dome in `src/fair/world.ts`: procedural stars in two sizes with a slow twinkle, a
  blue gradient toward the horizon, the video once in a 130° window on a cylinder (nothing squashed) with its own
  horizon at floor level and the planet due north, and a halo of the frame's blurred edge colour fading over 10°.
  No lid, no repeat, no seam, no line under the platforms; straight up is stars.
- **E.** 80 tests, `npm run build` green, Ceritera's hall checked in the browser after the shared-code changes.


## 0. How it was investigated

- A rig audit tool (gltf-transform, in the scratchpad; will move to `tools/rig/` with Fix A) read
  `public/fair/nexo.glb` and, as the baseline, `public/ceritera/models/ilmuwan.glb` (the rig the clip library
  was generated on): every joint's world position, the mirror error of each left/right pair, bone lengths, the
  mesh silhouette per height band, and which joint carries each vertex.
- In the browser: Nexo's rest pose from the front and the side, the skeleton drawn over the body, the idle at
  four moments, and the sky from four camera positions (eye level toward the west glass, straight up, over a
  platform edge looking down, high across the plan).
- The video probed in the browser: size, length, first-vs-last frame difference, edge brightness.
- The reference render (`nexo references/nexo full image 3d.jpeg`) against the model's proportions.

## 1. Findings

### 1.1 The mesh is fine — keep it

| check | result |
|---|---|
| left vs right silhouette, 12 height bands | max difference 1.9 cm (at hip height); all others ≤ 0.8 cm |
| joints of the mesh (vertices) | 32,236, one material, textures intact |
| helmet, crown to neck, share of height | reference ≈ 40 %, model 45 % |
| legs, crotch to sole, share of height | reference ≈ 22 %, model 25 % |
| arm reach, shoulder to hand, share of height | reference ≈ 28 %, model 27 % |

The rest pose (front and side) is a clean A-pose with straight legs and matches the reference. The
"disproportion" and "asymmetry" you see appear the moment a clip plays, and they come from the skeleton (1.2),
not the mesh. Rebuilding the mesh (38 credits, a new texture, new tint tuning) would not fix the gait.

### 1.2 The skeleton is wrong for this body — root cause of the limp, the bent joints, the asymmetry

Joint heights in cm (the file is 1.6 m tall):

| joint | Nexo left / right | Ilmuwan left / right |
|---|---|---|
| hips | 48.8 | 95.9 |
| knee | **8.7 / 7.5** | 49.8 / 48.9 |
| ankle | **11.1 / 12.4** | 13.6 / 13.5 |
| toe | 3.3 / 3.3 | 3.3 / 3.6 |
| shoulder | 88.5 / 89.2 | 136.3 / 136.9 |
| elbow | 71.6 / 69.6 | 115.1 / 115.8 |
| head joint | 88.4 (chest height) | 151.0 |

Bone lengths in cm: Nexo thigh **46.9 / 49.1**, shin **8.0 / 8.8** (Ilmuwan 38 / 39); Nexo head bone 72
(Ilmuwan 21).

1. **The knee is inside the boot, 8 cm off the floor, and below the ankle.** The thigh is the whole leg; the
   shin is 8 cm long and points up. Every walk or run frame bends the knee by up to 60°: on this rig that folds
   the boot, not the leg, while the thigh swings as one rigid column from the hip to the floor. That is the limp.
2. **Left and right differ.** Hip joints 3.6 cm mirror error (left at x −4.3 cm, right at +7.9 cm), knees
   1.2 cm apart in height, thighs 2.3 cm different, forearms 2.4 cm different, elbows 1.9 cm apart in height.
   A symmetric clip lands asymmetric on this rig, in every pose.
3. **The spine carries nothing.** Spine02, Spine01 and neck control zero vertices; the torso is welded to the
   hips, so the idle's spine sway moves nothing. Meanwhile the two shoulder bones carry 5,573 vertices reaching
   125 cm high, into the helmet, so raising an arm pulls the helmet with it, and the head bone starts at chest
   height and owns everything from 64 cm up.
4. Why: Meshy's auto-rigger fits a human template (knee at half the leg, torso ≈ 40 % of the height) to a
   mascot whose helmet is 45 % of its height and whose legs are 36 cm. It put the knees where a human's ankles
   would be and gave the spine nothing. No rigging parameter changes this (the rigging model takes only a
   height; there are no joint hints).

### 1.3 The clips and the speeds are Ceritera's, not a fair's

- The idle you see is Nexo's own Meshy clip 0 "Idle" (4.03 s: a look-around with a head dip at 2 s). It is
  the same generic action every library avatar was generated with, hence "moves like the Ceritera characters".
- Locomotion is the shared library: walk = Casual_Walk_inplace (613), run = run_fast_3_inplace (659),
  sprint = Lean_Forward_Sprint_inplace (644), a combat sprint. Speeds are Ceritera's `MOVEMENT` (walk 1.7,
  run 4.4, sprint 7 → 9.5 m/s); the fair only made stamina unlimited.
- **The playback rate assumes the Ilmuwan's stride.** `rate = speed / 1.7` for the walk was tuned for hips at
  96 cm. Nexo's hips are at 49 cm, so at any speed its feet cover about half the ground the clip implies: the
  boots skate roughly 2×. Skating on top of the folded knee is what reads as "walks like a cripple".
- 9.5 m/s (34 km/h) with a lean-forward sprint is superhuman on purpose in Ceritera. At a fair it is frantic.

### 1.4 The sky is stitched, not one space

Current build (`src/fair/world.ts`, `sky()`): the video on an open cylinder, radius 900 m, 800 m tall, centred
150 m up, wrapped three times with MirroredRepeat; a flat dark disc as a lid at 549 m; the scene's background
colour wherever the cylinder ends (below −250 m).

The video (`public/fair/space.mp4`): 2020 × 1024 (1.97:1), 10.04 s, nearly static (mean pixel change start to
middle 3.8 / 255), loop seam 3 / 255, so **the loop is not the cut**. Composition: a planet with a lit rim
filling the upper two thirds, a small moon top right, and a luminous horizon band with a reflective plane in
the bottom fifth. Edge brightness (0–255): left 33, right 113, bottom 95, top 48.

What the cylinder makes of it, seen in the four views:

1. **Six planets** around the horizon (three repeats, each mirrored). "One galaxy" becomes a hall of mirrors.
2. **A seam every 60° of yaw**: the bright right edge meets its own mirror (a light column), the dark left
   edge meets its own (a dark column).
3. **Straight up: a black disc.** No stars overhead.
4. **Over a platform edge: a hard line.** The video's bright horizon band runs along the horizon, then the
   cylinder stops and the flat background colour shows under the fair.
5. The video is **squashed 16 %** vertically (each 1,885 m copy wants 955 m of height on an 800 m cylinder).
6. The video's own horizon (the reflective plane) sits 150 m above the fair's floor instead of at floor level.

## 2. The fixes

### Fix A — Rebuild Nexo's rig: our own skeleton and skin, same mesh, same 24 joint names

A Node tool, `tools/rig/fit-mascot-rig.mjs` (gltf-transform, no Blender, repeatable for any future mascot):

1. Load the raw Meshy GLB (`assets-src/characters/nexo/nexo-raw.glb`); keep mesh, materials and textures;
   drop the skin and joints.
2. Measure the body from the mesh: crotch height (lowest torso point between the legs), the two leg columns
   (vertex clusters left and right below the crotch), boot tops (the jump in depth), the shoulder line (widest
   chest band), the arm columns, the neck (narrowest band between chest and helmet), the helmet sphere.
3. Place the 24 joints with the same names, **mirrored exactly** (right = mirror of left): hips at the crotch
   plus 8 % of the leg, knees at 52 % of the leg, ankles at the boot top, toes at the boot front; Spine02,
   Spine01, Spine evenly from the hips to the neck; shoulders on the chest's widest line; elbows and wrists at
   45 % and 90 % of the arm column; neck and Head at the neck top; head_end at the crown; headfront at the visor.
4. Skin with segment capsules: each vertex takes weights from its two nearest bone segments with a 6 cm blend at
   joints and rigid cores (helmet 100 % Head; chest panel and backpack 100 % Spine01/Spine02; boots 100 % Foot);
   then three smoothing passes over mesh neighbours; at most four influences, normalised.
5. Write `public/fair/nexo.glb` (WebP + meshopt as now) and `assets-src/characters/nexo/nexo-rig2.glb`, plus a
   JSON report. A `node:test` checks the report: mirror error < 0.3 cm on every pair, knee at 45–58 % of the
   leg, the spine chain carrying ≥ 15 % of the torso's vertices, weights summing to 1.

`anim.ts` then retargets the whole library onto it with no change (world-space deltas, matching names). Nexo's
own Meshy idle targets the old rig and is dropped; the idle comes from Fix C.

Acceptance: the skeleton overlay shows knees mid-leg and ankles above the boots, mirrored; walking and jogging on
the flat floor with no boot folding; wave, cheer, dance and jump symmetric from the front; the helmet does not
move when an arm is raised.

Effort: one session. Credits: 0. Fallbacks if the capsule weights crease at the joints: Blender 4.x headless
"automatic weights" on the same skeleton (needs Blender installed; it is not on this machine) or Mixamo's
auto-rigger (Adobe account, eight markers placed by hand, FBX back to GLB).

### Fix B — Fair movement and stride-true playback

- `src/fair/movement.ts`: `FAIR_MOVEMENT` = walk 1.4, run 3.4 (a jog), sprint 5.2 with no ramp, used only by
  the fair's Sim. Ceritera's `MOVEMENT` stays as it is.
- Playback rate scaled by hip height: `AnimSet` gains a `stride` factor (Nexo 0.51 = 49 cm / 96 cm; the six
  avatars 1.0), and `rate = speed / (clipSpeed × stride)`, in `applySim` and `applyRemote` alike. The boots
  then plant instead of skating.
- Camera distance 5.2 → 4.4 m for a 1.6 m body (the head label height moves with it).

Acceptance: a foot-slide meter in the `?perf` overlay (toe speed while planted < 0.15 m/s at walk and jog).
Effort: two to three hours. Credits: 0.

### Fix C — A fair idle and gait: library additions plus an attention layer on Nexo

- Generate on the Ilmuwan rig into the shared library (8 credits a clip, retargeted to everyone):
  a calm standing idle, a stroll for slow movement, and a jog to replace the combat run. Candidates to preview
  before spending (previews are Meshy's GIFs):
  - idle: [Idle_02 (11)](https://cdn.meshy.ai/webapp-assets/feature-demo/animation/preview/biped/Idle_02.gif),
    [Idle_03 (12)](https://cdn.meshy.ai/webapp-assets/feature-demo/animation/preview/biped/Idle_03.gif),
    [Idle_5 (245)](https://cdn.meshy.ai/webapp-assets/feature-demo/animation/preview/biped/Idle_5.gif),
    [Idle_9 (249)](https://cdn.meshy.ai/webapp-assets/feature-demo/animation/preview/biped/Idle_9.gif),
    [Idle_15 (599)](https://cdn.meshy.ai/webapp-assets/feature-demo/animation/preview/biped/Idle_15.gif)
  - stroll: [Walk_Slowly_and_Look_Around (341)](https://cdn.meshy.ai/webapp-assets/feature-demo/animation/preview/biped/Walk_Slowly_and_Look_Around.gif),
    [Thoughtful_Walk (121)](https://cdn.meshy.ai/webapp-assets/feature-demo/animation/preview/biped/Thoughtful_Walk.gif),
    [Confident_Walk (106)](https://cdn.meshy.ai/webapp-assets/feature-demo/animation/preview/biped/Confident_Walk.gif)
  - jog: [Run_02 (14)](https://cdn.meshy.ai/webapp-assets/feature-demo/animation/preview/biped/Run_02.gif),
    [Run_03 (15)](https://cdn.meshy.ai/webapp-assets/feature-demo/animation/preview/biped/Run_03.gif),
    [run_fast_2 (539)](https://cdn.meshy.ai/webapp-assets/feature-demo/animation/preview/biped/run_fast_2.gif)
  - seated, for the rest spots (later): Chair_Sit_Idle_M (33)
- An attention layer on Nexo (`src/fair/nexo.ts`, applied after the mixer, additive, off during one-shots):
  breathing (1.5° spine sway at 0.25 Hz), a weight shift every 6–10 s, the head turning toward the nearest
  other Nexo or booth within 60° and 6 m (eased over 2 s, back to centre when they leave), a blink of the LED.
  This is what makes a mascot feel present at a fair, whichever base clip plays.
- Remote Nexos pick the stroll below 2 m/s, the jog above.

Effort: half a session plus your picks from the previews. Credits: 24 (three clips), 32 with the seated idle.

### Fix D — One continuous sky

Replace `sky()` with a closed sky sphere (radius 1,200 m, one shader material, drawn first, no depth) that
layers:

1. **A procedural star field** everywhere: hash-distributed stars on the sphere in three sizes, a gentle
   twinkle, density matched to the stars in the video, and a faint blue gradient from the horizon up so the
   dome never reads as flat black.
2. **The video projected once**, into a window 130° wide by 66° tall (its own 1.97:1, no squash), centred on
   north (the way the spawn faces, so the planet stands over the far end of the hall), with the video's horizon
   line (21 % up the frame) placed at 0° elevation: the luminous band sits exactly at platform level and the
   reflective plane continues under the fair, so the platforms read as floating above a lit sea.
3. **A halo** outside the window: the still frame's clamped, mip-blurred edge colour fading over 20°, so the
   bright rim light on the right dissolves into the stars instead of stopping at a line; the dark left edge
   simply meets the stars.

No lid, no cylinder edge, no background colour anywhere in view. The still `space.jpg` remains the first frame
until the video plays and is the halo's source. Phones get the same single sphere (about 60 lines of GLSL); the
twinkle is off on the low tier. Draw calls: +1 for the halo, −1 for the lid.

Kept in the drawer: a screen-space backdrop (`scene.background` = the video, cover-fit, gentle parallax with
yaw). Seamless and cheapest, but the sky would no longer turn with the world; the sphere is the better fit for
"inside the world".

Acceptance: the same four views show one planet, no mirror, no lid, no line under the platform, the horizon
band at platform level; the phone tier keeps its frame time (measured with `?perf`).
Effort: half a session. Credits: 0.

### Fix E — Verification and hygiene

- Tests for the rig tool's report; `npm test`; `npm run build`; the four sky screenshots and the front/side
  skeleton overlay kept in `assets-src/characters/nexo/` as before/after evidence.
- Docs: `assets-src/characters/nexo/README.md` (the new rig and tool), `docs/ceritera-build-plan.md` §13,
  the fair note in `README.md`.
- Shared code: only `anim.ts` changes (a `stride` factor that defaults to 1), so Ceritera's hall plays exactly
  as it does now; verified in the browser after the change.

## 3. Order and what I need from you

| step | depends on | effort | credits |
|---|---|---|---|
| A rig rebuild | — | 1 session | 0 |
| B fair movement + stride | A | 2–3 h | 0 |
| D sky | — (can run beside A) | ½ session | 0 |
| C idle and gait clips + attention layer | A, your picks | ½ session | 24–32 |
| E verification and docs | all | 1–2 h | 0 |

A first, because everything Nexo does is judged through the rig. D is independent. C last, because its clips
are chosen by eye.

Decisions for you:

1. Rig: the Node rebuild (recommended, no new software) or install Blender for heat-diffusion weights.
2. Clips: pick one idle, one stroll and one jog from the previews above (or say "your call").
3. Credits: up to 32 for Fix C.

## 4. Not in this plan

Booth archetypes (the next plan, after this one lands), level of detail for many rigged bodies, the seated
idle beyond listing it, lighting the fair from the planet's side of the sky.
