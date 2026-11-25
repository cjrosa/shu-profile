"""Real Python tracing for the browser teaching debugger; workspace lines are 1-based."""
import sys
import os
import json
import builtins
from pyodide.ffi import run_sync
from js import debugWait, debugYield, debugInput


def _debug_run(request_json):
    request = json.loads(request_json)
    workspace = '/lesson'
    os.makedirs(workspace, exist_ok=True)
    files = request['files']
    for name, source in files.items():
        with open(workspace + '/' + name, 'w') as stream:
            stream.write(source)
    sys.path.insert(0, workspace)
    breaks = request.get('breakpoints', [])
    watches = request.get('watches', [])
    mode = 'into'
    anchor = None
    ticks = 0
    selected = 0
    old_input = builtins.input

    def describe(value):
        try:
            return repr(value)[:500]
        except Exception:
            return '<representation unavailable>'

    def frames_for(frame):
        frames = []
        while frame:
            if frame.f_code.co_filename.startswith(workspace + '/'):
                frames.append(frame)
            frame = frame.f_back
        return frames

    def snapshot(frames, reason):
        active = frames[min(selected, len(frames) - 1)]
        values = []
        for expression in watches:
            try:
                value = describe(eval(expression, active.f_globals, active.f_locals))
            except Exception as error:
                value = type(error).__name__ + ': ' + str(error)
            values.append({'expression': expression, 'value': value})
        return json.dumps({
            'reason': reason, 'selected': min(selected, len(frames) - 1),
            'frames': [{'file': f.f_code.co_filename[len(workspace) + 1:],
                        'line': f.f_lineno, 'name': f.f_code.co_name} for f in frames],
            'locals': [{'name': key, 'value': describe(value), 'type': type(value).__name__}
                       for key, value in list(active.f_locals.items()) if not key.startswith('__')],
            'watches': values
        })

    def trace(frame, event, arg):
        nonlocal breaks, watches, mode, anchor, ticks, selected
        if not frame.f_code.co_filename.startswith(workspace + '/'):
            return None
        if event != 'line':
            return trace
        frames = frames_for(frame)
        reason = None
        ticks += 1
        # Yield even when continuing, so Pause and Stop remain responsive in Python loops.
        if ticks % 100 == 0:
            update = json.loads(run_sync(debugYield()))
            if update.get('configuration'):
                breaks = update['configuration'].get('breakpoints', breaks)
                watches = update['configuration'].get('watches', watches)
            if update['pause']:
                reason = 'Pause requested'
        if mode == 'into':
            reason = 'Paused before the highlighted line'
        elif mode == 'over' and (frame is anchor or anchor not in frames):
            reason = 'Step Over complete'
        elif mode == 'out' and anchor not in frames:
            reason = 'Returned to the caller'
        filename = frame.f_code.co_filename[len(workspace) + 1:]
        for bp in breaks:
            if bp['file'] != filename or bp['line'] != frame.f_lineno or not bp.get('enabled', True):
                continue
            condition = bp.get('condition', '').strip()
            try:
                hit = not condition or bool(eval(condition, frame.f_globals, frame.f_locals))
                if hit:
                    reason = 'Conditional breakpoint: ' + condition if condition else 'Breakpoint reached'
            except Exception as error:
                reason = 'Breakpoint condition error: ' + str(error)
        if reason:
            selected = 0
            while True:
                command = json.loads(run_sync(debugWait(snapshot(frames, reason))))
                breaks = command.get('breakpoints', breaks)
                watches = command.get('watches', watches)
                selected = max(0, min(command.get('frame', selected), len(frames) - 1))
                action = command['action']
                if action == 'inspect':
                    continue
                mode = action
                anchor = frame
                break
        return trace

    def read_input(prompt=''):
        return str(run_sync(debugInput(str(prompt))))

    try:
        builtins.input = read_input
        source = compile(files['main.py'], workspace + '/main.py', 'exec')
        namespace = {'__name__': '__main__', '__file__': workspace + '/main.py'}
        sys.settrace(trace)
        exec(source, namespace, namespace)
    finally:
        sys.settrace(None)
        builtins.input = old_input
        sys.path.remove(workspace)
