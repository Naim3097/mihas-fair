# The Playground — a second world for the fun of moving (second draft, audited, 23 Sep 2026)

The fair is the mission: walk, find the X, scan the checkpoints. It stays exactly as it is. The Playground is a
separate world with its own rules, entered from the fair and left back into it: a short run over platforms floating
beside MITEC, stars to collect, a clock made of oxygen, and gear you earn that changes how Nexo moves. A run is
about ninety seconds, so a visitor gets one hit of it between booths and comes back for the next.

This page is the whole Playground. If something is not here, it is not in it. Nothing below touches the fair's
rules, the QR scanning, the mission or its points; the only changes to the fair itself are the guide trail (Phase 0)
and the door in.

## The audit of the first draft: what changed and why

The first draft was read again as a whole system, phone first, with the code it leans on open beside it. Where it
would have shipped a bug, a lag or a screen too many, it is changed here.

| First draft | Second draft | Why |
|---|---|---|
| A second engine with its own renderer; the fair's kept paused | **One canvas, one renderer, one input**; the Playground renders into the fair's stage while the fair's loop is paused | Two WebGL contexts on a phone is memory and a context-loss risk for nothing. The fair's engine already pauses on a hidden tab; pausing it for a world is the same switch. |
| A Jump button, a Tuck button, thrust on hold | **One button** (Jump; hold = thrust with the Jetpack). Skates' tuck is the stick held past the rim, as the fair's sprint | The right thumb has one job. Fewer targets, nothing to learn twice. |
| A launch-pad sheet to pick gear, a Claim button in the summary | **Gear stands on the pad**: walk onto Boots, Skates or Jetpack; a locked stand shows its price; stepping on one you can afford unlocks it there and then | Two sheets fewer per run. Picking gear with the body is the game; the unlock happens where the reward is felt. |
| The camera follows the body's heading | **Course-guided camera**: each section has a direction the camera settles to, with the body's heading as a small bias; plus a **landing marker** on the surface below the body while it is in the air | A camera that turns with the body puts every gap at a bad angle; a marker under the feet is how 3D platformers make landings readable. The two biggest sources of "the game is unfair". |
| Ramps as stairs the step height eats | **Flat platforms only; jump pads for height** | Seven step-ups a second at skating speed is a stutter, not a slope. |
| Rules for leaving, the tab going away for 60 s, O₂ pausing in sheets | **O₂ runs on simulation time**: it stops whenever the loop stops (a sheet, the menu, a hidden tab, a locked phone) and nothing else ends a run but the gate, O₂ at zero, or "Back to the fair" | One rule instead of four, and no edge case where a phone call costs a run. |
| Stars banked at the end of a run | **Stars bank the moment they are picked up**; the run is sent to the server at the end, and on the tab being hidden with `sendBeacon` | A reload or a killed tab never loses stars. |
| Four checkpoint rings | **Six rings** (one at every section start and mid-section, about every 35 m) | A fall costs ten seconds of replay at most. |
| Gear-gated stars looked like every other star | **Gated lines carry their gear's tint** (a thin ring round each star: cyan for Skates, orange for the Jetpack) and the stand says what it opens | Desire with a reason, not confusion. |
| Score in the corner | **Floating score at the body** ("+30 ×3" over the helmet, pooled labels) as well as the card | The reward lands where the action was. |
| Pickups tested per frame | **Per simulation step** (60 Hz) | A 30 fps phone at 9.5 m/s moves 32 cm a frame; stars are 55 cm wide. Per step it is 16 cm. |
| Dust discs, a Tuck button, a pad sheet, leaving rules | Cut | Nothing a player would miss. |
| Skates 120, Jetpack 300 | **Skates 100, Jetpack 250** | Skates after the second run of a first visit; the Jetpack for someone who comes back. Tuned by play. |

What was kept because it held up: one course of three sections; oxygen as the clock; stars, the ×4 combo and one
diamond per gear line; Boots, Skates, Jetpack on the existing physics; poses from the bone layer without new clips;
no presence from the Playground; a local store first with the server contract written; six phases.

Risks named, not hidden: the glide and flight poses without real clips may read stiff (the bone layer can lean and
hold, not animate feet; a clip is the upgrade); the course-guided camera needs a playtest per section; thumb
ergonomics of the one button need a real phone; landings from more than 3.5 m stagger the body for up to 0.35 s in
the shared controller (a "heavy landing" that reads as weight; if it reads as lag, the Jetpack's ceiling comes down).

## What it is, in one screen

- **One course, one run.** A loop of platforms in space, three sections long, from the launch pad to the finish
  gate, about ninety seconds.
- **Stars** are the hunt: gold, in arcs that teach the jump, in tinted lines that teach the gear. Ten score each,
  with a combo that doubles, triples and quadruples when they come fast. **One diamond** per gear line.
- **Oxygen is the clock.** The run starts with 40 s; every cyan bubble adds 6 s. At zero the run ends where you
  stand; through the gate, what is left pays a bonus. Everything picked up is yours either way.
- **Gear** is a stand on the pad: **Boots** (run, jump, one more jump in the air) free; **Skates** (fast, momentum,
  long glides) at 100 stars; the **Jetpack** (thrust on fuel, hover, climb) at 250. Each opens a line the others
  cannot reach.
- **Fall off** and you are back at the last ring, 4 s of O₂ poorer, combo gone. No lives, no game over.
- **Boards**: today's best runs and all-time, in the Playground only. The fair's points and mission are untouched.

## Rules

### The run

1. The run starts when the body crosses the start line on the pad, with the gear of the stand it last stood on
   (Boots the first time). O₂ 40 s, score 0, combo ×1.
2. **O₂ runs on simulation time.** It counts only while the world is being simulated: a sheet, the menu, a hidden
   tab or a locked phone stop it, and it resumes where it was. Nothing else ends a run but the gate, O₂ at zero, or
   "Back to the fair" in the menu (which ends it as O₂ at zero would).
3. An **O₂ bubble** adds 6 s (cap 60 s). A **fuel cell** fills the Jetpack's tank by half. A **star** scores. A
   **checkpoint ring** sets where a fall returns you. A **boost pad** (blue arrows on the floor) gives 6 m/s along
   its arrows for a moment. A **jump pad** (a blue disc) throws the body 3 m up.
4. The **combo**: a star within 1.2 s of the last raises the multiplier ×1 → ×2 → ×3 → ×4 (the cap). It applies to
   the star's score, not to the star count. It resets when the window lapses, on a fall, and at the gate. Stars on
   a line are never more than 4 m apart, so a run at pace holds ×4 through a section; between sections the combo
   banks and starts again.
5. The **diamond**: 300 score and 25 stars, one per gear line, in a fixed place that takes intent (a double jump off
   the top stair for Boots, the end of the long glide for Skates, the top of the sky line for the Jetpack). Fixed,
   so it can be learned.
6. The **finish gate** ends the run: score banked, plus 10 score per second of O₂ left. O₂ at zero ends the run
   with the score as it stands. **Stars are banked the moment they are collected**, in both cases.
7. Falling below the course (y < −3 m) returns you to the last ring after a half-second fade: −4 s O₂, combo ×1,
   the body still, the camera settled behind it.
8. Once a run has ended the body is back on the pad within a second, the summary is up, and **Again** is one tap.

### Stars, score and gear

- **Stars** are the Playground's own currency, never fair points. Balance is per account; until the server has the
  endpoints below it lives on the device (`localStorage`), and says so on the summary ("saved on this phone").
- **Score** is per run: stars × combo + diamond + finish bonus. The best finished run goes on the boards.
- **Gear** is chosen by standing on its stand on the pad. Boots free, Skates 100 stars, the Jetpack 250: stepping on
  a locked stand you can afford unlocks it (the body changes on the spot, the chime, the buzz); one you cannot
  afford shows how many stars are missing. Bought once, kept forever.
- The course carries 120 stars (1,200 base), 16 O₂ bubbles (+96 s), 3 fuel cells, 6 rings, 2 boost pads, 2 jump
  pads and three diamonds (one per gear line). A careful first run on Boots pays 50–90 stars and about 1,500 score;
  a clean Skates run about 3,000; a Jetpack run that takes the sky line about 4,500. Skates arrive in the second
  run of a first visit; the Jetpack rewards coming back.

### What connects to the fair, and what does not

- Entry from the fair's menu ("Playground") and from a blue portal disc beside the launch pad at the X. Everyone in
  the world already has a card, so nothing more is asked. The phone's Back button and Escape leave the Playground
  for the fair, where you left it.
- No presence is sent from the Playground: the hall does not see you, the "here now" count leaves you out, you are
  back when you are back (the first ping on return puts you in the hall at once).
- **Optional, off until the backend owner and you agree:** the first finished run of the day pays 50 fair points,
  once, as a ledger row `playground_daily`. The only bridge between the two point systems.
- Gear stays in the Playground in this version. Skates in the fair would pass the server's 12 m/s cap as they are;
  the Jetpack would need a ceiling and a look at "at a booth". A later switch, either way.

### What is not in it

No lives, no timer but O₂, no enemies, no player against player, no purchases with money, no randomness in what the
course pays, no other players' bodies in the course (a ghost of your own best run is a later idea), no ramps, no
moving platforms, no rails. One course to start; a second is data, not code.

## Mechanics

The same physics as the fair: axis-aligned boxes, a swept body with step-ups (0.25 m passes, so nothing tunnels),
the Ceritera controller at a fixed 60 Hz step with jump buffering and coyote time, the camera rig with its five-ray
pull-in. The Playground passes its own movement tunings and adds one thing to the shared controller: thrust, an
optional part of the movement tuning that the RPG does not set.

### Bodies and jumps

| | Boots | Skates | Jetpack (on the ground as Boots) |
|---|---|---|---|
| walk / run / top | 1.6 / 4.4 / 6.0 m/s (top: the stick past the rim, Shift) | — / 7.5 / 9.5 m/s (top: the same rim hold, the tuck) | 1.6 / 4.4 / 6.0 |
| acceleration / braking | 22 / 24 m/s² | 7 / 5 m/s² (momentum: builds slowly, glides long, arcs when turned at speed) | 22 / 24 |
| turn rate | 720°/s | 260°/s | 720°/s; 300°/s in the air |
| jump / air jump | 7.4 → 1.24 m · 6.4 → 0.93 m | 6.8 → 1.05 m · 6.4 | 7.4 · none (thrust instead) |
| air control | 9 | 6 | 14 |
| coyote / buffer | 0.14 s / 0.18 s | same | same |
| gravity / fall / terminal | 22 · ×1.3 · 30 m/s | same | same; thrust cancels it |

Jump reach, measured on the physics (the body's 0.36 m radius lands a toe on an edge): a running jump at the edge
clears 3.2 m, half a metre early 2.7 m; the air jump 4.7 m and 4.2 m; at top speed 4.2 / 3.7 m and, with the air
jump, 6.3 / 5.8 m. The course's gaps are set to what a jump half a metre early still clears, and the tests jump
every one both ways: **Boardwalk 1.8–2.2 m** (one jump, any gear), **Stairs 2.6–2.8 m with 1 m rises** (the air
jump), the jump pad for the tall step, **Sky Line: a 5 m gap off the turn, then 5.5 m gaps between 10 m platforms
each about a metre lower** (a single jump at the tuck, a double at the cruise, or the Jetpack). Momentum is not new
code: the controller already accelerates the velocity toward the stick's direction at the tuning's rate, so a low
rate is a glide.

### The Jetpack

- Thrust while the button is held and fuel is above zero: 34 m/s² upward, so the net climb is 12 m/s², capped at
  6.5 m/s. Tapping hovers; holding climbs. Horizontal speed in the air is capped at 7 m/s. A glass ceiling at 18 m.
- Fuel 100, drains 24 per second of thrust (about 4 s of climb), refills at 30 per second on the ground and by half
  from a fuel cell. Landing from thrust is a landing: the small shake, the sound, and from over 3.5 m the shared
  controller's brief heavy-landing stagger.
- In the controller: `thrust` on the intent, `fuel` on the player, and one branch in the gravity block, all inert
  unless the tuning carries a `thrust` block.

### Skates

- Speed is a state, not an input: the stick sets a heading, the body carries its momentum, letting go glides to a
  stop over a few seconds. The rim hold is the tuck: top speed and a narrower turn.
- Boost pads sit four metres in from every other platform's edge and push once per touch: a single jump at the cruise
  lands off one, and the tuck's double after one still lands inside the 10 m platform (the landing zone is 5.5–15.5 m
  out; the tuck's single carries 6.6, the cruise's double 7.9, a boosted tuck's double under 14). The glide's last
  pickup is the Skates diamond, on the home stretch before the gate; home runs on past the gate so a skater coasts out.

### Pickups, rings, pads and the gate

- A pickup is a point with a radius: star 0.55 m, bubble and cell 0.6 m, diamond 0.7 m; Skates and the Jetpack
  add 0.3 m (the magnet: gear feels powerful). Tested against the body's chest **every simulation step** through a
  4 m spatial hash; a collected one scales to nothing over 0.12 s and is gone for the run.
- Rings and the gate are crossings: the body's line between two steps against the ring's plane, so a fast body
  never skips one. Boost and jump pads are floor boxes tagged as such; the tag on the body's ground tells the run.
- Stars spin and bob; bubbles breathe; the diamond is the one big cyan thing on its line. One instanced mesh per
  kind, five draw calls for the lot; a matrix update per instance per frame (150 of them, well under a millisecond).

### Course

Three sections on a loop around the MITEC platform, in the same space sky, on the same white slabs, with the fair's
palette (white and warm grey floors, an ink edge line on every platform so its end is unmistakable, blue for what
you can use, gold for what you earn, cyan for air and fuel, orange only on the Jetpack line and the Jetpack stand):

1. **The pad**: the three gear stands, the portal back, the start line. The first run only: a floor arrow and a hint
   chip ("Tap to jump" / "Space") that goes when the first jump lands.
2. **Boardwalk** (0–70 m): floor at 0, gaps of 1.8–2.2 m, stars in arcs over the gaps, a boost pad, rings at 10 and
   50, bubbles on the line and just off it. Teaches the jump and the combo.
3. **Stairs** (70–150 m): platforms rising 1 m at a time with 2.6–2.8 m gaps and a jump pad for the one tall step,
   stars on the rises, rings at 78, 105 and 137, the Boots diamond on a ledge 4 m past the top (a top-speed jump or
   the air jump). Teaches the air jump.
4. **Sky Line** (140–210 m): a long glide with a 5 m gap then 5.5 m gaps between 10 m platforms, a boost pad on every
   other one (the Skates line at z 30: cyan-ringed stars, four rings, its diamond before the gate), a lower safe path with 2.5 m gaps for Boots, and above both the Jetpack's line (orange-ringed
   stars at 4–8 m up, its diamond at the top), rings at 140 and 175, then the gate back at the pad.

The course is data (`src/playground/course.ts`): platforms as boxes, pickups as points with a line and a gear,
rings, pads, the gate, per section the camera's direction. The world draws what the data says; the tests walk it.

### Camera

The fair's rig with the section's direction as the anchor: the camera settles behind the body facing the way the
section runs (blended with the body's heading at one part in four), so gaps are always seen from behind and a turn
to a star does not swing the world. Three presets blend over 0.4 s when the gear or the state changes:

| | distance | pitch | field of view | follow |
|---|---|---|---|---|
| Boots | 4.8 m | 0.32 | +0 | the section's direction; yaw follows the body while the stick is held |
| Skates | 5.6 m | 0.24 | +6° above 6 m/s | the camera lags the body by 0.15 s at speed (damped, frame-rate independent) |
| Jetpack | 6.2 m | follows vertical speed, 0.15 to 0.5 | +4° while thrusting | a little up when climbing, down when falling |

While the body is in the air a **landing marker** (the feet's soft blob, placed by a ray straight down on the surface
below) shows where it will land; it goes the moment the feet touch. Drag to look works as in the fair and hands back
after 1.5 s. The camera never drops below 0.5 m over the platform under it.

### Controls

- Phone: the left thumb's stick (the fair's, unchanged: a push jogs, held past the rim sprints or tucks); one round
  **Jump** button, 72 px, bottom-right where the dock is in the fair (hold: thrust with the Jetpack); a tap anywhere
  else that is not a drag is also a jump. Drag elsewhere to look.
- Desk: WASD, Space (hold: thrust), Shift (tuck or top speed). Click to look around, no click-to-walk here.
- Nothing else: no map, no express tray, no sit. The menu stays (sound, Back to the fair).

### Trails and feedback

- **The fair's guide trail is fixed first (Phase 0):** today the dots are laid from the position the path was computed
  at, up to 1.2 s ago, so at a jog they start 3 m behind the body with the first one under the feet. The fix projects
  the body onto the path every frame, drops what is behind, starts the first dot a metre ahead of the feet, and lays
  the rest along the exact route the follower walks. Nothing behind the body, nothing under it.
- **Skates** leave two ribbons from the feet (6 cm wide, 1.2 s long, cyan fading to nothing, flat, no glow) while
  faster than 4 m/s. **The Jetpack** leaves a short exhaust ribbon from the backpack while thrusting. Each ribbon is
  one geometry with a fixed number of segments updated in place: no allocation per frame.
- Every pickup answers at the body: a scale pop, a floating "+10", "+20 ×2"… over the helmet (six pooled labels), a
  chime a step higher for each combo level on the game's own scale, an 8 ms buzz on Android. A combo step plays the
  "big" rise. O₂ under 8 s pulses the bar and plays the warning once. The gate plays the rise; the summary drops in.
  A new best run says so on the summary, once, and the stars-to-next-gear bar is the last thing on it.

### Poses without new clips

The library has no skating or flying clip and the Playground does not wait for one. Skates: the calm idle clip under
a glide held by the bone layer that already turns the head (knees bent, the left leg leading, the feet flat, the hips
4 cm lower so the feet stay on the floor; in by speed, out for a jump or a stop) and the torso leaning into the turn
from the yaw rate. The Jetpack: the jump clip's apex held, the body tilted into
the direction of travel. Cheap and clean, in one file; real clips can replace them later without touching anything
else. This is the one place where "good enough" is a judgement to be made on the screen, not on this page.

## Interface

- **Run card** (top-left, where the mission card is; one line and a bar): the O₂ bar in cyan with the seconds, the
  score rolling up, the star count, the combo badge that lands with the star; the fuel bar with the Jetpack. The
  same fold and the same toast rule as the fair's card (toasts come down under it).
- **Summary sheet** at the gate or at O₂ zero: score, stars this run, best combo, time, "new best" when it is, the
  balance and the bar to the next gear, **Again** (primary) and **Back to the fair**.
- **Boards** (from the summary and the menu): today's top ten and all-time, callsigns only, your best marked.
- The dock in the Playground: the Jump button and Menu. Map and Express are the fair's.

## Architecture

New code lives in `src/playground/` and reuses what the fair proved: the `Sim` (a Playground movement tuning with a
thrust block), the controller, `CameraRig`, `FairInput` (plus a held state for the button), `NexoActor` and its bone
layer, the label and toast systems, the sound engine, the quality ladder.

| file | what |
|---|---|
| `src/playground/course.ts` | the course as data, and the geometry questions the tests ask of it (gaps, reach, pickup placement, ring crossings) |
| `src/playground/run.ts` | the run's rules as a pure state machine on simulation time: O₂, score, combo, stars, rings, pads, gate, fall, end. No DOM, no three.js |
| `src/playground/gear.ts` | the three movement tunings, thrust and fuel, the poses per gear, the camera presets |
| `src/playground/world.ts` | platforms, pickups, rings, pads, stands, portal, gate, ribbons, the landing marker, on the fair's palette and sun |
| `src/playground/engine.ts` | the loop: input → sim → run rules → world; the course-guided camera; enter and leave |
| `src/playground/store.ts` | balance, unlocks, best run: `localStorage` first, the API when the backend has it, one interface |
| `src/ui/playground.tsx` | the run card, the summary, the boards, the Jump button |
| `src/playground/*.test.ts` | run rules; course gaps against the jump maths on the real physics; pickups per step; ring crossings; the trail projection |

**One stage.** `main.tsx` owns one renderer, one canvas, one input (what the fair engine builds today, lifted out
as a `Stage` the fair engine takes; nothing else in the fair changes). Entering the Playground pauses the fair's loop
(its scene stays in memory, its presence stops with its loop) and hands the stage to the Playground engine; leaving
hands it back and pings presence at once. The Playground's world is built on first entry and kept for the session.

**Back and Escape.** The Playground owns one history entry like a sheet does (`back.ts` gains a `world` state next
to `sheet` and `play`), so the phone's Back button leaves for the fair and never the site.

**Analytics from day one.** Every run end posts `playground_run` to `/api/event` (gear, score, stars, seconds,
finished), which exists today, so the first fair days teach the tuning before the endpoints below exist.

### Server contract (for the backend owner; the client runs without it until then)

- `POST /api/playground/start` → `{ token }`: a single-use run token, one per 45 s per player.
- `POST /api/playground/run` `{ token, gear, score, stars, comboMax, seconds, finished }` → `{ balance, best, unlocks,
  events }`. Sent at the end of a run, or with `sendBeacon` when the tab is hidden mid-run. Checks: the token unused
  and under 10 minutes old; `stars` ≤ the course's 145; `score` ≤ what those stars can pay at ×4 plus the diamond
  and the bonus; `seconds` ≥ 20 for a finished run. Fails refused, not trimmed. If the daily bridge is on, the first
  finished run of the day appends `playground_daily` (50) to the fair's ledger.
- `POST /api/playground/unlock` `{ gear }`: spends stars, refuses if short. `GET /api/playground/me`: balance, best,
  unlocks, runs today. `GET /api/playground/board?range=today|all`: top ten, cached like the fair's boards.
- Tables: `playground_runs` (player, gear, score, stars, seconds, finished, at), `playground_state` (player, stars,
  unlocks).
- Until then the client keeps balance and unlocks in `localStorage` (`mx_playground`), says so on the summary, and
  the store's interface does not change when the switch is made.

## Stability, in a list

| Failure | Closed by |
|---|---|
| A star skipped at speed on a slow phone | pickups per 60 Hz simulation step, not per frame |
| A ring or the gate skipped | line-crossing test between steps |
| A run lost to a reload or a killed tab | stars bank on pickup; the run goes out with `sendBeacon` on hide |
| O₂ lost to a phone call, a lock, a sheet | O₂ on simulation time; the loop stops, so does O₂ |
| Falling through an edge, tunnelling | the body's 0.25 m sweep passes, the same as the fair |
| A wrong respawn (mid-jump state carried over) | respawn clears velocity, dashes, slam, the jump buffer, sets the camera behind |
| The camera under a platform | the section anchor, the five whiskers, the 0.5 m floor |
| Two WebGL contexts, a lost context on a phone | one stage; the fair paused, not duplicated |
| Memory growing with every visit | the Playground world built once and kept; ribbons and labels pooled; no per-frame allocation |
| A slow phone | the same quality ladder; the Playground has no hall of booths, so it should hold q0 where the fair does not |
| The back button leaving the site | the Playground's own history entry |
| Sound and haptics stacking on a combo | the chime pool of four voices; one buzz per pickup, none while one is playing |
| Cheated scores | the server contract's caps and token; boards are for fun, the crew's review rule stays for anything that pays |

## Phases

Each phase ends with the suite green, the typecheck and lint clean, a play-through at phone size and on the desk,
and one commit. The fair is untouched beyond Phase 0, the stage lift-out and the door.

- **Phase 0 — the guide trail** in the fair, with a test for the projection; the stage lifted out of the fair engine
  with no change in behaviour. Half a day.
- **Phase 1 — the run with Boots**: course data and world, the run rules, pickups, rings, pads, the gate, respawn,
  the landing marker, the course-guided camera, the run card, the summary, the local store, the door in and out,
  Back, sounds and the floating scores. Tests: the run rules; every Boardwalk and Stairs gap cleared by the
  scripted body on the real physics; every pickup within reach of its line and inside no box; rings crossed at
  9.5 m/s. This is the Playground playable.
- **Phase 2 — Skates**: the tuning, the glide pose, the ribbons, the preset, the tuck, the Skates line, its diamond
  and stand. Tests: the Sky Line's Skates gaps at speed.
- **Phase 3 — the Jetpack**: thrust in the controller behind the tuning, fuel, cells, the ceiling, the pose, the
  exhaust, the preset, hold on the button and Space, the line, its diamond and stand. Tests: the fuel budget
  reaches every sky star from the nearest cell; thrust inert for the fair and the RPG.
- **Phase 4 — polish and phones**: the unlock ceremony, the boards, the chimes, the daily bridge behind a flag,
  the phone pass with the ladder, the real-phone protocol extended with the Playground.
- **Phase 5 — the server**: the contract above, the store switched over, the checks, the boards cached. The backend
  owner's work with the client's tests as the spec.

## Decisions taken, and what I want from you

Taken: one course, three sections, ninety seconds; oxygen as the clock on simulation time; stars as the currency,
banked on pickup; gear as stands on the pad; one button; a course-guided camera with a landing marker; flat
platforms with pads; no lives; Boots free, Skates 100, Jetpack 250; no gear in the fair for now; no other players in
the course; poses without new clips; one stage; a local store first.

Yours:

1. The name: "the Playground" is the working name (in the interface: "Playground · Nexova").
2. The daily bridge (50 fair points for the first finished run of the day): on or off. The backend owner's call as
   much as yours.
3. Whether gear should ever enter the fair (a later switch either way).
4. The prices (100 / 250) and the run length (40 s of O₂ + 96 s of bubbles): tuned by play once Phase 1 stands.

## Progress

**Phase 0 — done (23 Sep).** The renderer, canvas, input, frame loop, quality ladder and perf box live in
`src/fair/stage.ts`; the fair engine is the first Scene on it, unchanged in behaviour. The guide trail is placed
through the level's own mapping (it was drawn with the raw plan y, up to 3 m off the body on the compressed level)
and laid from the body every frame, the first dot a metre ahead, nothing behind (`nearestOnPath`, `dotsAlong`, tested).

**Phase 1 — done (23 Sep): the Playground is playable on Boots.** `src/playground/`: the course as data with the
tests jumping every gap on the real physics both at the edge and half a metre early; the run's rules as a pure
state machine (10 tests); the world on the shared sky and light (`src/fair/sky.ts`, `src/fair/light.ts`, lifted
out of the fair's world); the engine as a Scene with the course-guided camera, the landing marker, pickups per
simulation step, rings and the gate as line crossings, pads by the tag under the feet, the gear stands, the portal,
stars banked on pickup, the floating scores, the fade of a fall; the run card, the Jump button, the summary and
the first-run hint in `src/ui/playground.tsx`; the store on this device; the door in from the fair's menu and the
chip at the X, the door out from the summary, the menu and the portal; Back leaves for the fair (the world owns a
history entry under any sheet, tested). Each world's labels live in an overlay shown only while it has the stage.
- Measured on the physics and written into the course: a running jump at the edge clears 3.2 m, half a metre early
  2.7 m; the air jump 4.7 / 4.2 m; top speed 4.2 / 3.7 and 6.3 / 5.8 m. Gaps are 1.8–2.2 m on the Boardwalk,
  2.6–2.8 m with metre rises on the Stairs, 2.4 m with drops on the return lane; the diamond's ledge is 4 m out.
- Verified in the browser at 597 × 859 and 375 × 812: entering from the menu, a scripted run over the course
  (2,320 points, ×4 combo, out of air after falls), the summary, Again, Back to the fair from the menu with the
  fair resuming at once, re-entering with the same engine. The Playground draws 14 calls and 72k triangles.
- For working on it: `?pg` (dev only) goes straight into the Playground after the first screen; the browser pane's
  hidden state pauses the stage like a hidden tab, so a scripted run in the pane drives `__stage.frame` itself.
**Phase 2 — done (23 Sep): Skates.** The tuning in `src/playground/gear.ts` (cruise 7.5, the rim hold tucks to 9.5,
acceleration 7 and braking 5 for the long glide, 260°/s, a 6.8 jump); the stand sells them for 100 stars and says
"hold the rim to tuck". The glide is a pose over the calm clip in `src/fair/nexo.ts` (knees bent, the left leg
leading, the torso forward and into turns from the yaw rate, the hips 4 cm lower so the feet stay on the floor), in
by speed and out for a jump; no footsteps on skates; two ribbons (`src/playground/ribbon.ts`: a fixed ring of
samples in one strip, nothing allocated per frame) trail from the ankles while gliding. The Skates line at z 30, west
from the turn: a 5 m gap then 5.5 m gaps between 10 m platforms each about a metre lower, laid by the landing-zone
rule above; boost pads four metres in from the edge on every other platform, pushing once per touch (edge-triggered:
the 3 m grid cooldown gave a fast body two or three pushes and the run hit 38 m/s); cyan-ringed stars, four rings,
four bubbles, the Skates diamond before the gate; home runs on past the gate. Rings carry an `order` (the way back is
200 plus the metres west of the turn) so a fall returns to the furthest ring passed on either lane; a section can be
one gear's (on skates the turn faces north until z 26). The camera distance is the gear's preset times the pinch, a
boost kicks the field of view, the boost is the same kick on every gear. Falling off the pad before a run returns to
the pad. Tests: every Skates gap by a tuck single and a cruise double, both half a metre early, none on Boots; the
pads carry a cruising single and do not overshoot with a tuck double; ring orders rise along every lane; the ribbon.
- Verified in the browser: Skates bought on the stand (153 → 53 stars); a scripted run down the line at the tuck with
  a predictive autopilot (the air jump only when the ballistic landing falls short): 2,543 points, 70 stars, ×4, 14 s,
  all four rings, no falls, 9.5 m/s cruising and 15.5 → 12.6 off a pad; the glide pose and the ribbons from behind
  and from the side; the tinted rings; the summary with "New best".
- Harness note: with the pane visible the stage loop runs, so the driver wraps `__stage.frame` with the autopilot
  (jump 0.45 m before a platform's west edge) and holds keys on `__stage.input.keys` (`fromKeys()` after a change).
- Not yet: the Jetpack (Phase 3), the boards, the chimes per combo level and the phone pass (Phase 4), the server
  (Phase 5). The Jetpack stand says "coming soon" until then.
