// What the right mouse button does, which depends on what is in the hand and what it is pointing at. Drawing a bow and raising a shield last as long as it is held.
import { ITEMS } from '../core/content.js';
import { G, creative } from '../core/state.js';
import { emit, toast } from '../core/events.js';
import { rule } from '../core/rules.js';
import { ID } from './blocks.js';
import { getBlock, setBlock } from './chunks.js';
import { throwAway } from './drops.js';
import { addItem, bag, heldDef, heldStack, offDef, spendHeld, takeItem, wearHeld } from './inventory.js';
import { aim, placeBlock } from './mining.js';
import { eye, heal, lookDir, maxMana, player } from './player.js';
import { spawnProjectile } from './projectiles.js';
import { stationKind } from './stations.js';

const { Dirt, Grass, FaeGrass, SavannaGrass, Farmland, DirtPath } = ID;
const SOIL = new Set([Dirt, Grass, FaeGrass, SavannaGrass]);
const FULL_DRAW = 0.8, ARROW_SPEED = 44, ARROW_DROP = 7, ARROWS = ['mithril_arrow', 'iron_arrow', 'fire_arrow', 'arrow'];

// What is left of a thing once used, such as a bottle. With the bag full it goes on the ground.
function giveBack(id) { const over = addItem(id); if (over) throwAway(id, over); }
const refresh = use => { if (use.heal) heal(use.heal * rule('tonic')); if (use.mana) player.mana = Math.min(maxMana(), player.mana + use.mana * rule('tonic')); };
function useItem(stack, it) {
  const use = it.use;
  refresh(use);
  if (use.buff) { player.buffs[use.buff] = use.time; toast(`✨ ${it.name}: ${use.time} seconds.`, 3); }
  emit('player:used', it.motion);
  const left = it.returns;
  spendHeld();
  if (left && !creative()) giveBack(left);
}
// Drinks the first of these found anywhere in the bag: the H and V keys, for when there is no time to pick a slot.
export function drinkBest(ids) {
  const id = ids.find(i => bag().some(s => s?.id === i));
  if (!id) return toast(ids[0] === 'potion' ? 'No health potions.' : 'No mana potions.', 2);
  const it = ITEMS[id];
  refresh(it.use);
  if (!creative()) { takeItem(id); if (it.returns) giveBack(it.returns); }
  emit('player:used', it.motion);
}
function workGround(it, t) {
  const id = getBlock(t.x, t.y, t.z);
  if (it.tool === 'hoe' && SOIL.has(id)) setBlock(t.x, t.y, t.z, Farmland);
  else if (it.tool === 'shovel' && SOIL.has(id)) setBlock(t.x, t.y, t.z, DirtPath);
  else return false;
  wearHeld(1);
  emit('player:struck');
  return true;
}
export function pressUse() {
  const t = aim.block, id = t ? getBlock(t.x, t.y, t.z) : 0, kind = stationKind(id), it = heldDef();
  if (kind) return emit('station:opened', { kind, x: t.x, y: t.y, z: t.z });
  if (it?.use) return useItem(heldStack(), it);
  if (it?.ammo) { if (creative() || ARROWS.some(a => bag().some(s => s?.id === a))) player.drawing = 0; else toast('You have no arrows.', 2); return; }
  if (t && it?.tool && workGround(it, t)) return;
  if (it?.block != null || it?.place) return placeBlock();
  if (offDef()?.block) { player.guarding = true; return; }
  if (t && !it) toast('Nothing to place. Mine some blocks first (hold left click).', 2);
}
export function releaseUse() {
  player.guarding = false;
  if (player.drawing == null) return;
  const pull = Math.min(1, player.drawing / FULL_DRAW), it = heldDef();
  player.drawing = null;
  if (!it?.ammo || pull < 0.15) return;
  const arrow = ARROWS.find(a => bag().some(s => s?.id === a)) ?? 'arrow';
  if (!creative()) takeItem(arrow);
  const d = lookDir(), from = eye().addScaledVector(d, 0.8), a = ITEMS[arrow];
  spawnProjectile(from, d.multiplyScalar(ARROW_SPEED * pull + 8), { dmg: Math.round((it.dmg * pull + a.arrow) * rule('arrow')), arrow: true, fall: ARROW_DROP, life: 4 });
  wearHeld(1);
  emit('player:struck');
}
export const updateHands = dt => { if (player.drawing != null) { player.drawing += dt; if (!heldDef()?.ammo) player.drawing = null; } if (player.guarding && !G.mouseRight) player.guarding = false; };
