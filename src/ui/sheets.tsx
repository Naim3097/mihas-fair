import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { EngineApi as Engine } from '../game/engine-api';
import { setSound, soundOn } from '../sfx';
import { api, ApiError } from '../net/api';
import { handleScan } from '../scan';
import { shrink } from './images';
import { Camera, FieldPicker, Qr, Sheet, useCountdown } from './common';
import { POINTS, ROLE_INFO, waLink, type ShareField } from '../../shared/rules';
import type { Booth, BoothTeamView, Contact, LinkCode, LinkPeek } from '../../shared/types';
import { LinkDemoHint, StationDemoHint } from '../demo/Tour';
import { boothAction, referral, setReferral, drop, guideOn, guideTarget, journey, level, me, modal, myBooths, nearStation, online, panelStation, pendingLink, stampedSet, stationMap, stations, toast } from '../state';

type Eng = { engine: () => Engine | null };
const fail = (e: unknown, fallback: string) => toast(e instanceof ApiError ? e.message : fallback, undefined, 'warn', 4500);
const refreshStations = async () => { try { stations.value = await api.stations(); } catch { /* next poll */ } };
const refreshMyBooths = async () => { try { myBooths.value = await api.myBooths(); } catch { /* next poll */ } };
const guideTo = (b: Booth, label: string) => { guideTarget.value = { x: b.x, y: b.y, label }; guideOn.value = true; modal.value = null; };

/* ------------------------------------------------------------------ a booth */

export function BoothSheet({ engine }: Eng) {
  const b = panelStation.value, m = me.value!;
  const [fields, setFields] = useState<ShareField[]>(m.sharePrefs), [scan, setScan] = useState(false), [digits, setDigits] = useState(''), [busy, setBusy] = useState(false);
  if (!b) return null;
  const st = stationMap.value.get(b.id), mine = m.hosting.includes(b.id), stamped = stampedSet.value.has(b.id), left = m.shared.includes(b.id), met = m.verified.includes(b.id) || m.scanned.includes(b.id);
  const visitor = m.cls !== 'exhibitor', cp = m.mission.checkpoints.find((c) => c.stationId === b.id);
  const near = nearStation.value?.id === b.id, title = st?.company || b.name || `Booth ${b.id}`;
  const run = async (f: () => Promise<unknown>, msg: string) => { setBusy(true); try { await f(); } catch (e) { fail(e, msg); } setBusy(false); };

  return (
    <Sheet k={`Booth ${b.id} · Hall ${b.hall}`} title={title}>
      <div class="pills">
        {st && <span class={'pill ' + (st.hosted ? 'live' : 'on')}>{st.hosted ? 'At the counter now' : 'Online'}</span>}
        {st?.status === 'approved' && <span class="pill on">Verified exhibitor</span>}
        {met ? <span class="pill gold">Scanned ✓{cp ? ' · checkpoint done' : ''}</span> : stamped ? <span class="pill gold">Visited</span> : null}
      </div>
      {st?.offer && <p class="lead">{st.offer}</p>}
      {st?.link && <a class="btn" href={st.link} target="_blank" rel="noopener noreferrer nofollow">Visit their page</a>}

      {mine ? (
        <div class="stack"><button class="btn primary big" onClick={() => (modal.value = 'mybooth')}>Open my booth</button><button class="btn big" onClick={() => (modal.value = 'claim')}>Edit booth profile</button></div>
      ) : (
        <div class="stack">
          {boothAction(b) === 'stamp' && near && <button class="btn primary big" disabled={busy} onClick={() => run(() => engine()!.stamp(b), 'Could not swap cards')}>Swap card · +{POINTS.stamp + (left ? 0 : POINTS.leaveCard)}</button>}
          {cp && !cp.done && <p class="fine">{met ? 'Scanned.' : 'For the checkpoint: scan the Mission X QR on their counter.'}</p>}
          {!near && <button class="btn big" onClick={() => guideTo(b, title)}>Guide me here</button>}

          {!met && (
            <div class="box">
              <strong>At the real booth?</strong><p class="fine">Scan the Mission X QR on their counter: +{POINTS.scan} points{st ? ', and they know you really came' : ''}.</p>
              {scan ? <Camera onCode={(t) => { setScan(false); void handleScan(t); }} onFail={(msg) => { setScan(false); toast(msg, undefined, 'warn', 5000); }} /> : <button class="btn big" onClick={() => setScan(true)}>Scan booth QR</button>}
              {st && (
                <form class="inline" onSubmit={(e) => { e.preventDefault(); void run(() => api.stamp({ stationId: b.id, proof: 'host', code: digits }), 'That code did not work'); }}>
                  <input inputMode="numeric" maxLength={6} placeholder="or type the 6 digits" aria-label="6-digit booth code" value={digits} onInput={(e) => setDigits((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
                  <button class="btn" disabled={busy || digits.length !== 6}>Enter</button>
                </form>
              )}
            </div>
          )}

          {st && m.passport && (
            <div class="box">
              <strong>{left ? `You swapped cards with ${st.company}` : `Swap cards with ${st.company}?`}</strong>
              <p class="fine">{visitor ? 'They receive your card: name, company, role, phone and email. You can take it back any time from My contacts.' : 'They receive only what you tick. You can take it back any time from My contacts.'}</p>
              {!visitor && <FieldPicker value={fields} onChange={setFields} />}
              <div class="stack">
                <button class="btn primary big" disabled={busy} onClick={() => run(() => api.leaveCard(b.id, fields), 'Could not leave your card')}>{left ? 'Update what they see' : `Swap card · +${POINTS.leaveCard}`}</button>
                {left && <button class="btn big" disabled={busy} onClick={() => run(() => api.takeBackCard(b.id), 'Could not undo')}>Take it back</button>}
              </div>
            </div>
          )}
          <StationDemoHint stationId={b.id} onDigits={setDigits} />

          {!st && <button class="btn big" onClick={() => (modal.value = m.passport ? 'claim' : 'card')}>Exhibiting here? Bring this booth online</button>}
        </div>
      )}
    </Sheet>
  );
}

export function ClaimSheet() {
  // always about one booth: picked by its number when registering, or the one being edited
  const m = me.value!, sm = stationMap.value, chosen = panelStation.value;
  const existing = chosen ? sm.get(chosen.id) : undefined, mine = !!chosen && m.hosting.includes(chosen.id);
  const [f, setF] = useState({ company: existing?.company ?? m.passport?.company ?? '', offer: existing?.offer ?? '', link: existing?.link ?? '', color: existing?.color ?? 0x1e9e6a });
  const [logo, setLogo] = useState<File | null>(null), [photo, setPhoto] = useState<File | null>(null), [ref, setRef] = useState(referral.value);
  const firstBooth = m.hosting.length === 0; // an invitation counts for an exhibitor's first booth only
  const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const put = (k: 'company' | 'offer' | 'link') => (e: Event) => { const v = (e.target as HTMLInputElement).value; setF((p) => ({ ...p, [k]: v })); };
  const file = (set: (f: File | null) => void) => (e: Event) => set((e.target as HTMLInputElement).files?.[0] ?? null);
  const close = () => { modal.value = m.hosting.length ? 'mybooth' : null; };
  const submit = async (e: Event) => {
    e.preventDefault(); setErr('');
    if (!chosen) { setErr('Pick your booth number first'); return; }
    setBusy(true);
    try {
      await api.claim({ stationId: chosen.id, ...f, ref: firstBooth ? ref.trim().toUpperCase() : undefined });
      if (firstBooth) setReferral('');
      if (logo) await api.boothImage(chosen.id, 'logo', await shrink(logo, 'logo'));
      if (photo) await api.boothImage(chosen.id, 'photo', await shrink(photo, 'photo'));
      await Promise.all([refreshStations(), refreshMyBooths()]); api.track('booth_online', { id: chosen.id });
      modal.value = 'mybooth';
    } catch (x) { setErr(x instanceof ApiError || x instanceof Error ? x.message : 'Could not save'); setBusy(false); }
  };
  const where = (b: Booth) => `Booth ${b.id} · Hall ${b.hall}`;
  return (
    <Sheet k={chosen ? where(chosen) : 'Register your booth'} title={mine ? 'Booth profile' : 'Light up your booth'} onClose={close}>
      <form onSubmit={submit}>
        {!mine && <p class="lead">Your booth glows for every player with your name, logo and photo the moment you save; it becomes a checkpoint on their mission once we approve it; and everyone who scans your QR comes to you — free.</p>}
        <label>Company name on the booth<input required maxLength={80} value={f.company} onInput={put('company')} /><small class="fhint">It goes up on booth {chosen?.id ?? ''} in the game, next to the booth number, as soon as you save.</small></label>
        <label>One line for visitors<input maxLength={120} placeholder="e.g. Free samples at 3 pm" value={f.offer} onInput={put('offer')} /></label>
        <label>Website<input maxLength={200} inputMode="url" placeholder="yourcompany.com" value={f.link} onInput={put('link')} /></label>
        <label>Logo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={file(setLogo)} /><small class="fhint">On your counter and a sign over your booth in the game. PNG with a transparent background looks best.</small></label>
        {firstBooth && !mine && <label>Invited by another exhibitor? <span class="opt">optional</span><input maxLength={8} autocapitalize="characters" placeholder="Their referral code" value={ref} onInput={(e) => setRef((e.target as HTMLInputElement).value)} /><small class="fhint">{ref ? 'They get points for bringing you in — thank you.' : 'Leave empty if nobody invited you.'}</small></label>}
        <label>Photo of your booth<input type="file" accept="image/png,image/jpeg,image/webp" onChange={file(setPhoto)} /><small class="fhint">Your booth's backdrop or a photo of it: it goes on the back wall of your virtual booth.</small></label>
        {err && <p class="err" role="alert">{err}</p>}
        <button class="btn primary big" disabled={busy}>{busy ? 'Saving…' : mine ? 'Save' : 'Bring it online'}</button>
        {!mine && <p class="fine">Your logo and photo go up in the game straight away — change them any time on your dashboard. Our crew checks every booth before it becomes a checkpoint.</p>}
      </form>
    </Sheet>
  );
}

/** Registering: find your booth by the number on your fascia board. The company is what you type next — booths carry
 *  no names until their exhibitor registers. */
function BoothPicker() {
  const [q, setQ] = useState(''), lv = level.value, sm = stationMap.value;
  const T = q.trim().toUpperCase().replace(/\s+/g, '');
  const booths = useMemo(() => (!lv || !T ? [] : lv.booths.filter((b) => b.id !== lv.hero.id && b.id.startsWith(T)).slice(0, 12)), [T, lv]);
  return (
    <>
      <label>Your booth number<input autofocus maxLength={8} autocapitalize="characters" value={q} placeholder="e.g. 7C17" onInput={(e) => setQ((e.target as HTMLInputElement).value)} /><small class="fhint">The number on your fascia board, Halls 6–8.</small></label>
      <div class="results">
        {booths.map((b) => <button key={b.id} class="result" disabled={sm.has(b.id)} onClick={() => { panelStation.value = b; modal.value = 'claim'; }}><strong>Booth {b.id}</strong><small>Hall {b.hall}{sm.has(b.id) ? ` · already registered by ${sm.get(b.id)!.company}` : ''}</small></button>)}
        {T && !booths.length && <p class="fine">No booth {T} in Halls 6–8. Check the number on your fascia board.</p>}
      </div>
    </>
  );
}

export function MyBoothSheet() {
  const m = me.value!, mine = myBooths.value, [loaded, setLoaded] = useState(false), [sel, setSel] = useState<string | null>(null), [adding, setAdding] = useState(false);
  const [qr, setQr] = useState<string | null>(null), j = journey.value;
  const [team, setTeam] = useState<BoothTeamView | null>(null), [copied, setCopied] = useState(false);
  const copyTeam = async () => { if (!team?.link) return; try { await navigator.clipboard.writeText(team.link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link is on screen */ } };

  useEffect(() => { void refreshMyBooths().then(() => setLoaded(true)); }, []);
  useEffect(() => { if (!sel && mine[0]) setSel(mine[0].id); }, [mine]);
  useEffect(() => { // the fixed QR: the same one the exhibitor prints; the counts refresh while this is open
    if (!sel) return; let stop = false;
    api.fixedQr(sel).then((r) => !stop && setQr(r.url), (e) => fail(e, 'Could not load your booth QR'));
    api.team().then((t) => !stop && setTeam(t), () => setTeam(null));
    void refreshStations();
    const t = setInterval(() => void refreshMyBooths(), 20_000);
    return () => { stop = true; clearInterval(t); };
  }, [sel]);

  const s = mine.find((x) => x.id === sel);
  if (!m.passport) return <Sheet k="My booth" title="First, your card"><p class="lead">It tells visitors and our crew who is behind the booth. One minute.</p><button class="btn primary big" onClick={() => (modal.value = 'card')}>Create my card</button></Sheet>;
  return (
    <Sheet k="My booth" title={s && !adding ? s.company : 'Find your booth'} gold wide>
      {!loaded ? <p class="lead">Loading…</p> : !s || adding ? (
        <><p class="lead">Step 1 of 3 — light it up. Your booth starts glowing for every player the moment you bring it online.</p><BoothPicker />{adding && <button class="btn big" onClick={() => setAdding(false)}>Back</button>}</>
      ) : (
        <>
          {j?.kind === 'exhibitor' && <div class="dots wide" role="img" aria-label={`${j.done} of 3 steps done`}>{j.steps.map((x) => <i key={x.n} class={x.done ? 'on' : x === j.now ? 'now' : ''} />)}<span>{j.now ? `Step ${j.now.n} of 3 · ${j.now.todo}` : 'All three steps done. Keep the QR on your counter.'}</span></div>}
          {mine.length > 1 && <div class="pills">{mine.map((x) => <button key={x.id} class={'chip' + (x.id === sel ? ' on' : '')} onClick={() => setSel(x.id)}>{x.id}</button>)}</div>}
          <div class="hostgrid">
            <div class="center">
              {qr ? <Qr text={qr} label="Booth QR" /> : <div class="qr" />}
              <p class="fine">Your booth QR. It never changes: print it once from your dashboard and stand it on your counter. Visitors scan it for their checkpoint, and you get their details.</p>
            </div>
            <div>
              <div class="stats three">
                <div><span>Scanned your QR</span><strong>{s.scans}</strong></div><div><span>Visits</span><strong>{s.stamps}</strong></div><div><span>Status</span><strong class="small">{s.status === 'approved' ? 'Approved' : s.status === 'pending' ? 'Pending' : s.status}</strong></div>
              </div>
              {s.status === 'pending' && <p class="fine">Live now, logo and photo included. Our crew will confirm it is your booth; then it becomes a checkpoint on visitors' missions.</p>}
              <div class="stack">
                <a class="btn primary big" href="/booth.html" target="_blank" rel="noopener">Open my dashboard</a>
                <p class="fine">Print your QR, see everyone who scanned (name, phone, email), change your logo and booth photo, {m.teamMember ? 'see your team' : 'add your team (each on their own phone)'} — and invite other exhibitors: +10 points for each one who joins.</p>
                <button class="btn big" onClick={() => { panelStation.value = level.value?.booths.find((b) => b.id === s.id) ?? null; modal.value = 'claim'; }}>Edit booth profile</button>
                {!m.teamMember && <button class="btn big" onClick={() => setAdding(true)}>Add another booth</button>}
              </div>
            </div>
          </div>
          {team?.owner && team.link && (
            <div class="teamrow">
              <Qr text={team.link} label="Booth team QR" />
              <div>
                <strong>Your booth team{team.members.length ? ` · ${team.members.length + 1} people` : ''}</strong>
                <p class="fine">Colleagues working the booth with you: let them scan this, or send them the link. Each joins on their own phone with their own card and sees the same dashboard.</p>
                <div class="two">
                  <button class="btn" onClick={copyTeam}>{copied ? 'Link copied' : 'Copy team link'}</button>
                  <a class="btn" href={`https://wa.me/?text=${encodeURIComponent(`Join our ${team.company} booth team in Mission X (MIHAS 2026): ${team.link}`)}`} target="_blank" rel="noopener">Send on WhatsApp</a>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ swap cards */

export function SwapSheet() {
  const m = me.value!, [mode, setMode] = useState<'show' | 'scan'>(pendingLink.value ? 'scan' : 'show');
  const [code, setCode] = useState<{ c: LinkCode; until: number } | null>(null);
  const [cam, setCam] = useState(false), [typed, setTyped] = useState(''), [peek, setPeek] = useState<{ code: string; p: LinkPeek } | null>(null), [busy, setBusy] = useState(false);
  const left = useCountdown(code?.until ?? 0), swapsAtOpen = useRef(m.links);

  const fresh = () => api.swapCode().then((c) => setCode({ c, until: Date.now() + c.expiresInMs }), (e) => fail(e, 'Could not create your code'));
  useEffect(() => { if (m.passport && mode === 'show') void fresh(); }, [mode]);
  useEffect(() => { if (code && left === 0 && mode === 'show') void fresh(); }, [left]);
  useEffect(() => { // someone scanned my code: the server swapped our cards — notice it here
    if (mode !== 'show') return; const id = setInterval(() => { void api.me().catch(() => {}); }, 4000); return () => clearInterval(id);
  }, [mode]);
  useEffect(() => { if (m.links > swapsAtOpen.current) { swapsAtOpen.current = m.links; toast('Cards swapped', 'Their card is in My contacts', 'xp'); void fresh(); } }, [m.links]);

  const look = async (raw: string) => {
    const c = (raw.match(/[?&]l=([A-Za-z0-9]{8})/)?.[1] ?? raw).trim().toUpperCase();
    try {
      const p = await api.swapPeek(c);
      // a scan swaps on the spot: the whole card both ways, nothing to tick
      if (!p.alreadyLinked) { setBusy(true); await api.swap(c, m.sharePrefs); api.track('swap'); setBusy(false); modal.value = 'contacts'; return; }
      setPeek({ code: c, p });
    } catch (e) { setBusy(false); fail(e, 'That code did not work'); }
  };
  useEffect(() => { const c = pendingLink.value; if (c && m.passport) { pendingLink.value = null; void look(c); } }, []);

  if (!m.passport) return <Sheet k="Swap cards" title="You need your card first"><p class="lead">Your digital business card is what you swap. It is free, and takes a minute.</p><button class="btn primary big" onClick={() => (modal.value = 'card')}>Make my card</button></Sheet>;

  if (peek) return (
    <Sheet k="Swap cards" title={`Swap with ${peek.p.callsign}?`} onClose={() => setPeek(null)}>
      <p class="lead">{peek.p.cls ? ROLE_INFO[peek.p.cls].label : 'Player'}.</p>
      <p class="fine">You two have already swapped — find them in My contacts.</p>
    </Sheet>
  );

  return (
    <Sheet k="Swap cards" title="Met someone?" gold>
      <div class="seg"><button class={mode === 'show' ? 'on' : ''} onClick={() => setMode('show')}><strong>Show my code</strong><small>They scan you</small></button><button class={mode === 'scan' ? 'on' : ''} onClick={() => setMode('scan')}><strong>Scan theirs</strong><small>You scan them</small></button></div>
      {mode === 'show' ? (
        <div class="center">
          {code && <Qr text={code.c.url} label="My card-swap code" />}
          <div class="code small">{code?.c.code.replace(/(.{4})/, '$1 ') ?? '···· ····'}</div>
          <p class="fine">Fresh code in {left}s · works once. Whoever scans it gets your card, and you get theirs: name, company, role, phone and email.</p>
          <LinkDemoHint mode="show" onCode={() => {}} />
        </div>
      ) : (
        <div>
          {busy ? <p class="lead">Swapping cards…</p> : cam ? <Camera onCode={(t) => { setCam(false); void look(t); }} onFail={(msg) => { setCam(false); toast(msg, undefined, 'warn', 5000); }} /> : <button class="btn primary big" onClick={() => setCam(true)}>Open camera</button>}
          <form class="inline" onSubmit={(e) => { e.preventDefault(); void look(typed); }}>
            <input maxLength={9} placeholder="or type their 8 characters" aria-label="8-character code" autocapitalize="characters" autocomplete="off" value={typed} onInput={(e) => setTyped((e.target as HTMLInputElement).value.toUpperCase().replace(/\s/g, ''))} />
            <button class="btn" disabled={typed.length !== 8}>Look up</button>
          </form>
          <LinkDemoHint mode="scan" onCode={(c) => { setTyped(c); void look(c); }} />
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ my contacts */

export function ContactsSheet() {
  const [list, setList] = useState<Contact[] | null>(null);
  const load = () => api.contacts().then(setList, () => setList([]));
  useEffect(() => { void load(); }, []);
  const revoke = async (c: Contact) => { try { await (c.kind === 'station' ? api.takeBackCard(c.key.slice(2)) : api.revokeContact(c.key)); toast('Card taken back'); void load(); } catch (e) { fail(e, 'Could not undo'); } };
  return (
    <Sheet k="My contacts" title={list ? `${list.length} contact${list.length === 1 ? '' : 's'}` : 'My contacts'} wide>
      {!list ? <p class="lead">Loading…</p> : list.length === 0 ? <p class="lead">Nobody yet. <b>Swap cards</b> with people you meet, or leave your card at a booth that is online.</p> : (
        <div class="contacts">{list.map((c) => (
          <div key={c.key} class="contact">
            <div class="rowb"><strong>{c.title}{c.verified && <em> · met in person</em>}</strong><span class="pill">{c.kind === 'person' ? 'Person' : 'Booth'}</span></div>
            <span class="sub">{c.sub}</span>
            <dl class="carddl">
              {c.card.name && c.card.name !== c.title && <><dt>Name</dt><dd>{c.card.name}</dd></>}
              {c.card.company && <><dt>Company</dt><dd>{c.card.company}</dd></>}
              {c.card.role && <><dt>Role</dt><dd>{c.card.role}</dd></>}
              {c.card.phone && <><dt>Phone</dt><dd><a href={`tel:${c.card.phone}`}>{c.card.phone}</a></dd></>}
              {c.card.email && <><dt>Email</dt><dd><a href={`mailto:${c.card.email}`}>{c.card.email}</a></dd></>}
            </dl>
            <div class="pills">
              {c.card.phone && <a class="chip" href={waLink(c.card.phone)} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
              {c.card.email && <a class="chip" href={`mailto:${c.card.email}`}>Email</a>}
              {c.link && <a class="chip" href={c.link} target="_blank" rel="noopener noreferrer nofollow">Their page</a>}
              <button class="chip ghostbtn" onClick={() => revoke(c)}>Take back my card</button>
            </div>
            <textarea rows={2} maxLength={500} placeholder="Private note — follow up about…" aria-label={`Note about ${c.title}`} defaultValue={c.note} onBlur={(e) => { const t = (e.target as HTMLTextAreaElement).value; if (t !== c.note) { c.note = t; void api.note(c.key, t).catch((x) => fail(x, 'Note not saved')); } }} />
          </div>
        ))}</div>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ the menu */


export function MenuSheet() {
  const m = me.value!, go = (x: typeof modal.value) => () => (modal.value = x);
  const switchRole = async () => { const to = m.cls === 'exhibitor' ? 'visitor' : 'exhibitor'; try { await api.start(to); modal.value = to === 'exhibitor' ? (m.passport ? 'mybooth' : 'card') : null; } catch (e) { fail(e, 'Could not switch'); } };
  return (
    <Sheet k={`${m.callsign} · ${online.value} here now`} title="Menu">
      <div class="menu">
        {drop.value && !drop.value.done && <button class="wide" onClick={() => { const d = drop.value!; guideTarget.value = { x: d.x, y: d.y, label: d.label }; guideOn.value = true; modal.value = null; }}><strong>Booth of the day · +{drop.value.bonus}</strong><small>{drop.value.label} · scan its QR at the real booth today</small></button>}
        {m.cls !== 'exhibitor' && m.passport && <button onClick={go('prize')}><strong>My prize code</strong><small>{m.docked ? 'Tote bag claimed at Lean X Digital' : 'Show it at Lean X Digital, Booth 8H18A, for your tote bag'}</small></button>}
        {(m.cls === 'exhibitor' || m.hosting.length > 0) && <button onClick={go(m.passport ? 'mybooth' : 'card')}><strong>My booth</strong><small>{m.hosting.length ? m.hosting.join(', ') + ' · QR and leads' : 'Bring it online'}</small></button>}
        <button onClick={go('swap')}><strong>Swap cards</strong><small>Met someone? Exchange cards · +{POINTS.swap} each</small></button>
        <button onClick={go('contacts')}><strong>My contacts</strong><small>{m.links} people · {m.shared.length} booths</small></button>
        <button onClick={go('map')}><strong>Map</strong><small>Halls 6–8 · search · places to go</small></button>
        <button onClick={go('rules')}><strong>How to play</strong><small>The mission and the points, on one page</small></button>
        <button aria-pressed={soundOn.value} onClick={() => setSound(!soundOn.value)}><strong>Sound · {soundOn.value ? 'on' : 'off'}</strong><small>{soundOn.value ? 'Quiet chimes, and a buzz on phones that can' : 'Silent, no vibration'}</small></button>
        <button onClick={switchRole}><strong>{m.cls === 'exhibitor' ? 'Play as a visitor' : 'I am exhibiting'}</strong><small>{m.cls === 'exhibitor' ? 'Do the three-chapter mission' : 'Put your booth in the game'}</small></button>
      </div>
    </Sheet>
  );
}
