// The world map: a page of the book that fills the window. The terrain is surveyed once, a row at a time, with the
// towns drawn onto it from their layouts. The canvas holds that sheet; names and sprites sit over it as elements.
import { G } from '../core/state.js';
import { questMarks } from '../sim/marks.js';
import { player } from '../sim/player.js';
import { mapColour, surveyRow } from '../sim/survey.js';
import { LAND, REALM, landName, landOf } from '../sim/terrain.js';
import { esc, icon, markIcon } from './art.js';
import { definePage, togglePage } from './panels.js';

const $ = id => document.getElementById(id);
const MARGIN = 32;                     // blocks of open sea around the lands; the player can sail 20 out
const ZOOMS = [1, 1.5, 2, 3, 4, 6, 8]; // screen pixels per block: whole numbers keep the blocks square
const CLOSE_ZOOM = 3;                  // from here in, the realms' names give way to the towns
const PAN_SPEED = 600;                 // pixels a second with the keys
const WHEEL_STEP = 60;                 // scrolling this far is one step of zoom, whatever the device sends
const SURVEY_MS = { open: 10, closed: 1 }; // quietly while you play, quickly if you are waiting for it
const GRID = 'rgba(46, 45, 63, .16)';
const HINT = 'Drag to move. Scroll to zoom.';
const LANDMARKS = {
  treehouse_grove: ['grove', 'Treehouse grove'], crystal_spire: ['crystal', 'Crystal spire'], demon_castle: ['demon', "The Demon Lord's castle"],
  mermaid_palace: ['palace', 'Mermaid palace'], ruins: ['ruins', 'Ruins'],
};
// Block ids, as settlementChunk in sim/terrain.js builds them. `walled` is where the city wall runs, in blocks from the centre.
const TOWNS = {
  city: { road: 29, roof: 20, wall: 19, walled: [28.5, 29.5] },
  elfcity: { road: 15, roof: 9, wall: 8, walled: [26.5, 28] },
  human: { road: 29, roof: 20 },
  beast: { road: 25, roof: 23 },
  elf: { roof: 9 },
};
const ROAD_REACH = 27, TOWN_REACH = 30;
const FOOTPRINT = { treehouse: 6, shrine: 6, palace: 7, keep: 4, stall: 2, street_stall: 1, well: 1 }; // half widths in blocks; the rest are about 3

const canvas = $('worldcanvas'), ctx = canvas.getContext('2d');
let sheet = null, sheetCtx = null, world = 0, side = 0, rows = 0; // the surveyed world and how much of it is done
let width = 0, height = 0, fitZoom = 1, marks = [];
const view = { x: 0, z: 0, zoom: 1 }; // the block at the middle of the window
let opened = false, dirty = false, drag = null, wheel = 0;

// ---------- the sheet ----------
function startSheet() {
  world = G.world.lands.length * LAND;
  side = world + 2 * MARGIN;
  sheet = document.createElement('canvas');
  sheet.width = sheet.height = side;
  sheetCtx = sheet.getContext('2d');
}
function paintTown(S) {
  const { road, roof, wall, walled } = TOWNS[S.type] ?? TOWNS.human;
  const roadColour = road == null ? null : mapColour(road), wallColour = walled ? mapColour(wall) : null;
  for (let dx = -TOWN_REACH; dx <= TOWN_REACH; dx++) for (let dz = -TOWN_REACH; dz <= TOWN_REACH; dz++) {
    const d = Math.hypot(dx, dz);
    const colour = walled && d >= walled[0] && d < walled[1] ? wallColour : roadColour && d < ROAD_REACH && (Math.abs(dx) <= 1 || Math.abs(dz) <= 1) ? roadColour : null;
    if (!colour) continue;
    sheetCtx.fillStyle = colour;
    sheetCtx.fillRect(S.cx + dx + MARGIN, S.cz + dz + MARGIN, 1, 1);
  }
  const lit = mapColour(roof, 1.1), shade = mapColour(roof, 0.7);
  for (const b of S.layout) {
    const r = FOOTPRINT[b.kind] ?? 3, x = b.x - r + MARGIN, z = b.z - r + MARGIN, size = 2 * r + 1;
    sheetCtx.fillStyle = shade; sheetCtx.fillRect(x, z, size, size);
    sheetCtx.fillStyle = lit; sheetCtx.fillRect(x, z, size - 1, size - 1);
  }
}
function survey(deadline) {
  do {
    sheetCtx.putImageData(new ImageData(surveyRow(rows - MARGIN, -MARGIN, side), side, 1), 0, rows);
    rows++;
  } while (rows < side && performance.now() < deadline);
  if (rows === side) G.world.settlements.forEach(paintTown);
  if (!opened) return;
  dirty = true;
  $('mapreadout').textContent = rows < side ? `Charting the world… ${Math.floor(100 * rows / side)}%` : HINT;
}

// ---------- the view ----------
function moveTo(x, z) {
  const middle = world / 2, room = span => Math.max(0, side / 2 - span / (2 * view.zoom));
  view.x = Math.max(middle - room(width), Math.min(middle + room(width), x));
  view.z = Math.max(middle - room(height), Math.min(middle + room(height), z));
  dirty = true;
}
function zoomTo(zoom, atX = width / 2, atY = height / 2) { // the block under (atX, atY) stays where it is
  const x = view.x + (atX - width / 2) / view.zoom, z = view.z + (atY - height / 2) / view.zoom;
  view.zoom = zoom;
  moveTo(x - (atX - width / 2) / zoom, z - (atY - height / 2) / zoom);
}
function stepZoom(by, atX, atY) {
  const levels = [fitZoom, ...ZOOMS.filter(z => z > fitZoom)], at = levels.indexOf(view.zoom);
  zoomTo(levels[Math.max(0, Math.min(levels.length - 1, at + by))], atX, atY);
}
function showWorld() { view.zoom = fitZoom; moveTo(world / 2, world / 2); }
function showSpot(x, z) { view.zoom = Math.max(view.zoom, CLOSE_ZOOM); moveTo(x, z); }
// Setting a canvas's size resets its context.
function fit() {
  width = canvas.width = canvas.clientWidth;
  height = canvas.height = canvas.clientHeight;
  ctx.imageSmoothingEnabled = false;
  const whole = Math.min(width, height) / side;
  fitZoom = ZOOMS.findLast(z => z <= whole) ?? whole;
}
function draw() {
  dirty = false;
  const k = view.zoom, left = Math.round(width / 2 - (view.x + MARGIN) * k), top = Math.round(height / 2 - (view.z + MARGIN) * k), size = side * k;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(sheet, left, top, size, size);
  ctx.fillStyle = GRID;
  for (let at = MARGIN; at <= side - MARGIN; at += LAND) {
    ctx.fillRect(left + Math.round(at * k), top, 1, size);
    ctx.fillRect(left, top + Math.round(at * k), size, 1);
  }
  for (const m of marks) m.el.style.transform = `translate(${left + Math.round((m.x + MARGIN) * k)}px,${top + Math.round((m.z + MARGIN) * k)}px)`;
  $('mapmarks').toggleAttribute('data-far', k < CLOSE_ZOOM);
}

// ---------- what sits on the map ----------
const mark = (x, z, kind, inner) => `<div class="mapmark ${kind}" data-x="${x}" data-z="${z}">${inner}</div>`;
function townMark(S) {
  const capital = S.type === 'city' || S.type === 'elfcity';
  return mark(S.cx, S.cz, capital ? 'capital' : '', `${icon(capital ? 'castle' : 'house')}<span>${esc(S.name)}</span>`);
}
const questMark = m => mark(m.x, m.z, 'goal', `<span>${esc(m.label)}</span>${icon(markIcon(m))}`);
const questRow = m => `<button type="button" data-x="${m.x}" data-z="${m.z}">${icon(markIcon(m))}${esc(m.label)}<span>${Math.round(m.dist)}m</span></button>`;
function landmarkMarks() {
  return G.world.lands.flatMap((row, z) => row.map((land, x) => {
    const sight = LANDMARKS[land.structure];
    return sight ? mark((x + 0.5) * LAND, (z + 0.5) * LAND, '', icon(sight[0])) : '';
  }));
}
// A realm's name goes on its most central land that has no town on it.
function realmMarks() {
  const realms = {};
  G.world.lands.forEach((row, z) => row.forEach((land, x) => (realms[land.realm] ??= []).push({ x, z, open: land.settlement == null })));
  return Object.values(realms).map(lands => {
    const midX = lands.reduce((sum, l) => sum + l.x, 0) / lands.length, midZ = lands.reduce((sum, l) => sum + l.z, 0) / lands.length;
    const away = l => Math.hypot(l.x - midX, l.z - midZ), free = lands.filter(l => l.open);
    const seat = (free.length ? free : lands).reduce((best, l) => (away(l) < away(best) ? l : best));
    const x = (seat.x + 0.5) * LAND, z = (seat.z + 0.5) * LAND;
    return mark(x, z, 'realmname', `<span>${esc(REALM[landOf(x, z).b][0])}</span>`);
  });
}
function playerMark() {
  const facing = Math.atan2(-Math.cos(player.yaw), -Math.sin(player.yaw));
  return mark(player.pos.x, player.pos.z, 'you', `<i class="ic ic-arrow" style="transform:rotate(${facing}rad) translateX(calc(var(--u) * 11))" aria-hidden="true"></i>${icon('you')}`);
}
function placeMarks(quests) {
  $('mapmarks').innerHTML = [...realmMarks(), ...landmarkMarks(), ...G.world.settlements.map(townMark), ...quests.map(questMark), playerMark()].join('');
  marks = [...$('mapmarks').children].map(el => ({ el, x: +el.dataset.x, z: +el.dataset.z }));
}
function renderMap() {
  const L = landOf(player.pos.x, player.pos.z), quests = questMarks();
  opened = true;
  $('paneltitle').textContent = 'World map';
  $('mapname').textContent = G.world.name;
  $('mapwhere').textContent = `You are in ${landName(L)}, ${REALM[L.b][1]}`;
  $('mapgoal').innerHTML = G.objective ? `${icon('flag')}${esc(G.objective)}` : '';
  $('mapquests').innerHTML = quests.map(questRow).join('');
  $('mapreadout').textContent = HINT;
  placeMarks(quests);
  fit();
  showWorld();
}
definePage('map', { tab: 'map', view: 'map', render: renderMap, leave() { opened = false; drag = null; } });

// ---------- moving around ----------
function showPlace(e) {
  const x = view.x + (e.offsetX - width / 2) / view.zoom, z = view.z + (e.offsetY - height / 2) / view.zoom, L = landOf(x, z);
  $('mapreadout').textContent = `${landName(L)}, ${LANDMARKS[L.structure]?.[1] ?? REALM[L.b][1]}, at ${Math.floor(x)}, ${Math.floor(z)}`;
}
canvas.addEventListener('pointerdown', e => {
  drag = { x: e.offsetX, z: e.offsetY, fromX: view.x, fromZ: view.z };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add('dragging');
});
canvas.addEventListener('pointermove', e => {
  if (drag) moveTo(drag.fromX - (e.offsetX - drag.x) / view.zoom, drag.fromZ - (e.offsetY - drag.z) / view.zoom);
  else showPlace(e);
});
function drop() { drag = null; canvas.classList.remove('dragging'); }
canvas.addEventListener('pointerup', drop);
canvas.addEventListener('pointercancel', drop);
canvas.addEventListener('pointerleave', () => { if (!drag) $('mapreadout').textContent = HINT; });
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  e.stopPropagation(); // the hotbar listens for the wheel too
  wheel += e.deltaY;
  if (Math.abs(wheel) < WHEEL_STEP) return;
  stepZoom(wheel < 0 ? 1 : -1, e.offsetX, e.offsetY);
  wheel = 0;
}, { passive: false });
addEventListener('keydown', e => {
  if (!opened) return;
  if (e.code === 'Equal' || e.code === 'NumpadAdd') stepZoom(1);
  if (e.code === 'Minus' || e.code === 'NumpadSubtract') stepZoom(-1);
});
addEventListener('resize', () => { if (opened) { fit(); view.zoom = Math.max(view.zoom, fitZoom); moveTo(view.x, view.z); } });
$('mapzoomin').addEventListener('click', () => stepZoom(1));
$('mapzoomout').addEventListener('click', () => stepZoom(-1));
$('mapall').addEventListener('click', showWorld);
$('mapfind').addEventListener('click', () => showSpot(player.pos.x, player.pos.z));
$('mapquests').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showSpot(+b.dataset.x, +b.dataset.z); });
$('maptoggle').addEventListener('click', () => togglePage('map'));

function panWithKeys(dt) {
  const k = G.keys, dx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0), dz = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
  if (dx || dz) moveTo(view.x + dx * PAN_SPEED * dt / view.zoom, view.z + dz * PAN_SPEED * dt / view.zoom);
}
export function updateWorldMap(dt) {
  if (!sheet) startSheet();
  if (rows < side) survey(performance.now() + (opened ? SURVEY_MS.open : SURVEY_MS.closed));
  if (!opened) return;
  panWithKeys(dt);
  if (dirty) draw();
}
