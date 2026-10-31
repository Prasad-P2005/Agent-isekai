// The interface's pixel art in code: icons, text with icons in it, and blocks drawn as little cubes.
// The sprites themselves are drawn by tools/make_ui_art.py.
import { ABILITIES, ITEMS } from '../core/content.js';
import { CUBE, ITEM_SIZE, cubePixels, spritePixels } from '../view/itemart.js';

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const icon = name => `<i class="ic ic-${name}" aria-hidden="true"></i>`;

// Strings from the simulation, the server and the god carry emoji. They become sprites here so that they match the art.
const EMOJI = {
  '⚡': 'bolt', '📜': 'scroll', '⚖': 'scales', '😱': 'eye', '🤫': 'hush', '⚠': 'warn', '☠': 'skull', '✚': 'heal',
  '🎁': 'gift', '🙏': 'pray', '✨': 'sparkle', '🔥': 'fire', '🐎': 'wagon', '🎉': 'party', '🌑': 'dark',
};
const EMOJI_RE = new RegExp(`(${Object.keys(EMOJI).join('|')})\\uFE0F?`, 'gu');
export const rich = text => esc(text).replace(EMOJI_RE, (_, e) => icon(EMOJI[e]));

// What a shelf shows: a scroll, or the thing itself.
export const goodArt = id => (id.startsWith('scroll_') ? icon('scroll') : `<img src="${itemIcon(id)}" alt="">`);

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

// ---------- blocks as cubes, drawn in view/itemart.js ----------
const cubes = {};
function drawCube(id) {
  const c = document.createElement('canvas');
  c.width = c.height = CUBE;
  c.getContext('2d').putImageData(new ImageData(cubePixels(id), CUBE, CUBE), 0, 0);
  return c.toDataURL();
}
export const blockIcon = id => (cubes[id] ??= drawCube(id));
// Everything anyone can hold: its own drawing, or the block it is.
const drawings = {};
function drawSprite(art, pal) {
  const c = document.createElement('canvas');
  c.width = c.height = ITEM_SIZE;
  c.getContext('2d').putImageData(new ImageData(Uint8ClampedArray.from(spritePixels(art, pal)), ITEM_SIZE, ITEM_SIZE), 0, 0);
  return c.toDataURL();
}
export function itemIcon(id) {
  const it = ITEMS[id];
  if (it.art) return (drawings[id] ??= drawSprite(it.art, it.pal));
  return blockIcon(it.block ?? it.place[0]);
}
