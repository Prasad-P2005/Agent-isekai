// Where the beings that live in structures appear. In its own file because generated spawns are remembered per process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initNoise } from '../../client/js/sim/noise.js';
import { BESTIARY, BIOMES, CREATURES, SPAWNS } from '../../client/js/core/content.js';
import { CS, LAND, genChunk, heightAt, hintQueue, landOf, setWorldData } from '../../client/js/sim/terrain.js';

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

test('the story has stones to read and a Voice to find', () => {
  assert.ok(named('law_stone').every(h => landOf(h.x, h.z).structure === 'crystal_spire') && named('law_stone').length === 2);
  assert.equal(named('cairn').length, 1);
  assert.equal(landOf(named('cairn')[0].x, named('cairn')[0].z).structure, 'ruins');
  assert.equal(named('mermaid_queen').length, 2);
});

test('there is one dragon in the world, in the cave under its mountain, well away from the Law Stones', () => {
  const dragons = named('dragon'), [d] = dragons;
  assert.equal(dragons.length, 1);
  assert.equal(landOf(d.x, d.z).structure, 'dragon_peak');
  assert.ok(d.y < heightAt(d.x + 20, d.z) - 10);
  for (const s of named('law_stone')) assert.ok(Math.hypot(d.x - s.x, d.z - s.z) > 200); // a chase must not end up guarding the story
});

test('every creature in the spawn tables exists, and every biome they name', () => {
  const rules = [...Object.values(SPAWNS.biomes).flatMap(Object.values), ...Object.values(SPAWNS.caves), ...Object.values(SPAWNS.structures).flatMap(Object.values)].flat();
  assert.deepEqual(rules.filter(r => !CREATURES[r.kind]), []);
  const biomes = new Set(BIOMES.map(b => b.key));
  assert.ok(Object.keys(SPAWNS.biomes).every(k => biomes.has(k)));
});

test('nature never makes a dragon', () => {
  assert.equal(JSON.stringify(SPAWNS).includes('"dragon"'), false);
});

test('every creature has a journal entry, listed once', () => {
  const listed = BESTIARY.groups.flatMap(g => g.kinds);
  assert.deepEqual([...listed].sort(), Object.keys(CREATURES).sort());
  assert.deepEqual(listed.filter(k => !BESTIARY.entries[k]), []);
});

test('generating a chunk again does not place him twice', () => {
  const { x, z } = named('demon_lord')[0];
  genChunk(Math.floor(x / CS), Math.floor(z / CS));
  assert.equal(named('demon_lord').length, 1);
});
