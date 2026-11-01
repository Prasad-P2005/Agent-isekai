// The hotbar and the bag: one compact slate panel in the middle of the screen, with the recipe book and the spells against its right edge.
// The mouse works as Minecraft's does with the Mouse Tweaks mod, and everything happens on the press, not the release. A left press takes or lays down, a right
// press splits or drops one, shift sends a stack across, a double click gathers, and keys 1 to 9 swap the slot under the mouse with the hotbar. A drag carries on
// from the press: left from an empty slot shares the stack out as it goes, left from a stack collects more of that item, or sends it across with shift held,
// shift alone sends across whatever it crosses, and right drops one on every slot it enters, as often as it enters. The wheel moves one item at a time: down out
// of the stack under the mouse, up into it, and down on a crafting result makes one. A station swaps the crafting corner for its own panel. Whatever leaves the panel lands
// in the world: a click outside it throws what the mouse carries, the whole of it on the left button and one on the right, letting go out there throws a stack dragged out,
// and the G key throws from the slot under the mouse, one at a time, or the stack with Ctrl.
import { pressed, spellKey } from '../core/bindings.js';
import { G, creative } from '../core/state.js';
import { ITEMS } from '../core/content.js';
import { emit, on, toast } from '../core/events.js';
import { castable } from '../sim/abilities.js';
import { throwAway } from '../sim/drops.js';
import { GRIDS, craftFromBag, isKnown, layOnGrid, matchGrid, needs, recipesAt, timesCanMake, useGrid } from '../sim/crafting.js';
import { BAG_SIZE, HOTBAR, addItem, armourPoints, bag, changed, countItem, hasRoom, heldStack, hotbar, selectSlot, sortBag, worn } from '../sim/inventory.js';
import { maxHp, player } from '../sim/player.js';
import { stationAt, stationParts } from '../sim/stations.js';
import { hidePortrait, showPortrait } from '../view/portrait.js';
import { stillCamera } from '../view/scene.js';
import { esc, icon, itemIcon, power } from './art.js';
import { definePage, openPage } from './panels.js';

const $ = id => document.getElementById(id);
const GROUPS = [['all', 'All', 'star'], ['tools', 'Tools', 'pick'], ['weapons', 'Arms', 'sword'], ['armor', 'Armour', 'plate'], ['blocks', 'Blocks', 'house'], ['materials', 'Goods', 'loot'], ['food', 'Food', 'heal'], ['potions', 'Potions', 'potion']];
const STATION_NAMES = { hand: 'by hand', table: 'at a Crafting Table', anvil: 'at an Anvil', alchemy: 'at an Alchemy Table', furnace: 'in a Furnace', forge: 'at a Forge' };
const NAME_SECONDS = 2000, DOUBLE_CLICK = 280, WHEEL_NOTCH = 40;
const POP = [{ transform: 'scale(1.2222)' }, { transform: 'scale(1)' }], POP_TIME = { duration: 100, easing: 'steps(2)' }; // 22 art pixels, then 20, then the 18 it rests at
let open = false, station = null, gridKind = 'hand', grid = Array(4).fill(null), cursor = null, side = 'recipes', group = 'all', search = '', onlyReady = false, picked = null, drag = null, lastDown = null, hover = null, under = null, nameTimer = 0, wheelRest = 0, popping = false;

// The switch on the pause card. The mode is saved with the hero, so it changes when the server answers.
function showMode() { $('creative').textContent = `Creative mode: ${creative() ? 'on' : 'off'}`; }
on('creative:changed', showMode);
$('creative').addEventListener('click', () => emit('creative:asked', !creative()));
export function showCreativeMode() { showMode(); }

// ---------- a stack, drawn ----------
// The parts inside a slot stay put and only what differs is written, so a click decodes no image and lays nothing out again.
const bit = (tag, cls = '', ...kids) => { const e = document.createElement(tag); e.className = cls; e.append(...kids); return e; };
function holder(el, before = '') {
  el.innerHTML = `${before}<img alt="" hidden><b></b><i class="dur" hidden><i></i></i>`;
  return { el, img: el.querySelector('img'), num: el.querySelector('b'), dur: el.querySelector('.dur'), bar: el.querySelector('.dur i'), id: null, shown: '' };
}
function paint(h, s) {
  const shown = s ? `${s.id} ${s.n} ${s.dur ?? ''}` : '';
  if (shown === h.shown) return;
  h.shown = shown;
  if (h.id !== (s?.id ?? null)) { h.id = s?.id ?? null; h.img.hidden = !s; if (s) h.img.src = itemIcon(s.id); }
  h.num.textContent = s?.n > 1 ? s.n : '';
  const most = s && ITEMS[s.id].dur, share = most && s.dur && s.dur < most ? s.dur / most : 0;
  h.dur.hidden = !share;
  if (share) { h.bar.style.width = `${Math.round(share * 100)}%`; h.bar.classList.toggle('low', share < 0.25); }
  if (s && popping && !stillCamera.matches) h.img.animate(POP, POP_TIME);
}
const write = (el, html) => { if (el.written !== html) { el.written = html; el.innerHTML = html; } };

// ---------- the hotbar ----------
function hotbarStack(i) { return creative() ? (hotbar.creative[i] ? { id: hotbar.creative[i], n: 1 } : null) : bag()[i]; }
const hud = Array.from({ length: HOTBAR }, (_, i) => { const h = holder(bit('div', 'slot'), `<i class="num">${i + 1}</i>`); $('hotbar').append(h.el); return h; });
function drawHotbar() { hud.forEach((h, i) => { paint(h, hotbarStack(i)); h.el.classList.toggle('sel', i === hotbar.slot); }); }
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
on('hotbar:changed', () => { drawHotbar(); showHeldName(); if (open) refresh(); });
on('blocks:changed', () => { if (open) refresh(); });

// ---------- where things can sit ----------
const fitsWorn = (slot, s) => { const it = ITEMS[s.id]; return slot === 'off' ? it.slot === 'off' || s.id === 'torch' || s.id === 'lantern' : it.slot === slot; };
function fitsStore(i, s) { const parts = stationParts(station.kind); return i !== parts.out && (i !== parts.fuel || !!ITEMS[s.id].fuel); }
const BOXES = {
  bag: { get: i => bag()[i], set: (i, s) => { bag()[i] = s; } },
  worn: { get: i => worn()[i], set: (i, s) => { worn()[i] = s; }, takes: fitsWorn },
  grid: { get: i => grid[i], set: (i, s) => { grid[i] = s; } },
  store: { get: i => station.data.slots[i], set: (i, s) => { station.data.slots[i] = s; }, takes: fitsStore },
};
const takes = (box, i, s) => !box.takes || box.takes(i, s);
const stackable = s => !ITEMS[s.id].dur;
const hasSpace = s => stackable(s) && s.n < ITEMS[s.id].stack;
function merge(into, from) { const room = Math.min(from.n, ITEMS[into.id].stack - into.n); into.n += room; from.n -= room; return from.n; }

// One of what is in the hand onto a slot, if it can go there.
function dropOne(c, i) {
  const box = BOXES[c], s = box.get(i);
  if (!cursor || !takes(box, i, cursor) || (s && (s.id !== cursor.id || !hasSpace(s)))) return false;
  if (s) s.n++; else box.set(i, { ...cursor, n: 1 });
  if (--cursor.n <= 0) cursor = null;
  return true;
}
// One press of a button on a slot.
function press(c, i, right) {
  const box = BOXES[c], s = box.get(i);
  if (cursor && !takes(box, i, cursor)) return;
  if (right) {
    if (cursor) dropOne(c, i);
    else if (s) { const half = Math.ceil(s.n / 2); cursor = { ...s, n: half }; s.n -= half; if (!s.n) box.set(i, null); }
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
// A slot's stack into the hand, as far as the hand has room.
function collect(box, i) {
  const s = box.get(i);
  if (!cursor) { cursor = s; box.set(i, null); return; }
  if (stackable(s)) { merge(cursor, s); if (!s.n) box.set(i, null); }
}
function gather() {
  if (!stackable(cursor)) return false;
  const before = cursor.n;
  for (let i = 0; i < BAG_SIZE; i++) if (bag()[i]?.id === cursor.id) collect(BOXES.bag, i);
  return cursor.n > before;
}

// ---------- what the wheel does ----------
const places = (c, from, to) => Array.from({ length: to - from }, (_, k) => [c, from + k]);
// The other inventory: the bag for a station's slots, a station for the bag, and with nothing open the hotbar and the rest of the bag face each other.
function otherSide(c, i) {
  if (c !== 'bag') return places('bag', 0, BAG_SIZE);
  if (station?.data) return places('store', 0, station.data.slots.length);
  if (station) return places('grid', 0, grid.length);
  return i < HOTBAR ? places('bag', HOTBAR, BAG_SIZE) : places('bag', 0, HOTBAR);
}
function pushOne(c, i) {
  const box = BOXES[c], s = box.get(i), there = otherSide(c, i).filter(([d, k]) => takes(BOXES[d], k, s));
  const spot = there.find(([d, k]) => { const t = BOXES[d].get(k); return t?.id === s.id && hasSpace(t); }) ?? there.find(([d, k]) => !BOXES[d].get(k));
  if (!spot) return;
  const [d, k] = spot, t = BOXES[d].get(k);
  if (t) t.n++; else BOXES[d].set(k, { ...s, n: 1 });
  if (--s.n <= 0) box.set(i, null);
}
function pullOne(c, i) {
  const box = BOXES[c], s = box.get(i);
  if (!hasSpace(s) || !takes(box, i, s)) return;
  const from = otherSide(c, i).reverse().find(([d, k]) => BOXES[d].get(k)?.id === s.id);
  if (!from) return;
  const [d, k] = from, t = BOXES[d].get(k);
  s.n++;
  if (--t.n <= 0) BOXES[d].set(k, null);
}

// ---------- what the grid makes ----------
const result = () => (gridKind ? matchGrid(grid, gridKind) : null);
const made = () => { const r = result(); return r ? { id: r.out, n: r.n, dur: r.dur } : null; };
// Into the hand, or straight into the bag, once or for as long as the grid goes on making it.
function takeResult(intoBag, many) {
  for (let r = result(); r; r = result()) {
    const out = { id: r.out, n: r.n, ...(ITEMS[r.out].dur ? { dur: r.dur ?? ITEMS[r.out].dur } : {}) };
    if (intoBag) { if (!hasRoom(out.id, out.n)) return; addItem(out.id, out.n, out.dur); } else if (!cursor) cursor = out;
    else if (cursor.id === out.id && stackable(out) && cursor.n + out.n <= ITEMS[out.id].stack) cursor.n += out.n;
    else return;
    useGrid(grid);
    if (!many) return;
  }
}
// Back into the bag, and what it has no room for goes on the ground.
function putAway(s) { const left = addItem(s.id, s.n, s.dur); if (left) throwAway(s.id, left, s.dur); }
function clearWorkbench() {
  for (let i = 0; i < grid.length; i++) if (grid[i]) { putAway(grid[i]); grid[i] = null; }
  if (cursor) { putAway(cursor); cursor = null; }
}

// ---------- the panel ----------
// Every slot is one element for as long as the page lives, and a change is a look at each of them. `work` is the corner a station changes, made anew when the bag opens.
const fixed = [], work = [];
function cell(list, c, i, read, cls = '') {
  const el = bit('button', `slot ${cls}`);
  el.type = 'button'; el.dataset.c = c; el.dataset.i = i;
  list.push({ ...holder(el), read });
  return el;
}
$('gear').append(...['head', 'body', 'legs', 'feet'].map(slot => cell(fixed, 'worn', slot, () => worn()[slot])));
$('bagoff').append(cell(fixed, 'worn', 'off', () => worn().off));
$('bagitems').append(...Array.from({ length: BAG_SIZE - HOTBAR }, (_, k) => cell(fixed, 'bag', k + HOTBAR, () => bag()[k + HOTBAR])));
const dock = Array.from({ length: HOTBAR }, (_, i) => cell(fixed, 'bag', i, () => hotbarStack(i)));
$('baghot').append(...dock);
const carried = holder($('cursorstack').appendChild(bit('span', 'slotlike')));

const storeCell = (i, cls) => cell(work, 'store', i, () => station.data.slots[i], cls);
let burnBar = null, cookBar = null;
function craftPanel() {
  const slots = bit('div', 'craftgrid', ...grid.map((_, i) => cell(work, 'grid', i, () => grid[i])));
  slots.style.cssText = `--cols:${GRIDS[gridKind].size}`;
  return bit('div', 'crafting', slots, bit('i', 'craftarrow'), cell(work, 'out', 0, made, 'result'));
}
function furnacePanel() {
  const { inputs, fuel, out } = stationParts(station.kind), flame = bit('i', 'flame'), arrow = bit('i', 'craftarrow');
  burnBar = flame.appendChild(bit('i'));
  cookBar = arrow.appendChild(bit('i'));
  return bit('div', 'furnace', bit('div', 'furnace-in', bit('div', 'dockset', ...inputs.map(i => storeCell(i))), flame, storeCell(fuel)), arrow, storeCell(out, 'result'));
}
function buildWork() {
  const chest = station?.kind === 'chest', at = $('bagwork');
  work.length = 0;
  burnBar = cookBar = null;
  at.innerHTML = '';
  at.classList.toggle('chest', chest);
  at.append(chest ? bit('div', 'chestgrid', ...station.data.slots.map((_, i) => storeCell(i))) : station?.data ? furnacePanel() : craftPanel());
}
function drawFlames() {
  if (!burnBar) return;
  const { burn, burnt, cook } = station.data;
  burnBar.style.height = `${burnt ? Math.round(100 * burn / burnt) : 0}%`;
  cookBar.style.width = `${Math.min(100, Math.round(cook * 10))}%`;
}
function spellsHTML() {
  return `<div class="spellpair">${[0, 1].map(i => { const id = G.profile.spells?.[i], p = id ? power(id) : null; return `<div class="slot" data-spelled="${i}"><i class="num">${spellKey(i)}</i>${p ? icon(p.icon) : ''}</div>`; }).join('')}</div>`;
}
function drawStatus() {
  write($('bagspells'), spellsHTML());
  write($('bagline'), `${icon('coin')}${G.profile.gold} ${icon('heart')}${Math.ceil(player.hp)}/${maxHp()} ${icon('shield')}${armourPoints()}`);
}
function paintSlots() {
  for (const h of fixed) paint(h, h.read());
  for (const h of work) paint(h, h.read());
  dock.forEach((b, i) => { b.dataset.c = creative() ? 'cbar' : 'bag'; b.classList.toggle('sel', i === hotbar.slot); });
}
function drawCursor() { $('cursorstack').style.display = cursor ? 'block' : 'none'; paint(carried, cursor); }
function refresh() { paintSlots(); drawCursor(); drawStatus(); pointAt(under); bookSoon(); }
function drawBag() { buildWork(); paintSlots(); drawCursor(); drawStatus(); drawFlames(); drawSide(); }
// The end of anything the hero's hand did: what changed gives a small jump, so the hand feels it land.
function done() { popping = true; changed(); popping = false; }

// ---------- the recipe book, and the spells ----------
const usableHere = r => gridKind && GRIDS[gridKind].at.includes(r.at);
const atHand = r => usableHere(r) || station?.kind === r.at;
const readyNow = r => atHand(r) && timesCanMake(r) > 0;
// What can be made right now comes first, and the rest follow in the book's own order.
function listed() {
  const q = search.trim().toLowerCase(), seen = G.profile.seen ?? [];
  const list = recipesAt('all').filter(r => isKnown(r, seen) && (group === 'all' || ITEMS[r.out].group === group) && (!q || ITEMS[r.out].name.toLowerCase().includes(q)));
  const ready = list.filter(readyNow);
  return onlyReady ? ready : [...ready, ...list.filter(r => !readyNow(r))];
}
const patternHTML = r => (r.shape ? `<div class="pattern" style="--cols:${r.shape[0].length}">${r.shape.flatMap(row => [...row]).map(c => `<i>${c === '.' ? '' : `<img src="${itemIcon(r.keys[c])}" alt="" title="${esc(ITEMS[r.keys[c]].name)}">`}</i>`).join('')}</div>` : '');
function detailHTML(r) {
  if (!r) return '<p class="note">Pick something to see what it takes. Shift-click makes as many as you can.</p>';
  const parts = Object.entries(needs(r)).map(([id, n]) => { const have = creative() ? n : countItem(id); return `<span class="need${have < n ? ' short' : ''}"><img src="${itemIcon(id)}" alt="" title="${esc(ITEMS[id].name)}"><b>${have}/${n}</b></span>`; }).join('');
  const times = timesCanMake(r), can = usableHere(r) && times > 0;
  const actions = r.in ? '' : `<div class="makes"><button type="button" class="gold" data-make ${can ? '' : 'disabled'}>Make</button>${can && times > 1 ? `<button type="button" class="gold" data-make-all>Make ${times}</button>` : ''}</div>`;
  return `<div class="detail">${patternHTML(r)}<div class="what">${esc(ITEMS[r.out].name)}${r.n > 1 ? ` ×${r.n}` : ''}<small>Made ${STATION_NAMES[r.at]}${atHand(r) ? '' : '. Find one first'}</small></div><div class="needs">${parts}</div>${actions}</div>`;
}
function bookHTML() {
  return `<div class="booktools"><input id="booksearch" type="search" placeholder="Search" value="${esc(search)}" aria-label="Search recipes"><button type="button" class="slatebutton${onlyReady ? ' on' : ''}" data-only title="Only what I can make here">${icon('quest')}</button></div>`
    + `<div class="booktabs">${GROUPS.map(([id, name, art]) => `<button type="button" class="${group === id ? 'on' : ''}" data-group="${id}" title="${name}">${icon(art)}</button>`).join('')}</div>`
    + '<div class="booklist"></div><div class="bookdetail"></div>';
}
function paletteHTML() {
  return `<div class="booktools"><input id="booksearch" type="search" placeholder="Search every item" value="${esc(search)}" aria-label="Search items"></div><div class="booklist"></div>`;
}
function spellListHTML() {
  const list = castable().map(power);
  return `<div class="spellrows">${list.map(p => `<div class="row"><span class="thumb">${icon(p.icon)}</span><span class="what">${esc(p.name)}<small>${p.mana} mana</small></span><span class="acts">${[0, 1].map(i => `<button type="button" class="slatebutton${G.profile.spells?.[i] === p.id ? ' on' : ''}" data-spell="${p.id}" data-to="${i}">${spellKey(i)}</button>`).join('')}</span></div>`).join('') || '<p class="note">No spells yet. Buy a scroll from a merchant.</p>'}</div><p class="note">Two spells at a time, on Q and R.</p>`;
}
// The list is written again only when what it lists changes. Otherwise a click just shades what can no longer be made.
let listBox = null, detailBox = null, listShown = null, bookDue = 0;
function drawList() {
  if (creative()) {
    const q = search.trim().toLowerCase();
    listBox.innerHTML = Object.entries(ITEMS).filter(([, it]) => !q || it.name.toLowerCase().includes(q)).map(([id]) => `<button type="button" class="slot" data-give="${id}"><img src="${itemIcon(id)}" alt=""></button>`).join('');
    return;
  }
  const list = listed(), shown = list.map(r => r.id).join();
  if (shown !== listShown) {
    listShown = shown;
    listBox.innerHTML = list.map(r => `<button type="button" class="slot" data-recipe="${esc(r.id)}"><img src="${itemIcon(r.out)}" alt="">${r.n > 1 ? `<b>${r.n}</b>` : ''}</button>`).join('') || '<p class="note">Nothing yet. Pick things up, and what they can make appears here.</p>';
  }
  list.forEach((r, k) => { const b = listBox.children[k]; b?.classList.toggle('short', !readyNow(r)); b?.classList.toggle('sel', r === picked); });
}
function drawDetail() { if (detailBox) write(detailBox, detailHTML(picked)); }
function drawSide() {
  const body = $('bagbody'), book = side === 'recipes';
  $('sidetabs').innerHTML = `<button type="button" class="${book ? 'on' : ''}" data-side="recipes">${creative() ? 'Items' : 'Recipes'}</button><button type="button" class="${book ? '' : 'on'}" data-side="spells">Spells</button>`;
  body.innerHTML = !book ? spellListHTML() : creative() ? paletteHTML() : bookHTML();
  listBox = book ? body.querySelector('.booklist') : null;
  detailBox = book && !creative() ? body.querySelector('.bookdetail') : null;
  listShown = null;
  if (listBox) drawList();
  drawDetail();
}
function bookSoon() {
  if (bookDue || !detailBox) return;
  bookDue = requestAnimationFrame(() => { bookDue = 0; if (open && detailBox) { drawList(); drawDetail(); } });
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
let tipShown = '';
function showTip(s) {
  const t = $('bagtip'), shown = s ? `${s.id} ${s.dur ?? ''}` : '';
  if (shown === tipShown) return;
  tipShown = shown;
  t.style.display = s ? 'block' : 'none';
  if (s) { const it = ITEMS[s.id]; t.innerHTML = `<b>${esc(it.name)}</b>${tipLines(it, s).map(l => `<small>${esc(l)}</small>`).join('')}`; }
}
function moveFloaters(e) {
  $('cursorstack').style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
  $('bagtip').style.transform = `translate(${Math.min(e.clientX + 18, innerWidth - 220)}px, ${e.clientY + 18}px)`;
}

// ---------- the mouse ----------
const slotOf = e => e.target.closest?.('#bag [data-c]');
const indexOf = b => (b.dataset.c === 'worn' ? b.dataset.i : Number(b.dataset.i));
// A stack shared out over the slots a left drag has crossed, worked out again each time it reaches another. Everything is always somewhere, so letting go has
// nothing left to do. A cell's `put` is this drag's share of it, which keeps whatever else landed there meanwhile.
function shareOut() {
  const { stack, cells } = drag, each = Math.max(1, Math.floor(stack.n / cells.length));
  let left = stack.n;
  for (const cell of cells) {
    const box = BOXES[cell.c], now = box.get(cell.i);
    if (now && now.id !== stack.id) continue;
    const had = Math.max(0, (now?.n ?? 0) - cell.put), part = Math.min(each, left, ITEMS[stack.id].stack - had);
    box.set(cell.i, had + part ? { ...stack, n: had + part } : null);
    cell.put = part;
    left -= part;
  }
  cursor = left ? { ...stack, n: left } : null;
}
function canShare(c, i) {
  const box = BOXES[c], s = box.get(i), { stack, cells } = drag;
  return cells.length < stack.n && takes(box, i, stack) && (!s || (s.id === stack.id && hasSpace(s))) && !cells.some(x => x.c === c && x.i === i);
}
function downOnSlot(e, b) {
  const c = b.dataset.c, i = indexOf(b), right = e.button === 2;
  drag = null;
  if (document.activeElement?.id === 'booksearch') document.activeElement.blur();
  if (c === 'out') { takeResult(e.shiftKey, e.shiftKey); done(); return; }
  if (c === 'cbar') { selectSlot(i); return; }
  const box = BOXES[c], s = box.get(i), now = performance.now(), again = !right && lastDown?.c === c && lastDown.i === i && now - lastDown.at < DOUBLE_CLICK, id = cursor?.id;
  lastDown = again ? null : { c, i, at: now };
  if (e.shiftKey) {
    if (s && (!id || s.id === id)) quick(c, i);
    drag = { mode: 'send', id, last: b, crossed: new Set([b]) };
  } else if (right) {
    press(c, i, true);
    if (cursor) drag = { mode: 'one', last: b };
  } else if (!(again && cursor && gather())) {
    if (cursor && !s && takes(box, i, cursor)) {
      drag = { mode: 'share', stack: cursor, cells: [{ c, i, put: 0 }], last: b };
      shareOut();
    } else {
      press(c, i, false);
      if (cursor || id) drag = { mode: 'collect', id: cursor?.id ?? id, last: b, crossed: new Set([b]) };
    }
  }
  done();
}
function overSlot(b, e) {
  if (b === drag.last) return;
  drag.last = b;
  const c = b.dataset.c, i = indexOf(b), box = BOXES[c], s = box?.get(i);
  if (!box) return;
  if (drag.mode === 'share') { if (canShare(c, i)) { drag.cells.push({ c, i, put: 0 }); shareOut(); done(); } return; }
  if (drag.mode === 'one') { if (dropOne(c, i)) done(); return; }
  if (!s || drag.crossed.has(b) || (drag.id && s.id !== drag.id)) return;
  drag.crossed.add(b);
  if (e.shiftKey) quick(c, i);
  else if (drag.mode === 'collect') collect(box, i);
  done();
}
function turnWheel(e) {
  const b = slotOf(e);
  if (!b || cursor) return;
  const c = b.dataset.c, i = indexOf(b);
  if (c === 'out' ? !result() : !BOXES[c]?.get(i)) return;
  e.preventDefault();
  wheelRest += e.deltaMode ? e.deltaY * WHEEL_NOTCH : e.deltaY; // a trackpad sends many small turns
  if (Math.abs(wheelRest) < WHEEL_NOTCH) return;
  const down = wheelRest > 0;
  wheelRest = 0;
  if (c === 'out') { if (down) takeResult(true, false); } else if (down) pushOne(c, i); else pullOne(c, i);
  done();
}
// A recipe or something on the creative shelf shows the same tooltip as a stack of it would.
function onShelf(over) {
  const s = over?.closest?.('[data-recipe], [data-give]');
  const id = s?.dataset.give ?? (s?.dataset.recipe ? recipeById(s.dataset.recipe)?.out : null);
  return id ? { id } : null;
}
function pointAt(b, over) {
  under = b;
  const c = b?.dataset.c;
  hover = BOXES[c] ? { c, i: indexOf(b) } : null;
  const stack = !b ? onShelf(over) : c === 'out' ? made() : c === 'cbar' ? hotbarStack(Number(b.dataset.i)) : BOXES[c].get(indexOf(b));
  showTip(cursor ? null : stack);
}
// ---------- out of the bag ----------
const beside = e => !!e.target?.closest && !e.target.closest('.bag-panel, #bagside, #tabs, #ribbons, #panelclose');
function tossCursor(n) {
  throwAway(cursor.id, n, cursor.dur);
  cursor.n -= n;
  if (cursor.n <= 0) cursor = null;
  done();
}
function tossSlot(c, i, all) {
  const box = BOXES[c], s = box.get(i);
  if (!s) return;
  const n = all ? s.n : 1;
  throwAway(s.id, n, s.dur);
  s.n -= n;
  if (!s.n) box.set(i, null);
  done();
}
const recipeById = id => recipesAt('all').find(r => r.id === id);
function clickSide(e) {
  const t = e.target;
  const pick = t.closest('[data-side]'), tab = t.closest('[data-group]'), only = t.closest('[data-only]'), rec = t.closest('[data-recipe]'), make = t.closest('[data-make]'), makeAll = t.closest('[data-make-all]'), spell = t.closest('[data-spell]'), give = t.closest('[data-give]');
  if (pick) { side = pick.dataset.side; drawSide(); }
  if (tab) { group = tab.dataset.group; drawSide(); }
  if (only) { onlyReady = !onlyReady; drawSide(); }
  if (give) { hotbar.creative[hotbar.slot] = give.dataset.give; emit('hotbar:changed'); }
  if (spell) {
    const slots = G.profile.spells, to = Number(spell.dataset.to), id = spell.dataset.spell;
    if (slots[1 - to] === id) slots[1 - to] = slots[to];
    slots[to] = id;
    emit('blocks:changed'); emit('spells:changed');
    drawSide();
  }
  if (rec) {
    picked = recipeById(rec.dataset.recipe);
    if (e.shiftKey && usableHere(picked)) { if (craftFromBag(picked, timesCanMake(picked))) done(); }
    else if (usableHere(picked)) { clearWorkbench(); layOnGrid(picked, grid, gridKind); done(); }
    drawList(); drawDetail();
  }
  if (make && picked && craftFromBag(picked, 1)) done();
  if (makeAll && picked && craftFromBag(picked, timesCanMake(picked))) done();
}
$('bag').addEventListener('mousedown', e => { const b = slotOf(e); if (b) { e.preventDefault(); moveFloaters(e); downOnSlot(e, b); } });
$('bag').addEventListener('mouseover', e => { const b = slotOf(e); if (drag) { if (b) overSlot(b, e); else drag.last = null; } pointAt(b, e.target); });
$('bag').addEventListener('mouseleave', () => { if (drag) drag.last = null; pointAt(null); });
$('bag').addEventListener('wheel', turnWheel, { passive: false });
$('bagsort').addEventListener('click', () => sortBag());
$('bagside').addEventListener('click', clickSide);
$('bagside').addEventListener('input', e => { if (e.target.id === 'booksearch') { search = e.target.value; drawList(); } });
addEventListener('mousedown', e => { if (open && cursor && beside(e)) { e.preventDefault(); tossCursor(e.button === 2 ? 1 : cursor.n); } }, true); // first, so that the page knows this click was used
addEventListener('mouseup', e => {
  const out = open && cursor && (drag?.mode === 'collect' || drag?.mode === 'one') && beside(e);
  drag = null;
  if (out) tossCursor(cursor.n);
});
addEventListener('mousemove', e => { if (open) moveFloaters(e); });
addEventListener('keydown', e => {
  if (!open || !hover || e.target.tagName === 'INPUT') return;
  if (pressed('drop', e.code)) { e.preventDefault(); tossSlot(hover.c, hover.i, e.ctrlKey); return; }
  if (!/^Digit[1-9]$/.test(e.code)) return;
  const n = Number(e.code[5]) - 1, box = BOXES[hover.c], s = box.get(hover.i), there = bag()[n];
  if (there && !takes(box, hover.i, there)) return;
  bag()[n] = s; box.set(hover.i, there);
  done();
});
on('station:changed', () => { if (open) drawFlames(); });
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
    drag = null;
    clearWorkbench();
    station = null;
    gridKind = 'hand';
    grid = [];
    drawCursor();
    pointAt(null);
    hidePortrait();
    changed();
  },
});
