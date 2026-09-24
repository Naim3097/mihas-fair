# Mission X · Nexova — the MIHAS 2026 expo as a fair in space

Lean X Digital's expo game: the whole MIHAS 2026 show floor (MITEC, three levels, 1,599 booths from the organiser's
floor plan) as a fair floating in space, walked in third person as Nexo. Visitors make a free digital business card,
scan the QR at the exhibitor booths on their list and claim a tote bag at Booth 8H18A; exhibitors put their booth in the game and collect leads.
Unofficial — not affiliated with MATRADE or MIHAS.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — the web app, with the API on 8787 behind it
```

Run it for phones on your own network (the built site and the real API on one port, plain http, dev secrets):

```bash
npm run build
npm run live       # prints http://<your LAN address>:8787/
```

`npm test` runs the rules, the engine and the server; `npm run build` typechecks and bundles.

## Pages

- `/` — the fair. Tap or click to walk, WASD or arrows, Shift walks, Space jumps, C rolls, E does the thing in
  front of you, 1 2 3 wave / cheer / dance, M the map, drag to look, pinch or wheel to zoom.
- `/crew.html` — booth staff (the crew PIN): prize codes, leads, booth approval, printed QRs, **Prepare a booth** (company name, logo and photo up before the exhibitor registers; they add only their own details later), and **Register** for signing an exhibitor up at the counter (they get a `/?join=CODE` link that hands them the account). `/screen.html` — the big screen for a stand.
- `/p/<slug>` — a visitor's card page.

## Deploy

Vercel, as `vercel.json` describes: `api/index.ts` is the API, `public/data/floor.json` ships with it. Set the
variables in `.env.example` (`DATABASE_URL` for the Supabase Postgres database, `MX_SECRET`, `CREW_PIN`); with none of them set the site runs in
demo mode, the whole game in the visitor's browser.

## Where things are

- `src/fair/` — the fair: the plan as a box world (`level.ts`), the stands read off the plan (`stands.ts`), the
  booths on screen (`booths.ts`), the world and sky (`world.ts`), Nexo (`nexo.ts`), the engine (`engine.ts`).
- `src/ceritera/game/` — the movement engine: physics, controller, camera, animation retargeting, the sim.
- `src/ui/`, `src/state.ts`, `src/net/` — Mission X's interface and rules; `src/demo/` — the in-browser demo backend.
- `server/`, `api/`, `shared/` — the API (Hono), its database adapters, and the types both sides share.
- `content/` — game data as code, with validators and tests.
- `public/` — the floor plan (`data/floor.json`), Nexo (`fair/nexo.glb`), the sky (`fair/space.mp4`), the shared
  animation library (`ceritera/anim/library.glb`).
- `tools/` — the floor-plan pipeline (`build-floor.mjs` from `tools/data/`), the rig tool (`rig/`), the animation
  library builder (`anim/`), `live.mjs`.
- `assets-src/` — source assets: Nexo's raw and rigged models and rig config, the animation library source, the
  brand references (the booth design, the Nexo sheets, the space background).
- `docs/` — the game bible, rules and systems, the design system, the fair examination, the fix plan.
