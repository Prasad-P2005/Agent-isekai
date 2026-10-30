// The block inventory and hotbar. Mined blocks are collected here and spent when you build.
import { G } from '../core/state.js';
import { emit } from '../core/events.js';

export const hotbar = { slot: 0, ids: Array(10).fill(0) };
const stock = () => G.profile.blocks;
export const count = id => stock()[id] || 0;
function place(id) { const i = hotbar.ids.indexOf(0); if (i >= 0) hotbar.ids[i] = id; }

export function setHotbar(saved) {
  if (Array.isArray(saved) && saved.length === 10) hotbar.ids = saved;
  for (const id of Object.keys(stock()).map(Number)) if (count(id) > 0 && !hotbar.ids.includes(id)) place(id);
  emit('hotbar:changed');
}
export const heldBlock = () => (hotbar.ids[hotbar.slot] && count(hotbar.ids[hotbar.slot]) > 0 ? hotbar.ids[hotbar.slot] : 0);
export function selectSlot(n) { hotbar.slot = n; emit('hotbar:changed'); }
export function cycleSlot(d) { selectSlot((hotbar.slot + d + 10) % 10); }
export function assignToSlot(id) {
  const old = hotbar.ids.indexOf(id);
  if (old >= 0) hotbar.ids[old] = 0;
  hotbar.ids[hotbar.slot] = id;
  emit('hotbar:changed');
}
export function addBlock(id, n = 1) {
  stock()[id] = count(id) + n;
  if (!hotbar.ids.includes(id)) place(id);
  emit('hotbar:changed'); emit('blocks:changed');
}
export function takeBlock(id) {
  if (!count(id)) return false;
  stock()[id]--;
  emit('hotbar:changed'); emit('blocks:changed');
  return true;
}
