// What the player can cast and drink.
import { emit, toast } from '../core/events.js';
import { eye, has, heal, lookDir, player } from './player.js';
import { spawnProjectile } from './projectiles.js';

export function doubleJump() {
  if (!player.onGround && !player.fly && !player.dj && has('double_jump')) { player.dj = true; player.vel.y = 9; }
}
export function toggleFlight() {
  if (has('flight')) { player.fly = !player.fly; player.vel.y = 0; } else toast('You have not learned flight.', 2);
}
export function castFireball() {
  if (!has('fireball')) return toast('You do not know the fireball spell. (Buy a scroll from a merchant)');
  if (player.mana < 20) return toast('Not enough mana.', 2);
  player.mana -= 20;
  const d = lookDir();
  spawnProjectile(eye().addScaledVector(d, 0.8), d.multiplyScalar(30));
}
export function castHeal() {
  if (!has('heal')) return toast('You do not know the healing spell.');
  if (player.mana < 35) return toast('Not enough mana.', 2);
  player.mana -= 35; heal(8); toast('✚ Healing light surrounds you.', 2);
}
// The server keeps the potion count, so a drink only takes effect once it answers.
export const drink = item => emit('item:used', item);
export function drank(item, ok) {
  if (!ok) return toast(item === 'potion' ? 'No health potions.' : 'No mana potions.', 2);
  if (item === 'potion') heal(10); else player.mana = Math.min(player.maxMana, player.mana + 50);
}
