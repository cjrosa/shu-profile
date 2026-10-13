/* Exact UTF-8 spans, kept separate from the scene UI. */
(function(root) {
  'use strict';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', {fatal:true, ignoreBOM:true});
  const initial = 'the mozzarella melts into pure bliss.';
  const presets = ['pizza', 'mozzarella', 'pilgrimage', 'New Haven pizza', 'New Haven pizza is legendary.', 'char, chew, and flavor.', initial];
  function analyze(text, tokenizer) {
    if (text.length > 600) throw new Error('Please use 600 characters or fewer.');
    if (text.isWellFormed && !text.isWellFormed()) throw new Error('The input contains an incomplete Unicode character. Please replace it.');
    const source = encoder.encode(text);
    const words = Array.from(text.matchAll(/\S+/gu), match => ({text:match[0], start:encoder.encode(text.slice(0,match.index)).length, end:encoder.encode(text.slice(0,match.index + match[0].length)).length}));
    let offset = 0;
    const tokens = tokenizer.encode(text).map(id => {
      const bytes = Array.from(tokenizer.bytes(id));
      const start = offset; offset += bytes.length;
      let piece = null;
      try { piece = decoder.decode(new Uint8Array(bytes)); } catch (_) { /* A real partial UTF-8 sequence. */ }
      return {id, bytes, start, end:offset, text:piece};
    });
    const rebuilt = tokens.flatMap(token => token.bytes);
    if (rebuilt.length !== source.length || rebuilt.some((byte,i) => byte !== source[i])) throw new Error('Tokenizer reconstruction failed. Please reload.');
    let byteOffset = 0;
    const characters = Array.from(text, char => {
      const start = byteOffset; byteOffset += encoder.encode(char).length;
      return {text:char, start, end:byteOffset};
    });
    return {text, words, tokens, characters};
  }
  const overlap = (a,b) => a.start < b.end && b.start < a.end;
  const visible = text => text.replace(/ /g,'·').replace(/\n/g,'↵').replace(/\r/g,'␍').replace(/\t/g,'⇥');
  const api = {initial, presets, analyze, overlap, visible};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.llmTokenEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
