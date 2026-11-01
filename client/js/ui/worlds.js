// The Worlds and New World pages of the book: every save, what can be done with one, and the choices that go into making a new one.
import { WORLD } from '../core/content.js';
import { api } from '../net/api.js';
import { esc, rich } from './art.js';
import { definePage, openPage } from './panels.js';
import { playOpenWorld, playWorld } from './session.js';

const $ = id => document.getElementById(id);
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI'], DAY = 86400;
let worlds = [], picked = null, asking = '', trouble = '', busy = false;

export const setWorlds = list => { worlds = list; if (!worlds.some(w => w.id === picked)) picked = worlds[0]?.id ?? null; };
export const actLabel = w => (w.ending ? 'story told' : w.descended ? `Act ${ROMAN[w.act] ?? w.act}` : 'still in heaven');
export function playedFor(seconds) {
  const minutes = Math.floor(seconds / 60), hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : minutes ? `${minutes}m` : 'just begun';
}
function playedOn(stamp) {
  const days = Math.floor((Date.now() / 1000 - stamp) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : new Date(stamp * 1000).toLocaleDateString();
}
const difficultyName = id => WORLD.difficulty[id]?.label ?? 'Fair';

// ---------- the list ----------
const worldRow = w => `<button type="button" class="worldrow${w.id === picked ? ' on' : ''}" data-w="pick" data-id="${esc(w.id)}"><b>${esc(w.name)}</b><small>${esc(actLabel(w))}, ${playedFor(w.clock)}, ${playedOn(w.played_at)}</small></button>`;
const fact = (label, value) => `<dt>${esc(label)}</dt><dd>${esc(String(value))}</dd>`;
function renderLeft() {
  $('pageleft').innerHTML = `<div class="worldlist">${worlds.map(worldRow).join('') || '<p class="note">No worlds yet. A god is waiting.</p>'}</div>
    <div class="worldtools"><button type="button" class="gold" data-w="new">New World</button><button type="button" data-w="import">Bring in a world</button></div>
    <input id="worldfile" type="file" accept=".json,application/json" hidden>`;
}
function asked(w) {
  if (asking === 'delete') return `<p class="second">Delete ${esc(w.name)}? It goes to the trash folder beside your saves, and leaves this list.</p><div class="choices"><button type="button" data-w="delete-yes">Delete it</button><button type="button" class="gold" data-w="keep">Keep it</button></div>`;
  if (asking === 'rename') return `<form class="worldname" data-w-form="rename"><input id="worldname" type="text" maxlength="32" value="${esc(w.name)}" aria-label="New name" autocomplete="off" spellcheck="false"><button type="submit" class="gold">Rename</button><button type="button" data-w="keep">Cancel</button></form>`;
  return `<div class="worldactions"><button type="button" data-w="rename">Rename</button><button type="button" data-w="copy">Copy</button><button type="button" data-w="export">Save a file</button><button type="button" data-w="delete">Delete</button></div>`;
}
function renderRight() {
  const w = worlds.find(x => x.id === picked);
  if (!w) { $('pageright').innerHTML = `<h3>Nothing here yet</h3><p>Everything you make will be listed on this page. Each world keeps its own hero, its own Laws and its own story.</p>`; return; }
  $('pageright').innerHTML = `<div><h3>${esc(w.name)}</h3><p class="note">${esc(w.hero)}</p></div>
    <dl class="worldfacts">${fact(w.god_is === 'god' ? 'God' : 'Goddess', w.god)}${fact('Difficulty', difficultyName(w.difficulty))}${fact('Mode', w.creative ? 'Creative' : 'Story')}${fact('Story', actLabel(w))}${fact('Time played', playedFor(w.clock))}${fact('Faith', w.level)}${fact('Laws in force', w.laws)}${fact('Foes slain', w.kills)}${fact('Deaths', w.deaths)}${fact('Best run of nights', w.nights)}<dt>Seed</dt><dd><button type="button" class="seedlink" data-w="seed" title="Copy the seed">${esc(String(w.seed))}</button></dd></dl>
    ${trouble ? `<p class="second">${esc(trouble)}</p>` : ''}
    <button type="button" class="gold worldplay" data-w="play">Play</button>${asked(w)}`;
  if (asking === 'rename') { $('worldname').focus(); $('worldname').select?.(); }
}
const redraw = () => { renderLeft(); renderRight(); };
async function reload() {
  const got = await api.saves();
  setWorlds(got.worlds ?? []);
  redraw();
}
// Every one of these leaves the list as the server has it, or says what went wrong in place.
async function act(job) {
  if (busy) return;
  busy = true; trouble = '';
  try { await job(); asking = ''; await reload(); } catch { trouble = 'That did not work. Is the game server still running?'; renderRight(); }
  busy = false;
}
const ACTIONS = {
  pick: b => { picked = b.dataset.id; asking = trouble = ''; redraw(); },
  new: () => openPage('newworld'),
  import: () => $('worldfile').click(),
  play: () => { if (!busy) { busy = true; playWorld(picked).catch(() => { busy = false; trouble = 'That world could not be opened.'; renderRight(); }); } },
  rename: () => { asking = 'rename'; renderRight(); },
  delete: () => { asking = 'delete'; renderRight(); },
  keep: () => { asking = ''; renderRight(); },
  'delete-yes': () => act(() => api.deleteSlot(picked)),
  copy: () => act(async () => { picked = (await api.copySlot(picked)).id; }),
  export() {
    const a = document.createElement('a');
    a.href = `/api/saves/${encodeURIComponent(picked)}/file`;
    a.download = `${picked}.json`;
    a.click();
  },
  seed: b => navigator.clipboard?.writeText(b.textContent).then(() => { b.classList.add('copied'); setTimeout(() => b.classList.remove('copied'), 900); }, () => {}),
};
document.addEventListener('click', e => {
  const b = e.target.closest?.('#pageleft [data-w], #pageright [data-w]');
  if (b) ACTIONS[b.dataset.w]?.(b);
});
document.addEventListener('submit', e => {
  if (e.target.dataset?.wForm !== 'rename') return;
  e.preventDefault();
  const name = $('worldname').value.trim();
  if (name) act(() => api.renameSlot(picked, name));
});
document.addEventListener('change', e => {
  if (e.target.id !== 'worldfile' || !e.target.files?.[0]) return;
  const file = e.target.files[0];
  act(async () => { picked = (await api.importWorld(JSON.parse(await file.text()))).id; }).then(() => { if (trouble) { trouble = 'That file is not a saved world.'; renderRight(); } });
});
definePage('worlds', {
  tab: 'title',
  render() {
    asking = trouble = '';
    $('paneltitle').textContent = 'Worlds';
    redraw();
  },
});

// ---------- a new world ----------
const STARTS = [[false, 'Heaven first', 'Meet the god and hear what she wants before you are sent down.'], [true, 'Straight to the world', 'For a second life. You wake on the ground and the talk never happens.']];
const MODES = [[false, 'Story', 'The whole game. Things can kill you.'], [true, 'Creative', 'Build freely, take no harm, and change your mind on the pause screen at any time.']];
const GODS = [['', 'Let fate choose'], ['goddess', 'A goddess'], ['god', 'A god']];
const fresh = () => ({ name: '', seed: '', difficulty: 'fair', creative: false, god_is: '', brief: false });
let plan = fresh(), making = false, makeTrouble = '';

const choice = (key, value, label) => `<button type="button" data-nw="${key}" data-v="${esc(JSON.stringify(value))}"${plan[key] === value ? ' class="gold"' : ''}>${esc(label)}</button>`;
const choiceRow = (title, key, rows) => `<div class="option"><span class="what">${esc(title)}</span><div class="choices">${rows.map(([value, label]) => choice(key, value, label)).join('')}</div></div>`;
function renderPlanChoices() {
  $('newchoices').innerHTML = choiceRow('Difficulty', 'difficulty', Object.entries(WORLD.difficulty).map(([id, d]) => [id, d.label])) + choiceRow('Mode', 'creative', MODES) + choiceRow('Who waits for you', 'god_is', GODS) + choiceRow('Start', 'brief', STARTS);
  const sum = [WORLD.difficulty[plan.difficulty].about, MODES.find(m => m[0] === plan.creative)[2], STARTS.find(s => s[0] === plan.brief)[2]];
  $('newsummary').innerHTML = sum.map(line => `<p>${esc(line)}</p>`).join('');
}
function renderNew() {
  $('paneltitle').textContent = 'New World';
  $('pageleft').innerHTML = `<div class="option"><label class="what" for="newname">Name<small>Leave it empty and the seed will choose one</small></label><input id="newname" type="text" maxlength="32" autocomplete="off" spellcheck="false" value="${esc(plan.name)}"></div>
    <div class="option"><label class="what" for="newseed">Seed<small>A number or any word. The same seed gives the same land</small></label><input id="newseed" type="text" maxlength="32" autocomplete="off" spellcheck="false" value="${esc(plan.seed)}"></div>
    <div id="newchoices"></div>`;
  $('pageright').innerHTML = `<div><h3>This world</h3><div id="newsummary"></div></div><p class="second" id="newtrouble">${esc(makeTrouble)}</p><button type="button" class="gold worldplay" id="newmake">Create World</button><p class="note">Your other worlds stay exactly as they are.</p>`;
  renderPlanChoices();
}
document.addEventListener('click', e => {
  const b = e.target.closest?.('#newchoices [data-nw]');
  if (!b || making) return;
  plan[b.dataset.nw] = JSON.parse(b.dataset.v);
  renderPlanChoices();
});
document.addEventListener('input', e => {
  if (e.target.id === 'newname') plan.name = e.target.value;
  if (e.target.id === 'newseed') plan.seed = e.target.value;
});
document.addEventListener('click', async e => {
  if (!e.target.closest?.('#newmake') || making) return;
  making = true;
  const button = $('newmake');
  button.disabled = true;
  button.innerHTML = rich('✨ The god is dreaming…');
  try {
    await api.newWorld({ ...plan, seed: plan.seed.trim() || null });
    playOpenWorld();
  } catch {
    making = false;
    makeTrouble = 'The world could not be made. Is the game server still running?';
    button.disabled = false;
    button.textContent = 'Create World';
    $('newtrouble').textContent = makeTrouble;
  }
});
definePage('newworld', {
  tab: 'title',
  render() { makeTrouble = ''; renderNew(); },
});
