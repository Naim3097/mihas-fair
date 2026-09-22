# Nexo — source assets (22 Sep 2026)

The Nexova mascot as a body in the fair (`/`, `src/fair`). Same Phase 1 pipeline as the six library avatars
(docs/ceritera-build-plan.md §4.3 and §5), same shared animation library retargeted onto it.

## What is here

- `nexo-source.glb` — the geometry generator's output, untouched (Tripo H3.1 multiview-to-3D via Higgsfield, job
  `f0883370-7cd2-41bf-8d4a-23ba4add692e`, 18 credits): 97,770 triangles, one material, 4096² maps. Faces +x,
  0.98 units tall, centred on the origin. Its own colour map is not used (see below).
- `nexo-textures.glb` — the texture set that is used, in the same UV layout: two Meshy retexture passes of that
  mesh blended by position (front-styled where the point is forward of the ears, back-styled elsewhere), 2048²
  colour, metal-rough and normal maps. No mesh inside; `normalize-mascot.mjs --textures-from` reads it.
- `nexo-raw.glb` — the body in the fair's frame with those textures cleaned up, the input to the rig fitter:
  metres, 1.6 m tall, y up, facing +z with its left side at +x, floor at y = 0, one welded mesh plus the visor's
  bezel ring and the LED ribbons; the LED's colour on an emissive map.
- `rig.json` — our 24 joints for this body (left side and centre; the right side is mirrored), capsule radii and
  the rigid parts (helmet, shoulder pads, boots), read off the body's cross-sections.
- `nexo-rig2.glb` — the rigged, skinned body at full detail. `rig-report.json` is what
  `src/fair/nexo-rig.test.ts` checks.
- Web copy: `public/fair/nexo.glb` (55,000 triangles, 2048² WebP colour, the LED emissive map, a derived 1024²
  roughness map, no normal map, meshopt, 0.84 MB, 24 joints).

## References

`assets-src/references/`: six orthographic renders of the character made for this pass — `Front`, `Back`, `Left`,
`Right Orthographic.png` (camera on that side of Nexo; in `Left` Nexo faces the viewer's left), `Head Front.png`,
`Backpack Detail.png`, all 1254². The older full render, the two reference sheets and the space background
(`nexova world background.mp4/.jpeg`, the fair's sky) are there too. Palette: white #FFFFFF, silver #D9D9D9, light
grey #F0F0F0, black #0A0A0A, accent blue #00E5FF.

## How the body was made (22 Sep)

The 20 Sep body came from one render plus turnaround cells cropped off a sheet and upscaled; its backpack and hands
came out wrong. This one was generated from the four orthographic views (front, left, back, right, in that
order) with three multi-view generators side by side, judged in a turnaround viewer under the fair's own lights
(hemisphere + sun, metalness 0, roughness ≥ 0.55, no environment map):

| generator | job | credits | result |
|---|---|---|---|
| Tripo H3.1 multiview (`texture_quality` and `geometry_quality` detailed, face limit 100k, orientation align_image) | `f0883370-…` | 18 | **geometry chosen**: clean helmet seams, the backpack as drawn (slot, ring, slot, lower panel with two screws), chunky hands |
| Hunyuan3D v3 (4 views, PBR, 120k faces) | `27b1944b-…` | 23 | clean geometry, but the backpack became two pods with a ring on one and slots on the other |
| Meshy multi-image (textured, PBR, A-pose, symmetry on, 60k) | `89ef1672-…` | 30 | the whitest texture, but a faceted visor, a capsule backpack and a striped back panel: the same class of mesh faults as the 20 Sep body |

**Textures.** Tripo projects the reference renders onto the mesh, so its colour map carries their lighting: a
mid-grey suit (unsaturated texels: median 185 of 255), baked shadow under the helmet, and creased, smeared
shading on surfaces no view saw (the top of the backpack). A plain gain to whiten it clips that shading into
hard white-against-grey edges, and Tripo's normal map adds crumpled noise to every flat face under the fair's
sun. So the colour comes from Meshy instead: two `meshy_v5_retexture` passes over the Tripo mesh with
`enable_original_uv` (same UVs, 9.5 credits each), one styled from the front reference (`42bb819c-…`: visor and
chest panel right; backpack ring and ear rings wrong) and one from the back reference (`c2bd4db4-…`: backpack
and ear rings right; visor grey). `blend-textures-by-facing.mjs --by position` takes the front pass forward of
the ear rings and the back pass behind them, with a soft transition across the sides (a blend by surface normal
gave the ear rings, whose faces point every way, a patchy mix of both passes).

**Clean-ups in `normalize-mascot.mjs`**, in the order they run:

- `--denoise 20,0.02,0.4,2` smooths the surface itself. The generator bakes the references' shading into the
  geometry as soft creases and lumps a few centimetres wide, on the helmet's dome, the torso and the arms; with no
  normal map, the fair's sun shades every one of them into a smudge. Bilateral filtering of the face normals over
  each face's two-ring neighbourhood (weighted by area, by distance with sigma 2 cm, and by normal difference with
  sigma 0.4, which keeps creases sharper than about 45°), twenty passes, then the vertices move to fit the
  filtered normals: never more than 1.5 mm per pass, not at all where the filtered normals around a vertex
  disagree (thin parts, corners), and never a move that folds one of the vertex's faces (the plain update folded
  2% of the faces). Positions are welded by coordinate so the UV seams stay closed. Half the positions move, by
  1.7 mm on average; the largest moves, 2 cm, round the finger tips. Panel seams, the backpack's slots and
  screws, the ear pods and the chest panel keep their edges. Afterwards the vertex normals come from the faces
  alone: per welded position the faces are grouped by direction (within 50°), and each split vertex averages the
  faces of the groups its own faces belong to, so a box keeps its edges and a dome its smoothness. Never trust a
  generated mesh's own normals as a reference: a tenth of them were off by more than 43°.
- `--accent 00e5ff` gives every bluish texel the palette blue's hue and saturation at its own brightness: the
  retexture painted the rings unevenly, speckled with grey.
- `--visor` finds the visor glass in the paint (the dark and the blue texels on the helmet's front, closed over
  whatever else was painted inside them) and makes it black. Then it measures the glass outline on the helmet
  itself: in polar coordinates about the helmet's centre (azimuth around the visor's axis, arc from it), per
  degree, the 98th percentile of the arc of the glass texels the viewer sees (a radial depth test drops the recess
  wall, a front-projection one the glass that curls under the chin lip), smoothed with a median over 9° and a
  mean over 5°. The bezel is built as geometry along that curve (see below); the texture only carries black up to
  4 mm past the outline (the recess wall, hidden under the ring) and plain white from there to 6 cm out: the
  retexture had painted a broad grey bezel there, up to 5 cm wide, which the flatten pass must leave alone. Black
  paint that sits at the glass's radius under the ring stays black (per degree, the rim's radius against the
  glass's). The rest of the helmet shell, front and back, is made plain white as well: with the creases smoothed
  out of the mesh, the faint streaks the retexture had painted along them were all that was left, and the shell's
  own seams are grooves in the geometry. The collar, below y = 1.035 outside the chin lip, and the ear pods are
  left out. Texels are handled by the triangle
  that contains them; afterwards every UV island's colour is dilated 12 texels into the gaps around it, so the
  filtering at an island's edge, down the mip chain too, sees its own colour. The glass mask rides in the
  metal-rough map's unused R channel for the web copy's gloss, the bezel's patch as 128.
- `--led` (see below).
- `--whiten-suit 165`: on the body's white parts, every unsaturated texel at luminance 165 or more becomes pure
  white. The retexture had left brush streaks, and a soft halo beside every trim, at 200–240; the flatten below
  is a high-pass and cannot lift a halo whose neighbourhood is the trim itself, nor a streak that stands off its
  surroundings. Off limits: the helmet (handled by `--visor`), the collar ring, the ear pods, the backpack (its
  silver frame is paint), anything within 1.5 cm of a blue accent (the silver rings around them), the bezel's
  patch, and the trims themselves, which sit below 165.
- The neck and the collar (inside `--visor`, by position): the retexture painted the neck cylinder under the helmet
  black, the references' shadow, so every tilt or turn of the head showed a black bib with a ragged edge. The neck
  core (within chinR + 1.5 cm of the neck axis), the collar's top ring out to 33 cm and the ring's outer wall at
  the back and sides (the shoulder pads sit at the sides, the straps in front) become one near white (242, a
  shade under the suit so the collar still reads as a part), and any black there goes with them: only glass in
  view from the front, outside the neck core, keeps its black. Two
  things had hidden the neck from every earlier rule: the glass mask took every dark texel on the front of the
  visor's sphere, and the neck's front lies inside that sphere at the visor's own angles and depth (so it is now
  gated to helmet texels, with the neck core never glass); and a band of triangles there has no texels of its
  own (their UVs cover less than a texel and a half), so they sampled the black in the atlas padding. Every such
  triangle on the body gets vertices of its own pointed at a solid patch, the neck's tone in the neck zone and
  white elsewhere (2,725 triangles, 570 at the neck).
- `--smooth-greys 3`, before and after the flatten: each unsaturated mid-tone texel becomes the mean of its
  neighbours of similar tone, so trims, slots and panels are one even tone with their edges and real gradients
  kept. (A five-tone posterize was tried first: it banded the collar and blotched the rim.)
- `--flatten 24`: a high-pass over the whites lifts every soft grey smudge (brush marks, baked shading) back to
  white where the local mean is nearly white, leaving thin lines and silver bands, which stand off their local
  mean, alone. It replaces the older `--lift` curve.

**The LED is geometry** (`--led`). The retexture had painted the smile twice with a vertical offset, a second
line from every angle but dead front, and any line redrawn in texture space combed apart on the visor's many
small UV islands under bilinear filtering. So the strip is two thin ribbons of triangles laid along an authored
smile on the visor surface, y = 1.14 + 0.7·x² for |x| ≤ 0.18 m: a 15 mm core over a 48 mm glow, a few
millimetres proud of the glass, merged into the body's mesh. Each ribbon's UVs sit on a solid patch in the
atlas's padding (the glow's is a gradient, so it fades to the glass); the patches are black on the colour map and
lit on the emissive map named `led`, so the strip glows the same from every angle, in every tint, and never
catches the sun. Its vertices lie inside the helmet's rigid zone, so it turns with the head.

**The bezel is geometry too.** The silver ring around the glass is a ribbon of 1,440 triangles along the measured
outline, three rows of 360: the inner row on the glass edge itself (its radius per degree), a middle row 5 mm out
on the rim top and the outer row 17 mm out, 1.5 mm proud of the surface, so it bevels down into the recess like a
real lip; its UVs sit on one solid 32 px patch of silver in the atlas padding, glossier than the suit in the web
copy. Painted in the texture, the band fell apart every time: around the visor the atlas is confetti, charts a
few texels wide packed edge to edge, and every chart shows its neighbours' colour along its rim under filtering,
so a band whose edge differs from chart to chart reads as a comb. Two things about a ribbon over a paint edge: it
must sit low (a ring 3 mm up, seen at a grazing angle, shifts 8 mm sideways off the paint under it), and its inner
row must be on the glass edge, not above the recess (an inner edge floating 14 mm over the wall projects outward
and shows the rim top inside it).

**Materials in the web copy.** Both generators' roughness maps call the whole suit glossy (most texels 0.1–0.3),
and the fair's `Math.max(0.55, roughness)` floor is multiplied by the map, so the sun drew hard-edged highlight
blobs on every flat face. The web copy carries a derived roughness map instead: 0.85 everywhere, 0.36 on the
visor glass (soft enough a highlight not to show the web copy's triangles), 0.59 on the bezel ring, 0.85 again
under the LED. The normal map is left out: the seams are geometry. The simplification to 55,000 triangles is
meshopt's attribute-aware one, weighing the normals as well as the positions, so triangles stay where the surface
turns, and the visor glass (the texels marked in the metal-rough map's R channel) is locked at full resolution: a
glossy dome shows its triangles in its highlight. Afterwards the vertex normals are recomputed from the coarse
mesh alone, the same grouping as above: the simplifier keeps the old normals on triangles several centimetres
across, and every one of them shaded like a dent; a first attempt that used each vertex's old normal as its
reference left spikes wherever that normal was wrong. `src/fair/nexo.ts`
keeps the `led` emissive map (the only emissive map a web copy carries) and drops the metalness map.

## The rig (refitted 22 Sep)

The rig is ours (20 Sep, fix plan 1). Meshy's auto-rig had put the knees inside the boots and left the spine with
no skin, so `fit-mascot-rig.mjs` builds the skeleton from `rig.json`: identity rest rotations (what `anim.ts`'s
world-space retarget wants), the 24 joint names the clip library expects, capsule weights with rigid parts for the
helmet, the shoulder pads and the boots, smoothed over the mesh. Three things the 22 Sep body taught it:

- **Weights are computed per welded position.** The mesh is split along its UV seams (57k vertices on 49k
  positions); two vertices at one position used to get slightly different weights, and every seam opened when
  the body moved. Now one position gets one set of weights and the smoothing runs over the welded surface.
- **Rigid parts have soft borders** (`rigidBand`, 4 cm; the helmet's own is 2 cm): a hard border cracked open
  the moment a bone turned.
- **The parts are placed where the design puts them.** The shoulder pads belong to the torso
  (`LeftShoulder`/`RightShoulder`); the upper arm turns inside them, so the straps to the backpack never stretch.
  The collar ring (radius 0.25–0.33 at y 0.93–1.0) and the backpack's top lip are the torso's, held by a wide
  `Spine` capsule (r 0.33, y 0.90–1.00); the helmet is Head only inside its sphere (the ear-ring margin applies
  only above `marginAboveY`), and the Head capsule starts at 1.30 so its falloff stays off the collar. The head
  turns inside the collar, up to the ±60° the attention layer asks for, without shearing it.

`src/fair/nexo.ts` scales the body to 1.6 m, drops the metalness map, makes the suit matte, and tints only the
light unsaturated texels by role (visitors white, exhibitors MIHAS orange `#F07A1D`) so the black visor and the
blue accents keep their colour. While the file loads, a Nexo of primitives stands in.

Poses for the fair: wave (Big_Wave_Hello 28), cheer (Victory_Cheer 59), dance (All_Night_Dance 64), jump
(Regular_Jump 466) come from the shared library (`assets-src/animation/README.md`).

## Rebuild

    node tools/rig/normalize-mascot.mjs assets-src/characters/nexo/nexo-source.glb assets-src/characters/nexo/nexo-raw.glb --yaw -90 --textures-from assets-src/characters/nexo/nexo-textures.glb --denoise 20,0.02,0.4,2 --accent 00e5ff --visor 0,1.26,0.035,0.335,0.15,0.017,0.06,1.035,0.215 --led 0.18,1.14,0.7,0.0075,0.024 --whiten-suit 165 --flatten 24 --smooth-greys 3
    PROFILE=1 node tools/rig/fit-mascot-rig.mjs assets-src/characters/nexo/nexo-raw.glb    # cross-sections, to write rig.json from (only for a new body)
    node tools/rig/fit-mascot-rig.mjs                                                         # nexo-rig2.glb, public/fair/nexo.glb, rig-report.json
    npx tsx --test src/fair/nexo-rig.test.ts

To remake `nexo-textures.glb` from two retexture passes:

    node tools/rig/blend-textures-by-facing.mjs front-pass.glb back-pass.glb blended.glb --axis x --by position --from 0.07 --to 0.13

then drop the mesh from `blended.glb` (the file here is that, pruned to its textures). The positions are in the
passes' own units (the Tripo file, 0.98 tall, face along +x): the ear rings end at 0.04, the visor and chest
panel start at 0.15.

`normalize-mascot.mjs` takes any generator's GLB (`--yaw` to turn the face onto +z, `--zup` for z-up sources,
`--mirror` if the left side came out at −x, `--textures-from` to swap in another texture set of the same UV
layout, then the clean-ups above; `--gain` and `--lift` remain for a body that needs only a plain whitening).
The visor and LED numbers are metres in the fair's frame, from the helmet sphere in `rig.json`: `--visor` is
the helmet centre, its radius, the face side's near z, then the bezel's width, the white ring's width, the
collar's top and the chin lip's radius about the neck axis. `RIM_DEBUG=path.png` writes the visor's texel
classes (glass, white ring, other helmet front) as colours, to swap onto the body for a look in the viewer.
`fit-mascot-rig.mjs` keeps every triangle in `nexo-rig2.glb` and simplifies the web copy to `WEB_TRIS` (default
55,000; the fair draws up to 25 bodies at once on phones).

## Auditing a body

Judge it posed, not only at rest, lit from behind the camera as well as from the front, in the exhibitor's orange
as well as white (the tint leaves grey texels alone, so every grey spot on the suit shows), and in the unlit
colour map at close range (a `look=tex` render shows the paint without the lighting's help). Seams and rigid
borders only show once a bone moves, glossy patches only once the sun is over your shoulder, a painted reflection
only next to the real thing it imitates, and a brush mark only when nothing shades it. Small crisp features (the
LED, the bezel) belong in geometry, not in a texture that an auto-UV atlas has cut into confetti; before blaming
the paint, render a copy with every unowned texel magenta (seams and padding show themselves) and one with the
texel classes as flat colours. Left-right symmetry of the mesh itself was checked (nearest mirrored vertex within
the vertex spacing everywhere); what reads as asymmetry is paint, and the clean-ups above are what evens it.
