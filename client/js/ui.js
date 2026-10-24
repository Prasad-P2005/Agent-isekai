// HUD, story panel, dialogs, shop/guild/service panels, prayer and the god's event feed.
import { G } from './state.js';
import { api } from './api.js';
import { renderer } from './scene.js';
import { player, maxHp, heal } from './player.js';
import { spawnNear, ents, SPAWN_TABLE } from './entities.js';
import { reloadSettlement } from './people.js';
import { landOf, LAND, biomeAt } from './terrain.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
let toastT = 0, dialogT = 0;
export function toast(msg, sec = 5) { $('toast').textContent = msg; $('toast').style.opacity = 1; toastT = sec; }
export function showDialog(html, sec = 9) { $('dialog').innerHTML = html; $('dialog').style.display = 'block'; dialogT = sec; }
export function flashHurt() { $('hurt').style.opacity = 1; setTimeout(() => { $('hurt').style.opacity = 0; }, 180); }

// ---------- server state ----------
export function applyState(res) {
  if (!res) return;
  if (res.player) G.profile = res.player;
  if (res.story) { G.objective = res.story.objective; $('quest').textContent = '⚑ ' + G.objective; }
  for (const o of res.reached || []) toast(`📜 New objective: ${o}`, 7);
}
export function applyEffects(fx) {
  if (!fx) return;
  if (fx.text) toast(`⚖ ${fx.by ? `${fx.by} enforced "${fx.law}": ` : ''}${fx.text}!`, 6);
  if (fx.clear_wanted) { player.wanted = 0; for (const o of ents) if (o.def.lawful) o.angryT = 0; }
  else if (fx.wanted != null) player.wanted = fx.wanted ? Math.max(player.wanted, fx.wanted) : 0;
  for (const s of fx.spawn || []) spawnNear(s.kind, s.count, 14, 22, { angry: s.angry });
  if (fx.exile) {
    const n = G.world.lands.length, lx = Math.floor(Math.random() * n), lz = Math.floor(Math.random() * n);
    player.pos.set(lx * LAND + 32.5, 140, lz * LAND + 32.5); player.vel.set(0, 0, 0);
  }
  if (fx.heal) heal(fx.heal);
  if (fx.mana) player.mana = player.maxMana;
  if (fx.morning) G.dayTime = 0.05;
}

// ---------- HUD ----------
const ABIL = { fireball: 'Q Fireball', heal: 'R Heal', flight: 'F Flight', double_jump: 'Double jump', swift: 'Swift', giant_strength: 'Giant strength' };
const RANKS = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
export function updateHUD(dt) {
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').style.opacity = 0; }
  if (dialogT > 0) { dialogT -= dt; if (dialogT <= 0) $('dialog').style.display = 'none'; }
  const P = G.profile; if (!P) return;
  $('hpfill').style.width = (100 * player.hp / maxHp()) + '%'; $('hptext').textContent = `❤ ${Math.ceil(player.hp)} / ${maxHp()}`;
  $('mpfill').style.width = (100 * player.mana / player.maxMana) + '%'; $('mptext').textContent = `✦ ${Math.floor(player.mana)} / ${player.maxMana}`;
  $('abil').textContent = P.abilities.length ? P.abilities.map(a => ABIL[a]).join('  ·  ') : 'No powers yet. Buy skill scrolls or earn the trust of the elders';
  const q = P.active_quest;
  $('status').innerHTML = `💰 ${P.gold} ${G.world.currency} · 🧪${P.potions} (G) · 🔷${P.mana_potions} (V) · ⚔ ${esc(P.weapon_name)} · 🛡 ${esc(P.armor_name)} · ⛏ ${esc(P.tool_name)} · Guild rank ${RANKS[P.guild_rank]}`
    + (q ? `<br>📋 ${esc(q.title)}: ${q.progress}/${q.count}` : '')
    + (player.wanted > 0 ? `<br><span class="wanted">⚠ WANTED ${Math.ceil(player.wanted)}s</span>` : '')
    + (P.bounty > 0 ? ` <span class="wanted">Bounty ${P.bounty}</span>` : '');
}
let lawsVisible = true, lastFeed = null, current = null;
export function renderStory(feed) {
  if (feed) lastFeed = feed;
  const f = lastFeed;
  $('wname').textContent = G.world.name;
  if (!f) return;
  $('beats').innerHTML = f.beats.map(b => `<div class="beat">${esc(b)}</div>`).join('');
  G.objective = f.objective; $('quest').textContent = '⚑ ' + f.objective;
  $('laws').innerHTML = lawsVisible ? '<b>⚖ Laws of the world (L)</b>' + f.law_texts.map(t => `<div>${esc(t)}</div>`).join('') : '<b>⚖ Laws hidden (L)</b>';
}
export function toggleLaws() { lawsVisible = !lawsVisible; renderStory(); }
export function setOracle(t) { $('oracle').textContent = t; }

// ---------- the god's feed: narration, decrees, rule-bound world events ----------
export function startFeed() {
  let since = G.world.feed_next || 0;
  const poll = async () => {
    try {
      const f = await api.feed(since);
      since = f.next;
      renderStory(f);
      for (const it of f.items) handleFeed(it);
    } catch (e) { /* server busy */ }
    setTimeout(poll, 2500);
  };
  poll();
  setInterval(() => {
    if (G.phase !== 'world') return;
    const L = landOf(player.pos.x, player.pos.z), S = L.settlement != null ? G.world.settlements[L.settlement] : null;
    api.context({ night: Math.sin(G.dayTime * Math.PI * 2) < -0.1, place: S ? `${S.name} (${S.type})` : (L.name || 'the wilds'), in_settlement: !!S }).catch(() => {});
  }, 5000);
}
function handleFeed(it) {
  if (it.type === 'narration') { if (G.phase === 'world') toast('⚡ ' + it.text, 8); }
  else if (it.type === 'decree') toast(it.text, 8);
  else if (it.type === 'settlement') reloadSettlement(it.data.id);
  else if (it.type === 'event' && G.phase === 'world') {
    toast(it.text, 7);
    const ev = it.data.event;
    if (ev === 'demon_raid') { const w = it.data.wave || 1; spawnNear('imp', Math.min(8, 2 + w), 16, 26); spawnNear('demon_knight', Math.min(4, Math.floor(w / 2)), 16, 26); }
    else if (ev === 'merchant_caravan') { spawnNear('merchant', 2, 8, 12, { title: 'Travelling Merchant' }); spawnNear('adventurer', 1, 8, 12, { title: 'Caravan Guard' }); }
    else if (ev === 'monster_horde') {
      const t = SPAWN_TABLE[biomeAt(Math.floor(player.pos.x), Math.floor(player.pos.z), Math.floor(player.pos.y))] || ['goblin'];
      for (let i = 0; i < 5; i++) spawnNear(t[i % t.length] || 'goblin', 1, 16, 24, { natural: true });
    }
  }
}

// ---------- panels (shop, guild, services) ----------
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
const TITLES = { trade: 'Market', smith: 'Smithy', guild: "Adventurers' Guild", doctor: 'Healer', inn: 'Inn', priest: 'Temple', bounty: 'Law Office' };
export async function openService(type, npc, settlement, line = '') {
  openPanel('service');
  current = { type, npc, settlement };
  $('paneltitle').textContent = `${TITLES[type] || 'Service'} · ${npc.name}`;
  $('panelline').innerHTML = line;
  $('panelbody').innerHTML = '…';
  await renderPanel();
}
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
let convo = null;
function addLine(who, text, cls) {
  const d = document.createElement('div'); d.className = cls;
  d.innerHTML = who ? `<b>${esc(who)}:</b> ${esc(text)}` : esc(text);
  $('chatlog').appendChild(d); $('chatlog').scrollTop = 1e9;
  return d;
}
export function openConversation(npc, settlement, service) {
  openPanel('chat');
  convo = { npc, settlement };
  $('paneltitle').textContent = `💬 ${npc.name}${npc.title ? ' · ' + npc.title : ''}`;
  $('chatlog').innerHTML = '';
  if (service) { current = { type: service, npc, settlement }; $('panelbody').innerHTML = '…'; renderPanel(); }
  setTimeout(() => $('chatin').focus(), 30);
  say('');
}
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
