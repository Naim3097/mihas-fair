import type { BoothTeamPeek } from '../../shared/types';
import type { ApiResult, Contact, Hologram, HostCode, HostLead, HostStation, LinkCode, LinkPeek, PassportInput, PresencePing, StampRequest, StationClaimInput, StationView, TodayView } from '../../shared/types';
import type { PlaygroundBoardRow, PlaygroundMe, PlaygroundRunInput, PlaygroundRunResult } from '../../shared/types';
import type { Role } from '../../shared/rules';
import type { ShareField } from '../../shared/rules';
import { me, offline, showEvents } from '../state';

export class ApiError extends Error { constructor(public code: string, message: string) { super(message); } }

/** How long a request may take, and how long a read waits before its one retry. Tests shorten them. */
export const NET = { timeoutMs: 12_000, retryMs: 400, retryJitterMs: 600 };
const OFFLINE = () => new ApiError('offline', 'No connection — check your signal and try again');

/** One request, given up on after the timeout. A read that fails on the network is tried once more after a short
 *  random wait; a write never is, it may have landed. The offline chip follows: up on a failure, down on the next answer. */
async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, quiet = false): Promise<T> {
  const once = async () => {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), NET.timeoutMs);
    try { return await fetch(path, { method, credentials: 'same-origin', headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal }); }
    finally { clearTimeout(timer); }
  };
  let res: Response;
  try { res = await once(); }
  catch {
    if (method !== 'GET') { offline.value = true; throw OFFLINE(); }
    await new Promise((r) => setTimeout(r, NET.retryMs + Math.random() * NET.retryJitterMs));
    try { res = await once(); } catch { offline.value = true; throw OFFLINE(); }
  }
  if (offline.value) offline.value = false;
  let json: ApiResult<T>;
  try { json = await res.json(); } catch { throw new ApiError('server', 'The server sent something unexpected'); }
  if (!json.ok) throw new ApiError(json.code, json.error);
  if (json.me) me.value = json.me;
  if (!quiet) showEvents(json.events);
  return json.data;
}
const q = encodeURIComponent;

export const api = {
  me: () => call<null>('GET', '/api/me'),
  start: (role: Role) => call<null>('POST', '/api/start', { role }),
  presence: (p: PresencePing & { spawn?: boolean }) => call<{ holograms: Hologram[]; online: number; deck: boolean }>('POST', '/api/presence', p),
  stamp: (r: StampRequest) => call<null>('POST', '/api/stamp', r),
  card: (p: PassportInput) => call<null>('POST', '/api/passport', p),
  today: () => call<TodayView>('GET', '/api/today'),
  track: (name: string, props?: unknown) => { void call('POST', '/api/event', { name, props }, true).catch(() => {}); },

  /* the Playground beside the X */
  pgMe: () => call<PlaygroundMe>('GET', '/api/playground/me', undefined, true),
  pgStart: () => call<{ token: string }>('POST', '/api/playground/start', {}, true),
  /** not quiet: with the daily bridge on, the fair's points come back as an event */
  pgRun: (r: PlaygroundRunInput) => call<PlaygroundRunResult>('POST', '/api/playground/run', r),
  pgUnlock: (gear: string) => call<PlaygroundMe>('POST', '/api/playground/unlock', { gear }, true),
  pgBoard: (range: 'today' | 'all') => call<PlaygroundBoardRow[]>('GET', `/api/playground/board?range=${range}`, undefined, true),

  /* booths that are online, and the exhibitor's side of them */
  stations: () => call<StationView[]>('GET', '/api/stations'),
  claim: (c: StationClaimInput) => call<null>('POST', '/api/station/claim', c),
  /** The booth's logo or a photo of the real booth, as a data URL (see ui/images.ts). */
  boothImage: (stationId: string, kind: 'logo' | 'photo', image: string) => call<null>('POST', `/api/station/${kind}`, { stationId, image }, true),
  leaveCard: (stationId: string, fields: ShareField[]) => call<null>('POST', '/api/station/share', { stationId, fields }),
  takeBackCard: (stationId: string) => call<null>('POST', '/api/station/unshare', { stationId }),
  myBooths: () => call<HostStation[]>('GET', '/api/host/stations'),
  boothQr: (stationId: string) => call<HostCode>('GET', `/api/host/code?station=${q(stationId)}`),
  teamPeek: (code: string) => call<BoothTeamPeek>('GET', `/api/booth-team/peek?code=${q(code)}`, undefined, true),
  teamJoin: (code: string) => call<BoothTeamPeek>('POST', '/api/booth-team/join', { code }),
  /** The booth's fixed QR: printed once and left on the counter. */
  fixedQr: (stationId: string) => call<{ stationId: string; url: string }>('GET', `/api/host/qr?station=${q(stationId)}`, undefined, true),
  leads: (stationId: string) => call<HostLead[]>('GET', `/api/host/leads?station=${q(stationId)}`),

  /* swapping cards with people */
  swapPrefs: (fields: ShareField[]) => call<null>('POST', '/api/link/prefs', { fields }),
  swapCode: () => call<LinkCode>('POST', '/api/link/code', {}),
  swapPeek: (code: string) => call<LinkPeek>('POST', '/api/link/peek', { code }),
  swap: (code: string, fields: ShareField[]) => call<null>('POST', '/api/link', { code, fields }),
  contacts: () => call<Contact[]>('GET', '/api/contacts'),
  note: (key: string, note: string) => call<null>('POST', '/api/contacts/note', { key, note }),
  revokeContact: (key: string) => call<null>('POST', '/api/contacts/revoke', { key }),

};
