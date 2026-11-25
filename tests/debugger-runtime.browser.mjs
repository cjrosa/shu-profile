// Run from any served page on this site:
// await (await import('/tests/debugger-runtime.browser.mjs')).runTests()
// These exercise the real Pyodide worker, not a mock interpreter.
const assert = (condition, message) => { if (!condition) throw Error(message); };
function runCase(name, files, onPause, options = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/assets/js/debugger-worker.mjs', { type: 'module' });
    let count = 0;
    const output = [];
    const timer = setTimeout(() => finish(Error(`${name}: timed out`)), 45000);
    function finish(error) { clearTimeout(timer); worker.terminate(); error ? reject(error) : resolve({ name, pauses: count, output }); }
    const command = (action, extra = {}) => worker.postMessage({ type: 'command', command: { action, ...extra } });
    worker.onerror = event => finish(Error(event.message));
    worker.onmessage = ({ data }) => {
      try {
        if (data.type === 'ready') worker.postMessage({ type: 'start', files, watches: options.watches || [], breakpoints: options.breakpoints || [] });
        else if (data.type === 'paused') { count++; onPause(data.snapshot, count, command, worker, finish); }
        else if (data.type === 'output') output.push(data.text);
        else if (data.type === 'input') { assert(data.prompt === 'Name? ', 'Input prompt'); worker.postMessage({ type: 'input', value: 'Ada' }); }
        else if (data.type === 'fatal') finish(Error(data.message));
        else if (data.type === 'error') { assert(options.error && data.message.includes(options.error), data.message); finish(); }
        else if (data.type === 'finished') {
          assert(!options.error, 'Expected Python error');
          if (options.expectedOutput) assert(output.join('\n') === options.expectedOutput, `Unexpected output: ${output}`);
          if (options.pauses) assert(count === options.pauses, `Expected ${options.pauses} pauses, saw ${count}`);
          finish();
        }
      } catch (error) { finish(Error(`${name}: ${error.message}`)); }
    };
  });
}
export async function runTests() {
  const results = [];
  const files = { 'main.py': 'from helper import twice\nx = 3\ny = twice(x)\nprint(y)\n', 'helper.py': 'def twice(value):\n    result = value * 2\n    return result\n' };
  results.push(await runCase('Step over imports and calls', files, (s, n, send) => {
    assert(s.frames[0].file === 'main.py', 'Step Over entered imported code');
    assert(s.frames[0].line === n, 'Wrong next line');
    if (n === 4) assert(s.locals.find(v => v.name === 'y')?.value === '6', 'Return value unavailable');
    send('over');
  }, { expectedOutput: '6', pauses: 4 }));
  results.push(await runCase('Step into, inspect caller, watch scope, and step out', files, (s, n, send) => {
    if (n < 3) { send('over'); return; }
    if (n === 3) { send('into'); return; }
    if (n === 4) {
      assert(s.frames.length === 2 && s.frames[0].file === 'helper.py', 'Missing callee frame');
      assert(s.watches[0].value.includes('NameError'), 'Callee incorrectly inherited caller locals');
      send('inspect', { frame: 1 }); return;
    }
    if (n === 5) {
      assert(s.selected === 1 && s.watches[0].value === '3', 'Caller scope inspection failed');
      send('out'); return;
    }
    assert(s.frames.length === 1 && s.frames[0].line === 4, 'Step Out did not return to caller');
    send('continue');
  }, { watches: ['x'], expectedOutput: '6', pauses: 6 }));
  results.push(await runCase('Conditional breakpoint and before-line semantics', { 'main.py': 'total = 0\nfor i in range(4):\n    total += i\nprint(total)\n' }, (s, n, send) => {
    if (n === 2) { assert(s.reason.startsWith('Conditional'), 'Missing condition reason'); assert(s.locals.find(v => v.name === 'total').value === '1', 'Line executed before pause'); assert(s.watches[0].value === '2', 'Wrong iteration'); }
    send('continue');
  }, { watches: ['i'], breakpoints: [{ file: 'main.py', line: 3, condition: 'i == 2' }], expectedOutput: '6', pauses: 2 }));
  results.push(await runCase('Invalid condition is reported, disabled breakpoint ignored', { 'main.py': 'x = 1\nx += 1\nprint(x)\n' }, (s, n, send) => {
    if (n === 2) assert(s.reason.startsWith('Breakpoint condition error'), 'Condition error not explained');
    send('continue');
  }, { breakpoints: [{ file: 'main.py', line: 2, condition: 'missing > 0' }, { file: 'main.py', line: 3, enabled: false }], expectedOutput: '2', pauses: 2 }));
  results.push(await runCase('Recursive frames preserve separate locals', { 'main.py': 'def factorial(n):\n    if n == 0:\n        return 1\n    return n * factorial(n - 1)\nanswer = factorial(3)\nprint(answer)\n' }, (s, n, send) => {
    if (n === 2) { assert(s.frames.length === 5, 'Recursive frames collapsed'); assert(s.watches[0].value === '0', 'Wrong innermost value'); send('inspect', { frame: 1 }); }
    else if (n === 3) { assert(s.watches[0].value === '1', 'Parent recursion locals incorrect'); send('out'); }
    else send('continue');
  }, { watches: ['n'], breakpoints: [{ file: 'main.py', line: 3 }], expectedOutput: '6', pauses: 4 }));
  results.push(await runCase('Interactive input resumes execution', { 'main.py': 'name = input("Name? ")\nprint("Hello", name)\n' }, (s, n, send) => send('continue'), { expectedOutput: 'Hello Ada', pauses: 1 }));
  results.push(await runCase('Python runtime errors reach the UI', { 'main.py': 'answer = 1 / 0\n' }, (s, n, send) => send('continue'), { error: 'ZeroDivisionError' }));
  results.push(await runCase('Syntax errors reach the UI', { 'main.py': 'if True\n    pass\n' }, () => {}, { error: 'SyntaxError' }));
  results.push(await runCase('Pause and terminate an infinite Python loop', { 'main.py': 'i = 0\nwhile True:\n    i += 1\n' }, (s, n, send, worker, finish) => {
    if (n === 1) { send('continue'); setTimeout(() => worker.postMessage({ type: 'pause' }), 80); }
    else { assert(s.reason === 'Pause requested', 'Pause request was ignored'); assert(Number(s.locals.find(v => v.name === 'i').value) > 0, 'Loop did not advance'); finish(); }
  }));
  results.push(await runCase('Add a conditional breakpoint while running', { 'main.py': 'i = 0\nwhile True:\n    i += 1\n' }, (s, n, send, worker, finish) => {
    if (n === 1) {
      send('continue');
      worker.postMessage({ type: 'configure', configuration: { breakpoints: [{ file: 'main.py', line: 3, condition: 'i >= 1000' }], watches: ['i'] } });
    } else { assert(s.reason.startsWith('Conditional'), 'Live breakpoint was ignored'); assert(Number(s.watches[0].value) >= 1000, 'Live watch was not updated'); finish(); }
  }));
  return results;
}
