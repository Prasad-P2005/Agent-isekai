// The heads-up display: bars, status line, toasts, the story panel and the land banner.
import { G, isPaused } from '../core/state.js';
import { ABILITIES, GUILD } from '../core/content.js';
import { on } from '../core/events.js';
import { ents } from '../sim/entities.js';
import { miningBar } from '../sim/mining.js';
import { maxHp, player } from '../sim/player.js';
import { REALM, landName } from '../sim/terrain.js';
import { isUnderwater, sunHeight } from '../view/world.js';

const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---------- toasts ----------
let toastT = 0;
on('toast', ({ text, seconds }) => { $('toast').textContent = text; $('toast').style.opacity = 1; toastT = seconds; });
on('player:hurt', () => { $('hurt').style.opacity = 1; setTimeout(() => { $('hurt').style.opacity = 0; }, 180); });

// ---------- the land banner ----------
let realmT = 0;
on('land:entered', ({ land }) => {
  $('realm').innerHTML = `${esc(landName(land))}<small>${REALM[land.b][1]}</small>`;
  $('realm').style.opacity = 1; realmT = 4;
});

// ---------- bars and status ----------
// The HUD is rebuilt every frame but rarely changes, and assigning innerHTML reparses it even when
// the text is the same, so the DOM is only touched when a value really is different.
const written = {};
function write(id, prop, value) {
  if (written[id + prop] === value) return;
  written[id + prop] = value;
  if (prop === 'width' || prop === 'display') $(id).style[prop] = value; else $(id)[prop] = value;
}
let frames = 0, fps = 0, fpsT = 0, debugT = 0;
function updateDebug(dt) {
  frames++; fpsT += dt; if (fpsT >= 1) { fps = frames; frames = 0; fpsT = 0; }
  debugT -= dt;
  if (debugT > 0) return;
  debugT = 0.25;
  const p = player.pos;
  $('hud').textContent = `XYZ ${Math.floor(p.x)} ${Math.floor(p.y)} ${Math.floor(p.z)}\n${sunHeight() < -0.1 ? '🌙 Night' : '☀ Day'} · ${fps} fps · ${ents.length} beings`;
}
export function updateHUD(dt) {
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').style.opacity = 0; }
  if (realmT > 0) { realmT -= dt; if (realmT <= 0) $('realm').style.opacity = 0; }
  updateDebug(dt);
  write('water', 'display', isUnderwater() ? 'block' : 'none');
  write('minebar', 'display', miningBar.shown && !isPaused() ? 'block' : 'none');
  if (miningBar.shown) { $('minebar').firstChild.style.width = miningBar.progress * 100 + '%'; write('minetext', 'textContent', miningBar.text); }
  const P = G.profile; if (!P) return;
  write('hpfill', 'width', (100 * player.hp / maxHp()).toFixed(1) + '%'); write('hptext', 'textContent', `❤ ${Math.ceil(player.hp)} / ${maxHp()}`);
  write('mpfill', 'width', (100 * player.mana / player.maxMana).toFixed(1) + '%'); write('mptext', 'textContent', `✦ ${Math.floor(player.mana)} / ${player.maxMana}`);
  write('abil', 'textContent', P.abilities.length ? P.abilities.map(a => ABILITIES[a].label).join('  ·  ') : 'No powers yet. Buy skill scrolls or earn the trust of the elders');
  const q = P.active_quest;
  write('status', 'innerHTML', `💰 ${P.gold} ${G.world.currency} · 🧪${P.potions} (G) · 🔷${P.mana_potions} (V) · ⚔ ${esc(P.weapon_name)} · 🛡 ${esc(P.armor_name)} · ⛏ ${esc(P.tool_name)} · Guild rank ${GUILD.ranks[P.guild_rank]}`
    + (q ? `<br>📋 ${esc(q.title)}: ${q.progress}/${q.count}` : '')
    + (player.wanted > 0 ? `<br><span class="wanted">⚠ WANTED ${Math.ceil(player.wanted)}s</span>` : '')
    + (P.bounty > 0 ? ` <span class="wanted">Bounty ${P.bounty}</span>` : ''));
}

// ---------- story panel ----------
let lawsVisible = true, lastFeed = null;
on('objective:changed', objective => { $('quest').textContent = '⚑ ' + objective; });
export function renderStory(feed) {
  if (feed) lastFeed = feed;
  const f = lastFeed;
  $('wname').textContent = G.world.name;
  if (!f) return;
  write('beats', 'innerHTML', f.beats.map(b => `<div class="beat">${esc(b)}</div>`).join(''));
  G.objective = f.objective; $('quest').textContent = '⚑ ' + f.objective;
  write('laws', 'innerHTML', lawsVisible ? '<b>⚖ Laws of the world (L)</b>' + f.law_texts.map(t => `<div>${esc(t)}</div>`).join('') : '<b>⚖ Laws hidden (L)</b>');
}
export function toggleLaws() { lawsVisible = !lawsVisible; renderStory(); }
export function setOracle(t) { $('oracle').textContent = t; }
