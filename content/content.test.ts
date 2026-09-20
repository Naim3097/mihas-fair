import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AREAS, CLASSES, CLASS_KEYS, DIALOGUES, ENEMIES, ITEMS, PROGRESSION, QUESTS, classByKey, levelFor, skillsFor, statGains, statsAt, validateAll, vitals, xpBar } from './index.js';
import { validateClasses, validateCopy, validateDialogue, validateItems, validateProgression, validateQuests, validateSkills, validateWorld } from './validate.js';

test('the content package is consistent: every reference resolves, every graph is connected, all copy is bilingual', () => {
  for (const [name, check] of Object.entries({ validateClasses, validateProgression, validateWorld, validateItems, validateQuests, validateDialogue, validateCopy, validateSkills })) {
    assert.deepEqual(check(), [], name);
  }
  assert.deepEqual(validateAll(), []);
});

test('the six avatars on the board, and the Ilmuwan character sheet at level 3', () => {
  assert.deepEqual(CLASSES.map((c) => c.name), ['Ilmuwan', 'Pendekar', 'Tabib', 'Pustakawan', 'Pengembara', 'Ahli Falak']);
  const ilmuwan = classByKey('ilmuwan')!;
  assert.equal(ilmuwan.title.en, 'The Seeker');
  assert.ok(!ilmuwan.draft, 'Ilmuwan is read off the board, not a draft');
  // The character board: Level 3, 420 / 1,000, Knowledge +2, Observation +1, Endurance +1, Curiosity +2.
  assert.deepEqual(statGains(ilmuwan, 3), { knowledge: 2, observation: 1, endurance: 1, curiosity: 2 });
  assert.deepEqual(xpBar(300 + 600 + 420), { level: 3, into: 420, toNext: 1000 });
  assert.deepEqual(statsAt(ilmuwan, 1), ilmuwan.base);
});

test('levels: the curve starts at 300, never gets easier, and stops at the max level', () => {
  assert.equal(levelFor(0), 1); assert.equal(levelFor(299), 1); assert.equal(levelFor(300), 2); assert.equal(levelFor(900), 3);
  const total = PROGRESSION.xpToNext.reduce((a, b) => a + b, 0);
  assert.equal(levelFor(total), PROGRESSION.maxLevel); assert.equal(levelFor(total * 10), PROGRESSION.maxLevel);
  assert.equal(xpBar(total * 10).into, xpBar(total * 10).toNext, 'a full bar at the top');
});

test('the world board: eight areas, Dewan Ilmu is the spawn, the archive is locked, the hidden room is hidden', () => {
  assert.equal(AREAS.length, 8);
  assert.equal(AREAS.find((a) => a.spawn)!.key, 'dewan-ilmu');
  assert.equal(AREAS.find((a) => a.key === 'arsip-diraja')!.locked, 'story');
  assert.ok(AREAS.find((a) => a.key === 'ruang-tersembunyi')!.hidden);
  assert.deepEqual(AREAS.filter((a) => a.sign).map((a) => a.sign!.bm), ['Sastera', 'Sejarah', 'Agama & Manuskrip', 'Sains']);
});

test('the journal board: Jejak Ilmu has the three HUD objectives; the librarian ticks the second one', () => {
  const q = QUESTS.find((x) => x.key === 'jejak-ilmu')!;
  assert.deepEqual(q.objectives.map((o) => o.text.en), ['Find the Eastern Wing', 'Talk to the Librarian', 'Discover a Hidden Room']);
  const talk = DIALOGUES.find((d) => d.key === 'pustakawan-intro')!;
  assert.equal(talk.nodes.find((n) => n.key === talk.start)!.effect?.completeObjective, 'jejak-ilmu/pustakawan');
  assert.equal(talk.nodes.find((n) => n.key === talk.start)!.choices!.length, 3, 'three numbered choices, as on the board');
  assert.ok(ITEMS.find((i) => i.key === 'kitab-nusantara')!.kind === 'key');
});

test('every class has Q, W, E and an ultimate on R; vitals grow with the stats; one training post', () => {
  for (const cls of CLASS_KEYS) {
    const kit = skillsFor(cls);
    assert.deepEqual(kit.map((s) => s.slot), ['q', 'w', 'e', 'r'], cls);
    assert.ok(kit[3]!.ultimate && !kit[0]!.ultimate);
  }
  const a = vitals({ knowledge: 1, observation: 1, endurance: 1, curiosity: 1 }), b = vitals({ knowledge: 3, observation: 3, endurance: 3, curiosity: 3 });
  assert.ok(b.health > a.health && b.spirit > a.spirit && b.lockRange > a.lockRange && b.ilhamRate > a.ilhamRate);
  assert.equal(ENEMIES.filter((e) => e.training).length, 1);
});
