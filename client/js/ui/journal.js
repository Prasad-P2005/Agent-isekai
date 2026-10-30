// The journal in the book: the story so far, the laws, your powers and the controls.
import { G } from '../core/state.js';
import { ABILITIES } from '../core/content.js';
import { maxMana } from '../sim/player.js';
import { esc, icon, power, rich } from './art.js';
import { storyFeed } from './hud.js';
import { definePage } from './panels.js';
import { mouse, setMouseSpeed } from './pointer.js';

const $ = id => document.getElementById(id);
function fill(title, left, right) {
  $('paneltitle').textContent = title;
  $('pageleft').innerHTML = left;
  $('pageright').innerHTML = right;
}

// ---------- the story ----------
function questHTML() {
  const q = G.profile.active_quest;
  if (!q) return '<p class="note">No guild quest. The guild in any city has a board.</p>';
  return `<p>${esc(q.title)}</p><div class="bigprogress"><div class="track"><div style="width:${Math.min(100, 100 * q.progress / q.count)}%"></div></div>${q.progress}/${q.count}</div>`;
}
function favorHTML() {
  const f = G.profile.favor;
  return f ? `<div><h3>${icon('scroll')}A favor</h3><p>${esc(f.summary)}</p></div>` : '';
}
const oathHTML = o => `<article class="stitch law"><h4>${esc(o.name)}${o.done ? ' (sworn)' : ''}</h4>${o.done ? '' : `<p>${esc(o.hint)}</p>`}</article>`;
function oathsHTML() {
  const oaths = G.oaths ?? [];
  return oaths.some(o => !o.done) ? `<div><h3>${icon('scales')}The four Oaths</h3>${oaths.map(oathHTML).join('')}</div>` : '';
}
definePage('journal', {
  tab: 'journal',
  render() {
    const beats = storyFeed()?.beats ?? [];
    fill(G.world.name,
      `<h3>The story so far</h3>${beats.map(b => `<p class="beat">${rich(b)}</p>`).join('') || '<p class="note">Your story has not begun.</p>'}`,
      `<div><h3>${icon('flag')}Objective</h3><p>${esc(G.objective)}</p></div>
       ${oathsHTML()}
       <div><h3>${icon('quest')}Guild quest</h3>${questHTML()}</div>
       ${favorHTML()}`);
  },
});

// ---------- the laws ----------
// A law reads "Law of the Crown: kill human (everywhere) -> golem hunters, only if witnessed".
function lawHTML(text) {
  const at = text.indexOf(': '), name = at > 0 ? text.slice(0, at) : '', [deed, outcome] = text.slice(at > 0 ? at + 2 : 0).split(' -> ');
  return `<article class="stitch law">${name ? `<h4>${esc(name)}</h4>` : ''}<p>${esc(deed)}${outcome ? `${icon('arrow')}${esc(outcome)}` : ''}</p></article>`;
}
definePage('laws', {
  tab: 'journal',
  render() {
    const laws = (storyFeed()?.law_texts ?? []).map(lawHTML), half = Math.floor(laws.length / 2);
    fill('Laws of the world', laws.slice(0, half).join('') || '<p class="note">This world has no laws yet.</p>', laws.slice(half).join(''));
  },
});

// ---------- powers ----------
const powerHTML = (p, detail) => `<div class="power"><span class="thumb">${icon(p.icon)}</span><span class="what">${esc(p.name)}<small>${esc(detail)}</small></span></div>`;
const manaCost = p => (p.mana ? `, ${p.mana} mana` : '');
const wellHTML = () => `<div><h3>${icon('mana')}Your well holds ${maxMana()} mana</h3><p class="note">Attune to a Mana Crystal at a temple to deepen it, or just keep casting. Your mana also returns faster by a Crystal Spire.</p></div>`;
definePage('powers', {
  tab: 'journal',
  render() {
    const known = G.profile.abilities.map(power), unknown = Object.keys(ABILITIES).filter(a => !G.profile.abilities.includes(a)).map(power);
    fill('Powers',
      wellHTML() + (known.map(p => powerHTML(p, `${p.key ? `Press ${p.key}` : 'Always active'}${manaCost(p)}. ${p.about}`)).join('') || '<p class="note">No powers yet. Buy skill scrolls from a market, or earn the trust of the elders.</p>'),
      `<h3>Still to learn</h3>${unknown.map(p => powerHTML(p, `Scroll: ${p.scroll} ${G.world.currency}${manaCost(p)}. ${p.about}`)).join('') || '<p class="note">You have learned every power.</p>'}`);
  },
});

// ---------- the controls, here and on the pause screen ----------
const MOVING = [['WASD', 'Move'], ['Space', 'Jump or swim'], ['Shift', 'Sprint'], ['F', 'Fly, once learned'], ['Left click', 'Attack, or hold to mine'], ['Right click', 'Place a block'], ['1 to 0', 'Pick a hotbar slot']];
const DOING = [['E', 'Talk or trade'], ['T', 'Pray to the god'], ['Q R', 'Fireball, Heal'], ['Z X C', 'Frost Nova, Chain Lightning, Blink'], ['B H', 'Mana Ward, Meteor'], ['G', 'Drink a health potion'], ['V', 'Drink a mana potion']];
const MENUS = [['I', 'Bag'], ['J', 'Journal'], ['L', 'Laws'], ['M', 'Map'], ['Esc', 'Close a menu, or pause'], ['F3', 'Position and frame rate']];
const keyList = rows => `<dl class="keylist">${rows.map(([k, what]) => `<dt><kbd>${k}</kbd></dt><dd>${what}</dd>`).join('')}</dl>`;
export const movesHTML = () => `<h3>Moving</h3>${keyList(MOVING)}`;
export const actionsHTML = () => `<h3>Doing</h3>${keyList(DOING)}<h3>Menus</h3>${keyList(MENUS)}`;
$('pageleft').addEventListener('input', e => { if (e.target.id === 'mousespeed') setMouseSpeed(Number(e.target.value)); });
definePage('keys', {
  tab: 'keys',
  render() {
    fill('Controls', `${movesHTML()}<label class="speed"><h3>Mouse speed</h3><input id="mousespeed" type="range" min="0.4" max="2.2" step="0.1" value="${mouse.speed}"></label>`, actionsHTML());
  },
});
