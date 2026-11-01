// The pages of the book that are only for reading: How to Play, What's New and the credits. How to Play opens from the pause card as well, so someone can look something up mid-game.
import { keyOf } from '../core/bindings.js';
import { NEWS, TITLE } from '../core/content.js';
import { on } from '../core/events.js';
import { esc, icon } from './art.js';
import { actionsHTML, movesHTML } from './journal.js';
import { definePage } from './panels.js';

const $ = id => document.getElementById(id);
const KEY_LISTS = { moving: movesHTML, doing: actionsHTML };
const KINDS = { new: 'New', changed: 'Changed', fixed: 'Fixed', check: 'Still to check' };
let topic = 0, entry = 0;

// {forward} in the text is whichever key does that now, so the guide cannot go stale when someone rebinds one.
const withKeys = text => esc(text).replace(/\{(\w+)\}/g, (_, action) => `<kbd>${esc(keyOf(action))}</kbd>`);
function renderGuide() {
  const t = TITLE.guide[topic];
  $('paneltitle').textContent = 'How to Play';
  $('pageleft').innerHTML = `<nav class="readlist">${TITLE.guide.map((g, i) => `<button type="button" data-guide="${i}"${i === topic ? ' class="on"' : ''}>${icon(g.art)}${esc(g.title)}</button>`).join('')}</nav>`;
  $('pageright').innerHTML = `<div><h3>${esc(t.title)}</h3>${t.text.map(p => `<p>${withKeys(p)}</p>`).join('')}</div>${t.keys ? KEY_LISTS[t.keys]() : ''}`;
  $('pageright').scrollTop = 0;
}
definePage('howto', { tab: 'help', render: renderGuide });
on('bindings:changed', () => { if ($('pageleft').querySelector('[data-guide]')) renderGuide(); });

function renderNews() {
  const n = NEWS[entry];
  $('paneltitle').textContent = 'What\'s New';
  $('pageleft').innerHTML = `<nav class="readlist">${NEWS.map((e, i) => `<button type="button" data-news="${i}"${i === entry ? ' class="on"' : ''}>${icon('scroll')}<span>${esc(e.date)}<small>${esc(e.build)}</small></span></button>`).join('')}</nav>`;
  $('pageright').innerHTML = !n ? '<p class="note">Nothing to report.</p>' : `<p>${esc(n.summary)}</p>${n.sections.map(s => `<div><h3>${esc(KINDS[s.kind] ?? s.kind)}</h3>${s.items.map(i => `<p class="newsitem"><b>${esc(i.head)}</b> ${esc(i.text)}</p>`).join('')}</div>`).join('')}`;
  $('pageright').scrollTop = 0;
}
definePage('news', { tab: 'title', render: renderNews });

function renderCredits() {
  const half = Math.ceil(TITLE.credits.length / 2), part = list => list.map(c => `<div><h3>${esc(c.title)}</h3>${c.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>`).join('');
  $('paneltitle').textContent = 'Credits';
  $('pageleft').innerHTML = part(TITLE.credits.slice(0, half));
  $('pageright').innerHTML = part(TITLE.credits.slice(half));
}
definePage('credits', { tab: 'title', render: renderCredits });

document.addEventListener('click', e => {
  const b = e.target.closest?.('#pageleft [data-guide], #pageleft [data-news]');
  if (!b) return;
  if (b.dataset.guide) { topic = Number(b.dataset.guide); renderGuide(); } else { entry = Number(b.dataset.news); renderNews(); }
});
