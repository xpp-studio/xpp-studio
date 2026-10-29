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
    await P.run('connect end');
    ok(P);
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
    assert.match(P.$('#scrLine').textContent, /next: line 3/);
    assert.equal(P.$('#scrRestart').hidden, false);
    assert.equal(P.$('#scrRun').textContent, 'Run to end');
    await P.app('stepScript()');
    assert.equal(P.app("S.M.getParam(S.M.parNames.indexOf('a'))"), 0.5);
    await P.app('stepScript()'); // line 4 fails and stays next
    assert.match(P.status(), /line 4 failed/);
    assert.match(P.$('#scrLine').textContent, /next: line 4/);
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
    assert.match(P.$('#scrLine').textContent, /end of script/);
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
    assert.match(P.status(), /Heteroclinic orbit HET1/);
    const text = P.$('#scrText').value;
    assert.match(text, new RegExp(`^connect ${k1 + 1} ${k0 + 1}$`, 'm'));
    assert.match(text, /^bifpar c /m);
  } finally { P.close(); }
});
