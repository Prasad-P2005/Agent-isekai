// The blocks the player has changed. Everything else in the world comes from the seed, so this is what gets saved.
import { emit } from '../core/events.js';

export const edits = new Map(); // chunk key -> block index -> block id
let unsent = {};                // the same shape, for changes the server has not heard about yet

export function loadEdits(saved = {}) {
  edits.clear();
  unsent = {};
  for (const [chunk, changes] of Object.entries(saved)) edits.set(Number(chunk), new Map(Object.entries(changes).map(([i, id]) => [Number(i), id])));
}
export function recordEdit(chunk, i, id) {
  if (!edits.has(chunk)) edits.set(chunk, new Map());
  edits.get(chunk).set(i, id);
  (unsent[chunk] ||= {})[i] = id;
  emit('blocks:changed');
}
export function takeUnsentEdits() {
  const out = unsent;
  unsent = {};
  return out;
}
// A send that failed goes back in the queue. Anything changed since is newer, so it wins.
export function requeueEdits(failed) {
  for (const [chunk, changes] of Object.entries(failed)) unsent[chunk] = { ...changes, ...unsent[chunk] };
}
