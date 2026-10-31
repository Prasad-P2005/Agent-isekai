// The bag: 36 slots of { id, n, dur }, the first nine the hotbar, and what is worn. The client owns it, because mining and crafting cannot wait for
// a round trip. It reports the whole thing to the server, and what the server gives or takes arrives as parcels (see systems/bag.py).
import { ITEMS } from '../core/content.js';
import { G, creative } from '../core/state.js';
import { emit, toast } from '../core/events.js';

export const HOTBAR = 9, BAG_SIZE = 36;
const ARMOUR_POINTS = 50, MOST_ARMOUR = 0.8, WEAR_PER_HEALTH = 4;
export const WORN_SLOTS = ['head', 'body', 'legs', 'feet', 'off'];

// Which item a block is. A block's item may place several blocks: stairs face the way you look.
export const BLOCK_ITEM = {};
for (const [id, it] of Object.entries(ITEMS)) for (const block of [it.block, ...(it.place ?? [])]) if (block != null) BLOCK_ITEM[block] = id;
export const itemOfBlock = block => BLOCK_ITEM[block] ?? null;

export const hotbar = { slot: 0, creative: Array(HOTBAR).fill(null) }; // creative mode has a hotbar of its own, so that the real one is there when it ends
export const bag = () => (G.profile.bag ??= Array(BAG_SIZE).fill(null));
export const worn = () => (G.profile.worn ??= Object.fromEntries(WORN_SLOTS.map(s => [s, null])));
const seen = () => (G.profile.seen ??= []);
const makeStack = (id, n, dur) => ({ id, n, ...(ITEMS[id]?.dur ? { dur: dur ?? ITEMS[id].dur } : {}) });

function notice(id) { if (!seen().includes(id)) { seen().push(id); emit('item:seen', id); } }
// Everything that reaches the bag passes here, whether it was picked up, made, or carried out of a chest in the hand.
export function changed() { for (const s of bag()) if (s) notice(s.id); emit('hotbar:changed'); emit('blocks:changed'); }

// ---------- how much ----------
export const countItem = id => bag().reduce((sum, s) => sum + (s?.id === id ? s.n : 0), 0);
export const count = id => (typeof id === 'number' ? (BLOCK_ITEM[id] ? countItem(BLOCK_ITEM[id]) : 0) : countItem(id));
export const hasRoom = (id, n = 1) => { const it = ITEMS[id], room = bag().reduce((sum, s) => sum + (!s ? it.stack : s.id === id && !it.dur ? it.stack - s.n : 0), 0); return room >= n; };

// ---------- in and out ----------
// New things go to a stack that has room, then to the first free slot, which is the hotbar's until it is full. What does not fit is returned.
export function addItem(id, n = 1, dur) {
  const it = ITEMS[id];
  if (!it) return n;
  notice(id);
  let left = n;
  if (!it.dur) for (const s of bag()) { if (left && s?.id === id && s.n < it.stack) { const room = Math.min(left, it.stack - s.n); s.n += room; left -= room; } }
  for (let i = 0; i < BAG_SIZE && left; i++) if (!bag()[i]) { const part = Math.min(left, it.stack); bag()[i] = makeStack(id, part, dur); left -= part; }
  if (left < n) changed();
  return left;
}
export function takeItem(id, n = 1) {
  if (countItem(id) < n) return false;
  let left = n;
  for (let i = BAG_SIZE - 1; i >= 0 && left; i--) {
    const s = bag()[i];
    if (s?.id !== id) continue;
    const part = Math.min(left, s.n);
    s.n -= part; left -= part;
    if (!s.n) bag()[i] = null;
  }
  changed();
  return true;
}
export function addBlock(block, n = 1) { const id = BLOCK_ITEM[block]; return id ? addItem(id, n) : 0; }
export const takeBlock = block => !!BLOCK_ITEM[block] && takeItem(BLOCK_ITEM[block]);

// ---------- in the hand ----------
export const heldStack = () => (creative() ? (hotbar.creative[hotbar.slot] ? { id: hotbar.creative[hotbar.slot], n: 1 } : null) : bag()[hotbar.slot]);
export const heldDef = () => { const s = heldStack(); return s ? ITEMS[s.id] : null; };
export const offDef = () => { const s = worn().off; return s ? ITEMS[s.id] : null; };
export const heldBlock = () => { const it = heldDef(); return it?.block ?? it?.place?.[0] ?? 0; };
export function selectSlot(n) { hotbar.slot = n; emit('hotbar:changed'); }
export function cycleSlot(d) { selectSlot((hotbar.slot + d + HOTBAR) % HOTBAR); }
// One less of what is in the hand.
export function spendHeld() {
  if (creative()) return true;
  const s = bag()[hotbar.slot];
  if (!s) return false;
  if (--s.n <= 0) bag()[hotbar.slot] = null;
  changed();
  return true;
}
function wear(holder, key, cost) {
  const s = holder[key];
  if (!s?.dur) return;
  s.dur -= cost;
  if (s.dur > 0) return;
  holder[key] = null;
  toast(`Your ${ITEMS[s.id].name} broke.`, 3);
  emit('item:broke', s.id);
}
export function wearHeld(cost = 1) { if (!creative() && cost > 0) { wear(bag(), hotbar.slot, cost); changed(); } }

// ---------- armour ----------
export const armourPoints = () => WORN_SLOTS.reduce((sum, slot) => sum + (worn()[slot] ? ITEMS[worn()[slot].id].def ?? 0 : 0), 0);
export const armourCut = () => Math.min(MOST_ARMOUR, armourPoints() / ARMOUR_POINTS);
export function wearArmour(health) {
  if (creative()) return;
  const cost = Math.max(1, Math.floor(health / WEAR_PER_HEALTH));
  for (const slot of ['head', 'body', 'legs', 'feet']) wear(worn(), slot, cost);
  emit('blocks:changed');
}
export function wearShield(health) { if (!creative()) { wear(worn(), 'off', Math.floor(health) + 1); emit('blocks:changed'); } }
export const manaRegenBonus = () => WORN_SLOTS.reduce((most, slot) => Math.max(most, worn()[slot] ? ITEMS[worn()[slot].id].mana_regen ?? 1 : 1), 1);

// ---------- what the server sees ----------
export function blockSummary() {
  const out = {};
  for (const s of bag()) { if (!s) continue; const b = ITEMS[s.id]?.block; if (b != null) out[b] = (out[b] ?? 0) + s.n; }
  return out;
}
let taken = 0; // the last parcel applied
export const bagReport = stations => ({ bag: bag(), worn: worn(), seen: seen(), spells: G.profile.spells ?? ['', ''], taken, ...(stations ? { stations } : {}) });
function takeAll(id, n) { takeItem(id, Math.min(n, countItem(id))); }
// Each parcel once, in order. One that will not fit waits, with everything behind it, until there is room.
export function applyParcels(parcels = []) {
  let any = false;
  for (const { seq, id, n } of parcels) {
    if (seq <= taken) continue;
    if (n > 0 && !hasRoom(id, n)) { toast('Your bag is full: something is waiting for room.', 3); break; }
    if (n > 0) addItem(id, n); else takeAll(id, -n);
    taken = seq; any = true;
  }
  if (any) changed();
}
export function startBag(profile) { taken = profile.parcels_taken ?? 0; for (const s of [...bag(), ...Object.values(worn())]) if (s) notice(s.id); applyParcels(profile.parcels); hotbar.slot = 0; emit('hotbar:changed'); }

// Stacks merged and the bag put in order, with the hotbar left alone.
const ORDER = ['weapons', 'tools', 'armor', 'potions', 'food', 'materials', 'blocks'];
export function sortBag() {
  const rest = bag().slice(HOTBAR).filter(Boolean), merged = [];
  for (const s of rest) {
    const open = !s.dur && merged.find(m => m.id === s.id && m.n < ITEMS[m.id].stack);
    if (!open) { merged.push({ ...s }); continue; }
    const room = Math.min(s.n, ITEMS[s.id].stack - open.n);
    open.n += room;
    if (s.n > room) merged.push({ ...s, n: s.n - room });
  }
  merged.sort((a, b) => ORDER.indexOf(ITEMS[a.id].group) - ORDER.indexOf(ITEMS[b.id].group) || ITEMS[a.id].name.localeCompare(ITEMS[b.id].name));
  for (let i = HOTBAR; i < BAG_SIZE; i++) bag()[i] = merged[i - HOTBAR] ?? null;
  changed();
}
