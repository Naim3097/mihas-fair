// Mission X · Nexova: Mission X's interface, rules and server, with the third-person engine of src/fair behind it.
// The site's entry (index.html); crew.html and screen.html are the exhibitor and big-screen pages.
import { render } from 'preact';
import './ui.css';
import './fair/fair.css';
import { App } from './ui/App';
import type { FairEngine } from './fair/engine';
import type { Stage } from './fair/stage';
import { fairLevelData } from './fair/level';
import { api, ApiError } from './net/api';
import { handleScan } from './scan';
import { ensureBackend } from './demo/client';
import { installBack } from './ui/back';
import { installSfx } from './sfx';
import { atLaunchPad, bootError, bootNote, drop, gate, handoff, level, me, modal, myBooths, online, phase, setReferral, stations, teamInvite, world } from './state';
import type { PlaygroundEngine } from './playground/engine';
import { ApiStore, LocalStore, type PlaygroundStore } from './playground/store';
import { pgStore } from './playground/state';
import { loadKit } from './fair/nexo';
import { effect } from '@preact/signals';
import type { LevelData } from '../shared/types';

let stage: Stage | null = null, engine: FairEngine | null = null, playground: PlaygroundEngine | null = null, kits: PlaygroundStore | null = null;

/** The Playground is built on first entry and kept; the fair pauses while it has the stage and resumes when it is back. */
effect(() => {
  const w = world.value; if (!stage || !engine) return;
  if (w === 'playground') {
    void (playground ? Promise.resolve(playground) : import('./playground/engine').then((m) => (playground = new m.PlaygroundEngine(stage!, stage!.quality, kits!)))).then((pg) => { if (world.value === 'playground') { pg.enter(); api.track('playground_enter'); } });
  } else if (playground && stage.scene === playground) { playground.onLeft(); stage.use(engine); engine.resume(); }
});
/** At the launch pad the Playground's code and the kits its stands show are fetched, so the door opens on a built world. */
effect(() => { if (atLaunchPad.value && !playground) { void import('./playground/engine'); void loadKit('skates', true); void loadKit('jetpack', true); } });
render(<App engine={() => engine} />, document.getElementById('ui')!);
installBack();
installSfx();
// the on-screen keyboard: the interface ends above it, so a sheet's fields stay in view while they are typed in
const vv = window.visualViewport;
if (vv) { const kb = () => { const h = Math.round(innerHeight - vv.height - vv.offsetTop); document.documentElement.style.setProperty('--kb', (h > 80 ? h : 0) + 'px'); }; vv.addEventListener('resize', kb); vv.addEventListener('scroll', kb); }

/** The booths online and today's drop, every 20 s give or take a fifth (a thousand phones do not line up), and on
 *  coming back to the tab, though never within 5 s of the last pull. */
function poll() {
  let last = 0;
  const pull = () => {
    if (document.hidden || Date.now() - last < 5000) return; last = Date.now();
    api.stations().then((s) => (stations.value = s), () => {});
    api.today().then((t) => { drop.value = t.drop; if (phase.value !== 'play') online.value = t.online; }, () => {});
    if (me.value?.cls === 'exhibitor' || me.value?.hosting.length) api.myBooths().then((b) => (myBooths.value = b), () => {});
  };
  pull();
  const later = () => setTimeout(() => { pull(); later(); }, 20_000 * (0.8 + Math.random() * 0.4));
  later();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
}

async function boot() {
  try {
    await ensureBackend((text) => (bootNote.value = text));
    // the renderer and the engine arrive while the plan and the player load, after the splash has painted
    const [lv, , , { FairEngine }, { Stage, pickQuality }] = await Promise.all([
      fetch('/data/floor.json').then((r) => { if (!r.ok) throw new Error('level'); return r.json() as Promise<LevelData>; }),
      api.me(),
      document.fonts.load('800 32px Urbanist').catch(() => {}),
      import('./fair/engine'),
      import('./fair/stage'),
    ]);
    level.value = lv;
    try {
      stage = new Stage(document.getElementById('stage')!, pickQuality()); engine = new FairEngine(stage, fairLevelData(lv), stage.quality);
      // the Playground's store, shared with the fair: the kits a run paid for are worn in the halls too
      kits = me.value ? new ApiStore() : new LocalStore(); pgStore.value = kits; engine.useKits(kits);
    }
    catch { bootError.value = 'This browser cannot open the 3D fair. Try opening the link in Chrome or Safari.'; phase.value = 'error'; return; }
    poll();
    // an exhibitor's invitation link: remember whose it was for when this person registers a booth
    const ref = new URLSearchParams(location.search).get('ref');
    if (ref && /^[A-Za-z0-9]{4,8}$/.test(ref)) { setReferral(ref.toUpperCase()); history.replaceState(null, '', location.pathname); }
    // a colleague's booth team link: offer to join once the page is up
    const team = new URLSearchParams(location.search).get('team');
    if (team && /^[A-Za-z0-9]{6,10}$/.test(team)) { teamInvite.value = team.toUpperCase(); history.replaceState(null, '', location.pathname); }
    // the crew registered this exhibitor at the counter: the link hands them the account
    const join = new URLSearchParams(location.search).get('join');
    if (join && /^[A-Za-z0-9]{6,10}$/.test(join)) { handoff.value = join.toUpperCase(); history.replaceState(null, '', location.pathname); }
    const query = location.search;
    if (/[?&](b|h|l)=/.test(query)) {
      history.replaceState(null, '', location.pathname);
      const returning = !!me.value?.cls && !!me.value.passport; // everyone in the world has a card
      if (returning) { engine.start(gate.value); phase.value = 'play'; }
      await handleScan(query);
      if (returning) { api.track('boot', { via: 'scan', world: 'nexova' }); return; }
    }
    phase.value = 'start';
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('pg')) { let once = true; effect(() => { if (once && phase.value === 'play') { once = false; world.value = 'playground'; } }); } // ?pg: straight into the Playground once, for working on it
    if (handoff.value) modal.value = 'handoff'; else if (teamInvite.value) modal.value = 'jointeam';
    api.track('boot', { q: stage.quality, world: 'nexova', returning: (me.value?.xp ?? 0) > 0 });
  } catch (e) {
    bootError.value = e instanceof ApiError || (e instanceof Error && /demo/i.test(e.message)) ? e.message : 'Could not reach the fair. Check your connection.';
    phase.value = 'error';
  }
}
void boot();
