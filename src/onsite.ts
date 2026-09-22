// Playing at MIHAS vs from anywhere. Off-site, the avatar roams freely under the stick. On site, the phone's GPS moves
// it: fixes go through the crew's calibration (shared/geo.ts) onto the current level's plan, and a booth QR scan pins
// the exact spot — the GPS error measured there keeps correcting the fixes for a few minutes after, since indoor error
// drifts slowly. GPS cannot tell the levels apart, so the level comes from the last scan, a lift, or the player.
import { signal } from '@preact/signals';
import { api, ApiError } from './net/api';
import { demo } from './demo/client';
import { geoToPlan, type GeoCalibration } from '../shared/geo';
import { level, me, toast } from './state';

export type SiteMode = 'remote' | 'onsite';
/** What stands between an on-site player and being placed. Only 'tracking' and 'uncalibrated' let them play. */
export type SiteState = 'off' | 'asking' | 'denied' | 'nofix' | 'unsupported' | 'outside' | 'level' | 'uncalibrated' | 'tracking';

const MODE_KEY = 'mx_site';
const readMode = (): SiteMode | null => { try { const v = localStorage.getItem(MODE_KEY); return v === 'onsite' || v === 'remote' ? v : null; } catch { return null; } };

/** null until the player has said where they are playing. */
export const siteMode = signal<SiteMode | null>(readMode());
export const siteState = signal<SiteState>('off');
/** The level the phone is on. */
export const siteDeck = signal<number | null>(null);
/** Where GPS puts the player on the plan, corrected, and how sure it is (plan metres). */
export const gpsTarget = signal<{ x: number; y: number; deck: number; sigma: number } | null>(null);
/** Raw accuracy of the last fix, metres, for the status chip. */
export const gpsAcc = signal<number | null>(null);

/** Worse than this and a fix cannot put anyone in the right hall: wait for a better one. */
const USABLE_ACC_M = 150;
/** No fix at all within this long after asking: tell the player instead of spinning. */
const FIRST_FIX_MS = 20_000;
/** Re-check "at MITEC" this often while tracking, so the server keeps honouring the walk (its window is 30 min). */
const RECHECK_MS = 5 * 60_000;
/** A scan's correction holds fully this long, then fades out over the next few minutes. */
const CORR_HOLD_MS = 90_000, CORR_FADE_MS = 5 * 60_000, CORR_MAX_M = 60;

let geo: GeoCalibration | null = null, watch: number | null = null, firstFixTimer: ReturnType<typeof setTimeout> | undefined;
let lastFix: { lat: number; lon: number; acc: number; t: number } | null = null, checkedAt = 0, checking = false;
let corr: { dx: number; dy: number; deck: number; at: number } | null = null;
/** A scan that came before the first fix (the phone's camera opened the game): measure its error when GPS arrives. */
let pendingPin: { stationId: string; at: number } | null = null;

export function setSiteMode(mode: SiteMode) {
  siteMode.value = mode;
  try { localStorage.setItem(MODE_KEY, mode); } catch { /* private mode: ask again next time */ }
  if (mode === 'onsite') void startTracking(); else stopTracking();
}

/** GPS is not available in the in-browser demo, and a phone without it cannot play on site. */
export const onsiteAvailable = () => !demo.value;

export async function startTracking(): Promise<void> {
  stopTracking();
  if (!('geolocation' in navigator)) { siteState.value = 'unsupported'; return; }
  siteState.value = 'asking';
  if (siteDeck.value == null) siteDeck.value = startDeck();
  try { geo = await api.geo(); } catch { geo = null; }
  watch = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30_000 });
  firstFixTimer = setTimeout(() => { if (siteState.value === 'asking') siteState.value = 'nofix'; }, FIRST_FIX_MS);
}

export function stopTracking() {
  if (watch != null) navigator.geolocation.clearWatch(watch);
  clearTimeout(firstFixTimer); watch = null; gpsTarget.value = null; gpsAcc.value = null; lastFix = null; checkedAt = 0;
  siteState.value = 'off';
}

/** The level of a recent on-site scan, if there is one. */
function anchoredDeck(): number | null {
  const a = me.value?.anchor; if (!a || Date.now() - a.at > 30 * 60_000) return null;
  return level.value?.booths.find((b) => b.id === a.stationId)?.deck ?? null;
}

/** The level to start on: the last scan's, or the only one there is. */
function startDeck(): number | null {
  const decks = level.value?.decks ?? [];
  return anchoredDeck() ?? (decks.length === 1 ? decks[0]!.level : null);
}

function onError(e: GeolocationPositionError) {
  if (e.code === e.PERMISSION_DENIED) siteState.value = 'denied';
  else if (siteState.value === 'asking' || !lastFix) siteState.value = 'nofix';
}

function onFix(pos: GeolocationPosition) {
  const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords;
  gpsAcc.value = Math.round(acc);
  if (acc > USABLE_ACC_M) { if (!lastFix) siteState.value = 'nofix'; return; }
  lastFix = { lat, lon, acc, t: Date.now() };
  if (Date.now() - checkedAt > RECHECK_MS) void venueCheck();
  if (pendingPin) { const p = pendingPin; pendingPin = null; if (Date.now() - p.at < CORR_HOLD_MS) { pinToBooth(p.stationId); return; } }
  if (siteState.value !== 'outside') place();
}

/** Ask the server whether this fix is at MITEC. Outside → this person is playing from elsewhere after all. */
async function venueCheck() {
  if (!lastFix || checking) return; checking = true;
  try {
    const r = await api.venue({ lat: lastFix.lat, lon: lastFix.lon, acc: lastFix.acc });
    checkedAt = Date.now();
    if (!r.onsite && r.reason === 'outside') {
      siteState.value = 'outside';
      toast('You are not at MIHAS right now', `About ${(r.distanceM / 1000).toFixed(1)} km away — playing from anywhere instead`, 'info', 6000);
      setSiteMode('remote');
    }
  } catch (e) { if (!(e instanceof ApiError)) checkedAt = 0; /* no signal: try again on the next fix */ }
  finally { checking = false; }
}

/** Turn the last fix into a spot on the current level. */
function place() {
  const f = lastFix; if (!f) return;
  if (!geo || !Object.keys(geo.decks).length) { siteState.value = 'uncalibrated'; gpsTarget.value = null; return; } // the crew has not mapped any level yet
  const deck = siteDeck.value ?? startDeck();
  if (deck == null) { siteState.value = 'level'; return; }
  siteDeck.value = deck;
  const p = geo ? geoToPlan(geo, deck, f.lat, f.lon, f.acc) : null;
  if (!p) { siteState.value = 'uncalibrated'; gpsTarget.value = null; return; }
  const k = corrWeight(deck);
  gpsTarget.value = { x: p.x + (corr?.dx ?? 0) * k, y: p.y + (corr?.dy ?? 0) * k, deck, sigma: Math.max(1.5, p.sigma * (1 - 0.7 * k)) };
  siteState.value = 'tracking';
}

function corrWeight(deck: number): number {
  if (!corr || corr.deck !== deck) return 0;
  const age = Date.now() - corr.at;
  return age < CORR_HOLD_MS ? 1 : Math.max(0, 1 - (age - CORR_HOLD_MS) / CORR_FADE_MS);
}

/** The player picked their level (or rode a lift): place them there. */
export function setSiteDeck(deck: number) {
  if (siteDeck.value === deck) return;
  siteDeck.value = deck;
  if (siteMode.value === 'onsite' && watch != null) place();
}

/** A booth QR scanned on site: the player is exactly here, on this level. Whatever GPS says now is its error. */
export function pinToBooth(stationId: string) {
  if (siteMode.value !== 'onsite') return;
  const b = level.value?.booths.find((x) => x.id === stationId); if (!b) return;
  siteDeck.value = b.deck;
  const f = lastFix, p = f && geo ? geoToPlan(geo, b.deck, f.lat, f.lon, f.acc) : null;
  if (!f) pendingPin = { stationId, at: Date.now() };
  corr = p && Math.hypot(b.x - p.x, b.y - p.y) <= CORR_MAX_M ? { dx: b.x - p.x, dy: b.y - p.y, deck: b.deck, at: Date.now() } : null;
  if (p) place(); else gpsTarget.value = { x: b.x, y: b.y, deck: b.deck, sigma: 1.5 };
}

/** The player is on site and GPS is moving their avatar. */
export const following = () => siteMode.value === 'onsite' && siteState.value === 'tracking' && gpsTarget.value != null;
