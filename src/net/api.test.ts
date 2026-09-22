// The network client over a stand-in fetch: a read that fails once is tried again, a write never is, a request that
// hangs is given up on, and the offline chip goes up on a failure and comes down on the next answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { offline } from '../state';
import { api, ApiError, NET } from './api';

NET.timeoutMs = 60; NET.retryMs = 5; NET.retryJitterMs = 5;
const answer = (data: unknown) => ({ json: async () => ({ ok: true, data, events: [] }) }) as unknown as Response;
const calls: { method: string; path: string }[] = [];
/** Each entry is what the next fetch does: an answer, a thrown error, or 'hang'. */
let script: (Response | Error | 'hang')[] = [];
(globalThis as { fetch: unknown }).fetch = (path: string, init: { method: string; signal: AbortSignal }) => {
  calls.push({ method: init.method, path });
  const next = script.shift();
  if (next === 'hang') return new Promise<Response>((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  return next instanceof Error ? Promise.reject(next) : Promise.resolve(next ?? answer(null));
};
const reset = (...s: (Response | Error | 'hang')[]) => { script = s; calls.length = 0; offline.value = false; };

test('a read that fails on the network is tried once more, and the second answer counts', async () => {
  reset(new Error('net'), answer([{ id: '7C17' }]));
  const r = await api.stations();
  assert.deepEqual(r, [{ id: '7C17' }]); assert.equal(calls.length, 2); assert.equal(offline.value, false);
});

test('two failures: offline, and the chip is up until the next answer gets through', async () => {
  reset(new Error('net'), new Error('net'), answer(null));
  await assert.rejects(api.today(), (e: unknown) => e instanceof ApiError && e.code === 'offline');
  assert.equal(calls.length, 2); assert.equal(offline.value, true);
  await api.me(); assert.equal(offline.value, false);
});

test('a write is never repeated: it may have landed', async () => {
  reset(new Error('net'), answer(null));
  await assert.rejects(api.stamp({ stationId: '7C17', proof: 'virtual' }), (e: unknown) => e instanceof ApiError && e.code === 'offline');
  assert.equal(calls.length, 1); assert.equal(calls[0]!.method, 'POST'); assert.equal(offline.value, true);
});

test('a request that hangs is given up on after the timeout', async () => {
  reset('hang', 'hang');
  const t0 = Date.now();
  await assert.rejects(api.stations(), (e: unknown) => e instanceof ApiError && e.code === 'offline');
  assert.ok(Date.now() - t0 < 1000, 'did not wait long'); assert.equal(calls.length, 2);
});
