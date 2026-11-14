/* Per-device console state. Simulation snapshots share a session; newly opened networks do not. */
(function (root) {
  "use strict";
  class TerminalSessions {
    constructor() {
      this.networks = new WeakMap();
    }
    sessions(network) {
      if (!this.networks.has(network)) this.networks.set(network, new Map());
      return this.networks.get(network);
    }
    get(network, id) {
      const sessions = this.sessions(network);
      if (!sessions.has(id))
        sessions.set(id, {
          text: "",
          history: [],
          index: 0,
          draft: "",
          input: "",
          scroll: 0,
        });
      return sessions.get(id);
    }
    adopt(previous, next) {
      this.networks.set(next, this.sessions(previous));
      return next;
    }
  }
  root.NetworkExplorerTerminal = { TerminalSessions };
  if (typeof module !== "undefined") module.exports = { TerminalSessions };
})(globalThis);
