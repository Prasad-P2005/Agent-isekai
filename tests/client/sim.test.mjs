// The simulation, run with no browser: physics, combat, AI, mining and creature lifetimes.
// That this file loads at all proves sim/ needs neither the renderer nor the page.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixedSteps, STEP } from '../../client/js/core/loop.js';
import { on } from '../../client/js/core/events.js';
import { G } from '../../client/js/core/state.js';
import { castFireball, castHeal, drank } from '../../client/js/sim/abilities.js';
import { AIR, dropOf, hardness } from '../../client/js/sim/blocks.js';
import { chunks, getBlock, setBlock, streamChunks } from '../../client/js/sim/chunks.js';
import { applyEffects, applyState } from '../../client/js/sim/effects.js';
import { edits, loadEdits, requeueEdits, takeUnsentEdits } from '../../client/js/sim/edits.js';
import { ents, hurtEntity, isNight, meleeHit, removeEntity, spawnEntity, updateEntities } from '../../client/js/sim/entities.js';
import { addBlock, count, heldBlock, hotbar, takeBlock } from '../../client/js/sim/inventory.js';
import { aim, miningBar, placeBlock, stopAiming, updateMining } from '../../client/js/sim/mining.js';
import { initNoise } from '../../client/js/sim/noise.js';
import { crimeJudged, replaceSettlement, updateLaw } from '../../client/js/sim/people.js';
import { collides, damagePlayer, lookDir, placePlayer, player, raycast, settlePlayer, updatePlayer, updateStats } from '../../client/js/sim/player.js';
import { projectiles, updateProjectiles } from '../../client/js/sim/projectiles.js';
import { CS, H, heightAt, hintQueue, idx, setWorldData, chunkKey } from '../../client/js/sim/terrain.js';

const fixture = JSON.parse(readFileSync(new URL('./world.json', import.meta.url)));
let OPEN_LAND = [224, 224]; // moved in the setup below to a spot with no trees around it

function newProfile() { return { gold: 30, blocks: {}, abilities: [], max_hp: 20, weapon: 0, armor: 0, tool: 1, bounty: 0 }; }
function worldData() {
  return { ...fixture, player: newProfile(), spawn: { x: OPEN_LAND[0] + 0.5, z: OPEN_LAND[1] + 0.5 }, demon_lord_dead: false, demon_lord_name: 'Malzareth',
    settlements: fixture.settlements.map(s => ({ ...s, residents: [] })) };
}
// Stands the player on the ground at x, z with the world around them loaded.
function goTo(x, z) {
  player.pos.set(x + 0.5, heightAt(x, z) + 1, z + 0.5);
  player.vel.set(0, 0, 0);
  streamChunks(player.pos.x, player.pos.z, Infinity);
}
function run(seconds, step = updateEntities) { for (let i = 0; i < seconds * 60; i++) step(STEP); }
const heard = name => { const got = []; on(name, d => got.push(d)); return got; };

const crimes = heard('crime:reported'), kills = heard('entity:killed'), deaths = heard('player:died');

// Grass with nothing built or grown within a few blocks.
function findClearGround() {
  const isClear = (x, z) => {
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
      const h = heightAt(x + a, z + b);
      if (h !== heightAt(x, z) || getBlock(x + a, h, z + b) !== 1) return false;
      for (let y = h + 1; y < H; y++) if (getBlock(x + a, y, z + b) !== AIR) return false;
    }
    return true;
  };
  for (let x = OPEN_LAND[0] - 40; x < OPEN_LAND[0] + 40; x++) for (let z = OPEN_LAND[1] - 40; z < OPEN_LAND[1] + 40; z++) if (isClear(x, z)) return [x, z];
  throw new Error('no clear ground near the test spot');
}
let groundFound = false;

beforeEach(() => {
  ents.length = 0; hintQueue.length = 0; projectiles.length = 0; chunks.clear(); edits.clear(); takeUnsentEdits();
  crimes.length = 0; kills.length = 0; deaths.length = 0; hotbar.ids.fill(0); hotbar.slot = 0;
  G.world = worldData(); G.profile = G.world.player; G.phase = 'world'; G.locked = true; G.uiOpen = false; G.keys = {}; G.mouseDown = false; G.dayTime = 0.1;
  initNoise(fixture.seed); setWorldData(G.world);
  placePlayer(G.world);
  goTo(...OPEN_LAND);
  if (!groundFound) { OPEN_LAND = findClearGround(); groundFound = true; goTo(...OPEN_LAND); }
  settlePlayer();
  player.iframe = 0; player.wanted = 0; player.hp = 20; player.mana = 100; player.yaw = player.pitch = 0;
  stopAiming();
});

// ---------- the player ----------
test('the player falls and lands on the ground', () => {
  player.pos.y += 6;
  run(2, updatePlayer);
  assert.equal(player.onGround, true);
  assert.equal(collides(player.pos), false);
  assert.ok(Math.abs(player.pos.y - (heightAt(...OPEN_LAND) + 1)) < 1.1);
});

test('a jump needs ground under your feet', () => {
  run(0.5, updatePlayer);
  G.keys.Space = true;
  updatePlayer(STEP);
  assert.equal(player.vel.y, 9);
  player.pos.y += 5;
  player.vel.y = 0;
  updatePlayer(STEP);
  assert.ok(player.vel.y < 0);
});

test('the player cannot leave the finite world', () => {
  player.pos.set(-500, 200, 100);
  updatePlayer(STEP);
  assert.equal(player.pos.x, -20);
});

test('walking goes the way the player is facing', () => {
  player.yaw = 0;
  G.keys.KeyW = true;
  const z = player.pos.z;
  run(0.5, updatePlayer);
  assert.ok(player.pos.z < z);
  assert.ok(lookDir().z < 0);
});

test('the game plays the same at any frame rate', () => {
  const walk = fps => {
    goTo(...OPEN_LAND);
    player.yaw = 0; G.keys.KeyW = true;
    const advance = fixedSteps(updatePlayer);
    for (let i = 0; i < 2 * fps; i++) advance(1 / fps);
    return player.pos.z;
  };
  const at30 = walk(30), at60 = walk(60), at144 = walk(144);
  assert.ok(Math.abs(at30 - at60) < 0.2, `${at30} vs ${at60}`);
  assert.ok(Math.abs(at144 - at60) < 0.2, `${at144} vs ${at60}`);
});

test('a slow machine runs slower instead of spiralling', () => {
  let steps = 0;
  fixedSteps(() => steps++)(10);
  assert.equal(steps, 5);
});

test('a long fall hurts', () => {
  player.pos.y += 14;
  run(3, updatePlayer);
  assert.ok(player.hp < 20 && player.hp > 0);
});

test('a short fall does not', () => {
  player.pos.y += 3;
  run(2, updatePlayer);
  assert.equal(player.hp, 20);
});

test('armor reduces damage', () => {
  G.profile.armor = 0.5;
  damagePlayer(10, 'a test');
  assert.equal(player.hp, 15);
});

test('dying sends you back to the spawn and tells the server', () => {
  player.pos.set(50, 90, 50);
  damagePlayer(99, 'a dragon');
  assert.deepEqual(deaths, ['a dragon']);
  assert.equal(player.pos.x, player.spawn.x);
  assert.equal(player.hp, 20);
});

test('standing on magma burns', () => {
  const x = Math.floor(player.pos.x), y = Math.floor(player.pos.y - 0.1), z = Math.floor(player.pos.z);
  setBlock(x, y, z, 36);
  updateStats(STEP);
  assert.ok(player.hp < 20);
});

// ---------- saving and restoring ----------
test('a new game starts at the spawn', () => {
  placePlayer(G.world);
  assert.equal(player.restored, false);
  assert.equal(player.pos.x, G.world.spawn.x);
});

test('a saved game continues where it stopped', () => {
  G.world.player = { ...newProfile(), pos: { x: 12, y: 3, z: 34 }, hp: 7, mana: 40, wanted: 25 };
  G.world.day_time = 0.6;
  G.profile = G.world.player;
  placePlayer(G.world);
  settlePlayer();
  assert.deepEqual([player.pos.x, player.pos.y, player.pos.z], [12, 3, 34]); // not lifted out of a cave onto the surface
  assert.deepEqual([player.hp, player.mana, player.wanted, G.dayTime], [7, 40, 25, 0.6]);
  assert.equal(player.spawn.x, G.world.spawn.x);
});

test('saved edits rebuild the world', () => {
  const cx = 6, cz = 6, k = chunkKey(cx, cz), i = idx(5, 150, 5);
  loadEdits({ [k]: { [i]: 18 } });
  chunks.clear();
  streamChunks(player.pos.x, player.pos.z, Infinity);
  assert.equal(getBlock(cx * CS + 5, 150, cz * CS + 5), 18);
});

test('changed blocks wait to be sent, once', () => {
  setBlock(100, 150, 100, 18);
  const sent = takeUnsentEdits();
  assert.equal(Object.keys(sent).length, 1);
  assert.deepEqual(takeUnsentEdits(), {});
});

test('a failed send is tried again, without undoing newer changes', () => {
  setBlock(100, 150, 100, 18);
  const failed = takeUnsentEdits();
  setBlock(100, 150, 100, 19);
  requeueEdits(failed);
  const [changes] = Object.values(takeUnsentEdits());
  assert.deepEqual(Object.values(changes), [19]);
});

test('a failed send keeps its changes for next time', () => {
  setBlock(100, 150, 100, 18);
  requeueEdits(takeUnsentEdits());
  assert.equal(Object.keys(takeUnsentEdits()).length, 1);
});

test('a block changed in an unloaded chunk comes back when the chunk does', () => {
  setBlock(100, 150, 100, 18);
  chunks.clear();
  streamChunks(player.pos.x, player.pos.z, Infinity);
  assert.equal(getBlock(100, 150, 100), 18);
});

// ---------- mining and building ----------
function aimAtGround() {
  player.pitch = -Math.PI / 2 + 0.001; player.yaw = 0;
  aim.block = raycast({ x: player.pos.x, y: player.pos.y + 1.62, z: player.pos.z }, lookDir(), 7);
  assert.ok(aim.block);
  return aim.block;
}

test('mining takes as long as the block is hard', () => {
  const t = aimAtGround(), id = getBlock(t.x, t.y, t.z), need = hardness(id);
  G.mouseDown = true;
  updateMining(need / 2);
  assert.equal(getBlock(t.x, t.y, t.z), id);
  assert.ok(miningBar.progress > 0.4 && miningBar.progress < 0.6);
  updateMining(need);
  assert.equal(getBlock(t.x, t.y, t.z), AIR);
  assert.equal(count(dropOf(id)), 1);
});

test('a pickaxe mines faster', () => {
  const t = aimAtGround(), id = getBlock(t.x, t.y, t.z);
  G.profile.tool = 5;
  G.mouseDown = true;
  updateMining(hardness(id) / 5 + 0.01);
  assert.equal(getBlock(t.x, t.y, t.z), AIR);
});

test('letting go of the mouse stops mining', () => {
  const t = aimAtGround(), id = getBlock(t.x, t.y, t.z);
  G.mouseDown = true;
  updateMining(hardness(id) / 2);
  G.mouseDown = false;
  updateMining(STEP);
  G.mouseDown = true;
  updateMining(hardness(id) / 2);
  assert.equal(getBlock(t.x, t.y, t.z), id);
});

test('a placed block is paid for from the inventory', () => {
  const t = aimAtGround();
  player.pos.x += 3; // do not build on your own feet
  addBlock(18, 2);
  placeBlock();
  assert.equal(getBlock(t.x + t.n[0], t.y + t.n[1], t.z + t.n[2]), 18);
  assert.equal(count(18), 1);
});

test('you cannot place a block you do not have', () => {
  const t = aimAtGround();
  placeBlock();
  assert.equal(getBlock(t.x + t.n[0], t.y + t.n[1], t.z + t.n[2]), AIR);
  assert.equal(heldBlock(), 0);
});

test('you cannot spend a block twice', () => {
  addBlock(18);
  assert.equal(takeBlock(18), true);
  assert.equal(takeBlock(18), false);
});

test('new server state does not overwrite blocks mined a moment ago', () => {
  addBlock(19, 3);
  applyState({ player: { ...newProfile(), gold: 99 } });
  assert.equal(G.profile.gold, 99);
  assert.equal(count(19), 3);
});

// ---------- combat ----------
const near = (kind, opts) => spawnEntity(kind, player.pos.x + 2, player.pos.y, player.pos.z, opts);

test('a melee hit does your weapon damage', () => {
  G.profile.weapon = 3;
  const e = near('orc');
  meleeHit(e);
  assert.equal(e.hp, 40 - 7);
});

test('melee has a cooldown', () => {
  const e = near('orc');
  player.atkCd = 0;
  meleeHit(e); meleeHit(e);
  assert.equal(e.hp, 40 - 4);
});

test('a kill is reported with who did it', () => {
  hurtEntity(near('goblin'), 999, 1, 0);
  assert.deepEqual(kills, [{ kind: 'goblin', byPlayer: true, resident: null }]);
  assert.equal(ents.length, 0);
});

test('a monster killing a monster gives you nothing', () => {
  const killer = near('orc');
  hurtEntity(near('goblin'), 999, 1, 0, killer);
  assert.deepEqual(kills, []);
});

test('killing a resident reports them to the right settlement', () => {
  const res = { id: 5003, kind: 'villager', job: 'farmer', dead: false };
  hurtEntity(near('villager', { res }), 999, 1, 0);
  assert.deepEqual(kills[0].resident, { settlement: 5, id: 5003 });
  assert.equal(res.dead, true);
});

test('killing a villager is murder', () => {
  hurtEntity(near('villager'), 999, 1, 0);
  assert.equal(crimes[0].body.crime, 'kill_human');
});

test('hitting a villager is a crime only once', () => {
  const e = near('villager');
  hurtEntity(e, 1, 1, 0); hurtEntity(e, 1, 1, 0);
  assert.deepEqual(crimes.map(c => c.body.crime), ['attack_civilian']);
  assert.ok(e.fleeT > 0);
});

test('a nearby guard is a lawman, a nearby villager a civilian', () => {
  near('knight', { name: 'Gareth' });
  near('villager', { name: 'Mia' });
  hurtEntity(near('villager', { name: 'Tom' }), 999, 1, 0);
  assert.deepEqual(crimes[0].body.lawmen, ['Gareth']);
  assert.deepEqual(crimes[0].body.civilians, ['Mia']);
});

test('nobody sees a crime in the dark from far away', () => {
  G.dayTime = 0.75;
  assert.equal(isNight(), true);
  spawnEntity('villager', player.pos.x + 20, player.pos.y, player.pos.z, { name: 'Mia' });
  hurtEntity(near('villager', { name: 'Tom' }), 999, 1, 0);
  assert.deepEqual(crimes[0].body.civilians, []);
});

test('a witness runs to report you unless silenced', () => {
  const reports = heard('law:reported');
  const w = near('villager', { name: 'Mia' });
  crimeJudged('kill_human', [w], { results: [{ outcome: 'witnessed', law: 'Law of the Crown', witnesses: ['Mia'] }] });
  assert.equal(w.reportT, 20);
  run(21);
  assert.deepEqual(reports, [{ law: 'Law of the Crown', by: 'Mia the Villager' }]);
});

test('a silenced witness reports nothing', () => {
  const reports = heard('law:reported');
  const w = near('villager', { name: 'Mia' });
  crimeJudged('kill_human', [w], { results: [{ outcome: 'witnessed', law: 'Law of the Crown', witnesses: ['Mia'] }] });
  hurtEntity(w, 999, 1, 0);
  run(21);
  assert.deepEqual(reports, []);
});

test('a monster attacks the player when it reaches them', () => {
  player.ready = true;
  spawnEntity('orc', player.pos.x + 1, player.pos.y, player.pos.z);
  run(3);
  assert.ok(player.hp < 20);
});

test('monsters leave a paused player alone', () => {
  G.uiOpen = true;
  spawnEntity('orc', player.pos.x + 1, player.pos.y, player.pos.z);
  run(3);
  assert.equal(player.hp, 20);
});

test('guards fight monsters', () => {
  const orc = near('orc');
  spawnEntity('knight', orc.pos.x + 1, orc.pos.y, orc.pos.z);
  run(4);
  assert.ok(orc.hp < 40);
});

test('the hunt ends when the wanted time runs out', () => {
  player.wanted = 1;
  run(1.2, updateLaw);
  assert.equal(player.wanted, 0);
});

test('effects from the law reach the player', () => {
  applyEffects({ text: 'test', wanted: 100 });
  assert.equal(player.wanted, 100);
  applyEffects({ clear_wanted: true });
  assert.equal(player.wanted, 0);
  applyEffects({ exile: true });
  assert.equal(player.pos.y, 140);
});

test('resting at an inn brings the morning', () => {
  G.dayTime = 0.7;
  applyEffects({ morning: true });
  assert.equal(G.dayTime, 0.05);
});

test('a new roster removes the old people from the world', () => {
  const res = { id: 5003, kind: 'villager', job: 'farmer' };
  G.world.settlements[5].residents = [res];
  near('villager', { res });
  replaceSettlement(5, { residents: [] });
  assert.equal(ents.length, 0);
});

// ---------- magic ----------
test('a fireball costs mana and needs the scroll', () => {
  castFireball();
  assert.equal(projectiles.length, 0);
  G.profile.abilities = ['fireball'];
  castFireball();
  assert.equal(projectiles.length, 1);
  assert.equal(player.mana, 80);
});

test('a fireball burns what it hits', () => {
  G.profile.abilities = ['fireball'];
  player.yaw = 0; player.pitch = 0;
  const e = spawnEntity('orc', player.pos.x, player.pos.y, player.pos.z - 4);
  castFireball();
  run(1, updateProjectiles);
  assert.equal(e.hp, 40 - 14);
  assert.equal(projectiles.length, 0);
});

test('healing costs mana and restores health', () => {
  G.profile.abilities = ['heal'];
  player.hp = 5;
  castHeal();
  assert.equal(player.hp, 13);
  assert.equal(player.mana, 65);
});

test('a potion only works if the server says you had one', () => {
  player.hp = 5;
  drank('potion', false);
  assert.equal(player.hp, 5);
  drank('potion', true);
  assert.equal(player.hp, 15);
});

// ---------- creature lifetimes ----------
const CASTLE = [480, 32];
let lordHint = null; // terrain only announces him the first time his chunk is built, so the tests share what it said
function lordSpot() {
  goTo(...CASTLE);
  lordHint ||= hintQueue.find(q => q.kind === 'demon_lord');
  assert.ok(lordHint, 'the castle places the Demon Lord');
  if (!hintQueue.includes(lordHint)) hintQueue.push(lordHint);
  return lordHint;
}
function bossSpot() {
  const h = lordSpot();
  goTo(h.x + 10, h.z);
  run(1);
  const lord = ents.find(e => e.kind === 'demon_lord');
  assert.ok(lord, 'he appears when the player arrives');
  return { h, lord };
}

test('the Demon Lord is still there after you walk away and come back', () => {
  const { h } = bossSpot();
  player.pos.x = h.x - 140; // walking away, with his chunk still loaded
  run(0.1);
  assert.equal(ents.some(e => e.kind === 'demon_lord'), false);
  goTo(h.x + 10, h.z);
  run(1);
  assert.equal(ents.filter(e => e.kind === 'demon_lord').length, 1);
});

test('a slain Demon Lord stays dead', () => {
  const { h, lord } = bossSpot();
  hurtEntity(lord, 9999, 1, 0);
  G.world.demon_lord_dead = true;
  player.pos.x = h.x - 140;
  run(0.1);
  goTo(h.x + 10, h.z);
  run(1);
  assert.equal(ents.some(e => e.kind === 'demon_lord'), false);
});

test('after a reload, a slain Demon Lord does not rise again', () => {
  const h = lordSpot(); // loading the castle again announces him again
  G.world.demon_lord_dead = true;
  goTo(h.x + 10, h.z);
  run(1);
  assert.equal(ents.some(e => e.kind === 'demon_lord'), false);
});

test('a spawn waits when the world is too crowded', () => {
  const h = lordSpot();
  goTo(h.x + 10, h.z);
  const crowd = [];
  for (let i = 0; i < 25; i++) crowd.push(spawnEntity('slime', h.x + 30, h.y + 40, h.z));
  run(0.6);
  assert.equal(ents.some(e => e.kind === 'demon_lord'), false);
  crowd.forEach(removeEntity);
  run(0.6);
  assert.equal(ents.some(e => e.kind === 'demon_lord'), true);
});

test('a creature left in unloaded ground stops taking up a slot', () => {
  const e = spawnEntity('goblin', player.pos.x + 400, 80, player.pos.z);
  assert.equal(chunks.has(chunkKey(Math.floor(e.pos.x / CS), Math.floor(e.pos.z / CS))), false);
  run(0.1);
  assert.equal(ents.length, 0);
});

test('residents are not removed by the distance rule', () => {
  const res = { id: 5003, kind: 'villager', job: 'farmer' };
  spawnEntity('villager', player.pos.x + 400, 80, player.pos.z, { res });
  run(0.1);
  assert.equal(ents.length, 1);
});

test('golems go home when you are no longer wanted', () => {
  spawnEntity('golem', player.pos.x + 20, player.pos.y, player.pos.z);
  run(0.1);
  assert.equal(ents.length, 0);
});

test('golems stay while you are wanted', () => {
  player.wanted = 10;
  spawnEntity('golem', player.pos.x + 20, player.pos.y, player.pos.z);
  run(0.1);
  assert.equal(ents.length, 1);
});

test('a bounty hunter leaves when the bounty is paid', () => {
  G.profile.bounty = 0;
  spawnEntity('bounty_hunter', player.pos.x + 5, player.pos.y, player.pos.z);
  run(0.1);
  assert.equal(ents.length, 0);
});

test('the world has a limit on creatures', () => {
  for (let i = 0; i < 30; i++) near('slime');
  assert.equal(ents.length, 25);
});
