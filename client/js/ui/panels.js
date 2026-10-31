// The book and everything else that takes over the mouse: menus, shops, the guild, conversations and prayer.
import { G } from '../core/state.js';
import { SERVICES } from '../core/content.js';
import { on, toast } from '../core/events.js';
import { api } from '../net/api.js';
import { applyEffects, applyState } from '../sim/effects.js';
import { bagReport, blockSummary } from '../sim/inventory.js';
import { stationReport } from '../sim/stations.js';
import { esc, goodArt, icon, itemIcon, rich } from './art.js';
import { capture, release } from './pointer.js';

const $ = id => document.getElementById(id);
const book = $('book'), scrim = $('scrim');
const pages = {};
let page = null, current = null, convo = null, scene = null;
const queuedScenes = [];

// A page of the book. `tab` is the tab it sits under, `view` swaps the open spread for a layout of its own, `render` fills it and `leave`, if given, tidies up after it.
export function definePage(name, spec) { pages[name] = spec; }
export const menuOpen = () => page !== null;

function leavePage() {
  if (page) pages[page].leave?.();
  page = null;
}
function takeMouse() {
  G.uiOpen = true;
  release();
  $('overlay').style.display = 'none';
  scrim.style.display = 'flex';
}
function openBook(view) {
  leavePage();
  takeMouse();
  current = null; convo = null; scene = null;
  book.dataset.view = view;
  book.style.display = 'block';
  $('chat').style.display = 'none';
  for (const id of ['paneltitle', 'panelline', 'pageleft', 'pageright']) $(id).textContent = '';
}
export function openPage(name) {
  const { tab, view = 'menu', render } = pages[name];
  openBook(view);
  page = name;
  book.dataset.tab = tab;
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.page === tab);
  for (const b of $('ribbons').children) b.classList.toggle('on', b.dataset.page === name);
  render();
  book.focus({ preventScroll: true });
}
export function togglePage(name) {
  if (!G.world || G.phase !== 'world') return;
  if (page === name) closePanel();
  else if (page || !G.uiOpen) openPage(name); // a shop or a prayer keeps the mouse until it is closed
}
export function closePanel() {
  leavePage();
  current = null; convo = null; scene = null;
  G.uiOpen = false;
  scrim.style.display = 'none'; book.style.display = 'none';
  if (queuedScenes.length) return playScene(queuedScenes.shift());
  capture();
}
$('panelclose').addEventListener('click', closePanel);
for (const nav of ['tabs', 'ribbons']) $(nav).addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (b) openPage(b.dataset.page); });
document.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) togglePage(b.dataset.open); });
// A click beside the book closes it. A drag let go there does not, though the browser calls that a click on the scrim too.
let pressedBeside = false;
scrim.addEventListener('mousedown', e => { pressedBeside = e.target === scrim; });
scrim.addEventListener('click', e => { if (e.target === scrim && pressedBeside) closePanel(); });

// ---------- services ----------
const parts = name => /^(.*?) \((.*)\)$/.exec(name)?.slice(1) ?? [name, ''];
const row = (art, name, detail, actions) => `<div class="row"><span class="thumb">${art}</span><span class="what">${esc(name)}`
  + `${detail ? `<small>${esc(detail)}</small>` : ''}</span><span class="acts">${actions}</span></div>`;
const coins = n => `${icon('coin')}${n}`;

function buyRow(it, gold) {
  const [name, detail] = parts(it.name);
  return row(goodArt(it.id), name, detail, `<button data-a="buy" data-i="${esc(it.id)}" ${it.owned || gold < it.price ? 'disabled' : ''}>${it.owned ? 'Owned' : coins(it.price)}</button>`);
}
const sellRow = it => row(`<img src="${itemIcon(it.id)}" alt="">`, `${it.name} ×${it.count}`, '',
  `<button data-a="sell" data-i="${esc(it.id)}">${coins(it.price)}</button><button data-a="sellall" data-i="${esc(it.id)}">All</button>`);
function optionRow(o, gold, currency) {
  const [name, detail] = parts(o.label);
  return row(icon('heal'), name, detail, `<button data-a="${esc(o.action)}" ${gold < o.price ? 'disabled' : ''}>${o.price} ${currency}</button>`);
}
function guildHTML(d, currency) {
  let h = `<p class="note">Rank ${esc(d.rank)}, ${d.done} quests completed</p>`;
  if (d.active) {
    const q = d.active;
    h += `<h4>Your quest</h4>${row(icon('quest'), q.title, `${q.progress}/${q.count} ${q.kind}, reward ${q.reward} ${currency}`, '<button class="gold" data-a="turnin">Turn in</button>')}`;
  }
  return `${h}<h4>Quest board</h4>${d.quests.map((q, i) => row(icon('scroll'), q.title, `Slay ${q.count} ${q.kind}, reward ${q.reward} ${currency}`,
    `<button data-a="accept" data-i="${i}" ${d.active ? 'disabled' : ''}>Accept</button>`)).join('')}`;
}
function serviceHTML(type, d) {
  const currency = esc(d.currency);
  let h = `<h3>${esc(SERVICES[type]?.title || 'Service')}</h3><div class="purse">${coins(d.gold)} ${currency}</div>`;
  if (d.notes?.length) h += `<p class="note">${d.notes.map(esc).join('. ')}</p>`;
  if (d.items) h += `<div><h4>Buy</h4>${d.items.map(it => buyRow(it, d.gold)).join('')}</div>`;
  if (d.sell?.length) h += `<div><h4>Sell loot</h4>${d.sell.map(sellRow).join('')}</div>`;
  if (d.quests) h += `<div>${guildHTML(d, currency)}</div>`;
  if (d.options) h += `<div>${d.options.map(o => optionRow(o, d.gold, currency)).join('')}</div>`;
  return h;
}
async function renderPanel() {
  const c = current;
  if (!c) return;
  const d = await api.service(c.type, c.settlement);
  if (c !== current) return;
  const body = $('pageright'), scroll = body.scrollTop;
  body.innerHTML = serviceHTML(c.type, d);
  body.scrollTop = scroll;
}
async function openService({ type, npc, settlement, line = '' }) {
  openBook('npc');
  current = { type, npc, settlement };
  $('paneltitle').textContent = npc.name;
  $('panelline').textContent = npc.title || '';
  if (line) $('pageleft').innerHTML = `<div class="stitch">${esc(line)}</div>`;
  $('pageright').innerHTML = '<p class="note">…</p>';
  await renderPanel();
}
on('service:opened', openService);
let acting = false; // one purchase per click, however fast the clicks come
document.addEventListener('click', async e => {
  const b = e.target.closest('#pageright button[data-a]');
  if (!b || !current || acting) return;
  const a = b.dataset.a, i = b.dataset.i, { type, settlement, npc } = current;
  const body = { type, settlement, npc: npc.res?.id ?? null, pack: bagReport(stationReport()) };
  if (a === 'buy') Object.assign(body, { action: 'buy', item: i });
  else if (a === 'sell' || a === 'sellall') Object.assign(body, { action: 'sell', item: i, all: a === 'sellall' });
  else if (a === 'accept') Object.assign(body, { action: 'accept', index: +i });
  else body.action = a;
  acting = true;
  try {
    const res = await api.act(body);
    applyState(res); applyEffects(res.effects);
    toast(res.message, 3);
    await renderPanel();
  } catch {
    toast('The server did not answer. Try again.', 3);
  }
  acting = false;
});

// ---------- conversations: pick what to say ----------
const LEAVE = { id: 'leave', label: 'Leave' }, CONTINUE = { id: 'continue', label: 'Continue' };
function addLine(who, text, cls) {
  const d = document.createElement('div'); d.className = cls;
  d.innerHTML = who ? `<b>${esc(who)}</b> ${esc(text)}` : rich(text);
  $('chatlog').appendChild(d); $('chatlog').scrollTop = 1e9;
  return d;
}
const showTopics = topics => {
  $('chattopics').innerHTML = topics.map((t, i) => `<button type="button" data-topic="${esc(t.id)}"${t.story ? ' class="gold"' : ''}><kbd>${i + 1}</kbd><span>${esc(t.label)}</span></button>`).join('');
};
// Someone with nothing to sell: the facing page keeps what the player is here for in view.
const talkAside = () => `<h3>Your objective</h3><div class="stitch">${icon('flag')}${esc(G.objective)}</div><p class="note">Anyone here will talk to you. Ask them about it.</p>`;
function openConversation({ npc, settlement, service, prayer = false }) {
  openBook('npc');
  convo = { npc, settlement, prayer };
  $('paneltitle').textContent = npc.name;
  $('panelline').textContent = npc.title || '';
  $('chat').style.display = 'flex';
  $('chatlog').innerHTML = '';
  if (service) { current = { type: service, npc, settlement }; $('pageright').innerHTML = '<p class="note">…</p>'; renderPanel(); }
  else $('pageright').innerHTML = talkAside();
  say('hello');
}
on('talk:opened', openConversation);
async function say(topic, label = '') {
  if (!convo || convo.busy) return;
  const c = convo, { npc } = c;
  if (label) addLine('You', label, 'me');
  showTopics([]);
  const wait = addLine(npc.name, '…', 'npc');
  c.busy = npc.talking = true;
  try {
    const res = c.prayer ? await api.pray(topic) : await api.talk({
      settlement: npc.res ? c.settlement : null, resident: npc.res?.id ?? null, creature: npc.role ? `traveller:${npc.role}` : npc.kind, name: npc.name, topic, blocks: blockSummary(), pack: bagReport(stationReport()),
    });
    applyState(res); applyEffects(res.effects);
    if (res.gift) toast(`🎁 ${res.gift}`, 5);
    if (convo === c) {
      wait.remove();
      for (const line of res.lines) addLine(npc.name, line, 'npc');
      if (res.gift) addLine('', `🎁 ${res.gift}`, 'gift');
      if (current) renderPanel();
      showTopics(topic === 'bye' ? [LEAVE] : res.topics);
    }
  } catch {
    if (convo === c) { wait.textContent = `${npc.name} doesn't answer.`; showTopics([LEAVE]); }
  }
  c.busy = npc.talking = false;
}
$('chattopics').addEventListener('click', e => {
  const b = e.target.closest('button[data-topic]');
  if (!b) return;
  const topic = b.dataset.topic;
  if (topic === 'leave') closePanel();
  else if (topic === 'continue') nextSceneLine();
  else say(topic, b.lastElementChild.textContent);
});
addEventListener('keydown', e => {
  if (!convo && !scene) return;
  const pick = /^Digit([1-9])$/.exec(e.code)?.[1] ?? (e.code === 'Enter' && $('chattopics').children.length === 1 ? 1 : 0);
  if (pick) $('chattopics').children[pick - 1]?.click();
});

// ---------- scenes: the story takes the stage for a moment ----------
function nextSceneLine() {
  const { who, text } = scene.lines[scene.at++];
  addLine(who, text, who ? 'npc' : 'gift');
  showTopics([scene.at < scene.lines.length ? CONTINUE : LEAVE]);
}
function playScene(s) {
  if (G.uiOpen) { queuedScenes.push(s); return; } // it waits for the shop or the conversation to end
  openBook('npc');
  scene = { ...s, at: 0 };
  $('paneltitle').textContent = s.title;
  $('chat').style.display = 'flex';
  $('chatlog').innerHTML = '';
  nextSceneLine();
}
on('scene:opened', playScene);

// ---------- prayer: a conversation with someone who can't do much ----------
export function openPrayer() {
  openConversation({ npc: { name: G.world.god_name, title: 'A voice only you can hear' }, settlement: -1, service: null, prayer: true });
}
