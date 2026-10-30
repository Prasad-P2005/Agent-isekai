// The interface's pixel art in code: icons, text with icons in it, and blocks drawn as little cubes.
// The sprites themselves are drawn by tools/make_ui_art.py.
import { ABILITIES } from '../core/content.js';
import { BL } from '../sim/blocks.js';

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const icon = name => `<i class="ic ic-${name}" aria-hidden="true"></i>`;

// Strings from the simulation, the server and the god carry emoji. They become sprites here so that they match the art.
const EMOJI = {
  '⚡': 'bolt', '📜': 'scroll', '⚖': 'scales', '😱': 'eye', '🤫': 'hush', '⚠': 'warn', '☠': 'skull', '✚': 'heal',
  '🎁': 'gift', '🙏': 'pray', '✨': 'sparkle', '🔥': 'fire', '🐎': 'wagon', '🎉': 'party', '🌑': 'dark',
};
const EMOJI_RE = new RegExp(`(${Object.keys(EMOJI).join('|')})\\uFE0F?`, 'gu');
export const rich = text => esc(text).replace(EMOJI_RE, (_, e) => icon(EMOJI[e]));

const GOODS = {
  potion: 'potion', mana: 'manapotion', iron_sword: 'sword', mithril_sword: 'mithrilsword',
  iron_pickaxe: 'pick', mithril_pickaxe: 'mithrilpick', leather: 'tunic', plate: 'plate',
};
export const goodIcon = id => (id.startsWith('scroll_') ? 'scroll' : GOODS[id] || 'loot');

const POWER_ICONS = {
  fireball: 'fire', heal: 'heal', frost_nova: 'frost', chain_lightning: 'arc', blink: 'blink', mana_ward: 'ward', meteor: 'comet',
  double_jump: 'boot', swift: 'bolt', giant_strength: 'fist', flight: 'wing',
};
// An ability's label may start with the key that casts it: "Q Fireball".
export function power(id) {
  const { label, scroll, mana, about } = ABILITIES[id], keyed = /^([A-Z]) (.+)$/.exec(label);
  return { id, key: keyed?.[1] ?? null, name: keyed?.[2] ?? label, icon: POWER_ICONS[id], scroll, mana, about };
}

const MARK_ICONS = { story: 'flag', guild: 'quest', favor: 'scroll', hunt: 'skull', town: 'house' };
export const markIcon = m => MARK_ICONS[m.sort];

// ---------- blocks as cubes: an isometric drawing from the same colours the terrain uses ----------
const CUBE = 18, RIM = 8, cubes = {};
const grain = (x, y, id) => { const n = Math.sin((x + 1) * 12.9898 + (y + 1) * 78.233 + id * 37.719) * 43758.5453; return n - Math.floor(n); };
const lit = (colour, f) => colour.map(v => Math.max(0, Math.min(255, Math.round(v * 255 * f))));

function drawCube(id) {
  const b = BL[id], img = new ImageData(CUBE, CUBE), alpha = b.transparent ? 170 : 255;
  const put = (x, y, [r, g, bl], a = alpha) => { const i = (x + y * CUBE) * 4; img.data.set([r, g, bl, a], i); };
  const opaque = (x, y) => x >= 0 && y >= 0 && x < CUBE && y < CUBE && img.data[(x + y * CUBE) * 4 + 3] > 0;
  for (let x = 0; x < CUBE; x++) {
    const d = x < CUBE / 2 ? x : CUBE - 1 - x, half = (d + 1) >> 1, top = RIM / 2 - half, bottom = RIM / 2 + half;
    for (let y = top; y <= bottom; y++) put(x, y, lit(b.top, (y === top ? 1.14 : 1) * (grain(x, y, id) < 0.28 ? 0.9 : 1)));
    for (let y = bottom + 1; y <= bottom + RIM; y++) put(x, y, lit(b.side, (x < CUBE / 2 ? 0.84 : 0.62) * (grain(x, y, id) < 0.28 ? 0.9 : 1)));
  }
  const edge = [];
  for (let y = 0; y < CUBE; y++) for (let x = 0; x < CUBE; x++) {
    if (opaque(x, y) && !(opaque(x + 1, y) && opaque(x - 1, y) && opaque(x, y + 1) && opaque(x, y - 1))) edge.push([x, y]);
  }
  for (const [x, y] of edge) put(x, y, lit(b.side, 0.3), 255);
  const c = document.createElement('canvas');
  c.width = c.height = CUBE;
  c.getContext('2d').putImageData(img, 0, 0);
  return c.toDataURL();
}
export const blockIcon = id => (cubes[id] ??= drawCube(id));
