import { api, ApiError } from './net/api';
import { parseScan } from './ui/common';
import { level, modal, panelStation, pendingLink, stationMap, toast, me } from './state';

/**
 * One entry point for every QR the game prints — booth QRs (live or printed) and card-swap codes —
 * whether it came from the in-game scanner or from the URL the phone's camera opened.
 */
export async function handleScan(text: string): Promise<boolean> {
  const s = parseScan(text);
  if (!s) { toast('Not a Mission X code', undefined, 'warn'); return false; }
  try {
    if (s.kind === 'link') { pendingLink.value = s.code; modal.value = 'swap'; return true; }
    if (s.kind === 'host') await api.stamp({ stationId: s.stationId, proof: 'host', code: s.code });
    else await api.stamp({ stationId: s.stationId, proof: 'beacon', beacon: s.token });
    // An online booth you have not left your card with yet: cards are swapped on the spot, with the saved defaults
    const booth = level.value?.booths.find((b) => b.id === s.stationId), st = booth && stationMap.value.get(booth.id), m = me.value;
    if (booth && st && st.status !== 'prepared' && m?.passport && !m.shared.includes(booth.id)) {
      try { await api.leaveCard(booth.id, m.sharePrefs); toast(`Cards swapped with ${st.company}`, 'They have your card. Take it back any time from My contacts.', 'xp', 5000); }
      catch { panelStation.value = booth; modal.value = 'booth'; }
    }
    return true;
  } catch (e) {
    // scanned before registering: the card form comes up, and the scan is theirs to repeat once it is done
    if (e instanceof ApiError && e.code === 'card') { modal.value = 'card'; toast('Register first', e.message, 'warn', 6000); return false; }
    toast(e instanceof ApiError ? e.message : 'That code did not work', undefined, 'warn', 5000);
    return false;
  }
}
