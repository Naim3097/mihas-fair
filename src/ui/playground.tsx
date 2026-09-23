// The Playground's interface: the run card (air, score, stars, combo), the Jump button, the summary sheet, the
// first-run hint, the portal chip, the fade of a fall. Everything reads the engine's signals; nothing is per frame.
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { GEAR } from '../playground/gear';
import { pgBalance, pgBest, pgCombo, pgControls, pgFade, pgFuel, pgGear, pgHint, pgMode, pgNearPortal, pgO2, pgRunStars, pgScore, pgStandNote, pgStore, pgSummary, pgUnlocks } from '../playground/state';
import { O2_CAP } from '../playground/run';
import type { BoardRange, BoardRow } from '../playground/store';
import { me, modal, world } from '../state';
import { Sheet } from './common';

const FINE_POINTER = typeof matchMedia === 'function' && matchMedia('(hover:hover) and (pointer:fine)').matches;

/** Numbers that change roll to their new value. */
function useRolling(value: number, ms = 500): number {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const from = shown, t0 = performance.now(); if (from === value) return; let raf = 0;
    const tick = (now: number) => { const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3); setShown(Math.round(from + (value - from) * e)); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

/** notices: the toasts and the connection line, shown in the column under the run card as the fair shows them under its card. */
export function PlaygroundHud({ notices }: { notices?: ComponentChildren }) {
  const mode = pgMode.value, c = pgControls.value, score = useRolling(pgScore.value), gear = GEAR[pgGear.value];
  const next = (['skates', 'jetpack'] as const).find((g) => !pgUnlocks.value.includes(g));
  return (
    <>
      <div class="topstack">
      <div class={'objective runcard' + (mode === 'run' ? ' live' : '')}>
        {mode === 'run' ? (
          <>
            <div class="top"><span class="k">Playground · {gear.name}</span><span class="right"><span class="score" title="Score">{score.toLocaleString()}</span></span></div>
            <div class="o2"><i style={{ width: `${Math.min(100, (pgO2.value / O2_CAP) * 100)}%` }} class={pgO2.value <= 8 ? 'low' : ''} /></div>
            {gear.movement.thrust && <div class="fuel" title="Fuel"><i style={{ width: `${Math.min(100, pgFuel.value)}%` }} class={pgFuel.value <= 20 ? 'low' : ''} /></div>}
            <div class="runrow"><span class="air">{pgO2.value} s of air</span><span class="stars">★ {pgRunStars.value}</span>{pgCombo.value > 1 && <span class="combo">×{pgCombo.value}</span>}</div>
          </>
        ) : (
          <>
            <div class="top"><span class="k">Playground · Nexova</span><span class="right"><span class="score" title="Stars">★ {pgBalance.value}</span></span></div>
            <h2 class="turn">{pgStandNote.value ?? (mode === 'summary' ? 'Run over' : 'Cross the line to start')}</h2>
            {mode === 'pad' && <p>{next ? `${GEAR[next].name} at ${GEAR[next].price} stars · ${gear.name} on` : `${gear.name} on`}{pgBest.value != null ? ` · best ${pgBest.value.toLocaleString()}` : ''}</p>}
          </>
        )}
      </div>
      {notices}
      </div>

      {pgHint.value && mode !== 'summary' && <p class="hint pghint" role="status">{pgGear.value === 'jetpack' ? (FINE_POINTER ? <>Walk with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, hold <kbd>Space</kbd> to climb and let go to drop.</> : 'Drag the lower left to walk. Hold the button to climb, let go to drop.') : FINE_POINTER ? <>Walk with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, jump with <kbd>Space</kbd>: once more in the air for the long gaps.</> : 'Drag the lower left to walk. Tap anywhere, or the button, to jump: once more in the air for the long gaps.'}</p>}

      <div class="dock pgdock">
        {pgNearPortal.value && mode !== 'run' && <button class="chip act" onClick={() => { c?.leave(); world.value = 'fair'; }}>Back to the fair ›</button>}
        <button aria-label="Menu" data-tip="Menu" onClick={() => (modal.value = 'menu')}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg></button>
      </div>
      {mode !== 'summary' && <button class="jumpbtn" aria-label={pgGear.value === 'jetpack' ? 'Fly (hold)' : 'Jump'} onPointerDown={(e) => { e.preventDefault(); c?.jump(); c?.hold(true); }} onPointerUp={() => c?.hold(false)} onPointerCancel={() => c?.hold(false)} onPointerLeave={() => c?.hold(false)}>{pgGear.value === 'jetpack' ? 'Fly' : 'Jump'}{FINE_POINTER && <kbd>Space</kbd>}</button>}

      {pgFade.value && <div class="pgfade" aria-hidden="true" />}
      {mode === 'summary' && pgSummary.value && <Summary />}
    </>
  );
}

function Summary() {
  const s = pgSummary.value!, c = pgControls.value, gear = GEAR[s.gear];
  const next = (['skates', 'jetpack'] as const).find((g) => !pgUnlocks.value.includes(g)), toNext = next ? Math.max(0, GEAR[next].price - s.balance) : 0;
  return (
    <Sheet k={s.reason === 'gate' ? 'Through the gate' : s.reason === 'o2' ? 'Out of air' : 'Run over'} title={s.newBest ? 'New best!' : `${s.score.toLocaleString()} points`} gold={s.newBest} onClose={false}>
      {s.newBest && <p class="lead">{s.score.toLocaleString()} points on {gear.name}, your best run yet.</p>}
      <div class="stats">
        <div><span>Stars</span><strong>{s.stars}</strong></div>
        <div><span>Best combo</span><strong>×{s.comboMax}</strong></div>
        <div><span>Time</span><strong>{s.seconds}s</strong></div>
      </div>
      {s.bonus > 0 && <p class="fine">Air left paid {s.bonus} of that.</p>}
      {pgStore.value?.local && <p class="fine">Saved on this phone.</p>}
      {next ? (
        <div class="box"><strong>{GEAR[next].name} at {GEAR[next].price} stars</strong><p class="fine">{toNext === 0 ? 'Yours to take: step on the stand.' : `${toNext} more. You have ${s.balance}.`}</p><div class="dots"><i class="on" style={{ flex: `${Math.min(s.balance, GEAR[next].price)} 0 0` }} /><i style={{ flex: `${toNext} 0 0` }} /></div></div>
      ) : <p class="fine">Every kit is yours. Chase the best run.</p>}
      <div class="stack">
        <button class="btn primary big" onClick={() => c?.again()}>Again</button>
        <div class="row2"><button class="btn big" onClick={() => (modal.value = 'pgboards')}>Boards</button><button class="btn big" onClick={() => { c?.leave(); world.value = 'fair'; }}>Back to the fair</button></div>
      </div>
    </Sheet>
  );
}

/** Today's best runs and all-time: ten lines, best first, the viewer's own marked. On this device until the backend
 *  keeps them, and the sheet says so. */
export function BoardsSheet() {
  const [range, setRange] = useState<BoardRange>('today'), [rows, setRows] = useState<BoardRow[] | 'error' | null>(null);
  const store = pgStore.value, name = me.value?.callsign ?? 'You';
  useEffect(() => { let on = true; setRows(null); void store?.boards(range, name).then((r) => { if (on) setRows(r); }).catch(() => { if (on) setRows('error'); }); return () => { on = false; }; }, [range, store, name]);
  return (
    <Sheet k="Playground" title="Boards">
      <div class="pgtabs" role="tablist"><button role="tab" aria-selected={range === 'today'} class={range === 'today' ? 'on' : ''} onClick={() => setRange('today')}>Today</button><button role="tab" aria-selected={range === 'all'} class={range === 'all' ? 'on' : ''} onClick={() => setRange('all')}>All-time</button></div>
      {rows === null ? <p class="fine">Loading…</p> : rows === 'error' ? <p class="fine">The boards did not answer. Try again in a moment.</p> : rows.length === 0 ? <p class="fine">No finished run {range === 'today' ? 'today' : 'yet'}. Through the gate, and you are on the board.</p> : (
        <ol class="board">{rows.map((r) => <li key={r.rank} class={r.you && !store?.local ? 'you' : ''}><span class="rank">{r.rank}</span><span class="who">{r.name}<small>{GEAR[r.gear].name}{r.best ? ' · your best' : ''}</small></span><strong>{r.score.toLocaleString()}</strong></li>)}</ol>
      )}
      {store?.local && <p class="fine">Saved on this phone for now: the fair's board takes these once the backend is connected.</p>}
    </Sheet>
  );
}
