// Thin wrapper over the Python server's HTTP API.
async function req(method, path, body, keepalive = false) {
  const r = await fetch('/api' + path, {
    method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, keepalive,
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}
export const api = {
  status: () => req('GET', '/status'),
  newWorld: seed => req('POST', '/new', { seed }),
  world: () => req('GET', '/world'),
  settlement: id => req('GET', `/settlement/${id}`),
  feed: since => req('GET', `/feed?since=${since}`),
  context: (c, keepalive) => req('POST', '/context', c, keepalive),
  heaven: message => req('POST', '/heaven', { message }),
  descend: () => req('POST', '/descend'),
  pray: message => req('POST', '/pray', { message }),
  event: e => req('POST', '/event', e),
  crime: c => req('POST', '/crime', c),
  report: (law, by) => req('POST', '/report', { law, by }),
  talk: t => req('POST', '/talk', t),
  service: (type, settlement = -1) => req('GET', `/service?type=${type}&settlement=${settlement}`),
  act: a => req('POST', '/service', a),
  blocks: (blocks, edits, keepalive) => req('POST', '/blocks', { blocks, edits }, keepalive),
};
