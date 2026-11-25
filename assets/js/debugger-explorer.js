(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const initialFiles = {
    'main.py': 'from conversions import to_fahrenheit\n\ntemperatures = [0, 20, 100]\nresults = []\nfor index in range(len(temperatures) - 1):\n    celsius = temperatures[index]\n    fahrenheit = to_fahrenheit(celsius)\n    results.append(fahrenheit)\n\nprint("Fahrenheit:", results)\n',
    'conversions.py': 'def to_fahrenheit(celsius):\n    scaled = celsius * 9 / 5\n    fahrenheit = scaled + 32\n    return fahrenheit\n'
  };
  const lessons = [
    ['Start with a prediction', 'The inputs are 0, 20, and 100 °C. Predict the three Fahrenheit values. Click Start: Python pauses before the first line executes.', 'The expected values are 32.0, 68.0, and 212.0. The yellow line has not executed yet.'],
    ['Inspect a loop', 'If the debugger is stopped, click Run and Debug first. Once paused, set a breakpoint on line 6 of main.py. In Watch, click + to add index and len(temperatures), one at a time. Click Continue to reach line 6. Compare index (the current position) with len(temperatures) (the item count). Click Continue again: which index values appear, and does the loop reach the final valid index, len(temperatures) - 1?', 'The list has 3 items, so its valid indices are 0, 1, and 2. The breakpoint is reached with index 0 and 1, but never 2. The loop stops before the last item.'],
    ['Follow a function call', 'Step Over line 6, then Step Into line 7. Open the call stack and select main.py to compare its locals with to_fahrenheit. Select the top frame again, then Step Out.', 'Step Into enters conversions.py. Each function call has its own locals. Step Out completes the function and pauses in its caller.'],
    ['Use a condition', 'Under Breakpoints, enter index == 1 for your breakpoint on line 6. Restart, then Continue. Why does the debugger pause only on the second iteration?', 'A conditional breakpoint pauses only when its expression is true. Watch expressions are evaluated in the selected frame.'],
    ['Repair and verify', 'Continue to see the incomplete output. Stop, edit the loop so all temperatures are converted, then select Check repair. Explain why the original loop skipped 100 °C.', 'range stops before its upper bound. Remove the subtraction from len(temperatures) - 1. Check repair runs the current code with breakpoints temporarily ignored.']
  ];
  const debuggerNotes = [
    [
      ['Control', 'Start begins main.py and pauses before its first executable line. Step Over executes the highlighted line and pauses at the next one.'],
      ['Look for', 'The yellow arrow and highlight mark the line that will run next, not one that has already run. Variables lists the selected frame\'s local values; it may be empty before assignments execute.'],
      ['Try it', 'Step Over the import and the temperatures assignment. When execution moves past the assignment, find temperatures in Variables. Its value did not exist before that line ran.']
    ],
    [
      ['Control', 'A red gutter dot is a breakpoint. Continue runs until the next breakpoint or the end, instead of pausing on every line.'],
      ['Look for', 'Watch evaluates the expressions you add whenever execution pauses. At line 6, index is the current list position and len(temperatures) is the total item count. The highlighted assignment has not run yet, so celsius may be absent or still hold its previous value.'],
      ['Compare', 'Record index at each stop on line 6 and compare it with the valid positions 0 through len(temperatures) - 1. Does the last position ever appear? Continue until the program finishes to confirm which iterations occurred.']
    ],
    [
      ['Get ready', 'Restart, then Continue to your breakpoint on line 6. Step Over assigns celsius; Step Into on line 7 enters to_fahrenheit.'],
      ['Look for', 'The editor switches to conversions.py and Call Stack gains a to_fahrenheit frame above main.py. Variables now shows the function\'s locals. Selecting main.py in Call Stack changes the values you inspect; it does not execute code.'],
      ['Control', 'Select the top frame again, then Step Out to finish the function and return to its caller. The function frame disappears. Step Over at a function call would run that entire call without entering it.']
    ],
    [
      ['Set it', 'Use the pencil beside the line-6 breakpoint to enter index == 1. Keep its checkbox enabled. Restart starts fresh execution but preserves your breakpoints and watches.'],
      ['Look for', 'After Restart pauses at the first line, Continue. Execution passes index 0 without stopping at line 6, then pauses there when index is 1. Confirm this in Watch.'],
      ['Understand', 'The condition is tested before the breakpoint line executes. It skips a pause, not a loop iteration. Disable the breakpoint checkbox to ignore that breakpoint without deleting its condition.']
    ],
    [
      ['Edit', 'Stop ends execution and unlocks the editor. Fix the loop boundary so it visits every item. Your breakpoints and watches remain saved.'],
      ['Verify', 'Check repair ends any current debug run and runs your current code from the beginning, ignoring breakpoints. It compares the complete output with Fahrenheit: [32.0, 68.0, 212.0]. This checks the result; it does not step through the repair.'],
      ['Explain', 'To inspect why the fix works, remove the breakpoint condition, then Start and Continue through line 6. Confirm that index now reaches 2. Use Watch for state, the yellow line for the next action, and Terminal for printed output.']
    ]
  ];
  let files = { ...initialFiles }, activeFile = 'main.py', breakpoints = [], watches = [];
  let worker, phase = 'idle', snapshot = null, previousLocals = new Map(), lesson = 0, checking = false, runOutput = '', pendingInspect = false, debugView = true;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  function status(message) { $('status').textContent = message; }
  function setPhase(next) {
    phase = next;
    const busy = ['loading', 'running', 'paused', 'input'].includes(next);
    $('code').readOnly = busy;
    $('add-file').disabled = busy;
    $('start').disabled = ['loading', 'running', 'input'].includes(next);
    $('start').querySelector('b').textContent = next === 'paused' ? 'Continue' : 'Start';
    $('start').setAttribute('aria-label', next === 'paused' ? 'Continue' : 'Start');
    $('start').hidden = next === 'running';
    $('pause').hidden = next !== 'running';
    $('pause').disabled = next !== 'running';
    for (const action of ['over', 'into', 'out']) $(action).disabled = next !== 'paused' || (action === 'out' && snapshot?.frames.length < 2);
    $('restart').disabled = next === 'loading';
    $('stop').disabled = !busy;
    $('check').disabled = checking;
    $('check').title = checking ? 'Checking the current code' : 'End the current debug run and check the code from the beginning, ignoring breakpoints';
    $('run-debug').disabled = busy;
    $('run-debug').textContent = next === 'loading' ? 'Loading Python…' : 'Run and Debug';
    renderView();
    renderStack();
  }
  function save() { files[activeFile] = $('code').value; }
  function renderFiles() {
    $('files').innerHTML = Object.keys(files).map(name => `<button class="file ${name === activeFile ? 'active' : ''}" data-file="${esc(name)}"><span>PY</span>${esc(name)}</button>`).join('');
    $('tabs').innerHTML = Object.keys(files).map(name => `<button class="tab" role="tab" aria-selected="${name === activeFile}" data-file="${esc(name)}"><span class="python-tab-icon" aria-hidden="true">PY</span><span>${esc(name)}</span></button>`).join('');
    document.querySelectorAll('[data-file]').forEach(button => button.onclick = () => openFile(button.dataset.file));
  }
  function openFile(name) {
    save(); activeFile = name; $('code').value = files[name];
    renderFiles(); renderGutter();
  }
  function renderGutter() {
    const digits = String($('code').value.split('\n').length).length;
    $('code').closest('.editor').style.setProperty('--gutter-width', Math.max(54, 32 + digits * 8) + 'px');
    // Color only the display layer; Python still receives the untouched editor text.
    $('code-colors').innerHTML = highlightPython($('code').value) + '\n';
    const frame = snapshot?.frames[snapshot.selected];
    const current = phase === 'paused' && frame?.file === activeFile ? frame.line : 0;
    $('gutter').innerHTML = $('code').value.split('\n').map((_, i) => {
      const line = i + 1, bp = breakpoints.find(b => b.file === activeFile && b.line === line);
      return `<button class="${bp?.enabled ? 'bp' : ''} ${bp?.condition ? 'conditional' : ''} ${line === current ? 'current' : ''}" data-line="${line}" aria-label="Toggle breakpoint on line ${line}" aria-pressed="${!!bp}" title="Line ${line}${bp?.condition ? ': ' + esc(bp.condition) : ''}">${line}</button>`;
    }).join('');
    $('gutter').querySelectorAll('button').forEach(button => button.onclick = () => {
      const line = Number(button.dataset.line), index = breakpoints.findIndex(b => b.file === activeFile && b.line === line);
      if (index < 0) breakpoints.push({ file: activeFile, line, enabled: true, condition: '' });
      else breakpoints.splice(index, 1);
      renderGutter(); renderBreakpoints(); inspect();
    });
    $('code-colors').style.backgroundImage = current ? `linear-gradient(to bottom, transparent ${10 + (current - 1) * 23}px, var(--line-highlight) ${10 + (current - 1) * 23}px, var(--line-highlight) ${10 + current * 23}px, transparent ${10 + current * 23}px)` : 'none';
    $('code-colors').scrollTop = $('code').scrollTop;
    $('code-colors').scrollLeft = $('code').scrollLeft;
    $('gutter').scrollTop = $('code').scrollTop;
  }
  function highlightPython(source, initialDepth = 0) {
    const span = (kind, text) => `<span class="syntax-${kind}">${esc(text)}</span>`;
    const keyword = /^(def|class|return|for|in|if|elif|else|while|break|continue|import|from|as|try|except|finally|raise|with|pass|True|False|None|and|or|not|is|del|async|await|lambda|yield|assert|global|nonlocal)$/;
    const type = /^(float|int|str|bool|list|dict|tuple|set|bytes|object|type)$/;
    const tokens = /#[^\n]*|(?:[fFrRbBuU]{0,2})(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*(?:"|$)|'(?:\\.|[^'\\\n])*(?:'|$))|\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|[A-Za-z_]\w*|[()[\]{}]|[+\-*\/%=<>!&|^~:]+|[\s\S]/g;
    let depth = initialDepth, html = '';
    for (const match of source.matchAll(tokens)) {
      const token = match[0];
      if (token.startsWith('#')) html += span('comment', token);
      else if (/^[fFrRbBuU]{0,2}["']/.test(token)) {
        // Highlight simple replacement fields independently of the surrounding string.
        // Unmatched/nested fields remain string-colored while the student is editing.
        if (/^[fFrRbBuU]*[fF][fFrRbBuU]*["']/.test(token)) {
          let last = 0;
          for (const field of token.matchAll(/\{\{|\}\}|\{[^{}]*\}/g)) {
            html += span('string', token.slice(last, field.index));
            if (field[0] === '{{' || field[0] === '}}') html += span('string', field[0]);
            else {
              const body = field[0].slice(1, -1), format = body.match(/(:[^:]*|![rsa](?::.*)?)$/);
              const expression = format ? body.slice(0, format.index) : body;
              html += span('interpolation', '{') + highlightPython(expression, depth + 1);
              if (format) html += span('format', format[0]);
              html += span('interpolation', '}');
            }
            last = field.index + field[0].length;
          }
          html += span('string', token.slice(last));
        } else html += span('string', token);
      } else if (/^\d/.test(token)) html += span('number', token);
      else if (keyword.test(token)) html += span('keyword', token);
      else if (type.test(token)) html += span('type', token);
      else if (/^[A-Za-z_]\w*$/.test(token) && /^\s*\(/.test(source.slice(match.index + token.length))) html += span('function', token);
      else if (/^[([{]$/.test(token)) html += span('bracket-' + (depth++ % 3), token);
      else if (/^[)\]}]$/.test(token)) { depth = Math.max(0, depth - 1); html += span('bracket-' + (depth % 3), token); }
      else if (/^[+\-*\/%=<>!&|^~:]+$/.test(token)) html += span('operator', token);
      else html += esc(token);
    }
    return html;
  }
  function renderBreakpoints() {
    $('breakpoints').innerHTML = breakpoints.map((bp, i) => `<div class="breakpoint"><div class="breakpoint-row"><span class="breakpoint-dot ${bp.enabled ? '' : 'disabled'}" aria-hidden="true"></span><input type="checkbox" data-enable="${i}" aria-label="Enable breakpoint ${esc(bp.file)} line ${bp.line}" ${bp.enabled ? 'checked' : ''}><span class="breakpoint-file">${esc(bp.file)}</span><button class="breakpoint-action" data-edit="${i}" aria-label="Edit condition for line ${bp.line}" title="Edit condition" aria-expanded="${!!bp.condition}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3 13 10-10 4 4L7 17l-5 1zM11 5l4 4"/></svg></button><button class="breakpoint-action" data-remove="${i}" aria-label="Remove breakpoint ${esc(bp.file)} line ${bp.line}" title="Remove breakpoint"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 4 12 12M16 4 4 16"/></svg></button><span class="line-badge">${bp.line}</span></div><input class="condition" data-condition="${i}" ${bp.condition ? '' : 'hidden'} aria-label="Condition for ${esc(bp.file)} line ${bp.line}" placeholder="Condition, e.g. index == 1" value="${esc(bp.condition)}"></div>`).join('') || '<p class="empty">No breakpoints.</p>';
    $('clear-breakpoints').disabled = breakpoints.length === 0;
    $('toggle-breakpoints').disabled = breakpoints.length === 0;
    $('breakpoints').querySelectorAll('[data-edit]').forEach(button => button.onclick = () => {
      const input = $('breakpoints').querySelector('[data-condition="' + button.dataset.edit + '"]');
      input.hidden = !input.hidden; button.setAttribute('aria-expanded', String(!input.hidden)); if (!input.hidden) input.focus();
    });
    $('breakpoints').querySelectorAll('[data-enable]').forEach(el => el.onchange = () => { breakpoints[el.dataset.enable].enabled = el.checked; renderBreakpoints(); renderGutter(); inspect(); });
    $('breakpoints').querySelectorAll('[data-condition]').forEach(el => el.onchange = () => { breakpoints[el.dataset.condition].condition = el.value; renderGutter(); inspect(); });
    $('breakpoints').querySelectorAll('[data-remove]').forEach(el => el.onclick = () => { breakpoints.splice(Number(el.dataset.remove), 1); renderBreakpoints(); renderGutter(); inspect(); });
  }
  function renderStack() {
    const active = ['running', 'paused', 'input'].includes(phase);
    if (!active) { $('stack').innerHTML = '<p class="empty">No active calls.</p>'; return; }
    const icon = '<svg class="stack-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="13" rx="5"/><path d="M9 6V4a3 3 0 0 1 6 0v2M2 9h4m12 0h4M2 14h4m12 0h4M4 20l4-3m8 0 4 3M12 7v11"/></svg>';
    const label = phase === 'paused' ? (/breakpoint/i.test(snapshot?.reason || '') ? 'Paused on breakpoint' : 'Paused on step') : phase === 'input' ? 'Waiting for input' : 'Running';
    const frames = phase === 'paused' ? snapshot?.frames || [] : [];
    const expanded = $('stack-program')?.open ?? true;
    $('stack').innerHTML = '<div class="stack-session">' + icon + '<span>Python Debugger</span><span class="stack-status">Running</span></div><details id="stack-program" ' + (expanded ? 'open' : '') + '><summary>' + icon + '<span class="stack-program-name">Debug main.py</span><span class="stack-status">' + esc(label) + '</span></summary><div class="stack-frames">' + frames.map((f,i) => '<button class="frame ' + (i === snapshot.selected ? 'active' : '') + '" data-frame="' + i + '" aria-pressed="' + (i === snapshot.selected) + '" title="' + esc(f.name + ' - ' + f.file + ':' + f.line) + '"><span class="frame-name">' + esc(f.name) + '</span><span class="frame-file">' + esc(f.file) + '</span><span class="line-badge">' + f.line + '</span></button>').join('') + '</div></details>';
    const controls = document.createElement('span'); controls.className = 'stack-controls';
    for (const action of [phase === 'running' ? 'pause' : 'start', 'over', 'into', 'out', 'restart', 'stop']) {
      const original = $(action), button = original.cloneNode(true);
      button.removeAttribute('id'); button.dataset.debugAction = action; button.hidden = false; button.title = original.getAttribute('aria-label') || action;
      button.querySelector('b')?.remove(); button.onclick = event => { event.preventDefault(); event.stopPropagation(); original.click(); };
      controls.append(button);
    }
    $('stack-program').querySelector('summary').append(controls);
    $('stack').querySelectorAll('[data-frame]').forEach(button => button.onclick = () => inspect(Number(button.dataset.frame)));
  }
  function renderState() {
    const frame = snapshot?.frames[snapshot.selected];
    const old = previousLocals;
    previousLocals = new Map();
    $('locals').innerHTML = snapshot?.locals.map(v => {
      const key = `${snapshot.selected}:${frame.file}:${frame.name}:${v.name}`;
      previousLocals.set(key, v.value);
      return `<div class="value ${old.has(key) && old.get(key) !== v.value ? 'changed' : ''}"><span class="name">${esc(v.name)}</span> <small>${esc(v.type)}</small><br><code>${esc(v.value)}</code></div>`;
    }).join('') || '<p class="empty">No local variables yet.</p>';
    renderWatches();
    renderStack();
    if (frame) {
      openFile(frame.file);
      const top = (frame.line - 1) * 23;
      if (top < $('code').scrollTop || top > $('code').scrollTop + $('code').clientHeight - 46) $('code').scrollTop = Math.max(0, top - 46);
      $('gutter').scrollTop = $('code').scrollTop;
    }
  }
  function renderWatches() {
    $('clear-watches').disabled = watches.length === 0;
    $('collapse-watches').disabled = watches.length === 0;
    $('watches').innerHTML = watches.map((expression, i) => `<div class="value"><button class="remove" data-watch="${i}" aria-label="Remove watch ${esc(expression)}">×</button><span class="name">${esc(expression)}</span><br><code>${esc(snapshot?.watches.find(w => w.expression === expression)?.value ?? 'Available when paused')}</code></div>`).join('');
    $('watches').querySelectorAll('button').forEach(button => button.onclick = () => { watches.splice(Number(button.dataset.watch), 1); renderWatches(); inspect(); });
  }
  function command(action, frame = snapshot?.selected ?? 0) {
    if (phase !== 'paused') return;
    pendingInspect = action === 'inspect';
    worker.postMessage({ type: 'command', command: { action, frame, watches, breakpoints: checking ? [] : breakpoints } });
    setPhase('running');
    if (!pendingInspect) { status('Running Python…'); renderGutter(); }
  }
  function inspect(frame) {
    if (phase === 'paused') command('inspect', frame);
    else worker?.postMessage({ type: 'configure', configuration: { breakpoints: checking ? [] : breakpoints, watches } });
  }
  function append(text) {
    runOutput += text + '\n';
    if (runOutput.length > 100000) runOutput = runOutput.slice(-100000);
    $('output').textContent = runOutput;
    $('output').parentElement.scrollTop = $('output').parentElement.scrollHeight;
  }
  function stop(message = 'Stopped. Edit the code or start again.') {
    worker?.terminate(); worker = null; snapshot = null; pendingInspect = false;
    checking = false; $('input-form').hidden = true;
    setPhase('idle'); renderState(); renderGutter(); status(message);
  }
  function start(check = false) {
    save(); stop(); debugView = true; checking = check; runOutput = ''; $('output').textContent = '';
    $('check-result').textContent = check ? 'Running your program…' : '';
    previousLocals = new Map(); setPhase('loading'); status('Loading Python runtime… First load requires an internet connection.');
    const currentWorker = worker = new Worker('../assets/js/debugger-worker.mjs', { type: 'module' });
    worker.onerror = event => { if (worker !== currentWorker) return; stop('Runtime could not load. Check your connection, then Start to retry.'); append(event.message); };
    worker.onmessage = ({ data }) => {
      if (worker !== currentWorker) return;
      if (data.type === 'ready') {
        setPhase('running'); status('Starting main.py…');
        worker.postMessage({ type: 'start', files, watches, breakpoints: checking ? [] : breakpoints });
      } else if (data.type === 'paused') {
        snapshot = data.snapshot; setPhase('paused');
        if (checking) { command('continue'); return; }
        pendingInspect = false; renderState(); renderGutter();
        status(`${snapshot.reason} · ${snapshot.frames[0].file}:${snapshot.frames[0].line}`);
      } else if (data.type === 'output') append(data.text);
      else if (data.type === 'input') {
        setPhase('input'); status('Waiting for program input');
        $('input-label').textContent = data.prompt || 'Program input'; $('input-form').hidden = false; $('program-input').focus();
      } else if (data.type === 'finished') {
        if (checking) $('check-result').textContent = runOutput.trim() === 'Fahrenheit: [32.0, 68.0, 212.0]' ? '✓ All three expected values appeared. Explain how your loop now reaches the final item.' : 'Not yet: expected Fahrenheit: [32.0, 68.0, 212.0]. Compare this with your output.';
        stop('Program finished. Start again or edit the code.');
      } else if (data.type === 'error' || data.type === 'fatal') {
        const wasChecking = checking; stop(data.type === 'fatal' ? data.message : 'Python error — see terminal output. Edit the code and try again.'); append(data.message);
        if (wasChecking) $('check-result').textContent = 'The program raised an error. Inspect the terminal and try again.';
      }
    };
  }
  function renderInstruction(element, text) {
    const actions = { 'Run and Debug':'start', 'Start':'start', 'Continue':'start', 'Pause':'pause', 'Step Over':'over', 'Step Into':'into', 'Step Out':'out', 'Restart':'restart', 'Stop':'stop', 'Check repair':'check' };
    const pattern = /\b(Run and Debug|Step Over|Step Into|Step Out|Check repair|Continue|Restart|Start|Pause|Stop)\b/g;
    const fragment = document.createDocumentFragment();
    let end = 0;
    for (const match of text.matchAll(pattern)) {
      fragment.append(document.createTextNode(text.slice(end, match.index)));
      const token = document.createElement('span'); token.className = 'guide-action';
      token.dataset.action = actions[match[0]];
      const icon = $(actions[match[0]]).querySelector('svg').cloneNode(true);
      icon.removeAttribute('class'); icon.setAttribute('aria-hidden', 'true');
      token.append(icon, document.createTextNode(match[0])); fragment.append(token);
      end = match.index + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(end))); element.replaceChildren(fragment);
  }
  function renderLesson() {
    $('lesson-title').textContent = `${lesson + 1}. ${lessons[lesson][0]}`;
    renderInstruction($('lesson-text'), lessons[lesson][1]); renderInstruction($('lesson-hint'), lessons[lesson][2]);
    $('lesson-debugger-notes').replaceChildren(...debuggerNotes[lesson].map(([label, text]) => {
      const paragraph = document.createElement('p'), heading = document.createElement('strong'), body = document.createElement('span');
      heading.textContent = label + ': '; renderInstruction(body, text); paragraph.append(heading, body); return paragraph;
    }));
    $('lesson-progress').innerHTML = lessons.map((_, i) => `<span class="${i <= lesson ? 'active' : ''}"></span>`).join('');
    $('previous').disabled = lesson === 0; $('next').disabled = lesson === lessons.length - 1;
  }
  $('clear-breakpoints').onclick = () => { breakpoints = []; renderBreakpoints(); renderGutter(); inspect(); };
  $('toggle-breakpoints').onclick = () => { const enable = !breakpoints.some(bp => bp.enabled); breakpoints.forEach(bp => bp.enabled = enable); renderBreakpoints(); renderGutter(); inspect(); };
  const divider = $('sidebar-divider'), card = document.querySelector('.ide-card');
  function resizeSidebar(width) {
    const max = Math.max(180, card.clientWidth - 320);
    const next = Math.max(180, Math.min(width, max));
    card.style.setProperty('--sidebar-width', next + 'px'); divider.setAttribute('aria-valuenow', Math.round(next));
  }
  divider.onpointerdown = event => { if (event.button !== 0) return; divider.setPointerCapture(event.pointerId); divider.dataset.start = event.clientX; divider.dataset.width = document.querySelector('.sidebar').getBoundingClientRect().width; };
  divider.onpointermove = event => { if (divider.hasPointerCapture(event.pointerId)) resizeSidebar(Number(divider.dataset.width) + event.clientX - Number(divider.dataset.start)); };
  divider.onpointerup = event => { if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId); };
  divider.ondblclick = () => card.style.removeProperty('--sidebar-width');
  divider.onkeydown = event => { if (event.key === 'Home') card.style.removeProperty('--sidebar-width'); else if (['ArrowLeft','ArrowRight'].includes(event.key)) resizeSidebar(document.querySelector('.sidebar').getBoundingClientRect().width + (event.key === 'ArrowRight' ? 20 : -20)); else return; event.preventDefault(); };
  $('code').oninput = () => { save(); renderGutter(); };
  $('code').onscroll = () => { $('gutter').scrollTop = $('code').scrollTop; $('code-colors').scrollTop = $('code').scrollTop; $('code-colors').scrollLeft = $('code').scrollLeft; };
  $('code').onkeyup = $('code').onclick = () => { $('position').textContent = `Ln ${$('code').value.slice(0, $('code').selectionStart).split('\n').length}`; };
  $('code').onkeydown = event => {
    if (event.key === 'Tab' && !$('code').readOnly) {
      event.preventDefault(); $('code').setRangeText('    ', $('code').selectionStart, $('code').selectionEnd, 'end'); save(); renderGutter();
    }
  };
  $('start').onclick = () => phase === 'paused' ? command('continue') : start();
  $('run-debug').onclick = () => start();
  $('show-lesson').onclick = () => { setLessonVisible(true); $('lesson').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); };
  $('pause').onclick = () => { worker?.postMessage({ type: 'pause' }); status('Pause requested — waiting for the next Python trace checkpoint.'); };
  for (const action of ['over', 'into', 'out']) $(action).onclick = () => command(action);
  $('stop').onclick = () => stop(); $('restart').onclick = () => start();
  $('watch-form').onsubmit = event => { event.preventDefault(); const expression = $('watch-expression').value.trim(); if (expression && !watches.includes(expression)) watches.push(expression); $('watch-expression').value = ''; $('watch-form').hidden = true; $('watches').classList.remove('collapsed-values'); $('collapse-watches').setAttribute('aria-expanded', 'true'); renderWatches(); inspect(); };
  for (const id of ['add-watch', 'clear-watches', 'collapse-watches']) $(id).addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
  $('add-watch').onclick = () => { $('watch-section').open = true; $('watch-form').hidden = false; $('watch-expression').focus(); };
  $('clear-watches').onclick = () => { watches = []; renderWatches(); inspect(); };
  $('collapse-watches').onclick = () => { const collapsed = $('watches').classList.toggle('collapsed-values'); $('collapse-watches').setAttribute('aria-expanded', !collapsed); $('collapse-watches').title = collapsed ? 'Expand watch values' : 'Collapse watch values'; $('collapse-watches').setAttribute('aria-label', $('collapse-watches').title); };
  $('input-form').onsubmit = event => { event.preventDefault(); const value = $('program-input').value; worker?.postMessage({ type: 'input', value }); append(($('input-label').textContent || '') + value); $('program-input').value = ''; $('input-form').hidden = true; setPhase('running'); status('Running Python…'); };
  $('clear-output').onclick = () => { runOutput = ''; $('output').textContent = ''; };
  $('add-file').onclick = () => {
    const name = prompt('Python filename (for example helpers.py):');
    if (!name) return;
    if (!/^[A-Za-z_]\w*\.py$/.test(name) || Object.hasOwn(files, name)) { status('Use a unique Python filename containing letters, numbers, and underscores.'); return; }
    files[name] = ''; openFile(name);
  };
  $('reset').onclick = () => {
    if (!confirm('Reset the workspace? This stops execution and restores the starting files, clears watches, breakpoints and output, and resets the layout and lesson progress. Your code edits will be replaced.')) return;
    stop(); files = { ...initialFiles }; activeFile = 'main.py'; watches = []; breakpoints = []; lesson = 0;
    $('code').value = files[activeFile]; runOutput = ''; $('output').textContent = ''; $('check-result').textContent = '';
    $('program-input').value = ''; $('watch-expression').value = ''; $('watch-form').hidden = true;
    $('watches').classList.remove('collapsed-values'); $('collapse-watches').setAttribute('aria-expanded', 'true');
    $('collapse-watches').title = 'Collapse watch values'; $('collapse-watches').setAttribute('aria-label', 'Collapse watch values');
    document.querySelectorAll('.debug-section').forEach(section => section.open = true);
    $('file-section').open = true; $('debug-welcome').open = true;
    $('code').scrollTop = 0; $('code').scrollLeft = 0; $('position').textContent = 'Ln 1';
    document.querySelector('.output-panel').style.height = '';
    view(true); resetToolbar(); setLessonVisible(true);
    renderFiles(); renderGutter(); renderBreakpoints(); renderWatches(); renderLesson(); status('Workspace reset. Start when ready.');
  };
  $('previous').onclick = () => { lesson--; renderLesson(); }; $('next').onclick = () => { lesson++; renderLesson(); };
  $('check').onclick = () => start(true);
  function setLessonVisible(visible) {
    document.body.classList.toggle('hide-lesson', !visible);
    $('lesson-toggle').setAttribute('aria-expanded', visible);
    $('lesson-toggle').querySelector('.button-label').textContent = visible ? 'Hide lesson' : 'Show lesson';
  }
  $('lesson-toggle').onclick = () => setLessonVisible(document.body.classList.contains('hide-lesson'));
  function renderView() {
    const active = ['running', 'paused', 'input'].includes(phase);
    $('file-section').hidden = debugView;
    $('debug-welcome').hidden = !debugView || active;
    $('debug-sections').hidden = !debugView;
    $('debug-sections').classList.toggle('debug-idle', !active);
    $('debug-sections').querySelectorAll(':scope > .debug-section').forEach(section => { section.hidden = !active && section.id !== 'breakpoint-section'; });
    $('view-title').textContent = debugView ? 'Run And Debug' : 'Explorer';
    $('debug-view').classList.toggle('active', debugView); $('explorer-view').classList.toggle('active', !debugView);
    $('debug-view').setAttribute('aria-pressed', debugView); $('explorer-view').setAttribute('aria-pressed', !debugView);
  }
  function view(debug) { debugView = debug; renderView(); }
  $('debug-view').onclick = () => view(true); $('explorer-view').onclick = () => view(false);
  function setTheme(theme) {
    document.querySelector('.ide-card').dataset.theme = theme;
    const dark = theme === 'dark';
    $('theme-toggle').querySelector('.button-label').textContent = dark ? 'Light theme' : 'Dark theme';
    $('theme-toggle').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
    $('theme-toggle').setAttribute('aria-pressed', dark);
  }
  let savedTheme;
  try { savedTheme = localStorage.getItem('debugger-explorer-theme'); } catch {}
  setTheme(savedTheme === 'dark' ? 'dark' : 'light');
  $('theme-toggle').onclick = () => {
    const theme = document.querySelector('.ide-card').dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(theme);
    try { localStorage.setItem('debugger-explorer-theme', theme); } catch {}
  };
  const toolbar = document.querySelector('.toolbar'), workspace = document.querySelector('.workspace'), grip = $('toolbar-grip');
  let toolbarMoved = false, drag = null;
  function placeToolbar(x, y) {
    toolbar.style.left = Math.max(4, Math.min(x, workspace.clientWidth - toolbar.offsetWidth - 4)) + 'px';
    toolbar.style.top = Math.max(4, Math.min(y, workspace.clientHeight - toolbar.offsetHeight - 4)) + 'px';
  }
  function resetToolbar() { toolbarMoved = false; placeToolbar(workspace.clientWidth - toolbar.offsetWidth - 12, 5); }
  grip.onpointerdown = event => {
    if (event.button !== 0) return;
    const rect = toolbar.getBoundingClientRect();
    drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    toolbarMoved = true; grip.setPointerCapture(event.pointerId); toolbar.classList.add('dragging'); event.preventDefault();
  };
  grip.onpointermove = event => {
    if (!drag) return;
    const rect = workspace.getBoundingClientRect();
    placeToolbar(event.clientX - rect.left - drag.x, event.clientY - rect.top - drag.y);
  };
  grip.onpointerup = grip.onpointercancel = grip.onlostpointercapture = () => { drag = null; toolbar.classList.remove('dragging'); };
  grip.ondblclick = resetToolbar;
  grip.onkeydown = event => {
    const delta = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
    if (event.key === 'Home') { event.preventDefault(); resetToolbar(); }
    else if (delta) { event.preventDefault(); toolbarMoved = true; placeToolbar(toolbar.offsetLeft + delta[0], toolbar.offsetTop + delta[1]); }
  };
  new ResizeObserver(() => toolbarMoved ? placeToolbar(toolbar.offsetLeft, toolbar.offsetTop) : resetToolbar()).observe(workspace);
  document.addEventListener('keydown', event => {
    const action = event.key === 'F5' ? 'start' : event.key === 'F10' ? 'over' : event.key === 'F11' ? (event.shiftKey ? 'out' : 'into') : null;
    if (action) { event.preventDefault(); if (!$(action).disabled) $(action).click(); }
  });
  $('code').value = files[activeFile]; renderFiles(); renderGutter(); renderBreakpoints(); renderLesson(); setPhase('idle');
})();
