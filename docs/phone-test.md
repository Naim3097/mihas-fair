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
