// Block inventory: mined blocks are collected here and spent when you build. Synced to the server.
import { G } from './state.js';
import { api } from './api.js';
import { BL } from './blocks.js';
import { openPanel } from './ui.js';

const $ = id => document.getElementById(id);
let slot = 0, hotbar = Array(10).fill(0), syncT = null;
const css = c => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
export const inventory = () => G.profile.blocks;
const count = id => inventory()[id] || 0;
const storeKey = () => `isekai-hotbar-${G.world.seed}`;

function load() {
  try { const h = JSON.parse(localStorage.getItem(storeKey())); if (Array.isArray(h) && h.length === 10) hotbar = h; } catch { /* no storage */ }
  for (const id of Object.keys(inventory()).map(Number)) if (count(id) > 0 && !hotbar.includes(id)) place(id);
}
function persist() { try { localStorage.setItem(storeKey(), JSON.stringify(hotbar)); } catch { /* no storage */ } }
function place(id) { const i = hotbar.indexOf(0); if (i >= 0) { hotbar[i] = id; persist(); } }
function sync() { clearTimeout(syncT); syncT = setTimeout(() => api.blocks(inventory()).catch(() => {}), 1500); }

export function renderHotbar() {
  if (!G.profile) return;
  if (!renderHotbar.loaded) { renderHotbar.loaded = true; load(); }
  $('hotbar').innerHTML = hotbar.map((id, i) => `<div class="${i === slot ? 'sel' : ''} ${id && !count(id) ? 'empty' : ''}"><i>${(i + 1) % 10}</i>`
    + (id ? `<span style="background:${css(BL[id].top)}"></span><b>${count(id)}</b>` : '') + '</div>').join('');
  $('blockname').textContent = hotbar[slot] ? `${BL[hotbar[slot]].name} ×${count(hotbar[slot])}` : 'Empty hand';
}
export const hotbarId = () => (hotbar[slot] && count(hotbar[slot]) > 0 ? hotbar[slot] : 0);
export function selectSlot(n) { slot = n; renderHotbar(); }
export function cycleSlot(d) { slot = (slot + d + 10) % 10; renderHotbar(); }
export function addBlock(id, n = 1) {
  const inv = inventory();
  inv[id] = (inv[id] || 0) + n;
  if (!hotbar.includes(id)) place(id);
  renderHotbar(); sync();
}
export function takeBlock(id) {
  const inv = inventory();
  if (!inv[id]) return false;
  inv[id]--;
  renderHotbar(); sync();
  return true;
}
export function openInventory() {
  openPanel('inventory');
  $('paneltitle').textContent = '🎒 Inventory';
  $('panelline').textContent = 'Click a block to put it in the selected hotbar slot. Mine blocks by holding left click.';
  const items = Object.entries(inventory()).filter(([, n]) => n > 0);
  $('panelbody').innerHTML = items.length ? '<div class="invgrid">' + items.map(([id, n]) =>
    `<button class="inv" data-block="${id}"><span style="background:${css(BL[id].top)}"></span>${BL[id].name}<b>${n}</b></button>`).join('') + '</div>' : '<p>Your bag is empty.</p>';
}
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-block]'); if (!b) return;
  const id = Number(b.dataset.block), old = hotbar.indexOf(id);
  if (old >= 0) hotbar[old] = 0;
  hotbar[slot] = id; persist(); renderHotbar();
});
