// The exhibitor's dashboard (booth.html): the booth's live QR for the counter, a printable one, the logo that goes on
// their booth in the game, and everyone who scanned their QR — name, phone and email, which visitors agree to share
// when they register at Lean X Digital. Signed in by the same player session as the game.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Qr } from './ui/common';
import './ui.css';
import './crew.css';
import { ensureBackend } from './demo/client';
import type { BoothScan, HostCode, HostStation, Me } from '../shared/types';

type Res<T> = { ok: true; data: T; me?: Me } | { ok: false; error: string; code: string };
async function call<T>(method: string, path: string, body?: unknown): Promise<{ data: T; me?: Me }> {
  const r = await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = (await r.json()) as Res<T>;
  if (!j.ok) throw Object.assign(new Error(j.error), { code: j.code });
  return { data: j.data, me: j.me };
}
const q = encodeURIComponent;
const when = (t: number) => new Date(t).toLocaleString('en-MY', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** A logo as a PNG or WebP data URL no bigger than 512 px a side, so it uploads fast and draws crisp in the game. */
async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('That file is not an image we can read')); i.src = url; });
    const k = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const png = c.toDataURL('image/png');
    return png.length < 450_000 ? png : c.toDataURL('image/webp', 0.88);
  } finally { URL.revokeObjectURL(url); }
}

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
  const [code, setCode] = useState<HostCode | null>(null), [printable, setPrintable] = useState<string | null>(null), [scans, setScans] = useState<BoothScan[]>([]);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null), [printing, setPrinting] = useState(false);
  useEffect(() => {
    let stop = false;
    const pullCode = () => call<HostCode>('GET', `/api/host/code?station=${q(b.id)}`).then((r) => !stop && setCode(r.data), () => {});
    const pullScans = () => call<BoothScan[]>('GET', `/api/host/scans?station=${q(b.id)}`).then((r) => !stop && setScans(r.data), () => {});
    void pullCode(); void pullScans();
    call<{ url: string }>('GET', `/api/host/qr?station=${q(b.id)}`).then((r) => !stop && setPrintable(r.data.url), () => {});
    const a = setInterval(pullCode, 10_000), c = setInterval(pullScans, 15_000); // asking for the live code also tells the game someone is at the counter
    return () => { stop = true; clearInterval(a); clearInterval(c); };
  }, [b.id]);
  useEffect(() => { if (!printing) return; const done = () => setPrinting(false); addEventListener('afterprint', done); print(); return () => removeEventListener('afterprint', done); }, [printing]);

  const upload = async (e: Event) => {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    setBusy(true); setMsg(null);
    try { await call('POST', '/api/station/logo', { stationId: b.id, image: await shrink(f) }); setMsg({ ok: true, text: b.status === 'approved' ? 'Logo saved — it is on your booth in the game now.' : 'Logo saved. It appears on your booth in the game once Lean X Digital approves your booth.' }); onChange(); }
    catch (x) { setMsg({ ok: false, text: (x as Error).message }); }
    finally { setBusy(false); (e.target as HTMLInputElement).value = ''; }
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
          <div class="center">{code ? <Qr text={code.url} label="Live booth QR" /> : <div class="qr" />}<div class="code">{code ? code.digits.replace(/(\d{3})/, '$1 ') : '··· ···'}</div></div>
          <p class="fine">Keep this page open on a tablet or phone at your counter: the QR changes every 30 seconds, so it only works for people who are really here. No screen? Print the fixed QR instead.</p>
          <button class="btn big" disabled={!printable} onClick={() => setPrinting(true)}>Print a QR for my counter</button>
        </section>

        <section class="sheet">
          <h2>Your logo in the game</h2>
          <div class="logo-box">{b.logo ? <img src={b.logo} alt={`${b.company} logo`} /> : <span>No logo yet</span>}</div>
          <p class="fine">It goes on your counter and on a sign above your booth in the game, like the Lean X Digital booth{b.status === 'approved' ? '' : ', once your booth is approved'}. A PNG with a transparent background looks best.</p>
          <label class="btn big file">{busy ? 'Uploading…' : 'Upload logo'}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={upload} /></label>
          {msg && <p class={'banner ' + (msg.ok ? 'ok' : 'bad')} role="status">{msg.text}</p>}
        </section>
      </div>

      <section class="sheet wide">
        <div class="row"><h2>Visitors who scanned your QR ({scans.length})</h2><a class="btn" href={`/api/host/scans.csv?station=${q(b.id)}`}>Download CSV</a></div>
        <p class="fine">{cps} of them had your booth as a checkpoint. Visitors agree to share their name, phone and email with you when they register at Lean X Digital.</p>
        {scans.length === 0 ? <p class="lead">No scans yet. Put your QR where visitors can see it.</p> : (
          <div class="scroll"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Company</th><th>Scanned</th><th></th></tr></thead>
            <tbody>{scans.map((s) => <tr key={s.at + s.email}><td>{s.name}</td><td><a href={`tel:${s.phone}`}>{s.phone}</a></td><td><a href={`mailto:${s.email}`}>{s.email}</a></td><td>{s.company}</td><td>{when(s.at)}</td><td>{s.checkpoint && <span class="badge approved">Checkpoint</span>}</td></tr>)}</tbody></table></div>
        )}
      </section>
    </>
  );
}

void ensureBackend().catch(() => 'live').then(() => render(<Dashboard />, document.getElementById('booth')!));
