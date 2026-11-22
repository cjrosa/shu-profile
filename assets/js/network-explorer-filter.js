/* Shared Activity and canvas display-filter predicate. */
(function (root) {
  "use strict";
  function matchAtom(r, filter) {
    const f = filter.trim().toLowerCase();
    if (!f) return true;
    const tag=f.match(/^vlan\.tag\s*==\s*(\d+)$/);if(tag)return r.e.frame?.vlanTag===Number(tag[1]);
    if(f==='tagged')return r.e.frame?.vlanTag!==undefined;
    if(f==='untagged')return !!r.e.frame&&r.e.frame.vlanTag===undefined;
    const vlan = f.match(/^vlan(?:\.id)?\s*==\s*(\d+)$/);
    if (vlan) return r.e.vlan === Number(vlan[1]);
    if (f === "tcp") return ["TCP", "HTTP", "TLS"].includes(r.proto);
    if (f === "udp") return ["UDP", "DHCP", "DNS"].includes(r.proto);
    if (["arp", "icmp", "dhcp", "dns", "http", "tls", "ospf", "event"].includes(f))
      return r.proto.toLowerCase() === f;
    if (["ip", "ipv4"].includes(f))
      return ["ICMP", "UDP", "DHCP", "DNS", "TCP", "HTTP", "TLS", "OSPF"].includes(r.proto);
    if (["broadcast", "bcast"].includes(f))
      return r.dst === "ff:ff:ff:ff:ff:ff";
    const port = f.match(/^(tcp|udp)\.(port|srcport|dstport)\s*==\s*(\d+)$/);
    if (port) {
      const frame = r.e.frame || {};
      if (frame.protocol?.toLowerCase() !== port[1]) return false;
      const ports =
        port[2] === "port"
          ? [frame.sport, frame.dport]
          : [frame[port[2] === "srcport" ? "sport" : "dport"]];
      return ports.includes(Number(port[3]));
    }
    const m = f.match(/^(eth|ip)\.(src|dst|addr)\s*==\s*(.+)$/);
    if (m) {
      const a = m[1] === "eth" ? [r.src, r.dst] : [r.sip, r.dip];
      return (m[2] === "addr" ? a : [a[m[2] === "src" ? 0 : 1]]).some(
        (v) => v.toLowerCase() === m[3].trim(),
      );
    }
    return [r.info, r.device, r.proto, ...(r.e.notes || [])]
      .join(" ")
      .toLowerCase()
      .includes(f);
  }

  function compile(expression) {
    const input = String(expression).trim();
    if (!input) return () => true;
    if (input.length > 2048) throw new Error("Filter is too long.");
    const tokens = input
      .split(/(\(|\)|&&|\|\||!|\band\b|\bor\b|\bnot\b)/i)
      .map((t) => t.trim())
      .filter(Boolean);
    let pos = 0,
      depth = 0;
    const peek = () => (tokens[pos] || "").toLowerCase();
    function atom(value) {
      const f = value.toLowerCase();
      const comparison = f.match(/^([a-z.]+)\s*==\s*(\S+)$/);
      if (comparison) {
        const [, field, value] = comparison;
        if (/^(tcp|udp)\.(port|srcport|dstport)$/.test(field)) {
          if (!/^\d+$/.test(value) || Number(value) > 65535)
            throw new Error("Port must be between 0 and 65535.");
        } else if (/^vlan(\.(id|tag))?$/.test(field)) {
          if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 4094)
            throw new Error("VLAN must be between 1 and 4094.");
        } else if (/^ip\.(src|dst|addr)$/.test(field)) {
          if (
            !/^(\d{1,3}\.){3}\d{1,3}$/.test(value) ||
            value.split(".").some((n) => Number(n) > 255)
          )
            throw new Error("Enter a valid IPv4 address.");
        } else if (/^eth\.(src|dst|addr)$/.test(field)) {
          if (!/^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(value))
            throw new Error("Enter a MAC address such as 02:00:00:00:01:00.");
        } else throw new Error("Unsupported filter field: " + field);
      } else if (/[=<>!,|&]/.test(f) || /^(tcp|udp|ip|eth|vlan)\./.test(f)) {
        throw new Error("Use a supported field followed by == and a value.");
      }
      return (row) => matchAtom(row, value);
    }
    function unary() {
      if (++depth > 64) throw new Error("Filter nesting is too deep.");
      let result;
      if (["not", "!"].includes(peek())) {
        pos++;
        const child = unary();
        result = (row) => !child(row);
      } else if (peek() === "(") {
        pos++;
        result = or();
        if (peek() !== ")") throw new Error("Missing closing parenthesis.");
        pos++;
      } else {
        if (!peek() || [")", "and", "or", "&&", "||"].includes(peek()))
          throw new Error("Expected a filter condition.");
        result = atom(tokens[pos++]);
      }
      depth--;
      return result;
    }
    function and() {
      let left = unary();
      while (["and", "&&"].includes(peek())) {
        pos++;
        const a = left,
          b = unary();
        left = (row) => a(row) && b(row);
      }
      return left;
    }
    function or() {
      let left = and();
      while (["or", "||"].includes(peek())) {
        pos++;
        const a = left,
          b = and();
        left = (row) => a(row) || b(row);
      }
      return left;
    }
    const predicate = or();
    if (pos !== tokens.length)
      throw new Error("Unexpected token: " + tokens[pos]);
    return predicate;
  }
  let cachedExpression, cachedPredicate;
  function match(row, expression) {
    if (expression !== cachedExpression) {
      const predicate = compile(expression);
      cachedExpression = expression;
      cachedPredicate = predicate;
    }
    return cachedPredicate(row);
  }
  if (typeof module !== "undefined" && module.exports)
    module.exports = { match, compile };
  else root.NetworkExplorerFilter = { match, compile };
})(globalThis);
