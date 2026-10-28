// The Script tab: commands, error reporting, exports, reproducibility, recording, and map period doubling.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { openPage } = require('./helpers/page.js');

// the names of the files in a zip, from its central directory
function zipNames(u8) {
  const b = Buffer.from(u8), names = [];
  const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(end >= 0, 'zip has an end record');
  let p = b.readUInt32LE(end + 16);
  for (let k = 0; k < b.readUInt16LE(end + 10); k++) {
    assert.equal(b.readUInt32LE(p), 0x02014b50, 'central directory entry');
    const n = b.readUInt16LE(p + 28), x = b.readUInt16LE(p + 30), c = b.readUInt16LE(p + 32);
    names.push(b.toString('utf8', p + 46, p + 46 + n)); p += 46 + n + x + c;
  }
  return names;
}

test('the example script makes five figures, identically each time', async () => {
  const P = await openPage();
  try {
    const script = P.app('SCRIPT_EXAMPLE');
    await P.run(script);
    assert.match(P.status(), /^Script finished/, P.log().join('\n'));
    assert.equal(P.files.length, 1, 'one zip');
    const first = P.files.pop();
    assert.ok(first.name.endsWith('.zip'));
    assert.deepEqual(zipNames(first.data), ['ml-phaseplane.svg', 'ml-bifurcation.svg', 'ml-bifurcation-L2.svg', 'ml-bifurcation.csv', 'ml-twopar.svg']);
    P.app('setParamVal(0,123,true)'); // disturb the state: the script must not depend on it
    await P.run(script);
    const second = P.files.pop();
    // compare everything except the zip timestamps
    const strip = u8 => { const b = Buffer.from(u8); for (const sig of [0x04034b50, 0x02014b50]) for (let p = b.indexOf(Buffer.from([0x50, 0x4b])); p >= 0; p = b.indexOf(Buffer.from([0x50, 0x4b]), p + 1)) if (b.readUInt32LE(p) === sig) b.fill(0, p + (sig === 0x04034b50 ? 10 : 12), p + (sig === 0x04034b50 ? 14 : 16)); return b; };
    assert.ok(strip(first.data).equals(strip(second.data)), 'the two runs produce identical files');
    assert.deepEqual(P.errors, []);
  } finally { P.close(); }
});

test('a failing command stops the script with its line number', async () => {
  const P = await openPage();
  try {
    await P.run('example ml\npar i=abc');
    assert.match(P.log().join('\n'), /Line 2: par i=abc\s+i should be a number/);
    await P.run('example fhn\nfrobnicate');
    assert.match(P.log().join('\n'), /Line 2: unknown command “frobnicate”/);
    await P.run('example ml\nfollow HB1');
    assert.match(P.log().join('\n'), /no special point HB1/);
  } finally { P.close(); }
});

test('logistic map: the period-doubling cascade by script', async () => {
  const P = await openPage();
  try {
    await P.run('example logistic\nview bif\nbifpar r 2.5 4 ds=0.01\ncontinue\ndouble PD1\ndouble PD2\ndouble PD3');
    assert.match(P.status(), /^Script finished/, P.log().join('\n'));
    const pd = P.app("allSpecial().filter(s=>s.type==='PD').map(s=>[s.p,(s.br&&s.br.period)||1])");
    const want = [[3, 1], [1 + Math.sqrt(6), 2], [3.544090, 4], [3.564407, 8]];
    assert.equal(pd.length, want.length, `PD points: ${JSON.stringify(pd)}`);
    want.forEach(([p, n], k) => { assert.ok(Math.abs(pd[k][0] - p) < 2e-4, `PD${k + 1} at ${pd[k][0]}, expected ${p}`); assert.equal(pd[k][1], n); });
    // each period-N orbit is drawn at all N of its points: N-1 image branches per family
    const fam = P.app('S.bif.branches.filter(b=>!b.fam).map(b=>[b.period||1,S.bif.branches.filter(q=>q.fam===b).length])');
    for (const [n, images] of fam) assert.equal(images, n - 1, `period ${n} has ${images} images`);
    await P.run('example logistic\npar r=3.84\nbifpar r 3.8 4 ds=0.002 period=3\ninit x=0.15\ncontinue');
    const p3 = P.app("allSpecial().map(s=>[s.type,s.p])");
    assert.ok(p3.some(([t, p]) => t === 'LP' && Math.abs(p - (1 + Math.sqrt(8))) < 1e-3), `period-3 fold: ${JSON.stringify(p3)}`);
  } finally { P.close(); }
});

test('recording writes the commands that reproduce what was done', async () => {
  const P = await openPage();
  try {
    await P.example('fhn');
    P.$('#scrText').value = '';
    P.$('#scrRec').click(); await new Promise(r => setTimeout(r, 20));
    const set = (id, v) => { const e = P.$(id); e.value = v; e.dispatchEvent(new P.window.Event('change')); };
    set('#pv-0', '0.5');
    set('#nTotal', '300');
    P.$('#tgNc').click();
    P.app("setView('tc')");
    P.$('#eraseBtn').click();
    P.$('#goBtn').click();
    P.$('#scrRec').click(); await new Promise(r => setTimeout(r, 20));
    const lines = P.$('#scrText').value.trim().split('\n');
    const pname = P.app('S.M.parNames[0]');
    assert.deepEqual(lines, ['example fhn', `par ${pname}=0.5`, 'num total=300', 'nullclines off', 'view tc', 'erase', 'go']);
  } finally { P.close(); }
});
