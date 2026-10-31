// Makes chunks on another thread. Terrain is the same pure function of the seed here as anywhere, so this only needs the world's layout once.
// Hints are sent back rather than kept: the main thread's list decides who appears, and it drops any that two workers both found.
import { initNoise } from './noise.js';
import { columnsOf, genChunk, hintQueue, setWorldData } from './terrain.js';

self.onmessage = ({ data }) => {
  if (data.world) { const w = JSON.parse(data.world); initNoise(w.seed); setWorldData(w); return; }
  const { cx, cz, era } = data, d = genChunk(cx, cz), cols = columnsOf(cx, cz);
  postMessage({ cx, cz, era, d, cols, hints: hintQueue.splice(0) }, [d.buffer]);
};
postMessage({ ready: true }); // a message sent before this line runs would be lost
