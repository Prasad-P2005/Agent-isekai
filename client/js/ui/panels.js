// The book and everything else that takes over the mouse. Menus are pages of the book. Conversations, prayer and scenes are one small box low on the screen, with the
// world still in view behind it, and anything to buy or choose sits in a panel at the side.
import { G } from '../core/state.js';
import { SERVICES } from '../core/content.js';
import { emit, on, toast } from '../core/events.js';
import { api } from '../net/api.js';
import { packReport } from '../net/sync.js';
import { applyEffects, applyState } from '../sim/effects.js';
import { blockSummary, heldStack } from '../sim/inventory.js';
import { player } from '../sim/player.js';
import { esc, goodArt, icon, itemIcon, rich } from './art.js';
import { capture, release } from './pointer.js';

const $ = id => document.getElementById(id);
const book = $('book'), scrim = $('scrim'), talk = $('talk'), side = $('side'), sideBody = $('sidebody');
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
}
function hideSide() { side.style.display = 'none'; sideBody.innerHTML = ''; document.body.classList.remove('aside'); }
function showSide() { side.style.display = 'flex'; document.body.classList.add('aside'); }
function hideTalk() { talk.style.display = 'none'; hideSide(); document.body.classList.remove('talking'); }
function openBook(view) {
  leavePage();
  takeMouse();
  hideTalk();
  current = null; convo = null; scene = null;
  scrim.style.display = 'flex';
  book.dataset.view = view;
  book.style.display = 'block';
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
  hideTalk();
  if (G.phase === 'title') { emit('title:back'); return; } // the same book opens over the main menu, and there is no game to go back to
  if (queuedScenes.length) return playScene(queuedScenes.shift());
  capture();
}
$('panelclose').addEventListener('click', closePanel);
for (const nav of ['tabs', 'ribbons']) $(nav).addEventListener('click', e => { const b = e.target.closest('[data-page]'); if (b) openPage(b.dataset.page); });
document.addEventListener('click', e => { const b = e.target.closest('[data-open]'); if (b) togglePage(b.dataset.open); });
// A click beside the book closes it. A drag let go there does not, though the browser calls that a click on the scrim too.
let pressedBeside = false;
scrim.addEventListener('mousedown', e => { pressedBeside = e.target === scrim && !e.defaultPrevented; }); // a press that threw something from the bag was not a click beside the book
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
  const scroll = sideBody.scrollTop;
  sideBody.innerHTML = serviceHTML(c.type, d);
  sideBody.scrollTop = scroll;
}
async function openService({ type, npc, settlement, line = '' }) {
  openTalk(npc.name, npc.title);
  turnTo(npc);
  current = { type, npc, settlement };
  showLine({ who: npc.name, text: line });
  showTopics([LEAVE]);
  sideBody.innerHTML = '<p class="note">…</p>';
  showSide();
  await renderPanel();
}
on('service:opened', openService);
let acting = false; // one purchase per click, however fast the clicks come
document.addEventListener('click', async e => {
  const b = e.target.closest('#sidebody button[data-a]');
  if (!b || !current || acting) return;
  const a = b.dataset.a, i = b.dataset.i, { type, settlement, npc } = current;
  const body = { type, settlement, npc: npc.res?.id ?? null, pack: packReport() };
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

// ---------- conversations: one line at a time, then what to say back ----------
const LEAVE = { id: 'leave', label: 'Leave' }, CONTINUE = { id: 'continue', label: 'Continue' };
const showTopics = topics => {
  $('talktopics').innerHTML = topics.map((t, i) => `<button type="button" data-topic="${esc(t.id)}"${t.story ? ' class="gold"' : ''}><kbd>${i + 1}</kbd><span>${esc(t.label)}</span></button>`).join('');
};
function openTalk(name, role = '') {
  leavePage();
  takeMouse();
  scrim.style.display = 'none'; book.style.display = 'none';
  current = null; convo = null; scene = null;
  hideSide();
  document.body.classList.add('talking');
  talk.style.display = 'flex';
  $('talkname').textContent = name;
  $('talkrole').textContent = role;
  $('talkline').textContent = '';
  showTopics([]);
}
function showLine({ who, text, gift = false }) {
  if (who !== undefined) $('talkname').textContent = who;
  $('talkline').className = `talkline${gift ? ' gift' : who === '' ? ' aside' : ''}`;
  $('talkline').innerHTML = rich(text);
  $('talkline').scrollTop = 0;
}
// Whatever is left to say, a line at a time, and then the choices.
function nextLine() {
  const at = convo ?? scene;
  if (!at?.queue.length) return;
  showLine(at.queue.shift());
  showTopics(at.queue.length ? [CONTINUE] : at.topics);
}
// The head comes round to whoever is talking, a little high, so that they stand above the box.
const TURN_TIME = 280, LOOK_LOW = 0.14;
function turnTo(npc) {
  if (!npc.pos) return;
  const dx = npc.pos.x - player.pos.x, dz = npc.pos.z - player.pos.z, up = npc.pos.y + npc.def.h * 0.85 - player.pos.y - 1.62;
  const yaw0 = player.yaw, pitch0 = player.pitch, pitch = Math.atan2(up, Math.hypot(dx, dz)) - LOOK_LOW, turn = Math.atan2(-dx, -dz) - yaw0;
  const shortest = Math.atan2(Math.sin(turn), Math.cos(turn)), from = performance.now();
  const step = now => {
    if (!G.uiOpen) return;
    const t = Math.min(1, (now - from) / TURN_TIME), eased = t * (2 - t);
    player.yaw = yaw0 + shortest * eased;
    player.pitch = pitch0 + (pitch - pitch0) * eased;
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function openConversation({ npc, settlement, service, prayer = false, near = '' }) {
  openTalk(npc.name, npc.title);
  turnTo(npc);
  convo = { npc, settlement, prayer, near, queue: [], topics: [] };
  if (service) { current = { type: service, npc, settlement }; sideBody.innerHTML = '<p class="note">…</p>'; showSide(); renderPanel(); }
  say('hello');
}
on('talk:opened', openConversation);
// A stone says which stone it is, and a traveller who they are. Everyone else is what they are.
const creatureOf = npc => (npc.kind === 'echo' ? npc.role : npc.role ? `traveller:${npc.role}` : npc.kind);
async function say(topic) {
  if (!convo || convo.busy) return;
  const c = convo, { npc } = c;
  showTopics([]);
  $('talkline').textContent = '…';
  c.busy = npc.talking = true;
  try {
    const res = c.prayer ? await api.pray({ topic, near: c.near, held: heldStack() ?? null, pack: packReport() }) : await api.talk({
      settlement: npc.res ? c.settlement : null, resident: npc.res?.id ?? null, creature: creatureOf(npc), name: npc.name, topic, blocks: blockSummary(), pack: packReport(),
    });
    applyState(res); applyEffects(res.effects);
    if (convo === c) {
      c.queue = [...res.lines.map(text => ({ who: npc.name, text })), ...(res.gift ? [{ who: npc.name, text: `🎁 ${res.gift}`, gift: true }] : [])];
      c.topics = topic === 'bye' ? [LEAVE] : res.topics;
      if (res.petition?.length) showPetition(res.petition, res.redraw);
      else if (c.prayer) hideSide();
      if (current) renderPanel();
      nextLine();
    }
  } catch {
    if (convo === c) { showLine({ who: npc.name, text: `${npc.name} doesn't answer.` }); showTopics([LEAVE]); }
  }
  c.busy = npc.talking = false;
}
$('talktopics').addEventListener('click', e => {
  const b = e.target.closest('button[data-topic]');
  if (!b) return;
  const topic = b.dataset.topic;
  if (topic === 'leave') closePanel();
  else if (topic === 'stone_pray') openPrayer('stone');
  else if (topic === 'continue') nextLine();
  else say(topic);
});
addEventListener('keydown', e => {
  if (!convo && !scene) return;
  const lone = (e.code === 'Enter' || e.code === 'Space') && $('talktopics').children.length === 1;
  const pick = /^Digit([1-9])$/.exec(e.code)?.[1] ?? (lone ? 1 : 0);
  if (pick) $('talktopics').children[pick - 1]?.click();
});

// ---------- the Laws she can write ----------
const ROMAN = ['', 'I', 'II', 'III'];
const lawCard = l => `<article class="stitch lawcard ${esc(l.tier)}${l.ink ? ` ink-${esc(l.ink)}` : ''}"><h4>${esc(l.name)}${l.deepens ? ` ${ROMAN[l.rank]}` : ''}</h4>${l.tier_label ? `<small class="lawtier">${esc(l.tier_label)}</small>` : ''}<p>${esc(l.gift)}</p><p class="second">${esc(l.second)}</p>`
  + `${l.ink_label ? `<p class="lawink">${esc(l.ink_label)}</p>` : ''}<p class="lawwhy">${esc(l.why)}${l.deepens ? ' Its gift grows. Its price does not.' : ''}</p><button type="button" class="gold" data-law="${esc(l.id)}">${l.deepens ? 'Deepen this Law' : 'Write this Law'}</button></article>`;
function showPetition(cards, again) {
  sideBody.innerHTML = `<h3>What can be written</h3>${cards.map(lawCard).join('')}${again ? '<button type="button" data-law-again>Ask for other words</button>' : ''}<p class="note">The world holds three of these Laws. A fourth pushes out the oldest.</p>`;
  showSide();
}
sideBody.addEventListener('click', e => {
  const b = e.target.closest('button[data-law], button[data-law-again]');
  if (!b) return;
  hideSide();
  say(b.dataset.law ? `law:${b.dataset.law}` : 'law_again');
});

// ---------- scenes: the story takes the stage for a moment ----------
function playScene(s) {
  if (G.uiOpen) { queuedScenes.push(s); return; } // it waits for the shop or the conversation to end
  openTalk(s.title);
  scene = { queue: s.lines.map(({ who, text }) => ({ who, text })), topics: [LEAVE] };
  nextLine();
}
on('scene:opened', playScene);

// ---------- prayer: a conversation with someone who can't do much ----------
export function openPrayer(near = '') {
  openConversation({ npc: { name: G.world.god_name, title: near === 'stone' ? 'Almost close enough to touch' : 'A voice only you can hear' }, settlement: -1, service: null, prayer: true, near });
}
