# The Playground — a second world for the fun of moving (design and plan, 23 Sep 2026)

The fair is the mission: walk, find the X, scan the checkpoints. It stays exactly as it is. The Playground is a
separate world with its own rules, entered from the fair and left back into it: a short run over platforms floating
beside MITEC, stars to collect, a clock made of oxygen, and gear you earn that changes how Nexo moves. Runs are
about ninety seconds, so a visitor gets one hit of it between booths and comes back for the next.

This page is the whole Playground. If something is not here, it is not in it. Nothing below touches the fair's
rules, the QR scanning, the mission or its points; the only change to the fair itself is the guide trail (Phase 0)
and the door in.

## What it is, in one screen

- **One course, one run.** A loop of platforms in space, three sections long, from a launch pad to a finish gate.
- **Stars** are the hunt: gold, in arcs that teach the jump, in lines that teach the gear. Ten score each, with a
  combo that doubles, triples and quadruples when they come fast. **One diamond** per run, hidden or gated.
- **Oxygen is the clock.** The run starts with 40 s of O₂; every cyan bubble adds 6 s. Out of O₂, the run ends where
  you stand. Through the gate, what is left pays a bonus. Either way everything you picked up is yours.
- **Gear** changes the body: **Boots** (run, jump, one more jump in the air) from the start; **Skates** (fast,
  momentum, long glides) at 120 stars; the **Jetpack** (thrust on fuel, hover, climb) at 300 stars. Each opens lines
  of the course the others cannot reach.
- **Fall off** and you are back at the last checkpoint ring, 4 s of O₂ poorer, combo gone. No lives, no game over.
- **Boards**: today's best runs and all-time, in the Playground only. The fair's points and mission are untouched.

## Rules

### The run

1. A run starts on the launch pad with the gear you chose, O₂ at 40 s, score 0, combo ×1.
2. O₂ counts down while the run is on. It pauses in the run summary and in a sheet, never elsewhere.
3. An **O₂ bubble** adds 6 s (cap 60 s). A **fuel cell** fills the jetpack's fuel by half. A **star** scores. A
   **checkpoint ring** sets where a fall returns you. A **boost pad** (blue arrows on the floor) gives 6 m/s along
   its arrows for a moment, any gear.
4. The **combo**: a star collected within 1.2 s of the last raises the multiplier, ×1 → ×2 → ×3 → ×4 (the cap).
   The multiplier applies to the star's score, not to the star count. It resets when the window lapses, on a fall,
   and at the gate.
5. The **diamond** is worth 300 score and 25 stars. One per run, in a spot the run's gear can reach only with intent
   (a double jump off the highest stair for Boots, the end of the long glide for Skates, the sky line for the
   Jetpack). Its place is fixed per gear, so it can be learned.
6. The **finish gate** ends the run: score banked, stars banked, plus a finish bonus of 10 score per second of O₂
   left. O₂ at zero ends the run too: score and stars banked as they are, no bonus.
7. Falling below the course (y < −3 m) returns you to the last ring after a half-second fade: −4 s O₂, combo ×1.
8. Leaving (the menu, the Back button, the tab going away for more than 60 s) ends the run as if O₂ had run out.

### Stars, score and gear

- **Stars** are the Playground's own currency: collected stars are added to your balance at the end of every run,
  finished or not. They are spent on gear. They are never fair points.
- **Score** is per run: stars × combo + diamond + finish bonus. Your best run goes on the boards; a run only counts
  if it was finished (through the gate).
- **Gear** is chosen on the launch pad, one per run. Skates cost 120 stars, the Jetpack 300; buying is once, forever,
  on this account. Boots are free. What each does is in "Mechanics" below.
- The course carries 120 stars (1,200 base score), 16 O₂ bubbles (+96 s), 3 fuel cells, 4 rings, 2 boost pads and
  the diamond, so a careful first run pays 50–90 stars and about 1,500 score; a clean Skates run about 3,000; a
  Jetpack run that takes the sky line about 4,500. Skates arrive after two runs, the Jetpack after five or six.

### What connects to the fair (and what does not)

- The Playground opens from the fair's menu ("Playground") and from a blue portal disc beside the launch pad at the
  X. Everyone in the world already has a card, so nothing more is asked. Leaving puts you back in the fair where you
  left it.
- While in the Playground you send no presence: you are not in the hall, the hall does not see you, the "here now"
  count leaves you out, and you come back when you come back.
- **Optional, needs the backend owner's word:** the first finished run of the day pays 50 fair points, once, as a
  ledger row `playground_daily`. That is the only bridge between the two point systems, and it is off until agreed.
- Gear stays in the Playground in this version. Letting Skates or the Jetpack into the fair is a later switch: the
  server's 12 m/s presence cap would allow Skates as they are, the Jetpack would need a ceiling and a look at "at a
  booth". Not now.

### What is not in it

No lives, no timers other than O₂, no enemies, no player-versus-player, no purchases with money, no randomness in
what the course pays (the diamond's place is fixed per gear), no other players' bodies in the course (a ghost of
your own best run is a later idea). One course to start; a second is data, not code.

## Mechanics

Everything moves on the same physics as the fair: axis-aligned boxes, a swept body with step-ups, the Ceritera
controller, the camera rig with its five-ray pull-in. The Playground passes its own movement tunings and adds
thrust. Numbers below are the starting values; the course is tuned to them and the tests check the gaps against them.

### Bodies and jumps

| | Boots | Skates | Jetpack (on the ground as Boots) |
|---|---|---|---|
| walk / run / top | 1.6 / 4.4 / 6.0 m/s (top: stick held past the rim, Shift) | — / 7.5 / 9.5 m/s (top: tuck) | 1.6 / 4.4 / 6.0 |
| acceleration / braking | 22 / 24 m/s² | 7 / 5 m/s² (momentum: builds slowly, glides long) | 22 / 24 |
| turn rate | 720°/s | 260°/s (wide arcs) | 720°/s; 300°/s in the air |
| jump / air jump | 7.4 → 1.24 m · 6.4 → 0.93 m | 6.8 → 1.05 m · 6.4 | 7.4 · none (thrust instead) |
| air control | 9 | 6 | 14 |
| coyote / buffer | 0.14 s / 0.18 s | same | same |
| gravity / fall / terminal | 22 · ×1.3 · 30 m/s | same | same; thrust cancels it |

Jump maths (gravity 22, fall ×1.3): a Boots jump is 0.63 s in the air, so a running jump clears 2.8 m, a top-speed
one 3.8 m; the air jump adds 0.55 s, so 5.2 m at a run, 7 m at top speed. Skates clear 4.4 m in one jump and 8.5 m
with the air jump. The course's gaps are set from these: **Boardwalk 2.0–2.5 m** (one jump, any gear), **Stairs
3–4 m with 1 m rises** (the air jump), **Sky Line 6–8 m** (Skates at speed, or the Jetpack).

### The Jetpack

- Thrust while the button is held and fuel is above zero: 34 m/s² upward, so the net climb is 12 m/s², capped at
  6.5 m/s up. Tapping hovers; holding climbs. Horizontal speed in the air is capped at 7 m/s.
- Fuel 100, drains 24 per second of thrust (about 4 s of climb), refills at 30 per second on the ground and by half
  from a fuel cell. The course has a glass ceiling at 18 m.
- Landing from thrust is a normal landing (the camera's small shake, the landing sound).

### Skates

- Speed is a state, not an input: the stick sets a heading, the body carries its momentum, turning at speed makes an
  arc, letting go glides to a stop over a few seconds. The tuck (Shift, or the action button held) takes the top
  speed to 9.5 m/s and narrows the turn.
- Ramps are stairs the step height eats: 0.25 m rises every metre read as a slope at speed. Rails and grinds are
  not in this version.

### Pickups

- Every pickup is a point with a radius: star 0.55 m, bubble 0.6 m, cell 0.6 m, diamond 0.7 m, tested against the
  body's chest each frame through a 4 m spatial hash. Collected ones scale to nothing over 0.12 s and are gone for
  the rest of the run.
- Stars spin (0.9 turn/s) and bob 12 cm; bubbles breathe; the diamond turns slowly and is the only thing on the
  course that is cyan and big. Everything is one instanced mesh per kind: five draw calls for the lot.

### Course

Three sections on a loop around the MITEC platform, in the same space sky, on the same white slabs with the fair's
palette (white and warm grey for floors, ink for edges, blue for what you can use, gold for what you earn, cyan for
air and fuel):

1. **Boardwalk** (0–70 m): floor at 0, gaps of 2–2.5 m, stars in arcs over the gaps, a boost pad, the first ring.
   Teaches the jump and the combo.
2. **Stairs** (70–140 m): platforms rising 1 m at a time with 3–4 m gaps, stars on the rises, the second and third
   rings, the Boots diamond off the top stair. Teaches the air jump.
3. **Sky Line** (140–210 m): a long glide (Skates' line, 6–8 m gaps, the Skates diamond at its end), a lower safe
   path with 2.5 m gaps for Boots, and above both the Jetpack's line of stars at 4–8 m up to the fourth ring and the
   Jetpack diamond; then the finish gate back at the pad.

The course is data (`src/playground/course.ts`): platforms as boxes, pickups as points, rings, pads, the gate, per
gear which line is intended. The world draws what the data says; the tests walk it.

### Camera

The fair's rig with three presets, blended over 0.4 s when the gear or the state changes:

| | distance | pitch | field of view | follow |
|---|---|---|---|---|
| Boots | 4.8 m | 0.32 | +0 | yaw follows the body while the stick is held (as the fair, but always) |
| Skates | 5.6 m | 0.24 | +6° above 6 m/s | the camera lags the body by 0.15 s at speed, which is what speed looks like |
| Jetpack | 6.2 m | follows vertical speed, 0.15 to 0.5 | +4° while thrusting | looks a little up when climbing, down when falling |

Drag to look works as in the fair and hands back after 1.5 s. The five whiskers keep the camera out of the platforms.
On a phone the stick is the left thumb; the right thumb has one big round **Jump** button (hold: thrust with the
Jetpack), and with Skates a **Tuck** button beside it. Keys: Space (hold: thrust), Shift (tuck), WASD.

### Trails and touch

- **The fair's guide trail is fixed first (Phase 0):** today the dots are laid from the position the path was
  computed at, up to 1.2 s ago, so at a jog they start 3 m behind the body and the first one sits under the feet.
  The fix projects the body onto the path every frame, drops what is behind, starts the first dot a metre ahead of
  the feet, and lays the rest along the exact route the follower walks. Nothing behind the body, nothing under it.
- **Skates** leave two ribbons from the feet (6 cm wide, 1.2 s long, cyan fading to nothing, flat: no glow) while
  faster than 4 m/s. **The Jetpack** leaves a short exhaust ribbon from the backpack (0.4 s) while thrusting. Boots
  leave six flat dust discs on a landing from more than 1.5 m. All of it is one geometry per trail updated in place,
  no allocation per frame.
- Every pickup answers: a scale pop, a chime a step higher for each combo level (four notes on the game's own
  scale), an 8 ms buzz on Android; a combo step up plays the "big" rise; O₂ under 8 s pulses the bar and plays the
  warning once; the gate plays the rise and the summary drops in.

### Poses without new clips

The library has no skating or flying clip and the Playground does not wait for one. Skates use the jog clip at a
slow rate with the legs held in a glide by the same bone layer that turns the head (a fixed knee and ankle pose,
blended in and out over 0.3 s), and the torso leaning into the turn. The Jetpack holds the jump clip's apex with the
body tilted into the direction of travel. Both are the attention layer's technique, cheap and clean. Real clips can
replace them later without touching anything else: the poses are a function of the state, in one file.

## Interface

- **Run card** (top-left, where the mission card is): the O₂ bar in cyan with the seconds, the score rolling up, the
  star count, the combo badge (×2, ×3, ×4) that lands with the star, the fuel bar with the Jetpack.
- **Launch pad sheet**: pick the gear (locked gear shows its price and your balance), Go. **Run summary sheet** at
  the gate or at O₂ zero: score, stars this run, best combo, time, your balance, "Claim" when a gear became
  affordable (the unlock ceremony: the body changes on the pad), Again / Back to the fair.
- **Boards** (from the summary and the menu): today's top ten and all-time, callsigns only.
- The dock keeps Map (disabled here), Express and Menu; the menu gains "Back to the fair".

## Architecture

New code lives in `src/playground/` and reuses what the fair proved: the `Sim` (with a Playground movement tuning
and one added input, thrust), the controller, `CameraRig`, `FairInput` (renamed nothing; it gets a `press('thrust')`
and a held state), `NexoActor` and its bone layer, the label and toast systems, the sound engine.

| file | what |
|---|---|
| `src/playground/course.ts` | the course as data, and the pure geometry questions the tests ask of it (gaps, reach, pickup placement) |
| `src/playground/run.ts` | the run's rules as a pure state machine: O₂, score, combo, stars, rings, finish, fall. No DOM, no three.js |
| `src/playground/gear.ts` | the three movement tunings, thrust and fuel, the poses per gear |
| `src/playground/world.ts` | platforms, pickups, rings, pads, gate, trails, the pad's portal, on the fair's palette and lights |
| `src/playground/engine.ts` | the loop: input → sim → run rules → world; camera presets; the same `EngineApi` surface where it applies |
| `src/playground/store.ts` | stars, unlocks, best run: `localStorage` first, the API when the backend has it, one interface |
| `src/ui/playground.tsx` | the run card, the pad sheet, the summary, the boards |
| `src/playground/*.test.ts` | run rules; course gaps against the jump maths on the real physics; pickup collection; the trail projection |

The two worlds never run at once: entering the Playground disposes nothing in the fair (the fair engine is kept, its
loop paused and its canvas hidden), so leaving is instant. State that must survive a reload (stars, unlocks) is in
the store; a run in progress is not.

### Server contract (for the backend owner; the client runs without it until then)

- `POST /api/playground/start` → `{ token }`: a single-use run token, one per 45 s per player.
- `POST /api/playground/run` `{ token, gear, score, stars, comboMax, seconds, finished }` → `{ balance, best, unlocks,
  events }`. The server checks: the token is unused and less than 10 minutes old; `stars` ≤ the course's 145;
  `score` ≤ what those stars can pay at ×4 plus the diamond and the bonus; `seconds` ≥ 20 for a finished run. Fails
  are refused, not silently trimmed. If the daily bridge is on, the first finished run of the day appends
  `playground_daily` (50) to the fair's ledger.
- `POST /api/playground/unlock` `{ gear }`: spends stars, refuses if short. `GET /api/playground/me`: balance, best
  run, unlocks, runs today. `GET /api/playground/board?range=today|all`: top ten.
- Tables: `playground_runs` (player, gear, score, stars, seconds, finished, at), `playground_state` (player, stars,
  unlocks). Boards are cached like the fair's.
- Until this exists the client keeps balance and unlocks in `localStorage` (`mx_playground`), so gear does not roam
  between devices; the store's interface is the same and the switch is one line.

## Phases

Each phase ends with the suite green, the typecheck and lint clean, a play-through at phone size and on the desk,
and one commit. The fair is untouched beyond what Phase 0 and the door need.

- **Phase 0 — the guide trail** in the fair, as above, with a test for the projection. Half a day.
- **Phase 1 — the run with Boots**: course data and its world, the run rules, pickups, rings, pads, the gate,
  respawn, the run card, the pad and summary sheets, the local store, the door in and out, sounds. Tests: the run
  rules; every Boardwalk and Stairs gap cleared by the scripted body on the real physics; every pickup within a
  body's reach of a platform and inside no box. This is the Playground playable.
- **Phase 2 — Skates**: the tuning, the glide pose, the ribbons, the camera preset, the tuck button, the Skates line
  and diamond. Tests: the Sky Line's Skates gaps at speed.
- **Phase 3 — the Jetpack**: thrust, fuel, cells, the ceiling, the pose, the exhaust, the preset, hold-to-thrust on
  the button and Space, the sky line and its diamond. Tests: the fuel budget reaches every sky star from the
  nearest cell.
- **Phase 4 — rewards and boards**: the unlock ceremony, the boards, the combo chimes, the daily bridge behind a
  flag, the phone pass with the quality ladder (the Playground has no 380 booths: it should sit at q0 on the phone
  tier).
- **Phase 5 — the server**: the contract above, the store switched over, the plausibility checks, the boards
  cached. Backend owner's work with the client's tests as the spec.

## Decisions I have taken, and what I want from you

Taken: one course, three sections, ninety seconds; oxygen as the clock; stars as the currency and gear as the
reward; no lives; Boots free, Skates 120, Jetpack 300; no gear in the fair for now; no other players in the course;
poses without new clips; local store first.

Yours:

1. The name: "the Playground" is the working name (in the interface: "Playground · Nexova").
2. The daily bridge (50 fair points for the first finished run of the day): on or off. It is the backend owner's
   call as much as yours.
3. Whether gear should ever enter the fair (a later switch either way).
4. The prices (120 / 300) and the run length (40 s of O₂ + 96 s of bubbles): tuned by play once Phase 1 stands.
