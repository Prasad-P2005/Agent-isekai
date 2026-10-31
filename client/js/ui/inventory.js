// The hotbar and the bag: one compact slate panel in the middle of the screen, with the recipe book and the spells against its right edge.
// The mouse works as Minecraft's does: click picks up and puts down, right click splits or drops one, shift-click sends a stack across, a double click
// gathers, dragging a held stack spreads it, and keys 1 to 9 swap the slot under the mouse with the hotbar. A station swaps the crafting corner for its own panel.
import { G, creative } from '../core/state.js';
import { ITEMS } from '../core/content.js';
import { emit, on, toast } from '../core/events.js';
import { castable } from '../sim/abilities.js';
import { GRIDS, craftFromBag, isKnown, layOnGrid, matchGrid, needs, recipesAt, timesCanMake, useGrid } from '../sim/crafting.js';
import { BAG_SIZE, HOTBAR, addItem, armourPoints, bag, changed, countItem, hasRoom, heldStack, hotbar, selectSlot, sortBag, worn } from '../sim/inventory.js';
import { maxHp, player } from '../sim/player.js';
import { stationAt, stationParts } from '../sim/stations.js';
import { hidePortrait, showPortrait } from '../view/portrait.js';
import { esc, icon, itemIcon, power } from './art.js';
import { definePage, openPage } from './panels.js';

const $ = id => document.getElementById(id);
const GROUPS = [['all', 'All', 'star'], ['tools', 'Tools', 'pick'], ['weapons', 'Arms', 'sword'], ['armor', 'Armour', 'plate'], ['blocks', 'Blocks', 'house'], ['materials', 'Goods', 'loot'], ['food', 'Food', 'heal'], ['potions', 'Potions', 'potion']];
const STATION_NAMES = { hand: 'by hand', table: 'at a Crafting Table', anvil: 'at an Anvil', alchemy: 'at an Alchemy Table', furnace: 'in a Furnace', forge: 'at a Forge' };
const SLOT_NAMES = { head: 'Head', body: 'Body', legs: 'Legs', feet: 'Feet', off: 'Off hand' };
const NAME_SECONDS = 2000, DOUBLE_CLICK = 280;
let open = false, station = null, gridKind = 'hand', grid = Array(4).fill(null), cursor = null, side = 'recipes', group = 'all', search = '', onlyReady = false, picked = null, spread = null, lastDown = null, hover = null, nameTimer = 0;

// The switch on the pause card. The mode is saved with the hero, so it changes when the server answers.
function showMode() { $('creative').textContent = `Creative mode: ${creative() ? 'on' : 'off'}`; }
on('creative:changed', showMode);
$('creative').addEventListener('click', () => emit('creative:asked', !creative()));
export function showCreativeMode() { showMode(); }

// ---------- a stack, drawn ----------
function durBar(s) {
  const most = ITEMS[s.id]?.dur;
  if (!most || !s.dur || s.dur >= most) return '';
  const share = s.dur / most;
  return `<i class="dur"><i class="${share < 0.25 ? 'low' : ''}" style="width:${Math.round(share * 100)}%"></i></i>`;
}
const stackHTML = s => (s ? `<img src="${itemIcon(s.id)}" alt="">${s.n > 1 ? `<b>${s.n}</b>` : ''}${durBar(s)}` : '');
const slotHTML = (c, i, s, cls = '', extra = '') => `<button type="button" class="slot ${cls}" data-c="${c}" data-i="${i}"${extra}>${stackHTML(s)}</button>`;

// ---------- the hotbar ----------
function hotbarStack(i) { return creative() ? (hotbar.creative[i] ? { id: hotbar.creative[i], n: 1 } : null) : bag()[i]; }
function drawHotbar() {
  $('hotbar').innerHTML = Array.from({ length: HOTBAR }, (_, i) => { const s = hotbarStack(i); return `<div class="slot${i === hotbar.slot ? ' sel' : ''}"><i class="num">${i + 1}</i>${stackHTML(s)}</div>`; }).join('');
}
let lastHeld = null;
function showHeldName() {
  const s = heldStack(), id = s?.id ?? null;
  if (id === lastHeld) return;
  lastHeld = id;
  $('blockname').textContent = s ? ITEMS[s.id].name : '';
  $('blockname').classList.add('on');
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => $('blockname').classList.remove('on'), NAME_SECONDS);
}
on('hotbar:changed', () => { drawHotbar(); showHeldName(); if (open && !spread) drawBag(); });
on('blocks:changed', () => { if (open && !spread) drawWork(); });

// ---------- where things can sit ----------
const fitsWorn = (slot, s) => { const it = ITEMS[s.id]; return slot === 'off' ? it.slot === 'off' || s.id === 'torch' || s.id === 'lantern' : it.slot === slot; };
function fitsStore(i, s) { const parts = stationParts(station.kind); return i !== parts.out && (i !== parts.fuel || !!ITEMS[s.id].fuel); }
const BOXES = {
  bag: { get: i => bag()[i], set: (i, s) => { bag()[i] = s; } },
  worn: { get: i => worn()[i], set: (i, s) => { worn()[i] = s; }, takes: fitsWorn },
  grid: { get: i => grid[i], set: (i, s) => { grid[i] = s; } },
  store: { get: i => station.data.slots[i], set: (i, s) => { station.data.slots[i] = s; }, takes: fitsStore },
};
const stackable = s => !ITEMS[s.id].dur;
function merge(into, from) { const room = Math.min(from.n, ITEMS[into.id].stack - into.n); into.n += room; from.n -= room; return from.n; }

// One press of a button on a slot.
function press(c, i, right) {
  const box = BOXES[c], s = box.get(i);
  if (cursor && box.takes && !box.takes(i, cursor)) return;
  if (right) {
    if (!cursor && s) { const half = Math.ceil(s.n / 2); cursor = { ...s, n: half }; s.n -= half; if (!s.n) box.set(i, null); }
    else if (cursor && (!s || (s.id === cursor.id && stackable(s) && s.n < ITEMS[s.id].stack))) { if (s) s.n++; else box.set(i, { ...cursor, n: 1 }); if (--cursor.n <= 0) cursor = null; }
    return;
  }
  if (!cursor) { if (s) { cursor = s; box.set(i, null); } return; }
  if (!s) { box.set(i, cursor); cursor = null; return; }
  if (s.id === cursor.id && stackable(s)) { if (!merge(s, cursor)) cursor = null; return; }
  box.set(i, cursor); cursor = s;
}
// Shift-click: armour goes on, a station takes what it can use, and otherwise a stack crosses between the hotbar and the bag.
function fillRange(s, from, to) {
  if (stackable(s)) for (let i = from; i < to && s.n; i++) { const t = bag()[i]; if (t?.id === s.id) merge(t, s); }
  for (let i = from; i < to && s.n; i++) if (!bag()[i]) { bag()[i] = { ...s }; s.n = 0; }
  return s.n;
}
function intoStation(s) {
  const parts = stationParts(station.kind), { slots } = station.data, order = parts.inputs ? (ITEMS[s.id].fuel && !parts.inputs.some(i => !slots[i]) ? [parts.fuel] : [...parts.inputs, parts.fuel]) : slots.map((_, i) => i);
  for (const i of order) {
    if (!fitsStore(i, s) || !s.n) continue;
    if (slots[i]?.id === s.id && stackable(s)) merge(slots[i], s);
    else if (!slots[i]) { slots[i] = { ...s }; s.n = 0; }
  }
}
function quick(c, i) {
  const box = BOXES[c], s = box.get(i);
  if (!s) return;
  if (c !== 'bag') { const left = addItem(s.id, s.n, s.dur); if (left) s.n = left; else box.set(i, null); return; }
  const it = ITEMS[s.id];
  if (station?.data) { intoStation(s); if (!s.n) box.set(i, null); return; }
  if (it.slot && !worn()[it.slot]) { worn()[it.slot] = s; box.set(i, null); return; }
  const [from, to] = i < HOTBAR ? [HOTBAR, BAG_SIZE] : [0, HOTBAR], copy = { ...s };
  box.set(i, null);
  const left = fillRange(copy, from, to);
  if (left) box.set(i, { ...copy, n: left });
}
function gather(id) {
  if (!cursor || !stackable(cursor)) return;
  for (let i = 0; i < BAG_SIZE; i++) { const s = bag()[i]; if (s?.id === id && !merge(cursor, s)) continue; if (s?.id === id && !s.n) bag()[i] = null; }
  for (let i = 0; i < BAG_SIZE; i++) if (bag()[i] && !bag()[i].n) bag()[i] = null;
}

// ---------- what the grid makes ----------
const result = () => (gridKind ? matchGrid(grid, gridKind) : null);
function takeResult(shift) {
  for (let r = result(); r; r = result()) {
    const out = { id: r.out, n: r.n, ...(ITEMS[r.out].dur ? { dur: r.dur ?? ITEMS[r.out].dur } : {}) };
    if (shift) { if (!hasRoom(out.id, out.n)) return; addItem(out.id, out.n, out.dur); } else if (!cursor) cursor = out;
    else if (cursor.id === out.id && stackable(out) && cursor.n + out.n <= ITEMS[out.id].stack) cursor.n += out.n;
    else return;
    useGrid(grid);
    if (!shift) return;
  }
}
function clearWorkbench() {
  for (let i = 0; i < grid.length; i++) if (grid[i]) { addItem(grid[i].id, grid[i].n, grid[i].dur); grid[i] = null; }
  if (cursor) { addItem(cursor.id, cursor.n, cursor.dur); cursor = null; }
}

// ---------- the panel ----------
const gridHTML = (size) => `<div class="craftgrid" style="--cols:${size}">${grid.map((s, i) => slotHTML('grid', i, s)).join('')}</div>`;
const resultHTML = () => { const r = result(); return slotHTML('out', 0, r ? { id: r.out, n: r.n, dur: r.dur } : null, 'result'); };
const ARROW = '<i class="craftarrow"></i>';
function furnaceHTML() {
  const parts = stationParts(station.kind), { slots, burn, burnt, cook } = station.data;
  return `<div class="furnace"><div class="furnace-in"><div class="dockset">${parts.inputs.map(i => slotHTML('store', i, slots[i])).join('')}</div><i class="flame"><i id="burnbar" style="height:${burnt ? Math.round(100 * burn / burnt) : 0}%"></i></i>${slotHTML('store', parts.fuel, slots[parts.fuel])}</div>`
    + `<i class="craftarrow"><i id="cookbar" style="width:${Math.min(100, Math.round(cook * 10))}%"></i></i>${slotHTML('store', parts.out, slots[parts.out], 'result')}</div>`;
}
function workHTML() {
  if (station?.kind === 'chest') return `<div class="chestgrid">${station.data.slots.map((s, i) => slotHTML('store', i, s)).join('')}</div>`;
  if (station?.data) return furnaceHTML();
  return `<div class="crafting">${gridHTML(GRIDS[gridKind].size)}${ARROW}${resultHTML()}</div>`;
}
const SPELL_KEYS = ['Q', 'R'];
function spellsHTML() {
  return `<div class="spellpair">${[0, 1].map(i => { const id = G.profile.spells?.[i], p = id ? power(id) : null; return `<div class="slot" data-spelled="${i}"><i class="num">${SPELL_KEYS[i]}</i>${p ? icon(p.icon) : ''}</div>`; }).join('')}</div>`;
}
function drawWork() {
  $('bagwork').innerHTML = workHTML();
  $('bagwork').classList.toggle('chest', station?.kind === 'chest');
  $('bagspells').innerHTML = spellsHTML();
  $('bagline').innerHTML = `${icon('coin')}${G.profile.gold} ${icon('heart')}${Math.ceil(player.hp)}/${maxHp()} ${icon('shield')}${armourPoints()}`;
}
function drawGrid() {
  $('gear').innerHTML = ['head', 'body', 'legs', 'feet'].map(slot => slotHTML('worn', slot, worn()[slot], 'gearslot', ` data-slotname="${SLOT_NAMES[slot]}"`)).join('');
  $('bagoff').innerHTML = slotHTML('worn', 'off', worn().off, 'gearslot', ` data-slotname="${SLOT_NAMES.off}"`);
  $('bagitems').innerHTML = bag().slice(HOTBAR).map((s, i) => slotHTML('bag', i + HOTBAR, s)).join('');
  $('baghot').innerHTML = Array.from({ length: HOTBAR }, (_, i) => slotHTML(creative() ? 'cbar' : 'bag', i, hotbarStack(i), i === hotbar.slot ? 'sel' : '')).join('');
}
function drawCursor() {
  const c = $('cursorstack');
  c.innerHTML = cursor ? `<span class="slotlike">${stackHTML(cursor)}</span>` : '';
}
function drawBag() { drawGrid(); drawWork(); drawCursor(); drawSide(); }

// ---------- the recipe book, and the spells ----------
const usableHere = r => gridKind && GRIDS[gridKind].at.includes(r.at);
function listed() {
  const q = search.trim().toLowerCase(), seen = G.profile.seen ?? [];
  return recipesAt('all').filter(r => isKnown(r, seen) && (group === 'all' || ITEMS[r.out].group === group) && (!q || ITEMS[r.out].name.toLowerCase().includes(q)) && (!onlyReady || timesCanMake(r) > 0));
}
function detailHTML(r) {
  if (!r) return '<p class="note">Pick something to see what it takes. Shift-click makes as many as you can.</p>';
  const parts = Object.entries(needs(r)).map(([id, n]) => { const have = creative() ? n : countItem(id); return `<span class="need${have < n ? ' short' : ''}"><img src="${itemIcon(id)}" alt="" title="${esc(ITEMS[id].name)}"><b>${have}/${n}</b></span>`; }).join('');
  const can = usableHere(r) && timesCanMake(r) > 0;
  return `<div class="detail"><div class="what">${esc(ITEMS[r.out].name)}${r.n > 1 ? ` ×${r.n}` : ''}<small>Made ${STATION_NAMES[r.at]}</small></div><div class="needs">${parts}</div>${r.in ? '' : `<button type="button" class="gold" data-make ${can ? '' : 'disabled'}>Make</button>`}</div>`;
}
function bookHTML() {
  const list = listed();
  if (creative()) return '';
  return `<div class="booktools"><input id="booksearch" type="search" placeholder="Search" value="${esc(search)}" aria-label="Search recipes"><button type="button" class="slatebutton${onlyReady ? ' on' : ''}" data-only title="Only what I can make">${icon('quest')}</button></div>`
    + `<div class="booktabs">${GROUPS.map(([id, name, art]) => `<button type="button" class="${group === id ? 'on' : ''}" data-group="${id}" title="${name}">${icon(art)}</button>`).join('')}</div>`
    + `<div class="booklist">${list.map(r => `<button type="button" class="slot${r === picked ? ' sel' : ''}${timesCanMake(r) > 0 ? '' : ' short'}" data-recipe="${esc(r.id)}"><img src="${itemIcon(r.out)}" alt="">${r.n > 1 ? `<b>${r.n}</b>` : ''}</button>`).join('') || '<p class="note">Nothing yet. Pick things up, and what they can make appears here.</p>'}</div>`
    + `<div class="bookdetail">${detailHTML(picked)}</div>`;
}
function paletteHTML() {
  const q = search.trim().toLowerCase(), all = Object.entries(ITEMS).filter(([, it]) => !q || it.name.toLowerCase().includes(q));
  return `<div class="booktools"><input id="booksearch" type="search" placeholder="Search every item" value="${esc(search)}" aria-label="Search items"></div><div class="booklist tall">${all.map(([id]) => `<button type="button" class="slot" data-give="${id}"><img src="${itemIcon(id)}" alt=""></button>`).join('')}</div>`;
}
function spellListHTML() {
  const list = castable().map(power);
  return `<div class="spellrows">${list.map(p => `<div class="row"><span class="thumb">${icon(p.icon)}</span><span class="what">${esc(p.name)}<small>${p.mana} mana</small></span><span class="acts">${[0, 1].map(i => `<button type="button" class="slatebutton${G.profile.spells?.[i] === p.id ? ' on' : ''}" data-spell="${p.id}" data-to="${i}">${SPELL_KEYS[i]}</button>`).join('')}</span></div>`).join('') || '<p class="note">No spells yet. Buy a scroll from a merchant.</p>'}</div><p class="note">Two spells at a time, on Q and R.</p>`;
}
function drawSide() {
  $('sidetabs').innerHTML = `<button type="button" class="${side === 'recipes' ? 'on' : ''}" data-side="recipes">${creative() ? 'Items' : 'Recipes'}</button><button type="button" class="${side === 'spells' ? 'on' : ''}" data-side="spells">Spells</button>`;
  const body = $('sidebody'), keep = document.activeElement?.id === 'booksearch', scroll = body.querySelector('.booklist')?.scrollTop ?? 0;
  body.innerHTML = side === 'spells' ? spellListHTML() : creative() ? paletteHTML() : bookHTML();
  const list = body.querySelector('.booklist');
  if (list) list.scrollTop = scroll;
  if (keep) { const f = $('booksearch'); f?.focus(); f?.setSelectionRange(search.length, search.length); }
}

// ---------- the tooltip ----------
function tipLines(it, s) {
  const out = [];
  if (it.dmg) out.push(`+${it.dmg} damage`);
  if (it.tool && it.tool !== 'shears') out.push(`Mines at ${it.speed}x, level ${it.level}`);
  if (it.def) out.push(`${it.def} defence`);
  if (it.block && it.slot === 'off') out.push(`Blocks ${Math.round(it.block * 100)}% of a blow`);
  if (it.spell) out.push(`Spells ${Math.round(it.spell * 100 - 100)}% stronger while held`);
  if (it.use?.heal) out.push(`Restores ${it.use.heal} health`);
  if (it.use?.mana) out.push(`Restores ${it.use.mana} mana`);
  if (it.use?.buff) out.push(`Lasts ${it.use.time} seconds`);
  if (it.fuel) out.push(`Burns for ${it.fuel} seconds`);
  if (s?.dur) out.push(`Durability ${s.dur}/${it.dur}`);
  if (it.value) out.push(`Sells for ${it.value}`);
  return out;
}
function showTip(s) {
  const t = $('bagtip');
  if (!s) { t.style.display = 'none'; return; }
  const it = ITEMS[s.id];
  t.innerHTML = `<b>${esc(it.name)}</b>${tipLines(it, s).map(l => `<small>${esc(l)}</small>`).join('')}`;
  t.style.display = 'block';
}
function moveFloaters(e) {
  $('cursorstack').style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  $('bagtip').style.transform = `translate(${Math.min(e.clientX + 18, innerWidth - 220)}px, ${e.clientY + 18}px)`;
}

// ---------- the mouse ----------
const slotOf = e => e.target.closest?.('#bag [data-c]');
const indexOf = b => (b.dataset.c === 'worn' ? b.dataset.i : Number(b.dataset.i));
function downOnSlot(e, b) {
  const c = b.dataset.c, i = indexOf(b), right = e.button === 2;
  if (c === 'out') { takeResult(e.shiftKey); changed(); drawBag(); return; }
  if (c === 'cbar') { selectSlot(i); return; }
  const box = BOXES[c], s = box.get(i), now = performance.now(), again = lastDown && lastDown.c === c && lastDown.i === i && now - lastDown.at < DOUBLE_CLICK;
  lastDown = { c, i, at: now };
  if (e.shiftKey) { quick(c, i); changed(); drawBag(); return; }
  if (again && cursor && !right) { gather(cursor.id); changed(); drawBag(); return; }
  // A held stack is laid down when the button lifts, because the mouse may be about to drag it across several slots.
  if (cursor && (!s || s.id === cursor.id)) { spread = { right, cells: [[c, i]] }; return; }
  press(c, i, right);
  changed(); drawBag();
}
function overSlot(b) {
  if (!spread || !cursor) return;
  const c = b.dataset.c, i = indexOf(b), box = BOXES[c];
  if (!box || (box.takes && !box.takes(i, cursor)) || spread.cells.some(([a, n]) => a === c && n === i)) return;
  const s = box.get(i);
  if (!s || (s.id === cursor.id && stackable(s))) spread.cells.push([c, i]);
}
function finishSpread() {
  const { right, cells } = spread;
  spread = null;
  if (cells.length === 1) { press(cells[0][0], cells[0][1], right); }
  else if (cursor) {
    const each = right ? 1 : Math.max(1, Math.floor(cursor.n / cells.length));
    for (const [c, i] of cells) {
      if (!cursor) break;
      const box = BOXES[c], s = box.get(i), part = Math.min(each, cursor.n);
      if (s) { const room = Math.min(part, ITEMS[s.id].stack - s.n); s.n += room; cursor.n -= room; } else { box.set(i, { ...cursor, n: part }); cursor.n -= part; }
      if (cursor.n <= 0) cursor = null;
    }
  }
  changed(); drawBag();
}
function pointAt(b) {
  hover = b && b.dataset.c !== 'out' && b.dataset.c !== 'cbar' ? { c: b.dataset.c, i: indexOf(b) } : null;
  const stack = !b ? null : b.dataset.c === 'out' ? (() => { const r = result(); return r ? { id: r.out, n: r.n, dur: r.dur } : null; })() : b.dataset.c === 'cbar' ? hotbarStack(Number(b.dataset.i)) : BOXES[b.dataset.c].get(indexOf(b));
  showTip(cursor ? null : stack);
}
const recipeById = id => recipesAt('all').find(r => r.id === id);
function clickSide(e) {
  const t = e.target;
  const pick = t.closest('[data-side]'), tab = t.closest('[data-group]'), only = t.closest('[data-only]'), rec = t.closest('[data-recipe]'), make = t.closest('[data-make]'), spell = t.closest('[data-spell]'), give = t.closest('[data-give]');
  if (pick) { side = pick.dataset.side; drawSide(); }
  if (tab) { group = tab.dataset.group; drawSide(); }
  if (only) { onlyReady = !onlyReady; drawSide(); }
  if (give) { hotbar.creative[hotbar.slot] = give.dataset.give; emit('hotbar:changed'); }
  if (spell) {
    const slots = G.profile.spells, to = Number(spell.dataset.to), id = spell.dataset.spell;
    if (slots[1 - to] === id) slots[1 - to] = slots[to];
    slots[to] = id;
    emit('blocks:changed'); emit('spells:changed');
    drawBag();
  }
  if (rec) {
    picked = recipeById(rec.dataset.recipe);
    if (e.shiftKey && usableHere(picked)) { const made = craftFromBag(picked, timesCanMake(picked)); if (made) changed(); }
    else if (usableHere(picked)) { clearWorkbench(); layOnGrid(picked, grid, gridKind); changed(); }
    drawBag();
  }
  if (make && picked) { if (craftFromBag(picked, 1)) changed(); drawBag(); }
}
$('bag').addEventListener('mousedown', e => { const b = slotOf(e); if (b) { e.preventDefault(); downOnSlot(e, b); } });
$('bag').addEventListener('mouseover', e => { const b = slotOf(e); if (b) overSlot(b); pointAt(b); });
$('bag').addEventListener('mouseleave', () => pointAt(null));
$('bagsort').addEventListener('click', () => { sortBag(); drawBag(); });
$('bagside').addEventListener('click', clickSide);
$('bagside').addEventListener('input', e => { if (e.target.id === 'booksearch') { search = e.target.value; drawSide(); } });
addEventListener('mouseup', () => { if (spread) finishSpread(); });
addEventListener('mousemove', e => { if (open) moveFloaters(e); });
addEventListener('keydown', e => {
  if (!open || !hover || !/^Digit[1-9]$/.test(e.code) || e.target.tagName === 'INPUT') return;
  const n = Number(e.code[5]) - 1, box = BOXES[hover.c], s = box.get(hover.i), there = bag()[n];
  if (box.takes && there && !box.takes(hover.i, there)) return;
  bag()[n] = s; box.set(hover.i, there);
  changed(); drawBag();
});
on('station:changed', () => {
  if (!open || !station?.data || station.kind === 'chest') return;
  const { burn, burnt, cook } = station.data, a = $('burnbar'), b = $('cookbar');
  if (a) a.style.height = `${burnt ? Math.round(100 * burn / burnt) : 0}%`;
  if (b) b.style.width = `${Math.min(100, Math.round(cook * 10))}%`;
});
on('station:opened', ({ kind, x, y, z }) => { station = { kind, data: kind in GRIDS ? null : stationAt(x, y, z, kind) }; openPage('bag'); });
let newRecipes = 0;
on('item:seen', () => { if (!G.world || newRecipes) return; newRecipes = setTimeout(() => { newRecipes = 0; toast('📜 Your recipe book has grown.', 3); }, 1200); });

definePage('bag', {
  tab: 'bag',
  view: 'bag',
  render() {
    open = true;
    gridKind = station ? (station.kind in GRIDS ? station.kind : null) : 'hand';
    grid = gridKind ? Array(GRIDS[gridKind].size ** 2).fill(null) : [];
    picked = null;
    showPortrait($('herocanvas'));
    drawBag();
  },
  leave() {
    open = false;
    clearWorkbench();
    station = null;
    gridKind = 'hand';
    grid = [];
    drawCursor();
    showTip(null);
    hidePortrait();
    changed();
  },
});
