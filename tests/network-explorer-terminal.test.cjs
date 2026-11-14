const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  TerminalSessions,
} = require("../assets/js/network-explorer-terminal.js");
test("each device retains independent transcript, history and draft through simulation snapshots", () => {
  const store = new TerminalSessions(),
    network = {};
  const first = store.get(network, "d1");
  Object.assign(first, {
    text: "first output",
    history: ["ping 192.168.1.2"],
    input: "ipconfig",
    draft: "unfinished",
    scroll: 42,
  });
  const second = store.get(network, "d2");
  second.text = "second output";
  const snapshot = store.adopt(network, {}),
    next = store.adopt(snapshot, {});
  store.get(next, "d1").text += "\nReply received";
  assert.equal(store.get(next, "d1"), first);
  assert.equal(first.text, "first output\nReply received");
  assert.deepEqual(first.history, ["ping 192.168.1.2"]);
  assert.equal(first.input, "ipconfig");
  assert.equal(first.draft, "unfinished");
  assert.equal(first.scroll, 42);
  assert.equal(store.get(next, "d2"), second);
  assert.equal(second.text, "second output");
});
test("opening another network with reused device IDs starts fresh consoles", () => {
  const store = new TerminalSessions(),
    old = {};
  store.get(old, "d1").text = "old transcript";
  store.get(old, null).input = "@";
  const fresh = {};
  assert.equal(store.get(fresh, "d1").text, "");
  assert.equal(store.get(fresh, null).input, "");
});
test("configuration undo can preserve consoles without retaining protocol objects", () => {
  const store = new TerminalSessions(),
    before = {};
  store.get(before, "d1").history.push("show interfaces");
  const restored = store.adopt(before, {});
  assert.deepEqual(store.get(restored, "d1").history, ["show interfaces"]);
});
