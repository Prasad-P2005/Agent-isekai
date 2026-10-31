// The threads that do the heavy lifting: some generate chunks, some mesh them. If workers cannot start, both jobs fall back to the main thread.
import { on } from '../core/events.js';
import { hint, keepColumns } from '../sim/terrain.js';
import { landChunk, useFarm } from '../sim/chunks.js';

const cores = navigator.hardwareConcurrency || 4;
export const MESHERS = Math.max(1, Math.min(4, cores - 2)), FARMERS = cores > 4 ? 2 : 1;

// A few workers behind one door. Each says when it has loaded: anything posted before that would be lost, so it waits.
export function startPool(url, size, done, failed) {
  const hands = [];
  let dead = false;
  const die = error => { if (dead) return; dead = true; console.error('A worker failed; carrying on without it.', error); for (const h of hands) h.worker.terminate(); failed(); };
  const send = (h, message, transfer) => { if (h.ready) h.worker.postMessage(message, transfer); else h.early.push([message, transfer]); };
  try {
    for (let i = 0; i < size; i++) {
      const hand = { worker: new Worker(url, { type: 'module' }), ready: false, busy: 0, early: [] };
      hand.worker.onmessage = ({ data }) => {
        if (data.ready) { hand.ready = true; for (const [m, t] of hand.early) hand.worker.postMessage(m, t); hand.early = []; return; }
        hand.busy--;
        done(data);
      };
      hand.worker.onerror = die;
      hands.push(hand);
    }
  } catch (error) { die(error); return null; }
  return {
    tell(message) { for (const h of hands) send(h, message, []); },
    give(message, transfer = []) {
      const h = hands.reduce((a, b) => (b.busy < a.busy ? b : a));
      h.busy++;
      send(h, message, transfer);
    },
    get busy() { return hands.reduce((n, h) => n + h.busy, 0); },
    get alive() { return !dead; },
  };
}

// ---------- the farm ----------
const asked = new Set();
let era = 0;
const IN_HAND = FARMERS * 3;
const pool = startPool(new URL('../sim/chunk.worker.js', import.meta.url), FARMERS, ({ cx, cz, era: from, d, cols, hints }) => {
  if (from !== era) return;
  asked.delete(`${cx},${cz}`);
  keepColumns(cx, cz, cols);
  landChunk(cx, cz, d);
  for (const h of hints) hint(h.kind, h.x, h.y, h.z);
}, () => { asked.clear(); useFarm(null); });

if (pool) {
  useFarm({
    ask(cx, cz) {
      const k = `${cx},${cz}`;
      if (asked.has(k)) return true;
      if (pool.busy >= IN_HAND) return false;
      asked.add(k);
      pool.give({ cx, cz, era });
      return true;
    },
  });
  on('world:loaded', w => {
    era++; asked.clear();
    pool.tell({ world: JSON.stringify(w) }); // as text: a worker still loading would otherwise be sent it later, by when it may hold live objects
  });
}
