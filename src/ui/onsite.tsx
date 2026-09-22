// Where the player is playing from, and everything on screen about it: the choice on the first screen, the gate that
// holds an on-site player until GPS has found them, and the level picker.
import { level } from '../state';
import { gpsAcc, onsiteAvailable, setSiteDeck, setSiteMode, siteDeck, siteMode, siteState, startTracking } from '../onsite';
import { Sheet } from './common';

/** The first screen's question. Nothing starts until one is picked. */
export function SiteChoice() {
  if (!onsiteAvailable()) return null;
  const m = siteMode.value;
  const opt = (mode: 'onsite' | 'remote', title: string, sub: string) => (
    <button type="button" class={'site' + (m === mode ? ' on' : '')} aria-pressed={m === mode} onClick={() => { siteMode.value = mode; }}>
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
  const elsewhere = <button class="link" onClick={() => setSiteMode('remote')}>I'm not at MIHAS — play from anywhere</button>;
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
      <p class="fine">Your location stays on your phone. The game keeps only whether you are at MITEC.</p>
      {elsewhere}
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
