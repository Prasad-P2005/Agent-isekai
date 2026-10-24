// Scene 1: heaven. The soul talks with the god (LLM), then descends into the world.
import * as THREE from 'three';
import { G } from './state.js';
import { api } from './api.js';
import { renderer, camera } from './scene.js';
import { buildAvatar, lookFor } from './avatar.js';
import { applyState } from './ui.js';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const heavenScene = new THREE.Scene();
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
let god = new THREE.Group(), godArms = null; // built when we know whether the deity is a goddess or a god
function makeDeity(kind) {
  heavenScene.remove(god);
  const { g, extra } = buildAvatar(lookFor(kind, kind, 11, { race: 'human' }), 4.2, []);
  g.position.set(0, 0, -3.5); g.rotation.y = Math.PI; // face the camera
  heavenScene.add(g);
  god = g; godArms = extra.arms; godHead = extra.head;
}
let godHead = null;
const halo = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.08, 12, 40), new THREE.MeshBasicMaterial({ color: 0xffd36b }));
halo.position.set(0, 4.9, -3.75); heavenScene.add(halo);
const aura = new THREE.Mesh(new THREE.SphereGeometry(3.2, 32, 16), new THREE.MeshBasicMaterial({ color: 0xfff6c0, transparent: true, opacity: 0.25, depthWrite: false }));
aura.position.set(0, 2.4, -4); heavenScene.add(aura);

let t = 0;
export function renderHeaven(dt) {
  t += dt;
  god.position.y = Math.sin(t * 1.2) * 0.15;
  if (godArms) { // a cheerful wave
    godArms[1].rotation.z = -2.4 + Math.sin(t * 6) * 0.35; godArms[1].rotation.x = 0;
    godArms[0].rotation.z = 0.15;
    godHead.rotation.z = Math.sin(t * 1.5) * 0.08;
  }
  halo.position.y = 4.9 + Math.sin(t * 1.2) * 0.12; halo.rotation.z += dt * 0.5;
  aura.scale.setScalar(1 + Math.sin(t * 2) * 0.04);
  camera.position.set(Math.sin(t * 0.15) * 0.8, 1.9, 4.5);
  camera.lookAt(0, 2.3, -3.5);
  renderer.render(heavenScene, camera);
}

function say(who, text, cls) { const d = document.createElement('div'); d.className = cls; d.innerHTML = `<b>${esc(who)}:</b> ${esc(text)}`; $('hlog').appendChild(d); $('hlog').scrollTop = 1e9; }
export function startHeaven(onDescend) {
  G.phase = 'heaven';
  let descending = false;
  $('heaven').style.display = 'flex';
  const w = G.world;
  makeDeity(w.god_is === 'god' ? 'god' : 'goddess');
  $('hlog').innerHTML = '';
  say(w.god_name, w.god_intro, 'god');
  say(w.god_name, `Sooo, you'll be reborn as ${w.hero}! Little problem though: the Demon Lord ${w.demon_lord_name} of ${w.demon_realm_name} is giving ${w.kingdom} a really hard time, and I'm not allowed to meddle down there myself. That's where you come in! ✨`, 'god');
  const send = async () => {
    const msg = $('hin').value.trim(); if (!msg) return;
    $('hin').value = ''; say('You', msg, 'me');
    const wait = document.createElement('div'); wait.className = 'god'; wait.textContent = '✨ …'; $('hlog').appendChild(wait);
    try { const r = await api.heaven(msg); wait.remove(); say(w.god_name, r.reply, 'god'); } catch { wait.textContent = 'The light flickers…'; }
  };
  $('hsend').onclick = send;
  $('hin').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') send(); };
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
        overlay.classList.add('in-world');
        const title = overlay.querySelector('h1');
        const intro = overlay.querySelector('.box > p:not(.go)');
        if (title) title.textContent = w.name;
        if (intro) intro.textContent = 'Your new life begins here. Click to enter the world.';
        $('menu').innerHTML = '<p class="go">Click anywhere to begin</p>';
        $('controls').style.display = 'block';
        overlay.style.display = 'flex';
      } else {
        G.phase = 'heaven';
        $('heaven').style.display = 'flex';
        say(w.god_name, `The passage could not open: ${error.message || 'please try again in a moment.'}`, 'god');
      }
    } finally {
      fade.style.opacity = 0;
      descending = false;
      button.disabled = false;
      button.textContent = "I'm ready. Send me to the world ⇩";
    }
  };
}
