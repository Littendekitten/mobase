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
let hp = 100, scrap = 60, mode = 'combat', sel = 1, nightNo = 0, dayT = 0.2, wasNight = false, spawnCd = 0, hurtCd = 0;
const remote = {}, blocks = {}, mobs = [], tracers = [];

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
    if (v.scrap != null) scrap = v.scrap; if (v.nightNo != null) nightNo = v.nightNo; if (v.dayT != null) dayT = v.dayT;
    wasNight = Math.sin(dayT * 6.283) < .62;
  }).catch(() => {}).then(() => {
    loaded = true;
    userDoc().set({ name: pname, email: u.email, photoURL: u.photoURL, lastLogin: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
  });
});
function save() { if (!loaded) return; userDoc().set({ pos: { x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2) }, scrap, nightNo, dayT: +dayT.toFixed(4) }, { merge: true }).catch(() => {}); }
addEventListener('pagehide', save); addEventListener('visibilitychange', () => { if (document.hidden) save(); });

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
gun.position.set(.28, -.26, -.55); camera.add(gun);
let ac = null; const sfx = (f, d, ty = 'sawtooth', v = .08, f2 = f * .5) => { if (!ac) return; const o = ac.createOscillator(), g = ac.createGain(), n = ac.currentTime; o.type = ty; o.frequency.setValueAtTime(f, n); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), n + d); g.gain.setValueAtTime(v, n); g.gain.exponentialRampToValueAtTime(.001, n + d); o.connect(g); g.connect(ac.destination); o.start(); o.stop(n + d); };
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
  for (let n = 0; n < p.count; n++) { const x = p.getX(n) + i * CS, z = p.getZ(n) + j * CS; p.setXYZ(n, x, H(x, z), z); }
  g.computeVertexNormals(); const nr = g.attributes.normal;
  for (let n = 0; n < p.count; n++) {
    const x = p.getX(n), z = p.getZ(n), h = p.getY(n), m = Math.min(1, Math.max(0, (vn(x * .04, z * .04) - .35) * 3)), sl = Math.min(1, Math.max(0, (.85 - nr.getY(n)) * 5));
    c.setHSL(.1 + .12 * m, (.22 + .2 * m) * (1 - sl * .8), .13 + .05 * m + .06 * vn(x * .4, z * .4) + Math.max(0, h) * .004 + sl * .06); col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, terrMat); mesh.receiveShadow = true; tg.add(mesh);
  const props = [], d = new THREE.Object3D();
  propCfg.forEach(([n, sc], k) => {
    const im = new THREE.InstancedMesh(propGeo[k], propMats[k], n); let cnt = 0;
    for (let q = 0; q < n; q++) {
      const x = (i - .5 + Math.random()) * CS, z = (j - .5 + Math.random()) * CS; if (Math.hypot(x, z) < 24) continue;
      d.position.set(x, H(x, z) - .2, z); d.rotation.set(0, Math.random() * 6.28, 0); const s = sc(); d.scale.set(...s); d.updateMatrix(); im.setMatrixAt(cnt++, d.matrix);
    }
    im.count = cnt; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; scene.add(im); props.push(im);
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
$('hotbar').innerHTML = '<div class="slot" id="s0"><i style="background:#ffcc33"></i>1 GUN<br>&infin;</div>' + Object.keys(TYPES).map(k => `<div class="slot" id="s${k}"><i style="background:#${TYPES[k].c.toString(16).padStart(6, '0')}"></i>${+k + 1} ${TYPES[k].n}<br>${TYPES[k].cost}</div>`).join('');

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
controls.addEventListener('lock', () => { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); $('blocker').style.display = 'none'; });
controls.addEventListener('unlock', () => { $('blocker').style.display = 'flex'; for (const k in key) delete key[k]; mouseL = false; save(); });
addEventListener('blur', () => { for (const k in key) delete key[k]; mouseL = false; });
addEventListener('wheel', e => { if (!controls.isLocked) return; const n = ((mode === 'combat' ? 0 : sel) + (e.deltaY > 0 ? 1 : -1) + 5) % 5; if (n === 0) mode = 'combat'; else { mode = 'build'; sel = n; } });
P.set(0, EYE, 8);
let vx = 0, vz = 0, vy = 0, ground = true; const key = {};
addEventListener('keydown', e => {
  key[e.code] = 1;
  if (e.code === 'KeyF') flashOn = !flashOn;
  if (e.code === 'KeyR' && reload <= 0 && ammo < 15) reload = 1.2;
  if (e.code >= 'Digit1' && e.code <= 'Digit5') { const n = +e.code[5]; if (n === 1) mode = 'combat'; else { mode = 'build'; sel = n - 1; } }
  if (e.code === 'Space') e.preventDefault();
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
let shotCd = 0, mouseL = false, ammo = 15, reload = 0, recoil = 0, flashT = 0;
function fire() {
  if (shotCd > 0 || reload > 0) return;
  if (ammo <= 0) { reload = 1.2; return; }
  ammo--; shotCd = .13; recoil = 1; flashT = .05; camera.rotation.x = Math.min(1.5, camera.rotation.x + .012); sfx(520, .12, 'square', .05, 110);
  const h = ray([mg, bg, tg], 90)[0], dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  tracer(camera.localToWorld(new THREE.Vector3(.28, -.23, -1.15)), h ? h.point : P.clone().addScaledVector(dir, 90), 0xffee88);
  if (h && h.object.parent.userData.mob) hurtMob(h.object.parent, 20);
  if (ammo <= 0) reload = 1.2;
}
addEventListener('mousedown', e => {
  if (!controls.isLocked) return;
  if (mode === 'combat') { if (e.button === 0) mouseL = true; return; }
  const h = ray([tg, bg], 12)[0]; if (!h) return;
  if (e.button === 0) {
    const T = TYPES[sel]; if (scrap < T.cost) return;
    const t = h.point.clone().add(h.face.normal.clone()), x = cx(t.x), y = Math.max(1, cy(t.y)), z = cx(t.z), k = x + '_' + y + '_' + z;
    if (blocks[k] || (Math.abs(x - P.x) < 1.6 && Math.abs(z - P.z) < 1.6 && Math.abs(y - (P.y - .8)) < 2.3)) return;
    scrap -= T.cost; setBlock(x, y, z, sel);
  } else if (e.button === 2) {
    const k = h.object.userData.key; if (k && blocks[k] && blocks[k].d.o === uid) { scrap += TYPES[blocks[k].d.t || 1].cost; delBlock(k); }
  }
});
addEventListener('mouseup', e => { if (e.button === 0) mouseL = false; });
addEventListener('contextmenu', e => e.preventDefault());

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
  const m = g.userData.mob; if (reward) scrap += 3 + nightNo + m.ty * 4;
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
      const bx = solid(px + sx * 4, y + .5, pz) || solid(px + sx * 4, y + 1.5, pz), bz = solid(px, y + .5, pz + sz * 4) || solid(px, y + 1.5, pz + sz * 4);
      if (!bx) g.position.x += sx; if (!bz) g.position.z += sz; g.position.y = H(g.position.x, g.position.z);
      const bk = bx || bz;
      if (bk) { bk.hp = (bk.hp ?? (bk.d.t === 2 ? 90 : 50)) - m.dmg * dt * 1.5; if (bk.hp <= 0 && bk.d.o === uid) { delBlock(bk.g.children[0].userData.key); bk.hp = 1e9; } }
    } else if (hurtCd <= 0 && Math.abs(P.y - EYE - y) < 2.5) {
      hp -= m.dmg; hurtCd = .8; sfx(70, .3, 'square', .1, 40); $('hurt').style.opacity = 1; setTimeout(() => $('hurt').style.opacity = 0, 120);
    }
  }
}
function updateTurrets(dt) {
  for (const k in blocks) {
    const b = blocks[k]; if (b.d.t !== 4) continue; const u = b.g.userData; u.cd -= dt;
    let best = null, bd = 22; for (const m of mobs) { const d = m.position.distanceTo(b.g.position); if (d < bd) { bd = d; best = m; } }
    if (!best) continue;
    const to = best.position.clone().add(new THREE.Vector3(0, 1.2, 0)); u.pv.lookAt(to);
    if (u.cd <= 0) { u.cd = .7; sfx(300, .1, 'square', .02, 100); tracer(b.g.position.clone().add(new THREE.Vector3(0, 1.2, 0)), to, 0xff4466); hurtMob(best, 14); }
  }
}

// ===== LOOP =====
const PAL = { dt: new THREE.Color(0x6a8f9a), db: new THREE.Color(0xc2a878), nt: new THREE.Color(0x02040c), nb: new THREE.Color(0x0c1c18) };
const sd = new THREE.Vector3(); let t = 0, last = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now(), dt = Math.min((now - last) / 1000, .05); last = now; t += dt; shotCd -= dt; hurtCd -= dt;

  if (controls.isLocked) {
    const f = (key.KeyW ? 1 : 0) - (key.KeyS ? 1 : 0), r = (key.KeyD ? 1 : 0) - (key.KeyA ? 1 : 0), yaw = camera.rotation.y;
    const wx = -Math.sin(yaw) * f + Math.cos(yaw) * r, wz = -Math.cos(yaw) * f - Math.sin(yaw) * r, l = Math.hypot(wx, wz) || 1, spd = (key.ShiftLeft || key.ShiftRight) ? 9 : 5.5, k = Math.min(1, 10 * dt);
    vx += (wx / l * spd - vx) * k; vz += (wz / l * spd - vz) * k;
    if (!hit(P.x + vx * dt, P.y, P.z)) P.x += vx * dt;
    if (!hit(P.x, P.y, P.z + vz * dt)) P.z += vz * dt;
    vy -= 30 * dt; P.y += vy * dt; const gy = H(P.x, P.z) + EYE; ground = false;
    if (P.y <= gy) { P.y = gy; vy = 0; ground = true; }
    if (hit(P.x, P.y, P.z)) { if (vy <= 0) { P.y = cy(P.y - EYE + .1) + 1 + EYE; vy = 0; ground = true; } else { P.y -= vy * dt; vy = 0; } }
    else if (vy <= 0 && hit(P.x, P.y - .15, P.z)) { ground = true; vy = 0; }

    dayT = (dayT + dt / 360) % 1;
    const isNight = Math.sin(dayT * 6.283) < .62;
    if (isNight && !wasNight) { nightNo++; spawnCd = 0; }
    wasNight = isNight;
    for (let i = mobs.length - 1; i >= 0; i--) if (mobs[i].position.distanceTo(P) > 110) { mg.remove(mobs[i]); mobs.splice(i, 1); }
    if ((spawnCd -= dt) <= 0 && mobs.length < (isNight ? 8 + nightNo * 4 : 2)) { spawnMob(); spawnCd = isNight ? 2 : 12; }
    updateMobs(dt, t); updateTurrets(dt);
    if ((saveT += dt) > 10) { saveT = 0; save(); }
    if (hp < 100 && hurtCd < -4) hp = Math.min(100, hp + dt * 3);
    if (hp <= 0) { P.set(0, EYE, 8); vx = vz = vy = 0; hp = 100; scrap = Math.floor(scrap / 2); }
  }

  updateChunks();
  // sky & light
  const raw = Math.sin(dayT * 6.283) - .7, se = raw > 0 ? raw / .3 : raw / 1.7, day = Math.min(1, Math.max(0, se * 3 + .4)), ang = dayT * 6.283;
  skyU.t.value.copy(PAL.nt).lerp(PAL.dt, day); skyU.b.value.copy(PAL.nb).lerp(PAL.db, day);
  scene.fog.color.copy(skyU.b.value); scene.fog.density = .013 + (1 - day) * .006;
  sd.set(Math.cos(ang), se, .3).normalize(); skyU.sd.value.copy(sd); sun.position.copy(P).addScaledVector(sd, se >= 0 ? 120 : -120); sun.target.position.copy(P);
  sun.intensity = .25 + day * 1.1; sun.color.set(day > .5 ? 0xffe2a8 : 0x6f8cff); hemi.intensity = .18 + day * .35;
  stars.material.opacity = 1 - day; stars.position.copy(P); sky.position.copy(P);

  for (let i = tracers.length - 1; i >= 0; i--) { const q = tracers[i]; q.life -= dt; q.l.material.opacity = Math.max(0, q.life / .12); if (q.life <= 0) { scene.remove(q.l); q.l.geometry.dispose(); tracers.splice(i, 1); } }
  for (const id in remote) remote[id].g.position.lerp(remote[id].tp, .2);

  $('scrap').innerText = scrap; $('mode').innerText = mode.toUpperCase();
  $('hpfill').style.width = Math.max(0, hp) + '%';
  $('clock').innerText = wasNight ? `NIGHT ${nightNo} - MOBS: ${mobs.length}` : `DAY - NIGHT ${nightNo + 1} COMES`;
  $('clock').className = wasNight ? 'warning' : 'success';
  $('s0').className = 'slot' + (mode === 'combat' ? ' on' : '');
  for (const k in TYPES) $('s' + k).className = 'slot' + (mode === 'build' && +k === sel ? ' on' : '');
  for (let i = 0; i < AN; i++) { const k = i * 3; ap[k] = wrap(ap[k] + (Math.sin(t * .5 + i) * .5 + .8) * dt, P.x); ap[k + 1] = wrap(ap[k + 1] - .7 * dt, P.y); ap[k + 2] = wrap(ap[k + 2] + Math.cos(t * .4 + i) * .4 * dt, P.z); }
  ag.attributes.position.needsUpdate = true; flash.intensity = flashOn ? (1 - day) * 2.5 : 0; grade.uniforms.time.value = (t % 50) + 1;
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
