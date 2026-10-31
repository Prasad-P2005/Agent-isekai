// Aiming at blocks, mining them (hold left mouse) and building (right mouse, uses your inventory).
import { ITEMS } from '../core/content.js';
import { G, creative } from '../core/state.js';
import { emit, toast } from '../core/events.js';
import { AIR, BL, ID, WATER, dropOf, hardness, pickable } from './blocks.js';
import { getBlock, setBlock } from './chunks.js';
import { addBlock, addItem, heldBlock, heldDef, spendHeld, wearHeld } from './inventory.js';
import { onBreakBlock } from './people.js';
import { eye, lookDir, player, raycast } from './player.js';
import { emptyStation, stationAt } from './stations.js';
import { SEA } from './terrain.js';

const WRONG_TIER = 3.3, HAMMER_SLOW = 1.5, HAMMER_PLANES = [[[0, 1, 0], [0, 0, 1]], [[1, 0, 0], [0, 0, 1]], [[1, 0, 0], [0, 1, 0]]]; // Minecraft's 5 over 1.5
const REACH = 7, FREE_BREAK_GAP = 0.18; // creative mode: a click breaks at once, and a held button goes on at this pace
export const aim = { block: null };
export const miningBar = { shown: false, progress: 0, text: '' };
let mining = null, breakGap = 0;

export function updateAim() { aim.block = raycast(eye(), lookDir(), REACH, pickable); }
export function stopAiming() { aim.block = null; mining = null; miningBar.shown = false; breakGap = 0; }

// The right tool divides the time by its speed. A block above the tool's level takes far longer and gives nothing.
const canHarvest = (b, tool) => b.level == null || (tool?.tool === 'pick' && tool.level >= b.level);
function timeToBreak(id, tool) {
  const b = BL[id], right = tool && tool.tool && tool.tool === b.tool;
  return hardness(id) / (right ? tool.speed : 1) * (canHarvest(b, tool) ? 1 : WRONG_TIER) * (tool?.area ? HAMMER_SLOW : 1);
}
function giveDrops(id, tool) {
  const b = BL[id], cut = tool?.tool === 'shears' && (b.tool === 'hoe' || b.shape === 'cross');
  let full = false;
  if (cut) full = !!addBlock(id);
  else if (b.yield) full = !!addItem(b.yield);
  else { const drop = dropOf(id); if (drop) full = !!addBlock(drop); }
  if (!cut) for (const [item, chance] of b.loot ?? []) if (Math.random() < chance) full = !!addItem(item) || full;
  if (full) toast('Your bag is full.', 2);
}
function breakOne(x, y, z, id) {
  const nearWater = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => getBlock(x + a, y + b, z + c) === WATER);
  setBlock(x, y, z, nearWater && y <= SEA ? WATER : AIR);
  if (BL[getBlock(x, y + 1, z)].rooted) setBlock(x, y + 1, z, AIR); // whatever grew on it goes with it
  emit('block:broken', { x, y, z, id });
  const tool = heldDef();
  if (!creative() && canHarvest(BL[id], tool)) giveDrops(id, tool);
  onBreakBlock(x, z, id);
}
// A hammer takes the eight around the block as well, across the face it struck, if it could have taken them on their own.
function hammerAround(x, y, z, n, tool) {
  const [u, v] = HAMMER_PLANES[n[0] ? 0 : n[1] ? 1 : 2];
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
    if (!a && !b) continue;
    const px = x + u[0] * a + v[0] * b, py = y + u[1] * a + v[1] * b, pz = z + u[2] * a + v[2] * b, id = getBlock(px, py, pz);
    if (id !== AIR && id !== WATER && BL[id].tool === 'pick' && canHarvest(BL[id], tool) && isFinite(hardness(id))) breakOne(px, py, pz, id);
  }
}
export function updateMining(dt) {
  const t = aim.block;
  breakGap = G.mouseDown ? breakGap - dt : 0;
  if (!G.mouseDown || !t) { mining = null; miningBar.shown = false; return; }
  const id = getBlock(t.x, t.y, t.z);
  if (!mining || mining.x !== t.x || mining.y !== t.y || mining.z !== t.z) mining = { x: t.x, y: t.y, z: t.z, t: 0 };
  const tool = heldDef(), need = timeToBreak(id, tool);
  miningBar.shown = true;
  if (!isFinite(need)) { miningBar.progress = 0; miningBar.text = `${BL[id].name} cannot be broken`; return; }
  if (creative()) {
    miningBar.shown = false;
    if (breakGap > 0) return;
    breakGap = FREE_BREAK_GAP;
  } else {
    mining.t += dt;
    miningBar.progress = Math.min(1, mining.t / need); miningBar.text = BL[id].name;
    if (mining.t < need) return;
  }
  const { x, y, z } = mining;
  if (BL[id].station && !emptyStation(x, y, z)) { mining = null; return; }
  breakOne(x, y, z, id);
  if (tool?.area && !creative()) hammerAround(x, y, z, t.n, tool);
  if (tool?.dur && need > 0.05) wearHeld(tool.tool && tool.tool !== 'blade' ? 1 : 2); // a blade is no pickaxe
  mining = null;
}
export function placeBlock() {
  const t = aim.block;
  if (!t) return;
  const it = heldDef(), facing = it?.place && it.place.length === 4 ? it.place[((Math.round(player.yaw / (Math.PI / 2)) % 4) + 4) % 4] : 0, id = facing || heldBlock();
  if (!id) return toast(creative() ? 'Nothing in hand. Pick a block from your bag (I).' : 'Nothing to place. Mine some blocks first (hold left click).', 2);
  const inPlace = BL[getBlock(t.x, t.y, t.z)].passable; // a tuft of grass gives way, as water does
  const x = inPlace ? t.x : t.x + t.n[0], y = inPlace ? t.y : t.y + t.n[1], z = inPlace ? t.z : t.z + t.n[2], p = player.pos, there = getBlock(x, y, z);
  const overlap = x + 1 > p.x - 0.3 && x < p.x + 0.3 && z + 1 > p.z - 0.3 && z < p.z + 0.3 && y + 1 > p.y && y < p.y + 1.8;
  if (!overlap && (there === AIR || there === WATER || BL[there].passable) && (id !== ID.Wheat || getBlock(x, y - 1, z) === ID.Farmland) && spendHeld()) { setBlock(x, y, z, id); if (BL[id].station === 'chest') stationAt(x, y, z, 'chest', true); emit('player:placed'); }
}
