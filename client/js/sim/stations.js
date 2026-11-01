// Furnaces, forges and chests: blocks that hold things. They are kept by position and saved with the bag, and a furnace goes on burning out of sight.
import { ITEMS, RECIPES } from '../core/content.js';
import { emit } from '../core/events.js';
import { rule } from '../core/rules.js';
import { BL, ID } from './blocks.js';
import { getBlock, setBlock } from './chunks.js';
import { popOut } from './drops.js';
import { hash3 } from './noise.js';

const { Furnace, LitFurnace, Forge, LitForge } = ID;
const PARTS = { furnace: { inputs: [0], fuel: 1, out: 2, size: 3, dark: Furnace, lit: LitFurnace }, forge: { inputs: [0, 1], fuel: 2, out: 3, size: 4, dark: Forge, lit: LitForge }, chest: { size: 27 } };
export const stationParts = kind => PARTS[kind];
const SMELTING = RECIPES.filter(r => r.in);
export const stations = new Map();
const blank = kind => ({ kind, slots: Array(PARTS[kind].size).fill(null), burn: 0, burnt: 0, cook: 0 });
// What the builders of the Old Ways left behind. A chest with no record was never touched, so it fills once, the first time it is opened, from its own spot.
const LOOT = [['torch', 12, 6], ['rope_ladder', 8, 3], ['bread', 4, 2], ['arrow', 12, 6], ['potion', 2, 1], ['raw_iron', 5, 2], ['coal', 8, 3], ['raw_silver', 3, 1], ['raw_gold', 3, 1], ['mana', 2, 1], ['ruby', 1, 1], ['raw_mithril', 2, 1]];
const roll = (x, y, z, k) => hash3(x + k * 13, y, z - k * 7);
function stock(s, x, y, z) {
  const kinds = 3 + Math.floor(roll(x, y, z, 1) * 4);
  for (let i = 0; i < kinds; i++) {
    const [id, most, least] = LOOT[Math.floor(roll(x, y, z, i + 2) * LOOT.length)], at = Math.floor(roll(x, y, z, i + 20) * s.slots.length);
    if (!s.slots[at]) s.slots[at] = { id, n: least + Math.floor(roll(x, y, z, i + 40) * (most - least + 1)) };
  }
  return s;
}

export function loadStations(saved = {}) { stations.clear(); for (const [k, s] of Object.entries(saved)) stations.set(k, s); }
export const stationReport = () => Object.fromEntries(stations);
export function stationAt(x, y, z, kind, placed = false) {
  const k = `${x},${y},${z}`;
  if (!stations.has(k)) stations.set(k, kind === 'chest' && !placed ? stock(blank(kind), x, y, z) : blank(kind));
  return stations.get(k);
}
// Breaking one spills what it held onto the ground, and a chest nobody ever opened still holds what it was left with.
export function emptyStation(x, y, z, kind) {
  const k = `${x},${y},${z}`, s = kind === 'chest' ? stationAt(x, y, z, kind) : stations.get(k);
  if (!s) return;
  for (const i of s.slots) if (i) popOut(i.id, i.n, x + 0.5, y + 0.5, z + 0.5, i.dur);
  stations.delete(k);
}
function recipeFor(s) {
  const { inputs } = PARTS[s.kind], have = inputs.map(i => s.slots[i]?.id).filter(Boolean).sort();
  if (!have.length) return null;
  return SMELTING.find(r => (r.at === s.kind || s.kind === 'forge') && r.in.length === have.length && [...r.in].sort().every((id, i) => id === have[i])) ?? null;
}
function outputFits(s, r) { const out = s.slots[PARTS[s.kind].out]; return !out || (out.id === r.out && out.n + r.n <= ITEMS[r.out].stack); }
function tick(k, s, dt) {
  const parts = PARTS[s.kind], r = recipeFor(s), ready = r && outputFits(s, r), fuel = s.slots[parts.fuel], wasLit = s.burn > 0;
  if (s.burn > 0) s.burn = Math.max(0, s.burn - dt);
  if (ready && s.burn <= 0 && fuel && ITEMS[fuel.id].fuel) {
    s.burn = s.burnt = ITEMS[fuel.id].fuel;
    if (--fuel.n <= 0) s.slots[parts.fuel] = null;
    emit('blocks:changed');
  }
  if (ready && s.burn > 0) {
    s.cook += dt * rule('smelt');
    if (s.cook >= r.time) {
      s.cook = 0;
      for (const i of parts.inputs) { const stack = s.slots[i]; if (stack && --stack.n <= 0) s.slots[i] = null; }
      const out = s.slots[parts.out];
      if (out) out.n += r.n; else s.slots[parts.out] = { id: r.out, n: r.n };
      emit('blocks:changed');
    }
    emit('station:changed', k);
  } else if (s.cook > 0) { s.cook = Math.max(0, s.cook - dt * 2); emit('station:changed', k); }
  if (wasLit !== s.burn > 0) { // the block itself shows it, and lights the room
    const [x, y, z] = k.split(',').map(Number), now = getBlock(x, y, z);
    if (now === parts.dark || now === parts.lit) setBlock(x, y, z, s.burn > 0 ? parts.lit : parts.dark);
  }
}
export function updateStations(dt) { for (const [k, s] of stations) if (PARTS[s.kind]?.inputs) tick(k, s, dt); }
export const stationKind = id => BL[id]?.station ?? null;
