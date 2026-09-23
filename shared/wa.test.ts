import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waLink, waNumber } from './rules.js';

test('WhatsApp numbers: the Malaysian way, with a country code, or international', () => {
  assert.equal(waNumber('012-345 6789'), '60123456789');
  assert.equal(waNumber('+60 12 345 6789'), '60123456789');
  assert.equal(waNumber('0060123456789'), '60123456789');
  assert.equal(waNumber('+65 9123 4567'), '6591234567');
  assert.equal(waLink('0123456789'), 'https://wa.me/60123456789');
  assert.equal(waLink('0123456789', 'Hi Roy'), 'https://wa.me/60123456789?text=Hi%20Roy');
});
