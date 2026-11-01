// Thin wrapper over the Python server's HTTP API.
import { emit } from '../core/events.js';

// Which world this page is playing. The server holds one world at a time, and it turns away a page that thinks it is playing another, so that a tab left open cannot write
// its bag and blocks into the wrong save.
let slot = null;
export const playingSlot = id => { slot = id; };
async function req(method, path, body, keepalive = false) {
  const r = await fetch('/api' + path, {
    method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(slot ? { 'X-World': slot } : {}) }, body: body ? JSON.stringify(body) : undefined, keepalive,
  });
  if (r.status === 409 && slot) emit('world:closed');
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
export const api = {
  status: () => req('GET', '/status'),
  newWorld: options => req('POST', '/new', options),
  vista: () => req('GET', '/vista'),
  saves: () => req('GET', '/saves'),
  openSlot: id => req('POST', `/saves/${id}/open`),
  renameSlot: (id, name) => req('POST', `/saves/${id}/rename`, { name }),
  copySlot: id => req('POST', `/saves/${id}/copy`),
  deleteSlot: id => req('DELETE', `/saves/${id}`),
  importWorld: data => req('POST', '/saves/import', data),
  saveNow: () => req('POST', '/save'),
  world: () => req('GET', '/world'),
  settlement: id => req('GET', `/settlement/${id}`),
  feed: since => req('GET', `/feed?since=${since}`),
  context: (c, keepalive) => req('POST', '/context', c, keepalive),
  heaven: topic => req('POST', '/heaven', { topic }),
  descend: () => req('POST', '/descend'),
  pray: body => req('POST', '/pray', body),
  event: e => req('POST', '/event', e),
  crime: c => req('POST', '/crime', c),
  report: (law, by) => req('POST', '/report', { law, by }),
  rules: () => req('GET', '/rules'),
  talk: t => req('POST', '/talk', t),
  service: (type, settlement = -1) => req('GET', `/service?type=${type}&settlement=${settlement}`),
  act: a => req('POST', '/service', a),
  blocks: (blocks, edits, pack, keepalive) => req('POST', '/blocks', { blocks, edits, pack }, keepalive),
  creative: on => req('POST', '/creative', { on }),
};
