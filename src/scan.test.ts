// The one entry for every QR the game prints, over a stand-in fetch: what each kind of code does, and what a scan
// before registering or a code that is not ours does. The rules themselves live on the server; this is the client's
// side of them, and it must not drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { LevelData, Me, StationView } from '../shared/types';
import { level, me, modal, panelStation, pendingLink, stations, toasts } from './state';
import { handleScan } from './scan';

const calls: { method: string; path: string; body: unknown }[] = [];
let reply: (path: string) => unknown = () => ({ ok: true, data: null, events: [] });
(globalThis as { fetch: unknown }).fetch = (path: string, init: { method: string; body?: string }) => {
  calls.push({ method: init.method, path, body: init.body ? JSON.parse(init.body) : undefined });
  return Promise.resolve({ json: async () => reply(path) } as unknown as Response);
};
const booth = { id: '7C17', hall: 7, x: 100, y: 50, name: '', deck: 2 };
level.value = { booths: [booth], hero: { id: '7E17' } } as unknown as LevelData;
const reset = () => { calls.length = 0; modal.value = null; panelStation.value = null; pendingLink.value = null; toasts.value = []; stations.value = []; me.value = { passport: { name: 'Test' }, shared: [] } as unknown as Me; reply = () => ({ ok: true, data: null, events: [] }); };

test("a booth's printed QR (a beacon) is a stamp with the beacon token; the booth number is the part before the dot", async () => {
  reset();
  assert.equal(await handleScan('https://x.test/?b=7C17.abcdef'), true);
  assert.deepEqual(calls, [{ method: 'POST', path: '/api/stamp', body: { stationId: '7C17', proof: 'beacon', beacon: '7C17.abcdef' } }]);
  assert.equal(modal.value, null, 'the booth is not online: nothing more to offer');
});

test("an exhibitor's rotating QR (a host code) is a stamp with the code", async () => {
  reset();
  assert.equal(await handleScan('?h=7C17.123456'), true);
  assert.deepEqual(calls[0]!.body, { stationId: '7C17', proof: 'host', code: '7C17.123456' });
});

test('a scan at an online booth you have not left your card with swaps cards on the spot; only a failed swap opens the booth sheet', async () => {
  reset(); stations.value = [{ id: '7C17', company: 'Mamee' } as unknown as StationView]; me.value = { passport: { name: 'T' }, shared: [], sharePrefs: ['name', 'company', 'role', 'phone', 'email'] } as unknown as Me;
  await handleScan('?b=7C17.tok');
  assert.deepEqual(calls.map((c) => c.path), ['/api/stamp', '/api/station/share'], 'the stamp, then the card left with the saved defaults');
  assert.equal(modal.value, null, 'no picker, no sheet'); assert.equal(toasts.value[0]?.title, 'Cards swapped with Mamee');
  reset(); stations.value = [{ id: '7C17', company: 'Mamee' } as unknown as StationView]; me.value = { passport: { name: 'T' }, shared: ['7C17'] } as unknown as Me;
  await handleScan('?b=7C17.tok');
  assert.equal(modal.value, null, 'card already left: nothing to offer'); assert.deepEqual(calls.map((c) => c.path), ['/api/stamp']);
  reset(); stations.value = [{ id: '7C17', company: 'Mamee' } as unknown as StationView]; me.value = { passport: { name: 'T' }, shared: [], sharePrefs: ['name'] } as unknown as Me;
  reply = (path) => (path === '/api/station/share' ? { ok: false, code: 'x', error: 'no' } : { ok: true, data: null, events: [] });
  await handleScan('?b=7C17.tok');
  assert.equal(modal.value, 'booth', 'the swap failed: the booth sheet, to try again there'); assert.equal(panelStation.value?.id, '7C17');
});

test('a card-swap code opens the swap sheet with the code waiting, and sends nothing', async () => {
  reset();
  assert.equal(await handleScan('https://x.test/?l=abcd1234'), true);
  assert.equal(pendingLink.value, 'ABCD1234'); assert.equal(modal.value, 'swap'); assert.equal(calls.length, 0);
});

test('not our code: a warning, nothing sent', async () => {
  reset();
  assert.equal(await handleScan('https://example.com/menu'), false);
  assert.equal(calls.length, 0); assert.equal(toasts.value[0]?.title, 'Not a Mission X code'); assert.equal(toasts.value[0]?.tone, 'warn');
});

test('scanned before registering: the card form comes up, the scan is theirs to repeat', async () => {
  reset(); reply = () => ({ ok: false, code: 'card', error: 'Make your card first' });
  assert.equal(await handleScan('?b=7C17.tok'), false);
  assert.equal(modal.value, 'card'); assert.equal(toasts.value[0]?.title, 'Register first');
});

test('any other refusal is said as the server said it', async () => {
  reset(); reply = () => ({ ok: false, code: 'too_far', error: 'Walk up to the booth first' });
  assert.equal(await handleScan('?b=7C17.tok'), false);
  assert.equal(modal.value, null); assert.equal(toasts.value[0]?.title, 'Walk up to the booth first');
});
