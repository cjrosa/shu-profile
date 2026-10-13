import { Tiktoken } from 'js-tiktoken/lite';
import ranks from 'js-tiktoken/ranks/cl100k_base';
export function create() {
  const enc = new Tiktoken(ranks);
  return { encode: text => enc.encode(text, [], []), bytes: id => enc.textMap.get(id) };
}
