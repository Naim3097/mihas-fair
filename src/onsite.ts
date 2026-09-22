// Playing at MIHAS vs from anywhere. Off-site, the avatar roams freely under the stick. On site, the avatar follows the
// person, from three witnesses fused in game/track.ts: a QR scan (a booth, or a "You are here" poster at an aisle
// crossing) pins the exact spot; the phone's steps and compass carry it from there; GPS, put on the plan through the
// crew's calibration, pulls it back over time. Indoor GPS is ~25 m off and its error drifts slowly, so the error measured
// at a scan keeps correcting the fixes for a few minutes after. GPS cannot tell levels apart; the level comes from the
// last scan or the player.
import { signal } from '@preact/signals';
import { api, ApiError } from './net/api';
import { demo } from './demo/client';
import { geoToPlan, type GeoCalibration } from '../shared/geo';
import { PLAN_ROT_DEG } from '../shared/rules';
import { level, me, toast } from './state';
import { NavGrid, type P2 } from './game/nav';
import { planSpots, resolveSpots, type Spot } from './game/spots';
import { Tracker, bearingToPlan } from './game/track';
import { askMotionOnNextTap, compass, lastStepAt, motionOn, startMotion, stopMotion } from './motion';

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
/** Where the player is on the plan, and how sure (plan metres). The avatar walks here. */
export const gpsTarget = signal<{ x: number; y: number; deck: number; sigma: number } | null>(null);
/** Raw accuracy of the last fix, metres. */
export const gpsAcc = signal<number | null>(null);
/** A scan while the stick is in charge (no calibration, no step counter): walk the avatar here once. */
export const snapTo = signal<P2 | null>(null);

/** Worse than this and a fix cannot put anyone in the right hall: wait for a better one. */
const USABLE_ACC_M = 150;
/** No fix at all within this long after asking: tell the player instead of spinning. */
const FIRST_FIX_MS = 20_000;
/** Re-check "at MITEC" this often while tracking, so the server keeps honouring the walk (its window is 30 min). */
const RECHECK_MS = 5 * 60_000;
/** A scan's GPS correction holds fully this long, then fades out over the next few minutes. */
const CORR_HOLD_MS = 90_000, CORR_FADE_MS = 5 * 60_000, CORR_MAX_M = 60;
/** Standing still (no step for this long): GPS wobble does not move the avatar. */
const STILL_MS = 3000;
/** Steps alone, with no GPS map to pull them back, are trusted until they have drifted about this far. */
const STEPS_ONLY_MAX_SIGMA = 12;

let geo: GeoCalibration | null = null, watch: number | null = null, firstFixTimer: ReturnType<typeof setTimeout> | undefined;
let lastFix: { lat: number; lon: number; acc: number; t: number } | null = null, checkedAt = 0, checking = false;
let corr: { dx: number; dy: number; deck: number; at: number } | null = null;
/** A scan that came before the first fix: measure GPS's error there when a fix arrives. */
let pendingCorr: { x: number; y: number; deck: number; at: number } | null = null;
let nav: NavGrid | null = null, tracker: Tracker | null = null;

function grid(): NavGrid | null {
  if (!nav && level.value) nav = new NavGrid(level.value);
  return nav;
}
function track(): Tracker | null {
  const g = grid(); if (!g) return null;
  return (tracker ??= new Tracker((p, dx, dy) => g.move(p, dx, dy)));
}

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
  startMotion(onStep);
  askMotionOnNextTap(() => { if (siteMode.value === 'onsite') startMotion(onStep); });
  try { geo = await api.geo(); } catch { geo = null; }
  watch = navigator.geolocation.watchPosition(onFix, onError, { enableHighAccuracy: true, maximumAge: 2000, timeout: 30_000 });
  firstFixTimer = setTimeout(() => { if (siteState.value === 'asking') siteState.value = 'nofix'; }, FIRST_FIX_MS);
}

export function stopTracking() {
  if (watch != null) navigator.geolocation.clearWatch(watch);
  clearTimeout(firstFixTimer); watch = null; gpsTarget.value = null; gpsAcc.value = null; lastFix = null; checkedAt = 0;
  stopMotion(); tracker?.reset();
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
  if (e.code === e.PERMISSION_DENIED) { siteState.value = 'denied'; return; }
  if (siteState.value !== 'tracking' && (siteState.value === 'asking' || !lastFix)) siteState.value = 'nofix';
}

const calibrated = (deck: number) => !!geo?.decks[deck];

function onFix(pos: GeolocationPosition) {
  const { latitude: lat, longitude: lon, accuracy: acc } = pos.coords;
  gpsAcc.value = Math.round(acc);
  if (acc > USABLE_ACC_M) { if (!lastFix && siteState.value !== 'tracking') siteState.value = 'nofix'; return; }
  const t = Date.now(), dt = lastFix ? (t - lastFix.t) / 1000 : 0;
  lastFix = { lat, lon, acc, t };
  if (t - checkedAt > RECHECK_MS) void venueCheck();
  if (siteState.value === 'outside') return;
  const deck = siteDeck.value ?? startDeck();
  if (deck == null) { siteState.value = 'level'; return; }
  siteDeck.value = deck;
  const p = calibrated(deck) ? geoToPlan(geo!, deck, lat, lon, acc) : null;
  if (p && pendingCorr) { const q = pendingCorr; pendingCorr = null; if (t - q.at < CORR_HOLD_MS) measureCorr(q, p); }
  const tr = track();
  if (tr && p) {
    if (!motionOn.value) tr.idle(dt);
    const still = motionOn.value && performance.now() - lastStepAt() > STILL_MS && tr.anchoredWithin(30 * 60_000, t);
    if (!still || !tr.ready) { const k = corrWeight(deck); tr.gps(p.x + (corr?.dx ?? 0) * k, p.y + (corr?.dy ?? 0) * k, Math.max(1.5, p.sigma * (1 - 0.7 * k))); }
  }
  publish();
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

function onStep() {
  const tr = tracker, c = compass();
  if (!tr?.ready || c == null || siteMode.value !== 'onsite') return;
  tr.step(bearingToPlan(c, PLAN_ROT_DEG));
  publish();
}

/** Put the fused position on screen, if it is good enough to follow; otherwise hand the avatar back to the stick. */
function publish() {
  const tr = tracker, deck = siteDeck.value;
  if (deck == null || siteState.value === 'outside' || siteState.value === 'denied') return;
  const trusted = !!tr?.ready && (calibrated(deck) || (motionOn.value && tr.sigma <= STEPS_ONLY_MAX_SIGMA));
  if (!trusted) { if (lastFix || tr?.ready) { siteState.value = 'uncalibrated'; gpsTarget.value = null; } return; }
  gpsTarget.value = { x: tr!.x, y: tr!.y, deck, sigma: Math.max(1.5, tr!.sigma) };
  siteState.value = 'tracking';
}

function corrWeight(deck: number): number {
  if (!corr || corr.deck !== deck) return 0;
  const age = Date.now() - corr.at;
  return age < CORR_HOLD_MS ? 1 : Math.max(0, 1 - (age - CORR_HOLD_MS) / CORR_FADE_MS);
}

/** GPS said p while the person was really at q: that is its error here, for the next few minutes. */
function measureCorr(q: { x: number; y: number; deck: number }, p: P2) {
  corr = Math.hypot(q.x - p.x, q.y - p.y) <= CORR_MAX_M ? { dx: q.x - p.x, dy: q.y - p.y, deck: q.deck, at: Date.now() } : null;
}

/** The player picked their level: place them there. */
export function setSiteDeck(deck: number) {
  if (siteDeck.value === deck) return;
  siteDeck.value = deck; tracker?.reset();
}

/** A scan on site: the person is exactly here. Whatever GPS says now is its error; the steps start again from here. */
function anchorAt(x: number, y: number, deck: number) {
  const t = Date.now();
  siteDeck.value = deck;
  const f = lastFix && t - lastFix.t < 10_000 ? lastFix : null, p = f && calibrated(deck) ? geoToPlan(geo!, deck, f.lat, f.lon, f.acc) : null;
  if (p) measureCorr({ x, y, deck }, p); else pendingCorr = { x, y, deck, at: t };
  track()?.anchor(x, y, t);
  publish();
  if (siteState.value !== 'tracking') snapTo.value = { x, y };
}

/** A booth QR scanned on site. */
export function pinToBooth(stationId: string) {
  if (siteMode.value !== 'onsite') return;
  const b = level.value?.booths.find((x) => x.id === stationId); if (!b) return;
  const p = grid()?.nearestWalkable(b.x, b.y, 6) ?? b;
  anchorAt(p.x, p.y, b.deck);
}

let spotCache: { at: number; list: Spot[] } | null = null;
/** The 24-odd posters, where the crew actually hung them. */
export async function loadSpots(): Promise<Spot[]> {
  const lv = level.value, g = grid(); if (!lv || !g) return [];
  if (spotCache && Date.now() - spotCache.at < 60_000) return spotCache.list;
  let moved: Record<string, string> = {};
  try { moved = await api.spots(); } catch { /* offline: the plan's spots are still right for most posters */ }
  spotCache = { at: Date.now(), list: resolveSpots(lv, g, planSpots(lv, g), moved) };
  return spotCache.list;
}

/** A "You are here" poster: scanning one means this person is at MIHAS, at exactly this crossing. */
export async function pinToSpot(id: string): Promise<Spot | null> {
  const s = (await loadSpots()).find((x) => x.id === id); if (!s) return null;
  if (siteMode.value !== 'onsite' && onsiteAvailable()) setSiteMode('onsite');
  anchorAt(s.x, s.y, s.deck);
  return s;
}

/** The player is on site and the avatar follows them. */
export const following = () => siteMode.value === 'onsite' && siteState.value === 'tracking' && gpsTarget.value != null;
