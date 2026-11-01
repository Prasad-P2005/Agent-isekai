// The settings pages of the book: how the game looks and sounds, what shaders do, which key does what, and what is on the screen. The pages are drawn from the lists in core/settings.js and core/bindings.js.
import { ACTIONS, bindings, canBind, keyName, rebind, resetBindings } from '../core/bindings.js';
import { on } from '../core/events.js';
import { OPTIONS, PRESET_NAMES, applyPreset, presetHolds, resetSettings, setSetting, settings } from '../core/settings.js';
import { esc } from './art.js';
import { definePage, openPage } from './panels.js';
import { mouse, setMouseSpeed } from './pointer.js';

const $ = id => document.getElementById(id);
const SECTIONS = [['graphics', 'Graphics'], ['shaders', 'Shaders'], ['sound', 'Sound'], ['controls', 'Controls'], ['screen', 'Screen'], ['access', 'Access']];
const SETTLE = new Set(['renderDistance', 'renderScale']); // these rebuild things, so they wait for the slider to be let go
let section = null, waiting = null;

const sectionNav = () => `<nav class="subtabs">${SECTIONS.map(([id, label]) => `<button type="button" data-section="${id}"${id === section ? ' class="gold"' : ''}>${label}</button>`).join('')}</nav>`;
const shown = o => (o.choices ? o.choices.find(([v]) => v === settings[o.id])?.[1] ?? '' : `${settings[o.id]}${o.unit ?? ''}`);
function optionHTML(o) {
  const about = o.about ? `<small>${esc(o.about)}${o.heavy ? '. Rebuilds the world' : ''}</small>` : '';
  const head = `<span class="what">${esc(o.label)}${about}</span>`;
  if (o.choices) return `<div class="option">${head}<div class="choices">${o.choices.map(([v, label]) => `<button type="button" data-option="${o.id}" data-value="${v}"${settings[o.id] === v ? ' class="gold"' : ''}>${label}</button>`).join('')}</div></div>`;
  return `<div class="option">${head}<span class="optvalue" data-shows="${o.id}">${shown(o)}</span><input type="range" data-option="${o.id}" aria-label="${esc(o.label)}" min="${o.min}" max="${o.max}" step="${o.step}" value="${settings[o.id]}"></div>`;
}
const groupHTML = (name, list) => `<div><h3>${esc(name)}</h3>${list.map(optionHTML).join('')}</div>`;
const presetsHTML = page => !PRESET_NAMES[page] ? '' : `<div><h3>Presets</h3><div class="choices">${PRESET_NAMES[page].map(([id, label]) => `<button type="button" data-preset="${id}"${presetHolds(id) ? ' class="gold"' : ''}>${label}</button>`).join('')}</div></div>`;
const groupsOf = page => {
  const groups = new Map();
  for (const o of OPTIONS) if (o.page === page) { if (!groups.has(o.group)) groups.set(o.group, []); groups.get(o.group).push(o); }
  return [...groups];
};
// The groups fill the left page and then the right, keeping about the same number of options on each.
function renderOptions(page) {
  section = page;
  const groups = groupsOf(page), total = OPTIONS.filter(o => o.page === page).length, left = [], right = [];
  let placed = 0;
  for (const g of groups) { (placed < total * 0.45 ? left : right).push(g); placed += g[1].length; }
  const keep = [$('pageleft').scrollTop, $('pageright').scrollTop];
  $('paneltitle').textContent = 'Settings';
  $('pageleft').innerHTML = sectionNav() + presetsHTML(page) + left.map(([name, list]) => groupHTML(name, list)).join('');
  $('pageright').innerHTML = right.map(([name, list]) => groupHTML(name, list)).join('') + `<button type="button" data-reset="${page}">Back to defaults</button>`;
  [$('pageleft').scrollTop, $('pageright').scrollTop] = keep;
}

const keyRow = a => `<button type="button" class="keyrow${waiting === a.id ? ' waiting' : ''}" data-action="${a.id}"><span>${esc(a.label)}</span><kbd>${waiting === a.id ? 'Press a key' : esc(keyName(bindings[a.id][0]))}</kbd></button>`;
const keyGroup = name => `<div><h3>${name}</h3>${ACTIONS.filter(a => a.group === name).map(keyRow).join('')}</div>`;
function renderControls() {
  section = 'controls';
  const keep = [$('pageleft').scrollTop, $('pageright').scrollTop];
  $('paneltitle').textContent = 'Settings';
  $('pageleft').innerHTML = `${sectionNav()}${keyGroup('Moving')}<p class="note">Left click attacks or mines and right click uses what is in your hand. 1 to 9 pick a hotbar slot, and Esc closes a menu or pauses.</p>`;
  $('pageright').innerHTML = `<div><h3>Mouse</h3><div class="option"><span class="what">Mouse speed</span><span class="optvalue" id="mouseshown">${mouse.speed.toFixed(1)}</span><input id="mousespeed" type="range" aria-label="Mouse speed" min="0.4" max="2.2" step="0.1" value="${mouse.speed}"></div>${OPTIONS.filter(o => o.page === 'controls').map(optionHTML).join('')}</div>${keyGroup('Doing')}${keyGroup('Menus')}<button type="button" data-reset="controls">Back to defaults</button>`;
  [$('pageleft').scrollTop, $('pageright').scrollTop] = keep;
}
const leave = () => { waiting = null; section = null; };
for (const [page] of SECTIONS) definePage(page, { tab: 'graphics', render: page === 'controls' ? renderControls : () => renderOptions(page), leave });

const redraw = () => { if (section === 'controls') renderControls(); else if (section) renderOptions(section); };
const inPages = e => e.target.closest('#pageleft, #pageright');
document.addEventListener('click', e => {
  if (!inPages(e)) return;
  const b = e.target.closest('button');
  if (!b || !section) return;
  if (b.dataset.section) { openPage(b.dataset.section); return; }
  if (b.dataset.preset) { applyPreset(b.dataset.preset); redraw(); return; }
  if (b.dataset.reset === 'controls') { resetBindings(); resetSettings('controls'); setMouseSpeed(1); redraw(); return; }
  if (b.dataset.reset) { resetSettings(b.dataset.reset); redraw(); return; }
  if (b.dataset.action) { waiting = b.dataset.action; redraw(); return; }
  if (b.dataset.option) { setSetting(b.dataset.option, Number(b.dataset.value)); redraw(); }
});
function slide(e, final) {
  if (e.target.id === 'mousespeed') { setMouseSpeed(Number(e.target.value)); $('mouseshown').textContent = mouse.speed.toFixed(1); return; }
  const id = e.target.dataset?.option;
  if (!id || e.target.type !== 'range') return;
  const o = OPTIONS.find(x => x.id === id), value = Number(e.target.value);
  document.querySelector(`[data-shows="${id}"]`).textContent = `${value}${o.unit ?? ''}`;
  if (!SETTLE.has(id) || final) { setSetting(id, value); for (const b of document.querySelectorAll('[data-preset]')) b.classList.toggle('gold', presetHolds(b.dataset.preset)); }
}
document.addEventListener('input', e => { if (inPages(e)) slide(e, false); });
document.addEventListener('change', e => { if (inPages(e)) slide(e, true); });

// The next key belongs to whatever is waiting for one, before anything else in the game sees it. Esc gives up.
addEventListener('keydown', e => {
  if (!waiting) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const action = waiting;
  waiting = null;
  if (e.code !== 'Escape' && canBind(e.code)) rebind(action, e.code);
  redraw();
}, true);

on('look:changed', () => { if (section === 'shaders') redraw(); });
on('settings:changed', moved => { if (moved.includes('fullscreen')) redraw(); }); // Esc can end full screen while the page is open
