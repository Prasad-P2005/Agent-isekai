// The heads-up display: the dock, toasts, the quest note and the land banner.
import { keyOf, spellKey } from '../core/bindings.js';
import { G, creative, isPaused } from '../core/state.js';
import { ABILITIES, SERVICES } from '../core/content.js';
import { on } from '../core/events.js';
import { ents } from '../sim/entities.js';
import { miningBar } from '../sim/mining.js';
import { nearestTalker } from '../sim/people.js';
import { maxHp, maxMana, player } from '../sim/player.js';
import { REALM, landName } from '../sim/terrain.js';
import { drawn } from '../view/chunkmesh.js';
import { shadersActive } from '../view/pipeline.js';
import { renderer, scaleNow } from '../view/scene.js';
import { isUnderwater, sunHeight } from '../view/world.js';
import { esc, icon, power, rich } from './art.js';

const $ = id => document.getElementById(id);
const NIGHT_SUN = -0.1, LOW_HP = 0.25;
const TOASTS_SHOWN = 3, TOAST_FADE = 0.4, PROMPT_EVERY = 0.15, ACT_CARD_MS = 3500;

// ---------- toasts ----------
const toasts = [];
on('toast', ({ text, seconds }) => {
  const html = rich(text), repeat = toasts.find(t => t.html === html);
  if (repeat) { repeat.left = seconds; repeat.el.style.opacity = 1; return; }
  const el = document.createElement('div');
  el.className = 'toastline';
  el.innerHTML = html;
  $('toast').append(el);
  toasts.push({ el, html, left: seconds });
  if (toasts.length > TOASTS_SHOWN) toasts.shift().el.remove();
});
function updateToasts(dt) {
  for (const t of toasts.slice()) {
    t.left -= dt;
    if (t.left < TOAST_FADE) t.el.style.opacity = Math.max(0, t.left / TOAST_FADE);
    if (t.left <= 0) { t.el.remove(); toasts.splice(toasts.indexOf(t), 1); }
  }
}
on('player:hurt', () => { $('hurt').style.opacity = 1; setTimeout(() => { $('hurt').style.opacity = 0; }, 180); });

// ---------- the land banner ----------
let realmT = 0;
on('land:entered', ({ land }) => {
  $('realm').innerHTML = `${esc(landName(land))}<small>${REALM[land.b][1]}</small>`;
  $('realm').style.opacity = 1; realmT = 4;
});

// ---------- the dock ----------
// The HUD is rebuilt every frame but rarely changes, and assigning innerHTML reparses it even when
// the text is the same, so the DOM is only touched when a value really is different.
const written = {};
function write(id, prop, value) {
  if (written[id + prop] === value) return;
  written[id + prop] = value;
  if (prop === 'width' || prop === 'display') $(id).style[prop] = value; else $(id)[prop] = value;
}
let debugOn = false, frames = 0, fps = 0, fpsT = 0, debugT = 0;
export function toggleDebug() { debugOn = !debugOn; $('hud').style.display = debugOn ? 'block' : 'none'; }
export function toggleHud() { $('hudroot').classList.toggle('hidden'); }
function updateDebug(dt) {
  frames++; fpsT += dt; if (fpsT >= 1) { fps = frames; frames = 0; fpsT = 0; }
  debugT -= dt;
  if (debugT > 0 || !debugOn) return;
  debugT = 0.25;
  const p = player.pos;
  const { calls, triangles } = renderer.info.render;
  $('hud').textContent = `XYZ ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}\n${fps} fps, ${ents.length} beings\n${drawn.chunks} of ${drawn.loaded} chunks drawn, ${calls} calls, ${Math.round(triangles / 1000)}k triangles\nShaders ${shadersActive() ? 'on' : 'off'}, resolution ${Math.round(scaleNow() * 100)}%`;
}
const spellOn = p => p.id === 'mana_ward' && player.wardT > 0;
function spellSlots(P) {
  const free = creative();
  return (P.spells ?? ['', '']).map((id, i) => {
    const p = id ? power(id) : null;
    return `<div class="slot${p && spellOn(p) ? ' sel' : ''}${p && !free && player.mana < p.mana ? ' empty' : ''}" title="${esc(p?.name ?? 'No spell')}"><i class="num">${spellKey(i)}</i>${p ? icon(p.icon) : ''}</div>`;
  }).join('');
}
// The E prompt: what you can do with whoever is in reach, shown before you have to guess.
let promptT = 0;
function updatePrompt(dt) {
  promptT -= dt;
  if (promptT > 0) return;
  promptT = PROMPT_EVERY;
  const npc = isPaused() ? null : nearestTalker(), service = npc?.res?.service ?? npc?.service;
  const free = npc && !npc.talking && !(npc.angryT > 0);
  const verb = npc?.def.stone ? 'Read' : service && !SERVICES[service]?.talk_only ? 'Trade with' : 'Talk to';
  write('prompt', 'innerHTML', free ? `<kbd>${keyOf('talk')}</kbd> ${verb} ${esc(npc.name)}` : '');
}
let shown = false;
export function updateHUD(dt) {
  if (!shown) { shown = true; $('hudroot').classList.add('on'); } // the HUD belongs to the world, not to heaven or the title
  updateToasts(dt);
  write('toast', 'className', G.uiOpen ? 'over-book' : ''); // in play they sit under the compass, and an open book has the top of the screen
  if (realmT > 0) { realmT -= dt; if (realmT <= 0) $('realm').style.opacity = 0; }
  updateDebug(dt);
  updatePrompt(dt);
  write('water', 'display', isUnderwater() && !shadersActive() ? 'block' : 'none');
  write('minebar', 'display', miningBar.shown && !isPaused() ? 'block' : 'none');
  if (miningBar.shown) { $('minefill').style.width = miningBar.progress * 100 + '%'; write('minetext', 'textContent', miningBar.text); }
  write('dayicon', 'className', `ic ic-${sunHeight() < NIGHT_SUN ? 'moon' : 'sun'}`);
  const P = G.profile; if (!P) return;
  write('hpfill', 'width', (100 * player.hp / maxHp()).toFixed(1) + '%'); write('hptext', 'textContent', `${Math.ceil(player.hp)}/${maxHp()}`);
  write('hpbar', 'className', player.hp / maxHp() < LOW_HP ? 'bar low' : 'bar');
  write('mpfill', 'width', (100 * player.mana / maxMana()).toFixed(1) + '%'); write('mptext', 'textContent', `${Math.floor(player.mana)}/${maxMana()}`);
  write('purse', 'innerHTML', `${icon('coin')}${P.gold}`);
  write('spells', 'innerHTML', spellSlots(P));
  const q = P.active_quest, f = P.favor;
  write('guildq', 'innerHTML', (q ? `${icon('quest')}${esc(q.title)}: ${q.progress}/${q.count}` : '') + (f ? `${q ? '<br>' : ''}${icon('scroll')}${esc(f.summary)}${f.kind === 'hunt' ? `: ${f.progress}/${f.count}` : ''}` : ''));
  write('status', 'innerHTML', (creative() ? `<span>${icon('sparkle')}Creative</span>` : '') + (player.wardT > 0 ? `<span>${icon('ward')}Ward ${Math.ceil(player.wardT)}s</span>` : '') + (player.wanted > 0 ? `<span>${icon('warn')}Wanted ${Math.ceil(player.wanted)}s</span>` : '') + (P.bounty > 0 ? `<span>${icon('coin')}Bounty ${P.bounty}</span>` : ''));
}

// ---------- the keys shown on the screen ----------
function showKeys() {
  $('keymap').textContent = keyOf('map');
  $('keybag').textContent = keyOf('bag');
  $('keyjournal').textContent = keyOf('journal');
}
showKeys();
on('bindings:changed', showKeys);

// ---------- the title card that opens an act ----------
on('act:opened', ({ title, subtitle }) => {
  $('card').innerHTML = `<div class="ch">${esc(title)}</div><h1>${esc(subtitle)}</h1>`;
  $('card').style.opacity = 1;
  setTimeout(() => { $('card').style.opacity = 0; }, ACT_CARD_MS);
});

// ---------- the quest note ----------
let lastFeed = null;
const showObjective = objective => write('quest', 'innerHTML', `${icon('flag')}${esc(objective)}`);
on('objective:changed', showObjective);
export function renderStory(feed) {
  if (feed) lastFeed = feed;
  const f = lastFeed;
  $('wname').textContent = G.world.name;
  if (!f) return;
  G.objective = f.objective; showObjective(f.objective);
  if (f.oaths) G.oaths = f.oaths;
  if (f.marks) G.marks = f.marks;
  write('lawline', 'innerHTML', `${icon('scales')}${f.law_texts.length} laws in force <kbd>${keyOf('laws')}</kbd>`);
}
export const storyFeed = () => lastFeed;
