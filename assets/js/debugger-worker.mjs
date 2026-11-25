// Pinned runtime; the site needs no Python server or cross-origin isolation headers.
import { loadPyodide } from 'https://cdn.jsdelivr.net/pyodide/v314.0.8/full/pyodide.mjs';
let pending, pauseRequested = false, configuration = null;
const send = (type, data = {}) => postMessage({ type, ...data });
globalThis.debugWait = json => new Promise(resolve => {
  pending = resolve;
  send('paused', { snapshot: JSON.parse(json) });
});
globalThis.debugInput = prompt => new Promise(resolve => {
  pending = resolve;
  send('input', { prompt });
});
globalThis.debugYield = () => new Promise(resolve => setTimeout(() => {
  const update = { pause: pauseRequested, configuration };
  pauseRequested = false; configuration = null; resolve(JSON.stringify(update));
}, 0));
let python;
try {
  python = await loadPyodide();
  python.setStdout({ batched: text => send('output', { text }) });
  python.setStderr({ batched: text => send('output', { text }) });
  const supported = await python.runPythonAsync('from pyodide.ffi import can_run_sync\ncan_run_sync()');
  if (!supported) throw Error('Interactive debugging requires WebAssembly promise integration. Open this tool in a current Chrome or Edge browser.');
  const response = await fetch(new URL('./debugger-runtime.py', import.meta.url));
  if (!response.ok) throw Error('Could not load the debugger engine.');
  await python.runPythonAsync(await response.text());
  send('ready');
} catch (error) { send('fatal', { message: String(error) }); }
onmessage = async ({ data }) => {
  if (data.type === 'pause') { pauseRequested = true; return; }
  if (data.type === 'configure') { configuration = data.configuration; return; }
  if (data.type === 'command' && pending) {
    const resolve = pending; pending = null; resolve(JSON.stringify(data.command)); return;
  }
  if (data.type === 'input' && pending) {
    const resolve = pending; pending = null; resolve(data.value); return;
  }
  if (data.type !== 'start' || !python) return;
  try {
    python.globals.set('_request_json', JSON.stringify(data));
    await python.runPythonAsync('_debug_run(_request_json)');
    send('finished');
  } catch (error) { send('error', { message: String(error) }); }
};
