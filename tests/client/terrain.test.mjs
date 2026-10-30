// Terrain never crosses the wire: every player's world is rebuilt from the seed, so these rules must hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BL } from '../../client/js/sim/blocks.js';
import { initNoise } from '../../client/js/sim/noise.js';
import { CS, LAND, SEA, genChunk, heightAt, idx, landOf, setWorldData } from '../../client/js/sim/terrain.js';

const world = JSON.parse(readFileSync(new URL('./world.json', import.meta.url)));
const CHUNKS = world.lands.length * LAND / CS; // chunks along one side of the map
// Changing this means every saved world changes shape under its player. Only update it on purpose.
const WORLD_HASH = 'b7fd7e5df477cc0a1e263d011c23702c769922122de0a7d94afdb00e04a04c6c';

function useSeed(seed) { initNoise(seed); setWorldData(world); }
function* allChunks() { for (let cz = 0; cz < CHUNKS; cz++) for (let cx = 0; cx < CHUNKS; cx++) yield genChunk(cx, cz); }
function hashOf(seed) {
  useSeed(seed);
  const hash = createHash('sha256');
  for (const chunk of allChunks()) hash.update(chunk);
  return hash.digest('hex');
}

test('saved worlds keep their shape', () => {
  assert.equal(hashOf(world.seed), WORLD_HASH);
});

test('the same seed builds the same world again', () => {
  assert.equal(hashOf(world.seed), hashOf(world.seed));
});

test('another seed builds another world', () => {
  assert.notEqual(hashOf(world.seed), hashOf(world.seed + 1));
});

test('every building and block the world uses exists', () => {
  useSeed(world.seed);
  const unknown = new Set();
  for (const chunk of allChunks()) for (const id of chunk) if (!BL[id]) unknown.add(id);
  assert.deepEqual([...unknown], []);
});

test('the bottom of the world is bedrock', () => {
  useSeed(world.seed);
  for (const chunk of allChunks()) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) assert.equal(chunk[idx(x, 0, z)], 31);
});

test('settlements stand on level ground', () => {
  useSeed(world.seed);
  for (const s of world.settlements) assert.equal(heightAt(s.cx, s.cz), SEA + 5, s.type);
});

test('the map is an ocean beyond its edges', () => {
  useSeed(world.seed);
  assert.equal(landOf(-1, -1).b, 0);
  assert.equal(landOf(world.lands.length * LAND, 0).b, 0);
});

test("a player's edit replaces the generated block", () => {
  useSeed(world.seed);
  const i = idx(5, 150, 5), plain = genChunk(3, 3), edited = genChunk(3, 3, new Map([[i, 18]]));
  assert.equal(plain[i], 0);
  assert.equal(edited[i], 18);
  edited[i] = 0;
  assert.deepEqual(edited, plain);
});

test('both sides agree on the size of a land', () => {
  assert.equal(LAND, world.land);
});
