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
const SERVER_URL = 'https://mobase-server.onrender.com'; // <-- paste your Render URL here after deploying, e.g. 'https://mobase-server.onrender.com' (wakes the free server when you open the game)
const db = firebase.database(), fs = firebase.firestore(), auth = firebase.auth();
const $ = id => document.getElementById(id);

let uid = null, pname = 'Survivor', net = false;
let hp = 100, scrap = 60, mode = 'combat', sel = 0, nightNo = 0, dayT = 0.2, logs = 0, doors = 0, wasNight = false, spawnCd = 0, hurtCd = 0;
const remote = {}, blocks = {}, mobs = [], tracers = [], trunks = [], choppedSet = new Set(), mobById = {};
let netMobs = {}, hbLast = 0, chatting = false, tpInit = false, msgInit = false, msgUntil = 0;
const store = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} }, del: k => { try { localStorage.removeItem(k); } catch (e) {} } };
const urlMode = (() => { try { return new URLSearchParams(location.search).get('mode'); } catch (e) { return null; } })();
const ctlPref = urlMode || store.get('mobase_mode') || 'auto'; // Settings > Controls can force 'touch' or 'desktop'
const isTouch = ctlPref === 'touch' ? true : ctlPref === 'desktop' ? false : (/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || (navigator.maxTouchPoints > 0 && Math.min(screen.width, screen.height) < 600) || (matchMedia('(pointer: coarse)').matches && matchMedia('(hover: none)').matches));
const GFX = { // pr = resolution scale, rad = view distance (chunks), shadow = shadow-map size (0 = off), grass = grass amount, msaa = edge smoothing
  lite: { n: 'Default Graphics Lite', d: 'Fastest. Best for phones and weak PCs.', pr: isTouch ? .75 : 1, rad: 1, shadow: 0, grass: 0, bloom: false, msaa: 0, clouds: 0, ash: .3, fog: 1.25 },
  normal: { n: 'Default Graphics', d: 'Balanced looks and speed.', pr: isTouch ? 1 : 1.5, rad: isTouch ? 1 : 2, shadow: isTouch ? 1024 : 2048, grass: isTouch ? .4 : .67, bloom: !isTouch, msaa: isTouch ? 0 : 4, clouds: 1, ash: 1, fog: 1 },
  realistic: { n: 'Realistic Graphics', d: 'Best looking. Heavy: can lag or crash weaker devices.', pr: 2, rad: isTouch ? 2 : 3, shadow: isTouch ? 2048 : 4096, grass: 1, bloom: true, msaa: 4, clouds: 1, ash: 1, fog: .8 } };
let gfxKey = store.get('mobase_gfx'), gfxNote = ''; if (!GFX[gfxKey]) gfxKey = isTouch ? 'lite' : 'normal';
if (gfxKey === 'realistic') { // crash guard: if the page died within 30s of switching to Realistic, fall back so you don't get stuck in a crash loop
  if (store.get('mobase_gfx_try') === 'running') { gfxKey = 'lite'; store.set('mobase_gfx', 'lite'); store.del('mobase_gfx_try'); gfxNote = 'Realistic Graphics crashed last time, so you were switched to Default Graphics Lite.'; }
  else { store.set('mobase_gfx_try', 'running'); setTimeout(() => store.del('mobase_gfx_try'), 30000); } }
else store.del('mobase_gfx_try');
const GQ = GFX[gfxKey];
let INV = {}, layout = ['gun', 'shovel', ...Array(34).fill(null)], invLoaded = false, srvOff = 0, invOpen = false, picked = null, touchOn = false, touchRun = false, curMine = null, mineStart = 0, mineLast = 0;
const joy = { x: 0, y: 0 }, rockM = [], ruinM = [], starM = [], propLists = [trunks, rockM, ruinM, starM], minedSet = new Set(), solidByKey = new Map(), tablesList = [];
const act = o => db.ref('actions').push({ uid, ...o }).catch(() => {}); // the ONLY way the client changes the world: ask the server

function start(id, name, online) {
  uid = id; pname = name; net = online;
  $('player-name').innerText = name;
  $('status').innerText = online ? 'Online' : 'Offline'; $('status').className = 'success';
  $('google-btn').style.display = $('login-subtext').style.display = 'none';
  $('controls-info').style.display = 'block'; $('blocker').style.cursor = 'pointer';
  if (online) initNet();
  $('player-count').innerText = 1;
}
$('google-btn').onclick = () => { const pr = new firebase.auth.GoogleAuthProvider(); auth.signInWithPopup(pr).catch(e => { if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment', 'auth/web-storage-unsupported'].includes(e.code)) auth.signInWithRedirect(pr); else alert('Login failed: ' + e.message); }); };
auth.getRedirectResult().catch(e => { if (e && e.code) alert('Login failed: ' + e.message); });
let loaded = false, saveT = 0;
const userDoc = () => fs.collection('users').doc(uid);
auth.onAuthStateChanged(u => {
  if (!u) return;
  start(u.uid, u.displayName || 'Survivor', true);
  userDoc().get().then(d => {
    const v = d.exists ? d.data() : {};
    if (v.pos) P.set(v.pos.x, Math.max(v.pos.y, H(v.pos.x, v.pos.z) + EYE), v.pos.z);
    if (Array.isArray(v.layout)) { layout = v.layout; fixLayout(); renderUI(); }
    if (v.name) { const n = cleanName(v.name); if (n.length >= 2) setName(n); }
    wasNight = Math.sin(dayT * 6.283) < .62;
  }).catch(() => {}).then(() => {
    loaded = true; userDoc().onSnapshot(s => { const n = cleanName((s.data() || {}).name); if (n.length >= 2 && n !== pname) setName(n); }, () => {}); // live: editing users/<id>/name in Firestore renames you
    userDoc().set({ name: pname, email: u.email, photoURL: u.photoURL, lastLogin: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
  });
});
function save() { if (!loaded) return; userDoc().set({ pos: { x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2) }, layout }, { merge: true }).catch(() => {}); }
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
camera.rotation.order = 'YXZ'; // must match PointerLockControls, otherwise yaw/pitch read back wrong
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight); renderer.setPixelRatio(Math.min(devicePixelRatio, GQ.pr));
renderer.shadowMap.enabled = !!GQ.shadow; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const PR = renderer.getPixelRatio();
const composer = new THREE.EffectComposer(renderer, renderer.capabilities.isWebGL2 && GQ.msaa ? new THREE.WebGLMultisampleRenderTarget(innerWidth * PR, innerHeight * PR, { format: THREE.RGBAFormat }) : undefined);
composer.addPass(new THREE.RenderPass(scene, camera));
if (GQ.bloom) composer.addPass(new THREE.UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .8, .7, .95));
const grade = new THREE.ShaderPass({ uniforms: { tDiffuse: { value: null }, time: { value: 1 }, hurt: { value: 0 } },
  vertexShader: 'varying vec2 v;void main(){v=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform sampler2D tDiffuse;uniform float time,hurt;varying vec2 v;
float r(vec2 s){return fract(sin(dot(s,vec2(12.9898,78.233)))*43758.5453);}
void main(){vec2 d=v-.5;vec2 o=d*(.004+hurt*.008);
  vec3 c=vec3(texture2D(tDiffuse,v+o).r,texture2D(tDiffuse,v).g,texture2D(tDiffuse,v-o).b);
  c*=1.3;c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);c=pow(c,vec3(.9));
  float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,1.12-hurt*.6);c*=mix(vec3(1.),vec3(1.04,.97,.9),.6);
  float vg=pow(length(d)*1.25,2.5);c*=1.-vg*.7;c+=vec3(.5,0.,0.)*vg*hurt*.5;
  c+=(r(v*time)-.5)*.045;gl_FragColor=vec4(c,1.);}` });
composer.addPass(grade);

const sun = new THREE.DirectionalLight(0xffe0a0, 1);
sun.castShadow = !!GQ.shadow; sun.shadow.mapSize.set(GQ.shadow || 1024, GQ.shadow || 1024);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, far: 400 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0x9ab, 0x332a20, .4); scene.add(hemi);

const skyU = { t: { value: new THREE.Color() }, b: { value: new THREE.Color() }, sd: { value: new THREE.Vector3(0, 1, 0) }, time: { value: 0 }, cloudQ: { value: GQ.clouds } };
const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 12), new THREE.ShaderMaterial({
  uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: `uniform vec3 t,b,sd;uniform float time,cloudQ;varying vec3 p;
float h(vec2 s){return fract(sin(dot(s,vec2(127.1,311.7)))*43758.5453);}
float nz(vec2 s){vec2 i=floor(s),f=fract(s);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1.,0.)),f.x),mix(h(i+vec2(0.,1.)),h(i+vec2(1.,1.)),f.x),f.y);}
float fb(vec2 s){float a=.5,r=0.;for(int i=0;i<5;i++){r+=a*nz(s);s=s*2.03+17.;a*=.5;}return r;}
void main(){vec3 c=mix(b,t,pow(max(p.y,0.),.5));float s=max(dot(p,sd),0.),m=max(dot(p,-sd),0.);
  c+=vec3(1.,.75,.45)*(pow(s,900.)*6.+pow(s,6.)*.18)*step(-.1,sd.y);c+=vec3(.6,.7,1.)*pow(m,1500.)*3.*step(sd.y,.1);
  vec2 uv=p.xz/(p.y+.2)*1.3+vec2(time*.012,time*.006);float cl=0.;if(cloudQ>.5){cl=smoothstep(.48,.78,fb(uv))*smoothstep(.02,.3,p.y);}
  vec3 cc=mix(t,vec3(1.),.5)*(.45+.55*clamp(sd.y+.3,0.,1.));cc+=vec3(1.,.8,.55)*pow(s,10.)*.5*step(-.1,sd.y);
  c=mix(c,cc,cl*.85);gl_FragColor=vec4(c,1.);}` }));
scene.add(sky);
const AN = 500, ap = new Float32Array(AN * 3).map(() => (Math.random() - .5) * 60), ag = new THREE.BufferGeometry();
ag.setAttribute('position', new THREE.BufferAttribute(ap, 3));
const ash = new THREE.Points(ag, new THREE.PointsMaterial({ color: 0xcfc2a8, size: .08, transparent: true, opacity: .6, depthWrite: false }));
ash.frustumCulled = false; ag.setDrawRange(0, Math.floor(AN * GQ.ash)); scene.add(ash);
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
// ===== AUDIO (all synthesized: reverb, 3D-positioned sounds, ambience; M = mute) =====
let A = null, stepAcc = 0, wasGround = true, groanT = 3, ambT = 0;
function audioInit() {
  if (A || !ac) return;
  const master = ac.createGain(); master.gain.value = .85; const comp = ac.createDynamicsCompressor(); master.connect(comp); comp.connect(ac.destination);
  const len = Math.floor(ac.sampleRate * 1.8), ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
  const conv = ac.createConvolver(); conv.buffer = ir; const wet = ac.createGain(); wet.gain.value = .4; conv.connect(wet); wet.connect(master);
  const nb = ac.createBuffer(1, ac.sampleRate * 3, ac.sampleRate), nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  A = { master, conv, nb, muted: false };
  const loopNoise = (f, q) => { const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain(); s.buffer = nb; s.loop = true; fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(master); s.start(); return { g, fl }; };
  A.wind = loopNoise(450, .5);
  const lfo = ac.createOscillator(), lg = ac.createGain(); lfo.frequency.value = .13; lg.gain.value = 260; lfo.connect(lg); lg.connect(A.wind.fl.frequency); lfo.start(); // wind swells
  const drone = f => { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = f; g.gain.value = 0; o.connect(g); g.connect(master); o.start(); return g; };
  A.d1 = drone(55); A.d2 = drone(82.9); // low night rumble
}
function ambient(day, spd) { if (!A) return; const n = ac.currentTime; A.wind.g.gain.setTargetAtTime(.035 + .03 * (1 - day) + Math.min(spd, 9) * .004, n, .5); A.d1.gain.setTargetAtTime((1 - day) * .05, n, 2); A.d2.gain.setTargetAtTime((1 - day) * .03, n, 2); }
const mkOut = (vol, o) => { let dst = A.master;
  if (o && o.x != null) { const dx = o.x - P.x, dz = o.z - P.z, d = Math.hypot(dx, dz) || 1, yaw = camera.rotation.y; vol /= 1 + (d / 14) * (d / 14);
    if (ac.createStereoPanner) { const sp = ac.createStereoPanner(); sp.pan.value = Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d)); sp.connect(A.master); dst = sp; } }
  const g = ac.createGain(); g.gain.value = vol; g.connect(dst); if (o && o.rev) { const r = ac.createGain(); r.gain.value = o.rev; g.connect(r); r.connect(A.conv); } return g; };
const nz = (dur, vol, f0, f1, o, type = 'lowpass', at = 0) => { const n = ac.currentTime + at, s = ac.createBufferSource(), f = ac.createBiquadFilter(), e = ac.createGain();
  s.buffer = A.nb; f.type = type; f.frequency.setValueAtTime(f0, n); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), n + dur); e.gain.setValueAtTime(vol, n); e.gain.exponentialRampToValueAtTime(.001, n + dur);
  s.connect(f); f.connect(e); e.connect(mkOut(1, o)); s.start(n, Math.random() * 1.5, dur + .05); };
const th = (f0, f1, dur, vol, o, ty = 'sine', at = 0) => { const n = ac.currentTime + at, os = ac.createOscillator(), e = ac.createGain();
  os.type = ty; os.frequency.setValueAtTime(f0, n); os.frequency.exponentialRampToValueAtTime(f1, n + dur); e.gain.setValueAtTime(vol, n); e.gain.exponentialRampToValueAtTime(.001, n + dur);
  os.connect(e); e.connect(mkOut(1, o)); os.start(n); os.stop(n + dur + .02); };
function groan(o, k) {
  const n = ac.currentTime, base = (o.ty === 2 ? 55 : o.ty === 1 ? 120 : 85) * (.9 + Math.random() * .2), dur = .9 + Math.random() * .5;
  const os = ac.createOscillator(), f = ac.createBiquadFilter(), e = ac.createGain(), lf = ac.createOscillator(), lg = ac.createGain();
  os.type = 'sawtooth'; os.frequency.setValueAtTime(base * 1.35, n); os.frequency.exponentialRampToValueAtTime(base * .7, n + dur); lf.frequency.value = 5 + Math.random() * 3; lg.gain.value = base * .07; lf.connect(lg); lg.connect(os.frequency);
  f.type = 'bandpass'; f.Q.value = 2.2; f.frequency.setValueAtTime(450, n); f.frequency.linearRampToValueAtTime(850, n + dur * .4); f.frequency.linearRampToValueAtTime(380, n + dur);
  e.gain.setValueAtTime(.0001, n); e.gain.exponentialRampToValueAtTime(.5 * k, n + .18); e.gain.exponentialRampToValueAtTime(.001, n + dur);
  os.connect(f); f.connect(e); e.connect(mkOut(1, { x: o.x, z: o.z, rev: .35 })); os.start(n); lf.start(n); os.stop(n + dur + .05); lf.stop(n + dur + .05); nz(dur * .8, .18 * k, 1200, 300, o);
}
function sound(kind, o = {}) {
  if (!A) return;
  try { switch (kind) {
    case 'shot': nz(.28, .5, 9000, 250, { rev: .55 }); nz(.04, .45, 10000, 3000); th(160, 42, .14, .55); break;
    case 'hit': nz(.06, .28, 3500, 900); th(220, 80, .07, .22); break;
    case 'reload': nz(.05, .25, 3500, 1500); nz(.07, .2, 2500, 800, null, 'lowpass', .38); nz(.05, .3, 4000, 1500, null, 'lowpass', .8); break;
    case 'hurt': th(95, 40, .25, .55); nz(.14, .3, 900, 200); break;
    case 'step': nz(.09, o.run ? .2 : .13, 900 + Math.random() * 500, 250); break;
    case 'land': th(75, 35, .16, .4); nz(.12, .3, 700, 200); break;
    case 'dig': nz(.16, .35, 1600, 220); th(90, 45, .1, .3); break;
    case 'chop': th(190, 75, .09, .45, o, 'triangle'); nz(.05, .4, 4500, 1200, o); break;
    case 'place': th(110, 45, .14, .5, o); nz(.1, .3, 1800, 400, o); break;
    case 'zdie': groan(o, .6); th(100, 35, .5, .2, o, 'sawtooth'); break;
    case 'groan': groan(o, 1); break;
  } } catch (e) {}
}
let ac = null; const SOUND = false; // set true to bring the beeps back
const sfx = (f, d, ty = 'sawtooth', v = .08, f2 = f * .5) => { if (!SOUND || !ac) return; const o = ac.createOscillator(), g = ac.createGain(), n = ac.currentTime; o.type = ty; o.frequency.setValueAtTime(f, n); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), n + d); g.gain.setValueAtTime(v, n); g.gain.exponentialRampToValueAtTime(.001, n + d); o.connect(g); g.connect(ac.destination); o.start(); o.stop(n + d); };
const sp = []; for (let i = 0; i < 900; i++) { const a = Math.random() * 6.283, e = Math.acos(Math.random()); sp.push(Math.cos(a) * Math.sin(e) * 420, Math.cos(e) * 420, Math.sin(a) * Math.sin(e) * 420); }
const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false }));
scene.add(stars);

// ===== CHUNKED INFINITE WORLD =====
const CS = 64, RAD = GQ.rad, chunks = {}, tg = new THREE.Group(), mg = new THREE.Group();
scene.add(tg, mg);
const terrMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
const nc = document.createElement('canvas'); nc.width = nc.height = 256; const nx = nc.getContext('2d'), nd = nx.createImageData(256, 256);
for (let i = 0; i < nd.data.length; i += 4) { const v = 150 + Math.random() * 105 | 0; nd.data[i] = nd.data[i + 1] = nd.data[i + 2] = v; nd.data[i + 3] = 255; } nx.putImageData(nd, 0, 0);
const dTex = new THREE.CanvasTexture(nc); dTex.wrapS = dTex.wrapT = THREE.RepeatWrapping; dTex.repeat.set(CS / 8, CS / 8); dTex.anisotropy = 8;
terrMat.map = dTex; terrMat.bumpMap = dTex; terrMat.bumpScale = 1.5;
const propMats = [new THREE.MeshStandardMaterial({ color: 0x1b1612, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0x4a4a46, roughness: 1, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: 0x58585a, roughness: .9 }), new THREE.MeshStandardMaterial({ color: 0x66e6ff, emissive: 0x2ab8ff, emissiveIntensity: 2.2 })];
const propGeo = [new THREE.CylinderGeometry(.18, .3, 1, 6).translate(0, .5, 0), new THREE.DodecahedronGeometry(1).translate(0, .3, 0),
  new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0), new THREE.OctahedronGeometry(.5).translate(0, .5, 0)];
const propCfg = [[26, r => [1, 4 + r() * 5, 1]], [14, r => { const s = 1 + r() * 1.8; return [s, s * .8, s]; }],
  [5, r => [2.5 + r() * 3, 4 + r() * 6, 2.5 + r() * 3]], [12, r => { const s = 1 + r() * 2; return [s * .6, s * 2, s * .6]; }]];
const mul = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

let grassOn = GQ.grass > 0, grassDensity = GQ.grass, grassMeshes = [], visT = 0;
const grassGeo = (() => { const pos = [], col = [], nor = [], idx = [];
  for (let k = 0; k < 2; k++) { const a = k * Math.PI / 2, cx = Math.cos(a), sz = Math.sin(a), b = pos.length / 3;
    for (let r = 0; r <= 2; r++) { const y = r / 2, w = .075 * (1 - y * .9); for (const sg of [-1, 1]) { pos.push(cx * w * sg, y * .8, sz * w * sg); const g = .3 + y * .7; col.push(g, g, g); nor.push(0, 1, 0); } }
    for (let r = 0; r < 2; r++) { const i0 = b + r * 2; idx.push(i0, i0 + 1, i0 + 2, i0 + 1, i0 + 3, i0 + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setIndex(idx); return g; })();
const grassU = { time: { value: 0 } };
const mkGrass = c => { const m = new THREE.MeshStandardMaterial({ color: c, vertexColors: true, roughness: 1, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => { sh.uniforms.gTime = grassU.time; sh.vertexShader = 'uniform float gTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float gw = position.y; float gx = instanceMatrix[3][0]; float gz = instanceMatrix[3][2];\n transformed.x += sin(gTime * 1.6 + gx * .35 + gz * .21) * gw * gw * .3;\n transformed.z += cos(gTime * 1.2 + gx * .27 - gz * .33) * gw * gw * .22;'); };
  return m; };
const grassMats = [mkGrass(0x8a8640), mkGrass(0xa89058)];
const branchGeo = new THREE.CylinderGeometry(.04, .09, 1, 5).translate(0, .5, 0);
const pickM = new THREE.Group(); { const a = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .8, 8), new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: .9 })), b = new THREE.Mesh(new THREE.BoxGeometry(.5, .06, .07), new THREE.MeshStandardMaterial({ color: 0xa9b2b8, metalness: .8, roughness: .4 })); b.position.y = .4; pickM.add(a, b); } pickM.visible = false; camera.add(pickM);
const starHand = new THREE.Mesh(new THREE.OctahedronGeometry(.09), new THREE.MeshStandardMaterial({ color: 0x66e6ff, emissive: 0x44ccff, emissiveIntensity: 2.5 })); starHand.position.set(.3, -.2, -.55); starHand.visible = false; camera.add(starHand);
const starL = new THREE.PointLight(0x66e6ff, 0, 30, 2); starL.position.set(.3, -.1, -.6); camera.add(starL); // holding Starlight lights up the night
const mLight = new THREE.PointLight(0xffaa55, 0, 22, 2); mLight.position.set(.3, -.15, -1.2); camera.add(mLight); // muzzle flash lights the world
const NP = 160, pp = new Float32Array(NP * 3).map((v, i) => i % 3 === 1 ? -9999 : 0), pc = new Float32Array(NP * 3), pv = new Float32Array(NP * 3), pl = new Float32Array(NP), pg = new THREE.BufferGeometry(); let pn = 0;
pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
const parts = new THREE.Points(pg, new THREE.PointsMaterial({ size: .16, vertexColors: true, transparent: true, opacity: .9, depthWrite: false })); parts.frustumCulled = false; scene.add(parts);
function burst(pt, hex, n, sp) { const c = new THREE.Color(hex); for (let q = 0; q < n; q++) { const i = pn++ % NP, k = i * 3; pp[k] = pt.x; pp[k + 1] = pt.y; pp[k + 2] = pt.z; pv[k] = (Math.random() - .5) * sp; pv[k + 1] = Math.random() * sp * .9; pv[k + 2] = (Math.random() - .5) * sp; pc[k] = c.r; pc[k + 1] = c.g; pc[k + 2] = c.b; pl[i] = .5 + Math.random() * .4; } }
function stepParts(dt) { for (let i = 0; i < NP; i++) { const k = i * 3; if (pl[i] <= 0) { pp[k + 1] = -9999; continue; } pl[i] -= dt; pv[k + 1] -= 14 * dt; pp[k] += pv[k] * dt; pp[k + 1] += pv[k + 1] * dt; pp[k + 2] += pv[k + 2] * dt; } pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true; }
function fillGrass(i, j, gmesh, gi) { // (re)plant a chunk's grass: skips dug/filled ground, sits on the current surface
  const gr = mul(((i * 2654435761) ^ (j * 40503) ^ (gi * 977)) >>> 0), go = new THREE.Object3D(); let cnt = 0;
  for (let q = 0, lim = Math.floor(1200 * grassDensity); q < lim; q++) { const x = (i - .5 + gr()) * CS, z = (j - .5 + gr()) * CS, sc = .55 + gr() * .75, ry = gr() * 6.28; if (Math.hypot(x, z) < 16 || Math.abs(D(x, z)) > .02) continue;
    const h0 = H(x, z); if (Math.abs(H(x + 1, z) - h0) + Math.abs(H(x, z + 1) - h0) > 1.3) continue;
    go.position.set(x, h0 - .03, z); go.rotation.set(0, ry, 0); go.scale.set(sc * .9, sc, sc * .9); go.updateMatrix(); gmesh.setMatrixAt(cnt++, go.matrix); }
  gmesh.count = cnt; gmesh.instanceMatrix.needsUpdate = true;
}
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
  const props = [], trees = [], grass = [], solids = [], d = new THREE.Object3D(), rng = mul(((i * 73856093) ^ (j * 19349663)) >>> 0);
  propCfg.forEach(([n, sc], k) => {
    const im = new THREE.InstancedMesh(propGeo[k], propMats[k], n), ids = []; let cnt = 0;
    for (let q = 0; q < n; q++) {
      const x = (i - .5 + rng()) * CS, z = (j - .5 + rng()) * CS, ry = rng() * 6.28, sv = sc(rng); if (Math.hypot(x, z) < 24) continue;
      const hy = H(x, z) - .2; d.position.set(x, hy, z); d.rotation.set(0, ry, 0); d.scale.set(...sv); d.updateMatrix(); const id = (k ? 'rbs'[k - 1] + '_' : '') + i + '_' + j + '_' + q; ids.push(id); if (k === 0) trees.push([x, hy, z, sv[1]]);
      if (k < 3) { const so = k === 0 ? { x, z, r: .3, top: hy + sv[1] } : k === 1 ? { x, z, r: sv[0] * .85, top: hy + sv[0] } : { x, z, hw: sv[0] / 2, hd: sv[2] / 2, c: Math.cos(ry), s: Math.sin(ry), top: hy + sv[1] };
        so.key = id; so.dead = k === 0 ? choppedSet.has(id) : minedSet.has(id); solids.push(so); solidByKey.set(id, so); } // trees, rocks and ruins are solid
      im.setMatrixAt(cnt++, d.matrix);
    }
    im.count = cnt; im.userData.ids = ids; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; scene.add(im); props.push(im);
    propLists[k].push(im); ids.forEach((id, n2) => { if (k === 0 ? choppedSet.has(id) : minedSet.has(id)) im.setMatrixAt(n2, ZERO); }); im.instanceMatrix.needsUpdate = true;
  });
  { // dead-tree branches (2 per trunk, same order as the trunk instances)
    const trunk = props[0], bm = new THREE.InstancedMesh(branchGeo, propMats[0], Math.max(1, trees.length * 2)), bo = new THREE.Object3D(), br = mul(((i * 31337) ^ (j * 7919)) >>> 0); bo.rotation.order = 'YXZ';
    trees.forEach(([x, y, z, h], n2) => { const dead = choppedSet.has(trunk.userData.ids[n2]);
      for (let b = 0; b < 2; b++) { const fr = b ? .8 : .55, len = (1.7 + br() * 1.2) * (1.2 - fr * .5); bo.position.set(x, y + h * fr, z); bo.rotation.set(1 + br() * .4, br() * 6.28, 0); bo.scale.set(1, len, 1); bo.updateMatrix(); bm.setMatrixAt(n2 * 2 + b, dead ? ZERO : bo.matrix); } });
    bm.count = trees.length * 2; bm.frustumCulled = false; bm.castShadow = true; scene.add(bm); props.push(bm); trunk.userData.br = bm;
  }
  grassMats.forEach((gm, gi) => { const gmesh = new THREE.InstancedMesh(grassGeo, gm, 1200); fillGrass(i, j, gmesh, gi); // wind-blown dry grass (G toggles it)
    gmesh.frustumCulled = false; gmesh.receiveShadow = true; gmesh.visible = grassOn; scene.add(gmesh); props.push(gmesh); grass.push([gmesh, gi]); grassMeshes.push({ m: gmesh, x: i * CS, z: j * CS }); });
  chunks[i + ',' + j] = { mesh, props, grass, solids, i, j };
}
function updateChunks() {
  let made = 0; const ci = Math.round(camera.position.x / CS), cj = Math.round(camera.position.z / CS);
  for (let i = ci - RAD; i <= ci + RAD; i++) for (let j = cj - RAD; j <= cj + RAD; j++) if (!chunks[i + ',' + j] && !made) { makeChunk(i, j); made = 1; }
  for (const k in chunks) { const [i, j] = k.split(',').map(Number);
    if (Math.abs(i - ci) > RAD + 1 || Math.abs(j - cj) > RAD + 1) { const c = chunks[k]; tg.remove(c.mesh); c.mesh.geometry.dispose(); c.solids.forEach(so => solidByKey.delete(so.key)); c.props.forEach(m => { scene.remove(m); m.dispose(); for (const L of propLists) { const q = L.indexOf(m); if (q >= 0) L.splice(q, 1); } }); delete chunks[k]; } }
}

// ===== DIGGING =====
// ===== ITEMS / HOTBAR / INVENTORY / CRAFTING =====
const ITEMS = { gun: { n: 'Pistol', c: '#ffcc33', t: 'combat' }, shovel: { n: 'Shovel', c: '#c28a4a', t: 'dig' }, pick: { n: 'Pickaxe', c: '#9aa7ad', t: 'pick', k: 'pick' }, door: { n: 'Trapdoor', c: '#8a5a2b', t: 'door', k: 'doors' },
  table: { n: 'Craft Table', c: '#b07a3a', t: 'table', k: 'tables' }, wood: { n: 'Wood', c: '#6b4423', k: 'logs' }, stick: { n: 'Sticks', c: '#a07848', k: 'sticks' }, stone: { n: 'Stone', c: '#8a8d90', k: 'stone' }, star: { n: 'Starlight', c: '#6ff0ff', t: 'star', k: 'star' } };
const RECIPES = [
  { id: 'stick', n: 'Sticks x4', cost: '2 Wood', ok: () => (INV.logs || 0) >= 2 },
  { id: 'table', n: 'Crafting Table', cost: '4 Wood', ok: () => (INV.logs || 0) >= 4 },
  { id: 'pick', n: 'Wooden Pickaxe', cost: '2 Sticks + 3 Wood', table: true, ok: () => (INV.sticks || 0) >= 2 && (INV.logs || 0) >= 3 },
  { id: 'door', n: 'Trapdoor', cost: '4 Wood', ok: () => (INV.logs || 0) >= 4 }];
const cntOf = id => { const k = ITEMS[id] && ITEMS[id].k; return k ? (INV[k] || 0) : -1; }; // -1 = tool you always have
const modeOf = id => { const it = ITEMS[id]; if (!it || !it.t) return 'hand'; return it.k && !(INV[it.k] > 0) ? 'hand' : it.t; };
function fixLayout() { // 36 slots, no duplicates, you always keep your pistol + shovel
  layout = layout.slice(0, 36); while (layout.length < 36) layout.push(null);
  layout = layout.map((id, i) => ITEMS[id] && layout.indexOf(id) === i ? id : null);
  for (const id of ['gun', 'shovel']) if (!layout.includes(id)) layout[layout.indexOf(null)] = id;
}
function syncLayout() { // got an item -> first empty hotbar slot (else bag); ran out -> slot empties
  for (const id in ITEMS) { const have = cntOf(id) !== 0, at = layout.indexOf(id);
    if (have && at < 0) { let i = layout.slice(0, 9).indexOf(null); if (i < 0) i = layout.indexOf(null, 9); if (i >= 0) layout[i] = id; }
    else if (!have && at >= 0) layout[at] = null; }
}
const slotHTML = (i, cls, num) => { const id = layout[i], it = ITEMS[id], u = num ? '<u>' + num + '</u>' : ''; if (!it) return `<div class="${cls}" data-i="${i}">${u}</div>`; const n = cntOf(id);
  return `<div class="${cls}${n === 0 ? ' dim' : ''}" data-i="${i}">${u}<i style="background:${it.c}"></i><span>${it.n}</span>${n >= 0 ? '<b>' + n + '</b>' : ''}</div>`; };
function renderHotbar() { let h = ''; for (let i = 0; i < 9; i++) h += slotHTML(i, 'slot' + (i === sel ? ' on' : ''), i + 1); $('hotbar').innerHTML = h; }
function setSel(i) { sel = i; mode = modeOf(layout[i]); renderHotbar(); }
function renderInv() {
  let g = ''; for (let i = 9; i < 36; i++) g += slotHTML(i, 'islot' + (picked === i ? ' pk' : ''));
  g += '<div class="isep"></div>'; for (let i = 0; i < 9; i++) g += slotHTML(i, 'islot' + (picked === i ? ' pk' : '') + (sel === i ? ' on' : ''), i + 1);
  $('invgrid').innerHTML = g; const near = tablesList.some(t => Math.hypot(t.x - P.x, t.z - P.z) < 5);
  $('recipes').innerHTML = RECIPES.map(r => { const ok = r.ok() && (!r.table || near); return `<div class="rec${ok ? '' : ' no'}"><div><b>${r.n}</b><br><small>${r.cost}${r.table ? (near ? ' | table nearby' : ' | needs a crafting table nearby') : ''}</small></div><button data-r="${r.id}" ${ok ? '' : 'disabled'}>CRAFT</button></div>`; }).join('');
}
function renderUI() { if (invLoaded) syncLayout(); mode = modeOf(layout[sel]); renderHotbar(); for (const [id, k] of [['wood', 'logs'], ['doors', 'doors'], ['sticks', 'sticks'], ['stone', 'stone'], ['star', 'star']]) $(id).innerText = INV[k] || 0; if (invOpen) renderInv(); }
$('hotbar').addEventListener('pointerdown', e => { const el = e.target.closest('.slot'); if (el) { e.preventDefault(); setSel(+el.dataset.i); } });
$('invgrid').addEventListener('pointerdown', e => { const el = e.target.closest('.islot'); if (!el) return; const i = +el.dataset.i;
  if (picked === null) { if (layout[i]) picked = i; } else { [layout[picked], layout[i]] = [layout[i], layout[picked]]; picked = null; mode = modeOf(layout[sel]); renderHotbar(); save(); } renderInv(); });
$('recipes').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !b.disabled) { act({ t: 'craft', r: b.dataset.r }); sound('place'); } });
$('invclose').addEventListener('click', () => closeInv());
function openInv() { if (!uid || invOpen) return; invOpen = true; if (!isTouch) controls.unlock(); $('invscreen').style.display = 'flex'; picked = null; renderInv(); }
function closeInv() { if (!invOpen) return; invOpen = false; $('invscreen').style.display = 'none'; if (!isTouch) controls.lock(); }
fixLayout(); renderHotbar();

const dirty = new Set();
const markDirty = (ix, iz) => { for (const a of [Math.round((ix - .5) / CS), Math.round((ix + .5) / CS)]) for (const b of [Math.round((iz - .5) / CS), Math.round((iz + .5) / CS)]) dirty.add(a + ',' + b); };
function digAt(px, pz, amt) { act({ t: 'dig', x: +px.toFixed(2), z: +pz.toFixed(2), a: amt > 0 ? .45 : -.45 }); } // server edits the terrain, then everyone receives it

// ===== MULTIPLAYER =====
function initNet() {
  hbLast = performance.now();
  const wake = () => { if (SERVER_URL) fetch(SERVER_URL.replace(/\/$/, '') + '/ping', { mode: 'no-cors' }).catch(() => {}); }; wake(); setInterval(wake, 4 * 60 * 1000); // Render free servers sleep after 15 min without visitors
  const onHole = s => { const v = s.val(), [ix, iz] = s.key.split('_').map(Number), k = ix + ',' + iz; if (dg[k] === v) return; if (!(k in dg)) dn++; dg[k] = v; markDirty(ix, iz); };
  db.ref('holes').on('child_added', onHole); db.ref('holes').on('child_changed', onHole);
  db.ref('chopped').on('child_added', s => { choppedSet.add(s.key); applyChop(s.key); });
  db.ref('doors').on('child_added', s => addDoor(s.key, s.val())); db.ref('doors').on('child_removed', s => removeDoor(s.key));
  db.ref('world/night').on('value', s => { nightNo = s.val() || 0; });
  db.ref('world/hb').on('value', () => { hbLast = performance.now(); });
  db.ref('inv/' + uid).on('value', s => { invLoaded = true; INV = s.val() || {}; logs = INV.logs || 0; doors = INV.doors || 0; scrap = INV.scrap || 0; renderUI(); });
  db.ref('mined').on('child_added', s => { minedSet.add(s.key); applyMined(s.key); });
  db.ref('tables').on('child_added', s => addTable(s.key, s.val())); db.ref('tables').on('child_removed', s => removeTable(s.key));
  db.ref('stats/' + uid).on('value', s => { const v = s.val(); if (!v) return; if (v.hp < hp) { sound('hurt'); $('hurt').style.opacity = 1; setTimeout(() => $('hurt').style.opacity = 0, 120); } hp = v.hp; });
  db.ref('tp/' + uid).on('value', s => { const v = s.val(); if (!tpInit) { tpInit = true; return; } if (v) { P.set(v.x, Math.max(v.y, H(v.x, v.z)) + EYE + .3, v.z); vx = vz = vy = 0; } });
  db.ref('msgs/' + uid).on('value', s => { const v = s.val(); if (!msgInit) { msgInit = true; return; } if (v) addChat(v.text, 'sys'); });
  db.ref('.info/serverTimeOffset').on('value', s => { srvOff = s.val() || 0; });
  db.ref('chat').limitToLast(30).on('child_added', s => { const v = s.val(), age = (Date.now() + srvOff - (v.t || 0)) / 1000; if (age > 60) return; addChat(v.name + ': ' + v.text, '', age); });
  db.ref('mobs').on('value', s => { netMobs = s.val() || {}; syncMobs(); });
  const me = db.ref('players/' + uid); me.onDisconnect().remove();
  setInterval(() => { if (active()) me.set({ name: pname, x: camera.position.x, y: camera.position.y, z: camera.position.z, t: Date.now() }); }, 100);
  db.ref('players').on('child_added', s => {
    if (s.key === uid) return; const d = s.val(), g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 1.2, 10), new THREE.MeshStandardMaterial({ color: 0xff0055, emissive: 0x550022 })); body.position.y = .6;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.3, 10, 8), body.material); head.position.y = 1.5; body.castShadow = true;
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const cc = cv.getContext('2d');
    cc.font = 'bold 34px Courier New'; cc.textAlign = 'center'; cc.fillStyle = '#0f6'; cc.fillText(d.name || 'Survivor', 128, 42, 240);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false })); tag.scale.set(3, .75, 1); tag.position.y = 2.3;
    g.add(body, head, tag); g.position.set(d.x, d.y - EYE, d.z); scene.add(g);
    remote[s.key] = { g, tp: new THREE.Vector3(d.x, d.y - EYE, d.z), tag, cc, name: d.name }; $('player-count').innerText = Object.keys(remote).length + 1;
  });
  db.ref('players').on('child_changed', s => { const r = remote[s.key]; if (r) { const d = s.val(); r.tp.set(d.x, d.y - EYE, d.z); if (d.name && d.name !== r.name) { r.name = d.name; r.cc.clearRect(0, 0, 256, 64); r.cc.fillText(d.name, 128, 42, 240); r.tag.material.map.needsUpdate = true; } } });
  db.ref('players').on('child_removed', s => { if (remote[s.key]) { scene.remove(remote[s.key].g); delete remote[s.key]; $('player-count').innerText = Object.keys(remote).length + 1; } });
}

// ===== SETTINGS: username, graphics, controls (graphics + controls are saved on this device, the name in Firestore) =====
function cleanName(n) { return String(n || '').replace(/[^\p{L}\p{N} _.\-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 20); }
function setName(n) { pname = n; $('player-name').innerText = n; if (net && uid) db.ref('players/' + uid + '/name').set(n).catch(() => {}); }
function renderSettings() {
  $('gfxopts').innerHTML = Object.keys(GFX).map(k => `<button class="gopt${k === gfxKey ? ' sel' : ''}" data-k="${k}"><b>${GFX[k].n}</b><small>${GFX[k].d}</small></button>`).join('');
  const cm = store.get('mobase_mode') || 'auto'; document.querySelectorAll('#ctlopts button').forEach(b => b.classList.toggle('sel', b.dataset.m === cm));
  $('nameIn').value = pname || ''; $('nameIn').disabled = $('nameBtn').disabled = !uid; $('nameMsg').textContent = uid ? 'Saved to your account. You can also edit "name" in Firestore (users > your id).' : 'Sign in to change your name.';
}
function openSettings() { renderSettings(); $('settings').style.display = 'flex'; }
function closeSettings() { $('settings').style.display = 'none'; }
$('gearBtn').addEventListener('click', e => { e.stopPropagation(); openSettings(); });
$('setclose').addEventListener('click', closeSettings);
function chooseGfx(k) { store.set('mobase_gfx', k); if (k === 'realistic') store.set('mobase_gfx_try', 'pending'); else store.del('mobase_gfx_try'); $('gfxmsg').textContent = 'Saved! Applying ' + GFX[k].n + '...'; save(); setTimeout(() => location.reload(), 400); }
$('gfxopts').addEventListener('click', e => { const b = e.target.closest('.gopt'); if (!b || b.dataset.k === gfxKey) return; if (b.dataset.k === 'realistic') $('gfxwarn').style.display = 'flex'; else chooseGfx(b.dataset.k); });
$('gfxyes').addEventListener('click', () => { $('gfxwarn').style.display = 'none'; chooseGfx('realistic'); });
$('gfxno').addEventListener('click', () => { $('gfxwarn').style.display = 'none'; });
$('ctlopts').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.m === 'auto') store.del('mobase_mode'); else store.set('mobase_mode', b.dataset.m); location.href = location.pathname; });
$('nameBtn').addEventListener('click', () => {
  const n = cleanName($('nameIn').value); if (n.length < 2) { $('nameMsg').textContent = 'Name needs 2-20 letters or numbers.'; return; }
  userDoc().set({ name: n }, { merge: true }).then(() => { setName(n); $('nameMsg').textContent = 'Saved! You are now "' + n + '".'; }).catch(() => { $('nameMsg').textContent = 'Could not save the name (check your Firestore rules).'; });
});
$('nameIn').addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('nameBtn').click(); });
if (gfxNote) setTimeout(() => addChat(gfxNote, 'sys'), 2000);

// ===== CHAT + COMMANDS =====
const chatIn = $('chatin'), chatLog = $('chatlog');
function addChat(text, cls, age = 0) { // age (seconds) lets messages that were sent a while ago appear already faded
  for (const line of String(text).split('\n')) { const d = document.createElement('div'); d.className = 'cl ' + (cls || ''); d.textContent = line; if (age > 0) d.style.animationDelay = '-' + Math.min(age, 60) + 's'; chatLog.appendChild(d); setTimeout(() => d.remove(), Math.max(0, 60 - age) * 1000); }
  while (chatLog.children.length > 14) chatLog.removeChild(chatLog.firstChild); chatLog.scrollTop = 1e6;
}
function openChat(pre) { chatting = true; if (!isTouch) controls.unlock(); chatIn.style.display = 'block'; chatIn.value = pre || ''; chatIn.focus(); chatLog.classList.add('open'); }
function closeChat() { chatting = false; chatIn.style.display = 'none'; chatIn.blur(); chatLog.classList.remove('open'); }
chatIn.addEventListener('keydown', e => { e.stopPropagation();
  if (e.key === 'Enter') { const v = chatIn.value.trim(); if (v) act({ t: 'chat', text: v.slice(0, 200) }); closeChat(); if (!isTouch) controls.lock(); }
  else if (e.key === 'Escape') { closeChat(); $('blocker').style.display = 'flex'; } });
document.addEventListener('pointerlockerror', () => { $('blocker').style.display = 'flex'; msg('Mouse capture failed. On a phone? Settings > Controls > Phone / tablet'); });

// ===== CONTROLS / PHYSICS =====
const controls = new THREE.PointerLockControls(camera, document.body), P = camera.position, EYE = 1.6, R = .35;
$('blocker').addEventListener('click', () => { if (!uid) return; if (isTouch) startTouch(); else if (!document.body.requestPointerLock) { store.set('mobase_mode', 'touch'); location.reload(); } else controls.lock(); }); // no mouse-capture (phones in desktop mode)? switch to touch controls
controls.addEventListener('lock', () => { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); audioInit(); $('blocker').style.display = 'none'; });
controls.addEventListener('unlock', () => { $('blocker').style.display = (chatting || invOpen) ? 'none' : 'flex'; for (const k in key) delete key[k]; mouseL = mouseR = false; save(); });
addEventListener('blur', () => { for (const k in key) delete key[k]; mouseL = mouseR = false; });
const MODES = ['combat', 'dig', 'door'];
addEventListener('wheel', e => { if (isPlay()) setSel((sel + (e.deltaY > 0 ? 1 : 8)) % 9); });
P.set(0, EYE, 8);
let vx = 0, vz = 0, vy = 0, ground = true; const key = {};
addEventListener('keydown', e => {
  if (chatting) return;
  if (invOpen) { if (e.code === 'KeyE' || e.code === 'KeyI' || e.code === 'Escape') { e.preventDefault(); closeInv(); } return; }
  if (isPlay() && (e.code === 'Enter' || e.code === 'KeyT' || e.code === 'Slash')) { e.preventDefault(); openChat(e.code === 'Slash' ? '/' : ''); return; }
  key[e.code] = 1;
  if (e.code === 'KeyF') flashOn = !flashOn;
  if (e.code === 'KeyR' && reload <= 0 && ammo < 15) { reload = 1.2; sound('reload'); }
  if (/^Digit[1-9]$/.test(e.code)) setSel(+e.code[5] - 1); if (e.code === 'KeyE' || e.code === 'KeyI') openInv(); if (e.code === 'KeyQ') act({ t: 'open' });
  if (e.code === 'KeyM' && A) { A.muted = !A.muted; A.master.gain.value = A.muted ? 0 : .85; msg(A.muted ? 'Sound OFF' : 'Sound ON'); }
  if (e.code === 'KeyG') { grassOn = !grassOn; msg(grassOn ? 'Grass ON' : 'Grass OFF (faster)'); }
  if (e.code === 'Space') e.preventDefault();
  if (e.code === 'Space' && ground) { vy = 13; ground = false; }
});
addEventListener('keyup', e => delete key[e.code]);
const hit = (x, z) => H(x, z) - (P.y - EYE) > (ground ? 2.2 * Math.hypot(x - P.x, z - P.z) + .03 : .35);

const rc = new THREE.Raycaster();
const ray = (objs, far) => { rc.far = far; rc.setFromCamera({ x: 0, y: 0 }, camera); return rc.intersectObjects(objs, true); };
function tracer(a, b, color) {
  const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color, transparent: true }));
  scene.add(l); tracers.push({ l, life: .12 });
}
let shotCd = 0, mouseL = false, mouseR = false, digCd = 0, swing = 0, ammo = 15, reload = 0, recoil = 0, flashT = 0;
function fire() {
  if (shotCd > 0 || reload > 0) return;
  if (ammo <= 0) { reload = 1.2; sound('reload'); return; }
  ammo--; shotCd = .13; recoil = 1; flashT = .05; camera.rotation.x = Math.min(1.5, camera.rotation.x + .012); sound('shot'); mLight.intensity = 5;
  const h = ray([mg, tg], 90)[0], dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  tracer(camera.localToWorld(new THREE.Vector3(.28, -.23, -1.15)), h ? h.point : P.clone().addScaledVector(dir, 90), 0xffee88);
  let mo = h && h.object; while (mo && !mo.userData.mob && mo.parent) mo = mo.parent; const isM = !!(mo && mo.userData.mob); if (h) burst(h.point, isM ? 0x8a0a0a : 0xb8a88a, isM ? 12 : 6, isM ? 5 : 3);
  if (isM) { hurtMob(mo, 20); sound('hit'); }
  if (ammo <= 0) { reload = 1.2; sound('reload'); }
}
addEventListener('mousedown', e => { if (!isPlay()) return; if (e.button === 0) mouseL = true; if (e.button === 2) mouseR = true; });
addEventListener('mouseup', e => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
addEventListener('contextmenu', e => e.preventDefault());
function active() { return controls.isLocked || touchOn; }
function isPlay() { return active() && !chatting && !invOpen; }
function startTouch() {
  if (!uid) return; touchOn = true; $('blocker').style.display = 'none';
  ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); audioInit();
  try { const de = document.documentElement; (de.requestFullscreen || de.webkitRequestFullscreen || (() => {})).call(de); if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
}
if (isTouch) {
  document.body.classList.add('touch');
  const zone = $('lookzone'); let lid = null, lx = 0, ly = 0; // drag anywhere on the right to look around
  zone.addEventListener('pointerdown', e => { if (lid === null) { lid = e.pointerId; lx = e.clientX; ly = e.clientY; zone.setPointerCapture(e.pointerId); } });
  zone.addEventListener('pointermove', e => { if (e.pointerId !== lid) return; const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY; if (!isPlay()) return; camera.rotation.y -= dx * .0045; camera.rotation.x = Math.max(-1.5, Math.min(1.5, camera.rotation.x - dy * .0045)); });
  const lend = e => { if (e.pointerId === lid) lid = null; }; zone.addEventListener('pointerup', lend); zone.addEventListener('pointercancel', lend);
  const jb = $('joy'), jk = $('joyk'); let jid = null, jx0 = 0, jy0 = 0; // move stick
  const jmove = e => { let dx = e.clientX - jx0, dy = e.clientY - jy0; const m = Math.hypot(dx, dy), max = 55; if (m > max) { dx = dx / m * max; dy = dy / m * max; } joy.x = dx / max; joy.y = dy / max; jk.style.transform = `translate(${dx}px,${dy}px)`; };
  jb.addEventListener('pointerdown', e => { jid = e.pointerId; jb.setPointerCapture(jid); const r = jb.getBoundingClientRect(); jx0 = r.left + r.width / 2; jy0 = r.top + r.height / 2; jmove(e); });
  jb.addEventListener('pointermove', e => { if (e.pointerId === jid) jmove(e); });
  const jend = e => { if (e.pointerId === jid) { jid = null; joy.x = joy.y = 0; jk.style.transform = 'translate(0,0)'; } }; jb.addEventListener('pointerup', jend); jb.addEventListener('pointercancel', jend);
  const hold = (id, on, off) => { const el = $(id); el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('down'); on(); }); const up = () => { el.classList.remove('down'); if (off) off(); }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); };
  const tap = (id, fn) => $(id).addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
  hold('bFire', () => { if (isPlay()) mouseL = true; }, () => { mouseL = false; }); hold('bFill', () => { if (isPlay()) mouseR = true; }, () => { mouseR = false; });
  hold('bJump', () => { if (isPlay() && ground) { vy = 13; ground = false; } });
  tap('bRun', () => { touchRun = !touchRun; $('bRun').classList.toggle('on', touchRun); }); tap('bInv', () => invOpen ? closeInv() : openInv()); tap('bChat', () => openChat(''));
  tap('bFlash', () => { flashOn = !flashOn; }); tap('bReload', () => { if (reload <= 0 && ammo < 15) { reload = 1.2; sound('reload'); } }); tap('bTake', () => act({ t: 'open' }));
  tap('bMenu', () => { touchOn = false; mouseL = mouseR = false; $('blocker').style.display = 'flex'; save(); });
}

// ===== SOLID PROPS / CRAFTING TABLES / MINED ROCKS =====
const tableMat = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: .85 }), tableTop = new THREE.MeshStandardMaterial({ color: 0xb98a4e, roughness: .8 });
function addTable(key, v) {
  if (tablesList.some(t => t.key === key)) return;
  const g = new THREE.Group(), bx = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; g.add(o); };
  bx(1.1, .12, 1.1, tableTop, 0, .9, 0); for (const [lx, lz] of [[-.45, -.45], [.45, -.45], [-.45, .45], [.45, .45]]) bx(.12, .84, .12, tableMat, lx, .42, lz); bx(.9, .06, .9, tableMat, 0, .28, 0);
  g.position.set(v.x, v.y, v.z); g.rotation.y = v.ry || 0; g.userData.tkey = key; scene.add(g);
  tablesList.push({ key, x: v.x, z: v.z, y: v.y, g, solid: { x: v.x, z: v.z, r: .72, top: v.y + .96, key: 't_' + key } }); if (Math.hypot(v.x - P.x, v.z - P.z) < 40) sound('place', { x: v.x, z: v.z });
}
function removeTable(key) { const n = tablesList.findIndex(t => t.key === key); if (n >= 0) { scene.remove(tablesList[n].g); tablesList.splice(n, 1); } }
function applyMined(key) { // rock / ruin / starlight was mined by someone: remove it for everyone
  const so = solidByKey.get(key); if (so) so.dead = true; const m = /^([rbs])_(-?\d+)_(-?\d+)_(\d+)$/.exec(key); if (!m) return;
  const c = chunks[m[2] + ',' + m[3]]; if (!c) return; const im = c.props['rbs'.indexOf(m[1]) + 1], n = im.userData.ids.indexOf(key); if (n >= 0) { im.setMatrixAt(n, ZERO); im.instanceMatrix.needsUpdate = true; }
}
function nearSolids(x, z) {
  const out = [], ci = Math.round(x / CS), cj = Math.round(z / CS);
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const c = chunks[(ci + a) + ',' + (cj + b)]; if (c) for (const so of c.solids) if (!so.dead && Math.abs(so.x - x) < 14 && Math.abs(so.z - z) < 14) out.push(so); }
  for (const t of tablesList) if (Math.abs(t.x - x) < 14 && Math.abs(t.z - z) < 14) out.push(t.solid);
  return out;
}
function inSolid(so, x, z, m) { if (so.r) return Math.hypot(x - so.x, z - so.z) < so.r + m; const dx = x - so.x, dz = z - so.z; return Math.abs(dx * so.c - dz * so.s) < so.hw + m && Math.abs(dx * so.s + dz * so.c) < so.hd + m; }

// ===== WOOD / TRAPDOOR / BUNKER =====
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), chopHits = {}, placed = [], MAXS = 26;
const doorMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: .85 }), barMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: .8, roughness: .4 });
const inRect = (u, x, z, m = 0) => Math.abs(x - u.x) < u.w / 2 + m && Math.abs(z - u.z) < u.d / 2 + m;
const covered = () => placed.some(u => inRect(u, P.x, P.z) && u.y > P.y);
const doorBlock = (x, z) => placed.some(u => inRect(u, x, z, .5));
function msg(s) { $('status').innerText = s; msgUntil = performance.now() + 2000; }
function applyChop(key) { const so = solidByKey.get(key); if (so) so.dead = true; const [i, j] = key.split('_'), c = chunks[i + ',' + j]; if (!c) return; const im = c.props[0], n = im.userData.ids.indexOf(key); if (n >= 0) { im.setMatrixAt(n, ZERO); im.instanceMatrix.needsUpdate = true; const bm = im.userData.br; if (bm) { bm.setMatrixAt(n * 2, ZERO); bm.setMatrixAt(n * 2 + 1, ZERO); bm.instanceMatrix.needsUpdate = true; } } }
function chop(h) { const im = h.object, id = h.instanceId; if (id != null) act({ t: 'chop', key: im.userData.ids[id] }); } // server counts hits, gives wood, saves the tree as chopped
function craft() { act({ t: 'craft' }); }
// where would a trapdoor go? Stretches over the whole pit (up to MAXS wide), otherwise a small 2.4 door.
function doorTarget() {
  const inPit = H0(P.x, P.z) - H(P.x, P.z) >= 2 && camera.rotation.x > .5; let cx, cz;
  if (inPit) { cx = P.x; cz = P.z; } else { const h = ray([tg], 10)[0]; if (!h) return null; cx = h.point.x; cz = h.point.z; }
  const ci = Math.floor(cx), cj = Math.floor(cz), dug = (a, b) => (dg[a + ',' + b] || 0) < -.3; let seed = null;
  for (let a = -1; a <= 2 && !seed; a++) for (let b = -1; b <= 2; b++) if (dug(ci + a, cj + b)) { seed = [ci + a, cj + b]; break; }
  let x0 = cx - 1.2, x1 = cx + 1.2, z0 = cz - 1.2, z1 = cz + 1.2;
  if (seed) {
    const seen = new Set([seed.join()]), q = [seed]; x0 = z0 = 1e9; x1 = z1 = -1e9;
    while (q.length && seen.size < 1200) { const [a, b] = q.pop(); x0 = Math.min(x0, a - 1.8); x1 = Math.max(x1, a + 1.8); z0 = Math.min(z0, b - 1.8); z1 = Math.max(z1, b + 1.8);
      for (const [da, db2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const na = a + da, nb = b + db2, k = na + ',' + nb; if (!seen.has(k) && dug(na, nb) && Math.abs(na - ci) <= 16 && Math.abs(nb - cj) <= 16) { seen.add(k); q.push([na, nb]); } } }
  }
  const w = Math.min(MAXS, x1 - x0), d = Math.min(MAXS, z1 - z0), x = (x0 + x1) / 2, z = (z0 + z1) / 2; let y = -1e9;
  for (const fx of [-.5, 0, .5]) for (const fz of [-.5, 0, .5]) y = Math.max(y, H0(x + fx * w, z + fz * d));
  return { cx, cz, x: +x.toFixed(2), y: +(y + .1).toFixed(2), z: +z.toFixed(2), w: +w.toFixed(2), d: +d.toFixed(2), big: x1 - x0 > MAXS || z1 - z0 > MAXS };
}
function placeDoor() {
  if (doors <= 0) return msg('Craft a trapdoor (C)');
  const t = doorTarget(); if (!t) return; act({ t: 'door', cx: +t.cx.toFixed(2), cz: +t.cz.toFixed(2) }); // server fits it to the pit and places it
}
function addDoor(key, v) {
  if (placed.some(u => u.key === key)) return;
  const g = new THREE.Group(), add = (w, h, d, m, px) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.x = px; o.castShadow = o.receiveShadow = true; g.add(o); return o; };
  add(v.w, .14, v.d, doorMat, 0); const nb = Math.max(2, Math.round(v.w / .9)); for (let n = 0; n <= nb; n++) add(.06, .16, v.d, barMat, -v.w / 2 + v.w * n / nb);
  add(.4, .08, .1, barMat, 0).position.y = .1; g.position.set(v.x, v.y, v.z); scene.add(g); placed.push({ key, x: v.x, y: v.y, z: v.z, w: v.w, d: v.d, g }); if (Math.hypot(v.x - P.x, v.z - P.z) < 40) sound('place', { x: v.x, z: v.z });
}
function removeDoor(key) { const n = placed.findIndex(u => u.key === key); if (n >= 0) { scene.remove(placed[n].g); placed.splice(n, 1); } }
function openDoor() { act({ t: 'open' }); }
// see-through preview of where the trapdoor will go
const ghost = new THREE.Group(), gbox = new THREE.BoxGeometry(1, 1, 1), gm = new THREE.Mesh(gbox, new THREE.MeshBasicMaterial({ color: 0x00ff66, transparent: true, opacity: .22, depthWrite: false })), ge = new THREE.LineSegments(new THREE.EdgesGeometry(gbox), new THREE.LineBasicMaterial({ color: 0x00ff66 }));
ghost.add(gm, ge); ghost.visible = false; scene.add(ghost); let ghostT = 0, gt = null;
function updateGhost(dt) {
  if (!(isPlay() && mode === 'door')) { ghost.visible = false; return; }
  if ((ghostT -= dt) <= 0) { ghostT = .08; gt = doorTarget(); }
  ghost.visible = !!gt; if (!gt) return; ghost.position.set(gt.x, gt.y, gt.z); ghost.scale.set(gt.w, .14, gt.d);
  const c = doors > 0 ? 0x00ff66 : 0xff3344; gm.material.color.setHex(c); ge.material.color.setHex(c);
}

// ===== MOBS (host-simulated: one player's browser runs the zombies, everyone else just watches them) =====
const eyeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff2200, emissiveIntensity: 3 }), bloodMat = new THREE.MeshStandardMaterial({ color: 0x5a0d0d, roughness: .6 });
const ZT = [{ hp: 30, sp: 2.4, sc: 1, skin: 0x6f8a5a, cloth: 0x3b4a5a, dmg: 8 }, { hp: 18, sp: 5.2, sc: .9, skin: 0x9aa58a, cloth: 0x5a3b3b, dmg: 6 }, { hp: 120, sp: 1.7, sc: 1.45, skin: 0x4a5a45, cloth: 0x2a2a2a, dmg: 22 }];
const corpses = [];
function buildMob(ty) {
  const Z = ZT[ty], g = new THREE.Group();
  const sk = new THREE.MeshStandardMaterial({ color: Z.skin, roughness: .95 }), cl = new THREE.MeshStandardMaterial({ color: Z.cloth, roughness: 1 });
  const box = (w, h, d, m, y, par) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.y = y; b.castShadow = true; par.add(b); return b; };
  const limb = (w, h, px, py, m) => { const p = new THREE.Group(); p.position.set(px, py, 0); box(w, h, w, m, -h / 2, p); g.add(p); return p; };
  box(.8, 1, .4, cl, 1.1, g); box(.82, .3, .42, bloodMat, 1.2, g);
  const head = new THREE.Group(); head.position.y = 1.85; box(.5, .5, .5, sk, 0, head); box(.36, .12, .12, bloodMat, -.2, head).position.z = .22;
  [-.12, .12].forEach(ex => { const e = box(.1, .08, .05, eyeMat, .06, head); e.position.x = ex; e.position.z = .26; }); g.add(head);
  const A = [limb(.22, .9, -.52, 1.55, sk), limb(.22, .9, .52, 1.55, sk)], L = [limb(.26, .8, -.2, .8, cl), limb(.26, .8, .2, .8, cl)];
  g.scale.setScalar(Z.sc); g.userData.mob = { hp: Z.hp, sp: Z.sp, dmg: Z.dmg, ph: Math.random() * 6, ty, head, A, L };
  return g;
}
function killMob(g) {
  const n = mobs.indexOf(g); if (n < 0) return; delete mobById[g.userData.id]; if (Math.hypot(g.position.x - P.x, g.position.z - P.z) < 45) sound('zdie', { x: g.position.x, z: g.position.z, ty: g.userData.mob.ty }); g.userData.mob = null; g.userData.dead = 3; mobs.splice(n, 1); corpses.push(g);
}
function hurtMob(g) { if (g.userData.mob) act({ t: 'hit', id: g.userData.id }); } // server checks range + fire rate and applies the damage
function syncMobs() { // zombies live on the server; we only draw them
  for (const id in netMobs) { const v = netMobs[id]; let g = mobById[id];
    if (!g) { g = buildMob(v.t); g.userData.id = id; g.position.set(v.x, H(v.x, v.z), v.z); mobById[id] = g; mg.add(g); mobs.push(g); }
    g.userData.tx = v.x; g.userData.tz = v.z; g.userData.ry = v.r; }
  for (const id in mobById) if (!(id in netMobs)) killMob(mobById[id]);
}
function animMobs(dt, t) {
  for (let i = corpses.length - 1; i >= 0; i--) { const c = corpses[i]; c.rotation.x = Math.max(-1.5, c.rotation.x - dt * 4); if ((c.userData.dead -= dt) <= 0) { mg.remove(c); corpses.splice(i, 1); } }
  for (const g of mobs) {
    const m = g.userData.mob, w = Math.sin(t * m.sp * 2.2 + m.ph), u = g.userData;
    if (u.tx != null) { const k = Math.min(1, dt * 8); g.position.x += (u.tx - g.position.x) * k; g.position.z += (u.tz - g.position.z) * k; g.position.y = H(g.position.x, g.position.z);
      let da = u.ry - g.rotation.y; da = Math.atan2(Math.sin(da), Math.cos(da)); g.rotation.y += da * k; }
    m.L[0].rotation.x = w * .7; m.L[1].rotation.x = -w * .7; m.A[0].rotation.x = -1.4 + w * .12; m.A[1].rotation.x = -1.4 - w * .12; m.head.rotation.z = Math.sin(t * 2 + m.ph) * .15;
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
  wasNight = isNight;

  if (isPlay()) {
    const f = (key.KeyW ? 1 : 0) - (key.KeyS ? 1 : 0) - joy.y, r = (key.KeyD ? 1 : 0) - (key.KeyA ? 1 : 0) + joy.x, yaw = camera.rotation.y;
    const wx = -Math.sin(yaw) * f + Math.cos(yaw) * r, wz = -Math.cos(yaw) * f - Math.sin(yaw) * r, l = Math.hypot(wx, wz) || 1, mag = Math.min(1, Math.hypot(f, r)), spd = ((key.ShiftLeft || key.ShiftRight || touchRun) ? 9 : 5.5) * mag, k = Math.min(1, 10 * dt);
    vx += (wx / l * spd - vx) * k; vz += (wz / l * spd - vz) * k;
    const vy0 = vy, steps = Math.ceil(dt / .008), sdt = dt / steps; // small fixed sub-steps: same feel at any FPS
    const NS = nearSolids(P.x, P.z), sblk = (x, z) => { const ft = P.y - EYE; let into = false, inside = false; for (const so of NS) if (so.top > ft + .5) { if (inSolid(so, P.x, P.z, R)) inside = true; if (inSolid(so, x, z, R)) into = true; } return into && !inside; };
    for (let n = 0; n < steps; n++) {
      const nx = P.x + vx * sdt; if (!hit(nx, P.z) && !sblk(nx, P.z)) P.x = nx;
      const nz = P.z + vz * sdt; if (!hit(P.x, nz) && !sblk(P.x, nz)) P.z = nz;
      vy -= 30 * sdt; P.y += vy * sdt; let fl = H(P.x, P.z); // trapdoors are solid: stand on top, can't jump through from below
      for (const dr of placed) if (inRect(dr, P.x, P.z)) { if (P.y - EYE >= dr.y - .5) fl = Math.max(fl, dr.y + .08); else if (P.y > dr.y - .2) { P.y = dr.y - .2; if (vy > 0) vy = 0; } }
      for (const so of NS) if (inSolid(so, P.x, P.z, .12) && P.y - EYE >= so.top - .6) fl = Math.max(fl, so.top); // stand on rocks, ruins and tables
      const gy = fl + EYE;
      if (vy <= 0 && P.y <= gy + (ground ? .5 : 0)) { P.y = gy; vy = 0; ground = true; } else ground = false;
    }

    const mv = Math.hypot(vx, vz); // footsteps + landing thud
    if (ground && mv > 1) { stepAcc += mv * dt; if (stepAcc > (mv > 7 ? 2.6 : 2)) { stepAcc = 0; sound('step', { run: mv > 7 }); } }
    if (ground && !wasGround && vy0 < -8) sound('land'); wasGround = ground;
    if ((saveT += dt) > 10) { saveT = 0; save(); }
  }

  animMobs(dt, t); updateGhost(dt);
  if (performance.now() > msgUntil) { const off = performance.now() - hbLast > 12000; $('status').innerText = off ? 'SERVER OFFLINE' : 'Online'; $('status').className = off ? 'warning' : 'success'; }
  updateChunks();
  for (const k of dirty) { dirty.delete(k); if (chunks[k]) { const c = chunks[k]; paintChunk(c.mesh.geometry); c.grass.forEach(([m, gi]) => fillGrass(c.i, c.j, m, gi)); break; } } // terrain changed: repaint ONE chunk per frame (no lag spikes while digging)
  // sky & light
  const raw = Math.sin(dayT * 6.283) - .7, se = raw > 0 ? raw / .3 : raw / 1.7, day = Math.min(1, Math.max(0, se * 3 + .4)), ang = dayT * 6.283;
  skyU.t.value.copy(PAL.nt).lerp(PAL.dt, day); skyU.b.value.copy(PAL.nb).lerp(PAL.db, day);
  scene.fog.color.copy(skyU.b.value); scene.fog.density = (.013 + (1 - day) * .006) * GQ.fog;
  sd.set(Math.cos(ang), se, .3).normalize(); skyU.sd.value.copy(sd); sun.position.copy(P).addScaledVector(sd, se >= 0 ? 120 : -120); sun.target.position.copy(P);
  sun.intensity = .25 + day * 1.1; sun.color.set(day > .5 ? 0xffe2a8 : 0x6f8cff); hemi.intensity = .18 + day * .35;
  stars.material.opacity = 1 - day; stars.position.copy(P); sky.position.copy(P);
  grassU.time.value = skyU.time.value = t; stepParts(dt); mLight.intensity = flashT > 0 ? 5 : 0;
  grade.uniforms.hurt.value += ((hp < 40 ? (40 - hp) / 40 : 0) - grade.uniforms.hurt.value) * Math.min(1, dt * 4);
  { const run = isPlay() && (key.ShiftLeft || key.ShiftRight || touchRun) && Math.hypot(vx, vz) > 6; camera.fov += ((run ? 82 : 75) - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix(); }
  if ((visT -= dt) <= 0) { visT = .4; grassMeshes = grassMeshes.filter(q => q.m.parent); for (const q of grassMeshes) q.m.visible = grassOn && Math.hypot(q.x - P.x, q.z - P.z) < 105; }
  if ((ambT -= dt) <= 0) { ambT = .3; ambient(day, Math.hypot(vx, vz)); }
  if ((groanT -= dt) <= 0) { groanT = 1.5 + Math.random() * 2.5; const near = mobs.filter(g => g.userData.mob && Math.hypot(g.position.x - P.x, g.position.z - P.z) < 50);
    if (near.length) { const g = near[Math.floor(Math.random() * near.length)]; sound('groan', { x: g.position.x, z: g.position.z, ty: g.userData.mob.ty }); } }

  for (let i = tracers.length - 1; i >= 0; i--) { const q = tracers[i]; q.life -= dt; q.l.material.opacity = Math.max(0, q.life / .12); if (q.life <= 0) { scene.remove(q.l); q.l.geometry.dispose(); tracers.splice(i, 1); } }
  for (const id in remote) remote[id].g.position.lerp(remote[id].tp, .2);

  $('scrap').innerText = scrap; $('mode').innerText = ((ITEMS[layout[sel]] || {}).n || 'Hands').toUpperCase() + (covered() ? ' | SAFE' : '');
  $('hpfill').style.width = Math.max(0, hp) + '%';
  $('clock').innerText = wasNight ? `NIGHT ${nightNo} - MOBS: ${mobs.length}` : `DAY - NIGHT ${nightNo + 1} COMES`;
  $('clock').className = wasNight ? 'warning' : 'success';
  for (let i = 0; i < AN; i++) { const k = i * 3; ap[k] = wrap(ap[k] + (Math.sin(t * .5 + i) * .5 + .8) * dt, P.x); ap[k + 1] = wrap(ap[k + 1] - .7 * dt, P.y); ap[k + 2] = wrap(ap[k + 2] + Math.cos(t * .4 + i) * .4 * dt, P.z); }
  ag.attributes.position.needsUpdate = true; flash.intensity = flashOn ? (1 - day) * 2.5 : 0; grade.uniforms.time.value = (t % 50) + 1;
  digCd -= dt; swing = Math.max(0, swing - dt * 5); shovel.visible = mode === 'dig'; pickM.visible = mode === 'pick'; starHand.visible = mode === 'star'; starL.intensity = mode === 'star' ? 2.4 : 0;
  let tb = null; // crafting table under the crosshair (any item can break it)
  { const nm = performance.now(); if (curMine && (!mouseL || (mode !== 'dig' && mode !== 'pick') || nm - mineLast > 600)) curMine = null;
    if (isPlay() && mouseL && tablesList.length) { const th = ray(tablesList.map(t => t.g), 4)[0]; if (th) { let o = th.object; while (o && !o.userData.tkey) o = o.parent; if (o) tb = { key: o.userData.tkey, point: th.point }; } }
    if (tb && digCd <= 0) { digCd = .35; swing = 1; act({ t: 'breaktable', id: tb.key }); sound('chop'); burst(tb.point, 0xb98a4e, 6, 3); } // left-click a crafting table with ANY item (or bare hands) to break it
    $('mineBar').style.display = curMine ? 'block' : 'none'; if (curMine) $('mineFill').style.width = Math.min(100, (nm - mineStart) / 600) + '%'; // Starlight: 60s of unbroken mining
    if (isPlay() && mode === 'dig' && (mouseL || mouseR) && digCd <= 0 && !tb) {
      const tr = mouseL ? ray(trunks, 4.5)[0] : null, sm = !tr && mouseL ? ray(starM, 4.5)[0] : null, hh = tr || sm ? null : ray([tg], 7)[0]; digCd = .22; swing = 1;
      if (tr) { chop(tr); sound('chop'); burst(tr.point, 0xa07848, 6, 3); }
      else if (sm) { const k = sm.object.userData.ids[sm.instanceId]; if (k) { if (k !== curMine) { curMine = k; mineStart = nm; } mineLast = nm; act({ t: 'mine', key: k }); if (Math.random() < .3) burst(sm.point, 0x66e6ff, 3, 2); } }
      else if (hh) { digAt(hh.point.x, hh.point.z, mouseL ? -.45 : .45); sound('dig'); burst(hh.point, 0x6b5a40, 8, 3.5); }
    }
    if (isPlay() && mode === 'pick' && mouseL && digCd <= 0 && !tb) { digCd = .4; swing = 1; const rk = ray(rockM.concat(ruinM, starM), 4.5)[0];
      if (rk) { const k = rk.object.userData.ids[rk.instanceId], star = k[0] === 's'; act({ t: 'mine', key: k }); if (star) { if (k !== curMine) { curMine = k; mineStart = nm; } mineLast = nm; if (Math.random() < .4) burst(rk.point, 0x66e6ff, 3, 2); } else { sound('chop'); burst(rk.point, 0x9a9da0, 8, 4); } } } // pickaxe: stone, or Starlight (same 60s hold)
    if (isPlay() && mode === 'door' && mouseL && digCd <= 0 && !tb) { digCd = .4; placeDoor(); }
    if (isPlay() && mode === 'table' && mouseL && digCd <= 0 && !tb) { digCd = .5; const h = ray([tg], 8)[0]; if (h) act({ t: 'table', cx: +h.point.x.toFixed(2), cz: +h.point.z.toFixed(2), ry: +camera.rotation.y.toFixed(2) }); }
  }
  shovel.position.set(.32, -.2, -.65 - swing * .08); shovel.rotation.set(.7 + swing * .6, 0, -.15); pickM.position.copy(shovel.position); pickM.rotation.copy(shovel.rotation);
  gun.visible = mode === 'combat'; recoil = Math.max(0, recoil - dt * 9); flashT -= dt; mf.visible = flashT > 0;
  if (reload > 0 && (reload -= dt) <= 0) ammo = 15;
  if (isPlay() && mode === 'combat' && mouseL && !tb) fire(); // aiming at a table within reach = pistol-whip it instead of shooting
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
