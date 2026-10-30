// The map in the corner, always on: the loaded world from above, north up, with you at the centre.
import { on } from '../core/events.js';
import { G } from '../core/state.js';
import { chunks, neighboursLoaded } from '../sim/chunks.js';
import { ents } from '../sim/entities.js';
import { questMarks } from '../sim/marks.js';
import { player } from '../sim/player.js';
import { mapRole, surveyChunk } from '../sim/survey.js';
import { CS, REALM, chunkKey as key, landName, landOf } from '../sim/terrain.js';

const $ = id => document.getElementById(id);
const RADIUS = 60;                           // blocks from the centre to the rim, all inside the loaded chunks
const SPAN = Math.ceil(2 * RADIUS / CS) + 2; // chunks on the ground layer, which moves a whole chunk at a time
const REDRAW = 1 / 30, SURVEYS_PER_DRAW = 12;
const POINTER_RANGE = 160;                   // settlements further off than this get no pointer on the rim
const VIEW_ANGLE = 0.75, VIEW_REACH = 0.32;  // half the view cone in radians, and its length as a share of the map
const DOT = { foe: ['#ff5a4d', 3], notable: ['#ffd36b', 2.6], folk: ['#f4efe4', 2] };
const QUEST = '#fac13c', QUEST_SIZE = 5.5;

const canvas = $('minimap'), ctx = canvas.getContext('2d');
const ground = document.createElement('canvas'), groundCtx = ground.getContext('2d');
ground.width = ground.height = SPAN * CS;
const tiles = new Map(); // chunk key -> its survey, ready to lay down
const laid = new Set();  // chunks on the ground layer now
let originX = 0, originZ = 0; // the chunk in the layer's top left corner
let size = 0, viewFade = null, shown = false, wait = 0, place = '';

function forget(k) { tiles.delete(k); laid.delete(k); }
on('chunk:unloaded', forget);
// Shading looks north and west, so a change can also show in the chunks to the south and east.
on('chunk:edited', ({ cx, cz }) => { forget(key(cx, cz)); forget(key(cx + 1, cz)); forget(key(cx, cz + 1)); });

function layGround(pcx, pcz) {
  const ox = pcx - (SPAN >> 1), oz = pcz - (SPAN >> 1);
  if (ox !== originX || oz !== originZ) {
    originX = ox; originZ = oz;
    laid.clear();
    groundCtx.clearRect(0, 0, ground.width, ground.height);
  }
  let surveys = SURVEYS_PER_DRAW;
  for (let cx = ox; cx < ox + SPAN; cx++) for (let cz = oz; cz < oz + SPAN; cz++) {
    const k = key(cx, cz), ch = chunks.get(k);
    if (laid.has(k) || !ch || !neighboursLoaded(cx, cz)) continue;
    if (!tiles.has(k)) {
      if (!surveys) continue;
      surveys--;
      tiles.set(k, new ImageData(surveyChunk(ch), CS, CS));
    }
    groundCtx.putImageData(tiles.get(k), (cx - ox) * CS, (cz - oz) * CS);
    laid.add(k);
  }
}

function drawPointer(dx, dz, d, alpha) { // something off the map: an arrow on the rim
  const rim = size / 2 - 9;
  ctx.save();
  ctx.translate(size / 2 + dx / d * rim, size / 2 + dz / d * rim);
  ctx.rotate(Math.atan2(dz, dx));
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-3, -5); ctx.lineTo(-3, 5); ctx.closePath();
  ctx.stroke(); ctx.fill();
  ctx.restore();
}
function drawName(S, x, y) {
  const half = ctx.measureText(S.name).width / 2 + 8, labelX = Math.max(half, Math.min(size - half, x));
  ctx.lineWidth = 3;
  ctx.strokeText(S.name, labelX, y);
  ctx.fillText(S.name, labelX, y);
}
function drawSettlements(px, pz) {
  const scale = size / (2 * RADIUS);
  ctx.fillStyle = '#f4e3b5'; ctx.strokeStyle = 'rgba(16,20,19,.85)';
  for (const S of G.world.settlements) {
    const dx = S.cx - px, dz = S.cz - pz, d = Math.hypot(dx, dz);
    if (d < RADIUS - 8) drawName(S, size / 2 + dx * scale, size / 2 + dz * scale);
    else if (d < POINTER_RANGE) drawPointer(dx, dz, d, 1 - 0.5 * d / POINTER_RANGE); // fainter the further away it is
  }
}
function drawQuests(px, pz) { // a gold diamond, or a full arrow on the rim however far away it is
  const scale = size / (2 * RADIUS), r = QUEST_SIZE;
  ctx.fillStyle = QUEST; ctx.strokeStyle = 'rgba(16,20,19,.85)'; ctx.lineWidth = 1.5;
  for (const m of questMarks()) {
    const dx = m.x - px, dz = m.z - pz, x = size / 2 + dx * scale, y = size / 2 + dz * scale;
    if (m.dist >= RADIUS - 8) { drawPointer(dx, dz, m.dist, 1); continue; }
    ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
}
function drawBeings(px, pz) {
  const scale = size / (2 * RADIUS);
  ctx.strokeStyle = 'rgba(16,20,19,.8)'; ctx.lineWidth = 1;
  for (const e of ents) {
    const dx = e.pos.x - px, dz = e.pos.z - pz;
    if (Math.hypot(dx, dz) > RADIUS - 3) continue;
    const [colour, r] = DOT[mapRole(e)];
    ctx.fillStyle = colour;
    ctx.beginPath(); ctx.arc(size / 2 + dx * scale, size / 2 + dz * scale, r, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
}
function drawPlayer() {
  const up = -Math.PI / 2;
  ctx.save();
  ctx.translate(size / 2, size / 2);
  ctx.rotate(-player.yaw); // yaw 0 faces north, and yaw turns the other way round from the canvas
  ctx.fillStyle = viewFade;
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, size * VIEW_REACH, up - VIEW_ANGLE, up + VIEW_ANGLE); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe08a'; ctx.strokeStyle = '#342d20'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 6.5); ctx.lineTo(0, 3.5); ctx.lineTo(-5.5, 6.5); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawCaption(x, z) {
  const L = landOf(x, z), name = landName(L);
  if (name === place) return;
  place = name;
  $('mapplace').textContent = name;
  $('maprealm').textContent = REALM[L.b][1];
}
function draw() {
  const { x, z } = player.pos;
  layGround(Math.floor(x / CS), Math.floor(z / CS));
  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(ground, x - originX * CS - RADIUS, z - originZ * CS - RADIUS, 2 * RADIUS, 2 * RADIUS, 0, 0, size, size);
  drawSettlements(x, z);
  drawBeings(x, z);
  drawQuests(x, z);
  drawPlayer();
  drawCaption(x, z);
}

// Setting a canvas's size resets its context, so everything the drawing relies on is set here.
function fit() {
  size = canvas.clientWidth;
  const pixels = Math.min(devicePixelRatio, 2);
  canvas.width = canvas.height = Math.round(size * pixels);
  ctx.setTransform(pixels, 0, 0, pixels, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.font = '20px Jersey, Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  viewFade = ctx.createRadialGradient(0, 0, 0, 0, 0, size * VIEW_REACH);
  viewFade.addColorStop(0, 'rgba(255,224,138,.42)');
  viewFade.addColorStop(1, 'rgba(255,224,138,0)');
}
addEventListener('resize', fit);

export function updateMinimap(dt) {
  if (!player.ready) return;
  if (!shown) { shown = true; $('maptoggle').style.display = 'block'; fit(); }
  wait -= dt;
  if (wait > 0) return;
  wait = REDRAW;
  draw();
}
