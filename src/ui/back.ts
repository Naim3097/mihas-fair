// Back and Escape do what people expect: close what is open — they do not throw you out of the game.
//
// An open sheet owns one history entry, so the phone's Back button (or a swipe back) closes it. While playing there is
// one more entry underneath: the first Back on the bare game asks "again to leave", the second one leaves. The entry
// is added or dropped once per tick, after the interface has settled, so a sheet that closes while another opens
// keeps exactly one entry between them; and where the stack stands is read from `history.state` each time rather
// than remembered, so the two cannot drift apart. A world (the Playground) owns an entry under any sheet: in it the
// stack reads play, world, sheet, and a sheet that closes while a world is on becomes the world's entry in place.
import { effect } from '@preact/signals';
import { modal, phase, toast, world } from '../state';
import { pgControls } from '../playground/state';

export interface HistoryLike { readonly state: unknown; pushState(state: unknown, title: string): void; replaceState(state: unknown, title: string): void; back(): void }
export interface BackHooks { isOpen(): boolean; close(): void; playing(): boolean; say(text: string): void; now?(): number; inWorld?(): boolean; leaveWorld?(): void }

/** The rules over any history (the browser's, or a stand-in under test). `sync` is called whenever a sheet opens or
 *  closes or play begins; `pop` on every popstate; `escape` on the Escape key. */
export function backRules(h: HistoryLike, hooks: BackHooks) {
  const now = hooks.now ?? (() => Date.now());
  let ours = 0, askedAt = -Infinity, scheduled = false, worldEntry = false; // whether the world's own entry is on the stack (a sheet may have been the first thing pushed)
  const at = () => (h.state as { mx?: string } | null)?.mx ?? null;
  const settle = () => {
    scheduled = false;
    const open = hooks.isOpen(), inWorld = hooks.inWorld?.() ?? false, where = at();
    if (hooks.playing() && where === null) h.pushState({ mx: 'play' }, '');
    if (!open && where === 'sheet') { if (inWorld && !worldEntry) { h.replaceState({ mx: 'world' }, ''); worldEntry = true; } else { ours++; h.back(); } } // a sheet gone while a world is on with no entry of its own yet: the sheet's becomes the world's
    else if (!inWorld && where === 'world') { ours++; h.back(); worldEntry = false; }
    if (inWorld && at() === 'play') { h.pushState({ mx: 'world' }, ''); worldEntry = true; }
    if (open && at() !== 'sheet') h.pushState({ mx: 'sheet' }, '');
  };
  const sync = () => { if (!scheduled) { scheduled = true; queueMicrotask(settle); } };
  const pop = () => {
    const where = at(), open = hooks.isOpen();
    if (open && where !== 'sheet') { hooks.close(); if (ours > 0) ours--; return; } // the sheet's entry went: the sheet goes with it
    if ((hooks.inWorld?.() ?? false) && where !== 'world' && where !== 'sheet') { worldEntry = false; hooks.leaveWorld?.(); if (ours > 0) ours--; return; } // the world's entry went: back to the fair
    if (ours > 0) { ours--; return; } // our own back(), done
    if (!hooks.playing() || where === 'sheet' || where === 'play' || where === 'world') return;
    // below the game's own entry: the bare game asked to go back
    if (now() - askedAt < 2500) { ours++; h.back(); return; }
    askedAt = now(); h.pushState({ mx: 'play' }, ''); hooks.say('Press back again to leave');
  };
  const escape = (): boolean => { if (!hooks.isOpen()) return false; hooks.close(); return true; };
  return { sync, pop, escape };
}

export function installBack() {
  const r = backRules(history, { isOpen: () => modal.value != null, close: () => { modal.value = null; }, playing: () => phase.value === 'play', say: (t) => toast(t, undefined, 'info', 2400), inWorld: () => world.value === 'playground', leaveWorld: () => { pgControls.value?.leave(); world.value = 'fair'; } });
  effect(() => { void modal.value; void phase.value; void world.value; r.sync(); });
  window.addEventListener('popstate', r.pop);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && r.escape()) e.preventDefault(); });
}
