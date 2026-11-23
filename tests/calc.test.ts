import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calcSection, pricing, evalExpr, jobArea, costSplit } from '../src/lib/calc';
import { DEFAULT_SETTINGS as st, type Line, type Section, type Job } from '../src/lib/types';

const S = (p: Partial<Section>): Section => ({ id: 's', job_id: 'j', pos: 0, name: 'x', lib: null, preset: null, area: null, sheet_sqft: null, mk: null, fmk: null, fmkm: 'amt', fin: false, ctext: null, wgrp: null, tier: null, proj_only: false, proj_off: false, co_id: null, act_override: null, ...p });
const L = (p: Partial<Line>): Line => ({ id: 'l', job_id: 'j', section_id: 's', kind: 'item', pos: 0, name: '', type: 'Material', role: null, est_qty: null, est_rate: null, est_amount: 0, eff_qty: null, eff_rate: null, bud_qty: null, bud_rate: null, budget: null, act_qty: null, act_rate: null, act_amount: 0, act_date: null, act_eff_qty: null, act_eff_rate: null, proj_amount: 0, mk: null, phase_id: null, of_line: null, proj_only: false, co_id: null, done: false, date: null, custom: false, cat_id: null, tier: null, unit: null, rate_note: null, ...p });

const acm = S({ id: 'acm', lib: 'acm', name: 'ACM panels', area: 400, sheet_sqft: 50 });
const inst = S({ id: 'inst', lib: 'install', name: 'Install' });
const pm = S({ id: 'pm', lib: 'pm', name: 'PM' });
const sub = S({ id: 'sub', lib: 'subtrades', name: 'Subtrades', mk: 'Y' });
const sections = [acm, inst, pm, sub];
const lines = [
  L({ id: 'sh', section_id: 'acm', role: 'sheets', est_qty: 10 }),
  L({ id: 'fab', section_id: 'acm', role: 'fab', est_qty: 300, est_rate: 20 }),
  L({ id: 'cb', section_id: 'acm', role: 'cutbend', est_qty: 100 }),
  L({ id: 'w', section_id: 'acm', role: 'wastage', est_rate: 5 }),
  L({ id: 'lab', section_id: 'inst', type: 'Labour', est_qty: 100, est_rate: 10 }),
  L({ id: 'ws', section_id: 'inst', type: 'Overhead', role: 'wsib' }),
  L({ id: 'pm1', section_id: 'pm', type: 'Labour', est_qty: 1, est_rate: 500 }),
  L({ id: 'sb', section_id: 'sub', est_qty: 1, est_rate: 2000 }),
];
const all = { sections, lines, costs: [] };

test('sheet maths', () => {
  const c = calcSection(acm, lines, all, 'est', st);
  assert.equal(c.get('sh')!.sheetArea, 500);
  assert.equal(c.get('sh')!.amount, 0);
  assert.equal(c.get('cb')!.rate, 19);
  assert.equal(c.get('cb')!.amount, 1900);
  assert.equal(c.get('w')!.qty, 100);
  assert.equal(c.get('w')!.amount, 500);
});
test('wastage clamps at 0', () => {
  const ls = lines.map(l => l.id === 'fab' ? { ...l, est_qty: 600 } : l);
  assert.equal(calcSection(acm, ls, { ...all, lines: ls }, 'est', st).get('w')!.qty, 0);
});
test('WSIB = 4% of install labour + PM', () => {
  const c = calcSection(inst, lines, all, 'est', st);
  assert.equal(c.get('ws')!.rate, 1500);
  assert.equal(c.get('ws')!.amount, 60);
});
test('pricing panel', () => {
  const est = new Map(); for (const s of sections) for (const [k, v] of calcSection(s, lines, all, 'est', st)) est.set(k, v);
  const job = { pr: { m: 23, t: 5, c: 2, cm: 'pct', d: 1000, dm: 'amt' }, tax: null } as unknown as Job;
  const p = pricing(job, sections, lines, est, st);
  // ACM 6000+1900+500 = 8400 (N), install 1000+60 (Y), pm 500 (Y), subtrades 2000 (forced N)
  assert.equal(p.A, 1560); assert.equal(p.B, 10400); assert.equal(p.P, 11960);
  assert.equal(p.U, 358.8); assert.equal(p.T, 598); assert.equal(p.C, 239.2);
  assert.equal(p.S0, 13156); assert.equal(p.D, 1000); assert.equal(p.Q, 12156);
  assert.equal(p.area, 400);
});
test('area override', () => {
  assert.equal(jobArea({ pr: { sf: '+50' } }, sections, st).area, 450);
  assert.equal(jobArea({ pr: { sf: '1000' } }, sections, st).area, 1000);
});
test('expressions', () => { assert.equal(evalExpr('10+5'), 15); assert.equal(evalExpr('2*(3+1)'), 8); assert.equal(evalExpr(''), null); assert.equal(evalExpr('abc'), null); });
test('cost tax split', () => {
  assert.deepEqual(costSplit(1, 113, true, 13), { amount: 100, tax: 13 });
  assert.deepEqual(costSplit(2, 56.5, true, 13), { amount: 100, tax: 13 });
  assert.deepEqual(costSplit(1, 113, false, 13), { amount: 113, tax: 0 });
  assert.deepEqual(costSplit(1, 113, true, 0), { amount: 113, tax: 0 });
  assert.deepEqual(costSplit(null, 50, true, 13), { amount: 0, tax: 0 });
  const s = costSplit(1, 99.99, true, 13); assert.equal(Math.round((s.amount + s.tax) * 100), 9999);
});
