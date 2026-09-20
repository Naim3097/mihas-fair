// Nexo's skeleton is ours (tools/rig/fit-mascot-rig.mjs writes it from assets-src/characters/nexo/rig.json and
// leaves a report next to it). These are the rules the report has to meet for the body to move like a body:
// mirrored joints, knees in the middle of the legs, a spine that carries the torso, weights that sum to one.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

interface Report {
  height: number; vertices: number;
  ratios: { kneeOfLeg: number; spineShareOfTorso: number; skinMirrorAgreement: number };
  mirrorErrorCm: number; weightSumError: number;
  joints: Record<string, [number, number, number]>;
  dominant: Record<string, { verts: number; minY: number; maxY: number }>;
}
const report = JSON.parse(readFileSync('assets-src/characters/nexo/rig-report.json', 'utf8')) as Report;
const JOINTS = ['Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head', 'head_end', 'headfront', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase'];

test('the 24 joints the clip library expects are all there, mirrored exactly', () => {
  for (const j of JOINTS) assert.ok(report.joints[j], j);
  assert.equal(report.mirrorErrorCm, 0);
  for (const j of JOINTS.filter((n) => n.startsWith('Left'))) {
    const [lx, ly, lz] = report.joints[j]!, [rx, ry, rz] = report.joints['Right' + j.slice(4)]!;
    assert.equal(lx, -rx); assert.equal(ly, ry); assert.equal(lz, rz);
  }
  for (const j of ['Hips', 'Spine02', 'Spine01', 'Spine', 'neck', 'Head', 'head_end', 'headfront']) assert.equal(report.joints[j]![0], 0, j + ' on the centre line');
});

test('the legs bend in the middle, the hips sit at the top of the legs, the head crowns the body', () => {
  assert.ok(report.ratios.kneeOfLeg > 0.42 && report.ratios.kneeOfLeg < 0.58, 'knee at ' + report.ratios.kneeOfLeg);
  const J = report.joints;
  assert.ok(J.LeftFoot![1] > 0.05 && J.LeftFoot![1] < J.LeftLeg![1] && J.LeftLeg![1] < J.LeftUpLeg![1] && J.LeftUpLeg![1] <= J.Hips![1], 'leg chain rises');
  assert.ok(J.LeftToeBase![2] > J.LeftFoot![2], 'toes in front of the ankle');
  assert.ok(J.Hips![1] < J.Spine02![1] && J.Spine02![1] < J.Spine01![1] && J.Spine01![1] < J.Spine![1] && J.Spine![1] < J.neck![1] && J.neck![1] < J.Head![1] && J.Head![1] < J.head_end![1], 'spine chain rises');
  assert.ok(Math.abs(J.head_end![1] - report.height) < 0.02, 'head_end at the crown');
});

test('the skin follows the skeleton: spine carries the torso, boots and helmet are whole, weights sum to one', () => {
  assert.ok(report.ratios.spineShareOfTorso >= 0.5, 'spine share ' + report.ratios.spineShareOfTorso);
  assert.ok(report.ratios.skinMirrorAgreement >= 0.9, 'mirror agreement ' + report.ratios.skinMirrorAgreement);
  assert.ok(report.weightSumError < 1e-4);
  const d = report.dominant;
  assert.ok(d.Head!.verts > 5000 && d.Head!.minY > 0.8, 'the helmet is the head');
  assert.ok(d.LeftFoot!.verts > 500 && d.RightFoot!.verts > 500 && d.LeftFoot!.minY === 0, 'boots stand on the floor');
  for (const b of ['LeftUpLeg', 'LeftLeg', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightUpLeg', 'RightLeg', 'RightArm', 'RightForeArm', 'RightHand', 'Spine01', 'Spine02', 'Hips']) assert.ok((d[b]?.verts ?? 0) > 100, b + ' owns some of the body');
  const l = Object.entries(d).filter(([n]) => n.startsWith('Left')).reduce((s, [, e]) => s + e.verts, 0), r = Object.entries(d).filter(([n]) => n.startsWith('Right')).reduce((s, [, e]) => s + e.verts, 0);
  assert.ok(Math.abs(l - r) / Math.max(l, r) < 0.08, `left ${l} vs right ${r}`);
});
