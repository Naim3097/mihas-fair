// The exhibitor's dashboard (booth.html): the booth's live QR for the counter, a printable one, the logo that goes on
// their booth in the game, and everyone who scanned their QR — name, phone and email, which visitors agree to share
// when they register at Lean X Digital. Signed in by the same player session as the game.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Qr } from './ui/common';
import { shrink } from './ui/images';
import './ui.css';
import './crew.css';
import { ensureBackend } from './demo/client';
import qrcode from 'qrcode-generator';
import type { BoothScan, BoothTeamView, HostStation, Me, ReferralView } from '../shared/types';
import { REFERRAL_POINTS } from '../shared/rules';

type Res<T> = { ok: true; data: T; me?: Me } | { ok: false; error: string; code: string };
async function call<T>(method: string, path: string, body?: unknown): Promise<{ data: T; me?: Me }> {
  const r = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = (await r.json()) as Res<T>;
  if (!j.ok) throw Object.assign(new Error(j.error), { code: j.code });
  return { data: j.data, me: j.me };
}
const q = encodeURIComponent;
/** The QR as an image to download: large enough to print crisp at A5. */
const qrPng = (url: string) => { const c = qrcode(0, 'M'); c.addData(url); c.make(); return c.createDataURL(16, 4); };
const when = (t: number) => new Date(t).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });


function Dashboard() {
  const [me, setMe] = useState<Me | null>(null), [booths, setBooths] = useState<HostStation[] | null>(null), [sel, setSel] = useState<string | null>(null), [err, setErr] = useState('');
  const load = async () => {
    try { const r = await call<HostStation[]>('GET', '/api/host/stations'); setBooths(r.data); if (r.me) setMe(r.me); setSel((s) => s ?? r.data[0]?.id ?? null); }
    catch (x) { setErr((x as Error).message); setBooths([]); }
  };
  useEffect(() => { void load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, []);

  if (booths === null) return <main class="console"><p>Loading…</p></main>;
  const b = booths.find((x) => x.id === sel);
  return (
    <main class="console">
      <header><div class="brand"><span>lean<b>.x</b>digital</span><i /><span>Exhibitor dashboard</span></div>
        {booths.length > 1 && <nav>{booths.map((x) => <button key={x.id} class={'chip' + (x.id === sel ? ' on' : '')} onClick={() => setSel(x.id)}>{x.id}</button>)}</nav>}</header>
      {err && <p class="banner bad" role="alert">{err}</p>}
      {!b ? (
        <section class="sheet wide">
          <h2>Set up your booth first</h2>
          <p class="lead">Open the game, choose <b>I'm exhibiting</b>, fill in your card and bring your booth online. Then come back here — this page shows your QR and everyone who scans it.</p>
          <a class="btn primary big" href="/">Open the game</a>
          {me && !me.passport && <p class="fine">You are signed in as {me.callsign}, without a card yet.</p>}
        </section>
      ) : <Booth b={b} onChange={load} />}
    </main>
  );
}

function Booth({ b, onChange }: { b: HostStation; onChange: () => void }) {
  const [printable, setPrintable] = useState<string | null>(null), [scans, setScans] = useState<BoothScan[]>([]);
  const [busy, setBusy] = useState<'logo' | 'photo' | null>(null), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null), [printing, setPrinting] = useState(false);
  useEffect(() => {
    let stop = false;
    const pullScans = () => { if (!document.hidden) void call<BoothScan[]>('GET', `/api/host/scans?station=${q(b.id)}`).then((r) => !stop && setScans(r.data), () => {}); };
    pullScans();
    call<{ url: string }>('GET', `/api/host/qr?station=${q(b.id)}`).then((r) => !stop && setPrintable(r.data.url), () => {});
    const c = setInterval(pullScans, 15_000);
    return () => { stop = true; clearInterval(c); };
  }, [b.id]);
  useEffect(() => { if (!printing) return; const done = () => setPrinting(false); addEventListener('afterprint', done); print(); return () => removeEventListener('afterprint', done); }, [printing]);

  const upload = (kind: 'logo' | 'photo') => async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    setBusy(kind); setMsg(null);
    const what = kind === 'logo' ? 'Logo' : 'Booth photo';
    try { await call('POST', `/api/station/${kind}`, { stationId: b.id, image: await shrink(f, kind) }); setMsg({ ok: true, text: b.status === 'approved' ? `${what} saved — it is on your booth in the game now.` : `${what} saved. It appears on your booth in the game once Lean X Digital approves your booth.` }); onChange(); }
    catch (x) { setMsg({ ok: false, text: (x as Error).message }); }
    finally { setBusy(null); (e.target as HTMLInputElement).value = ''; }
  };
  const cps = scans.filter((s) => s.checkpoint).length;

  if (printing && printable) return <div class="printqr"><div class="k">Mission X · MIHAS 2026</div><h1>{b.company}</h1><p>Booth {b.id}</p><Qr text={printable} label="Booth QR" /><p class="big">Scan me for your checkpoint</p></div>;
  return (
    <>
      <section class={'sheet wide status ' + b.status}>
        <div class="row"><h2>{b.company} <small>Booth {b.id}</small></h2><span class={'badge ' + b.status}>{b.status === 'approved' ? 'Approved · you are a checkpoint' : b.status === 'pending' ? 'Waiting for approval' : b.status}</span></div>
        {b.status !== 'approved' && <p class="fine">Lean X Digital checks every booth before it becomes a checkpoint in the game. Visitors can already scan your QR, and you will see them below.</p>}
      </section>

      <div class="dash">
        <section class="sheet">
          <h2>Your booth QR</h2>
          <div class="center">{printable ? <Qr text={printable} label="Booth QR" /> : <div class="qr" />}</div>
          <p class="fine">This QR is yours for the whole show and never changes. Print it, or download it for your own artwork, and put it on your counter where visitors can scan it.</p>
          <div class="stack">
            <button class="btn primary big" disabled={!printable} onClick={() => setPrinting(true)}>Print my QR</button>
            <a class={'btn big' + (printable ? '' : ' disabled')} href={printable ? qrPng(printable) : undefined} download={`mission-x-qr-${b.id}.gif`}>Download QR image</a>
          </div>
        </section>

        <section class="sheet">
          <h2>Your booth in the game</h2>
          <div class="pics">
            <div><div class="logo-box">{b.logo ? <img src={b.logo} alt={`${b.company} logo`} /> : <span>No logo yet</span>}</div>
              <label class="btn big file">{busy === 'logo' ? 'Uploading…' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!busy} onChange={upload('logo')} /></label>
              <p class="fine">On your counter and a sign over your booth. PNG with a transparent background looks best.</p></div>
            <div><div class="logo-box photo">{b.photo ? <img src={b.photo} alt={`${b.company} booth`} /> : <span>No booth photo yet</span>}</div>
              <label class="btn big file">{busy === 'photo' ? 'Uploading…' : 'Upload booth photo'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={!!busy} onChange={upload('photo')} /></label>
              <p class="fine">Your backdrop or a photo of your booth, on the back wall of your virtual booth.</p></div>
          </div>
          {b.status !== 'approved' && <p class="fine">Shown in the game once your booth is approved.</p>}
          {msg && <p class={'banner ' + (msg.ok ? 'ok' : 'bad')} role="status">{msg.text}</p>}
        </section>
      </div>

      <Team />
      <Invite />

      <section class="sheet wide">
        <div class="row"><h2>Visitors who scanned your QR ({scans.length})</h2><a class="btn" href={`/api/host/scans.csv?station=${q(b.id)}`}>Download CSV</a></div>
        <p class="fine">{cps} of them had your booth as a checkpoint. Visitors agree to share their name, phone and email with you when they register at Lean X Digital.</p>
        {scans.length === 0 ? <p class="lead">No scans yet. Put your QR where visitors can see it.</p> : (
          <ul class="visitors">{scans.map((s) => (
            <li key={s.at + s.email}>
              <div class="who"><strong>{s.name}</strong>{s.company && <span>{s.company}</span>}</div>
              <div class="how"><a href={`tel:${s.phone}`}>{s.phone}</a><a href={`mailto:${s.email}`}>{s.email}</a></div>
              <div class="when"><span>{when(s.at)}</span>{s.checkpoint && <span class="badge approved">Checkpoint</span>}</div>
            </li>
          ))}</ul>
        )}
      </section>
    </>
  );
}

/** The booth team: the owner shares a link (or its QR) with colleagues, sees who joined, removes people; a member
 *  sees whose booth this is and can leave. Everyone on the team sees this same dashboard. */
function Team() {
  const [t, setT] = useState<TeamState>(null), [err, setErr] = useState(''), [copied, setCopied] = useState(false);
  const load = () => call<BoothTeamView>('GET', '/api/host/team').then((r) => setT(r.data), () => setT(null));
  useEffect(() => { void load(); }, []);
  if (!t) return null;
  const act = async (path: string, body?: unknown, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return; setErr('');
    try { const r = await call<BoothTeamView | null>('POST', path, body ?? {}); if (r.data) setT(r.data); else location.href = '/'; } catch (x) { setErr((x as Error).message); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(t.link!); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link is on screen */ } };
  return (
    <section class="sheet wide team-card">
      <div class="row"><h2>Your booth team</h2><span class="points">{t.members.length + 1} <small>{t.members.length ? 'people' : 'person'}</small></span></div>
      {t.owner ? (
        <>
          <p class="fine">Working the booth with colleagues? Send them this link, or let them scan the QR: each joins on their own phone and sees this same dashboard — your QR, your visitors, your logo and photo. Only you add booths or change the team.</p>
          <div class="teamlink">
            <Qr text={t.link!} label="Team invitation QR" />
            <div>
              <div class="reflink"><code>{t.link}</code></div>
              <div class="stack two">
                <button class="btn primary big" onClick={copy}>{copied ? 'Link copied' : 'Copy team link'}</button>
                <a class="btn big" href={`https://wa.me/?text=${encodeURIComponent(`Join our ${t.company} booth team in Mission X (MIHAS 2026): ${t.link}`)}`} target="_blank" rel="noopener">Send on WhatsApp</a>
              </div>
            </div>
          </div>
        </>
      ) : <p class="fine">You are on the <b>{t.company}</b> team{t.ownerName ? `, registered by ${t.ownerName}` : ''}. Adding booths and changing the team is up to them.</p>}
      {err && <p class="banner bad" role="alert">{err}</p>}
      <ul class="joined">
        <li><strong>{t.ownerName || 'Owner'}</strong><span>registered the booth</span><span class="badge approved">Owner</span></li>
        {t.members.map((m) => (
          <li key={m.key}><strong>{m.name}</strong><span>{m.phone} · {m.email}</span>
            {t.owner && <button class="chip" onClick={() => act('/api/host/team/remove', { key: m.key }, `Remove ${m.name} from the team? They lose access to this booth.`)}>Remove</button>}</li>
        ))}
      </ul>
      {t.owner
        ? <button class="link" onClick={() => act('/api/host/team/reset', undefined, 'Make a new team link? The old one stops working; people already on the team stay.')}>Make a new link (the old one stops working)</button>
        : <button class="link" onClick={() => act('/api/host/team/leave', undefined, `Leave the ${t.company} team? You lose access to this booth.`)}>Leave this team</button>}
    </section>
  );
}
type TeamState = BoothTeamView | null;

/** Invite other exhibitors: a link and a code, and the points they have earned. */
function Invite() {
  const [v, setV] = useState<ReferralView | null>(null), [copied, setCopied] = useState(false);
  useEffect(() => { call<ReferralView>('GET', '/api/host/referrals').then((r) => setV(r.data), () => {}); }, []);
  if (!v) return null;
  const text = `Put your MIHAS 2026 booth in Mission X — visitors scan your QR and you get their details, free. Register here: ${v.url}`;
  const copy = async () => { try { await navigator.clipboard.writeText(v.url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* the link is on screen to copy by hand */ } };
  const approved = v.joined.filter((j) => j.approved).length;
  return (
    <section class="sheet wide invite-card">
      <div class="row"><h2>Invite other exhibitors</h2><span class="points">{v.points} <small>points</small></span></div>
      <p class="fine">Every exhibitor who joins with your link or code earns you <b>{REFERRAL_POINTS} points</b> once Lean X Digital approves their booth. The exhibitors with the most points win a special prize from us.</p>
      <div class="reflink"><code>{v.url}</code><span>Code <b>{v.code}</b></span></div>
      <div class="stack two">
        <button class="btn primary big" onClick={copy}>{copied ? 'Link copied' : 'Copy my link'}</button>
        <a class="btn big" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener">Share on WhatsApp</a>
      </div>
      {v.joined.length > 0 && (
        <ul class="joined">{v.joined.map((j) => <li key={j.booth}><strong>{j.company}</strong><span>Booth {j.booth}</span><span class={'badge ' + (j.approved ? 'approved' : '')}>{j.approved ? `+${REFERRAL_POINTS}` : 'Waiting for approval'}</span></li>)}</ul>
      )}
      {v.joined.length > 0 && <p class="fine">{approved} approved · {v.joined.length - approved} waiting.</p>}
    </section>
  );
}

void ensureBackend().catch(() => 'live').then(() => render(<Dashboard />, document.getElementById('booth')!));
