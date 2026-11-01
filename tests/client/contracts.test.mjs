// Python and JavaScript share content/. These check the spots where code on one side still names data from the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES, CREATURES, EVENTS, GUILD, JOBS, LAWS, REALMS, SERVICES } from '../../client/js/core/content.js';
import { WORLD_EVENTS } from '../../client/js/sim/worldevents.js';
import { B, REALM } from '../../client/js/sim/terrain.js';
import { BLOCKS } from '../../client/js/core/content.js';
import { tileIndex } from '../../client/js/view/blocktex.js';
import { OUTFITS, lookFor } from '../../client/js/view/outfits.js';
import { ITEMS, RECIPES } from '../../client/js/core/content.js';
import { spritePixels } from '../../client/js/view/itemart.js';

test('every world event does something on the client', () => {
  assert.deepEqual(Object.keys(WORLD_EVENTS).sort(), [...EVENTS].sort());
});

test('every job has an outfit', () => {
  assert.deepEqual(Object.keys(JOBS.jobs).filter(j => !OUTFITS[j]), []);
});

test('every job has a body', () => {
  const kinds = Object.values(JOBS.jobs).map(j => j.kind).filter(Boolean);
  const all = [...kinds, ...Object.values(JOBS.elf_kind), ...Object.values(JOBS.base_kind)];
  assert.deepEqual(all.filter(k => !CREATURES[k]), []);
});

test('everyone who looks like a person can be dressed, with or without a job', () => {
  for (const [kind, D] of Object.entries(CREATURES)) if (D.avatar) assert.equal(typeof lookFor(kind, undefined, 7, D).top, 'number', kind);
});

test('whatever a creature can drop is a real item, at chances that make sense', () => {
  for (const [kind, D] of Object.entries(CREATURES)) for (const [id, chance, least, most] of D.drops ?? []) assert.ok(ITEMS[id] && chance > 0 && chance <= 1 && least >= 1 && most >= least, `${kind}: ${id}`);
});

test('every service a job offers has a panel', () => {
  const services = new Set(Object.values(JOBS.jobs).map(j => j.service).filter(Boolean));
  assert.deepEqual([...services].filter(s => !SERVICES[s]?.title && !SERVICES[s]?.talk_only), []);
});

test('every friendly race can be murdered under the law', () => {
  const races = new Set(Object.values(CREATURES).filter(c => c.friendly && !c.sacred).map(c => c.race));
  assert.deepEqual([...races].filter(r => !LAWS.crimes[`kill_${r}`]), []);
});

test('every block is painted', () => {
  const blocks = BLOCKS.filter(b => b.name !== 'Air' && b.name !== 'Water');
  assert.deepEqual(blocks.filter(b => !b.tex || [].concat(b.tex).some(t => tileIndex(t) === undefined)).map(b => b.name), []);
});

test('every realm has a biome', () => {
  assert.deepEqual(Object.values(REALMS).filter(r => B[r.biome] === undefined || !REALM[B[r.biome]]), []);
});

test('every guild quest hunts a real creature', () => {
  assert.deepEqual(GUILD.quests.filter(q => !CREATURES[q.kind]), []);
});

test('every ability the game grants is listed', () => {
  for (const name of ['fireball', 'heal', 'frost_nova', 'chain_lightning', 'blink', 'mana_ward', 'meteor', 'flight', 'double_jump', 'swift', 'giant_strength']) assert.ok(ABILITIES[name], name);
});

test('every spell says what it costs and what it does', () => {
  assert.deepEqual(Object.entries(ABILITIES).filter(([, a]) => !a.about).map(([id]) => id), []);
  assert.deepEqual(['fireball', 'heal', 'frost_nova', 'chain_lightning', 'blink', 'mana_ward', 'meteor'].filter(id => !ABILITIES[id].mana), []);
});

test('every item has a drawing', () => {
  for (const it of Object.values(ITEMS)) if (it.art) assert.ok(spritePixels(it.art, it.pal), it.name);
  assert.deepEqual(Object.values(ITEMS).filter(it => !it.art && it.block == null && !it.place).map(it => it.name), []);
});

test('every recipe names real items', () => {
  const names = r => [r.out, ...Object.values(r.keys ?? {}), ...(r.of ?? []), ...(r.in ?? [])];
  assert.deepEqual(RECIPES.flatMap(names).filter(id => !ITEMS[id]), []);
});

test('every block gives something that exists', () => {
  const named = BLOCKS.flatMap(b => [b.yield, ...(b.loot ?? []).map(l => l[0])]).filter(Boolean);
  assert.deepEqual(named.filter(id => !ITEMS[id]), []);
});

test('whatever a monster leaves is an item', () => {
  const slug = name => name.toLowerCase().replace(/\W+/g, '_');
  assert.deepEqual(Object.values(CREATURES).filter(c => c.loot && !ITEMS[slug(c.loot.name)]).map(c => c.label), []);
});
