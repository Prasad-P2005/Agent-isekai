// Everything that crosses to the server: reports what happened in the simulation, and carries back what the server decided.
import { G, isPaused } from '../core/state.js';
import { emit, on, toast } from '../core/events.js';
import { dropReport } from '../sim/drops.js';
import { applyEffects, applyState, creativeChanged } from '../sim/effects.js';
import { requeueEdits, takeUnsentEdits } from '../sim/edits.js';
import { bagReport, blockSummary } from '../sim/inventory.js';
import { stationReport } from '../sim/stations.js';
import { ents, isNight } from '../sim/entities.js';
import { fervor } from '../sim/momentum.js';
import { crimeJudged, replaceSettlement } from '../sim/people.js';
import { player } from '../sim/player.js';
import { landOf } from '../sim/terrain.js';
import { WORLD_EVENTS } from '../sim/worldevents.js';
import { api } from './api.js';

// Everything the hero owns, wherever it is: in the bag, in a chest or on the ground. It always goes in one report, so that nothing is ever saved in two places or in none.
export const packReport = () => bagReport(stationReport(), dropReport());
const THROWS_TOLD = 3, FEED_EVERY = 2500, CONTEXT_EVERY = 5000, BLOCKS_DELAY = 1500, CAST_REPORT = 60;

// ---------- what the simulation reports ----------
const report = async (send, then = applyState) => { try { then(await send()); } catch { /* server busy: the game plays on */ } };

const withMessages = res => { applyState(res); for (const m of res.messages || []) toast(m, 3); };
on('land:entered', ({ lx, lz }) => report(() => api.event({ type: 'enter_land', lx, lz }), withMessages));
on('player:died', ({ by, kind }) => report(() => api.event({ type: 'death', by, kind }), withMessages));
on('boss:phase', phase => report(() => api.event({ type: 'boss_phase', phase })));
on('dragon:mood', kind => report(() => api.event({ type: 'dragon', kind })));
on('creature:spotted', kind => report(() => api.event({ type: 'spotted', kind })));
on('entity:killed', ({ kind, byPlayer, resident, named }) => report(() => api.event({ type: 'kill', kind, by_player: byPlayer, resident, named, chain: fervor.chain }), withMessages));
on('item:seen', id => report(() => api.event({ type: 'found', kind: id })));
on('night:survived', () => report(() => api.event({ type: 'dawn' }), withMessages));
on('star:reached', () => report(() => api.event({ type: 'star' }), withMessages));
on('item:offered', ({ id, n }) => report(() => api.event({ type: 'offer', kind: id, n }), withMessages));
let throwsTold = 0; // she only remarks on the first few, so there is no need to tell her of the rest
on('drop:thrown', () => { if (throwsTold++ < THROWS_TOLD) report(() => api.event({ type: 'threw' })); });
on('crime:reported', ({ type, civilians, body }) => report(() => api.crime(body), res => { applyState(res); crimeJudged(type, civilians, res); }));
on('law:reported', ({ law, by }) => report(() => api.report(law, by), res => { applyState(res); applyEffects(res.effects); }));
// The player pressed something and is waiting, so a failure has to say so, and only a failed request counts as one.
on('creative:asked', want => api.creative(want).then(res => { applyState(res); creativeChanged(); }, () => toast('The server did not answer, so creative mode stayed as it was.', 4)));
// Practice deepens the well. Spent mana goes over in handfuls, because a request for every spell would be a lot in a fight.
let castMana = 0;
on('mana:spent', cost => {
  castMana += cost;
  if (castMana < CAST_REPORT) return;
  const mana = castMana;
  castMana = 0;
  report(() => api.event({ type: 'cast', mana }), withMessages);
});

// ---------- mined and placed blocks ----------
let blocksTimer = null;
function sendBlocks(keepalive = false) {
  clearTimeout(blocksTimer);
  blocksTimer = null;
  const edits = takeUnsentEdits();
  api.blocks(blockSummary(), edits, packReport(), keepalive).catch(() => requeueEdits(edits));
}
on('blocks:changed', () => { clearTimeout(blocksTimer); blocksTimer = setTimeout(sendBlocks, BLOCKS_DELAY); });

// ---------- where the player is, and whether they are playing ----------
function context() {
  const L = landOf(player.pos.x, player.pos.z), S = L.settlement != null ? G.world.settlements[L.settlement] : null;
  const where = player.ready ? { x: player.pos.x, y: player.pos.y, z: player.pos.z, hp: player.hp, mana: player.mana } : {};
  return { ...where, night: isNight(), place: S ? `${S.name} (${S.type})` : (L.name || 'the wilds'), in_settlement: !!S,
    playing: player.ready && !isPaused(), wanted: player.wanted, day_time: G.dayTime, boss_hp: ents.find(e => e.def.boss)?.hp, dragon_hp: ents.find(e => e.kind === 'dragon')?.hp };
}
// Everything the server has not heard yet, and it does not come back until the world is on disk. This one can fail out loud: someone leaving needs to know.
export async function saveAndLeave() {
  clearTimeout(blocksTimer);
  blocksTimer = null;
  const edits = takeUnsentEdits();
  try {
    await api.context(context());
    await api.blocks(blockSummary(), edits, packReport());
    await api.saveNow();
  } catch (error) {
    requeueEdits(edits);
    throw error;
  }
}
function leaving() {
  if (G.phase !== 'world') return;
  api.context(context(), true).catch(() => {});
  if (blocksTimer) sendBlocks(true);
}

// ---------- the god's feed: narration, decrees, rule-bound world events ----------
function handleFeed(it) {
  if (it.type === 'narration') { if (G.phase === 'world') toast('⚡ ' + it.text, 8); }
  else if (it.type === 'decree' || it.type === 'toast') toast(it.text, 8);
  else if (it.type === 'settlement') api.settlement(it.data.id).then(fresh => replaceSettlement(it.data.id, fresh)).catch(() => {});
  else if (it.type === 'scene' && G.phase === 'world') emit('scene:opened', { title: it.text, lines: it.data.lines });
  else if (it.type === 'act' && G.phase === 'world') emit('act:opened', { title: it.text, subtitle: it.data.subtitle });
  else if (it.type === 'law' && G.phase === 'world') emit('law:written', { name: it.text, ...it.data });
  else if (it.type === 'event' && G.phase === 'world') {
    if (it.text) toast(it.text, 7);
    WORLD_EVENTS[it.data.event]?.(it.data);
  }
}
export function startSync(onFeed) {
  let since = G.world.feed_next || 0;
  const poll = async () => {
    try {
      const f = await api.feed(since);
      since = f.next;
      G.rules = f.rules;
      onFeed(f);
      for (const it of f.items) handleFeed(it);
    } catch { /* server busy */ }
    setTimeout(poll, FEED_EVERY);
  };
  poll();
  setInterval(() => { if (G.phase === 'world') api.context(context()).catch(() => {}); }, CONTEXT_EVERY);
  addEventListener('pagehide', leaving);
}
