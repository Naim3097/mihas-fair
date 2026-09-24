# Proof on real phones (15 minutes, no tools needed)

Everything up to here was checked on one desktop machine, at phone size in the browser. This is the part only a real
phone can answer. Use the deployed link (Vercel), not localhost. Add `?perf` to the end of the address: a small dark
box in the top-right corner shows the numbers asked for below: `fps · calls · tris · dpr · q` on the first line, our own
CPU time per frame and the people count on the second (`?perf&gpu` adds the GPU time where the browser can say it; it
stalls some desktop drivers, so it is off unless asked).

**Phones worth trying, in order of value:** a mid-range Android that is 2–3 years old (the typical visitor), any iPhone,
and the link opened from inside WhatsApp or Instagram (their built-in browsers behave differently from Chrome / Safari).

## What to do, and what to look at

| # | Do this | It passes if | If not, tell me |
| --- | --- | --- | --- |
| 1 | Open the link on mobile data, not Wi-Fi | The splash is up at once, the first screen (the X turning) in under ~5 s | how long each took |
| 2 | Enter, then read the `?perf` box while walking | **fps 50–60** (or a steady 30 on battery saver); `dpr 2`; `q0`. `q1`–`q4` means the phone asked for less: q1 a coarser shadow map, q2 fewer pixels, q3 no shadows | the whole line, e.g. `31 fps · 40 calls · 96k tris · dpr 1.5 · q2` |
| 3 | Look at the floor | The body and the booth walls throw a shadow that moves with the sun's angle; the far end of the hall fades into haze; the carpets are darker inside the booths | a screenshot |
| 4 | Drag the lower-left of the screen to walk; tap the floor; tap a booth | The joystick appears under the thumb; a push jogs, holding the thumb out past the rim for a moment sprints; a tap walks there; a tapped booth gets a blue frame and Nexo walks to its open front | what happened instead |
| 5 | Hold the stick forward and to one side for a few seconds | The view comes round behind Nexo on its own, gently | it spun, or never moved |
| 6 | Drag elsewhere to turn, pinch to zoom in until the camera is low in the aisle, then tap a booth | Smooth; no page scroll or zoom; the tap still picks the booth from low down | — |
| 7 | Press "Take me there" (or **Go** on the folded card), then do nothing; press **Stop** halfway | A jog, not a run; the view follows the trail; Stop stops at once; arriving at a booth brings its chip up | **where it stopped** (screenshot) |
| 8 | Fill the card with test details | The preview fills in as you type; the field being typed in stays above the keyboard | which field was covered |
| 9 | Stamp a booth | A chime, a short buzz (Android only), the gold band on the fascia, the score rolls up | which of those was missing |
| 10 | Menu → Sound · off, stamp another booth | Silence, no buzz | — |
| 11 | Express → Photo | A portrait appears (Nexo waving, the hall behind); Share or Save works | iPhone especially: a blank photo is a known risk |
| 12 | Press the phone's Back button / swipe back with a sheet open; then Escape or Back with nothing open | The sheet closes and the game stays; on the bare game it says "Press back again to leave" | it left the game |
| 13 | Airplane mode for ten seconds, then off | A red "No connection · trying again" chip under the card while it is off, gone within a few seconds after | it stayed, or never showed |
| 14 | Lock the phone for a minute, unlock | The game carries on; nobody kept walking; the `?perf` fps is back to where it was | — |
| 15 | Share the link to yourself on WhatsApp | The preview shows the "Find the X." card | needs `SITE_URL` or the Vercel domain at build time |
| 16 | Add to Home Screen | The X icon on a dark tile, the name "Mission X" | — |
| 17 | Menu → Playground | The pad in space: three stands, the blue portal disc, the start line; "Cross the line to start"; a round Jump button bottom-right; the `?perf` box says `playground · pad` and stays at `q0`, 50–60 fps | the line |
| 18 | Cross the line; jump the Boardwalk's gaps and take the stars in the arcs | The air bar counting down from 40 s; a chime a step higher as the combo climbs to ×4, "+40 ×4" over the helmet; a bubble adds 6 s; the boost pad pushes; the landing ring under the body in the air | which of those was missing |
| 19 | Jump short into a gap | A short dark blink, back at the last ring, the combo gone, 4 s of air gone | where it put you |
| 20 | Through the gate (or let the air run out) | The summary drops in: score, stars, best combo, time, "New best!" the first time; Again, Boards, Back to the fair; Boards lists the run | — |
| 21 | Step on the Skates stand with 100 stars; later the Jetpack stand with 250 | The stand lights and swells, the chime, the buzz, "Skates unlocked · hold the rim to tuck"; on skates the body glides with two cyan ribbons; the Jetpack: hold Jump to climb, the blue fuel bar under the air bar, the exhaust | — |
| 22 | Press Back in the Playground with nothing open; lock the phone mid-run for a minute | Back leaves for the fair (a run under way ends there); unlocked, the air is where it was: the clock stops with the game | it left the site, or the air kept draining |
| 23 | Back in the fair with Skates bought: tap the kit chip above the dock; walk a hall; with the Jetpack, hold Fly | The chip reads "Skates ›", the hall goes by twice as fast with two cyan ribbons, "Take me there" still steers round corners; on the Jetpack, Fly lifts the body over the partitions and no higher than the glass, the fuel bar drains and fills back on the floor; a booth's chip still comes up where it did on foot | the chip missing, a wall walked through, a "slow down" or review notice |
| 24 | On Skates look at the feet, in both worlds; on the Jetpack look at the back, then hold Fly; in the Playground walk up to the stands | Wheel frames with cyan-ringed wheels under the boots, the body a hair taller, the ribbons leaving from the wheels; the MIHAS jetpack on the back over the suit's pack, two cyan flames under its tanks only while Fly is held, the exhaust from its bottom; the whole skate and the jetpack turning slowly over their stands | a kit floating off the body or poking through the boot or the pack, flames on while standing, a kit left behind after switching |
| 25 | At the X (Booth 7E17) press **Playground ↑**; on the pad look down; then Menu → Down to the fair | The body rises beside the pad, crosses onto it, and the change of world does not show (the view at the top is the same in both); from the pad the halls and the booths are far below; the way down is the same ride backwards, back where you left | where the cut showed, or the body passed through something |
| 26 | Finish one run through the gate; press **Try Orbit 2** | The summary says "Orbit 2 is open"; on the pad the tiles wake and move, the card says "Playground · Orbit 2", the chip reads "Orbit 1"; run it: standing on a moving tile carries you with it; every gap is made with the air jump | a tile that threw you off, a gap the air jump could not make |
| 27 | Walk to an online exhibitor's booth; leave your card; go up to the Playground | The button reads "Swap card · +10 · +20 ★"; on the pad the stars are 20 more | the stars missing |
| 28 | With 400 stars, step on the blue stand by the portal; back in the fair, Map → search an exhibitor far away → **Warp** | "Warp unlocked"; the ride goes over the partitions and under the glass, lands beside the booth facing it, its chip comes up; the button counts down a minute | a "slow down" or review notice after a warp |

## Numbers that would worry me

- `q3` or `q4` on a phone newer than 2021, or under 30 fps at `q4` → there is more to take out of the scene
- `calls` above 120 → something is not being batched (a hall full of people is 12 bodies on a phone, 24 on a desk)
- `cpu` above 8 ms on the second line → our own code is the problem, not the GPU; say what was on screen
- `dpr 1` that never comes back to 2 after standing still → the ladder is not climbing back

## Results

| phone · browser | date | line 2 | rows that failed | notes |
| --- | --- | --- | --- | --- |
| desktop Chrome as a proxy · 375 × 812 · dpr 2 · phone tier · 12 people on screen | 23 Sep 2026 | `60 fps · 32 calls · 222k tris · dpr 2 · q0` · cpu 1.1 ms (the display caps at 60; 591k tris with the hero body for everyone, `?lod=0`) | none run: a proxy, not a phone | GPU time unread |

## Not covered by a phone in the hand

The load of many players at once on Vercel (every position update is about five database round trips). That needs the
real backend connected and a scripted crowd (`tools/load-test.mjs`); it is the first job of the backend phase, not of this sweep.
