// Panels that take over the mouse: shops, guild, services, conversations and prayer.
import { G } from '../core/state.js';
import { SERVICES } from '../core/content.js';
import { on, toast } from '../core/events.js';
import { api } from '../net/api.js';
import { applyEffects, applyState } from '../sim/effects.js';
import { renderer } from '../view/scene.js';
import { esc } from './hud.js';

const $ = id => document.getElementById(id);
let current = null, convo = null;

export function openPanel(mode) {
  G.uiOpen = true; document.exitPointerLock();
  if (!mode) return;
  current = null; convo = null;
  $('panel').style.display = 'block';
  $('chat').style.display = mode === 'chat' ? 'block' : 'none';
  $('panelline').textContent = ''; $('panelbody').innerHTML = '';
}
export function closePanel() {
  G.uiOpen = false;
  $('panel').style.display = 'none'; $('pray').style.display = 'none';
  if (!G.locked && !G.focused) $('overlay').style.display = 'flex';
  if (G.locked || G.focused) return;
  try {
    const result = renderer.domElement.requestPointerLock();
    if (result?.catch) result.catch(() => { G.focused = true; $('overlay').style.display = 'none'; });
  } catch {
    G.focused = true;
    $('overlay').style.display = 'none';
  }
}

// ---------- services ----------
async function openService({ type, npc, settlement, line = '' }) {
  openPanel('service');
  current = { type, npc, settlement };
  $('paneltitle').textContent = `${SERVICES[type]?.title || 'Service'} · ${npc.name}`;
  $('panelline').textContent = line;
  $('panelbody').innerHTML = '…';
  await renderPanel();
}
on('service:opened', openService);
async function renderPanel() {
  if (!current) return;
  const { type, settlement } = current, d = await api.service(type, settlement), cur = d.currency;
  let h = `<div class="gold">💰 ${d.gold} ${esc(cur)}</div>`;
  if (d.notes?.length) h += `<div class="note">${d.notes.map(esc).join(' · ')}</div>`;
  if (d.items) h += '<h4>Buy</h4>' + d.items.map(it => `<div class="row"><span>${esc(it.name)}</span><button data-a="buy" data-i="${it.id}" ${it.owned || d.gold < it.price ? 'disabled' : ''}>${it.owned ? 'owned' : it.price}</button></div>`).join('');
  if (d.sell?.length) h += '<h4>Sell loot</h4>' + d.sell.map(it => `<div class="row"><span>${esc(it.name)} ×${it.count}</span><span><button data-a="sell" data-i="${esc(it.name)}">${it.price}</button> <button data-a="sellall" data-i="${esc(it.name)}">all</button></span></div>`).join('');
  if (d.quests) {
    h += `<div class="note">Rank ${d.rank} · ${d.done} quests completed</div>`;
    if (d.active) h += `<h4>Your quest</h4><div class="row"><span>${esc(d.active.title)} (${d.active.progress}/${d.active.count} ${d.active.kind})</span><button data-a="turnin">Turn in (+${d.active.reward})</button></div>`;
    h += '<h4>Quest board</h4>' + d.quests.map((q, i) => `<div class="row"><span>${esc(q.title)}: slay ${q.count} ${q.kind}</span><button data-a="accept" data-i="${i}" ${d.active ? 'disabled' : ''}>${q.reward} ${esc(cur)}</button></div>`).join('');
  }
  if (d.options) h += d.options.map(o => `<div class="row"><span>${esc(o.label)}</span><button data-a="${o.action}" ${d.gold < o.price ? 'disabled' : ''}>${o.price} ${esc(cur)}</button></div>`).join('');
  $('panelbody').innerHTML = h;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('#panelbody button'); if (!b || !current) return;
  const a = b.dataset.a, i = b.dataset.i, { type, settlement, npc } = current;
  const body = { type, settlement, npc: npc.res?.id ?? null };
  if (a === 'buy') Object.assign(body, { action: 'buy', item: i });
  else if (a === 'sell' || a === 'sellall') Object.assign(body, { action: 'sell', item: i, all: a === 'sellall' });
  else if (a === 'accept') Object.assign(body, { action: 'accept', index: +i });
  else body.action = a;
  const res = await api.act(body);
  applyState(res); applyEffects(res.effects);
  toast(res.message, 3);
  renderPanel();
});
$('panelclose').addEventListener('click', closePanel);

// ---------- conversations: type to anyone ----------
function addLine(who, text, cls) {
  const d = document.createElement('div'); d.className = cls;
  d.innerHTML = who ? `<b>${esc(who)}:</b> ${esc(text)}` : esc(text);
  $('chatlog').appendChild(d); $('chatlog').scrollTop = 1e9;
  return d;
}
function openConversation({ npc, settlement, service }) {
  openPanel('chat');
  convo = { npc, settlement };
  $('paneltitle').textContent = `💬 ${npc.name}${npc.title ? ' · ' + npc.title : ''}`;
  $('chatlog').innerHTML = '';
  if (service) { current = { type: service, npc, settlement }; $('panelbody').innerHTML = '…'; renderPanel(); }
  setTimeout(() => $('chatin').focus(), 30);
  say('');
}
on('talk:opened', openConversation);
async function say(msg, shown = false) {
  if (!convo) return;
  const c = convo, { npc } = c;
  if (msg && !shown) addLine('You', msg, 'me');
  if (c.busy) { if (msg) c.queue = msg; return; } // answered as soon as the current reply arrives
  const wait = addLine(npc.name, '…', 'npc');
  c.busy = npc.talking = true;
  try {
    const res = await api.talk({ settlement: npc.res ? c.settlement : null, resident: npc.res?.id ?? null, kind: npc.def.label, name: npc.name, message: msg });
    applyState(res);
    wait.innerHTML = `<b>${esc(npc.name)}:</b> ${esc(res.line)}`;
    if (res.gift) { addLine('', `🎁 ${res.gift}`, 'gift'); toast(`🎁 ${res.gift}`, 5); }
    if (current) renderPanel();
  } catch { wait.textContent = `${npc.name} doesn't answer.`; }
  c.busy = npc.talking = false;
  if (c.queue && convo === c) { const q = c.queue; c.queue = null; say(q, true); }
}
$('chatin').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape') closePanel();
  if (e.key === 'Enter' && $('chatin').value.trim()) { const m = $('chatin').value.trim(); $('chatin').value = ''; say(m); }
});
$('chatsend').addEventListener('click', () => { const m = $('chatin').value.trim(); if (m) { $('chatin').value = ''; say(m); } });

// ---------- prayer ----------
export function openPrayer() { openPanel(); $('pray').style.display = 'block'; $('prayin').value = ''; setTimeout(() => $('prayin').focus(), 30); }
$('prayin').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape') closePanel();
  if (e.key === 'Enter') {
    const t = $('prayin').value.trim();
    closePanel();
    if (t) { api.pray(t); toast('🙏 Your prayer rises to the heavens… the god can only answer through the rules of the world.', 4); }
  }
});
