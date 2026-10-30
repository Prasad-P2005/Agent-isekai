// The hotbar and the bag. The hotbar's layout is a per-browser convenience, so it lives in localStorage.
import { G } from '../core/state.js';
import { GUILD } from '../core/content.js';
import { on } from '../core/events.js';
import { BL } from '../sim/blocks.js';
import { assignToSlot, count, hotbar, selectSlot, setHotbar } from '../sim/inventory.js';
import { maxHp, maxMana, player } from '../sim/player.js';
import { hidePortrait, showPortrait } from '../view/portrait.js';
import { blockIcon, esc, icon } from './art.js';
import { definePage } from './panels.js';

const $ = id => document.getElementById(id);
const storeKey = () => `isekai-hotbar-${G.world.seed}`;
const BAG_ROWS = 8, BAG_COLUMNS = 10;
const HINT = 'Click a block to put it in the chosen slot, or point at it and press 1 to 0.';
let bagOpen = false, pointedBlock = 0;

export function loadHotbar() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(storeKey())); } catch { /* no storage */ }
  setHotbar(saved);
}
function persist() { try { localStorage.setItem(storeKey(), JSON.stringify(hotbar.ids)); } catch { /* no storage */ } }

const stack = id => `<img src="${blockIcon(id)}" alt=""><b>${count(id)}</b>`;
const hotClass = (id, i) => `slot${i === hotbar.slot ? ' sel' : ''}${id && !count(id) ? ' empty' : ''}`;

on('hotbar:changed', () => {
  persist();
  $('hotbar').innerHTML = hotbar.ids.map((id, i) => `<div class="${hotClass(id, i)}"><i class="num">${(i + 1) % 10}</i>${id ? stack(id) : ''}</div>`).join('');
  const held = hotbar.ids[hotbar.slot];
  $('blockname').textContent = held ? `${BL[held].name} ×${count(held)}` : 'Empty hand';
  if (bagOpen) renderBag();
});

// ---------- the bag ----------
const gearSlot = (art, name, cls = '') => `<span class="slot ${cls}" tabindex="0" data-name="${esc(name)}">${art}</span>`;
function gearHTML() {
  const P = G.profile;
  return gearSlot(icon('sword'), `Weapon: ${P.weapon_name}`) + gearSlot(icon('shield'), `Armor: ${P.armor_name}`) + gearSlot(icon('pick'), `Tool: ${P.tool_name}`)
    + gearSlot(GUILD.ranks[P.guild_rank], `Guild rank ${GUILD.ranks[P.guild_rank]}`, 'rank')
    + gearSlot(`${icon('potion')}<b>${P.potions}</b>`, 'Health potions. Press G to drink one')
    + gearSlot(`${icon('manapotion')}<b>${P.mana_potions}</b>`, 'Mana potions. Press V to drink one');
}
function statsHTML() {
  const P = G.profile, stat = (label, value) => `<div><span>${label}</span><span>${value}</span></div>`;
  return stat(`${icon('coin')}${esc(G.world.currency)}`, P.gold) + stat('Health', `${Math.ceil(player.hp)}/${maxHp()}`) + stat('Mana', `${Math.floor(player.mana)}/${maxMana()}`)
    + stat('Kills', P.kills) + stat('Deaths', P.deaths) + stat('Bounty', P.bounty);
}
function itemsHTML() {
  const P = G.profile;
  const blocks = Object.entries(P.blocks).filter(([, n]) => n > 0).map(([id, n]) => `<button class="slot" data-block="${id}" data-name="${esc(`${BL[id].name} ×${n}`)}" aria-label="${esc(BL[id].name)}">${stack(id)}</button>`);
  const loot = Object.entries(P.loot).filter(([, n]) => n > 0).map(([name, n]) => `<span class="slot" tabindex="0" data-name="${esc(`${name} ×${n}. Sell it at a market`)}">${icon('loot')}<b>${n}</b></span>`);
  const items = [...blocks, ...loot];
  const room = Math.max(BAG_ROWS, Math.ceil(items.length / BAG_COLUMNS)) * BAG_COLUMNS;
  return items.join('') + '<span class="slot"></span>'.repeat(room - items.length);
}
function renderBag() {
  $('gear').innerHTML = gearHTML();
  $('bagstats').innerHTML = statsHTML();
  $('bagitems').innerHTML = itemsHTML();
  $('baghot').innerHTML = hotbar.ids.map((id, i) => `<button class="${hotClass(id, i)}" data-hot="${i}" aria-label="Hotbar slot ${(i + 1) % 10}"${id ? ` data-name="${esc(BL[id].name)}"` : ''}><i class="num">${(i + 1) % 10}</i>${id ? stack(id) : ''}</button>`).join('');
}
definePage('bag', {
  tab: 'bag',
  view: 'bag',
  render() {
    bagOpen = true;
    $('bagname').textContent = HINT;
    renderBag();
    showPortrait($('herocanvas'));
  },
  leave() { bagOpen = false; hidePortrait(); },
});
function describe(e) {
  const item = e.target.closest('[data-name]');
  pointedBlock = Number(item?.dataset.block) || 0;
  $('bagname').textContent = item?.dataset.name ?? HINT;
}
$('bag').addEventListener('mouseover', describe);
$('bag').addEventListener('focusin', describe);
addEventListener('keydown', e => {
  if (!bagOpen || !pointedBlock || !/^Digit\d$/.test(e.code)) return;
  selectSlot((Number(e.code[5]) + 9) % 10);
  assignToSlot(pointedBlock);
});
$('bag').addEventListener('click', e => {
  const block = e.target.closest('[data-block]'), slot = e.target.closest('[data-hot]');
  if (block) assignToSlot(Number(block.dataset.block));
  if (slot) selectSlot(Number(slot.dataset.hot));
});
