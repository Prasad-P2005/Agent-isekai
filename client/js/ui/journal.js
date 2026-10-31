// The journal in the book: the story so far, the laws, your powers, the creatures you have met and the controls.
import { keyOf, spellKey } from '../core/bindings.js';
import { G } from '../core/state.js';
import { ABILITIES, BESTIARY, CREATURES } from '../core/content.js';
import { hasSeen } from '../sim/bestiary.js';
import { maxMana } from '../sim/player.js';
import { esc, icon, power, rich } from './art.js';
import { storyFeed } from './hud.js';
import { definePage } from './panels.js';

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
      wellHTML() + (known.map(p => powerHTML(p, `${p.key ? `Press ${p.key}` : p.mana ? `Put it on ${spellKey(0)} or ${spellKey(1)} in the bag` : 'Always active'}${manaCost(p)}. ${p.about}`)).join('') || '<p class="note">No powers yet. Buy skill scrolls from a market, or earn the trust of the elders.</p>'),
      `<h3>Still to learn</h3>${unknown.map(p => powerHTML(p, `Scroll: ${p.scroll} ${G.world.currency}${manaCost(p)}. ${p.about}`)).join('') || '<p class="note">You have learned every power.</p>'}`);
  },
});

// ---------- creatures ----------
// An entry is empty until the hero has had a proper look at the thing (sim/bestiary.js).
let reading = null;
const danger = D => (D.warded ? 'Cannot be wounded by ordinary means' : D.friendly ? 'Harmless, unless provoked' : !D.dmg ? 'Harmless' : D.dmg < 4 ? 'A nuisance' : D.dmg < 8 ? 'Dangerous' : 'Deadly');
const beastHTML = kind => {
  const seen = hasSeen(kind);
  return `<button type="button" class="beast${reading === kind ? ' on' : ''}" data-beast="${kind}"${seen ? '' : ' disabled'}>${seen ? esc(CREATURES[kind].label) : '? ? ?'}</button>`;
};
function entryHTML() {
  if (!reading) return '<p class="note">Choose a creature you have met to read about it. Anything you have not yet seen stays blank.</p>';
  const D = CREATURES[reading], { where, lore } = BESTIARY.entries[reading];
  return `<h3>${esc(D.label)}</h3><p>${esc(lore)}</p><p class="note">Found: ${esc(where)}</p><p class="note">${danger(D)}${D.hp > 1 && !D.sacred ? `, ${D.hp} health` : ''}</p>${D.loot ? `<p class="note">Drops: ${esc(D.loot.name)}</p>` : ''}`;
}
function renderBestiary() {
  const all = BESTIARY.groups.flatMap(g => g.kinds), seen = all.filter(hasSeen).length;
  fill(`Creatures, ${seen} of ${all.length}`, BESTIARY.groups.map(g => `<h3>${esc(g.name)}</h3><div class="bestlist">${g.kinds.map(beastHTML).join('')}</div>`).join(''), entryHTML());
}
definePage('bestiary', { tab: 'journal', render: renderBestiary, leave() { reading = null; } });
$('pageleft').addEventListener('click', e => {
  const b = e.target.closest('[data-beast]');
  if (b) { reading = b.dataset.beast; renderBestiary(); }
});

// ---------- the controls, here and on the pause screen ----------
const moving = () => [[['forward', 'left', 'back', 'right'].map(keyOf).join(' '), 'Move'], [keyOf('jump'), 'Jump or swim'], [keyOf('sprint'), 'Sprint'], [keyOf('fly'), 'Fly, once learned'], ['Left click', 'Attack, or hold to mine'], ['Right click', 'Use what is in your hand: place a block, eat, drink, draw a bow, raise a shield, open a station'], [`${keyOf('forward')} or ${keyOf('back')} on a rope`, 'Climb'], ['1 to 9', 'Pick a hotbar slot']];
const doing = () => [[keyOf('talk'), 'Talk or trade'], [keyOf('pray'), 'Pray to the god'], [`${keyOf('spell1')} ${keyOf('spell2')}`, 'Cast the two spells you have chosen in the bag'], [keyOf('health'), 'Drink a health potion'], [keyOf('mana'), 'Drink a mana potion']];
const menus = () => [[keyOf('bag'), 'Bag'], [keyOf('journal'), 'Journal'], [keyOf('laws'), 'Laws'], [keyOf('map'), 'Map'], [keyOf('settings'), 'Settings'], ['Esc', 'Close a menu, or pause'], [keyOf('debug'), 'Position and frame rate']];
const keyList = rows => `<dl class="keylist">${rows.map(([k, what]) => `<dt><kbd>${k}</kbd></dt><dd>${what}</dd>`).join('')}</dl>`;
export const movesHTML = () => `<h3>Moving</h3>${keyList(moving())}`;
export const actionsHTML = () => `<h3>Doing</h3>${keyList(doing())}<h3>Menus</h3>${keyList(menus())}`;
