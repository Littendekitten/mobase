// ===== FIREBASE =====
const firebaseConfig = {
  apiKey: "AIzaSyAx_y1CrS6QOrgM1nyapiGomPzpylq6_RE",
  authDomain: "kitacat-mobase.firebaseapp.com",
  databaseURL: "https://kitacat-mobase-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "kitacat-mobase",
  storageBucket: "kitacat-mobase.firebasestorage.app",
  messagingSenderId: "732220884685",
  appId: "1:732220884685:web:c62afbc193aef6abebcb84",
  measurementId: "G-6LRWS8CS5F"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database(), fs = firebase.firestore(), auth = firebase.auth();
const $ = id => document.getElementById(id);

let uid = null, pname = 'Survivor', net = false;
let hp = 100, scrap = 60, mode = 'combat', sel = 1, nightNo = 0, dayT = 0.12, wasNight = false, spawnCd = 0, hurtCd = 0;
const remote = {}, blocks = {}, mobs = [], tracers = [];

function start(id, name, online) {
  uid = id; pname = name; net = online;
  $('player-name').innerText = name;
  $('status').innerText = online ? 'Online' : 'Offline'; $('status').className = 'success';
  $('google-btn').style.display = $('offline-btn').style.display = $('login-subtext').style.display = 'none';
  $('controls-info').style.display = 'block'; $('blocker').style.cursor = 'pointer';
  if (online) initNet();
  $('player-count').innerText = 1;
}
$('google-btn').onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => alert('Login failed: ' + e.message));
$('offline-btn').onclick = () => start('offline', 'Wanderer', false);
auth.onAuthStateChanged(u => {
  if (!u) return;
  start(u.uid, u.displayName || 'Survivor', true);
  fs.collection('users').doc(u.uid).set({ name: pname, email: u.email, photoURL: u.photoURL, lastLogin: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
});

// ===== NOISE / TERRAIN HEIGHT =====
const hs = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const vn = (x, z) => { const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  return hs(i, j) * (1 - a) * (1 - b) + hs(i + 1, j) * a * (1 - b) + hs(i, j + 1) * (1 - a) * b + hs(i + 1, j + 1) * a * b; };
const fbm = (x, z) => { let s = 0, a = .5; for (let o = 0; o < 4; o++) { s += a * vn(x, z); x *= 2; z *= 2; a /= 2; } return s; };
const H = (x, z) => { const m = Math.min(1, Math.max(0, (Math.hypot(x, z) - 25) / 55)), s = m * m * (3 - 2 * m); return (fbm(x * .008, z * .008) - .4) * 50 * s; };

// ===== SCENE =====
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x8a7d62, 0.014);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const composer = new THREE.EffectComposer(renderer);
composer.addPass(new THREE.RenderPass(scene, camera));
composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .7, .6, .85));

const sun = new THREE.DirectionalLight(0xffe0a0, 1);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 400 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x9ab, 0x332a20, .4); scene.add(hemi);

const skyU = { t: { value: new THREE.Color() }, b: { value: new THREE.Color() } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 16, 8), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying float h;void main(){h=normalize(position).y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform vec3 t,b;varying float h;void main(){gl_FragColor=vec4(mix(b,t,pow(max(h,0.),.55)),1.);}' }));
scene.add(sky);
const sp = []; for (let i = 0; i < 900; i++) { const a = Math.random() * 6.283, e = Math.acos(Math.random()); sp.push(Math.cos(a) * Math.sin(e) * 420, Math.cos(e) * 420, Math.sin(a) * Math.sin(e) * 420); }
const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
scene.add(stars);

// ===== CHUNKED INFINITE WORLD =====
const CS = 64, RAD = 2, chunks = {}, tg = new THREE.Group(), bg = new THREE.Group(), mg = new THREE.Group();
scene.add(tg, bg, mg);
const terrMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
const propMats = [new THREE.MeshStandardMaterial({ color: 0x1b1612, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0x4a4a46, roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x58585a, roughness: .9 }), new THREE.MeshStandardMaterial({ color: 0x33ff88, emissive: 0x22ff77, emissiveIntensity: 2.2 })];
const propGeo = [new THREE.CylinderGeometry(.18, .3, 1, 6).translate(0, .5, 0), new THREE.DodecahedronGeometry(1).translate(0, .3, 0),
  new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), new THREE.OctahedronGeometry(.5).translate(0, .5, 0)];
const propCfg = [[26, () => [1, 4 + Math.random() * 5, 1]], [14, () => { const s = 1 + Math.random() * 1.8; return [s, s * .8, s]; }],
  [5, () => [2.5 + Math.random() * 3, 4 + Math.random() * 6, 2.5 + Math.random() * 3]], [7, () => { const s = 1 + Math.random() * 2; return [s * .6, s * 2, s * .6]; }]];

function makeChunk(i, j) {
  const g = new THREE.PlaneGeometry(CS, CS, 24, 24); g.rotateX(-Math.PI / 2);
  const p = g.attributes.position, col = [], c = new THREE.Color();
  for (let n = 0; n < p.count; n++) {
    const x = p.getX(n) + i * CS, z = p.getZ(n) + j * CS, h = H(x, z); p.setXYZ(n, x, h, z);
    const m = Math.min(1, Math.max(0, (vn(x * .04, z * .04) - .35) * 3));
    c.setHSL(.1 + .12 * m, .22 + .2 * m, .13 + .05 * m + .05 * vn(x * .4, z * .4) + Math.max(0, h) * .004); col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, terrMat); mesh.receiveShadow = true; tg.add(mesh);
  const props = [], d = new THREE.Object3D();
  propCfg.forEach(([n, sc], k) => {
    const im = new THREE.InstancedMesh(propGeo[k], propMats[k], n); let cnt = 0;
    for (let q = 0; q < n; q++) {
      const x = (i - .5 + Math.random()) * CS, z = (j - .5 + Math.random()) * CS; if (Math.hypot(x, z) < 24) continue;
      d.position.set(x, H(x, z) - .2, z); d.rotation.set(0, Math.random() * 6.28, 0); const s = sc(); d.scale.set(...s); d.updateMatrix(); im.setMatrixAt(cnt++, d.matrix);
    }
    im.count = cnt; im.castShadow = true; im.receiveShadow = true; scene.add(im); props.push(im);
  });
  chunks[i + ',' + j] = { mesh, props };
}
function updateChunks() {
  const ci = Math.round(camera.position.x / CS), cj = Math.round(camera.position.z / CS);
  for (let i = ci - RAD; i <= ci + RAD; i++) for (let j = cj - RAD; j <= cj + RAD; j++) if (!chunks[i + ',' + j]) makeChunk(i, j);
  for (const k in chunks) { const [i, j] = k.split(',').map(Number);
    if (Math.abs(i - ci) > RAD + 1 || Math.abs(j - cj) > RAD + 1) { const c = chunks[k]; tg.remove(c.mesh); c.mesh.geometry.dispose(); c.props.forEach(m => { scene.remove(m); m.dispose(); }); delete chunks[k]; } }
}

// ===== BLOCKS =====
const TYPES = { 1: { n: 'WALL', c: 0x6b6f66, cost: 1 }, 2: { n: 'STEEL', c: 0x9aa7b0, cost: 2, m: .9 }, 3: { n: 'LAMP', c: 0xffb347, cost: 2, e: 1 }, 4: { n: 'TURRET', c: 0x3a4a3a, cost: 15, m: .6 } };
const bmats = {}, boxG = new THREE.BoxGeometry(2, 2, 2), redM = new THREE.MeshStandardMaterial({ color: 0xff2244, emissive: 0xff0022, emissiveIntensity: 1.5 });
for (const k in TYPES) { const T = TYPES[k]; bmats[k] = new THREE.MeshStandardMaterial({ color: T.c, roughness: .7, metalness: T.m || .1, emissive: T.e ? T.c : 0, emissiveIntensity: T.e ? 2.5 : 0 }); }
$('hotbar').innerHTML = Object.keys(TYPES).map(k => `<div class="slot" id="s${k}"><i style="background:#${TYPES[k].c.toString(16).padStart(6, '0')}"></i>${k} ${TYPES[k].n}<br>${TYPES[k].cost}</div>`).join('');

const cx = v => Math.round(v / 2) * 2, cy = v => Math.round((v - 1) / 2) * 2 + 1;
const solid = (x, y, z) => blocks[cx(x) + '_' + cy(y) + '_' + cx(z)];
function addBlock(k, d) {
  rmBlock(k); const t = d.t || 1, g = new THREE.Group(), m = new THREE.Mesh(boxG, bmats[t]);
  m.castShadow = m.receiveShadow = true; m.userData.key = k; g.add(m);
  if (t === 4) { const pv = new THREE.Group(); pv.position.y = 1.2; const b = new THREE.Mesh(new THREE.BoxGeometry(.3, .3, 1.6), redM); b.position.z = -.8; pv.add(b); g.add(pv); g.userData.pv = pv; g.userData.cd = 0; }
  g.position.set(d.x, d.y, d.z); bg.add(g); blocks[k] = { d, g };
}
function rmBlock(k) { if (blocks[k]) { bg.remove(blocks[k].g); delete blocks[k]; } }
function setBlock(x, y, z, t) { const k = x + '_' + y + '_' + z, d = { x, y, z, t, o: uid }; net ? db.ref('bases/' + k).set(d) : addBlock(k, d); }
function delBlock(k) { net ? db.ref('bases/' + k).remove() : rmBlock(k); }

// ===== MULTIPLAYER =====
function initNet() {
  db.ref('bases').on('child_added', s => addBlock(s.key, s.val()));
  db.ref('bases').on('child_changed', s => addBlock(s.key, s.val()));
  db.ref('bases').on('child_removed', s => rmBlock(s.key));
  const me = db.ref('players/' + uid); me.onDisconnect().remove();
  setInterval(() => { if (controls.isLocked) me.set({ name: pname, x: camera.position.x, y: camera.position.y, z: camera.position.z }); }, 100);
  db.ref('players').on('child_added', s => {
    if (s.key === uid) return; const d = s.val(), g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 1.2, 10), new THREE.MeshStandardMaterial({ color: 0xff0055, emissive: 0x550022 })); body.position.y = .6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.3, 10, 8), body.material); head.position.y = 1.5; body.castShadow = true;
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const cc = cv.getContext('2d');
    cc.font = 'bold 34px Courier New'; cc.textAlign = 'center'; cc.fillStyle = '#0f6'; cc.fillText(d.name || 'Survivor', 128, 42);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false })); tag.scale.set(3, .75, 1); tag.position.y = 2.3;
    g.add(body, head, tag); g.position.set(d.x, d.y - EYE, d.z); scene.add(g);
    remote[s.key] = { g, tp: new THREE.Vector3(d.x, d.y - EYE, d.z) }; $('player-count').innerText = Object.keys(remote).length + 1;
  });
  db.ref('players').on('child_changed', s => { const r = remote[s.key]; if (r) { const d = s.val(); r.tp.set(d.x, d.y - EYE, d.z); } });
  db.ref('players').on('child_removed', s => { if (remote[s.key]) { scene.remove(remote[s.key].g); delete remote[s.key]; $('player-count').innerText = Object.keys(remote).length + 1; } });
}

// ===== CONTROLS / PHYSICS =====
const controls = new THREE.PointerLockControls(camera, document.body), P = camera.position, EYE = 1.6, R = .35;
$('blocker').addEventListener('click', () => { if (uid) controls.lock(); });
controls.addEventListener('lock', () => $('blocker').style.display = 'none');
controls.addEventListener('unlock', () => $('blocker').style.display = 'flex');
P.set(0, EYE, 8);
let vx = 0, vz = 0, vy = 0, ground = true; const key = {};
addEventListener('keydown', e => {
  key[e.code] = 1;
  if (e.code === 'KeyQ') mode = mode === 'build' ? 'combat' : 'build';
  if (e.code >= 'Digit1' && e.code <= 'Digit4') { sel = +e.code[5]; mode = 'build'; }
  if (e.code === 'Space' && ground) { vy = 13; ground = false; }
});
addEventListener('keyup', e => delete key[e.code]);
const hit = (x, y, z) => { const f = y - EYE; for (const a of [-R, R]) for (const b of [-R, R]) for (const h of [.1, .9, 1.6]) if (solid(x + a, f + h, z + b)) return true; return false; };

const rc = new THREE.Raycaster();
const ray = (objs, far) => { rc.far = far; rc.setFromCamera({ x: 0, y: 0 }, camera); return rc.intersectObjects(objs, true); };
function tracer(a, b, color) {
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color, transparent: true }));
  scene.add(l); tracers.push({ l, life: .12 });
}
let shotCd = 0;
addEventListener('mousedown', e => {
  if (!controls.isLocked) return;
  if (mode === 'combat' && e.button === 0 && shotCd <= 0) {
    shotCd = .18; const h = ray([mg, bg, tg], 90)[0], dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    tracer(camera.localToWorld(new THREE.Vector3(.3, -.25, -1)), h ? h.point : P.clone().addScaledVector(dir, 90), 0xffee88);
    if (h && h.object.parent.userData.mob) hurtMob(h.object.parent, 20);
  } else if (mode === 'build') {
    const h = ray([tg, bg], 12)[0]; if (!h) return;
    if (e.button === 0) {
      const T = TYPES[sel]; if (scrap < T.cost) return;
      const t = h.point.clone().add(h.face.normal.clone()), x = cx(t.x), y = Math.max(1, cy(t.y)), z = cx(t.z), k = x + '_' + y + '_' + z;
      if (blocks[k] || (Math.abs(x - P.x) < 1.6 && Math.abs(z - P.z) < 1.6 && Math.abs(y - (P.y - .8)) < 2.3)) return;
      scrap -= T.cost; setBlock(x, y, z, sel);
    } else if (e.button === 2) {
      const k = h.object.userData.key; if (k && blocks[k] && blocks[k].d.o === uid) { scrap += TYPES[blocks[k].d.t || 1].cost; delBlock(k); }
    }
  }
});
addEventListener('contextmenu', e => e.preventDefault());

// ===== MOBS =====
const mobMat = new THREE.MeshStandardMaterial({ color: 0x5d6b50, roughness: .9 }), eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff2200, emissiveIntensity: 3 });
function spawnMob() {
  const a = Math.random() * 6.283, r = 40 + Math.random() * 20, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r, g = new THREE.Group();
  const part = (w, h, d, px, py, pz, m = mobMat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(px, py, pz); b.castShadow = true; g.add(b); return b; };
  part(.8, 1.1, .4, 0, 1.0, 0); part(.5, .5, .5, 0, 1.8, 0); part(.1, .08, .05, -.12, 1.85, .26, eyeMat); part(.1, .08, .05, .12, 1.85, .26, eyeMat);
  part(.22, .9, .22, -.55, 1.2, .3).rotation.x = -1.2; part(.22, .9, .22, .55, 1.2, .3).rotation.x = -1.2; part(.25, .7, .25, -.2, .35, 0); part(.25, .7, .25, .2, .35, 0);
  g.userData.mob = { hp: 30 + nightNo * 8, sp: 2.4 + Math.random() * 1.2 + nightNo * .1, ph: Math.random() * 6 };
  g.position.set(x, H(x, z), z); mg.add(g); mobs.push(g);
}
function hurtMob(g, d) { const m = g.userData.mob; m.hp -= d; if (m.hp <= 0) { scrap += 3 + nightNo; mg.remove(g); mobs.splice(mobs.indexOf(g), 1); } }
function updateMobs(dt, t) {
  for (const g of mobs) {
    const m = g.userData.mob, dx = P.x - g.position.x, dz = P.z - g.position.z, d = Math.hypot(dx, dz);
    g.rotation.y = Math.atan2(dx, dz); g.rotation.z = Math.sin(t * 8 + m.ph) * .07;
    if (d > 1.4) {
      const sx = dx / d * m.sp * dt, sz = dz / d * m.sp * dt, y = g.position.y;
      if (!solid(g.position.x + sx * 3, y + .5, g.position.z) && !solid(g.position.x + sx * 3, y + 1.5, g.position.z)) g.position.x += sx;
      if (!solid(g.position.x, y + .5, g.position.z + sz * 3) && !solid(g.position.x, y + 1.5, g.position.z + sz * 3)) g.position.z += sz;
      g.position.y = H(g.position.x, g.position.z);
    } else if (hurtCd <= 0 && Math.abs(P.y - EYE - g.position.y) < 2.5) {
      hp -= 8 + nightNo; hurtCd = .8; $('hurt').style.opacity = 1; setTimeout(() => $('hurt').style.opacity = 0, 120);
    }
  }
}
function updateTurrets(dt) {
  for (const k in blocks) {
    const b = blocks[k]; if (b.d.t !== 4) continue; const u = b.g.userData; u.cd -= dt;
    let best = null, bd = 22; for (const m of mobs) { const d = m.position.distanceTo(b.g.position); if (d < bd) { bd = d; best = m; } }
    if (!best) continue;
    const to = best.position.clone().add(new THREE.Vector3(0, 1.2, 0)); u.pv.lookAt(to);
    if (u.cd <= 0) { u.cd = .7; tracer(b.g.position.clone().add(new THREE.Vector3(0, 1.2, 0)), to, 0xff4466); hurtMob(best, 14); }
  }
}

// ===== LOOP =====
const PAL = { dt: new THREE.Color(0x6a8f9a), db: new THREE.Color(0xc2a878), nt: new THREE.Color(0x02040c), nb: new THREE.Color(0x0c1c18) };
const tmp = new THREE.Color(); let t = 0, last = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(), dt = Math.min((now - last) / 1000, .05); last = now; t += dt; shotCd -= dt; hurtCd -= dt;

  if (controls.isLocked) {
    const f = (key.KeyW ? 1 : 0) - (key.KeyS ? 1 : 0), r = (key.KeyD ? 1 : 0) - (key.KeyA ? 1 : 0), yaw = camera.rotation.y;
    const wx = -Math.sin(yaw) * f + Math.cos(yaw) * r, wz = -Math.cos(yaw) * f - Math.sin(yaw) * r, l = Math.hypot(wx, wz) || 1, spd = key.ShiftLeft ? 9 : 5.5, k = Math.min(1, 10 * dt);
    vx += (wx / l * spd - vx) * k; vz += (wz / l * spd - vz) * k;
    if (!hit(P.x + vx * dt, P.y, P.z)) P.x += vx * dt;
    if (!hit(P.x, P.y, P.z + vz * dt)) P.z += vz * dt;
    vy -= 30 * dt; P.y += vy * dt; const gy = H(P.x, P.z) + EYE; ground = false;
    if (P.y <= gy) { P.y = gy; vy = 0; ground = true; }
    if (hit(P.x, P.y, P.z)) { if (vy <= 0) { P.y = cy(P.y - EYE + .1) + 1 + EYE; vy = 0; ground = true; } else { P.y -= vy * dt; vy = 0; } }
    else if (vy <= 0 && hit(P.x, P.y - .15, P.z)) { ground = true; vy = 0; }

    dayT = (dayT + dt / 220) % 1;
    const isNight = Math.sin(dayT * 6.283) < .05;
    if (isNight && !wasNight) { nightNo++; spawnCd = 0; }
    if (!isNight && wasNight) { mobs.forEach(m => mg.remove(m)); mobs.length = 0; }
    wasNight = isNight;
    if (isNight && (spawnCd -= dt) <= 0 && mobs.length < 6 + nightNo * 3) { spawnMob(); spawnCd = 2.5; }
    updateMobs(dt, t); updateTurrets(dt);
    if (hp < 100 && hurtCd < -4) hp = Math.min(100, hp + dt * 3);
    if (hp <= 0) { P.set(0, EYE, 8); vx = vz = vy = 0; hp = 100; scrap = Math.floor(scrap / 2); }
    if (net && !(t % 1 > .99)) { /* position sent by interval */ }
  }

  updateChunks();
  // sky & light
  const se = Math.sin(dayT * 6.283), day = Math.min(1, Math.max(0, se * 3 + .4)), ang = dayT * 6.283;
  skyU.t.value.copy(PAL.nt).lerp(PAL.dt, day); skyU.b.value.copy(PAL.nb).lerp(PAL.db, day);
  scene.fog.color.copy(skyU.b.value); scene.fog.density = .013 + (1 - day) * .006;
  sun.position.set(P.x + Math.cos(ang) * 120 * (se >= 0 ? 1 : -1), P.y + Math.abs(se) * 120 + 15, P.z + 40); sun.target.position.copy(P);
  sun.intensity = .25 + day * 1.1; sun.color.set(day > .5 ? 0xffe2a8 : 0x6f8cff); hemi.intensity = .18 + day * .35;
  stars.material.opacity = 1 - day; stars.position.copy(P); sky.position.copy(P);

  for (let i = tracers.length - 1; i >= 0; i--) { const q = tracers[i]; q.life -= dt; q.l.material.opacity = Math.max(0, q.life / .12); if (q.life <= 0) { scene.remove(q.l); q.l.geometry.dispose(); tracers.splice(i, 1); } }
  for (const id in remote) remote[id].g.position.lerp(remote[id].tp, .2);

  $('scrap').innerText = scrap; $('mode').innerText = mode.toUpperCase();
  $('hpfill').style.width = Math.max(0, hp) + '%';
  $('clock').innerText = wasNight ? `NIGHT ${nightNo} - MOBS: ${mobs.length}` : `DAY - NIGHT ${nightNo + 1} COMES`;
  $('clock').className = wasNight ? 'warning' : 'success';
  for (const k in TYPES) $('s' + k).className = 'slot' + (mode === 'build' && +k === sel ? ' on' : '');
  composer.render();
}
loop();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});
