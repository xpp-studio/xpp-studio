// Features added in version 1.1: homoclinic and heteroclinic orbits from the Bifurcation view (and the saddle found at the
// end of a branch of periodic orbits), continuation tolerances, the status history, stepping through a script, and the
// horizontal axis kept when the bifurcation diagram changes what it shows.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openPage } = require('./helpers/page.js');

// values from the page, copied into this realm so deepEqual compares them by value
const J = (P, code) => JSON.parse(P.app(`JSON.stringify(${code})`));
const ok = P => assert.match(P.status(), /^Script finished/, P.log().join('\n'));

test('Nagumo front: a heteroclinic orbit at the exact speed, followed in a second parameter', async () => {
  const P = await openPage();
  try {
    await P.run('example nagumo\nview bif');
    const from = P.app('S.eqs.findIndex(e=>Math.abs(e.x[0]-1)<1e-6)') + 1, to = P.app('S.eqs.findIndex(e=>Math.abs(e.x[0])<1e-6)') + 1;
    assert.ok(from > 0 && to > 0, 'both saddles are found');
    await P.run(`connect ${from} ${to}\ntppar a 0.05 0.45\nfollow HET1`);
    ok(P);
    const c = P.app("connPoints().map(q=>[q.label,q.p])");
    assert.equal(c.length, 1);
    assert.equal(c[0][0], 'HET1');
    assert.ok(Math.abs(c[0][1] - 0.5 / Math.SQRT2) < 1e-7, `c = ${c[0][1]}`);
    const err = P.app('Math.max(...S.tp.curves.at(-1).pts.map(q=>Math.abs(q.p1-(1-2*q.p2)/Math.SQRT2)))');
    const n = P.app('S.tp.curves.at(-1).pts.length');
    assert.ok(n > 20, `${n} points on the curve`);
    assert.ok(err < 1e-6, `largest error on the curve ${err}`);
    assert.match(P.app("$('#spList').textContent"), /HET1/);
    assert.deepEqual(P.errors, []);
  } finally { P.close(); }
});

test('Morris–Lecar: the saddle at the end of a branch of orbits whose period grows is loaded, and gives the homoclinic orbit', async () => {
  const P = await openPage();
  try {
    await P.run('example mlhom\nview bif\nbifpar i 0 60 ds=0.05\ncontinue eq 3\ncycles HB1');
    ok(P);
    const cand = P.app("(S.bif.connCand||[]).map(c=>({rev:c.rev,p:c.p,x:Array.from(c.x)}))");
    assert.equal(cand.length, 1, 'one saddle found at the end of the branch');
    assert.equal(cand[0].rev, false);
    assert.ok(Math.abs(cand[0].p - 35.0068) < 1e-3, `branch ends at i = ${cand[0].p}`);
    assert.equal(P.app("$('#cFrom').value"), 'c0');
    assert.equal(P.app("$('#cTo').value"), 'c0');
    assert.ok(P.$('#cFind').classList.contains('attn'), 'Find connecting orbit is highlighted');
    await P.run('connect end');
    ok(P);
    assert.ok(!P.$('#cFind').classList.contains('attn'), 'and no longer once the orbit is found');
    const hom = P.app("connPoints().map(q=>[q.label,q.p,q.conn.same])");
    assert.equal(hom[0][0], 'HOM1');
    assert.equal(hom[0][2], true);
    assert.ok(Math.abs(hom[0][1] - 35.0067343) < 1e-6, `i = ${hom[0][1]}`);
    // a homoclinic orbit is a point of the diagram in every display: at its max/min, L2 norm, and as T → ∞
    for (const m of ['L2', 'period', 'frequency', 'hilo']) await P.run(`show ${m}`);
    assert.deepEqual(P.errors, []);
  } finally { P.close(); }
});

test('switching the bifurcation diagram between hi-lo, L2 and period keeps the horizontal axis', async () => {
  const P = await openPage();
  try {
    await P.run('example ml\nview bif\nbifpar i 0 300 ds=1\ncontinue\ncycles HB1\nwindow 50 150 -60 40');
    ok(P);
    for (const m of ['L2', 'period', 'frequency', 'hilo']) {
      await P.run(`show ${m}`);
      const w = P.app('S.bif.win');
      assert.deepEqual([w.xlo, w.xhi], [50, 150], `after show ${m}`);
      assert.ok(w.yhi > w.ylo);
    }
  } finally { P.close(); }
});

test('continuation tolerances: set from the Numerics tab or a script, written into the .ode file, reset on load', async () => {
  const P = await openPage();
  try {
    await P.run('example ml\nnum eqtol=1e-8 restol=1e-5 itmax=20 tgrow=60');
    ok(P);
    assert.deepEqual(J(P, '[CTOL.eqTol,CTOL.resTol,CTOL.itMax,CTOL.tGrow,CTOL.poTol]'), [1e-8, 1e-5, 20, 60, 1e-9]);
    assert.equal(P.$('#cEqTol').value, '1e-8');
    // a branch still comes out right with looser tolerances
    await P.run('view bif\nbifpar i 0 300 ds=1\ncontinue');
    ok(P);
    const hb = P.app("allSpecial().filter(s=>s.type==='HB').map(s=>s.p)");
    assert.equal(hb.length, 2);
    await P.run('writestate');
    const ode = P.$('#odeText').value;
    assert.match(ode, /^@ eqtol=1e-8, restol=1e-5, itmax=20, tgrow=60$/m);
    await P.run('apply');
    assert.deepEqual(J(P, '[CTOL.eqTol,CTOL.itMax,CTOL.tGrow]'), [1e-8, 20, 60], 'read back from the file');
    await P.run('example fhn');
    assert.deepEqual(J(P, '[CTOL.eqTol,CTOL.itMax,CTOL.tGrow]'), [1e-10, null, 40], 'another model starts from the defaults');
    await P.run('num itmax=7\nnum itmax=auto');
    assert.equal(P.app('CTOL.itMax'), null);
  } finally { P.close(); }
});

test('the status history keeps every message with its time, merges progress reports, and is saved by a script', async () => {
  const P = await openPage();
  try {
    P.app("HIST.list=[]");
    P.app("status('Continuing: 4 points…');status('Continuing: 8 points…');status('Continuing: 12 points…');status('Done: 12 points');status('Something failed',true)");
    const h = J(P, 'HIST.list.map(x=>[x.msg,x.err])');
    assert.deepEqual(h, [['Continuing: 12 points…', false], ['Done: 12 points', false], ['Something failed', true]]);
    assert.match(P.app('historyText()'), /\d\d:\d\d:\d\d !  ?Something failed/);
    await P.run('example fhn\nview bif\ncontinue\nhistory save run-log');
    ok(P);
    const f = P.files.pop();
    assert.equal(f.name, 'run-log.txt');
    assert.match(f.data, /# XPP Studio status history/);
    assert.match(f.data, /Branch of \d+ points/);
    P.$('#histBtn').click();
    assert.ok(P.$('#histPop'), 'the History button opens the list');
    assert.ok(P.document.querySelectorAll('#histPop .histlist .h').length >= 3);
    await P.run('history clear');
    assert.equal(P.app('HIST.list.length'), 1, 'only the script message after clearing');
  } finally { P.close(); }
});

test('Step runs a script one command at a time; the script can be edited between steps, and Run finishes it', async () => {
  const P = await openPage();
  try {
    P.$('#scrText').value = 'example fhn\n# a comment\npar a=0.5\nfrobnicate\npar b=0.3';
    await P.app('stepScript()');
    assert.equal(P.app('S.spec.title.length>0'), true);
    assert.deepEqual(J(P, 'SCRIPT.hl'), { ln: 3, kind: 'next' }, 'the next command is marked in the script');
    assert.equal(P.$('#scrRestart').hidden, false);
    assert.equal(P.$('#scrRun').textContent, 'Run to end');
    await P.app('stepScript()');
    assert.equal(P.app("S.M.getParam(S.M.parNames.indexOf('a'))"), 0.5);
    await P.app('stepScript()'); // line 4 fails and stays next
    assert.match(P.status(), /line 4 failed/);
    assert.deepEqual(J(P, 'SCRIPT.hl'), { ln: 4, kind: 'err' }, 'the failed command is marked');
    P.$('#scrText').value = 'example fhn\n# a comment\npar a=0.5\npar a=0.7\npar b=0.3\npar b=0.4';
    await P.app('stepScript()'); // the corrected line 4
    assert.equal(P.app("S.M.getParam(S.M.parNames.indexOf('a'))"), 0.7);
    await P.app("runScript($('#scrText').value)"); // the rest, from line 5
    ok(P);
    assert.match(P.status(), /2 commands/);
    assert.equal(P.app("S.M.getParam(S.M.parNames.indexOf('b'))"), 0.4);
    assert.equal(P.$('#scrRun').textContent, 'Run');
    assert.equal(P.$('#scrRestart').hidden, true);
    // stepping to the very end finishes by itself
    P.$('#scrText').value = 'par a=0.1\npar a=0.2';
    await P.app('stepScript()');
    await P.app('stepScript()');
    assert.equal(P.app('SCRIPT.stepper'), null);
    assert.equal(P.app('SCRIPT.hl'), null);
    assert.match(P.status(), /end of the script/);
    assert.deepEqual(P.errors, []);
  } finally { P.close(); }
});

test('recording writes connect for Find and follow for a homoclinic orbit', async () => {
  const P = await openPage();
  try {
    await P.run('example nagumo\nview bif');
    P.app("SCRIPT.rec=true;$('#scrText').value=''");
    const k1 = P.app('S.eqs.findIndex(e=>Math.abs(e.x[0]-1)<1e-6)'), k0 = P.app('S.eqs.findIndex(e=>Math.abs(e.x[0])<1e-6)');
    P.app(`fillConnMenus();$('#cFrom').value='e${k1}';$('#cTo').value='e${k0}';$('#cRev').checked=false`);
    P.$('#cFind').click();
    await new Promise(r => setTimeout(r, 20));
    for (let i = 0; i < 200 && P.app('CONN.running'); i++) await new Promise(r => setTimeout(r, 50));
    assert.match(P.status(), /Heteroclinic orbit HET1/);
    const text = P.$('#scrText').value;
    assert.match(text, new RegExp(`^connect ${k1 + 1} ${k0 + 1}$`, 'm'));
    assert.match(text, /^bifpar c /m);
  } finally { P.close(); }
});

test('logistic map: each doubled branch starts at its period doubling, not on some other orbit of the same period', async () => {
  const P = await openPage();
  try {
    await P.run('example logistic\nview bif\nbifpar r 2.8 4 ds=0.01\ncontinue\ndouble PD1\ndouble PD2\ndouble PD3\ndouble PD4');
    ok(P);
    const pd = J(P, "allSpecial().filter(s=>s.type==='PD').map(s=>s.p)");
    const br = J(P, "S.bif.branches.filter(b=>!b.fam&&b.period>1).map(b=>[b.period,Math.min(...b.pts.map(q=>q.p))])");
    assert.deepEqual(br.map(b => b[0]), [2, 4, 8, 16]);
    br.forEach(([N, pmin], k) => assert.ok(Math.abs(pmin - pd[k]) < 2e-3, `period ${N} starts at r = ${pmin}, its period doubling is at ${pd[k]}`));
    // and is stable only from its own period doubling to the next
    const stable = J(P, "S.bif.branches.filter(b=>!b.fam&&b.period>1).map(b=>{const s=b.pts.filter(q=>q.stable).map(q=>q.p);return[Math.min(...s),Math.max(...s)];})");
    stable.forEach(([a, b], k) => assert.ok(a > pd[k] - 2e-3 && b < pd[k + 1] + 2e-3, `stable part of branch ${k + 1}: ${a}–${b}`));
  } finally { P.close(); }
});

test('a search for a connecting orbit, and its following, can be stopped', async () => {
  const P = await openPage();
  try {
    await P.run('example mlhom\nview bif\nbifpar i 0 40');
    const k = P.app("S.eqs.findIndex(e=>e.label==='Saddle')");
    P.app(`fillConnMenus();$('#cFrom').value='e${k}';$('#cTo').value='e${k}'`);
    P.$('#cFind').click();
    await new Promise(r => setTimeout(r, 300));
    assert.equal(P.$('#cFind').textContent, 'Stop', 'Find becomes Stop while it searches');
    assert.match(P.status(), /Searching for a homoclinic orbit/);
    P.$('#cFind').click();
    for (let i = 0; i < 100 && P.app('CONN.running'); i++) await new Promise(r => setTimeout(r, 50));
    assert.equal(P.app('CONN.running'), null);
    assert.match(P.status(), /Search stopped after/);
    assert.equal(P.$('#cFind').textContent, 'Find connecting orbit');
    assert.equal(P.app('S.bif.busy'), false);
    assert.equal(P.app("S.M.getParam(S.M.parNames.indexOf('i'))"), 37, 'the parameter is back where it was');
    // follow, stopped from the Two-parameter view
    await P.run(`connect ${k + 1}\ntppar phi 0.05 0.6`);
    P.app("runTwoPar(connPoints()[0])");
    await new Promise(r => setTimeout(r, 1500));
    assert.equal(P.$('#tRun').textContent, 'Stop');
    P.$('#tRun').click();
    for (let i = 0; i < 200 && P.app('S.tp.running'); i++) await new Promise(r => setTimeout(r, 50));
    assert.equal(P.app('S.tp.running'), false);
    assert.match(P.status(), /Homoclinic curve from HOM1: \d+ points.*you stopped it/);
    assert.deepEqual(P.errors, []);
  } finally { P.close(); }
});

test('Wilson–Cowan uses a small continuation step for every parameter, and Defaults puts the steps back', async () => {
  const P = await openPage();
  try {
    await P.run('example wc\nview bif\nbifpar aee\ncontinue eq 1');
    ok(P);
    assert.equal(P.app('S.bif.ds'), 0.01);
    assert.deepEqual(J(P, "allSpecial().map(s=>s.type).sort()"), ['HB', 'LP', 'LP'], 'both folds are found, not a spurious branch point');
    await P.run('bifpar ti');
    assert.equal(P.app('S.bif.ds'), 0.01, 'the file’s ds holds for every parameter');
    await P.run('num ds=0.5 nmax=50 pods=0.1');
    P.$('#cContReset').click();
    assert.deepEqual(J(P, '[S.bif.ds,S.cont.eqNmax,S.cont.poDs]'), [0.01, 3000, 0.02]);
    assert.equal(P.$('#bDs').value, '0.01');
  } finally { P.close(); }
});

test('a warning for names that differ only in capitals', async () => {
  const P = await openPage();
  try {
    P.$('#odeText').value = "V'=-V+w\nw'=-v\npar a=1\ndone\n";
    await P.run('apply');
    assert.match(P.$('#msgs').textContent, /not case-sensitive.*V and v/);
    await P.run('example fhn');
    assert.doesNotMatch(P.$('#msgs').textContent, /case-sensitive/);
  } finally { P.close(); }
});

test('Sweep uses one step size in both directions from the current value', async () => {
  const P = await openPage();
  try {
    await P.run('example ml\nview bif\nnum sweep=60\npar i=220\nbifpar i 0 300\nsweep');
    ok(P);
    const ps = J(P, 'S.bif.sweeps[0].rows.map(r=>r.p)').sort((a, b) => a - b);
    assert.equal(ps.length, 61);
    for (let k = 1; k < ps.length; k++) assert.ok(Math.abs(ps[k] - ps[k - 1] - 5) < 1e-9, `step ${ps[k] - ps[k - 1]} at ${ps[k]}`);
    assert.ok(Math.abs(ps[0]) < 1e-9 && Math.abs(ps[60] - 300) < 1e-9);
  } finally { P.close(); }
});

test('a branch of orbits that closes up on itself keeps the whole loop', async () => {
  const P = await openPage();
  try {
    await P.run('example forced\npar om=2\ngo\nview bif\nbifpar om 1.2 3\nlimitcycle');
    ok(P);
    const c = J(P, 'S.bif.cycles.map(c=>[c.pts.length,c.pts[0].p,c.pts.at(-1).p,c.pts[0].T,c.pts.at(-1).T])');
    assert.equal(c.length, 1);
    assert.ok(c[0][0] > 20);
    assert.ok(Math.abs(c[0][1] - c[0][2]) < 1e-9 && Math.abs(c[0][3] - c[0][4]) < 1e-9, `ends ${JSON.stringify(c[0])}`);
    assert.match(P.app("HIST.list.map(h=>h.msg).join('\\n')"), /closed up on itself/);
  } finally { P.close(); }
});

test('maps: minimal period only finds the period-2 orbit where Newton from the initial condition finds the fixed point', async () => {
  const P = await openPage();
  try {
    await P.run('example logistic\nview bif\npar r=3.2\nbifpar r 2.5 4 ds=0.005\nperiod 2\ninit x=0.6875\ncontinue');
    assert.ok(J(P, 'S.bif.branches[0].pts.every(q=>q.mp===1)'), 'without the option: the fixed point');
    await P.run('clear bif\nperiod 2 minimal\ncontinue');
    ok(P);
    const b = J(P, 'S.bif.branches.filter(b=>!b.fam).map(b=>[b.minOnly,b.pts.every(q=>q.mp===2),Math.min(...b.pts.map(q=>q.p)),b.special.map(s=>s.type+" "+s.p.toFixed(4))])');
    assert.equal(b.length, 1);
    assert.equal(b[0][0], true);
    assert.equal(b[0][1], true);
    assert.ok(Math.abs(b[0][2] - 3) < 1e-2, `starts at r = ${b[0][2]}`);
    assert.deepEqual(b[0][3], ['PD 3.4495'], 'its period doubling, once');
    assert.ok(P.$('#bMinPer').checked);
  } finally { P.close(); }
});

test('Morris–Lecar class 1: the orbits end in a SNIC at the fold of the equilibria', async () => {
  const P = await openPage();
  try {
    await P.run('example mlhom\npar phi=0.067 i=35\nview bif\nbifpar i 30 60 ds=0.05\ncontinue eq 1\npar i=45\ngo\nlimitcycle');
    ok(P);
    const lp = J(P, "allSpecial().filter(s=>s.type==='LP').map(s=>[s.p,!!s.snic])");
    assert.equal(lp.length, 1);
    assert.ok(Math.abs(lp[0][0] - 39.963) < 2e-3);
    assert.equal(lp[0][1], true, 'LP1 is marked SNIC');
    assert.match(P.app("HIST.list.map(h=>h.msg).join('\\n')"), /probably a SNIC/);
    assert.equal(P.app('(S.bif.connCand||[]).length'), 0, 'nothing is offered to the homoclinic search');
    assert.match(P.$('#spList').textContent, /SNIC/);
  } finally { P.close(); }
});

test('button names and the Lorenz 84 example', async () => {
  const P = await openPage();
  try {
    assert.equal(P.$('#datBtn').textContent, 'Export DAT');
    assert.equal(P.$('#saveDat').textContent, 'Save DAT');
    assert.equal(P.$('#cFind').textContent, 'Find connecting orbit');
    await P.run('example lorenz84\ngo\nview bif\ncontinue');
    ok(P);
    assert.ok(J(P, "allSpecial().some(s=>s.type==='HB')"));
  } finally { P.close(); }
});

test('nullclines start on only for planar ODEs; the 3D view keeps the equilibria chip and fits trajectories alone without them', async () => {
  const P = await openPage();
  try {
    await P.run('example ml');
    assert.equal(P.app('S.pp.nc'), true);
    await P.run('example lorenz84');
    assert.equal(P.app('S.pp.nc'), false);
    await P.run('example logistic');
    assert.equal(P.app('S.pp.nc'), false);
    await P.run('example lorenz\ngo\nview 3d');
    assert.equal(P.$('#ppToggles').hidden, false);
    assert.equal(P.$('#tgEq').hidden, false);
    assert.equal(P.$('#tgNc').hidden, true);
    // with the equilibria hidden the box is the trajectory's own range
    await P.run('equilibria off');
    P.app('S.p3.box=null;fitP3()');
    const box = J(P, 'S.p3.box'), tr = J(P, '[0,1,2].map(i=>{const c=S.trajs.at(-1).cols[S.p3[["xi","yi","zi"][i]]];return[Math.min(...c),Math.max(...c)];})');
    box.forEach(([lo, hi], i) => { const [a, b] = tr[i], pad = 0.03 * (b - a); assert.ok(Math.abs(lo - (a - pad)) < 1e-9 && Math.abs(hi - (b + pad)) < 1e-9, `axis ${i}`); });
  } finally { P.close(); }
});

test('clicking the bifurcation diagram away from the curves moves the parameter', async () => {
  const P = await openPage();
  try {
    await P.run('example ml\nview bif\nwindow 0 300 -80 60');
    P.app('render()');
    // the middle of the plot frame
    const fr = J(P, 'S.lastFrame');
    P.app(`onPlotClick(${fr.L + fr.W / 2},${fr.T + 5},false)`);
    const i = P.app("S.M.getParam(S.M.parNames.indexOf('i'))");
    assert.ok(Math.abs(i - 150) < 1, `i = ${i}`);
    assert.equal(+P.$('#pv-0').value, i);
  } finally { P.close(); }
});

test('Reset all forgets everything stored and starts afresh; About names the version', async () => {
  const P = await openPage();
  try {
    await P.run('example lorenz\nview 3d\nlegend on');
    P.$('#scrText').value = 'example fhn'; P.$('#scrText').dispatchEvent(new P.window.Event('input'));
    assert.ok(P.app("localStorage.getItem('xpps-text')"), 'the equations are stored');
    P.app('S.reload=()=>{window.__reloaded=true}');
    P.window.confirm = () => true;
    P.$('#resetAll').click();
    assert.equal(P.app('window.__reloaded'), true, 'the page starts again');
    assert.equal(P.app("Object.keys(localStorage).filter(k=>k.startsWith('xpps-')).length"), 0, 'nothing of ours is left stored');
    P.$('#aboutBtn').click();
    assert.equal(P.$('#aboutTitle').textContent, 'XPP Studio v1.2');
  } finally { P.close(); }
});
