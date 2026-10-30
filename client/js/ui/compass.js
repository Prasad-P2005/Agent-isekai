// The compass along the top of the screen: which way you face, and where everything you are after lies from here.
// Everything on the tape is placed from its middle in whole art pixels. What is past either end waits at that end.
import { G } from '../core/state.js';
import { questMarks } from '../sim/marks.js';
import { player } from '../sim/player.js';
import { esc, icon, markIcon } from './art.js';

const $ = id => document.getElementById(id);
const PER_RADIAN = 240 / Math.PI;           // art pixels; the ticks in style.css are 20 apart, so one every 15 degrees
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const END = 9;                              // art pixels a pin keeps from the end of the tape
const TOWN_FROM = 30, TOWN_RANGE = 160;     // the town you are in has no direction, and far ones are the minimap's business
const TOWN_HANDICAP = 0.35;                 // radians: a town only takes the caption when it is this much closer to dead ahead

const tape = $('compasstape');
const points = POINTS.map((name, i) => {
  const el = document.createElement('div');
  el.className = `compassmark point${i % 2 ? '' : ' cardinal'}${i ? '' : ' north'}`;
  el.textContent = name;
  tape.append(el);
  return el;
});
const pins = new Map(); // mark id -> its element on the tape
let unit = 2, width = 0, shown = false, caption = '';

const turn = a => Math.atan2(Math.sin(a), Math.cos(a)); // any angle as the shortest turn, left negative
const across = a => Math.round(width / 2) + Math.round(a * PER_RADIAN) * unit;
function slide(el, x) {
  if (el.placedAt === x) return;
  el.placedAt = x;
  el.style.transform = `translateX(${x}px)`;
}
function pinFor(m) {
  if (!pins.has(m.id)) {
    const el = document.createElement('div');
    el.className = `compassmark pin ${m.sort}`;
    el.innerHTML = icon(markIcon(m));
    tape.append(el);
    pins.set(m.id, el);
  }
  return pins.get(m.id);
}
function nearbyTowns(x, z) {
  return G.world.settlements.map(S => ({ id: `town:${S.id}`, sort: 'town', label: S.name, x: S.cx, z: S.cz, dist: Math.hypot(S.cx - x, S.cz - z) }))
    .filter(t => t.dist > TOWN_FROM && t.dist < TOWN_RANGE);
}
function writeCaption(m) {
  const html = m ? `${icon(markIcon(m))}${esc(m.label)} <b>${Math.round(m.dist)}m</b>` : '';
  if (html !== caption) $('compassnote').innerHTML = caption = html;
}
function draw() {
  const { x, z } = player.pos, heading = -player.yaw, end = END * unit; // yaw turns the other way round from a compass
  tape.style.backgroundPositionX = `${across(turn(-heading))}px`;
  points.forEach((el, i) => slide(el, across(turn(i * Math.PI / 4 - heading))));
  const left = new Set(pins.keys());
  let ahead = null, best = Infinity;
  for (const m of [...nearbyTowns(x, z), ...questMarks()]) {
    const a = turn(Math.atan2(m.x - x, z - m.z) - heading), at = across(a), held = Math.max(end, Math.min(width - end, at)), el = pinFor(m);
    left.delete(m.id);
    slide(el, held);
    el.classList.toggle('past', held !== at);
    const rank = Math.abs(a) + (m.sort === 'town' ? TOWN_HANDICAP : 0);
    if (rank < best) { best = rank; ahead = m; }
  }
  for (const id of left) { pins.get(id).remove(); pins.delete(id); }
  writeCaption(ahead);
}
function fit() {
  unit = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px'));
  width = tape.clientWidth;
}
addEventListener('resize', fit);

export function updateCompass() {
  if (!player.ready) return;
  if (!shown) { shown = true; $('compass').style.display = 'block'; fit(); }
  draw();
}
