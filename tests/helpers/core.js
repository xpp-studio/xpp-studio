// Loads the numerical core of index.html (the part between the ==CORE START== and ==CORE END== markers, plus the
// built-in examples) into Node, so that the solvers and continuation can be tested without a browser.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
const parts = html.split('// ==CORE START==');
if (parts.length !== 2) throw new Error('index.html should contain exactly one "// ==CORE START==" marker');
const core = parts[1].split('// ==CORE END==')[0];
const ex = /const EXAMPLES=\[.*?\n\];/s.exec(html);
if (!ex) throw new Error('could not find the EXAMPLES list in index.html');
const names = [...new Set([...core.matchAll(/^(?:function|const)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]))];

const sandbox = { console, Math, Float64Array, Int32Array, Uint8Array, Array, Object, Number, String, Map, Set, JSON, Error, performance };
vm.createContext(sandbox);
vm.runInContext(`${core}\n${ex[0]}\nglobalThis.__core={EXAMPLES,${names.join(',')}};`, sandbox, { filename: 'index.html#core' });
const C = sandbox.__core;

// a model from .ode text, or from the id of a built-in example
C.model = src => {
  const text = C.EXAMPLES.find(e => e.id === src)?.text ?? src;
  const spec = C.parseSpec(text);
  return { spec, M: C.buildModel(spec) };
};
C.parIndex = (spec, name) => {
  const i = spec.params.findIndex(p => p.name === name);
  if (i < 0) throw new Error(`no parameter ${name}`);
  return i;
};
module.exports = C;
