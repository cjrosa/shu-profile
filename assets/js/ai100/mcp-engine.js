/* Deterministic teaching model. No model API, transport, or external database. */
(function (root) {
  'use strict';
  const DATE = '2026-11-09';
  const ROOMS = ['Cedar', 'Maple', 'Birch'];
  const TIMES = ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const schema = properties => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
  const time = { type: 'string', enum: TIMES };
  const tools = [
    { name: 'search_availability', description: 'Find available rooms for a one-hour slot on the demo date. Reads data; does not reserve a room.', inputSchema: schema({ time }) },
    { name: 'create_booking', description: 'Reserve a named room for the authenticated user Alex for one hour. Fails if the slot is already booked.', inputSchema: schema({ room: { type: 'string', enum: ROOMS }, time }) },
    { name: 'cancel_booking', description: 'Cancel one reservation owned by the authenticated user Alex, using its booking ID.', inputSchema: schema({ booking_id: { type: 'string', pattern: '^B[0-9]+$' } }) }
  ];
  const examples = [
    ['Find rooms', 'Find available rooms at 10:00.'],
    ['Book a room', 'Book Cedar at 10:00 for Alex.'],
    ['Find + book', 'Find and book a room at 10:00 for Alex.'],
    ['Booking conflict', 'Book Cedar at 11:00 for Alex.'],
    ['Cancel booking', 'Cancel booking B100.'],
    ['Missing details', 'Book a room.'],
    ['No tool needed', 'What is MCP?']
  ];
  function initialDB() { return [{ id: 'B100', room: 'Cedar', time: '11:00', date: DATE, user: 'Alex' }]; }
  function parse(prompt) {
    const text = prompt.trim().replace(/[.!?]+$/, '').trim();
    let match;
    if (/^what is MCP$/i.test(text)) return { kind: 'explain' };
    if ((match = /^find available rooms at (\d{1,2}:\d{2})$/i.exec(text))) return { kind: 'search', time: match[1].padStart(5, '0') };
    if ((match = /^find and book a room at (\d{1,2}:\d{2}) for Alex$/i.exec(text))) return { kind: 'chain', time: match[1].padStart(5, '0') };
    if ((match = /^book (Cedar|Maple|Birch) at (\d{1,2}:\d{2}) for Alex$/i.exec(text))) return { kind: 'book', room: ROOMS.find(r => r.toLowerCase() === match[1].toLowerCase()), time: match[2].padStart(5, '0') };
    if ((match = /^cancel (?:booking )?(B\d+)$/i.exec(text))) return { kind: 'cancel', booking_id: match[1].toUpperCase() };
    return { kind: 'clarify' };
  }
  function validate(name, args) {
    const tool = tools.find(t => t.name === name);
    if (!tool) return 'Unknown tool.';
    const properties = tool.inputSchema.properties;
    if (Object.keys(args).some(k => !Object.hasOwn(properties, k))) return 'Unexpected argument.';
    for (const [key, rule] of Object.entries(properties)) {
      if (typeof args[key] !== 'string') return `Missing or invalid ${key}.`;
      if (rule.enum && !rule.enum.includes(args[key])) return `${key} must be one of: ${rule.enum.join(', ')}.`;
      if (rule.pattern && !new RegExp(rule.pattern).test(args[key])) return `Invalid ${key}.`;
    }
    return null;
  }
  function buildTrace(prompt, source) {
    let db = clone(source), id = 0, selected = null;
    const frames = [], intent = parse(prompt);
    const add = (node, title, explanation, extra = {}) => frames.push({ node, title, explanation, db: clone(db), selected, operations: [], ...extra });
    const request = (method, params) => ({ jsonrpc: '2.0', id: ++id, method, ...(params ? { params } : {}) });
    const message = (node, title, explanation, direction, payload, extra = {}) => add(node, title, explanation, { payload, direction, ...extra });
    const answer = text => add('model', 'Answer grounded in the result', 'The assistant turns the returned evidence into a user-facing answer. The model does not edit the database.', { answer: text });
    add('model', 'A user asks the assistant', 'The host application receives the prompt. These words are not yet an MCP request.', { payload: { user: prompt }, label: 'User message · not MCP' });
    message('client', 'Initialize the connection', 'The client proposes a protocol version and declares its capabilities.', 'Client → server', request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ai100-demo', version: '1.0.0' } }));
    message('server', 'Agree on the session', 'The server accepts this version and advertises support for tools. Matching IDs pair requests with responses.', 'Server → client', { jsonrpc: '2.0', id, result: { protocolVersion: '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'campus-booking', version: '1.0.0' } } });
    message('client', 'The client is ready', 'This is a notification: it has no ID and does not receive a response.', 'Client → server', { jsonrpc: '2.0', method: 'notifications/initialized' });
    message('client', 'Discover the available tools', 'The client asks what this server can do. Discovery does not run a booking operation.', 'Client → server', request('tools/list'));
    message('server', 'Return descriptions and input schemas', 'The host makes these tool definitions available to the model. A schema specifies the arguments a tool accepts.', 'Server → client', { jsonrpc: '2.0', id, result: { tools: clone(tools) } });
    if (intent.kind === 'explain') {
      add('model', 'No tool is needed', 'This is a conceptual question. None of the booking tools is relevant; discovery does not force a call.');
      answer('MCP (Model Context Protocol) is a standard interface that lets AI applications discover and use tools and data supplied by servers. No reservation lookup is needed to explain it.');
      return frames;
    }
    if (intent.kind === 'clarify') {
      add('model', 'Ask before choosing a tool', 'The demo parser cannot map this prompt to a complete supported action. It does not invent missing arguments.');
      answer('Please use an example format and specify the room and time for a booking, a time for a search, or a booking ID to cancel. For example: “Book Cedar at 10:00 for Alex.”');
      return frames;
    }
    function invoke(name, args, reason) {
      selected = name;
      const writes = name !== 'search_availability';
      add('model', `Select ${name}`, reason, { payload: { name, arguments: args }, label: 'Model tool proposal · not yet an MCP message' });
      if (writes) add('client', 'Wait for user approval', 'The host pauses before a call that changes data. Approve or decline below; no write request has been sent.', { approval: true, payload: { name, arguments: args }, label: 'Host approval gate · not MCP' });
      const call = request('tools/call', { name, arguments: args });
      message('client', `Send tools/call · ${name}`, 'The client wraps the tool name and structured arguments in a JSON-RPC request. The server receives arguments, not the original natural-language prompt.', 'Client → server', call);
      const error = validate(name, args);
      const checks = ['Check the tool name and required argument types.', 'Validate allowed rooms, time slots, or booking ID format.', 'Use the fixed authenticated identity: Alex.'];
      add('server', error ? 'Reject invalid arguments' : 'Validate the request', error || 'The server checks the input schema before it reaches the booking system. Identity comes from the application context, not a model-supplied user argument.', { operations: checks, op: error ? 1 : 2, payload: args, label: 'Validated tool arguments' });
      if (error) {
        message('server', 'Return a protocol error', 'Invalid tool arguments are rejected here as an invalid-params JSON-RPC error. No database operation ran.', 'Server → client', { jsonrpc: '2.0', id: call.id, error: { code: -32602, message: error } });
        return { error };
      }
      let result, operations, changed = null;
      if (name === 'search_availability') {
        operations = [`Read rooms: ${ROOMS.join(', ')}.`, `Read reservations where date = ${DATE} and time = ${args.time}.`, 'Exclude occupied rooms; return the remaining choices.'];
        add('database', 'Read the reservation table', 'The server delegates the lookup to its booking implementation. A read leaves every reservation unchanged.', { operations, op: 1, payload: { operation: 'SELECT available rooms', date: DATE, time: args.time }, label: 'Internal operation · not MCP' });
        result = { date: DATE, time: args.time, duration_minutes: 60, available_rooms: ROOMS.filter(room => !db.some(b => b.room === room && b.time === args.time && b.date === DATE)) };
        add('database', 'Filter occupied slots', `${result.available_rooms.length} room(s) match this request. These results come from the current records.`, { operations, op: 2, payload: result, label: 'Database read result' });
      } else if (name === 'create_booking') {
        operations = ['Begin an atomic check-and-insert operation.', `Check ${args.room} at ${args.time} for an existing reservation.`, 'Insert one reservation only if the slot is still free.'];
        add('database', 'Check for a booking conflict', 'The booking system checks again at write time. In a real system, an atomic transaction or uniqueness constraint prevents two callers from taking the same slot.', { operations, op: 1, payload: { operation: 'CHECK slot availability', ...args, date: DATE }, label: 'Internal operation · not MCP' });
        if (db.some(b => b.room === args.room && b.time === args.time && b.date === DATE)) {
          result = { error: 'SLOT_TAKEN', message: `${args.room} at ${args.time} is already booked. No new reservation was created.` };
          add('database', 'Conflict: do not insert', result.message, { operations, op: 1, payload: result, label: 'Booking system result' });
        } else {
          const booking = { id: `B${Math.max(100, ...db.map(b => Number(b.id.slice(1)))) + 1}`, room: args.room, time: args.time, date: DATE, user: 'Alex' };
          db.push(booking); changed = booking;
          result = { booking, status: 'confirmed' };
          add('database', 'Insert the reservation', 'One new row is now in the booking table. The highlighted slot below shows exactly what changed.', { operations, op: 2, payload: booking, label: 'Inserted record', changed, change: `INSERT ${booking.id}: ${booking.room} at ${booking.time}` });
        }
      } else {
        operations = [`Look up reservation ${args.booking_id}.`, 'Verify that the reservation belongs to Alex.', 'Delete the matching reservation; free its slot.'];
        const booking = db.find(b => b.id === args.booking_id);
        add('database', 'Find the record and check ownership', 'A cancellation needs an existing booking ID and permission to change that record.', { operations, op: 1, payload: { operation: 'SELECT booking and verify owner', ...args, authenticated_user: 'Alex' }, label: 'Internal operation · not MCP' });
        if (!booking || booking.user !== 'Alex') {
          result = { error: booking ? 'NOT_ALLOWED' : 'NOT_FOUND', message: booking ? 'This reservation does not belong to Alex.' : `Booking ${args.booking_id} does not exist.` };
          add('database', 'Leave the table unchanged', result.message, { operations, op: 1, payload: result, label: 'Booking system result' });
        } else {
          db = db.filter(b => b.id !== booking.id); changed = booking;
          result = { status: 'cancelled', booking };
          add('database', 'Delete the reservation', 'The row has been removed and its room is available again. Watch the highlighted slot below.', { operations, op: 2, payload: result, label: 'Deleted record', changed, change: `DELETE ${booking.id}: ${booking.room} at ${booking.time}` });
        }
      }
      message('server', result.error ? 'Return a tool execution error' : 'Return the tool result', result.error ? 'The MCP request was understood, but the booking operation failed. isError: true lets the model react to the failure instead of claiming success.' : 'The server returns text content inside the MCP result. The response ID matches the tools/call request.', 'Server → client', { jsonrpc: '2.0', id: call.id, result: { content: [{ type: 'text', text: JSON.stringify(result) }], isError: Boolean(result.error) } });
      add('client', 'Give the result back to the model', 'The host adds the tool output to the conversation. It is evidence for the next model response or tool choice.', { payload: result, label: 'Tool output delivered to model' });
      return result;
    }
    let result;
    if (intent.kind === 'search' || intent.kind === 'chain') {
      result = invoke('search_availability', { time: intent.time }, 'The prompt asks which rooms are free. Choose the read-only search tool; a booking tool would change data prematurely.');
      if (intent.kind === 'chain' && !result.error && result.available_rooms.length) {
        const room = result.available_rooms[0];
        result = invoke('create_booking', { room, time: intent.time }, `The search returned ${result.available_rooms.join(', ')}. This demo selects the first available room, ${room}, and uses that result as the next tool's input.`);
      }
    } else if (intent.kind === 'book') result = invoke('create_booking', { room: intent.room, time: intent.time }, 'The user named a room and time and asked to reserve it. create_booking is the matching write tool; its server-side check will catch conflicts.');
    else result = invoke('cancel_booking', { booking_id: intent.booking_id }, 'The user supplied a booking ID and asked to cancel it. cancel_booking accepts that ID; search_availability cannot remove reservations.');
    if (result.error) answer(`I could not complete that request: ${result.message || result.error} ${result.error === 'SLOT_TAKEN' ? 'Try a different room or search for availability.' : 'Check the request details and try again.'}`);
    else if (result.status === 'confirmed') answer(`Booked ${result.booking.room} on Nov 9, 2026 at ${result.booking.time} for one hour for Alex. Confirmation: ${result.booking.id}.`);
    else if (result.status === 'cancelled') answer(`Cancelled ${result.booking.id}. ${result.booking.room} at ${result.booking.time} on Nov 9, 2026 is available again.`);
    else answer(result.available_rooms.length ? `Available at ${result.time} on Nov 9, 2026: ${result.available_rooms.join(', ')}. No reservation has been made.` : `No rooms are available at ${result.time} on Nov 9, 2026. Please choose another time.`);
    return frames;
  }
  const api = { DATE, ROOMS, TIMES, tools, examples, initialDB, parse, validate, buildTrace };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MCPDemo = api;
})(typeof window !== 'undefined' ? window : globalThis);
