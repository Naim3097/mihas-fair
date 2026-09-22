// Where the player is playing from, and everything on screen about it: the choice on the first screen, the gate that
// holds an on-site player until GPS has found them, the level picker, and the one-time note when GPS is weak.
import { useEffect, useState } from 'preact/hooks';
import { level } from '../state';
import { gpsAcc, onsiteAvailable, setSiteDeck, setSiteMode, siteDeck, siteMode, siteState, siteError, startTracking } from '../onsite';
import { Sheet } from './common';
import { askMotion } from '../motion';

/** The first screen's question. Nothing starts until one is picked. */
export function SiteChoice() {
  if (!onsiteAvailable()) return null;
  const m = siteMode.value;
  const opt = (mode: 'onsite' | 'remote', title: string, sub: string) => (
    <button type="button" class={'site' + (m === mode ? ' on' : '')} aria-pressed={m === mode} onClick={() => { if (mode === 'onsite') void askMotion(); siteMode.value = mode; }}>
      <strong>{title}</strong><small>{sub}</small>
    </button>
  );
  return (
    <div class="sites" role="group" aria-label="Where are you playing?">
      {opt('onsite', 'At MIHAS now', 'Your avatar walks where you walk')}
      {opt('remote', 'Playing from elsewhere', 'Roam the expo freely')}
    </div>
  );
}

const DENIED_HELP = /iPhone|iPad/i.test(navigator.userAgent)
  ? 'On iPhone: Settings › Privacy & Security › Location Services › Safari Websites › While Using the App. Then come back and tap Try again.'
  : 'In Chrome: tap the icon left of the address bar › Permissions › Location › Allow. Then tap Try again.';

/** On site, the game does not start until GPS has placed the player. Leaving is always one tap away. */
export function OnsiteGate() {
  const st = siteState.value;
  if (siteMode.value !== 'onsite' || !['asking', 'denied', 'nofix', 'unsupported', 'level'].includes(st)) return null;
  if (st === 'level') return <LevelPicker title="Which level are you on?" note="GPS can find you in the building, but not which floor. Scanning any booth QR sets this for you too." />;
  const elsewhere = <button class="btn big" onClick={() => setSiteMode('remote')}>Play in free roam instead</button>;
  const copy = {
    asking: { title: 'Finding you in MITEC…', body: 'Allow location when your browser asks. At MIHAS your avatar follows you around the halls.' },
    denied: { title: 'Location is off', body: `At MIHAS the game follows you around the halls, so it needs your location. ${DENIED_HELP}` },
    nofix: { title: 'Looking for a GPS signal', body: `No position yet${gpsAcc.value ? ` (only good to ${gpsAcc.value} m)` : ''}. Inside the halls this can take a minute — stand near an entrance or a window and try again.` },
    unsupported: { title: 'This browser cannot share location', body: 'Open the link in Safari or Chrome to play at MIHAS.' },
  }[st as 'asking' | 'denied' | 'nofix' | 'unsupported'];
  return (
    <Sheet k="Playing at MIHAS" title={copy.title} onClose={false}>
      <p class="lead">{copy.body}</p>
      {st === 'asking' ? <div class="gps-wait" aria-hidden="true"><i /></div> : st !== 'unsupported' && <button class="btn primary big" onClick={() => void startTracking()}>Try again</button>}
      {elsewhere}
      <p class="fine">Free roam: move with the stick. Scanning booth QRs at MIHAS still counts in full. Your location stays on your phone; the game keeps only whether you are at MITEC.</p>
    </Sheet>
  );
}

function LevelPicker({ title, note, onClose }: { title: string; note: string; onClose?: () => void }) {
  const decks = [...(level.value?.decks ?? [])].sort((a, b) => a.level - b.level);
  return (
    <Sheet k="Playing at MIHAS" title={title} onClose={onClose ?? false}>
      <p class="lead">{note}</p>
      <div class="doors">
        {decks.map((d) => (
          <button key={d.level} class={'door' + (siteDeck.value === d.level ? ' on' : '')} onClick={() => { setSiteDeck(d.level); onClose?.(); }}>
            <span class="dot" /><strong>Level {d.level}</strong><small>{d.label.split(' · ')[1] ?? d.label}</small><span class="go" aria-hidden="true">›</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

const WEAK_M = 20, WEAK_FOR_MS = 15_000, DISMISS_KEY = 'mx_weakgps';
const dismissed = () => { try { return sessionStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; } };

/** On site, when the position has been poor for a while: say so once, and offer the two ways out. Dismissed for the visit. */
export function WeakGps() {
  const err = siteError(), weak = err != null && err > WEAK_M;
  const [since, setSince] = useState<number | null>(null), [shown, setShown] = useState(false), [gone, setGone] = useState(dismissed);
  useEffect(() => { if (!weak) { setSince(null); return; } if (since == null) setSince(Date.now()); }, [weak]);
  useEffect(() => { if (since == null || shown) return; const t = setTimeout(() => setShown(true), Math.max(0, since + WEAK_FOR_MS - Date.now())); return () => clearTimeout(t); }, [since, shown]);
  if (gone || !shown || siteMode.value !== 'onsite') return null;
  const close = () => { setGone(true); try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* shown again next visit */ } };
  return (
    <div class="weakgps" role="status">
      <strong>GPS is weak in here</strong>
      <small>Your avatar may be off. Tap the booth in front of you and choose “I'm standing at this booth”, or move freely with the stick.</small>
      <div class="acts"><button class="btn primary" onClick={() => { close(); setSiteMode('remote'); }}>Free roam</button><button class="btn" onClick={close}>Keep GPS</button></div>
    </div>
  );
}
