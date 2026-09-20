# A fair you are inside: the Mission X world on the Ceritera engine

*20 Sep 2026. An examination, not a build. It answers one question: how do we make another virtual fair world, with
the MIHAS context, rules and concept intact, that feels the way Dewan Ilmu feels, and what does it take.*

## 1. Why Ceritera feels "inside" and Mission X feels "on a table"

Both games render the same kind of thing (a floor plan in three.js), so the difference in feeling is not the graphics.
It is five specific decisions, and each one is a transferable part:

| Decision | Mission X today | Ceritera today | Weight in the feeling |
|---|---|---|---|
| Camera | Orbits from above, pitch 0.62–1.32 rad, 12–95 m away: a model on a table | Behind the shoulder at chest height, 2–8 m, pulls in behind shelves | The biggest single factor |
| The body | A capsule astronaut that slides along a route | A rigged human with weight: acceleration, a lean into the sprint, footsteps, landings | Second |
| Scale | Booths 2.6 m tall seen from 40 m: tiles | Shelves 3 m tall seen from 4 m: they fill the frame | Third, and free once the camera changes |
| Verbs | Tap where to go; the astronaut walks there | Push a stick; jump, sprint, roll: the world answers every input | What makes it a game rather than a map |
| Sound | Ten menu tones | Footsteps, landings, a swing, a hit, a cast, all tied to motion | Small but constant |

The honest summary: the camera and the human scale alone would give Mission X most of the feeling, at no cost in
rules. The rest needs the Ceritera controller and rigged bodies, which now exist and were built to be reused.

## 2. What each codebase brings

**Mission X brings the fair.** A floor-plan pipeline from the organiser's PDF to `public/data/floor.json` (three
levels in one plan space, 1,599 booth cells, 20 named areas, 6 lifts, 10 gates, walls, walkable rectangles, two
spawns), stands grouping (neighbouring cells of one exhibitor become one stand with one fascia), a walkability grid
with A* for the guide trail and tap-to-walk, generated furniture for cafés, stages and lounges, a seated crowd, and
above all the server: two roles, the five-chapter mission, fixed points, three proofs of a stamp (walked up, printed
QR, live QR), the geofence, the exhibitor's live code, cards shared field by field, leads and CSV, the crew console,
a ledger the crew can void, presence with a speed check and holograms of other players, liveops flags, and a demo
mode that runs the whole server in a service worker. All of it tested. None of it needs to change.

**Ceritera brings the body.** A character controller over data (walk, run, sprint that keeps building, jump with
coyote time and buffering, second jump, wall kick, roll, air dash, drop-slam, momentum in the air), a box-world
physics solver with step-ups and ground snap, a third-person camera with collision, lock-on and shakes, an input layer
(two keyboard layouts, pointer lock, gamepad, touch stick and look), a renderer with PBR, shadows, particles and floor
shapes, sounds synthesised on the device, a HUD, a sim/render split with the sim under node:test, and the two
pipelines: character sheet → generated rigged model, and one shared animation library of 16 clips stored as deltas
that plays on any rig with the same joints. Also the content-package pattern: the game as data with validators and tests.

**Both share a thesis.** In Ceritera the shelves hold the real buku.my catalogue; in Mission X the booths hold the
real exhibitor list. A world bound to a live database is Lean X's product. The fair is the second instance of it.

## 3. The shape of the merge: one engine, two worlds

The right move is not to copy Ceritera into the fair. It is to lift the engine out of Ceritera into a world kit that
both games use, then describe the fair as data the way Dewan Ilmu is described:

```
src/world/            the kit: physics, controller, camera, input, anim, render, vfx, sfx, hud, sim   (from src/ceritera/game/)
content/              Ceritera's data (classes, skills, areas, quests …)
fair/content/         the fair's data (roles, mission, points, places, copy)   ← today spread over shared/rules.ts and src/ui
fair/level.ts         floor.json → LevelDef (boxes + dressing + spawns + lifts)
fair/booths.ts        booth archetypes, branding atlas, stands
fair/game.ts          the fair session: the kit + the Mission X server API
server/               unchanged
```

What the fair level needs from the kit, and how the floor plan maps onto it:

| floor.json | LevelDef in the kit | Note |
|---|---|---|
| `decks` (three levels, far apart in one plan space) | Three floor slabs, 1 m thick, with walls at the edge | Mission X's trick keeps working: no notion of floor in the sim, decks are simply far apart |
| `booths` (cells 2.82 × 3.06 × 2.6 m) | One collision box per cell, dressing per stand | Cells stay the unit of the rules; stands the unit of drawing |
| `walls`, `hall` | Boxes | As now |
| `areas` + `places.ts` furniture | Boxes tagged `table`, `seat`, `stage` | The seats become sit targets |
| `lifts` | Portal zones: enter, ride, appear on the other deck | The one jump the presence server accepts |
| `gates`, `spawns` | Spawn points facing into the hall | Hall 8 entrance for the short game, the main entrance for the epic |
| `walkable` | The nav grid stays for the guide trail and tap-to-walk | Tap-to-walk becomes an autopilot that feeds move vectors to the same controller |

Coordinates: plan metres (x east, y north) map to world (x, −z) exactly as `toWorld()` does now. One converter, used
by the level builder and the presence pings, and nothing else needs to know.

Two things about the physics deserve a note. The solver is brute force over all boxes; with ~2,000 booth boxes plus
furniture that is still only a few hundred thousand cheap tests a second for one body, but a uniform grid broadphase
is a morning's work and should be done. And the remote players need no physics at all: they are interpolated from
pings, as `remote.ts` already does, and only drive an animated body.

## 4. Movement and controls in a fair

Keep the human half of the movement whole: walk, jog, sprint, jump, the roll as a quick side-step. The superhuman
half is a decision for you, and my recommendation is: keep the second jump and the dash, drop the slam and the wall
kick. A visitor bounding over a queue is delight; a visitor slamming into the floor of a trade fair is off-brand. The
server already tolerates it: the presence speed limit is 12 m/s over a ping, the sprint tops out at 9.5, and a dash
adds 3.8 m to a two-second ping.

Controls, phone first, because the fair is played on the show floor:

| Verb | Phone | Keyboard |
|---|---|---|
| Move | Left-half stick, or tap where to go (autopilot on the nav grid) | Arrows or WASD |
| Look | Right-half drag | Mouse |
| The big button (stamp, sit, photo, talk) | One button, context-named, as now | E |
| Jump, sprint | Buttons | Space, Shift |
| Map, my card, the trail, photo | The four slots where Ceritera keeps Q W E R | Q W E R |
| Expressions (wave, cheer, dance, jump) | A wheel on long-press | 1 2 3 4 |

No combat. The four skill slots become the four things a visitor reaches for, and the ultimate bar is not needed.

The camera needs one fair-specific mode: aisles at MIHAS are about three metres wide between 2.6 m booths, so a
4.8 m arm will collide constantly. In aisles the rig should shorten to a shoulder camera (about 1.8 m) and let the
booths' fascias fill the frame, which is exactly the feeling we want; on the concourse it opens out. Keep Mission X's
table view as a toggle for the map, and keep the lift ride.

## 5. Booths: from racks of books to somewhere you walk into

Today every booth is a white box, two draw calls for all 1,599. An immersive booth is not a model per exhibitor
(nobody can make 1,599 of them, and no phone could draw them); it is a small family of archetypes assembled from
instanced parts, dressed from data. Four archetypes cover MIHAS:

| Archetype | Where | Parts |
|---|---|---|
| Shell scheme | Most cells | Three 2.5 m walls, fascia board with the name, a counter, a chair, a carpet, a brochure rack |
| Corner | Cells with two open sides | Two walls, the counter turned to the aisle, a plinth |
| Island stand | Stands of 4+ cells (the largest is 26) | Open on all sides, a raised floor, a central column with screens, plinths |
| Pavilion | Country and agency pavilions | An arch with the pavilion's name, a lounge inside, a stage |

Dressing comes in tiers, and the tiers are the business model:

- **Tier 0, every booth.** The fascia carries the exhibitor's name from the floor plan and a colour strip for the
  sector. Names are drawn once into one texture atlas (1,599 entries at 256 × 64 fit in a single 4k texture).
- **Tier 1, booths that are online.** The exhibitor's "Light up" step gains a logo and three product photos. The
  fascia shows the logo, the screen shows the offer line and the live QR when hosted, the green pin stays. Uploads go
  to storage the way bukku already stores its 6,255 covers.
- **Tier 2, sponsors and the X.** A dozen hero booths at most, made from the booth's own render with the same
  generator we used for the avatars (image-to-3D, roughly 20–40 credits each) or built by hand.
- **Tier 3, products on plinths.** Real 3D products from product photos, for exhibitors who pay for it.

What makes a booth immersive once you can walk in: the exhibitor's content at eye level; a greeter (a rigged figure
with the idle and wave clips, saying the offer line, showing the QR when the booth is hosted); the brochure rack that
opens the card sheet; a small crowd inside the busy ones; spot lighting on the fascia. The stamp rule is unchanged: a
walk to within five metres, one every five seconds, decided by the server.

The performance plan is what makes this possible on a phone, and it is not optional:

- The hall is chunked into 20 × 20 m cells; each cell holds one instanced mesh per part type. The two decks you are
  not on are never drawn, as now.
- Three levels of detail: full parts within 40 m, fascia and walls only to 120 m, a flat card beyond.
- One sun and a sky, no point lights and no shadow maps on the low tier; the Ceritera renderer's twelve lanterns and
  soft shadows are for desktops and for the demo video.
- The frame-rate-adaptive pixel ratio from Mission X stays. Target: 60 fps on a 2022 mid-range Android at 1×.
- Remote players: the full rigged model within 15 m, a decimated 5k-triangle copy to 40 m, a card beyond; never more
  than 24 rigged bodies on screen.

## 6. Avatars

The six library classes do not belong at a trade fair, and the astronaut is the Mission X brand. Two routes, and they
can coexist as choices on the first screen:

1. **Human avatars.** Six looks designed as character sheets (that is the Higgsfield step you mentioned): three visitor
   looks, an exhibitor, a crew member, a guide. Each goes through the pipeline we ran six times last week: sheet →
   generated rigged model (38 credits) → the shared animation library retargets onto it at load time. Zero extra
   animation cost per avatar; the walk, run, jump and roll already exist. Four expression clips (wave, cheer, dance,
   jump) are 8 credits each, once, for everyone.
2. **The astronaut, rigged.** Render the primitive astronaut, generate a rigged model from it, and it joins the same
   library. The blue and green jackets become a material tint.

Role colour stays a rule: visitors blue, exhibitors green, crowd grey. On a human avatar that is a lanyard or a scarf
tinted per role, so the convention survives the art change. Names above heads stay as they are.

## 7. What it does for Lean X Digital

- **The demo.** Walking Hall 8 in third person, past branded booths, to the X, on a phone, is a two-minute video that
  sells itself to organisers. It is the same walk the Ilmuwan just did, on the MIHAS floor.
- **A product, not a project.** The floor-plan pipeline, the booth archetypes and the server already generalise past
  MIHAS: any expo with a PDF floor plan and an exhibitor list, property launches, university open days, sales
  galleries. The kit makes the world a data file and the rules a content package.
- **Self-serve booths.** The "Light up" flow becomes a booth builder exhibitors pay for by tier. Inventory to sell:
  hero booths, banners on the hall walls, the pavilion arches, the centrepiece over the concourse.
- **Analytics nobody else has.** Presence already records where people are; a heatmap of foot traffic and dwell time
  per booth, on top of leads and scans, is a report an organiser will pay for.
- **The twin.** The same data drives the Unreal build in the Ceritera plan; a photoreal MITEC for the organiser's own
  marketing is the same level file with better dressing.

## 8. Risks, and the honest bar

- **Phones.** Ceritera's renderer as it stands is a desktop renderer. The fair lives on visitors' phones at the
  show. The chunking, levels of detail and quality tiers in section 5 are the work that decides whether this ships.
- **Scale of dressing.** 1,599 booths must be procedural. Only hero booths are made one at a time.
- **Two art directions.** Mission X is daylight and paper; Ceritera is dark and gold. The fair needs the bright,
  clean, branded look. In the kit, lighting and palette are data, so this is a style file, not a rewrite.
- **One-thumb play.** Mission X was built for one thumb on a crowded floor. Tap-to-walk must stay alongside the
  stick, and the camera must never need a second hand to be usable.
- **No repository.** The folder is still not under git. Start one before this work, tag the MIHAS build, and keep
  `bukku/` out of it.
- **The rules are the brand.** Nothing in the server changes. The world stays a client that asks; the honesty rules
  (speed checks, geofence, live codes, the crew's review) are untouched.

## 9. A plan, in phases

One developer with Claude Code, the server untouched throughout.

| Phase | Weeks | Deliverable |
|---|---|---|
| 1. World kit | 1 | The engine lifted out of Ceritera; `floor.json` → boxes; walk MIHAS Hall 8 in third person with a placeholder avatar; quality tiers; a git repository |
| 2. Booths and verbs | 1–2 | The four archetypes, the name atlas, stands' fascias, the X as a hero booth; stamp, cards, online booths and the trail wired to the existing API; tap-to-walk autopilot; lifts as rides |
| 3. People | 1 | Fair avatars through the sheet → model → library pipeline; remote players as animated bodies with levels of detail; expressions; the photo mode |
| 4. Phone and polish | 1 | Chunking and culling, the bright art direction, sound, a demo capture on the MIHAS data, pitch material |

Four to five weeks to a demo-quality "walk MIHAS" build. Costs outside time: about 230 credits for six avatars and
four expression clips, 20–40 per hero booth.

## 10. Decisions that are yours

1. **Bodies:** human avatars from sheets, the astronaut rigged, or both on the first screen.
2. **Superhuman moves at a fair:** my recommendation is second jump and dash yes, slam and wall kick no, no combat.
3. **The name:** Mission X stays the MIHAS brand; the product line above it ("Lean X Fair", or the world kit itself)
   needs a name before the pitch.
4. **Order of work:** the kit first (it also pays Ceritera back), or a fast fork for one demo video first. The kit
   costs one more week and avoids maintaining two engines.
