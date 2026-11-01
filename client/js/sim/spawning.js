// What arrives in the world, and where. The rules are Minecraft's, read from content/spawns.json: every few seconds each category under its
// cap picks a random spot in a ring around the hero, away from where they can see, and if the spot suits a creature from that land's table, a
// pack of them appears there. Light decides most of it: monsters need the dark, lamps keep them off, and animals want daylight.
// Three other things come through here too: beings that live in structures, foes the story sends, and the law.
import { BIOMES, CREATURES, SPAWNS } from '../core/content.js';
import { G } from '../core/state.js';
import { rule } from '../core/rules.js';
import { on } from '../core/events.js';
import { ents, isMonsterKind, isNight } from './beings.js';
import { BUILT, GROUND, WATER, solid } from './blocks.js';
import { chunkReady, getBlock } from './chunks.js';
import { fitsAt, spawnEntity } from './entities.js';
import { lampLight, skyLight } from './light.js';
import { floorBelow } from './paths.js';
import { inView, player } from './player.js';
import { H, SEA, biomeAt, heightAt, hintQueue, inCity, inTown, landOf, nearLair, caveBiomeAt } from './terrain.js';

const APPEAR_RANGE = 48, HINT_GAP = 0.5, SPOT_TRIES = 28, PACK_SPREAD = 3, UNDERGROUND = 4, CAVE_LOOK = 12, CAVE_SPAN = 14, DARK_SKY = 7, BRIGHT = 9, COUNT_BEYOND = 16;
const PATIENCE = 60, RETRY_EVERY = 1, RETURN_AFTER = 45, LAIR_HALL = 40;
const FIRST = ['Aldo', 'Brina', 'Cedric', 'Dara', 'Edda', 'Finn', 'Greta', 'Holt', 'Ilse', 'Jorah', 'Kira', 'Lars', 'Mira', 'Nils', 'Odile', 'Pell', 'Runa', 'Sten', 'Tove', 'Ulric'];
const WOUNDS = { demon_lord: 'boss_hp', dragon: 'dragon_hp' }, DEAD = { demon_lord: 'demon_lord_dead', dragon: 'dragon_dead' }; // what outlasts a reload

// ---------- what lives where ----------
const keyOf = b => BIOMES[b].key;
const between = ([low, high]) => low + Math.floor(Math.random() * (high - low + 1));
function pickRule(list) {
  let roll = Math.random() * list.reduce((sum, r) => sum + r.weight, 0);
  for (const r of list) { roll -= r.weight; if (roll <= 0) return r; }
  return list[0];
}
function surfaceRules(x, z, y, cat) {
  const table = SPAWNS.biomes[keyOf(biomeAt(x, z, y))]?.[cat] ?? [], here = SPAWNS.structures[landOf(x, z).structure]?.[cat] ?? [];
  return here.length ? [...table, ...here] : table;
}
const caveRules = (x, z, y) => SPAWNS.caves[caveBiomeAt(x, z)] ?? SPAWNS.caves[keyOf(biomeAt(x, z, y))] ?? SPAWNS.caves.default;
export function localMonsters() { // for events that want whatever hunts around here
  const x = Math.floor(player.pos.x), z = Math.floor(player.pos.z);
  return surfaceRules(x, z, heightAt(x, z), 'monster').map(r => r.kind);
}

// ---------- is this spot any good ----------
const walled = (x, z) => inTown(x, z) || inCity(x, z);
// Natural ground only: a floor someone laid is safe, which also keeps monsters out of houses.
const wildFloor = (x, y, z) => { const id = getBlock(x, y - 1, z); return GROUND.has(id) && !BUILT.has(id); };
function suits(rule, cat, x, y, z) {
  const hostile = (cat === 'monster' || cat === 'cave') && !rule.harmless, night = isNight();
  if (hostile) {
    if (inCity(x, z) || (inTown(x, z) && !night) || lampLight(x, y, z) > 0) return false; // villages are safe by day, and the lamps keep the streets at night
    if (rule.light !== 'any' && !night && skyLight(x, y, z) > DARK_SKY) return false;
  } else if (walled(x, z)) return false;
  if (rule.light === 'bright' && (night || skyLight(x, y, z) < BRIGHT)) return false;
  if (rule.wilds && landOf(x, z).settlement != null) return false;
  if (rule.depth && SEA - heightAt(x, z) < rule.depth) return false;
  return true;
}
function bodyFits(D, x, y, z) {
  return !D.fly && !D.swim ? fitsAt(x + 0.5, y, z + 0.5, D.h) : !solid(getBlock(x, y, z)) && !solid(getBlock(x, y + 1, z));
}
const watery = (x, y, z) => getBlock(x, y, z) === WATER && getBlock(x, y + 1, z) === WATER;
function placeInLand(D, x, z, near) {
  if (D.swim) { const y = SEA - 1 - Math.floor(Math.random() * 4); return watery(x, y, z) ? y : null; }
  if (D.fly) return heightAt(x, z) + 4;
  return floorBelow(x, near + 6, z, 16) ?? floorBelow(x, heightAt(x, z) + 3, z, 8);
}
// Out of the hero's sight if at all possible. A caravan that has to walk into view is better than none, so a visible spot is kept as a last resort.
function findSpot(kind, rmin, rmax) {
  const D = CREATURES[kind];
  let visible = null;
  for (let i = 0; i < SPOT_TRIES; i++) {
    const a = Math.random() * 6.28, r = rmin + Math.random() * (rmax - rmin), x = Math.floor(player.pos.x + Math.cos(a) * r), z = Math.floor(player.pos.z + Math.sin(a) * r);
    if (!chunkReady(x, z)) continue;
    const y = placeInLand(D, x, z, Math.floor(player.pos.y));
    if (y == null || !bodyFits(D, x, y, z)) continue;
    if (!inView(x + 0.5, y + 1, z + 0.5)) return { x, y, z };
    visible ??= { x, y, z };
  }
  return visible;
}

// ---------- the story and the law ----------
const pending = [];
export const clearArrivals = () => { pending.length = 0; };
function arrive(kind, rmin, rmax, opts) {
  const q = findSpot(kind, rmin, rmax);
  if (!q) return false;
  const o = CREATURES[kind]?.friendly && !opts.name ? { ...opts, name: FIRST[Math.floor(Math.random() * FIRST.length)] } : opts;
  return !!spawnEntity(kind, q.x + 0.5, q.y, q.z + 0.5, o);
}
// Sent for and on the way: if there is no room or nowhere to stand right now (the hero is at sea, say), they keep trying for a while.
export function spawnNear(kind, n, rmin, rmax, opts = {}) {
  for (let i = 0; i < n; i++) if (!arrive(kind, rmin, rmax, opts)) pending.push({ kind, rmin, rmax, opts, left: PATIENCE, wait: 0 });
}
// A foe with a name follows you. Give it time and it will find you again, as hurt as you left it.
on('foe:lost', e => pending.push({ kind: e.kind, rmin: 22, rmax: 34, left: PATIENCE + RETURN_AFTER, wait: RETURN_AFTER, opts: { name: e.name, title: e.title, power: e.power, named: e.named, hp: e.hp } }));
export const onItsWay = named => pending.some(p => p.opts.named === named);

// ---------- those who live in structures ----------
const inReach = h => Math.hypot(h.x - player.pos.x, h.z - player.pos.z) <= (CREATURES[h.kind]?.seen_from ?? APPEAR_RANGE) && chunkReady(h.x, h.z);
let hintT = 0, retryT = 0;
function structureSpawning(dt) {
  hintT -= dt;
  if (hintT > 0) return;
  hintT = HINT_GAP;
  for (let i = hintQueue.length - 1; i >= 0; i--) {
    const h = hintQueue[i];
    if (h.due > 0) { h.due -= HINT_GAP; continue; }
    if (h.kind in DEAD && G.world[DEAD[h.kind]]) { hintQueue.splice(i, 1); continue; }
    if (!inReach(h)) continue;
    let y = h.y ?? heightAt(h.x, h.z) + 1; while (!fitsAt(h.x + 0.5, y, h.z + 0.5) && y < H - 2) y++;
    const hp = h.hp ?? G.world[WOUNDS[h.kind]] ?? undefined; // wounds outlast a reload
    if (spawnEntity(h.kind, h.x + 0.5, y, h.z + 0.5, { home: h, hp, role: h.role })) hintQueue.splice(i, 1); // no room right now: try again next time
  }
}
function retryArrivals(dt) {
  retryT -= dt;
  if (retryT > 0) return;
  retryT = RETRY_EVERY;
  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i];
    p.left -= RETRY_EVERY; p.wait -= RETRY_EVERY;
    if (p.wait > 0 && p.left > 0) continue;
    if (p.left <= 0 || arrive(p.kind, p.rmin, p.rmax, p.opts)) pending.splice(i, 1);
  }
}
export function updateArrivals(dt) { structureSpawning(dt); retryArrivals(dt); }

// ---------- nature ----------
const timers = Object.fromEntries(Object.keys(SPAWNS.categories).map((k, i) => [k, 3 + i]));
function spawnPack(table, cat, x, y, z) {
  let made = 0;
  const count = between(table.pack), D = CREATURES[table.kind], nocturnal = table.light == null && isMonsterKind(D), power = isMonsterKind(D) ? rule('monster_power') : 1;
  for (let i = 0; i < count * 2 && made < count; i++) {
    const px = i ? x + Math.floor(Math.random() * (PACK_SPREAD * 2 + 1)) - PACK_SPREAD : x, pz = i ? z + Math.floor(Math.random() * (PACK_SPREAD * 2 + 1)) - PACK_SPREAD : z;
    const py = D.fly || D.swim ? y : i ? floorBelow(px, y + 2, pz, 5) : y;
    if (py == null || !chunkReady(px, pz) || !bodyFits(D, px, py, pz) || (!D.fly && !D.swim && !wildFloor(px, py, pz))) continue;
    if (inView(px + 0.5, py + 1, pz + 0.5) || !suits(table, cat, px, py, pz)) continue;
    if (spawnEntity(table.kind, px + 0.5, py, pz + 0.5, { natural: true, cat, nocturnal, name: D.friendly ? FIRST[Math.floor(Math.random() * FIRST.length)] : undefined, ...(power !== 1 ? { power } : {}) })) made++;
  }
  return made;
}
const underground = () => player.pos.y < heightAt(Math.floor(player.pos.x), Math.floor(player.pos.z)) - UNDERGROUND;
function tryCategory(cat, ring) {
  const a = Math.random() * 6.28, r = ring[0] + Math.random() * (ring[1] - ring[0]), x = Math.floor(player.pos.x + Math.cos(a) * r), z = Math.floor(player.pos.z + Math.sin(a) * r);
  if (!chunkReady(x, z)) return 0;
  const top = heightAt(x, z);
  if (cat === 'cave') {
    const y = floorBelow(x, Math.floor(player.pos.y) + Math.floor(Math.random() * CAVE_SPAN * 2) - CAVE_SPAN, z, CAVE_LOOK);
    if (y == null || y >= top - UNDERGROUND || nearLair(x, z, LAIR_HALL)) return 0; // the Wyrm's hall stays empty but for the Wyrm
    return spawnPack(pickRule(caveRules(x, z, top)), cat, x, y, z);
  }
  if (cat === 'water') {
    const list = surfaceRules(x, z, top, cat);
    if (!list.length) return 0;
    const y = SEA - 1 - Math.floor(Math.random() * 4);
    return watery(x, y, z) ? spawnPack(pickRule(list), cat, x, y, z) : 0;
  }
  const list = surfaceRules(x, z, top, cat), y = floorBelow(x, top + 3, z, 8);
  if (!list.length || y == null || y <= SEA) return 0;
  const table = pickRule(list), D = CREATURES[table.kind];
  return spawnPack(table, cat, x, D.fly ? y + 4 : y, z);
}
function naturalSpawning(dt) {
  const night = isNight(), deep = underground();
  for (const [cat, C] of Object.entries(SPAWNS.categories)) {
    timers[cat] -= dt;
    if (timers[cat] > 0) continue;
    timers[cat] = C.every;
    if (cat === 'cave' && !deep) continue;
    if (cat !== 'cave' && deep) continue; // the surface can wait: nothing up there can reach you
    const hostile = cat === 'monster' || cat === 'cave', cap = (cat === 'monster' && !night ? C.day_cap : C.cap) * (hostile ? rule('monster_cap') : rule('beast_cap')), range = C.ring[1] + COUNT_BEYOND;
    // Only what is around the hero counts, or a crowd left behind would keep new ones from appearing, Minecraft's own trick.
    let local = 0;
    for (const e of ents) if (e.cat === cat && e.pos.distanceTo(player.pos) < range) local++;
    for (let i = 0; i < C.tries && local < cap; i++) local += tryCategory(cat, C.ring);
  }
}
export function updateSpawning(dt) { updateArrivals(dt); naturalSpawning(dt); }
