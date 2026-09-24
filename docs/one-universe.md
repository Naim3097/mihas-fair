# One universe: the fair and the Playground joined (24 Sep 2026)

Until now the Playground was a menu item: a second world with no way in from the first. This work makes the two one
place, and gives the Playground a second orbit that is never the same twice. Everything below runs locally; nothing
is deployed, and nothing reaches the live site until the crew turns its switch on.

## What changed, in five lines

1. **The Playground floats over the X.** At Booth 7E17 a lift rises beside the pad; one ride carries Nexo up (or
   down) and the camera cuts on a view both worlds share. From the pad, MITEC is below.
2. **Orbit 2: the course awake.** After the first run through the gate, the same course can be played with its
   tiles moving: a new seed every run, drawn from 123 movements. It pays exactly what Orbit 1 pays and has its own best and boards.
3. **Stars for exhibitors met.** The first card a visitor leaves at each booth (a lead for that exhibitor) also pays
   20 stars in the Playground.
4. **Warp.** 400 stars at a new stand on the pad buys a ride through the sky to any booth on Mission X. The server
   puts the body there, so the fair's speed check sees no jump.
5. **Two crew switches**, `sky` (Orbit 2 and the stars) and `warp`, are **off on the live site** until the crew
   turns them on (Crew → Switches), and on everywhere else.

## 1. The Playground over the X

- The pad hangs 56 m over the X, beside it. In the fair a blue disc with a white core marks the lift at the X, rings
  climb from it into the sky, and a copy of the course floats up there. From the pad, the halls, the booths and the
  rings coming up from the X are drawn below (one draw call).
- **Playground ↑** appears at the X (and the menu entry works from anywhere): the body rises, crosses and lands on the
  pad; the camera eases to one view (`SKY_VIEW` in `src/universe.ts`) at the top of the ride in the fair, and the
  Playground begins on that same view, so the change of world does not show. **Down to the fair** is the same ride backwards.
- Nothing about the fair's rules changed: presence, stamps and "at a booth" read the plan position, and no ride
  moves the body faster than a person runs.

## 2. Orbit 2: the course awake

**How it is made.** A movement is a *shape* (sine, glide, rest at the ends, piston, conveyor, bounce, plucked spring,
four-step, drift, pulse, pendulum, heartbeat) on a *path* (along the lane, across it, up and down, a flat circle, an
upright wheel, figures of eight, a diagonal, a Lissajous). The 132 pairs are fitted (reach and cycle) and kept only if
a tile doing them is readable: never faster than 2.6 m/s, and near home for part of every cycle. **123 pass.** Fourteen
tiles on all three lanes may move. The pad, a checkpoint ring's tile, the gate's, the turn, a diamond's ledge and a
jump pad's never do. A seed (`crypto.getRandomValues`) makes a run's plan:

- a movement per tile, none twice in a run;
- bolder ones later in the course;
- movements this device has not met lately drawn first. A player meets 100 or more different movements within about
  a dozen runs, and every one of the 123 turns up across 2,000 seeds.

**Why it is always fair (proved, not hoped).** Each tile's room is worked out from the body's own jump:

- every gap beside a moving tile stays within the Boots air jump taken **half a metre early**, with 0.3 m to spare;
- a metre of air always stays between tiles;
- two neighbours never both slide along the lane, nor both change height.

The worst case, two neighbours at the far ends of their room at once, is checked on paper for every pair. The real
physics then runs over 4,000 crossings of every gap by a moving tile (40 seeds, random start times, from the edge and
from half a metre early). It rides every moving tile (zero drift), drops bodies onto rising tiles (caught, never
swallowed), flies the Jetpack line and skates the Skates line. A change of plan settles the tiles home, then wakes
the new movements, so the same guarantees hold while it happens. Asleep, the course is Orbit 1 to the last digit
(its fingerprint is locked in a test).

**What it costs.** 2.3 µs of CPU per physics step (0.14 ms per second of play) and 0.8 ms once per run for a new plan.

**Rules.** Randomness never changes what a run pays: the pickups are Orbit 1's, the server's caps are unchanged.
Orbit 2 has its own best and its own boards (Today / All-time). The server records a run as Orbit 2 only when Orbit 2
is open to that player (through the gate on Orbit 1 before, switch on); anything else is recorded as Orbit 1 and pays
the same. The run's seed is kept with it.

**Where it shows.** The first finish opens it: the summary says so once, and its button reads *Try Orbit 2*. After
that, one chip on the pad card switches orbit and the course answers at once (the pad card's kicker names the orbit).

## 3. Stars for exhibitors met

Leaving a card at a booth for the first time pays 20 ★ in the Playground as well as its 10 points, in the same
database write. The button says so before the tap (*Swap card · +10 · +20 ★*) and the moment's toast says
*+10 points · +20 ★*. Once per booth: changing the fields, or taking the card back and leaving it again, pays
nothing more. This is the loop that shows the platform at work. A visitor meets exhibitors and leaves real leads, and
the reward is play: kits worn in the halls, and Warp.

## 4. Warp

- **Bought** at the stand on the pad's south side for 400 ★ (sold only while its switch is on). Owned, never worn:
  the kit chip, the kit hints and the kit models see only kits.
- **Used** from three places, only where it can be used (owned, switched on, the booth on Mission X or the X itself,
  30 m or more away): beside an exhibitor in the map's search, beside *Take me there* on a guided trail, and in a
  booth's sheet. A minute's charge after each ride, counted down on the button.
- **The server decides** (`server/warp.ts`, `POST /api/warp`): it checks the player's last known place, the booth,
  an arrival within stamping reach of it, the distance (30 m or more) and the cooldown. It then puts the body there
  itself, as a spawn is put, and logs the ride in `warps`. A ping sent from the old place just before a warp is
  forgiven for ten seconds (read from the table, so it holds on serverless); a jump that no warp explains is still
  flagged. The fair holds its pings during the ride.

## The switches

| switch | what it opens | live site | elsewhere |
| --- | --- | --- | --- |
| `sky` | Orbit 2, and stars for exhibitors met | off | on |
| `warp` | the Warp stand, and Warp itself | off | on |

The crew turns them on and off in Crew → Switches. Clients hear about it within a poll (about 20 s). A run under way
keeps its course; the pad settles home at once.

## Database changes (added in place; safe on the live database)

- `playground_runs` gains `orbit INTEGER NOT NULL DEFAULT 1` and `seed INTEGER` (the adapters add them on open when
  missing; existing runs become Orbit 1's).
- A new table `warps` (and its index).

## Running it locally

```
npm install
npm run dev        # the site on http://localhost:5173, the API on http://localhost:8787, a SQLite file in data/
```

No `.env` is needed; do not point `DATABASE_URL` at the production database. `npm run dev` now reloads the API on
every change to `server/`, `shared/` or `content/` (tsx watch). Node's own watch mode stopped on a clone without a
`.env` and left the old API serving.

## What was verified

- **191 automated tests pass**, 29 of them new. On paper: the catalogue, the tiles' room, 2,000 seeds, the worst case.
  In the real physics: riding, rays, a rising tile catching a body, 4,000+ crossings, the Jetpack and Skates lines,
  a change of plan, Orbit 1 restored. On the server: orbit and seed, per-orbit bests and boards, the upgrade of an old
  database, stars per booth, and Warp's rules end to end. On the device: the store's orbits, the movement memory,
  Warp kept out of the kits.
- **In a browser**, phone and desktop, with real keyboard and touch input. The lift ride and the cut. Orbit 2 opening
  from the summary. The chip both ways. Nexo run across the boardwalk's moving tiles with the keyboard (every
  platform to the first stair, four moving tiles ridden, no fall). A Jump tapped on a 375 × 812 phone. Stars from a
  card left, seen on the pad. Warp bought at the stand and ridden from the map (76 m, landing 2.6 m from the booth).
  No console errors, and no speed flag from a warp.
- Not yet: real phones (docs/phone-test.md, rows 25 to 28), and a crowd on the real backend.
