const test = require('node:test'), assert = require('node:assert/strict');
const Sim = require('../assets/js/email-simulation.js');
test('delivery queues then transfers then stores before reading', () => {
  const states = Sim.events(1);
  assert.equal(states[1].queue, 1);
  assert.equal(states[3].mailbox, 0);
  assert.equal(states[4].queue, 0);
  assert.equal(states[4].mailbox, 1);
  assert.equal(states[5].phase, 'Read');
});
test('SMTP transcript orders greeting, envelope, DATA, acceptance and closure', () => {
  const s = Sim.snapshot(2, 99), log = s.transcript.join('\n');
  const ordered = ['TCP connection established', 'S: 220', 'C: HELO', 'C: MAIL FROM', 'C: RCPT TO', 'C: DATA', 'S: 354', 'Subject:', 'C: .', 'S: 250 Message accepted', 'C: QUIT', 'S: 221', 'TCP connection closed'];
  let previous = -1;
  for (const text of ordered) { const index = log.indexOf(text); assert.ok(index > previous, text); previous = index; }
  assert.equal(s.mailbox, 1); assert.equal(s.done, true);
});
test('persistent session transfers two messages with one greeting and connection', () => {
  const state = Sim.snapshot(4, 99), log = state.transcript.join('\n');
  assert.equal((log.match(/TCP connection established/g)||[]).length, 1);
  assert.equal((log.match(/C: HELO/g)||[]).length, 1);
  assert.equal((log.match(/C: MAIL FROM/g)||[]).length, 2);
  assert.equal((log.match(/C: QUIT/g)||[]).length, 1);
  assert.equal(state.mailbox, 2);
});
test('message content keeps blank separator and excludes SMTP terminator', () => {
  assert.equal(Sim.message[3], ''); assert.ok(!Sim.message.includes('.'));
  assert.deepEqual(Sim.events(3).map(e => e.phase), ['Envelope','Headers','Blank line','Body','DATA terminator']);
});
test('IMAP retains retrieved and moved messages, then removes after deletion', () => {
  assert.deepEqual(Sim.events(5, 'imap').map(e => e.mailbox), [1,1,1,0]);
  const webmail = Sim.snapshot(5, 99, 'webmail');
  assert.equal(webmail.mailbox,1); assert.match(webmail.transcript.join('\n'),/HTTPS/);
});
