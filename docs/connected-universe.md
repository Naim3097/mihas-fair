# One connected universe — the sweep plan

24 Sep 2026. Aims: the game feels whole; the fair and the Playground read as one universe; previews, camera and
smoothness improve. Nothing regresses, nothing gets noisy.

## What is true today (read, not assumed)

- **Kits work for the wearer only.** The Playground's gear (Boots, Skates, Jetpack) is worn on the fair's floor:
  `FairEngine.setKit` swaps the movement tuning, dresses the body (`NexoActor.wear`), draws the skate ribbons and the
  jetpack exhaust, and the Jetpack flies up to `FLY_CEILING` (6.5 m) over the partitions, under the glass (9 m).
- **Nobody else sees any of it.** A presence ping carries `{x, y, h, pose?}` (`PresencePing`), the server stores
  exactly that (`presence` table: x, y, h, pose, av …) and hands back `Hologram`s with the same fields. Every other
  body is drawn on the floor (`o.actor.place(w.x, 0, w.z, r.h)`), in Boots, walking or jogging by ground speed
  (`applyRemote`). A flyer is seen as a figure sliding along the floor at 7 m/s with the `jump` pose held; a skater
  as a jogger. That is the gap.
- **The body can already do it.** `NexoActor` dresses any body with a kit (the kit model is loaded once, cloned per
  body), has a skate glide mode, a flight mode, thrust flames, and `place()` lifts the shadow off the floor when the
  body is in the air. It is only ever told to for the player.
- **The Playground is under-explained.** It is reachable from the chip at the X and one menu row ("Jump for stars,
  earn the kits"). Nothing in the fair says what the stars buy or that a kit is worn *here*; the How-to-play sheet
  does not mention it; the docs' rules page does not either.
- **Cameras.** The fair's camera keeps one pitch whatever the body does; the Playground tips the pitch by vertical
  speed and kicks the FOV on thrust. At the fair's ceiling the camera's target sits at 7.85 m and the camera at
  ~10 m: above the glass, so the rig jams it in against the pane. Entering the Playground and coming back are cuts
  (`snapBehind`); the fair's own start settles in from above.
- **Infrastructure.** Pings go every 3 s; `RemoteTrack` interpolates x, y and heading over the learned rhythm.
  The schema has no precedent for adding a column to an existing table (only `CREATE TABLE IF NOT EXISTS`).
  The in-browser demo drives bots through the same server classes.

## The concept

What you earn in the Playground is a thing on your body in the fair, and everyone sees it: a skater glides past you
leaning into the turn, a jetpack climbs over the partitions with its flames lit and its shadow left on the floor.
Seeing it is the invitation. One quiet line, once, says where it comes from.

## The sweep — six steps, in order

### 1. The wire and the server: kit and altitude travel with presence
- `PresencePing` gains `kit?: 'skates' | 'jetpack'` (absent = Boots) and `z?: number` (metres above the floor,
  one decimal, sent only when > 0.05). `POSES` gains `'fly'` (airborne on a jetpack); `'jump'` stays for a jump.
- `Hologram` gains `kit` and `z`. `publicView` passes them; a phone gone quiet is placed on the floor (`z: 0`, as it
  already drops the pose), so nobody hangs in the air for twelve hours.
- `presence` table gains `kit TEXT NOT NULL DEFAULT ''` and `z REAL NOT NULL DEFAULT 0`, through a small idempotent
  column-add in the migrate step (Postgres `ADD COLUMN IF NOT EXISTS`; SQLite checks `pragma_table_info` first).
  `DbPresence` reads and writes them; the memory store needs nothing.
- `Game.ping` validates: `kit` must be owned (the Playground's unlocks, cached per player for 30 s like the callsign),
  else stripped; `z` clamped to `[0, FLY_CEILING + 0.5]` and only kept with the jetpack; `'fly'` only with the jetpack.
  Every kit speed is already under the server's 12 m/s cap (`kits.test`).
- Tests: presence round-trips kit and z; an unowned kit is stripped; a quiet flyer lands; migrate adds the columns
  on a database that already has the table.

### 2. The wearer says so
- `FairEngine.sync` sends `kit` when not Boots, `z` when airborne, pose `'fly'` when jetpack-airborne (instead of
  `'jump'`). Same 3 s rhythm, two small fields more; no extra requests.

### 3. Everyone sees it (the heart of the sweep)
- `RemoteTrack` carries `z` along the segment like x and y, and exposes the vertical speed; a body that arrives
  airborne starts airborne (no rise from the floor).
- `applyHolos` dresses each body with its kit (`actor.wear`), sets the locomotion (`skate` for skaters), and keeps
  `kit`/`z` on the `Holo`.
- `updateHolos` places the body at `r.z`, turns flight on with hysteresis (on above 0.3 m, off under 0.15 m), lights
  the thrust from the vertical speed (climbing or holding altitude), leans the torso by the track's turn rate on
  skates, and puts the name label over the body at its real height. `applyRemote` gains the skate branch: the glide
  clip held, in by speed, no footsteps.
- The exhaust ribbon and the skate ribbons stay the wearer's own (one instance each). Flames on the pack are what
  others see — enough, and free.
- Phone tier: kits are dressed only on bodies within 30 m (the same line that already halves their animation rate);
  farther bodies stay in Boots and are re-dressed when they come near. The holo cap (24 / 12 / 6) stays.
- The demo's bots: two on Skates, one on a Jetpack flying a loop of an aisle at 3–4 m, so a demo — and any screenshot
  of it — shows the concept without a second player.

### 4. Camera and previews
- Flying in the fair: pitch tips by vertical speed as in the Playground (clamped), a small FOV kick while the thrust
  fires, and as altitude nears the ceiling the pitch flattens so the camera stays under the glass instead of being
  jammed in by it. Nothing changes on the ground.
- Entering the Playground settles in from above over ~1.2 s like the fair's start; coming back to the fair settles
  the same way instead of cutting. One easing, both directions.
- Remote smoothness: altitude interpolated, flight state with hysteresis, thrust eased by the actor's own flame
  damping — no popping when a ping lands.

### 5. Say it once, where it is true (no noise)
- The chip at the X: **Playground › Skates · Jetpack**. On the first approach to the X with no kit owned, one hint
  under the mission card (the existing `hint` style, dismissed by walking on): "Stars from the Playground buy Skates
  and a Jetpack — worn here, in the halls." Shown once per phone (localStorage), never again.
- The first time a kit is *seen* on someone else and the viewer owns none: one toast, once per phone: "That's a
  Jetpack from the Playground, beside the X." The sighting is the teaching; the line just names it.
- The menu row: "Playground · Earn Skates and a Jetpack to wear in the halls". The How-to-play sheet and
  `docs/game-rules.md` gain one short paragraph on the Playground and the kits.
- Nothing per frame, no new persistent UI, no badges on labels: the kit on the body is the signal.

### 6. Prove it
- Unit: presence (step 1), `RemoteTrack` altitude, kits speed cap, schema column-add, demo bots' pings accepted.
- Live, in Chrome, two tabs as two guests on the local SQLite server: one wears the Jetpack and flies an aisle; the
  other watches it climb, sees the flames and the shadow on the floor; then Skates, the glide and the lean. The
  phone-tier quality level checked at 6 holos. The camera at the ceiling stays under the glass.
- Full suite, type-check, lint; commit per step so any one can be reverted alone.

## Guardrails

- **Additive wire.** Old clients send no kit: they are Boots on the floor, as today. New fields absent = old behaviour.
- **The server decides.** A kit not owned is stripped; altitude is clamped; speed caps are untouched. A cheat can
  claim at most what it has paid for.
- **Cost stays flat.** Two fields per ping, no new requests, kit models loaded once, far bodies undressed on phones.
- **Not in this sweep.** The big screen keeps its dots (a second body implementation lives there); the exhaust
  ribbon of other people's jetpacks; any change to ping rate or holo caps.

## Status — 24 Sep 2026, evening

Done, in six commits, one per step. What the live check (two scripted guests on local SQLite, watched from Chrome)
turned up beyond the plan:

- The presence route rebuilt the ping field by field and dropped the kit and the height; the unit tests passed the
  service directly and never saw it. Fixed, with a test over HTTP so the route cannot forget again.
- Seen for real: the flyer overhead with the pack on its back and its name riding up with it; the skater gliding past
  on its frames; the local player's own flight with the camera tipping over the halls and staying under the glass at
  the ceiling; the ping carrying `pose: fly, kit: jetpack, z: 6.5`; both one-time lines recorded on the phone; the
  settle into the Playground and back; the local presence table upgraded in place with its two new columns.
- Not done: the phone-tier check at six bodies (only two players were on hand). The 30 m dressing rule is in the code
  and covered by reading, not by a crowd.
