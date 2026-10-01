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
let hp = 100, scrap = 60, mode = 'combat', sel = 1, nightNo = 0, dayT = 0.2, logs = 0, doors = 0, wasNight = false, spawnCd = 0, hurtCd = 0;
const remote = {}, blocks = {}, mobs = [], tracers = [], trunks = [];

function start(id, name, online) {
  uid = id; pname = name; net = online;
  $('player-name').innerText = name;
  $('status').innerText = online ? 'Online' : 'Offline'; $('status').className = 'success';
  $('google-btn').style.display = $('login-subtext').style.display = 'none';
  $('controls-info').style.display = 'block'; $('blocker').style.cursor = 'pointer';
  if (online) initNet();
  $('player-count').innerText = 1;
}
$('google-btn').onclick = () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(e => alert('Login failed: ' + e.message));
let loaded = false, saveT = 0;
const userDoc = () => fs.collection('users').doc(uid);
auth.onAuthStateChanged(u => {
  if (!u) return;
  start(u.uid, u.displayName || 'Survivor', true);
  userDoc().get().then(d => {
    const v = d.exists ? d.data() : {};
    if (v.pos) P.set(v.pos.x, Math.max(v.pos.y, H(v.pos.x, v.pos.z) + EYE), v.pos.z);
    if (v.scrap != null) scrap = v.scrap; if (v.nightNo != null) nightNo = v.nightNo; if (v.logs != null) logs = v.logs; if (v.doors != null) doors = v.doors;
    wasNight = Math.sin(dayT * 6.283) < .62;
  }).catch(() => {}).then(() => {
    loaded = true;
    userDoc().set({ name: pname, email: u.email, photoURL: u.photoURL, lastLogin: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
  });
});
function save() { if (!loaded) return; userDoc().set({ pos: { x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2) }, scrap, nightNo, logs, doors }, { merge: true }).catch(() => {}); }
addEventListener('pagehide', save); addEventListener('visibilitychange', () => { if (document.hidden) save(); });

// ===== NOISE / TERRAIN HEIGHT =====
const hs = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const vn = (x, z) => { const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  return hs(i, j) * (1 - a) * (1 - b) + hs(i + 1, j) * a * (1 - b) + hs(i, j + 1) * (1 - a) * b + hs(i + 1, j + 1) * a * b; };
const fbm = (x, z) => { let s = 0, a = .5; for (let o = 0; o < 4; o++) { s += a * vn(x, z); x *= 2; z *= 2; a /= 2; } return s; };
const H0 = (x, z) => { const m = Math.min(1, Math.max(0, (Math.hypot(x, z) - 25) / 55)), s = m * m * (3 - 2 * m); return (fbm(x * .008, z * .008) - .4) * 50 * s; };

let dn = 0; const dg = {};
const D = (x, z) => { if (!dn) return 0; const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j;
  return (dg[i + ',' + j] || 0) * (1 - u) * (1 - v) + (dg[(i + 1) + ',' + j] || 0) * u * (1 - v) + (dg[i + ',' + (j + 1)] || 0) * (1 - u) * v + (dg[(i + 1) + ',' + (j + 1)] || 0) * u * v; };
const H = (x, z) => H0(x, z) + D(x, z);

// ===== SCENE =====
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x8a7d62, 0.014);
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const PR = renderer.getPixelRatio();
const composer = new THREE.EffectComposer(renderer, renderer.capabilities.isWebGL2 ? new THREE.WebGLMultisampleRenderTarget(innerWidth * PR, innerHeight * PR, { format: THREE.RGBAFormat }) : undefined);
composer.addPass(new THREE.RenderPass(scene, camera));
composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .8, .7, .95));
const grade = new THREE.ShaderPass({ uniforms: { tDiffuse: { value: null }, time: { value: 1 } },
  vertexShader: 'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform sampler2D tDiffuse;uniform float time;varying vec2 v;float r(vec2 s){return fract(sin(dot(s,vec2(12.9898,78.233)))*43758.5453);}void main(){vec2 o=(v-.5)*.004;vec3 c=vec3(texture2D(tDiffuse,v+o).r,texture2D(tDiffuse,v).g,texture2D(tDiffuse,v-o).b);c*=1.3;c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);c=pow(c,vec3(.9));c*=1.-pow(length(v-.5)*1.25,2.5)*.7;c+=(r(v*time)-.5)*.05;gl_FragColor=vec4(c,1.);}' });
composer.addPass(grade);

const sun = new THREE.DirectionalLight(0xffe0a0, 1);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 400 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x9ab, 0x332a20, .4); scene.add(hemi);

const skyU = { t: { value: new THREE.Color() }, b: { value: new THREE.Color() }, sd: { value: new THREE.Vector3(0, 1, 0) } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 12), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform vec3 t,b,sd;varying vec3 p;void main(){vec3 c=mix(b,t,pow(max(p.y,0.),.5));float s=max(dot(p,sd),0.),m=max(dot(p,-sd),0.);c+=vec3(1.,.75,.45)*(pow(s,900.)*6.+pow(s,6.)*.18)*step(-.1,sd.y);c+=vec3(.6,.7,1.)*pow(m,1500.)*3.*step(sd.y,.1);gl_FragColor=vec4(c,1.);}' }));
scene.add(sky);
const AN = 500, ap = new Float32Array(AN * 3).map(() => (Math.random() - .5) * 60), ag = new THREE.BufferGeometry();
ag.setAttribute('position', new THREE.BufferAttribute(ap, 3));
const ash = new THREE.Points(ag, new THREE.PointsMaterial({ color: 0xcfc2a8, size: .08, transparent: true, opacity: .6, depthWrite: false }));
ash.frustumCulled = false; scene.add(ash);
const wrap = (v, c) => c + ((v - c + 30) % 60 + 60) % 60 - 30;
scene.add(camera); const flash = new THREE.SpotLight(0xfff2cc, 0, 45, .5, .5, 1.5); flash.position.set(.2, -.1, 0); flash.target.position.set(0, 0, -10); camera.add(flash, flash.target); let flashOn = true;
const gun = new THREE.Group(), gMat = new THREE.MeshStandardMaterial({ color: 0x2b2f2b, metalness: .85, roughness: .35 }), gMat2 = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: .8 });
const gp = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); gun.add(o); return o; };
gp(new THREE.BoxGeometry(.07, .11, .46), gMat, 0, 0, 0);
gp(new THREE.CylinderGeometry(.018, .018, .4, 8).rotateX(Math.PI / 2), gMat, 0, .025, -.4);
gp(new THREE.BoxGeometry(.06, .16, .08), gMat2, 0, -.12, .12).rotation.x = .25;
gp(new THREE.BoxGeometry(.05, .15, .09), gMat, 0, -.11, -.06);
gp(new THREE.BoxGeometry(.05, .09, .22), gMat2, 0, -.01, .32);
gp(new THREE.BoxGeometry(.012, .03, .012), new THREE.MeshStandardMaterial({ color: 0x00ff66, emissive: 0x00ff66, emissiveIntensity: 2 }), 0, .075, -.15);
const mf = gp(new THREE.SphereGeometry(.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffdd88 }), 0, .025, -.64); mf.visible = false;
gun.traverse(o => { o.renderOrder = 999; o.frustumCulled = false; if (o.material) o.material.depthTest = false; });
const shovel = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: .9 }), blade = new THREE.MeshStandardMaterial({ color: 0xa9b2b8, metalness: .8, roughness: .4 });
const sp2 = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); shovel.add(o); return o; };
sp2(new THREE.CylinderGeometry(.022, .022, .8, 8), wood, 0, 0, 0); sp2(new THREE.BoxGeometry(.12, .04, .04), wood, 0, .4, 0); sp2(new THREE.BoxGeometry(.18, .26, .02), blade, 0, -.5, 0);
shovel.traverse(o => { o.renderOrder = 999; o.frustumCulled = false; if (o.material) o.material.depthTest = false; });
camera.add(shovel);
gun.position.set(.28, -.26, -.55); camera.add(gun);
let ac = null; const sfx = (f, d, ty = 'sawtooth', v = .08, f2 = f * .5) => { if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), n = ac.currentTime; o.type = ty; o.frequency.setValueAtTime(f, n); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), n + d); g.gain.setValueAtTime(v, n); g.gain.exponentialRampToValueAtTime(.001, n + d); o.connect(g); g.connect(ac.destination); o.start(); o.stop(n + d); };
const sp = []; for (let i = 0; i < 900; i++) { const a = Math.random() * 6.283, e = Math.acos(Math.random()); sp.push(Math.cos(a) * Math.sin(e) * 420, Math.cos(e) * 420, Math.sin(a) * Math.sin(e) * 420); }
const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
scene.add(stars);

// ===== CHUNKED INFINITE WORLD =====
const CS = 64, RAD = 2, chunks = {}, tg = new THREE.Group(), mg = new THREE.Group();
scene.add(tg, mg);
const terrMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
const nc = document.createElement('canvas'); nc.width = nc.height = 256; const nx = nc.getContext('2d'), nd = nx.createImageData(256, 256);
for (let i = 0; i < nd.data.length; i += 4) { const v = 150 + Math.random() * 105 | 0; nd.data[i] = nd.data[i + 1] = nd.data[i + 2] = v; nd.data[i + 3] = 255; } nx.putImageData(nd, 0, 0);
const dTex = new THREE.CanvasTexture(nc); dTex.wrapS = dTex.wrapT = THREE.RepeatWrapping; dTex.repeat.set(CS / 8, CS / 8); dTex.anisotropy = 8;
terrMat.map = dTex; terrMat.bumpMap = dTex; terrMat.bumpScale = 1.5;
const propMats = [new THREE.MeshStandardMaterial({ color: 0x1b1612, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0x4a4a46, roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x58585a, roughness: .9 }), new THREE.MeshStandardMaterial({ color: 0x33ff88, emissive: 0x22ff77, emissiveIntensity: 2.2 })];
const propGeo = [new THREE.CylinderGeometry(.18, .3, 1, 6).translate(0, .5, 0), new THREE.DodecahedronGeometry(1).translate(0, .3, 0),
  new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), new THREE.OctahedronGeometry(.5).translate(0, .5, 0)];
const propCfg = [[26, () => [1, 4 + Math.random() * 5, 1]], [14, () => { const s = 1 + Math.random() * 1.8; return [s, s * .8, s]; }],
  [5, () => [2.5 + Math.random() * 3, 4 + Math.random() * 6, 2.5 + Math.random() * 3]], [7, () => { const s = 1 + Math.random() * 2; return [s * .6, s * 2, s * .6]; }]];

function paintChunk(g) {
  const p = g.attributes.position, ca = g.attributes.color, c = new THREE.Color();
  for (let n = 0; n < p.count; n++) p.setY(n, H(p.getX(n), p.getZ(n)));
  g.computeVertexNormals(); const nr = g.attributes.normal;
  for (let n = 0; n < p.count; n++) {
    const x = p.getX(n), z = p.getZ(n), h = p.getY(n), m = Math.min(1, Math.max(0, (vn(x * .04, z * .04) - .35) * 3)), sl = Math.min(1, Math.max(0, (.85 - nr.getY(n)) * 5)), dd = Math.min(1, Math.max(0, -D(x, z) / 1.5));
    c.setHSL((.1 + .12 * m) * (1 - dd) + .07 * dd, (.22 + .2 * m) * (1 - sl * .8) * (1 - dd) + .3 * dd, (.13 + .05 * m + .06 * vn(x * .4, z * .4) + Math.max(0, h) * .004 + sl * .06) * (1 - .35 * dd));
    ca.setXYZ(n, c.r, c.g, c.b);
  }
  ca.needsUpdate = p.needsUpdate = nr.needsUpdate = true; g.computeBoundingSphere();
}
function makeChunk(i, j) {
  const g = new THREE.PlaneGeometry(CS, CS, CS, CS); g.rotateX(-Math.PI / 2); g.translate(i * CS, 0, j * CS);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3)); paintChunk(g);
  const mesh = new THREE.Mesh(g, terrMat); mesh.receiveShadow = true; tg.add(mesh);
  const props = [], d = new THREE.Object3D();
  propCfg.forEach(([n, sc], k) => {
    const im = new THREE.InstancedMesh(propGeo[k], propMats[k], n); let cnt = 0;
    for (let q = 0; q < n; q++) {
      const x = (i - .5 + Math.random()) * CS, z = (j - .5 + Math.random()) * CS; if (Math.hypot(x, z) < 24) continue;
      d.position.set(x, H(x, z) - .2, z); d.rotation.set(0, Math.random() * 6.28, 0); const s = sc(); d.scale.set(...s); d.updateMatrix(); im.setMatrixAt(cnt++, d.matrix);
    }
    im.count = cnt; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; scene.add(im); props.push(im); if (k === 0) trunks.push(im);
  });
  chunks[i + ',' + j] = { mesh, props };
}
function updateChunks() {
  const ci = Math.round(camera.position.x / CS), cj = Math.round(camera.position.z / CS);
  for (let i = ci - RAD; i <= ci + RAD; i++) for (let j = cj - RAD; j <= cj + RAD; j++) if (!chunks[i + ',' + j]) makeChunk(i, j);
  for (const k in chunks) { const [i, j] = k.split(',').map(Number);
    if (Math.abs(i - ci) > RAD + 1 || Math.abs(j - cj) > RAD + 1) { const c = chunks[k]; tg.remove(c.mesh); c.mesh.geometry.dispose(); c.props.forEach(m => { scene.remove(m); m.dispose(); const q = trunks.indexOf(m); if (q >= 0) trunks.splice(q, 1); }); delete chunks[k]; } }
}

// ===== DIGGING =====
$('hotbar').innerHTML = '<div class="slot" id="s0"><i style="background:#ffcc33"></i>1 GUN<br>&infin;</div><div class="slot" id="s1"><i style="background:#c28a4a"></i>2 SHOVEL<br>&infin;</div><div class="slot" id="s2"><i style="background:#8a5a2b"></i>3 DOOR<br><b id="dn">0</b></div>';
const dirty = new Set();
const markDirty = (ix, iz) => { for (const a of [Math.round((ix - .5) / CS), Math.round((ix + .5) / CS)]) for (const b of [Math.round((iz - .5) / CS), Math.round((iz + .5) / CS)]) dirty.add(a + ',' + b); };
function digAt(px, pz, amt) {
  const R = 2.6, up = {};
  for (let ix = Math.floor(px - R); ix <= Math.ceil(px + R); ix++) for (let iz = Math.floor(pz - R); iz <= Math.ceil(pz + R); iz++) {
    const d = Math.hypot(ix - px, iz - pz); if (d > R) continue;
    const k = ix + ',' + iz, v = Math.min(1.5, Math.max(-8, (dg[k] || 0) + amt * (.3 + .7 * (1 - d / R))));
    if (!(k in dg)) dn++; dg[k] = v; markDirty(ix, iz); up[ix + '_' + iz] = +v.toFixed(2);
  }
  db.ref('holes').update(up).catch(() => {});
}

// ===== MULTIPLAYER =====
function initNet() {
  db.ref('bases').remove().catch(() => {}); // wipe leftover blocks from old versions
  const onHole = s => { const v = s.val(), [ix, iz] = s.key.split('_').map(Number), k = ix + ',' + iz; if (dg[k] === v) return; if (!(k in dg)) dn++; dg[k] = v; markDirty(ix, iz); };
  db.ref('holes').on('child_added', onHole); db.ref('holes').on('child_changed', onHole);
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
controls.addEventListener('lock', () => { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); $('blocker').style.display = 'none'; });
controls.addEventListener('unlock', () => { $('blocker').style.display = 'flex'; for (const k in key) delete key[k]; mouseL = mouseR = false; save(); });
addEventListener('blur', () => { for (const k in key) delete key[k]; mouseL = mouseR = false; });
const MODES = ['combat', 'dig', 'door'];
addEventListener('wheel', e => { if (controls.isLocked) mode = MODES[(MODES.indexOf(mode) + (e.deltaY > 0 ? 1 : 2)) % 3]; });
P.set(0, EYE, 8);
let vx = 0, vz = 0, vy = 0, ground = true; const key = {};
addEventListener('keydown', e => {
  key[e.code] = 1;
  if (e.code === 'KeyF') flashOn = !flashOn;
  if (e.code === 'KeyR' && reload <= 0 && ammo < 15) reload = 1.2;
  if (e.code === 'Digit1') mode = 'combat'; if (e.code === 'Digit2') mode = 'dig'; if (e.code === 'Digit3') mode = 'door'; if (e.code === 'KeyC') craft(); if (e.code === 'KeyE') openDoor();
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'Space' && ground) { vy = 13; ground = false; }
});
addEventListener('keyup', e => delete key[e.code]);
const hit = (x, y, z) => { const h = H(x, z); return ground ? h - H(P.x, P.z) > 1.7 * Math.max(.12, Math.hypot(x - P.x, z - P.z)) : h - (y - EYE) > .35; };

const rc = new THREE.Raycaster();
const ray = (objs, far) => { rc.far = far; rc.setFromCamera({ x: 0, y: 0 }, camera); return rc.intersectObjects(objs, true); };
function tracer(a, b, color) {
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color, transparent: true }));
  scene.add(l); tracers.push({ l, life: .12 });
}
let shotCd = 0, mouseL = false, mouseR = false, digCd = 0, swing = 0, ammo = 15, reload = 0, recoil = 0, flashT = 0;
function fire() {
  if (shotCd > 0 || reload > 0) return;
  if (ammo <= 0) { reload = 1.2; return; }
  ammo--; shotCd = .13; recoil = 1; flashT = .05; camera.rotation.x = Math.min(1.5, camera.rotation.x + .012); sfx(520, .12, 'square', .05, 110);
  const h = ray([mg, tg], 90)[0], dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  tracer(camera.localToWorld(new THREE.Vector3(.28, -.23, -1.15)), h ? h.point : P.clone().addScaledVector(dir, 90), 0xffee88);
  if (h && h.object.parent.userData.mob) hurtMob(h.object.parent, 20);
  if (ammo <= 0) reload = 1.2;
}
addEventListener('mousedown', e => { if (!controls.isLocked) return; if (e.button === 0) mouseL = true; if (e.button === 2) mouseR = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
addEventListener('contextmenu', e => e.preventDefault());

// ===== WOOD / TRAPDOOR / BUNKER =====
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), chopHits = {}, placed = [];
const doorMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: .85 }), barMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: .8, roughness: .4 });
const covered = () => placed.some(d => Math.hypot(d.position.x - P.x, d.position.z - P.z) < 1.6 && d.position.y > P.y && d.position.y < P.y + 8);
function msg(s) { $('status').innerText = s; setTimeout(() => $('status').innerText = net ? 'Online' : 'Offline', 2000); }
function chop(h) {
  const im = h.object, id = h.instanceId; if (id == null) return; const k = im.id + '_' + id; sfx(200, .1, 'square', .06, 120);
  if ((chopHits[k] = (chopHits[k] || 0) + 1) < 3) return;
  im.setMatrixAt(id, ZERO); im.instanceMatrix.needsUpdate = true; logs += 3;
}
function craft() { if (logs >= 4) { logs -= 4; doors++; sfx(300, .15, 'triangle', .06, 200); } else msg('Need 4 wood'); }
function placeDoor() {
  if (doors <= 0) return msg('Craft a trapdoor (C)');
  const h = ray([tg], 6)[0], pit = H0(P.x, P.z) - H(P.x, P.z) >= 2; let x, z, y;
  if (pit && camera.rotation.x > .5) { x = P.x; z = P.z; y = H0(x, z) + .1; }
  else if (h) { x = h.point.x; z = h.point.z; y = h.point.y + .08; }
  else return;
  const g = new THREE.Group(), add = (w, hh, d, m, px, py) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, hh, d), m); o.position.set(px, py, 0); o.castShadow = o.receiveShadow = true; g.add(o); };
  add(2.4, .14, 2.4, doorMat, 0, 0); [-.8, 0, .8].forEach(px => add(.06, .16, 2.4, barMat, px, 0)); add(.4, .08, .1, barMat, 0, .1);
  g.position.set(x, y, z); scene.add(g); placed.push(g); doors--; sfx(120, .15, 'triangle', .08, 70);
  if (pit && camera.rotation.x > .5) msg('Bunker sealed');
}
function openDoor() {
  let b = null, bd = 3.2; for (const d of placed) { const q = Math.hypot(d.position.x - P.x, d.position.z - P.z); if (q < bd) { bd = q; b = d; } }
  if (b) { scene.remove(b); placed.splice(placed.indexOf(b), 1); doors++; sfx(150, .12, 'triangle', .06, 90); }
}
// ===== MOBS =====
const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff2200, emissiveIntensity: 3 }), bloodMat = new THREE.MeshStandardMaterial({ color: 0x5a0d0d, roughness: .6 });
const ZT = [{ hp: 30, sp: 2.4, sc: 1, skin: 0x6f8a5a, cloth: 0x3b4a5a, dmg: 8 }, { hp: 18, sp: 5.2, sc: .9, skin: 0x9aa58a, cloth: 0x5a3b3b, dmg: 6 }, { hp: 120, sp: 1.7, sc: 1.45, skin: 0x4a5a45, cloth: 0x2a2a2a, dmg: 22 }];
const corpses = [];
function spawnMob() {
  const a = Math.random() * 6.283, r = 40 + Math.random() * 20, x = P.x + Math.cos(a) * r, z = P.z + Math.sin(a) * r, g = new THREE.Group();
  const ty = Math.random() < .08 + nightNo * .03 ? 2 : Math.random() < .3 ? 1 : 0, Z = ZT[ty];
  const sk = new THREE.MeshStandardMaterial({ color: Z.skin, roughness: .95 }), cl = new THREE.MeshStandardMaterial({ color: Z.cloth, roughness: 1 });
  const box = (w, h, d, m, y, par) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.y = y; b.castShadow = true; par.add(b); return b; };
  const limb = (w, h, px, py, m) => { const p = new THREE.Group(); p.position.set(px, py, 0); box(w, h, w, m, -h / 2, p); g.add(p); return p; };
  box(.8, 1, .4, cl, 1.1, g); box(.82, .3, .42, bloodMat, 1.2, g);
  const head = new THREE.Group(); head.position.y = 1.85; box(.5, .5, .5, sk, 0, head); box(.36, .12, .12, bloodMat, -.2, head).position.z = .22;
  [-.12, .12].forEach(ex => { const e = box(.1, .08, .05, eyeMat, .06, head); e.position.x = ex; e.position.z = .26; }); g.add(head);
  const A = [limb(.22, .9, -.52, 1.55, sk), limb(.22, .9, .52, 1.55, sk)], L = [limb(.26, .8, -.2, .8, cl), limb(.26, .8, .2, .8, cl)];
  g.scale.setScalar(Z.sc); g.userData.mob = { hp: Z.hp * (1 + nightNo * .15), sp: Z.sp * (.9 + Math.random() * .2), dmg: Z.dmg + nightNo, ph: Math.random() * 6, ty, head, A, L };
  g.position.set(x, H(x, z), z); mg.add(g); mobs.push(g); sfx(80 + Math.random() * 40, .9, 'sawtooth', .04, 45);
}
function killMob(g, reward) {
  const m = g.userData.mob; if (reward) scrap++;
  g.userData.mob = null; g.userData.dead = 3; mobs.splice(mobs.indexOf(g), 1); corpses.push(g); sfx(140, .5, 'sawtooth', .07, 35);
}
function hurtMob(g, d) { const m = g.userData.mob; if (!m) return; m.hp -= d; sfx(160, .15, 'square', .05, 80); if (m.hp <= 0) killMob(g, true); }
function updateMobs(dt, t) {
  for (let i = corpses.length - 1; i >= 0; i--) { const c = corpses[i]; c.rotation.x = Math.max(-1.5, c.rotation.x - dt * 4); if ((c.userData.dead -= dt) <= 0) { mg.remove(c); corpses.splice(i, 1); } }
  for (const g of [...mobs]) {
    const m = g.userData.mob, sl = Math.min(1, Math.max(0, (Math.sin(dayT * 6.283) - .65) * 10));
    if (sl > .3 && (m.hp -= sl * .5 * dt) <= 0) { killMob(g, false); continue; }
    const dx = P.x - g.position.x, dz = P.z - g.position.z, d = Math.hypot(dx, dz), y = g.position.y, w = Math.sin(t * m.sp * 2.2 + m.ph);
    g.rotation.y = Math.atan2(dx, dz); m.L[0].rotation.x = w * .7; m.L[1].rotation.x = -w * .7; m.A[0].rotation.x = -1.4 + w * .12; m.A[1].rotation.x = -1.4 - w * .12; m.head.rotation.z = Math.sin(t * 2 + m.ph) * .15;
    if (d > 1.5 * g.scale.x) {
      const sx = dx / d * m.sp * dt, sz = dz / d * m.sp * dt, px = g.position.x, pz = g.position.z;
      const steep = (nx, nz) => H(nx, nz) - y > 1.3 * Math.hypot(nx - px, nz - pz);
      if (!steep(px + sx, pz)) g.position.x += sx; if (!steep(g.position.x, pz + sz)) g.position.z += sz;
      g.position.y = H(g.position.x, g.position.z);
    } else if (hurtCd <= 0 && Math.abs(P.y - EYE - y) < 2.5 && !covered()) {
      hp -= m.dmg; hurtCd = .8; sfx(70, .3, 'square', .1, 40); $('hurt').style.opacity = 1; setTimeout(() => $('hurt').style.opacity = 0, 120);
    }
  }
}
// ===== LOOP =====
const PAL = { dt: new THREE.Color(0x6a8f9a), db: new THREE.Color(0xc2a878), nt: new THREE.Color(0x02040c), nb: new THREE.Color(0x0c1c18) };
const sd = new THREE.Vector3(); let t = 0, last = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(), dt = Math.min((now - last) / 1000, .05); last = now; t += dt; shotCd -= dt; hurtCd -= dt;

  dayT = (Date.now() / 1000 / 360) % 1; // shared wall-clock time: same for every player
  const isNight = Math.sin(dayT * 6.283) < .62;
  if (isNight && !wasNight) { nightNo++; spawnCd = 0; } wasNight = isNight;

  if (controls.isLocked) {
    const f = (key.KeyW ? 1 : 0) - (key.KeyS ? 1 : 0), r = (key.KeyD ? 1 : 0) - (key.KeyA ? 1 : 0), yaw = camera.rotation.y;
    const wx = -Math.sin(yaw) * f + Math.cos(yaw) * r, wz = -Math.cos(yaw) * f - Math.sin(yaw) * r, l = Math.hypot(wx, wz) || 1, spd = (key.ShiftLeft || key.ShiftRight) ? 9 : 5.5, k = Math.min(1, 10 * dt);
    vx += (wx / l * spd - vx) * k; vz += (wz / l * spd - vz) * k;
    if (!hit(P.x + vx * dt, P.y, P.z)) P.x += vx * dt;
    if (!hit(P.x, P.y, P.z + vz * dt)) P.z += vz * dt;
    vy -= 30 * dt; P.y += vy * dt; const gy = H(P.x, P.z) + EYE;
    if (vy <= 0 && P.y <= gy + .25) { P.y = gy; vy = 0; ground = true; } else ground = false;

    for (let i = mobs.length - 1; i >= 0; i--) if (mobs[i].position.distanceTo(P) > 110) { mg.remove(mobs[i]); mobs.splice(i, 1); }
    if ((spawnCd -= dt) <= 0 && mobs.length < (isNight ? 8 + nightNo * 4 : 2)) { spawnMob(); spawnCd = isNight ? 2 : 12; }
    updateMobs(dt, t);
    if ((saveT += dt) > 10) { saveT = 0; save(); }
    if (hp < 100 && hurtCd < -4) hp = Math.min(100, hp + dt * 3);
    if (hp <= 0) { P.set(0, EYE, 8); vx = vz = vy = 0; hp = 100; }
  }

  updateChunks();
  for (const k of dirty) if (chunks[k]) paintChunk(chunks[k].mesh.geometry);
  dirty.clear();
  // sky & light
  const raw = Math.sin(dayT * 6.283) - .7, se = raw > 0 ? raw / .3 : raw / 1.7, day = Math.min(1, Math.max(0, se * 3 + .4)), ang = dayT * 6.283;
  skyU.t.value.copy(PAL.nt).lerp(PAL.dt, day); skyU.b.value.copy(PAL.nb).lerp(PAL.db, day);
  scene.fog.color.copy(skyU.b.value); scene.fog.density = .013 + (1 - day) * .006;
  sd.set(Math.cos(ang), se, .3).normalize(); skyU.sd.value.copy(sd); sun.position.copy(P).addScaledVector(sd, se >= 0 ? 120 : -120); sun.target.position.copy(P);
  sun.intensity = .25 + day * 1.1; sun.color.set(day > .5 ? 0xffe2a8 : 0x6f8cff); hemi.intensity = .18 + day * .35;
  stars.material.opacity = 1 - day; stars.position.copy(P); sky.position.copy(P);

  for (let i = tracers.length - 1; i >= 0; i--) { const q = tracers[i]; q.life -= dt; q.l.material.opacity = Math.max(0, q.life / .12); if (q.life <= 0) { scene.remove(q.l); q.l.geometry.dispose(); tracers.splice(i, 1); } }
  for (const id in remote) remote[id].g.position.lerp(remote[id].tp, .2);

  $('scrap').innerText = scrap; $('mode').innerText = mode.toUpperCase() + (covered() ? ' | SAFE' : ''); $('wood').innerText = logs; $('doors').innerText = $('dn').innerText = doors;
  $('hpfill').style.width = Math.max(0, hp) + '%';
  $('clock').innerText = wasNight ? `NIGHT ${nightNo} - MOBS: ${mobs.length}` : `DAY - NIGHT ${nightNo + 1} COMES`;
  $('clock').className = wasNight ? 'warning' : 'success';
  $('s0').className = 'slot' + (mode === 'combat' ? ' on' : '');
  $('s1').className = 'slot' + (mode === 'dig' ? ' on' : ''); $('s2').className = 'slot' + (mode === 'door' ? ' on' : '');
  for (let i = 0; i < AN; i++) { const k = i * 3; ap[k] = wrap(ap[k] + (Math.sin(t * .5 + i) * .5 + .8) * dt, P.x); ap[k + 1] = wrap(ap[k + 1] - .7 * dt, P.y); ap[k + 2] = wrap(ap[k + 2] + Math.cos(t * .4 + i) * .4 * dt, P.z); }
  ag.attributes.position.needsUpdate = true; flash.intensity = flashOn ? (1 - day) * 2.5 : 0; grade.uniforms.time.value = (t % 50) + 1;
  digCd -= dt; swing = Math.max(0, swing - dt * 5); shovel.visible = mode === 'dig';
  if (controls.isLocked && mode === 'dig' && (mouseL || mouseR) && digCd <= 0) {
    const tr = mouseL ? ray(trunks, 4.5)[0] : null, hh = tr ? null : ray([tg], 7)[0]; digCd = .22; swing = 1;
    if (tr) chop(tr);
    else if (hh) { digAt(hh.point.x, hh.point.z, mouseL ? -.45 : .45); sfx(110, .12, 'triangle', .06, 55); }
  }
  if (controls.isLocked && mode === 'door' && mouseL && digCd <= 0) { digCd = .4; placeDoor(); }
  shovel.position.set(.32, -.2, -.65 - swing * .08); shovel.rotation.set(.7 + swing * .6, 0, -.15);
  gun.visible = mode === 'combat'; recoil = Math.max(0, recoil - dt * 9); flashT -= dt; mf.visible = flashT > 0;
  if (reload > 0 && (reload -= dt) <= 0) ammo = 15;
  if (controls.isLocked && mode === 'combat' && mouseL) fire();
  const bob = Math.hypot(vx, vz) / 6;
  gun.position.set(.28 + Math.sin(t * 8) * .006 * bob, -.26 + Math.abs(Math.sin(t * 8)) * .012 * bob - (reload > 0 ? .12 : 0), -.55 + recoil * .07);
  gun.rotation.x = recoil * .12 + (reload > 0 ? -.7 : 0);
  $('ammo').innerText = reload > 0 ? 'RELOADING' : ammo + '/15';
  composer.render();
}
loop();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});
