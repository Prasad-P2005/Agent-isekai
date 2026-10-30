// How bodies move. A pose is a plain function of a motion record, so the same walk serves the world, the bag, heaven and the lookbook.
// Rotations: about x a hanging limb swings forward when positive, and an upright one leans back. About z a hanging limb swings towards +x.
import { ss } from '../sim/noise.js';

const mix = (a, b, t) => a + (b - a) * t;

export const newMotion = (seed = 0) => ({
  seed: seed % 97, t: 0,  // the seed offsets idle motion, so that a crowd does not breathe in time
  phase: 0, walk: 0, run: 0, // where the stride has got to, how much of it shows, and how much of that is a run
  air: 0, rise: 0,        // off the ground, and whether going up (1) or down (-1)
  strike: 0, hurt: 0, scared: 0, // strike runs 0 to 1 over a blow; 0 is no blow
  look: 0, nod: 0, near: false, cross: false,
});

// A blow: drawn back, brought down, then a slower recovery.
const drawn = p => ss(0, 0.26, p) * (1 - ss(0.26, 0.46, p));
const landed = p => ss(0.26, 0.42, p) * (1 - ss(0.58, 1, p));

function softParts(x, m, idle, c) {
  for (const { b, k, lag = 0 } of x.soft) {
    const trail = 0.06 + m.walk * mix(0.25, 0.8, m.run) + m.air * (m.rise < 0 ? 0.7 : 0.2);
    b.rotation.x = k * (-trail + 0.1 * Math.sin(idle * 2.1 + lag) + 0.14 * m.walk * Math.cos(m.phase * 2 + lag));
    b.rotation.z = k * (0.08 * Math.sin(idle * 1.7 + lag) + 0.1 * m.walk * c);
  }
}

export function poseFigure(x, m) {
  const { walk, run, air, rise, hurt, scared, strike } = m;
  const idle = m.t + m.seed, s = Math.sin(m.phase), c = Math.cos(m.phase), still = 1 - walk;
  const up = drawn(strike), hit = landed(strike), stride = mix(0.46, 1, run) * walk;

  x.hips.position.y = x.hipY + Math.cos(m.phase * 2) * mix(0.5, 1.5, run) * walk + Math.sin(idle * 1.8) * 0.25 * still + (x.hover ? Math.sin(idle * 3.1) * 1.6 : 0);
  x.hips.rotation.y = s * 0.14 * walk;
  x.hips.rotation.z = c * 0.05 * walk;
  const lean = x.hunch + 0.24 * run * walk - 0.3 * hurt + 0.22 * hit - 0.12 * up;
  x.chest.rotation.x = -lean;
  x.chest.rotation.y = -s * 0.26 * walk - 0.45 * up + 0.55 * hit;
  x.chest.rotation.z = -c * 0.03 * walk;
  x.head.rotation.x = m.nod + lean * 0.7 + Math.sin(idle * 1.1) * 0.03;
  x.head.rotation.y = m.look + s * 0.12 * walk + 0.25 * up - 0.3 * hit;
  x.head.rotation.z = Math.sin(idle * 0.7) * 0.03;

  x.legs.forEach((thigh, i) => {
    const forward = i ? -s : s, lifting = Math.max(0, i ? -c : c), leads = i === 0;
    thigh.rotation.x = forward * stride + air * (leads ? 0.75 : -0.2) + x.dangle;
    thigh.rotation.z = (i ? 1 : -1) * (0.02 + 0.1 * air);
    x.shins[i].rotation.x = -(0.08 * walk + lifting * mix(0.75, 1.5, run) * walk + air * (leads ? 1.15 : 0.5) + x.dangle * 1.2);
  });
  x.arms.forEach((arm, i) => {
    const out = i ? 1 : -1, carried = x.carry[i], swing = (i ? s : -s) * mix(0.5, 1.05, run) * walk * (carried ? 0.45 : 1);
    let forward = swing - 0.45 * air * (rise > 0 ? 1 : 0.3) + 0.2 * hurt;
    let spread = 0.07 + Math.sin(idle * 1.5 + i) * 0.02 + air * (rise < 0 ? 0.85 : 0.35) + hurt * 0.55;
    let elbow = 0.1 + mix(0.25, 1.15, run) * walk + (carried ? 0.5 : 0) + 0.3 * air;
    forward = mix(forward, 2.7 + Math.sin(m.phase * 2 + i * 3.14) * 0.25, scared);
    spread = mix(spread, 0.25, scared);
    elbow = mix(elbow, 0.35, scared);
    if (i === 1) { // the right arm carries the blow
      forward = mix(mix(forward, 2.8, up), 0.8, hit);
      spread = mix(spread, 0.16, up);
      elbow = mix(mix(elbow, 0.8, up), 0.12, hit);
    }
    arm.rotation.set(forward, 0, out * spread);
    x.fores[i].rotation.x = elbow;
    x.hands[i].rotation.x = 0.12 + 0.2 * walk * run;
  });
  x.tail?.forEach((b, i) => { b.rotation.x = Math.sin(idle * 3.4 - i * 0.9) * (0.12 + 0.1 * i) * (0.6 + walk); });
  softParts(x, m, idle, c);
}

// The wings of anything that flies, whose first joint lifts while the tip follows it round.
function flap(x, rate, reach, idle) {
  x.wings.forEach((wing, i) => {
    const out = i ? 1 : -1;
    wing.rotation.z = out * (Math.sin(idle * rate) * reach + 0.15);
    if (x.tips) x.tips[i].rotation.z = out * (Math.sin(idle * rate - 1.2) * reach * 0.8 - 0.1);
  });
}
export function poseFlier(x, m) {
  poseFigure(x, m);
  flap(x, 15, 0.6, m.t + m.seed);
}

// Four legs at a trot, with the diagonals moving together.
export function poseBeast(x, m) {
  const idle = m.t + m.seed, s = Math.sin(m.phase), c = Math.cos(m.phase), stride = mix(0.42, 0.9, m.run) * m.walk, bite = drawn(m.strike) + landed(m.strike);
  x.legs.forEach((leg, i) => {
    const pair = i === 0 || i === 3 ? 1 : -1, tucked = m.air * (i < 2 ? 0.7 : -0.7);
    leg.rotation.x = pair * s * stride + tucked;
    x.shins[i].rotation.x = -Math.max(0, pair * c) * mix(0.6, 1.1, m.run) * m.walk * (i < 2 ? 1 : -1) - m.air * 0.5;
  });
  x.spine.position.y = x.spineY + Math.cos(m.phase * 2) * mix(0.4, 1.4, m.run) * m.walk + Math.sin(idle * 1.8) * 0.3 * (1 - m.walk);
  x.spine.position.z = -6 * bite;
  x.spine.rotation.x = s * 0.05 * m.walk + 0.12 * m.air * m.rise - 0.2 * m.hurt;
  x.head.rotation.x = m.nod - 0.15 * bite + Math.sin(idle * 1.3) * 0.03;
  x.head.rotation.y = m.look;
  x.jaw.rotation.x = -0.65 * bite;
  x.wag.forEach((b, i) => { b.rotation.y = Math.sin(idle * mix(2, 9, m.walk) - i) * 0.3; b.rotation.x = -0.25 + 0.3 * m.run * m.walk; });
}

export function poseDragon(x, m) {
  const idle = m.t + m.seed, bite = drawn(m.strike) + landed(m.strike);
  flap(x, mix(2.6, 4, m.run), 0.55, idle);
  x.spine.position.y = x.spineY + Math.sin(idle * mix(2.6, 4, m.run) - 1.5) * 2.5;
  x.neck.forEach((b, i) => { b.rotation.x = Math.sin(idle * 1.2 - i) * 0.1 - 0.12; b.rotation.y = m.look * 0.3; });
  x.head.rotation.x = m.nod + 0.2;
  x.head.rotation.y = m.look * 0.4;
  x.jaw.rotation.x = -0.15 - 0.6 * bite;
  x.wag.forEach((b, i) => { b.rotation.y = Math.sin(idle * 1.6 - i * 0.8) * 0.2; b.rotation.x = Math.sin(idle * 1.1 - i) * 0.06; });
  x.legs.forEach(leg => { leg.rotation.x = 0.5; });
}

// A slime is one muscle: it stretches when it leaps, flattens when it lands and wobbles while it waits.
export function poseSlime(x, m) {
  const idle = m.t + m.seed, tall = 1 + 0.3 * m.rise * m.air - 0.8 * m.air * (1 - m.air) * (1 - m.rise) + Math.sin(idle * 3) * 0.03 - 0.25 * m.hurt;
  const wide = 1 / Math.sqrt(Math.max(0.5, tall));
  x.blob.scale.set(wide, tall, wide);
}

export function poseStone(x, m) {
  const idle = m.t + m.seed;
  x.crystal.position.y = x.crystalY + Math.sin(idle * 1.1) * 1.5;
  x.crystal.rotation.y = idle * 0.6;
}
