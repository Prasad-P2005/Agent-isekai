// Where the beings that live in structures appear. In its own file because generated spawns are remembered per process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initNoise } from '../../client/js/sim/noise.js';
import { CS, LAND, genChunk, hintQueue, landOf, setWorldData } from '../../client/js/sim/terrain.js';

const world = JSON.parse(readFileSync(new URL('./world.json', import.meta.url)));
const CHUNKS = world.lands.length * LAND / CS;

initNoise(world.seed); setWorldData(world);
for (let cz = 0; cz < CHUNKS; cz++) for (let cx = 0; cx < CHUNKS; cx++) genChunk(cx, cz);
const named = kind => hintQueue.filter(h => h.kind === kind);

test('the Demon Lord is placed once, in his castle', () => {
  const lords = named('demon_lord');
  assert.equal(lords.length, 1);
  assert.equal(landOf(lords[0].x, lords[0].z).structure, 'demon_castle');
});

test('two demon knights guard him', () => {
  assert.equal(named('demon_knight').length, 2);
});

test('generating a chunk again does not place him twice', () => {
  const { x, z } = named('demon_lord')[0];
  genChunk(Math.floor(x / CS), Math.floor(z / CS));
  assert.equal(named('demon_lord').length, 1);
});
