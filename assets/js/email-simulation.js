(function (root) {
  'use strict';
  const message = ['From: Alice <alice@sender.example>', 'To: Bob <bob@receiver.example>', 'Subject: Lunch plans', '', 'Would you like to meet for lunch?'];
  const event = (phase, text, node, edge = '', queue = 0, mailbox = 0, lines = []) => ({ phase, text, node, edge, queue, mailbox, lines });
  const questions = [
    ['Where does outgoing mail wait for delivery?', ['The sending server’s queue', 'Bob’s inbox'], 0, 'The sending server holds outgoing mail in its queue. Bob’s mailbox holds delivered mail.'],
    ['Must Bob be online when his server accepts the message?', ['Yes', 'No'], 1, 'Bob’s server stores the message in his mailbox until he accesses it.'],
    ['What does a 354 response invite the client to send?', ['The message headers and body', 'A new TCP handshake'], 0, '354 invites message data. A dot on a line by itself ends that data.'],
    ['Which value controls the SMTP delivery recipient?', ['The To header', 'RCPT TO in the envelope'], 1, 'RCPT TO supplies the delivery recipient. To is part of the message content.'],
    ['How many TCP connections are needed for this two-message example?', ['One', 'Two'], 0, 'SMTP can transfer multiple messages over one persistent TCP connection.'],
    ['Which protocol connects a browser to a webmail website?', ['SMTP', 'HTTP(S)'], 1, 'The browser uses HTTP(S). The webmail service handles delivery and mailbox access behind that interface.']
  ];
  const lessons = [
    ['Email infrastructure', 'Meet the user agents and mail servers. An outgoing queue and an incoming mailbox have different jobs.'],
    ['Alice sends to Bob', 'Press Play or Step to follow one message from composition to reading. Inspect either server to watch its queue or mailbox change. Bob can be offline when delivery occurs.'],
    ['SMTP conversation', 'Alice’s server acts as the SMTP client; Bob’s server listens on TCP port 25. Play or step through the exchange, then expand Simulated email trace below to inspect the commands and replies.'],
    ['Message anatomy', 'Step through the envelope, headers, and body. The message anatomy reference below highlights each part. SMTP envelope addresses control delivery; headers and body travel after DATA.'],
    ['SMTP characteristics', 'Play two transfers over one connection. Expand the trace to see one greeting and two messages, then compare SMTP push, HTTP pull, and multipart content.'],
    ['Reading email', 'Choose IMAP mail client or Webmail browser, then play or step through the example. Answer its understanding check to finish the lesson. You can also switch access methods to compare how each accesses stored mail.']
  ].map(([title, copy], i) => ({ title, copy, question: questions[i] }));
  function transaction(second = false) {
    const count = second ? 1 : 0;
    return [
      event('Envelope', 'MAIL FROM identifies the envelope sender.', 'sender', 'transfer', 1, count, ['C: MAIL FROM:<alice@sender.example>', 'S: 250 Sender OK']),
      event('Envelope', 'RCPT TO identifies the delivery recipient.', 'receiver', 'transfer', 1, count, ['C: RCPT TO:<bob@receiver.example>', 'S: 250 Recipient OK']),
      event('Message transfer', '354 means the server is ready for message data.', 'receiver', 'transfer', 1, count, ['C: DATA', 'S: 354 End data with <CRLF>.<CRLF>']),
      event('Message transfer', 'Headers, a blank line, and the body travel inside DATA.', 'receiver', 'transfer', 1, count, message.map(line => 'C: ' + line)),
      event('Accepted', 'The dot-only line ends DATA. The server accepts the message and stores it in Bob’s mailbox in this example.', 'receiver', 'transfer', 0, count + 1, ['C: .', 'S: 250 Message accepted for delivery'])
    ];
  }
  function events(stage, mode = 'imap') {
    const connection = event('TCP connection', 'The sending server opens a reliable TCP connection to the receiving server, port 25.', 'receiver', 'transfer', 1, 0, ['[TCP connection established to receiver.example:25]']);
    const greeting = event('Greeting', '220 greets the client. HELO introduces it; 250 acknowledges the greeting.', 'receiver', 'transfer', 1, 0, ['S: 220 receiver.example ready', 'C: HELO sender.example', 'S: 250 Hello sender.example']);
    const close = n => event('Closure', 'QUIT ends the SMTP session; 221 acknowledges closure. TCP then closes.', 'receiver', 'transfer', 0, n, ['C: QUIT', 'S: 221 Closing connection', '[TCP connection closed]']);
    switch (stage) {
      case 0: return [
        event('User agent', 'Alice’s user agent lets her compose, edit, and send email.', 'alice'),
        event('Outgoing queue', 'Alice’s mail server stores outgoing mail in a queue until transfer.', 'sender', 'submit', 1),
        event('Mailbox', 'Bob’s mail server stores incoming mail in his mailbox.', 'receiver', 'transfer', 0, 1),
        event('User agent', 'Bob’s user agent accesses his mailbox so he can read mail.', 'bob', 'access', 0, 1)
      ];
      case 1: return [
        event('Compose', 'Alice writes a message addressed to Bob.', 'alice'),
        event('Submit and queue', 'Alice’s user agent submits using SMTP. Her server places the message in its outgoing queue.', 'sender', 'submit', 1, 0, ['[Alice submits the message using SMTP]']),
        connection,
        event('Transfer', 'The sending server pushes the message across the SMTP connection.', 'receiver', 'transfer', 1, 0, ['[SMTP greeting and message transfer]']),
        event('Delivered', 'Bob’s server accepts the message into his mailbox. It leaves the outgoing queue.', 'receiver', 'transfer', 0, 1, ['[Message accepted and stored]']),
        event('Read', 'Bob uses a mail access protocol to read the stored message.', 'bob', 'access', 0, 1, ['[Bob retrieves the message using IMAP]'])
      ];
      case 2: return [connection, greeting, ...transaction(), close(1)];
      case 3: return [
        event('Envelope', 'These are SMTP commands outside the message: MAIL FROM and RCPT TO determine the envelope addresses.', 'sender', 'transfer', 1, 0, ['C: MAIL FROM:<alice@sender.example>', 'C: RCPT TO:<bob@receiver.example>']),
        event('Headers', 'From, To, and Subject are message headers, not SMTP commands. Envelope and header addresses can differ.', 'receiver', 'transfer', 1, 0, ['C: DATA', 'S: 354 Send message data', ...message.slice(0, 3)]),
        event('Blank line', 'An empty line separates the message headers from the body.', 'receiver', 'transfer', 1, 0, ['[blank line — header/body separator]']),
        event('Body', 'The body contains Alice’s message.', 'receiver', 'transfer', 1, 0, [message[4]]),
        event('DATA terminator', 'The wire delimiter is <CRLF>.<CRLF>: a dot alone on a line. It is a protocol delimiter, not part of the stored message.', 'receiver', 'transfer', 0, 1, ['C: .', 'S: 250 Message accepted for delivery'])
      ];
      case 4: return [connection, greeting, ...transaction(),
        event('Reuse connection', 'A second message is queued. The same TCP connection stays open; no second greeting is needed.', 'sender', 'transfer', 1, 1, ['[Second message — same TCP connection]']),
        ...transaction(true), close(2),
        event('Push and pull', 'SMTP pushes mail from a sending client to a receiving server. In the slide’s HTTP comparison, a client requests an object and the server returns a response.', 'alice', '', 0, 2),
        event('Multipart and encoding', 'MIME can package text and attachments into one multipart message. Basic SMTP assumes 7-bit ASCII; MIME encodings and negotiated SMTP extensions support richer content.', 'receiver', '', 0, 2)
      ];
      case 5: return mode === 'imap' ? [
        event('Stored on server', 'The message is already in Bob’s mailbox. Reading does not require the sender to reconnect.', 'receiver', '', 0, 1),
        event('Retrieve', 'Internet Message Access Protocol (IMAP) lets Bob’s client retrieve the message while it remains stored on the server.', 'bob', 'access', 0, 1, ['[IMAP: retrieve message]']),
        event('Folders', 'Bob moves the message into a server-side folder named Course. It remains in his account.', 'receiver', 'access', 0, 1, ['[IMAP: move message to Course folder]']),
        event('Delete', 'Bob deletes the message and completes removal on the server. Other clients can see the updated mailbox.', 'receiver', 'access', 0, 0, ['[IMAP: mark deleted, then expunge]'])
      ] : [
        event('Webmail', 'Bob opens a webmail website in his browser.', 'bob', 'access', 0, 1, ['[HTTPS request to webmail service]']),
        event('Read in browser', 'The service accesses stored mail and sends the browser an HTTPS response. Its mailbox backend may use IMAP or another implementation.', 'bob', 'access', 0, 1, ['[HTTPS response: mailbox and message]']),
        event('Send from browser', 'A browser submits outgoing mail to the webmail service over HTTPS. That service handles SMTP delivery between mail servers.', 'receiver', 'access', 0, 1, ['[HTTPS submission to service]', '[Service handles onward SMTP delivery]'])
      ];
      default: throw new RangeError('Unknown lesson stage');
    }
  }
  function snapshot(stage, step, mode = 'imap') {
    const sequence = events(stage, mode);
    const index = Math.max(0, Math.min(step, sequence.length));
    const current = index ? sequence[index - 1] : event('Ready', 'Select Step or Play to begin this stage.', '', '', stage >= 2 && stage <= 4 ? 1 : 0, stage === 5 ? 1 : 0);
    return { ...current, step: index, total: sequence.length, done: index === sequence.length, transcript: sequence.slice(0, index).flatMap(e => e.lines) };
  }
  const api = { lessons, message, events, snapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EmailSimulation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
