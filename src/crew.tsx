// Crew console for booth staff: scan prize codes, see leads, check booths, print booth QRs.
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { Camera, Qr } from './ui/common';
import { OpsTab, ReviewTab } from './crew-ops';
import qrcode from 'qrcode-generator';
import './ui.css';
import './crew.css';
import './demo/demo.css';
import { demo, demoState, ensureBackend } from './demo/client';
import type { CrewRegisterInput, CrewStationRow, CrewTicketView, HandoffRow, ReferralRow } from '../shared/types';

type Res<T> = { ok: true; data: T } | { ok: false; error: string; code: string };
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = (await r.json()) as Res<T>;
  if (!j.ok) throw Object.assign(new Error(j.error), { code: j.code });
  return j.data;
}

/** Accepts a raw token, a 6-character code, or the full URL inside the QR. */
function extractTicket(raw: string): string {
  const s = raw.trim();
  try { const t = new URL(s).searchParams.get('t'); if (t) return t; } catch { /* not a URL */ }
  return s;
}

function Crew() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'scan' | 'register' | 'leads' | 'stations' | 'review' | 'ops' | 'beacons' | 'referrals'>('scan');
  useEffect(() => { call('GET', '/api/crew/check').then(() => setAuthed(true), () => setAuthed(false)); }, []);
  if (authed === null) return <main class="console"><p>Loading…</p></main>;
  if (!authed) return <Login onDone={() => setAuthed(true)} />;
  return (
    <main class="console">
      <header><div class="brand"><span>lean<b>.x</b>digital</span><i /><span>Crew console</span></div>
        <nav>{([['scan', 'Scan'], ['register', 'Register'], ['leads', 'Leads'], ['stations', 'Booths'], ['review', 'Review'], ['ops', 'Live'], ['beacons', 'Booth QRs'], ['referrals', 'Referrals']] as const).map(([t, label]) => <button key={t} class={'chip' + (tab === t ? ' on' : '')} onClick={() => setTab(t)}>{label}</button>)}
          <button class="chip ghost" onClick={() => call('POST', '/api/crew/logout').finally(() => setAuthed(false))}>Sign out</button></nav></header>
      {demo.value && <p class="demobar"><b>Demo mode.</b> This console talks to the demo world inside this browser — the same one the game tab is playing in. Leads, stations and the accounts under review belong to a simulated cast; your own demo player is in there too.</p>}
      {tab === 'scan' && <Scan />}{tab === 'register' && <Register />}{tab === 'leads' && <Leads />}{tab === 'stations' && <StationsTab />}{tab === 'review' && <ReviewTab />}{tab === 'ops' && <OpsTab />}{tab === 'beacons' && <Beacons />}{tab === 'referrals' && <Referrals />}
    </main>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState(''), [err, setErr] = useState('');
  const go = async (e: Event) => { e.preventDefault(); try { await call('POST', '/api/crew/login', { pin }); onDone(); } catch (x) { setErr((x as Error).message); } };
  return (
    <main class="console center"><form class="sheet" onSubmit={go}>
      <div class="k">Mission X</div><h2>Crew sign-in</h2>
      <label>Crew PIN<input type="password" inputMode="numeric" autocomplete="off" value={pin} onInput={(e) => setPin((e.target as HTMLInputElement).value)} /></label>
      {err && <p class="err" role="alert">{err}</p>}
      <button class="btn primary big">Sign in</button>
      {demo.value && <p class="fine">Demo mode · the crew PIN is <b>{demoState.value?.crewPin}</b>. On the real deployment it is the CREW_PIN you set in Vercel.</p>}
    </form></main>
  );
}

function Scan() {
  const [ticket, setTicket] = useState<{ t: string; view: CrewTicketView } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [manual, setManual] = useState(''), [camOn, setCamOn] = useState(false);

  const lookup = async (raw: string) => {
    const t = extractTicket(raw); if (!t) return;
    setMsg(null);
    try { setTicket({ t, view: await call<CrewTicketView>('GET', `/api/crew/ticket?t=${encodeURIComponent(t)}`) }); setCamOn(false); }
    catch (x) { setTicket(null); setMsg({ tone: 'bad', text: (x as Error).message }); }
  };
  const dock = async () => {
    if (!ticket) return;
    try { const v = await call<CrewTicketView>('POST', '/api/crew/dock', { t: ticket.t }); setMsg({ tone: 'ok', text: `${v.name} claimed · +500 points sent · hand over the gift` }); setTicket(null); setManual(''); }
    catch (x) { setMsg({ tone: 'bad', text: (x as Error).message }); }
  };
  // Scanned with the phone's own camera → lands here with ?t=
  useEffect(() => { const t = new URLSearchParams(location.search).get('t'); if (t) { history.replaceState(null, '', location.pathname); void lookup(t); } }, []);

  return (
    <section>
      {msg && <p class={'banner ' + msg.tone} role="status">{msg.text}</p>}
      {ticket ? (
        <div class="sheet wide">
          <div class="k gold">Prize code</div><h2>{ticket.view.name}</h2>
          <p class="lead">{[ticket.view.role, ticket.view.company].filter(Boolean).join(' · ')}<br /><small>{ticket.view.callsign}</small></p>
          {ticket.view.checkpoints && <p class={'banner ' + (ticket.view.checkpoints.started && ticket.view.checkpoints.target > 0 && ticket.view.checkpoints.done >= ticket.view.checkpoints.target ? 'ok' : 'bad')}>{!ticket.view.checkpoints.started ? 'Has not started the mission (never scanned the Lean X QR)' : `Checkpoints: ${ticket.view.checkpoints.done} of ${ticket.view.checkpoints.target}`}</p>}
          {ticket.view.alreadyDocked ? <p class="banner bad">Already claimed — do not hand out a second gift.</p> : <button class="btn primary big" onClick={dock}>Confirm · +500 points and the gift</button>}
          <button class="btn big" style={{ marginTop: '8px' }} onClick={() => setTicket(null)}>Back</button>
        </div>
      ) : (
        <div class="sheet wide">
          <h2>Scan a prize code</h2>
          {camOn ? <Camera onCode={lookup} onFail={(m) => { setCamOn(false); setMsg({ tone: 'bad', text: m }); }} /> : <button class="btn primary big" onClick={() => setCamOn(true)}>Open camera</button>}
          <form class="manual" onSubmit={(e) => { e.preventDefault(); void lookup(manual); }}>
            <label>…or type the 6-character code<input value={manual} maxLength={6} autocapitalize="characters" autocomplete="off" onInput={(e) => setManual((e.target as HTMLInputElement).value.toUpperCase())} /></label>
            <button class="btn">Look up</button>
          </form>
        </div>
      )}
    </section>
  );
}

/** The second way in for exhibitors: the crew registers them at the counter — card and booth in one go, approved — and
 *  hands them a link (or its QR). Opened on their phone, that account becomes theirs. */
function Register() {
  const blank: CrewRegisterInput = { stationId: '', company: '', name: '', role: '', phone: '', email: '', offer: '', link: '', consent: false };
  const [f, setF] = useState(blank), [booths, setBooths] = useState<{ id: string; name: string }[]>([]), [rows, setRows] = useState<HandoffRow[] | null>(null);
  const [done, setDone] = useState<HandoffRow | null>(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [show, setShow] = useState<string | null>(null);
  const load = () => call<HandoffRow[]>('GET', '/api/crew/registered').then(setRows, () => setRows([]));
  useEffect(() => { void load(); call<{ id: string; name: string }[]>('GET', '/api/crew/beacons').then(setBooths, () => {}); }, []);
  const set = (k: keyof CrewRegisterInput) => (e: Event) => { const t = e.target as HTMLInputElement; const v = t.type === 'checkbox' ? t.checked : t.value; setF((p) => ({ ...p, [k]: v })); };
  const T = f.stationId.trim().toUpperCase().replace(/\s+/g, ''), hits = T && !booths.some((b) => b.id === T) ? booths.filter((b) => b.id.startsWith(T)).slice(0, 8) : [];
  const submit = async (e: Event) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await call<HandoffRow>('POST', '/api/crew/register', { ...f, stationId: T }); setDone(r); setShow(r.stationId); setF(blank); await load(); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  };
  const wa = (r: HandoffRow) => `https://wa.me/${r.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${r.name}, your ${r.company} booth (${r.stationId}) is set up in Mission X for MIHAS 2026.\n\nOpen this link on your phone to take it over — your booth QR, your visitors and your dashboard are inside: ${r.url}\n\nColleagues working the booth? Send them this one; each joins on their own phone and sees the same dashboard: ${r.teamUrl}`)}`;
  return (
    <section>
      {done && (
        <div class="sheet wide">
          <p class="banner ok" role="status">{done.company} · Booth {done.stationId} is online and approved, with a card for {done.name}. Hand them the link:</p>
          <HandoffCard r={done} wa={wa(done)} />
          <button class="btn big" style={{ marginTop: '8px' }} onClick={() => setDone(null)}>Register another</button>
        </div>
      )}
      <form class="sheet wide" onSubmit={submit}>
        <h2>Register an exhibitor</h2>
        <p class="fine">For exhibitors who come to the counter rather than signing up in the game themselves. Fill in their booth and details; they get a link that makes the account theirs on their own phone. The booth is approved as you save it — you have them in front of you.</p>
        <div class="frow">
          <label>Booth number<input required maxLength={8} autocapitalize="characters" placeholder="e.g. 7C17" value={f.stationId} onInput={set('stationId')} />
            {hits.length > 0 && <div class="hits">{hits.map((b) => <button type="button" key={b.id} class="chip" onClick={() => setF((p) => ({ ...p, stationId: b.id }))}>{b.id}</button>)}</div>}</label>
          <label>Company name on the booth<input required maxLength={80} value={f.company} onInput={set('company')} /></label>
        </div>
        <div class="frow">
          <label>Contact person<input required maxLength={80} autocomplete="off" value={f.name} onInput={set('name')} /></label>
          <label>Their role <span class="opt">optional</span><input maxLength={80} autocomplete="off" value={f.role} onInput={set('role')} /></label>
        </div>
        <div class="frow">
          <label>WhatsApp / phone<input required type="tel" inputMode="tel" autocomplete="off" placeholder="+60…" value={f.phone} onInput={set('phone')} /></label>
          <label>Email<input required type="email" autocomplete="off" value={f.email} onInput={set('email')} /></label>
        </div>
        <div class="frow">
          <label>One line for visitors <span class="opt">optional</span><input maxLength={120} placeholder="e.g. Free samples at 3 pm" value={f.offer} onInput={set('offer')} /></label>
          <label>Website <span class="opt">optional</span><input maxLength={200} inputMode="url" placeholder="company.com" value={f.link} onInput={set('link')} /></label>
        </div>
        <label class="check"><input type="checkbox" checked={f.consent} onChange={set('consent')} /><span>The exhibitor has read the <a href="/privacy.html" target="_blank" rel="noopener">Privacy Notice</a> and agrees to Lean X Digital processing these details to run Mission X.</span></label>
        {err && <p class="banner bad" role="alert">{err}</p>}
        <button class="btn primary big" disabled={busy}>{busy ? 'Saving…' : 'Register and make their link'}</button>
      </form>
      <div class="sheet wide">
        <div class="row"><h2>Registered at the counter {rows ? `(${rows.length})` : ''}</h2><button class="btn" onClick={load}>Refresh</button></div>
        <p class="fine">“Taken” = the exhibitor has opened their link. A link works for 30 days; register the booth again after a Release to make a new one.</p>
        {rows && rows.length === 0 && <p class="lead">Nobody yet.</p>}
        {!!rows?.length && (
          <div class="scroll"><table><thead><tr><th>Booth</th><th>Company</th><th>Contact</th><th>Status</th><th>Link</th><th></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.stationId}><td>{r.stationId}</td><td>{r.company || <small>released</small>}</td><td>{r.name}<br /><small>{r.phone} · {r.email}</small></td><td>{r.status}</td><td>{r.taken ? <span class="badge approved">Taken</span> : <small>not yet opened</small>}</td>
                <td class="acts">{r.status !== 'released' && <button class="chip" onClick={() => setShow(show === r.stationId ? null : r.stationId)}>{show === r.stationId ? 'Hide link' : 'Show link'}</button>}</td></tr>
            ))}</tbody></table></div>
        )}
        {rows?.filter((r) => r.stationId === show && r.status !== 'released').map((r) => <HandoffCard key={r.code} r={r} wa={wa(r)} />)}
      </div>
    </section>
  );
}
/** Two links for the counter: the account for the person registered, and the booth team for their colleagues. */
function HandoffCard({ r, wa }: { r: HandoffRow; wa: string }) {
  const [copied, setCopied] = useState<'join' | 'team' | null>(null);
  const copy = (which: 'join' | 'team') => async () => { try { await navigator.clipboard.writeText(which === 'join' ? r.url : r.teamUrl); setCopied(which); setTimeout(() => setCopied(null), 2000); } catch { /* the link is on screen */ } };
  return (
    <>
      <div class="teamlink">
        <Qr text={r.url} label={`Hand-over QR for booth ${r.stationId}`} />
        <div>
          <p class="fine" style={{ margin: '0 0 6px' }}><b>Their account</b> · {r.company} · Booth {r.stationId} · {r.name}. Let them scan this QR with their phone camera, or send the link. It makes the account theirs.</p>
          <div class="reflink"><code>{r.url}</code></div>
          <div class="stack two"><button type="button" class="btn primary big" onClick={copy('join')}>{copied === 'join' ? 'Link copied' : 'Copy their link'}</button><a class="btn big" href={wa} target="_blank" rel="noopener">Send both on WhatsApp</a></div>
        </div>
      </div>
      <div class="teamlink">
        <Qr text={r.teamUrl} label={`Booth team QR for ${r.company}`} />
        <div>
          <p class="fine" style={{ margin: '0 0 6px' }}><b>Their booth team</b> · for colleagues working the {r.company} booth. Each opens it on their own phone, fills in their own card, and sees the same dashboard. Up to 20 people; only {r.name} can change the team.</p>
          <div class="reflink"><code>{r.teamUrl}</code></div>
          <div class="stack two"><button type="button" class="btn big" onClick={copy('team')}>{copied === 'team' ? 'Link copied' : 'Copy team link'}</button></div>
        </div>
      </div>
    </>
  );
}

type Lead = Record<string, string | number | null>;
function Leads() {
  const [rows, setRows] = useState<Lead[] | null>(null);
  useEffect(() => { call<Lead[]>('GET', '/api/crew/leads').then(setRows, () => setRows([])); }, []);
  return (
    <section class="sheet wide">
      <div class="row"><h2>Leads {rows ? `(${rows.length})` : ''}</h2><a class="btn" href="/api/crew/leads.csv">Export CSV</a></div>
      <p class="fine">Marketing = the person ticked the optional marketing box. Only contact those marked “yes” for promotion.</p>
      <div class="scroll"><table><thead><tr><th>Name</th><th>Company</th><th>Role</th><th>Phone</th><th>Email</th><th>Marketing</th><th>Role</th><th>Points</th><th>Swaps</th><th>Came to booth</th></tr></thead>
        <tbody>{(rows ?? []).map((r) => <tr key={String(r.callsign)}><td>{r.name}</td><td>{r.company}</td><td>{r.role}</td><td>{r.phone}</td><td>{r.email}</td><td>{r.consent_marketing ? 'yes' : 'no'}</td><td>{r.cls}</td><td>{r.xp}</td><td>{r.links}</td><td>{r.docked_at ? '✓' : ''}</td></tr>)}</tbody></table></div>
    </section>
  );
}

/** Anyone with a card can bring a booth online, so the crew checks them. */
function StationsTab() {
  const [rows, setRows] = useState<CrewStationRow[] | null>(null), [err, setErr] = useState('');
  const load = () => call<CrewStationRow[]>('GET', '/api/crew/stations').then(setRows, () => setRows([]));
  useEffect(() => { void load(); }, []);
  const set = async (stationId: string, status: string) => { setErr(''); try { await call('POST', '/api/crew/stations/status', { stationId, status }); await load(); } catch (x) { setErr((x as Error).message); } };
  return (
    <section class="sheet wide">
      <div class="row"><h2>Booths online {rows ? `(${rows.length})` : ''}</h2><button class="btn" onClick={load}>Refresh</button></div>
      <p class="fine">Approve = “verified exhibitor” badge. Revoke = the booth goes dark and that person cannot take it again. Release = remove them so the real exhibitor can bring the booth online; their logo, photo and the visitors who scanned or left a card are cleared, so the next owner starts clean.</p>
      {err && <p class="banner bad">{err}</p>}
      <div class="scroll"><table><thead><tr><th>Booth</th><th>Logo</th><th>Name shown</th><th>Brought online by</th><th>Their company</th><th>Status</th><th>Visits</th><th></th></tr></thead>
        <tbody>{(rows ?? []).map((r) => (
          <tr key={r.id}><td>{r.id}</td><td>{r.logo ? <img class="thumb" src={r.logo} alt={`${r.company} logo`} /> : <small>none</small>}</td><td>{r.company}</td><td>{r.ownerName} <small>{r.ownerCallsign}</small></td><td>{r.ownerCompany}</td><td>{r.status}{r.hosted ? ' · at the counter' : ''}</td><td>{r.visits}</td>
            <td class="acts">{r.status !== 'approved' && <button class="chip" onClick={() => set(r.id, 'approved')}>Approve</button>}{r.status !== 'revoked' && <button class="chip" onClick={() => set(r.id, 'revoked')}>Revoke</button>}<button class="chip" onClick={() => set(r.id, 'release')}>Release</button></td></tr>
        ))}</tbody></table></div>
    </section>
  );
}

interface Beacon { id: string; name: string; url: string }
function Beacons() {
  const [all, setAll] = useState<Beacon[]>([]), [q, setQ] = useState('');
  useEffect(() => { call<Beacon[]>('GET', '/api/crew/beacons').then(setAll, () => {}); }, []);
  const hit = q.trim().toUpperCase(), list = hit ? all.filter((b) => b.id.includes(hit) || b.name.toUpperCase().includes(hit)).slice(0, 24) : [];
  return (
    <section class="sheet wide">
      <div class="row"><h2>Printed booth QRs</h2><button class="btn" onClick={() => print()}>Print</button></div>
      <p class="fine no-print"><b>The mission's start QR</b> is the one for Lean X Digital's own booth: search <b>8H18A</b> and print it for the counter. For exhibitors who will not keep a screen open: search a booth, print, and hand them the card for their counter. Each QR is signed for its booth. Scanned at MIHAS it scores +50; anywhere else, +10.</p>
      <label class="no-print">Find booth<input value={q} placeholder="e.g. 7C17 or Mamee" onInput={(e) => setQ((e.target as HTMLInputElement).value)} /></label>
      <div class="beacons">{list.map((b) => <BeaconCard key={b.id} b={b} />)}</div>
    </section>
  );
}
function BeaconCard({ b }: { b: Beacon }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const c = qrcode(0, 'M'); c.addData(b.url); c.make(); if (ref.current) ref.current.innerHTML = c.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); }, [b.url]);
  return <div class="beacon"><div class="k">Mission X · Find the X</div><h3>{b.name || 'Booth'} <small>{b.id}</small></h3><div class="qr" ref={ref} /><p>Scan for +50 points</p></div>;
}

/** Exhibitors who brought in other exhibitors: the ranking for the special prize. Points count approved booths only. */
function Referrals() {
  const [rows, setRows] = useState<ReferralRow[] | null>(null), [err, setErr] = useState('');
  const load = () => call<ReferralRow[]>('GET', '/api/crew/referrals').then(setRows, (x) => setErr((x as Error).message));
  useEffect(() => { void load(); }, []);
  return (
    <section class="sheet wide">
      <div class="row"><h2>Referrals</h2><button class="btn" onClick={load}>Refresh</button></div>
      <p class="fine">Exhibitors earn 10 points for each exhibitor who registers with their link or code, once you approve that booth in <b>Booths</b>. “Waiting” are referred booths you have not approved yet.</p>
      {err && <p class="banner bad">{err}</p>}
      {rows && rows.length === 0 && <p class="lead">No referrals yet.</p>}
      {!!rows?.length && (
        <div class="scroll"><table><thead><tr><th>#</th><th>Exhibitor</th><th>Booths</th><th>Contact</th><th>Approved</th><th>Waiting</th><th>Points</th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={r.email}><td>{i + 1}</td><td>{r.name}<br /><small>{r.company}</small></td><td>{r.booths}</td><td><a href={`tel:${r.phone}`}>{r.phone}</a><br /><a href={`mailto:${r.email}`}>{r.email}</a></td><td>{r.approved}</td><td>{r.pending}</td><td><b>{r.points}</b></td></tr>)}</tbody></table></div>
      )}
    </section>
  );
}

// real backend, or the in-browser demo when none is configured — decided before the first request
void ensureBackend().catch(() => 'live').then(() => render(<Crew />, document.getElementById('crew')!));
