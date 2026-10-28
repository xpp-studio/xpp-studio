// Numerical core: integrators, equilibria, continuation and bifurcation detection against known values.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./helpers/core.js');

const near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: got ${got}, expected ${want} ± ${tol}`);

test('integrators solve x\' = -x to their expected accuracy', () => {
  const { M } = C.model("x'=-x\ninit x=1\ndone\n");
  const tol = { rk4: 1e-9, dp45: 1e-8, ros23: 1e-5, euler: 5e-3 };
  for (const [method, err] of Object.entries(tol)) {
    const tr = C.integrate(M, Float64Array.from([1]), { T: 1, dt: 0.01, method, tol: 1e-9 });
    const L = tr.t.length - 1;
    near(tr.t[L], 1, 1e-9, `${method} end time`);
    near(tr.cols[0][L], Math.exp(-1), err, `${method} x(1)`);
  }
});

test('Morris–Lecar: Hopf points of the equilibrium branch in i', () => {
  const { spec, M } = C.model('ml');
  const i = C.parIndex(spec, 'i');
  const r = C.continueBoth(M, i, C.newton(M, Float64Array.from([-30, 0.1])), { pmin: 0, pmax: 300, ds: 2, maxPts: 3000, xmax: 1e4 });
  const hb = r.special.filter(s => s.type === 'HB').map(s => s.p).sort((a, b) => a - b);
  assert.equal(hb.length, 2, 'two Hopf points');
  near(hb[0], 93.6815, 0.01, 'HB1');
  near(hb[1], 212.057, 0.02, 'HB2');
  for (const s of r.special.filter(s => s.type === 'HB')) assert.ok(s.l1 > 0, 'both Hopf points are subcritical at phi = 0.04');
});

test('Morris–Lecar: Hopf curve in (i, phi) with its Bogdanov–Takens and Bautin points', () => {
  const { spec, M } = C.model('ml');
  const i = C.parIndex(spec, 'i'), phi = C.parIndex(spec, 'phi');
  const r = C.continueBoth(M, i, C.newton(M, Float64Array.from([-30, 0.1])), { pmin: 0, pmax: 300, ds: 2, maxPts: 3000, xmax: 1e4 });
  const hb = r.special.find(s => s.type === 'HB');
  M.setParam(i, hb.p);
  const cv = C.twoParCurve(M, 'HB', i, phi, hb.x, { p1min: 0, p1max: 300, p2min: 0, p2max: 0.4, ds: 0.004, dsmax: 7.5, maxPts: 3000 });
  const of = t => cv.special.filter(s => s.type === t).sort((a, b) => a.p1 - b.p1);
  const gh = of('GH'), bt = of('BT');
  assert.equal(gh.length, 2, 'two generalised Hopf points');
  near(gh[0].p1, 124.083, 0.05, 'GH1 i'); near(gh[0].p2, 0.29974, 2e-4, 'GH1 phi');
  near(gh[1].p1, 165.862, 0.05, 'GH2 i'); near(gh[1].p2, 0.25305, 2e-4, 'GH2 phi');
  assert.equal(bt.length, 2, 'two Bogdanov–Takens points');
  near(bt[0].p1, 83.618, 0.05, 'BT1 i'); near(bt[1].p1, 222.436, 0.05, 'BT2 i');
});

test('Hénon map: fold and period doubling of the fixed point', () => {
  const { spec, M } = C.model('henon');
  const a = C.parIndex(spec, 'a');
  const r = C.continueBoth(M, a, C.newton(M, Float64Array.from([0.5, 0.15])), { pmin: -0.2, pmax: 1.45, ds: 0.01, maxPts: 3000, xmax: 100 });
  const at = t => r.special.find(s => s.type === t)?.p;
  near(at('LP'), -0.1225, 1e-3, 'fold: a = -(1-b)^2/4');
  near(at('PD'), 0.3675, 1e-3, 'period doubling: a = 3(1-b)^2/4');
});

test('logistic map: period doubling of the fixed point at r = 3', () => {
  const { spec, M } = C.model('logistic');
  const r = C.continueBoth(M, C.parIndex(spec, 'r'), C.newton(M, Float64Array.from([0.6])), { pmin: 2.5, pmax: 4, ds: 0.01, maxPts: 3000, xmax: 100 });
  near(r.special.find(s => s.type === 'PD').p, 3, 1e-5, 'PD');
});

test('Morris–Lecar: periodic orbits from HB1 have folds of cycles', () => {
  const { spec, M } = C.model('ml');
  const i = C.parIndex(spec, 'i');
  const r = C.continueBoth(M, i, C.newton(M, Float64Array.from([-30, 0.1])), { pmin: 0, pmax: 300, ds: 2, maxPts: 3000, xmax: 1e4 });
  const hb = r.special.find(s => s.type === 'HB');
  M.setParam(i, hb.p);
  const st = C.poFromHopf(M, i, hb, { m: 20, ds: 0.02, dsmax: 0.2, dt: 0.25, maxPts: 400, pmin: 0, pmax: 300, Tmax: 1e5, xscale: [10, 0.1] });
  let k = 0; while (k++ < 400 && C.poStep(st));
  assert.ok(st.pts.length > 30, `orbit branch has ${st.pts.length} points`);
  const T = st.pts.map(q => q.T);
  assert.ok(T.every(Number.isFinite) && Math.min(...T) > 0, 'periods are positive');
  const lpc = C.poSpecial(st.pts).filter(s => s.type === 'LPC');
  assert.ok(lpc.length >= 1, 'at least one fold of cycles');
});
