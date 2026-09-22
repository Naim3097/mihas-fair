// The phone's motion sensors, for step tracking on site: the accelerometer counts steps, the compass says which way.
// iPhones ask the person first, and only from a tap; Android just delivers the events. Nothing leaves the phone.
import { signal } from '@preact/signals';
import { HeadingFilter, StepDetector } from './game/track';

type PermissionAPI = { requestPermission?: () => Promise<'granted' | 'denied'> };
const DME = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : undefined) as unknown as PermissionAPI | undefined;
const DOE = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as unknown as PermissionAPI | undefined;

/** Steps are being counted and the compass is reading: the position can follow the person between scans. */
export const motionOn = signal(false);

let asked: Promise<boolean> | null = null;
/**
 * Ask for motion access. Call it from inside a tap handler, before any await: iOS only shows its prompt for a gesture.
 * Resolves true where no permission is needed (Android, desktop) too — whether events actually arrive is another matter.
 */
export function askMotion(): Promise<boolean> {
  if (asked) return asked;
  if (!DME?.requestPermission) return (asked = Promise.resolve(typeof DeviceMotionEvent !== 'undefined'));
  const both = [DME.requestPermission(), DOE?.requestPermission?.() ?? Promise.resolve('granted' as const)];
  asked = Promise.all(both).then((r) => r.every((x) => x === 'granted'), () => false);
  asked.then((ok) => { if (!ok) asked = null; }); // refused or not a gesture: a later tap may ask again
  return asked;
}

/** A returning player never taps "At MIHAS" again: the first tap anywhere asks instead. */
export function askMotionOnNextTap(then: () => void) {
  if (!DME?.requestPermission) { then(); return; }
  const once = () => { document.removeEventListener('click', once, true); document.removeEventListener('touchend', once, true); void askMotion().then((ok) => ok && then()); };
  document.addEventListener('click', once, true); document.addEventListener('touchend', once, true);
}

const heading = new HeadingFilter();
let detector = new StepDetector(), onStep: ((t: number) => void) | null = null, gotMotion = false, gotHeading = false;

const screenAngle = () => (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0);

function onMotion(e: DeviceMotionEvent) {
  const a = e.accelerationIncludingGravity; if (a?.x == null || a.y == null || a.z == null) return;
  gotMotion = true; motionOn.value = gotHeading;
  const t = performance.now();
  if (detector.sample(Math.hypot(a.x, a.y, a.z), t)) onStep?.(t);
}

/** iOS gives a true compass heading; elsewhere an absolute alpha (counter-clockwise) has to be turned into one. */
function onOrientation(e: DeviceOrientationEvent) {
  const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
  let deg: number | null = null;
  if (typeof ios === 'number' && Number.isFinite(ios)) deg = ios;
  else if (e.absolute && e.alpha != null) deg = (360 - e.alpha) % 360;
  if (deg == null) return;
  heading.push((deg + screenAngle()) % 360);
  gotHeading = true; motionOn.value = gotMotion;
}

/** Start counting. Each detected step calls back; compass() reads the current heading. */
export function startMotion(cb: (t: number) => void) {
  stopMotion();
  onStep = cb; detector = new StepDetector();
  window.addEventListener('devicemotion', onMotion);
  // Chrome on Android sends a compass only on the "absolute" event; Safari puts webkitCompassHeading on the plain one
  window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
  window.addEventListener('deviceorientation', onOrientation);
}

export function stopMotion() {
  window.removeEventListener('devicemotion', onMotion);
  window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener);
  window.removeEventListener('deviceorientation', onOrientation);
  onStep = null; gotMotion = gotHeading = false; motionOn.value = false;
}

/** Degrees clockwise from north, smoothed; null until the compass has spoken. */
export const compass = () => heading.deg;
/** When the last step was counted (performance.now() ms). */
export const lastStepAt = () => detector.lastStepAt;
