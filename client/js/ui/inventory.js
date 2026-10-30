// The hotbar and the inventory panel. The hotbar's layout is a per-browser convenience, so it lives in localStorage.
import { G } from '../core/state.js';
import { on } from '../core/events.js';
import { BL } from '../sim/blocks.js';
import { assignToSlot, count, hotbar, setHotbar } from '../sim/inventory.js';
import { openPanel } from './panels.js';

const $ = id => document.getElementById(id);
const css = c => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
const storeKey = () => `isekai-hotbar-${G.world.seed}`;

export function loadHotbar() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(storeKey())); } catch { /* no storage */ }
  setHotbar(saved);
}
function persist() { try { localStorage.setItem(storeKey(), JSON.stringify(hotbar.ids)); } catch { /* no storage */ } }

on('hotbar:changed', () => {
  persist();
  $('hotbar').innerHTML = hotbar.ids.map((id, i) => `<div class="${i === hotbar.slot ? 'sel' : ''} ${id && !count(id) ? 'empty' : ''}"><i>${(i + 1) % 10}</i>`
    + (id ? `<span style="background:${css(BL[id].top)}"></span><b>${count(id)}</b>` : '') + '</div>').join('');
  const held = hotbar.ids[hotbar.slot];
  $('blockname').textContent = held ? `${BL[held].name} ×${count(held)}` : 'Empty hand';
});

export function openInventory() {
  openPanel('inventory');
  $('paneltitle').textContent = '🎒 Inventory';
  $('panelline').textContent = 'Click a block to put it in the selected hotbar slot. Mine blocks by holding left click.';
  const items = Object.entries(G.profile.blocks).filter(([, n]) => n > 0);
  $('panelbody').innerHTML = items.length ? '<div class="invgrid">' + items.map(([id, n]) =>
    `<button class="inv" data-block="${id}"><span style="background:${css(BL[id].top)}"></span>${BL[id].name}<b>${n}</b></button>`).join('') + '</div>' : '<p>Your bag is empty.</p>';
}
document.addEventListener('click', e => {
  const b = e.target.closest('button[data-block]');
  if (b) assignToSlot(Number(b.dataset.block));
});
