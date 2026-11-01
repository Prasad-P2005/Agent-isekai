// Scene 1: heaven. The soul talks with the god, then descends into the world.
import * as THREE from 'three';
import { G } from '../core/state.js';
import { api } from '../net/api.js';
import { applyState } from '../sim/effects.js';
import { renderer, camera } from '../view/scene.js';
import { buildAvatar, lookFor } from '../view/avatar.js';
import { newMotion } from '../view/pose.js';
import { esc, rich } from './art.js';

const $ = id => document.getElementById(id);
const heavenScene = new THREE.Scene();
heavenScene.background = new THREE.Color(0xfff2d8);
heavenScene.fog = new THREE.Fog(0xfff2d8, 20, 90);
heavenScene.add(new THREE.HemisphereLight(0xffffff, 0xffe0b0, 1.6));
const sun = new THREE.DirectionalLight(0xfff0c0, 1.2); sun.position.set(2, 5, 3); heavenScene.add(sun);

// clouds
const cloudGeo = new THREE.BoxGeometry(1, 1, 1), cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, 500), m = new THREE.Matrix4();
for (let i = 0; i < 500; i++) {
  const a = Math.random() * 6.28, r = 6 + Math.random() * 60, s = 2 + Math.random() * 5;
  m.compose(new THREE.Vector3(Math.cos(a) * r, -1.5 - Math.random() * 2, Math.sin(a) * r), new THREE.Quaternion(), new THREE.Vector3(s, 1 + Math.random(), s * (0.6 + Math.random())));
  clouds.setMatrixAt(i, m);
}
heavenScene.add(clouds);
// golden platform and pillars
const plat = new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, 0.6, 48), new THREE.MeshLambertMaterial({ color: 0xf3e6c0 }));
plat.position.y = -0.3; heavenScene.add(plat);
for (let i = 0; i < 8; i++) {
  const a = i / 8 * Math.PI * 2, p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 6, 0.7), new THREE.MeshLambertMaterial({ color: 0xfaf4e8 }));
  p.position.set(Math.cos(a) * 6.4, 3, Math.sin(a) * 6.4); heavenScene.add(p);
}
// the god
let god = new THREE.Group(), godBones = null, godPose = null; // built when we know whether the deity is a goddess or a god
const godMotion = newMotion();
function makeDeity(kind) {
  heavenScene.remove(god);
  const { g, extra, pose } = buildAvatar(lookFor(kind, kind, 11, { race: 'human' }), 4.2, []);
  g.position.set(0, 0, -3.5); g.rotation.y = Math.PI; // face the camera
  heavenScene.add(g);
  god = g; godBones = extra; godPose = pose;
}
const halo = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.08, 12, 40), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
halo.position.set(0, 4.9, -3.75); heavenScene.add(halo);
const aura = new THREE.Mesh(new THREE.SphereGeometry(3.2, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.25, depthWrite: false }));
aura.position.set(0, 2.4, -4); heavenScene.add(aura);

let t = 0;
export function renderHeaven(dt) {
  t += dt;
  god.position.y = Math.sin(t * 1.2) * 0.15;
  if (godBones) { // a cheerful wave, from the elbow and the wrist
    godMotion.t = t;
    godPose(godBones, godMotion);
    godBones.arms[1].rotation.set(0, 0, 2.55);
    godBones.fores[1].rotation.set(0, 0, 0.35 + Math.sin(t * 6) * 0.3);
    godBones.hands[1].rotation.z = Math.sin(t * 6 - 0.8) * 0.3;
    godBones.head.rotation.z = Math.sin(t * 1.5) * 0.08;
  }
  halo.position.y = 4.9 + Math.sin(t * 1.2) * 0.12; halo.rotation.z += dt * 0.5;
  aura.scale.setScalar(1 + Math.sin(t * 2) * 0.04);
  camera.position.set(Math.sin(t * 0.15) * 0.8, 1.9, 4.5);
  camera.lookAt(0, 2.3, -3.5);
  renderer.render(heavenScene, camera);
}

// Heaven talks the way everyone does: one line at a time in the same small box, and then what to say back.
let lines = [], replies = [];
const CONTINUE = { id: 'continue', label: 'Continue' };
const showTopics = topics => { $('htopics').innerHTML = topics.map((t, i) => `<button type="button" data-topic="${esc(t.id)}"><kbd>${i + 1}</kbd><span>${esc(t.label)}</span></button>`).join(''); };
function nextLine() {
  $('hlog').innerHTML = rich(lines.shift());
  $('hlog').scrollTop = 0;
  showTopics(lines.length ? [CONTINUE] : replies);
}
addEventListener('keydown', e => {
  if (G.phase !== 'heaven') return;
  const lone = (e.code === 'Enter' || e.code === 'Space') && $('htopics').children.length === 1;
  const pick = /^Digit([1-9])$/.exec(e.code)?.[1] ?? (lone ? 1 : 0);
  if (pick) $('htopics').children[pick - 1]?.click();
});
export function startHeaven(onDescend) {
  G.phase = 'heaven';
  let descending = false;
  $('heaven').style.display = 'flex';
  const w = G.world;
  makeDeity(w.god_is === 'god' ? 'god' : 'goddess');
  $('hlog').textContent = '';
  $('hname').textContent = w.god_name;
  const hear = async topic => {
    try {
      const r = await api.heaven(topic);
      lines = [...r.lines]; replies = r.topics;
      nextLine();
    } catch { lines = ['The light flickers…']; replies = []; nextLine(); }
  };
  $('htopics').onclick = e => {
    const b = e.target.closest('button[data-topic]');
    if (!b) return;
    if (b.dataset.topic === 'continue') return nextLine();
    showTopics([]);
    hear(b.dataset.topic);
  };
  hear('hello');
  $('hdescend').onclick = async () => {
    // This handler awaits the server and several animation steps. Without a
    // guard, a second click starts another transition and calls onDescend
    // twice, which can leave the heaven renderer and world overlay fighting.
    if (descending) return;
    descending = true;
    const button = $('hdescend');
    button.disabled = true;
    button.textContent = 'Guiding you into the world…';
    const fade = $('fade');
    // Make the fade cover instant so the canvas never peeks through while
    // the heaven overlay disappears. The CSS transition is restored later
    // for the smooth fade-out into the world.
    fade.style.transition = 'none';
    fade.style.opacity = 1;
    // Force a style recalc so the browser commits the instant opacity
    // before the display change removes the heaven scene.
    fade.offsetHeight;          // eslint-disable-line no-unused-expressions
    fade.style.transition = '';
    $('heaven').style.display = 'none';
    let descended = false;
    try {
      let state = null;
      try {
        state = await api.descend();
        descended = true;
      } catch (error) {
        // The server may have saved the descent even if its response was lost.
        const status = await api.status().catch(() => null);
        if (status?.descended) descended = true;
        else throw error;
      }
      if (state) applyState(state);
      if (G.world?.player) G.world.player.descended = true;
      // Switch scenes under the cover, then let the world renderer paint
      // before exposing it. This avoids revealing an uninitialized canvas.
      G.phase = 'world';
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      $('card').innerHTML = `<div class="ch">Chapter I</div><h1>${esc(w.name)}</h1><p>You awaken as ${esc(w.hero)}.</p><p class="mission">Mission: slay the Demon Lord ${esc(w.demon_lord_name)}.</p>`;
      $('card').style.opacity = 1;
      await new Promise(r => setTimeout(r, 2400));
      $('card').style.opacity = 0;
      fade.style.opacity = 0;
      await new Promise(r => setTimeout(r, 1250));
      await onDescend();
    } catch (error) {
      console.error('Descent handoff failed:', error);
      if (descended) {
        // Once the server accepts descent, an interface error must not send
        // the player back to heaven. Recover to the world entry screen.
        G.phase = 'world';
        $('heaven').style.display = 'none';
        $('card').style.opacity = 0;
        const overlay = $('overlay');
        overlay.querySelector('h1').textContent = w.name;
        $('lede').textContent = 'Your new life begins here. Click to enter the world.';
        $('menu').innerHTML = '<p class="go">Click anywhere to begin</p>';
        overlay.style.display = 'flex';
      } else {
        G.phase = 'heaven';
        $('heaven').style.display = 'flex';
        lines = [`The passage could not open: ${error.message || 'please try again in a moment.'}`];
        nextLine();
      }
    } finally {
      fade.style.opacity = 0;
      descending = false;
      button.disabled = false;
      button.textContent = "I'm ready. Send me to the world";
    }
  };
}
