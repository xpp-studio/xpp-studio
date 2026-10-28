// Every built-in example, and every .ode file in examples/, loads and integrates without errors.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { openPage } = require('./helpers/page.js');

test('built-in examples load and run', async () => {
  const P = await openPage();
  try {
    const ids = P.app('EXAMPLES.map(e=>e.id)');
    assert.ok(ids.length >= 20, `${ids.length} examples`);
    for (const id of ids) {
      await P.example(id);
      assert.equal(P.app('S.M?1:0'), 1, `${id}: model loaded`);
      assert.ok(!P.$('#status').classList.contains('err'), `${id}: ${P.status()}`);
      const finite = P.app('S.trajs.every(t=>t.cols.every(c=>Array.prototype.every.call(c,Number.isFinite)))');
      assert.ok(finite, `${id}: trajectory values are finite`);
    }
    assert.deepEqual(P.errors, []);
  } finally { P.close(); }
});

test('examples/*.ode files load', async () => {
  const dir = path.join(__dirname, '..', 'examples');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ode'));
  assert.ok(files.length > 0);
  const P = await openPage();
  try {
    for (const f of files) {
      const text = fs.readFileSync(path.join(dir, f), 'utf8');
      const ok = P.app(`loadModel(${JSON.stringify(text)})`);
      assert.ok(ok !== false && P.app('S.M?1:0'), `${f}: ${P.status()}`);
    }
    assert.deepEqual(P.errors, []);
  } finally { P.close(); }
});
