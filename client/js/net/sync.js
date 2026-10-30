// Everything that crosses to the server: reports what happened in the simulation, and carries back what the server decided.
import { G, isPaused } from '../core/state.js';
import { on, toast } from '../core/events.js';
import { drank } from '../sim/abilities.js';
import { applyEffects, applyState } from '../sim/effects.js';
import { requeueEdits, takeUnsentEdits } from '../sim/edits.js';
import { isNight } from '../sim/entities.js';
import { crimeJudged, replaceSettlement } from '../sim/people.js';
import { player } from '../sim/player.js';
import { landOf } from '../sim/terrain.js';
import { WORLD_EVENTS } from '../sim/worldevents.js';
import { api } from './api.js';

const FEED_EVERY = 2500, CONTEXT_EVERY = 5000, BLOCKS_DELAY = 1500;

// ---------- what the simulation reports ----------
const report = async (send, then = applyState) => { try { then(await send()); } catch { /* server busy: the game plays on */ } };

on('land:entered', ({ lx, lz }) => report(() => api.event({ type: 'enter_land', lx, lz })));
on('player:died', by => report(() => api.event({ type: 'death', by })));
on('entity:killed', ({ kind, byPlayer, resident }) => report(() => api.event({ type: 'kill', kind, by_player: byPlayer, resident }), res => {
  applyState(res);
  for (const m of res.messages || []) toast(m, 2);
}));
on('item:used', item => report(() => api.event({ type: 'use', item }), res => { applyState(res); drank(item, res.ok); }));
on('crime:reported', ({ type, civilians, body }) => report(() => api.crime(body), res => { applyState(res); crimeJudged(type, civilians, res); }));
on('law:reported', ({ law, by }) => report(() => api.report(law, by), res => { applyState(res); applyEffects(res.effects); }));

// ---------- mined and placed blocks ----------
let blocksTimer = null;
function sendBlocks(keepalive = false) {
  clearTimeout(blocksTimer);
  blocksTimer = null;
  const edits = takeUnsentEdits();
  api.blocks(G.profile.blocks, edits, keepalive).catch(() => requeueEdits(edits));
}
on('blocks:changed', () => { clearTimeout(blocksTimer); blocksTimer = setTimeout(sendBlocks, BLOCKS_DELAY); });

// ---------- where the player is, and whether they are playing ----------
function context() {
  const L = landOf(player.pos.x, player.pos.z), S = L.settlement != null ? G.world.settlements[L.settlement] : null;
  const where = player.ready ? { x: player.pos.x, y: player.pos.y, z: player.pos.z, hp: player.hp, mana: player.mana } : {};
  return { ...where, night: isNight(), place: S ? `${S.name} (${S.type})` : (L.name || 'the wilds'), in_settlement: !!S,
    playing: player.ready && !isPaused(), wanted: player.wanted, day_time: G.dayTime };
}
function leaving() {
  if (G.phase !== 'world') return;
  api.context(context(), true).catch(() => {});
  if (blocksTimer) sendBlocks(true);
}

// ---------- the god's feed: narration, decrees, rule-bound world events ----------
function handleFeed(it) {
  if (it.type === 'narration') { if (G.phase === 'world') toast('⚡ ' + it.text, 8); }
  else if (it.type === 'decree') toast(it.text, 8);
  else if (it.type === 'settlement') api.settlement(it.data.id).then(fresh => replaceSettlement(it.data.id, fresh)).catch(() => {});
  else if (it.type === 'event' && G.phase === 'world') {
    toast(it.text, 7);
    WORLD_EVENTS[it.data.event]?.(it.data);
  }
}
export function startSync(onFeed) {
  let since = G.world.feed_next || 0;
  const poll = async () => {
    try {
      const f = await api.feed(since);
      since = f.next;
      onFeed(f);
      for (const it of f.items) handleFeed(it);
    } catch { /* server busy */ }
    setTimeout(poll, FEED_EVERY);
  };
  poll();
  setInterval(() => { if (G.phase === 'world') api.context(context()).catch(() => {}); }, CONTEXT_EVERY);
  addEventListener('pagehide', leaving);
}
