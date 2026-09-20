// Mission X · Nexova: Mission X's interface, rules and server, with the third-person engine of src/fair behind it.
// The site's entry (index.html); crew.html and screen.html are the exhibitor and big-screen pages.
import { render } from 'preact';
import './ui.css';
import './fair/fair.css';
import { App } from './ui/App';
import { FairEngine, pickQuality } from './fair/engine';
import { fairLevelData } from './fair/level';
import { api, ApiError } from './net/api';
import { handleScan } from './scan';
import { ensureBackend } from './demo/client';
import { installBack } from './ui/back';
import { installSfx } from './sfx';
import { bootError, bootNote, drop, level, me, myBooths, online, phase, stations } from './state';
import type { LevelData } from '../shared/types';

let engine: FairEngine | null = null;
render(<App engine={() => engine} />, document.getElementById('ui')!);
installBack();
installSfx();

function poll() {
  const pull = () => {
    if (document.hidden) return;
    api.stations().then((s) => (stations.value = s), () => {});
    api.today().then((t) => { drop.value = t.drop; if (phase.value !== 'play') online.value = t.online; }, () => {});
    if (me.value?.cls === 'exhibitor' || me.value?.hosting.length) api.myBooths().then((b) => (myBooths.value = b), () => {});
  };
  pull();
  setInterval(pull, 20_000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
}

async function boot() {
  try {
    await ensureBackend((text) => (bootNote.value = text));
    const [lv] = await Promise.all([
      fetch('/data/floor.json').then((r) => { if (!r.ok) throw new Error('level'); return r.json() as Promise<LevelData>; }),
      api.me(),
      document.fonts.load('800 32px Urbanist').catch(() => {}),
    ]);
    level.value = lv;
    try { engine = new FairEngine(document.getElementById('stage')!, fairLevelData(lv), pickQuality()); }
    catch { bootError.value = 'This browser cannot open the 3D fair. Try opening the link in Chrome or Safari.'; phase.value = 'error'; return; }
    poll();
    const query = location.search;
    if (/[?&](b|h|l)=/.test(query)) {
      history.replaceState(null, '', location.pathname);
      const returning = !!me.value?.cls;
      if (returning) { engine.start('short'); phase.value = 'play'; }
      await handleScan(query);
      if (returning) { api.track('boot', { via: 'scan', world: 'nexova' }); return; }
    }
    phase.value = 'start';
    api.track('boot', { q: pickQuality(), world: 'nexova', returning: (me.value?.xp ?? 0) > 0 });
  } catch (e) {
    bootError.value = e instanceof ApiError || (e instanceof Error && /demo/i.test(e.message)) ? e.message : 'Could not reach the fair. Check your connection.';
    phase.value = 'error';
  }
}
void boot();
