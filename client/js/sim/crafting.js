// Recipes, from content/recipes.json. Shaped ones may sit anywhere on a grid and be mirrored left to right, as in Minecraft. Hand recipes work on every grid.
import { ITEMS, RECIPES } from '../core/content.js';
import { creative } from '../core/state.js';
import { addItem, bag, countItem, hasRoom, takeItem } from './inventory.js';

const REPAIR_SHARE = 0.25;
export const GRIDS = { hand: { size: 2, at: ['hand'] }, table: { size: 3, at: ['hand', 'table'] }, anvil: { size: 3, at: ['anvil'] }, alchemy: { size: 3, at: ['alchemy'] } };
const onGrid = RECIPES.filter(r => r.shape || r.of);
export const smelting = RECIPES.filter(r => r.in);

// What is on a grid, trimmed to the box around it.
function trim(grid, size) {
  let x0 = size, y0 = size, x1 = -1, y1 = -1;
  grid.forEach((s, i) => { if (!s) return; const x = i % size, y = Math.floor(i / size); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
  if (x1 < 0) return null;
  const rows = [];
  for (let y = y0; y <= y1; y++) { const row = []; for (let x = x0; x <= x1; x++) row.push(grid[x + y * size]?.id ?? null); rows.push(row); }
  return rows;
}
function fits(recipe, rows) {
  const shape = recipe.shape;
  if (shape.length !== rows.length || shape[0].length !== rows[0].length) return false;
  const want = (x, y, flip) => { const c = shape[y][flip ? shape[0].length - 1 - x : x]; return c === '.' ? null : recipe.keys[c]; };
  return [false, true].some(flip => rows.every((row, y) => row.every((id, x) => id === want(x, y, flip))));
}
const sameItems = (a, b) => a.length === b.length && [...a].sort().every((id, i) => id === [...b].sort()[i]);
export function matchGrid(grid, kind) {
  const { size, at } = GRIDS[kind], rows = trim(grid, size);
  if (!rows) return null;
  if (kind === 'anvil') { const fix = repairOf(grid); if (fix) return fix; }
  const items = grid.filter(Boolean).map(s => s.id);
  for (const r of onGrid) {
    if (!at.includes(r.at)) continue;
    if (r.of ? sameItems(r.of, items) : fits(r, rows)) return r;
  }
  return null;
}
// A worn tool and a unit of what it is made of, and nothing else.
function repairOf(grid) {
  const used = grid.filter(Boolean);
  if (used.length !== 2) return null;
  const tool = used.find(s => s.dur && s.dur < ITEMS[s.id].dur), unit = used.find(s => s !== tool);
  if (!tool || !unit || ITEMS[tool.id].unit !== unit.id) return null;
  return { repair: true, out: tool.id, n: 1, dur: Math.min(ITEMS[tool.id].dur, tool.dur + Math.ceil(ITEMS[tool.id].dur * REPAIR_SHARE)) };
}
// Takes one of each thing off the grid. A recipe's result is the caller's to hand over.
export function useGrid(grid) { grid.forEach((s, i) => { if (s && --s.n <= 0) grid[i] = null; }); }

// ---------- what a recipe needs, for the book ----------
const cache = new Map();
export function needs(r) {
  if (cache.has(r)) return cache.get(r);
  const out = {}, add = id => { out[id] = (out[id] ?? 0) + 1; };
  if (r.of) r.of.forEach(add); else if (r.in) r.in.forEach(add);
  else for (const row of r.shape) for (const c of row) if (c !== '.') add(r.keys[c]);
  cache.set(r, out);
  return out;
}
export const timesCanMake = r => { if (creative()) return ITEMS[r.out].stack; return Math.min(...Object.entries(needs(r)).map(([id, n]) => Math.floor(countItem(id) / n))); };
export const isKnown = (r, seen) => creative() || seen.includes(r.out) || Object.keys(needs(r)).some(id => seen.includes(id));
export const recipesAt = kind => (kind === 'all' ? RECIPES : RECIPES.filter(r => (kind in GRIDS ? GRIDS[kind].at.includes(r.at) : r.at === kind)));
// Straight from the bag, for shift-click in the book.
export function craftFromBag(r, times) {
  let made = 0;
  for (; made < times; made++) {
    if (!creative() && timesCanMake(r) < 1) break;
    if (!hasRoom(r.out, r.n)) break;
    if (!creative()) for (const [id, n] of Object.entries(needs(r))) takeItem(id, n);
    addItem(r.out, r.n);
  }
  return made;
}
// Moves one recipe's worth from the bag onto a grid, or says that it could not. Mirrors nothing and centres what fits.
export function layOnGrid(r, grid, kind) {
  const { size } = GRIDS[kind];
  if (grid.some(Boolean)) return false;
  if (!creative() && timesCanMake(r) < 1) return false;
  const lay = (i, id) => { if (!creative()) takeItem(id, 1); const it = bag().find(s => s?.id === id); grid[i] = { id, n: 1, ...(ITEMS[id].dur ? { dur: it?.dur ?? ITEMS[id].dur } : {}) }; };
  if (r.shape) r.shape.forEach((row, y) => [...row].forEach((c, x) => { if (c !== '.') lay(x + y * size, r.keys[c]); }));
  else r.of.forEach((id, i) => lay(i, id));
  return true;
}
