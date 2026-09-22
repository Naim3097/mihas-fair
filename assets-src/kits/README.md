# The kits — skates and jetpack (23 Sep 2026)

The Playground's rewards as things on Nexo's body (`src/fair/nexo.ts`, `wear()`): skate frames under the boots, the
jetpack on the back. Made the way the body was (`assets-src/characters/nexo/README.md`): the reference sheets cut
into orthographic views, a multi-view generator on Higgsfield, the pick judged in the turnaround viewer under the
fair's own light, then a web export in the fair's matte look with the cyan lights on an emissive map.

## Web copies (`public/fair/`)

| file | what | triangles | size (m, x·y·z) | anchor | KB |
|---|---|---|---|---|---|
| `skate.glb` | the whole left skate, shown over its Playground stand; worn as its frame and wheels alone, cut at the sole (y 0.14) when it loads (`src/fair/clip.ts`: a new index over the same vertex buffers and paint), because the boot part sits inside Nexo's own boot and is never seen | 7,000 (4,100 worn) | 0.17 · 0.33 · 0.32 | bottom (under the wheels), toe +z | 383 |
| `jetpack.glb` | the jetpack, worn and shown | 8,996 | 0.37 · 0.42 · 0.24 | centre, straps toward +z (the MIHAS face away from the wearer) | 525 |

Both: one material, 1024² WebP colour, an emissive map of the cyan texels (wheel rings, strips, thrusters),
metalness 0, roughness 0.6, no normal or metal-rough maps, meshopt. `src/fair/kit-models.test.ts` holds these
numbers, and checks the rig they hang on (the foot and chest joints resting unrotated, the ankle 17 cm up).

## How they were made

1. **Views off the sheets** (`assets-src/references/mihas skates reference.png`, `mihas backpack reference.png`;
   the `single.png` files are the hero renders, `mihas logo.png` the mark). Each sheet's front, back, left and right
   cells, padded square in the sheet's own background and upscaled ×3:

   ```
   node tools/rig/crop-views.mjs "assets-src/references/mihas skates reference.png" out skate front=18,655,192,915 back=190,655,354,915 left=376,655,610,915 right=616,655,856,915 scale=3
   node tools/rig/crop-views.mjs "assets-src/references/mihas backpack reference.png" out jetpack front=14,612,222,890 back=230,612,432,890 left=444,612,598,890 right=608,612,778,890 scale=3
   ```

   The rows were measured with a dark/saturated-pixel profile of the sheet, not by eye: the first crops clipped the
   wheels and the jetpack's handles.

2. **Generation** (Higgsfield, 22 Sep, five jobs, about 100 credits in all). The multi-view Tripo won both times;
   Hunyuan and Meshy read the sheets less faithfully (the skate's wheels merged, the jetpack's tanks lost their
   shape). Views go in the order front, left, back, right as `image_references`.

   | item | generator | job | kept |
   |---|---|---|---|
   | skate | `tripo_h3_1_multiview_to_3d` | `7f6d31ab-7137-427d-ad6b-8435cc475065` | yes |
   | skate | `hunyuan3d_v3_image_to_3d` | `b43c8841-c49d-4b64-a31a-6509ef181ce2` | no |
   | jetpack | `tripo_h3_1_multiview_to_3d` | `d699404d-a19a-4001-9e8d-f7c192896fff` | yes |
   | jetpack | `meshy_v7_image_to_3d` | `dcf232f6-3d73-4587-8993-7f7503a7b590` | no |
   | jetpack | `tripo_h3_1_image_to_3d` (the hero render alone) | `14f6a6ab-89ee-45fe-b832-6daa1428c411` | no |

   The generators' GLBs are 20–60 MB each and are not kept in the repo; a job id re-downloads one from Higgsfield.

3. **Export** (`tools/rig/export-item.mjs`: turn to face +z, size in metres, anchor, weld, simplify to the budget,
   matte materials, the cyan texels lifted into an emissive map, WebP):

   ```
   node tools/rig/export-item.mjs skate-tripo.glb public/fair/skate.glb --yaw -90 --fit 0.33 --fit-axis y --anchor bottom --tris 7000 --tex 1024 --glow
   node tools/rig/export-item.mjs jetpack-tripo.glb public/fair/jetpack.glb --yaw 90 --fit 0.42 --fit-axis y --anchor center --tris 9000 --tex 1024 --glow
   ```

   Tripo's meshes face +x, so the yaw turns them to +z (the skate's toe, the jetpack's straps). Check in the viewer
   before trusting a yaw: `node tools/rig/viewer/server.mjs` (the launch config "viewer"), then
   `http://localhost:5175/?glb=/repo/public/fair/jetpack.glb&views=front,left,back,top&h=0.55&front=+z&cols=2&cell=300&look=fair`:
   the front cell is the camera at +z, so the skate's toe points at it and the jetpack shows its straps.

## Where they sit on the body (`src/fair/nexo.ts`)

Measured off the rig, not by eye (`node tools/rig/inspect-rig.mjs public/fair/nexo.glb` prints the joints and the
silhouette in 5 cm bands). The rig's joints rest unrotated, so a joint's frame is the body's own, moved to the joint.

- **Skates**: the frame (the skate cut at the sole as it loads) under each foot joint (the right one the left mirrored), scale 1.3, its top under the sole,
  centred 5 cm forward under a boot that is 50 cm long and 34 cm wide; the body rides up by the frame's 11.7 cm.
  The trail ribbons start at the wheels (`feet()`).
- **Jetpack**: a clone on the chest joint (Spine01, 68 cm up), scale 1.35, 48 cm behind and 10 cm above it: over the
  suit's own pack (its back at z −0.38), embedded a hair so the chest's breathing opens no gap. Two additive cone
  flames under its tanks (x ±0.13) follow the thrust, eased and flickering; the exhaust trail starts at its bottom
  (`back()`).
