import { useEffect, useState } from 'preact/hooks';
import type { EngineApi as Engine } from '../game/engine-api';
import { api, ApiError } from '../net/api';
import { CHECKPOINTS, POINTS, ROLE_INFO, chapters, type Role } from '../../shared/rules';
import type { BoothTeamPeek, HandoffPeek, PassportInput } from '../../shared/types';
import { afterCard, autoWalk, boothAction, currentCp, gate, handoff, referral, unreachCheckpoint, setGate, teamInvite, atLaunchPad, bootError, bootNote, distToGoal, goalVia, guideOn, guideTarget, herePlace, journey, level, me, modal, moveHint, nearLift, nearStation, online, panelStation, phase, seated, stampedSet, stationMap, toast, toasts } from '../state';
import { facts } from '../game/facts';
import { MapSheet, PhotoSheet } from './world-sheets';
import { DemoChip, TourSheet } from '../demo/Tour';
import { Camera, Qr, Sheet, hex } from './common';
import { handleScan } from '../scan';
import { BoothSheet, ClaimSheet, ContactsSheet, MenuSheet, MyBoothSheet, SwapSheet } from './sheets';

type Eng = { engine: () => Engine | null };

export function App({ engine }: Eng) {
  const m = modal.value;
  return (
    <>
      {phase.value === 'boot' && <Splash text={bootNote.value} />}
      {phase.value === 'error' && <Splash text={bootError.value} error />}
      {phase.value === 'start' && <Start engine={engine} />}
      {phase.value === 'play' && <Hud engine={engine} />}
      {m === 'card' && <CardForm />}
      {(m === 'claimed' || m === 'complete') && <Finish />}
      {m === 'prize' && <PrizeSheet />}
      {m === 'rules' && <Rules />}
      {m === 'booth' && <BoothSheet engine={engine} />}
      {m === 'claim' && <ClaimSheet />}
      {m === 'mybooth' && <MyBoothSheet />}
      {m === 'swap' && <SwapSheet />}
      {m === 'contacts' && <ContactsSheet />}
      {m === 'map' && <MapSheet engine={engine} />}
      {m === 'photo' && <PhotoSheet />}
      {m === 'menu' && <MenuSheet />}
      {m === 'tour' && <TourSheet />}
      {m === 'scan' && <ScanSheet />}
      {m === 'jointeam' && <JoinTeamSheet engine={engine} />}
      {m === 'handoff' && <HandoffSheet engine={engine} />}
      {phase.value !== 'play' && <Toasts />}
    </>
  );
}

const Brand = ({ corner }: { corner?: boolean }) => (
  <div class={'brand' + (corner ? ' corner' : '')}><span>lean<b>.x</b>digital</span><i /><span>ne<b>x</b>ova</span></div>
);

const Splash = ({ text, error }: { text: string; error?: boolean }) => (
  <div class="splash"><div class={error ? 'xmark err' : 'xmark'} aria-hidden="true" /><p>{text}</p>{error && <button class="btn" onClick={() => location.reload()}>Try again</button>}</div>
);

/* ------------------------------------------------------------------ start: two doors */

function Start({ engine }: Eng) {
  const [busy, setBusy] = useState<Role | null>(null), was = me.value?.cls ?? null;
  const enter = (role: Role) => {
    engine()?.start(gate.value); phase.value = 'play'; api.track('start', { role, gate: gate.value });
    if (role === 'exhibitor') modal.value = 'mybooth';
    else if (!me.value?.docked) toast('Welcome to MIHAS', me.value?.mission.checkpoints.length ? 'Follow the trail to your first checkpoint' : 'Your checkpoints appear as exhibitors join', 'info', 5000);
  };
  const go = async (role: Role) => {
    setBusy(role);
    try {
      await api.start(role);
      if (me.value?.passport) { enter(role); return; }
      // everyone registers before entering: the card is how people see you, and what you swap
      afterCard.value = () => { afterCard.value = null; modal.value = null; enter(role); };
      modal.value = 'card'; setBusy(null);
    } catch (e) { toast(e instanceof ApiError ? e.message : 'Could not start', undefined, 'warn'); setBusy(null); }
  };
  const door = (role: Role, title: string, sub: string) => (
    <button class={'door' + (was === role ? ' on' : '')} disabled={!!busy} onClick={() => go(role)}>
      <span class="dot" style={{ background: hex(ROLE_INFO[role].color) }} /><strong>{busy === role ? 'Landing…' : title}</strong><small>{sub}</small><span class="go" aria-hidden="true">›</span>
    </button>
  );
  return (
    <>
      <Brand corner />
      <div class="sheet start">
        <div class="k">Mission X · MIHAS 2026{online.value > 1 && <span class="live">{online.value} in the expo now</span>}</div>
        <h1>Find the <b>X</b>.</h1>
        <p class="lead">The whole MIHAS expo, live on your phone. Make your free digital business card, walk the halls with everyone else in the game, and meet exhibitors.</p>
        {referral.value && !me.value?.hosting.length && was !== 'visitor' && <p class="invite">An exhibitor invited you to put your booth in the game — choose <b>I'm exhibiting</b>.</p>}
        <div class="doors">
          {door('visitor', was === 'visitor' ? 'Continue visiting' : "I'm visiting", `Make your card, scan the QR at ${CHECKPOINTS} exhibitor booths, then claim your tote bag at Lean X Digital.`)}
          {door('exhibitor', was === 'exhibitor' ? 'Back to my booth' : "I'm exhibiting", 'Put your booth in the game. Collect visitor leads, free.')}
        </div>
        <div class="gates" role="radiogroup" aria-label="Walk in by">
          <span class="k">Walk in by</span>
          {(level.value?.gates ?? []).map((g) => <button key={g.id} role="radio" aria-checked={gate.value === g.id} class={'chip' + (gate.value === g.id ? ' on' : '')} disabled={!!busy} onClick={() => setGate(g.id)}>{g.name}</button>)}
        </div>
        <p class="fine">An expo game by Lean X Digital. Unofficial — not affiliated with MATRADE or MIHAS.</p>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ in play: one instruction at a time */

const Icon = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>;
const ICONS = { map: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14', express: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 14a4.5 4.5 0 0 0 7 0M9 9.5v.5M15 9.5v.5', menu: 'M4 7h16M4 12h16M4 17h16' };

const FINE_POINTER = typeof matchMedia === 'function' && matchMedia('(hover:hover) and (pointer:fine)').matches;

/** Numbers that change roll to their new value: a score that ticks up is felt, one that flips is missed. */
function useRolling(value: number, ms = 650): number {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const from = shown, t0 = performance.now(); if (from === value) return; let raf = 0;
    const tick = (now: number) => { const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3); setShown(Math.round(from + (value - from) * e)); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

/** While you sit: one true thing about the show at a time, counted from the floor plan. */
function SeatNote() {
  const list = facts(level.value!), [i, setI] = useState(() => Math.floor(Math.random() * list.length));
  useEffect(() => { const id = setInterval(() => setI((n) => (n + 1) % list.length), 9000); return () => clearInterval(id); }, []);
  return <div class="note"><span class="k">While you sit</span><p>{list[i]}</p></div>;
}

function Hud({ engine }: Eng) {
  const m = me.value!, j = journey.value!, st = nearStation.value, has = st && stampedSet.value.has(st.id), view = st ? stationMap.value.get(st.id) : undefined;
  const [stamping, setStamping] = useState(false), [open, setOpen] = useState(false), [tray, setTray] = useState(false);
  const [mini, setMiniState] = useState(() => { try { const v = localStorage.getItem('mx_hud'); if (v) return v === 'mini'; } catch { /* private mode */ } return innerHeight < 520; });
  const setMini = (v: boolean) => { setMiniState(v); try { localStorage.setItem('mx_hud', v ? 'mini' : 'full'); } catch { /* private mode */ } };
  // "Take me there" folds the card away so the walk can be watched; the slim line keeps the distance, Pause and Stop
  const walking = autoWalk.value === 'going';
  useEffect(() => { if (walking) setMiniState(true); }, [walking]);
  const place = herePlace.value, sitting = seated.value, eng = engine(), points = useRolling(m.xp);
  const express = (f: () => void) => () => { f(); setTray(false); };
  useEffect(() => { // an open tray is a question; tapping anywhere else is the answer "never mind"
    if (!tray) return;
    const away = (e: Event) => { if (!(e.target as HTMLElement).closest?.('.express')) setTray(false); };
    document.addEventListener('pointerdown', away, true); return () => document.removeEventListener('pointerdown', away, true);
  }, [tray]);
  const goal = guideTarget.value, stName = st ? view?.company || st.name || 'Booth ' + st.id : '', total = (level.value?.booths.length ?? 1) - 1;
  // the trail: a place the player picked; else the next checkpoint; else Lean X, for the tote bag
  const next = !goal && j.kind === 'visitor' && m.mission.started ? currentCp.value : null;
  const toClaim = j.kind === 'visitor' && j.now?.n === 3;
  const trail = guideOn.value && distToGoal.value != null && (goal || next || toClaim);
  const walk = autoWalk.value;
  const word = j.kind === 'visitor' ? 'Chapter' : 'Step';
  /** "Take me there" — and, once walking, Pause / Resume and Stop. */
  const walkBtn = (mini?: boolean) => (
    <span class="walk">
      {walk !== 'off' && !mini && <button class="link" onClick={(e) => { e.stopPropagation(); eng?.stopWalk(); }}>Stop</button>}
      {walk === 'going' ? <button class="btn primary" onClick={(e) => { e.stopPropagation(); eng?.pauseWalk(); }}>Pause</button>
        : walk === 'paused' ? <button class="btn primary" onClick={(e) => { e.stopPropagation(); eng?.resumeWalk(); }}>Resume</button>
        : <button class="btn primary" onClick={(e) => { e.stopPropagation(); eng?.autopilot(); }}>{mini ? 'Go' : 'Take me there'}</button>}
    </span>
  );

  // the ending is shown once, the moment the third chapter closes and nothing else is on screen
  useEffect(() => {
    if (j.kind !== 'visitor' || j.now || modal.value) return;
    try { if (localStorage.getItem('mx_complete')) return; localStorage.setItem('mx_complete', '1'); } catch { /* private mode: show it */ }
    modal.value = 'complete'; api.track('mission_complete');
  }, [j.now, modal.value]);

  const act = boothAction(st), cpHere = !!st && m.mission.checkpoints.some((c) => c.stationId === st.id && !c.done);
  const doStamp = async () => { if (!st) return; setStamping(true); await engine()?.stamp(st); setStamping(false); };
  const cps = m.mission.checkpoints, left = cps.filter((c) => !c.done);

  return (
    <>
      {/* top-left: what to do now, and under it whatever the game has to say. One column, so a toast never lands on the mission card. */}
      <div class="topstack">
      {mini ? (
        <div class="objective mini" role="button" tabIndex={0} aria-label="Show the mission" onClick={() => setMini(false)}>
          {!goal && !next && <div class="dots" aria-hidden="true">{j.steps.map((s) => <i key={s.n} class={s.done ? 'on' : s === j.now ? 'now' : ''} />)}</div>}
          <span class="t">{goal ? goal.label : next ? next.label : j.now ? j.now.title : 'Free play'}</span>
          {trail && distToGoal.value != null && <span class="d">{distToGoal.value} m</span>}
          {trail ? walkBtn(true)
            : !goal && toClaim ? <button class="btn primary" onClick={(e) => { e.stopPropagation(); modal.value = 'prize'; }}>Code</button>
            : !goal && j.kind === 'exhibitor' ? <button class="btn primary" onClick={(e) => { e.stopPropagation(); modal.value = m.passport ? 'mybooth' : 'card'; }}>Booth</button> : null}
          <span class="score" title="Points">{points.toLocaleString()}</span>
        </div>
      ) : (
      <div class={'objective' + (open ? ' open' : '')} onClick={() => setOpen(!open)}>
        <div class="top">
          <span class="k">{goal ? 'Guiding you to' : j.now ? `${word} ${j.now.n} of ${j.steps.length}` : j.kind === 'visitor' ? 'Mission complete' : 'Your booth is working'}</span>
          <span class="right"><span class={'score' + (points !== m.xp ? ' up' : '')} title="Points">{points.toLocaleString()}</span>
            <button class="min" aria-label="Fold the mission card away" onClick={(e) => { e.stopPropagation(); setMini(true); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg></button></span>
        </div>
        <h2 key={goal ? 'goal' : j.now?.n ?? 0} class="turn">{goal ? goal.label : j.now ? j.now.title : 'Free play'}</h2>
        {!goal && <p>{j.now ? j.now.todo : `${m.stamps.length} of ${total.toLocaleString()} booths stamped. Keep exploring and meet the people you find.`}</p>}
        {!goal && <div class="dots" role="img" aria-label={`${j.done} of ${j.steps.length} done`}>{j.steps.map((s) => <i key={s.n} class={s.done ? 'on' : s === j.now ? 'now' : ''} />)}</div>}
        {!goal && j.kind === 'visitor' && j.now?.n === 1 && <div class="go-row"><span>One minute, yours to keep</span><button class="btn primary" onClick={(e) => { e.stopPropagation(); modal.value = 'card'; }}>Get my free card</button></div>}
        {!goal && toClaim && <div class="go-row"><span>{atLaunchPad.value ? 'At the counter?' : 'All checkpoints done'}</span><button class="btn primary" onClick={(e) => { e.stopPropagation(); modal.value = 'prize'; }}>Show my prize code</button></div>}
        {!goal && j.kind === 'visitor' && j.now?.n === 2 && (
          <>
            {cps.length ? <ul class="cps">{cps.map((c) => <li key={c.stationId} class={c.done ? 'done' : c.stationId === next?.stationId ? 'next' : ''}><i aria-hidden="true" />{c.company}<small>{c.stationId}</small>{!c.done && !goal && c.stationId !== next?.stationId && <button class="link go" onClick={(e) => { e.stopPropagation(); const b = level.value?.booths.find((x) => x.id === c.stationId); if (b) { unreachCheckpoint(c.stationId); guideTarget.value = { x: b.x, y: b.y, label: `${c.company} · Booth ${c.stationId}` }; guideOn.value = true; } }}>Take me there</button>}</li>)}</ul> : <div class="via">Your checkpoints appear here as exhibitors join.</div>}
            {next && <div class="via">Next: {next.label}</div>}
            {!next && left.length > 0 && <div class="via">At the booth? Scan the Mission X QR on their counter.</div>}
          </>
        )}
        {!goal && j.kind === 'exhibitor' && <div class="go-row"><span /><button class="btn primary" onClick={(e) => { e.stopPropagation(); modal.value = m.passport ? 'mybooth' : 'card'; }}>{m.hosting.length ? 'Open my booth' : 'Set up my booth'}</button></div>}
        {trail && goalVia.value && <div class="via">{goalVia.value}</div>}
        {trail && (
          <div class="go-row"><span>{distToGoal.value} m {goalVia.value ? 'to the lift' : ''}{walk === 'paused' ? ' · paused' : walk === 'going' ? ' · walking' : ''}</span>
            <span class="walk">{goal && walk === 'off' && <button class="link" onClick={(e) => { e.stopPropagation(); guideTarget.value = null; }}>Cancel</button>}{walkBtn()}</span></div>
        )}
      </div>
      )}
      <Toasts />
      </div>

      {/* bottom-right, under the thumb: the three things you can always do */}
      <div class="dock">
        <DemoChip />
        <button aria-label="Map and search" data-tip="Map and search · M" onClick={() => (modal.value = 'map')}><Icon d={ICONS.map} /></button>
        <div class="express">
          {tray && (
            <div class="tray" role="menu">
              <button role="menuitem" onClick={express(() => eng?.emote('wave'))}>Wave<kbd>1</kbd></button><button role="menuitem" onClick={express(() => eng?.emote('cheer'))}>Cheer<kbd>2</kbd></button>
              <button role="menuitem" onClick={express(() => eng?.emote('dance'))}>Dance<kbd>3</kbd></button><button role="menuitem" onClick={express(() => eng?.jump())}>Jump<kbd>Space</kbd></button>
              <button role="menuitem" onClick={express(() => void eng?.photo())}>Photo</button>
            </div>
          )}
          <button aria-label="Express yourself" aria-expanded={tray} data-tip="Wave, cheer, dance, jump, photo" class={tray ? 'on' : ''} onClick={() => setTray(!tray)}><Icon d={ICONS.express} /></button>
        </div>
        <button aria-label="Menu" data-tip="Menu" onClick={() => (modal.value = 'menu')}><Icon d={ICONS.menu} /></button>
      </div>

      {/* bottom-centre: the one thing you can do right here */}
      <div class="action">
        {moveHint.value && !sitting && <p class="hint" role="status">{FINE_POINTER ? <>Click where you want to go, or use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>. Drag to look around, scroll to zoom.</> : 'Tap where you want to go, or drag the lower left of the screen. Drag elsewhere to look around.'}</p>}
        {sitting && <SeatNote />}
        {sitting && <button class="btn big" onClick={() => eng?.stand()}>Stand up<kbd>E</kbd></button>}
        {nearLift.value && <div class="liftrow">{nearLift.value.others.map((l) => <button key={l.deck} class="btn lift" onClick={() => engine()?.useLift(l)}>Level {l.deck}<small>{level.value?.decks.find((d) => d.level === l.deck)?.label.split(' · ')[1]}</small></button>)}</div>}
        {cpHere && !sitting && <button class="scanpill" onClick={() => (modal.value = 'scan')}>Scan now<small>the Mission X QR on their counter · your checkpoint</small></button>}
        {atLaunchPad.value && !m.passport && <button class="btn primary big" onClick={() => (modal.value = 'card')}>Get my free card</button>}
        {atLaunchPad.value && toClaim && <button class="btn primary big" onClick={() => (modal.value = 'prize')}>Show my prize code</button>}
        {/* walking up to a booth that is online: who they are and what they are offering, before tapping in */}
        {!sitting && !atLaunchPad.value && st && view && (view.offer || view.link || view.logo) && (
          <div class="nearcard" role="button" tabIndex={0} onClick={() => { panelStation.value = st; modal.value = 'booth'; }}>
            {view.logo && <img src={view.logo} alt="" />}
            <div>
              <strong>{view.company}<small>Booth {st.id}</small></strong>
              {view.offer && <span>{view.offer}</span>}
              {view.link && <a href={view.link} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>{view.link.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a>}
            </div>
          </div>
        )}
        {!sitting && (st || place?.verb) && (
          <div class="chiprow">
            {place?.verb === 'photo' && <button class="chip act" onClick={() => void eng?.photo()}>Take a photo<kbd>E</kbd></button>}
            {(place?.verb === 'sit' || place?.verb === 'watch') && !act && <button class="chip act" onClick={() => eng?.sit()}>{place.verb === 'watch' ? 'Sit and watch' : 'Sit down'}<kbd>E</kbd></button>}
            {!atLaunchPad.value && act === 'stamp' && <button class="chip act" disabled={stamping} onClick={doStamp}>{stamping ? 'Swapping…' : `Swap card · +${POINTS.stamp + (m.shared.includes(st!.id) ? 0 : POINTS.leaveCard)}`}{!stamping && <kbd>E</kbd>}</button>}
            {!atLaunchPad.value && act === 'swap' && <button class="chip act" onClick={() => { panelStation.value = st; modal.value = 'booth'; }}>{m.shared.includes(st!.id) ? 'Card swapped ✓' : `Swap card · +${POINTS.leaveCard}`}<kbd>E</kbd></button>}
            {!atLaunchPad.value && !act && st && m.scanned.includes(st.id) && <span class="chip done">Scanned ✓</span>}
            {!atLaunchPad.value && st && <button class={'chip' + (has ? ' on' : '')} onClick={() => { panelStation.value = st; modal.value = 'booth'; }}>{stName}{view ? (view.hosted ? ' · at the counter' : ' · online') : ''} ›</button>}
          </div>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ the card, the ending */

/** The card, filling in as it is typed: the reward is on the table before the form is finished. */
function CardPreview({ f }: { f: PassportInput }) {
  const initials = f.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return (
    <div class="pcard" aria-hidden="true">
      <div class="pcard-mono">{initials || 'X'}</div>
      <div class="pcard-who"><strong class={f.name ? '' : 'ph'}>{f.name || 'Your name'}</strong><span class={f.role || f.company ? '' : 'ph'}>{[f.role, f.company].filter(Boolean).join(' · ') || 'Role · Company'}</span>{f.showContact && <small class={f.phone || f.email ? '' : 'ph'}>{[f.phone, f.email].filter(Boolean).join(' · ') || 'Phone · Email'}</small>}</div>
      <div class="pcard-qr"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
    </div>
  );
}

function CardForm() {
  const exhibitor = me.value?.cls === 'exhibitor';
  const [f, setF] = useState<PassportInput>({ name: '', company: '', role: '', phone: '', email: '', showContact: true, consentMarketing: false, consentNotice: false });
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  // functional update: browser autofill fires several input events in one tick, and a stale closure would keep only the last
  const set = (k: keyof PassportInput) => (e: Event) => { const t = e.target as HTMLInputElement, v = t.type === 'checkbox' ? t.checked : t.value; setF((p) => ({ ...p, [k]: v })); };
  const submit = async (e: Event) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await api.card(f); api.track('card'); if (afterCard.value) { afterCard.value(); if (teamInvite.value) modal.value = 'jointeam'; return; } if (teamInvite.value) { modal.value = 'jointeam'; return; } modal.value = exhibitor ? 'mybooth' : null; if (!exhibitor) toast('Your mission is on', me.value?.mission.checkpoints.length ? 'Follow the trail to your first checkpoint' : 'Your checkpoints appear as exhibitors join', 'info', 5000); }
    catch (x) { setErr(x instanceof ApiError ? x.message : 'Something went wrong'); setBusy(false); }
  };
  return (
    <Sheet k={exhibitor ? 'First · who runs the booth' : 'First · your card'} title="Your free digital business card">
      <form onSubmit={submit}>
        <p class="lead">{exhibitor ? 'Your card tells visitors and our crew who is behind the booth. It takes a minute, and it is yours to keep.' : 'Built for you now, yours to keep: a card with its own link and QR. It is what you swap with people and leave at booths.'}</p>
        <CardPreview f={f} />
        <label>Name<input required maxLength={80} autocomplete="name" value={f.name} onInput={set('name')} /></label>
        <label>Company<input required maxLength={100} autocomplete="organization" value={f.company} onInput={set('company')} /></label>
        <label>Role<input maxLength={80} autocomplete="organization-title" value={f.role} onInput={set('role')} /></label>
        <div class="two">
          <label>WhatsApp / phone<input required type="tel" inputMode="tel" autocomplete="tel" placeholder="+60…" value={f.phone} onInput={set('phone')} /></label>
          <label>Email<input required type="email" autocomplete="email" value={f.email} onInput={set('email')} /></label>
        </div>
        <label class="check"><input type="checkbox" checked={f.showContact} onChange={set('showContact')} /><span>Show my phone and email on my card page</span></label>
        <label class="check"><input type="checkbox" checked={f.consentNotice} onChange={set('consentNotice')} /><span>I have read the <a href="/privacy.html" target="_blank" rel="noopener">Privacy Notice</a> and agree to Lean X Digital processing my details to run Mission X. My first name and initial show in the game. When I scan an exhibitor's Mission X QR, my name, phone number and email go to that exhibitor.</span></label>
        <label class="check"><input type="checkbox" checked={f.consentMarketing} onChange={set('consentMarketing')} /><span>Optional — Lean X Digital may contact me by WhatsApp or email about its services.</span></label>
        {err && <p class="err" role="alert">{err}</p>}
        <button class="btn primary big" disabled={busy}>{busy ? 'Building your card…' : `Create my card · +${POINTS.card}`}</button>
      </form>
    </Sheet>
  );
}


/** Two moments, one screen: the crew's scan at the booth, and the third chapter closing. When both are true this is the ending. */
function Finish() {
  const j = journey.value, left = j?.kind === 'visitor' ? j.steps.filter((s) => !s.done) : [];
  const complete = j?.kind === 'visitor' && left.length === 0;
  const close = () => { try { if (complete) localStorage.setItem('mx_complete', '1'); } catch { /* ignore */ } modal.value = null; };
  return (
    <div class="scrim"><div class="sheet ticket">
      <div class="k gold">{complete ? 'Mission complete' : 'Claimed at Booth 8H18A'}</div>
      {complete ? (
        <>
          <h2>All checkpoints done.</h2>
          <p class="lead">You made your digital business card, met every exhibitor on your list in person, and picked up your tote bag at Lean X Digital.</p>
          <p class="lead">That is a customer journey. Building them is what <b>Lean X Digital</b> does for businesses.</p>
          <a class="btn primary big" href="https://www.nexova.my" target="_blank" rel="noopener" onClick={() => api.track('cta_nexova')}>See what we could build for you</a>
          <button class="btn big" style={{ marginTop: '8px' }} onClick={close}>Keep playing</button>
        </>
      ) : (
        <>
          <h2>+{POINTS.booth} points. Enjoy your gift.</h2>
          <p class="lead">{left.length ? <>Still open: {left.map((s) => s.title).join(' · ')}. Finish them to complete the mission.</> : 'Thank you for coming by.'}</p>
          <button class="btn primary big" onClick={close}>Keep playing</button>
        </>
      )}
    </div></div>
  );
}

/* ------------------------------------------------------------------ the whole rulebook */

function Rules() {
  const rows: [string, number][] = [['Walk up to a booth in the game and swap your card', POINTS.stamp + POINTS.leaveCard], ['Scan a booth QR at the real booth', POINTS.scan], ['Swap cards with a person', POINTS.swap], ['Get your digital business card at the X', POINTS.card]];
  return (
    <Sheet k="How to play" title="One mission. Three steps.">
      <ol class="rules">{chapters({ started: false, card: false, checkpoints: 0, target: 0, claimed: false }).map((c) => <li key={c.n}><strong>{c.title}</strong><span>{c.todo}</span></li>)}</ol>
      <p class="fine">After the mission it is free play: walk the halls, stamp booths, meet people.</p>
      <table class="points"><tbody>{rows.map(([what, n]) => <tr key={what}><td>{what}</td><td>+{n}</td></tr>)}</tbody></table>
      <p class="fine">Exhibitors: bring your booth online, put its QR on your counter, and everyone who scans it lands on your dashboard — free.</p>
    </Sheet>
  );
}

/** The prize code: what the crew at Booth 8H18A scans for the tote bag. Shown as a QR their console reads and as six characters to type. */
function PrizeSheet() {
  const m = me.value!, j = journey.value, left = m.mission.checkpoints.filter((c) => !c.done).length, ready = j?.kind === 'visitor' && !!j.steps[1]?.done;
  return (
    <Sheet k="Lean X Digital · Booth 8H18A" title={m.docked ? 'Tote bag claimed' : 'Your prize code'} gold>
      {m.docked ? <p class="lead">Thank you for coming by. Enjoy your gift.</p> : m.ticket ? (
        <>
          <p class="lead">{ready ? 'All checkpoints done. Show this at the Lean X Digital counter in Hall 8 and our crew hands you your tote bag.' : m.mission.target ? `${left} checkpoint${left === 1 ? '' : 's'} to go. Bring this to Lean X Digital, Booth 8H18A, once they are all scanned.` : 'Your checkpoints appear as exhibitors join. Bring this to Lean X Digital, Booth 8H18A, once they are all scanned.'}</p>
          <Qr text={`${location.origin}/crew.html?t=${encodeURIComponent(m.ticket.token)}`} label="Your prize code as a QR" />
          <p class="lead" style={{ letterSpacing: '.18em', fontSize: '28px', fontWeight: 800, textAlign: 'center' }}>{m.ticket.code}</p>
          <p class="fine">If the camera will not read it, tell the crew the six characters.</p>
        </>
      ) : <p class="lead">Your prize code comes with your card.</p>}
      {!m.docked && !atLaunchPad.value && <button class="btn primary big" onClick={() => { const lv = level.value; if (lv) guideTarget.value = { ...lv.hero.dock, label: 'Lean X Digital · Booth ' + lv.hero.id }; guideOn.value = true; modal.value = null; }}>Guide me to Lean X Digital</button>}
    </Sheet>
  );
}

const Toasts = () => (
  <div class="toasts" aria-live="polite">{toasts.value.map((t) => <div key={t.id} class={'toast ' + t.tone}><strong>{t.title}</strong>{t.sub && <span>{t.sub}</span>}</div>)}</div>
);

/* ------------------------------------------------------------------ scan any Mission X QR: the start at Lean X, a checkpoint */

function ScanSheet() {
  return (
    <Sheet k="Mission X" title="Scan a QR">
      <p class="lead">Point your camera at the Mission X QR on the booth's counter or screen.</p>
      <Camera onCode={(t) => { modal.value = null; void handleScan(t); }} onFail={(msg) => { modal.value = null; toast(msg, undefined, 'warn', 5000); }} />
    </Sheet>
  );
}

/* ------------------------------------------------------------------ joining a colleague's booth team */

function JoinTeamSheet({ engine }: Eng) {
  const code = teamInvite.value, m = me.value, [peek, setPeek] = useState<BoothTeamPeek | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (code) api.teamPeek(code).then(setPeek, (e) => setErr(e instanceof ApiError ? e.message : 'This team link did not work')); }, [code]);
  const close = () => { teamInvite.value = null; modal.value = null; };
  const card = async () => { try { if (!m?.cls) await api.start('exhibitor'); modal.value = 'card'; } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not continue'); } };
  const join = async () => {
    if (!code) return; setBusy(true); setErr('');
    try {
      const p = await api.teamJoin(code); teamInvite.value = null; api.track('team_join');
      if (phase.value !== 'play') { engine()?.start(gate.value); phase.value = 'play'; }
      toast(`You are on the ${p.company} team`, 'Your booth, its QR and its visitors are in My booth', 'xp', 5000); modal.value = 'mybooth';
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not join'); setBusy(false); }
  };
  return (
    <Sheet k="Booth team" title={peek ? `Join the ${peek.company} team` : 'Join a booth team'} onClose={close}>
      {peek && <p class="lead">{peek.ownerName ? `${peek.ownerName} invited you to` : 'You are invited to'} work booth {peek.booths.join(', ')} in the game with them: its QR, the visitors who scan it, and its logo and photo — on your own phone, as your own astronaut.</p>}
      {err && <p class="err" role="alert">{err}</p>}
      {peek && !m?.passport && <><p class="fine">First, your card — so your team knows who you are. One minute.</p><button class="btn primary big" onClick={card}>Fill in my card</button></>}
      {peek && m?.passport && <button class="btn primary big" disabled={busy} onClick={join}>{busy ? 'Joining…' : `Join as ${m.passport.name}`}</button>}
      <button class="link" onClick={close}>Not now</button>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ an exhibitor the crew registered at the counter */

function HandoffSheet({ engine }: Eng) {
  const code = handoff.value, m = me.value, [peek, setPeek] = useState<HandoffPeek | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (code) api.handoffPeek(code).then(setPeek, (e) => setErr(e instanceof ApiError ? e.message : 'This link did not work')); }, [code]);
  const close = () => { handoff.value = null; modal.value = null; };
  const take = async () => {
    if (!code || !peek) return; setBusy(true); setErr('');
    try {
      await api.handoff(code); handoff.value = null; api.track('handoff', { booth: peek.stationId });
      if (phase.value !== 'play') { engine()?.start(gate.value); phase.value = 'play'; }
      toast(`Welcome, ${peek.name}`, `Booth ${peek.stationId} · ${peek.company} is yours in the game`, 'xp', 5000); modal.value = 'mybooth';
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not continue'); setBusy(false); }
  };
  return (
    <Sheet k="From the Lean X Digital crew" title={peek ? `${peek.company} · Booth ${peek.stationId}` : 'Your booth in the game'} onClose={close}>
      {peek && <p class="lead">Our crew at Booth 8H18A set up your booth and your card{peek.name ? ` for ${peek.name}` : ''}. Continue on this phone and it is yours: the booth QR for your counter, everyone who scans it, your logo and photo.</p>}
      {peek && m?.passport && <p class="fine">This phone is signed in as {m.callsign} at the moment. Continuing switches it to the account the crew made for you.</p>}
      {err && <p class="err" role="alert">{err}</p>}
      {peek && <button class="btn primary big" disabled={busy} onClick={take}>{busy ? 'One moment…' : `Continue as ${peek.name}`}</button>}
      <button class="link" onClick={close}>Not now</button>
    </Sheet>
  );
}
