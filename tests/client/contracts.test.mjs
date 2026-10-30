// Python and JavaScript share content/. These check the spots where code on one side still names data from the other.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ABILITIES, CREATURES, EVENTS, GUILD, JOBS, LAWS, REALMS, SERVICES } from '../../client/js/core/content.js';
import { WORLD_EVENTS } from '../../client/js/sim/worldevents.js';
import { B, REALM } from '../../client/js/sim/terrain.js';
import { OUTFITS } from '../../client/js/view/outfits.js';

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

test('every service a job offers has a panel', () => {
  const services = new Set(Object.values(JOBS.jobs).map(j => j.service).filter(Boolean));
  assert.deepEqual([...services].filter(s => !SERVICES[s]?.title && !SERVICES[s]?.talk_only), []);
});

test('every friendly race can be murdered under the law', () => {
  const races = new Set(Object.values(CREATURES).filter(c => c.friendly).map(c => c.race));
  assert.deepEqual([...races].filter(r => !LAWS.crimes[`kill_${r}`]), []);
});

test('every realm has a biome', () => {
  assert.deepEqual(Object.values(REALMS).filter(r => B[r.biome] === undefined || !REALM[B[r.biome]]), []);
});

test('every guild quest hunts a real creature', () => {
  assert.deepEqual(GUILD.quests.filter(q => !CREATURES[q.kind]), []);
});

test('every ability the game grants is listed', () => {
  for (const name of ['fireball', 'heal', 'flight', 'double_jump', 'swift', 'giant_strength']) assert.ok(ABILITIES[name], name);
});
