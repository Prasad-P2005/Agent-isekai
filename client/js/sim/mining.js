// Aiming at blocks, mining them (hold left mouse) and building (right mouse, uses your inventory).
import { G } from '../core/state.js';
import { emit, toast } from '../core/events.js';
import { AIR, BL, WATER, dropOf, hardness, pickable } from './blocks.js';
import { getBlock, setBlock } from './chunks.js';
import { addBlock, heldBlock, takeBlock } from './inventory.js';
import { onBreakBlock } from './people.js';
import { eye, lookDir, player, raycast } from './player.js';
import { SEA } from './terrain.js';

const REACH = 7;
export const aim = { block: null };
export const miningBar = { shown: false, progress: 0, text: '' };
let mining = null;

export function updateAim() { aim.block = raycast(eye(), lookDir(), REACH, pickable); }
export function stopAiming() { aim.block = null; mining = null; miningBar.shown = false; }

export function updateMining(dt) {
  const t = aim.block;
  if (!G.mouseDown || !t) { mining = null; miningBar.shown = false; return; }
  const id = getBlock(t.x, t.y, t.z);
  if (!mining || mining.x !== t.x || mining.y !== t.y || mining.z !== t.z) mining = { x: t.x, y: t.y, z: t.z, t: 0 };
  const need = hardness(id) / (G.profile?.tool || 1);
  miningBar.shown = true;
  if (!isFinite(need)) { miningBar.progress = 0; miningBar.text = `${BL[id].name} cannot be broken`; return; }
  mining.t += dt;
  miningBar.progress = Math.min(1, mining.t / need); miningBar.text = BL[id].name;
  if (mining.t < need) return;
  const { x, y, z } = mining;
  const nearWater = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]].some(([a, b, c]) => getBlock(x + a, y + b, z + c) === WATER);
  setBlock(x, y, z, nearWater && y <= SEA ? WATER : AIR);
  if (BL[getBlock(x, y + 1, z)].rooted) setBlock(x, y + 1, z, AIR); // whatever grew on it goes with it
  emit('block:broken', { x, y, z, id });
  const drop = dropOf(id);
  if (drop) addBlock(drop);
  onBreakBlock(x, z, id);
  mining = null;
}
export function placeBlock() {
  const t = aim.block;
  if (!t) return;
  const id = heldBlock();
  if (!id) return toast('Nothing to place. Mine some blocks first (hold left click).', 2);
  const inPlace = BL[getBlock(t.x, t.y, t.z)].passable; // a tuft of grass gives way, as water does
  const x = inPlace ? t.x : t.x + t.n[0], y = inPlace ? t.y : t.y + t.n[1], z = inPlace ? t.z : t.z + t.n[2], p = player.pos, there = getBlock(x, y, z);
  const overlap = x + 1 > p.x - 0.3 && x < p.x + 0.3 && z + 1 > p.z - 0.3 && z < p.z + 0.3 && y + 1 > p.y && y < p.y + 1.8;
  if (!overlap && (there === AIR || there === WATER || BL[there].passable) && takeBlock(id)) { setBlock(x, y, z, id); emit('player:placed'); }
}
