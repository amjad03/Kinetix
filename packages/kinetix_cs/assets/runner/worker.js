// The code lab's worker: one for Python (Pyodide), one for JavaScript. Messages in:
// {cmd: 'load'} and {cmd: 'run', id, code, stdin}. Messages out: {id, event: 'out'|'err', text},
// {id, event: 'done', status, ms}, and {event: 'loading'} and {event: 'loaded'} while Python starts.
'use strict';

var lang = new URL(self.location.href).searchParams.get('lang');
var pyodideReady = null;

function out(id, event, text) { self.postMessage({ id: id, event: event, text: text }); }

function lines(stdin) {
  var all = String(stdin).split('\n');
  if (all.length && all[all.length - 1] === '') all.pop();
  var i = 0;
  return function () { return i < all.length ? all[i++] : null; };
}

var MISSING = 'python_missing';

// Python comes from the app's server under py/: a copy downloaded once and kept on the device,
// or one bundled in the app (py/info.json says whether it is pyodide.mjs or pyodide.js).
function loadPython() {
  if (pyodideReady) return pyodideReady;
  self.postMessage({ event: 'loading', text: 'python' });
  var base = new URL('py/', self.location.href).href;
  pyodideReady = fetch('py/info.json', { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (info) {
      if (info.kind === 'mjs') return import(base + 'pyodide.mjs').then(function (m) { return m.loadPyodide; });
      if (info.kind === 'js') { importScripts(base + 'pyodide.js'); return self.loadPyodide; }
      var e = new Error('Python is not on this device yet.'); e.code = MISSING; throw e;
    })
    .then(function (load) { return load({ indexURL: base }); })
    .then(function (py) { self.postMessage({ event: 'loaded' }); return py; });
  // A failed start is not kept: the next run tries again (e.g. after "Get Python").
  pyodideReady.catch(function () { pyodideReady = null; });
  return pyodideReady;
}

function runPython(job) {
  var t0 = Date.now();
  loadPython().then(function (py) {
    var next = lines(job.stdin);
    py.setStdin({ stdin: function () { var l = next(); return l === null ? undefined : l + '\n'; } });
    py.setStdout({ batched: function (s) { out(job.id, 'out', s + '\n'); } });
    py.setStderr({ batched: function (s) { out(job.id, 'err', s + '\n'); } });
    try {
      // A fresh namespace for every run, so one program's names do not leak into the next.
      var ns = py.globals.get('dict')();
      py.runPython(job.code, { globals: ns, filename: 'main.py' });
      ns.destroy();
      self.postMessage({ id: job.id, event: 'done', status: 'ok', ms: Date.now() - t0 });
    } catch (e) {
      // Keep the traceback from the program's own lines.
      var msg = String(e.message || e);
      var at = msg.indexOf('File "main.py"');
      out(job.id, 'err', (at >= 0 ? 'Traceback (most recent call last):\n  ' + msg.slice(at) : msg) + '\n');
      self.postMessage({ id: job.id, event: 'done', status: 'runtime_error', ms: Date.now() - t0 });
    }
  }, function (e) {
    self.postMessage({ event: 'loaded' });
    if (e && e.code === MISSING) { self.postMessage({ id: job.id, event: 'done', status: 'unavailable', reason: MISSING, ms: 0 }); return; }
    out(job.id, 'err', String(e.message || e) + '\n');
    self.postMessage({ id: job.id, event: 'done', status: 'runtime_error', ms: Date.now() - t0 });
  });
}

function show(v) {
  if (typeof v === 'string') return v;
  try { return typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v); } catch (e) { return String(v); }
}

function runJs(job) {
  var t0 = Date.now();
  var next = lines(job.stdin);
  var print = function () { out(job.id, 'out', Array.prototype.map.call(arguments, show).join(' ') + '\n'); };
  var printErr = function () { out(job.id, 'err', Array.prototype.map.call(arguments, show).join(' ') + '\n'); };
  var console = { log: print, info: print, debug: print, warn: printErr, error: printErr, table: print };
  // prompt() and readLine() read the input box a line at a time.
  var prompt = function () { var l = next(); return l === null ? null : l; };
  try {
    var result = new Function('console', 'prompt', 'readLine', 'input', '"use strict";\n' + job.code)(console, prompt, prompt, prompt);
    var finish = function () { self.postMessage({ id: job.id, event: 'done', status: 'ok', ms: Date.now() - t0 }); };
    if (result && typeof result.then === 'function') result.then(finish, function (e) { printErr(String(e)); self.postMessage({ id: job.id, event: 'done', status: 'runtime_error', ms: Date.now() - t0 }); });
    else finish();
  } catch (e) {
    // The program starts on line 4 of the function new Function builds (V8's stack).
    var at = /<anonymous>:(\d+):(\d+)/.exec(String(e && e.stack));
    printErr((e && e.name ? e.name + ': ' : '') + (e && e.message ? e.message : String(e)) + (at && at[1] > 3 ? '\n    at line ' + (at[1] - 3) + ':' + at[2] : ''));
    self.postMessage({ id: job.id, event: 'done', status: 'runtime_error', ms: Date.now() - t0 });
  }
}

self.onmessage = function (e) {
  var m = e.data;
  if (m.cmd === 'load' && lang === 'python') loadPython().catch(function () {});
  if (m.cmd === 'run') (lang === 'python' ? runPython : runJs)(m);
};
