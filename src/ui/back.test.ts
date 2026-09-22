// Back closes what is open and never throws you out by surprise, over a stand-in for the browser's history: every
// sheet owns one entry, a sheet that closes while another opens keeps one entry, the bare game asks before leaving.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backRules } from './back';

/** The browser's history, as far as these rules can tell: a stack with a cursor, pushState in place, back() a tick later. */
class FakeHistory {
  entries: unknown[] = [null]; i = 0; backs = 0;
  onpop: () => void = () => {};
  get state() { return this.entries[this.i]; }
  pushState(s: unknown) { this.entries.splice(this.i + 1); this.entries.push(s); this.i++; }
  back() { this.backs++; setTimeout(() => { if (this.i > 0) { this.i--; this.onpop(); } }, 0); }
  /** what a user does with the Back button */
  userBack() { return new Promise<void>((r) => { this.i--; this.onpop(); r(); }); }
  get depth() { return this.i; }
  at() { return (this.state as { mx?: string } | null)?.mx ?? null; }
}
const tick = () => new Promise((r) => setTimeout(r, 2));

function world(playing = true) {
  const h = new FakeHistory(); let open: string | null = null, clock = 1000; const said: string[] = [];
  const r = backRules(h, { isOpen: () => open != null, close: () => { open = null; }, playing: () => playing, say: (t) => said.push(t), now: () => clock });
  h.onpop = r.pop;
  const set = (m: string | null) => { open = m; r.sync(); };
  return { h, r, set, said, get open() { return open; }, tickClock: (ms: number) => { clock += ms; } };
}

test('play adds its entry; a sheet adds one more; closing it with its own button drops that one', async () => {
  const w = world(); w.set(null); await tick();
  assert.equal(w.h.at(), 'play'); assert.equal(w.h.depth, 1);
  w.set('map'); await tick();
  assert.equal(w.h.at(), 'sheet'); assert.equal(w.h.depth, 2);
  w.set(null); await tick();
  assert.equal(w.h.at(), 'play'); assert.equal(w.h.depth, 1, 'the sheet entry is gone');
  assert.equal(w.h.backs, 1);
});

test('the Back button closes the sheet and lands on the game', async () => {
  const w = world(); w.set(null); await tick(); w.set('menu'); await tick();
  await w.h.userBack(); await tick();
  assert.equal(w.open, null); assert.equal(w.h.at(), 'play'); assert.equal(w.h.depth, 1);
  assert.equal(w.h.backs, 0, 'nothing more was popped');
});

test('a sheet that closes while another opens in the same tick keeps exactly one entry, and Back still closes it', async () => {
  const w = world(); w.set(null); await tick(); w.set('card'); await tick();
  w.set(null); w.set('mybooth'); // the card form finishing and the booth sheet opening, one moment
  await tick();
  assert.equal(w.h.depth, 2); assert.equal(w.h.at(), 'sheet'); assert.equal(w.h.backs, 0);
  w.set('scan'); await tick(); // a sheet straight into another
  assert.equal(w.h.depth, 2);
  await w.h.userBack(); await tick();
  assert.equal(w.open, null); assert.equal(w.h.at(), 'play'); assert.equal(w.h.depth, 1);
  await w.h.userBack(); await tick();
  assert.equal(w.h.at(), 'play', 'the first Back on the bare game stays in the game');
  assert.deepEqual(w.said, ['Press back again to leave']);
});

test('the bare game: one Back asks, a second within 2.5 s leaves; a slow second one asks again', async () => {
  const w = world(); w.set(null); await tick();
  await w.h.userBack(); await tick();
  assert.equal(w.said.length, 1); assert.equal(w.h.at(), 'play'); assert.equal(w.h.backs, 0);
  w.tickClock(3000);
  await w.h.userBack(); await tick();
  assert.equal(w.said.length, 2, 'too late: asked again'); assert.equal(w.h.backs, 0);
  w.tickClock(500);
  await w.h.userBack(); await tick();
  assert.equal(w.h.backs, 1, 'leaving: one more step back'); assert.equal(w.said.length, 2);
});

test('Escape closes an open sheet and is not swallowed otherwise; nothing happens before play', async () => {
  const w = world(); w.set(null); await tick(); w.set('rules'); await tick();
  assert.equal(w.r.escape(), true); assert.equal(w.open, null); w.r.sync(); await tick();
  assert.equal(w.h.at(), 'play'); assert.equal(w.r.escape(), false);
  const s = world(false); s.set(null); await tick(); assert.equal(s.h.depth, 0, 'no entry on the start screen');
  s.set('card'); await tick(); assert.equal(s.h.at(), 'sheet');
  await s.h.userBack(); await tick(); assert.equal(s.open, null); assert.equal(s.h.depth, 0); assert.equal(s.said.length, 0);
});

test('a page reloaded on a sheet entry with nothing open drops back to the game', async () => {
  const w = world(); w.h.pushState({ mx: 'play' }); w.h.pushState({ mx: 'sheet' });
  w.set(null); await tick();
  assert.equal(w.h.at(), 'play');
});
