// Opens index.html in jsdom (a browser simulation in Node) with the canvas stubbed out, so the interface and the
// script engine can be tested without a real browser. Drawing is not checked here; everything else runs as it does
// in the page. Two hooks are added to a copy of the page: window.__eval runs code inside the app, and
// window.__deliver receives files the app would save.
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');

function hooked() {
  let s = SRC;
  const init = 'function init(){';
  const sink = 'if(SCRIPT.files){SCRIPT.files.push({name:filename,data:text});return;}';
  if (!s.includes(init)) throw new Error(`index.html no longer contains "${init}"; update tests/helpers/page.js`);
  if (!s.includes(sink)) throw new Error('index.html no longer contains the script export sink; update tests/helpers/page.js');
  s = s.replace(init, 'window.__eval=c=>eval(c);\n' + init);
  s = s.replace(sink, sink + 'if(window.__deliver)return window.__deliver(text,filename);');
  return s;
}

async function openPage() {
  const errors = [];
  const files = [];
  const dom = new JSDOM(hooked(), {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.org/',
    beforeParse(w) {
      const noop = new Proxy(function () {}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 20 }) : noop), apply: () => undefined, set: () => true });
      w.HTMLCanvasElement.prototype.getContext = () => noop;
      w.ResizeObserver = class { observe() {} };
      w.matchMedia = () => ({ matches: false, addEventListener() {} });
      w.requestAnimationFrame = f => w.setTimeout(() => f(0), 0); // the window's own timer, cleared when it closes
      w.TextEncoder = TextEncoder;
      w.confirm = () => true;
      w.Element.prototype.setPointerCapture = () => {};
      w.Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 900, height: 600, x: 0, y: 0, right: 900, bottom: 600 });
      w.addEventListener('error', e => errors.push(`${e.message} (line ${e.lineno})`));
      w.__deliver = (data, name) => { files.push({ name, data }); };
    },
  });
  const w = dom.window;
  await new Promise(r => setTimeout(r, 50));
  const $ = s => w.document.querySelector(s);
  const app = code => w.__eval(code);
  return {
    window: w, document: w.document, $, app, errors, files,
    status: () => $('#status').textContent,
    log: () => [...w.document.querySelectorAll('#scrLog div')].map(d => d.textContent),
    // run a script to completion
    run: text => app('runScript')(text),
    // choose a built-in example from the Model menu
    example: async id => { const s = $('#exSel'); s.value = id; s.dispatchEvent(new w.Event('change')); await new Promise(r => setTimeout(r, 20)); },
    close: () => w.close(),
  };
}
module.exports = { openPage };
