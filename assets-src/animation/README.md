# The shared animation library (20 Sep 2026)

One set of clips for all six avatars and for Nexo. Generated once on the Ilmuwan rig with Meshy's `3d_rigging` + animation
(8 credits a clip, 18 clips, 144 credits), then stored not as poses but as **deltas from the source rig's rest
pose**, so the same file plays on any rig with the same 24 joint names, against that rig's own rest pose:

    D_k = L_source_k · inv(L_source_rest)                            (parent space; this is what the library stores)
    L_target_k = inv(Pt) · Ps · D_k · inv(Ps) · Pt · L_target_rest   (Ps, Pt: the parent's world rest rotation on each rig)
    hips_target_k = hips_rest + delta_k · hips_rest_height       (x/z dropped: the controller moves the body)

For a rig with the source's rest pose Ps = Pt and the second line is just D_k · L_target_rest; for one with other
proportions (Nexo) the delta becomes the same world rotation the source made.

`src/ceritera/game/anim.ts` does the retargeting at load time (`retarget()`), picks a window of each clip
(`WINDOW`), and drops the hips height for clips whose rise the physics already supplies (`NO_HIPS_Y`).

| key | Meshy action | id | window (s) | used for |
|---|---|---|---|---|
| walk | Casual_Walk_inplace | 613 | whole (4.23) | walking, rate = speed / 1.7 |
| run | run_fast_3_inplace | 659 | whole (0.80) | jogging, rate = speed / 4.4 |
| sprint | Lean_Forward_Sprint_inplace | 644 | whole (0.63) | sprinting |
| jump | Regular_Jump | 466 | 0.10–1.75 | jumps, air jumps, wall kicks, leaps |
| dodge | Roll_Dodge | 158 | 0.10–1.60 | the roll, air dashes, dash skills |
| attack-1 | Kung_Fu_Punch | 96 | 0.60–1.50 | strike 1, Staff Strike |
| attack-2 | Large_step_then_high_kick | 378 | 0.30–1.90 | strike 2, Twin Strike |
| attack-3 | Flying_Fist_Kick | 94 | 1.60–3.60 | strike 3, Horizon |
| cast | mage_soell_cast | 129 | 0.10–1.30 | quick casts |
| cast-heavy | Charged_Spell_Cast | 125 | 0.20–2.30 | ultimates |
| slam | Charged_Ground_Slam | 127 | 0.20–2.20 | Earth Wave, the slam landing |
| spin | 360_Power_Spin_Jump | 397 | 0.20–2.70 | (spare) |
| block | Block1 | 138 | 0.15–1.80 | The Stance, Closed Chapter |
| hit | Hit_Reaction | 178 | 0.00–1.10 | staggers |
| death | dying_backwards | 189 | 0.10–2.10 | deaths |
| victory | Victory_Cheer | 59 | 0.20–3.60 | the cheer (fair) |
| wave | Big_Wave_Hello | 28 | 0.30–2.40 | the wave (fair), photos |
| dance | All_Night_Dance | 64 | 0.20–5.40 | the dance (fair) |
| idle-calm | Idle_02 | 11 | whole (2.37) | the fair's standing idle |
| stroll | Walk_Slowly_and_Look_Around | 341 | 7.67–10.20 | the fair's walk (the cleanest loop of a 24 s clip, `tools/anim/loop-window.mjs`) |
| jog | Run_02 | 14 | whole (0.77) | the fair's run and sprint |

Each model still carries its own `idle` (the clip it was generated with).

Files: `library-raw.glb` here (1.08 MB, the joint hierarchy plus the 18 delta clips); the web copy at
`public/ceritera/anim/library.glb` is the same after `gltf-transform resample` + `meshopt` (400 KB).

Rebuild: `node tools/anim/build-library.mjs` (needs `@gltf-transform/core`, `@gltf-transform/extensions` and
`meshoptimizer`; downloads the 16 generated GLBs into `tools/anim/cache/`, which is disposable), then
`gltf-transform resample` and `gltf-transform meshopt --level high` into `public/ceritera/anim/`.
`node tools/anim/motion-profile.mjs` prints each clip's motion per tenth of a second, which is how the windows
above were chosen. Job ids are in the build script.

Unreal: import the 16 source GLBs (or FBX from them) once onto the shared skeleton and retarget with the IK
Retargeter; the windows above are the clip ranges to trim to.
