'use strict';
// MOBASE authoritative game server. Owns: terrain edits, zombies, trapdoors, trees, inventory, hp, homes, chat/commands.
// Clients can only send "actions" (requests); this server validates them and writes the world. Run: node server.js
const admin = require('firebase-admin');
const key = process.env.FIREBASE_SERVICE_ACCOUNT ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) : require('./serviceAccountKey.json'); // Render: env var. Local: file.
admin.initializeApp({ credential: admin.credential.cert(key), databaseURL: 'https://kitacat-mobase-default-rtdb.europe-west1.firebasedatabase.app' });
const db = admin.database(), fsdb = admin.firestore(), TS = admin.database.ServerValue.TIMESTAMP;
const CS = 64, EYE = 1.6, MAXS = 26, MAXHOMES = 10, SPAWN = { x: 0, z: 8 };
const MAXLVL = 8; // zombie difficulty never goes above this (it used to grow forever)
const STAR_N = 12; // starlight crystals per chunk (was 7: +75%). Must match app.js
const PROP_CFG = [[26, r => [1, 4 + r() * 5, 1]], [14, r => { const s = 1 + r() * 1.8; return [s, s * .8, s]; }], [5, r => [2.5 + r() * 3, 4 + r() * 6, 2.5 + r() * 3]], [STAR_N, r => { const s = 1 + r() * 2; return [s * .6, s * 2, s * .6]; }]];
const propCache = new Map();
function chunkProps(i, j) { // replays the client's seeded prop placement: [trees, rocks, ruins, starlight]; entries are { x, z, s } or undefined
  const ck = i + ',' + j; let v = propCache.get(ck); if (v) return v;
  const rng = mul(((i * 73856093) ^ (j * 19349663)) >>> 0); v = [[], [], [], []];
  PROP_CFG.forEach(([n, sc], k) => { for (let q = 0; q < n; q++) { const x = (i - .5 + rng()) * CS, z = (j - .5 + rng()) * CS; rng(); const sv = sc(rng); if (Math.hypot(x, z) >= 24) v[k][q] = { x, z, s: sv }; } });
  if (propCache.size > 500) propCache.clear(); propCache.set(ck, v); return v;
}
const RTP_MIN = 150, RTP_MAX = 3000, RTP_COOLDOWN = 60000; // /rtp lands between these distances from spawn (change here)

// ---------- terrain: MUST stay identical to app.js ----------
const hs = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const vn = (x, z) => { const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  return hs(i, j) * (1 - a) * (1 - b) + hs(i + 1, j) * a * (1 - b) + hs(i, j + 1) * (1 - a) * b + hs(i + 1, j + 1) * a * b; };
const fbm = (x, z) => { let s = 0, a = .5; for (let o = 0; o < 4; o++) { s += a * vn(x, z); x *= 2; z *= 2; a /= 2; } return s; };
const H0 = (x, z) => { const m = Math.min(1, Math.max(0, (Math.hypot(x, z) - 25) / 55)), s = m * m * (3 - 2 * m); return (fbm(x * .008, z * .008) - .4) * 50 * s; };
const dg = {};
const D = (x, z) => { const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j;
  return (dg[i + ',' + j] || 0) * (1 - u) * (1 - v) + (dg[(i + 1) + ',' + j] || 0) * u * (1 - v) + (dg[i + ',' + (j + 1)] || 0) * (1 - u) * v + (dg[(i + 1) + ',' + (j + 1)] || 0) * u * v; };
const H = (x, z) => H0(x, z) + D(x, z);
const mul = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
function treePos(i, j, q) { // same random sequence the client uses for trees (4 rng calls per tree)
  const r = mul(((i * 73856093) ^ (j * 19349663)) >>> 0);
  for (let n = 0; n <= q; n++) { const x = (i - .5 + r()) * CS, z = (j - .5 + r()) * CS; r(); r(); if (n === q) return Math.hypot(x, z) < 24 ? null : { x, z }; }
}

// ---------- state ----------
const ZT = [{ hp: 30, sp: 2.4, sc: 1, dmg: 8 }, { hp: 18, sp: 5.2, sc: .9, dmg: 6 }, { hp: 120, sp: 1.7, sc: 1.45, dmg: 22 }];
const tables = {}, mined = new Set(), mineProg = {}, hitCount = {}, tableHits = {};
const tpaOut = {}, TPA_TTL = 60000; // tpaOut[fromUid] = { to, type, t }
const players = {}, inv = {}, invP = {}, st = {}, doors = {}, homes = {}, chopHits = {}, lastAct = {}, chopped = new Set(), dirtyInv = new Set();
let mobs = {}, night = 0, wasNight = null, mobSeq = 0, spawnCd = 0, pubT = 0, hadMobs = false;
const inRect = (u, x, z, m = 0) => Math.abs(x - u.x) < u.w / 2 + m && Math.abs(z - u.z) < u.d / 2 + m;
const doorBlock = (x, z) => Object.values(doors).some(u => inRect(u, x, z, .5)) || Object.values(tables).some(o => Math.hypot(x - o.x, z - o.z) < .9);
const covered = p => Object.values(doors).some(u => inRect(u, p.x, p.z) && u.y > p.y);
const touch = u => dirtyInv.add(u);
const tell = (u, text) => db.ref('msgs/' + u).set({ text, n: Date.now() });
const teleport = (u, x, y, z) => db.ref('tp/' + u).set({ x, y, z, n: Date.now() });

const INV0 = () => ({ logs: 0, sticks: 0, doors: 0, tables: 0, pick: 0, stone: 0, star: 0, scrap: 0 });
const ensure = u => invP[u] || (invP[u] = (async () => {
  const s = await db.ref('inv/' + u).once('value');
  if (s.exists()) inv[u] = Object.assign(INV0(), s.val());
  else { let o = INV0(); // first time: carry over old progress from Firestore
    try { const d = await fsdb.collection('users').doc(u).get(); if (d.exists) { const v = d.data(); o = Object.assign(INV0(), { logs: v.logs || 0, doors: v.doors || 0, scrap: v.scrap || 0 }); } } catch (e) {}
    inv[u] = o; await db.ref('inv/' + u).set(o); }
  const h = await db.ref('homes/' + u).once('value'); homes[u] = h.val() || [];
})());

// ---------- world edits ----------
function dig(px, pz, amt) {
  const R = 2.6, up = {};
  for (let ix = Math.floor(px - R); ix <= Math.ceil(px + R); ix++) for (let iz = Math.floor(pz - R); iz <= Math.ceil(pz + R); iz++) {
    const d = Math.hypot(ix - px, iz - pz); if (d > R) continue;
    const k = ix + ',' + iz, v = Math.min(1.5, Math.max(-24, (dg[k] || 0) + amt * (.3 + .7 * (1 - d / R)))); dg[k] = +v.toFixed(2); up[ix + '_' + iz] = dg[k];
  }
  db.ref('holes').update(up);
}
function fitDoor(cx, cz) { // trapdoor that stretches over the whole pit (max MAXS wide)
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
  return { x: +x.toFixed(2), y: +(y + .1).toFixed(2), z: +z.toFixed(2), w: +w.toFixed(2), d: +d.toFixed(2) };
}

// ---------- player actions (everything a client may ask for) ----------
function handle(a) {
  const u = a.uid, p = players[u], I = inv[u], t = Date.now();
  const rate = (k, ms) => { if (t - (lastAct[u + k] || 0) < ms) return false; lastAct[u + k] = t; return true; };
  switch (a.t) {
    case 'dig': { const x = +a.x, z = +a.z; if (!isFinite(x) || !isFinite(z) || Math.hypot(x - p.x, z - p.z) > 10 || !rate('d', 140)) return; dig(x, z, a.a > 0 ? .45 : -.45); break; }
    case 'chop': {
      const key = String(a.key), m = /^(-?\d+)_(-?\d+)_(\d+)$/.exec(key); if (!m || +m[3] > 25 || chopped.has(key)) return;
      const tp = chunkProps(+m[1], +m[2])[0][+m[3]]; if (!tp || Math.hypot(tp.x - p.x, tp.z - p.z) > 7 || !rate('c', 170)) return;
      if ((chopHits[key] = (chopHits[key] || 0) + 1) < 3) return; delete chopHits[key];
      chopped.add(key); db.ref('chopped/' + key).set(1); I.logs += 3; touch(u); break; }
    case 'craft': { // recipes: stick, table, pick (needs a crafting table within 5), door
      if (!rate('cr', 120)) return; const r = a.r || 'door', nearT = Object.values(tables).some(o => Math.hypot(o.x - p.x, o.z - p.z) < 5);
      if (r === 'stick') { if (I.logs < 2) return tell(u, 'Need 2 wood for sticks.'); I.logs -= 2; I.sticks += 4; }
      else if (r === 'table') { if (I.logs < 4) return tell(u, 'Need 4 wood for a crafting table.'); I.logs -= 4; I.tables++; }
      else if (r === 'pick') { if (!nearT) return tell(u, 'Stand next to a crafting table to make a pickaxe.'); if (I.sticks < 2 || I.logs < 3) return tell(u, 'Pickaxe needs 2 sticks + 3 wood.'); I.sticks -= 2; I.logs -= 3; I.pick++; }
      else if (r === 'door') { if (I.logs < 4) return tell(u, 'Need 4 wood to craft a trapdoor.'); I.logs -= 4; I.doors++; }
      else return; touch(u); break; }
    case 'table': {
      if (I.tables <= 0) return tell(u, 'You have no crafting table. Craft one in your inventory.');
      const cx = +a.cx, cz = +a.cz, ry = +a.ry || 0; if (!isFinite(cx) || !isFinite(cz) || Math.hypot(cx - p.x, cz - p.z) > 9 || !rate('tb', 300)) return;
      if (Object.values(tables).some(o => Math.hypot(o.x - cx, o.z - cz) < 1.4)) return tell(u, 'Too close to another crafting table.');
      const d = { x: +cx.toFixed(2), y: +H(cx, cz).toFixed(2), z: +cz.toFixed(2), ry: +ry.toFixed(2) }, r = db.ref('tables').push(); tables[r.key] = d; r.set(d); I.tables--; touch(u); break; }
    case 'breaktable': { // any tool or bare hands: 4 quick hits break a crafting table and give it back
      const id = String(a.id), tb = tables[id]; if (!tb || Math.hypot(tb.x - p.x, tb.z - p.z) > 6 || !rate('bt', 180)) return;
      const th = tableHits[id], n = (th && t - th.t < 2000 ? th.n : 0) + 1; tableHits[id] = { n, t }; if (n < 4) return;
      delete tableHits[id]; delete tables[id]; db.ref('tables/' + id).remove(); I.tables++; touch(u); break; }
    case 'mine': { // k: r = rock (4 pickaxe hits), b = ruined block (10 hits), s = starlight (hold 60s straight with the shovel)
      const key = String(a.key), m = /^([rbs])_(-?\d+)_(-?\d+)_(\d+)$/.exec(key); if (!m || mined.has(key)) return;
      const k = 'rbs'.indexOf(m[1]) + 1, o = chunkProps(+m[2], +m[3])[k][+m[4]]; if (!o) return;
      const reach = 7 + (k === 1 ? o.s[0] : k === 2 ? Math.max(o.s[0], o.s[2]) : 1); if (Math.hypot(o.x - p.x, o.z - p.z) > reach) return;
      if (k === 3) {
        const pr = mineProg[u]; if (!pr || pr.key !== key || t - pr.last > 900) { mineProg[u] = { key, start: t, last: t }; return; }
        pr.last = t; if (t - pr.start < 60000) return;
        delete mineProg[u]; mined.add(key); db.ref('mined/' + key).set(1); I.star++; touch(u); tell(u, 'You mined a Starlight!'); break; }
      if (I.pick <= 0) { if (rate('mt', 3000)) tell(u, 'You need a wooden pickaxe to mine stone.'); return; }
      if (!rate('m', 200)) return; if ((hitCount[key] = (hitCount[key] || 0) + 1) < (k === 1 ? 4 : 10)) return;
      delete hitCount[key]; mined.add(key); db.ref('mined/' + key).set(1); I.stone += k === 1 ? 2 : 6; touch(u); break; }
    case 'door': {
      if (I.doors <= 0) return tell(u, 'No trapdoors. Craft one with C (4 wood).');
      const cx = +a.cx, cz = +a.cz; if (!isFinite(cx) || !isFinite(cz) || Math.hypot(cx - p.x, cz - p.z) > 14 || !rate('p', 300)) return;
      const d = fitDoor(cx, cz); if (Object.values(doors).some(o => Math.hypot(o.x - d.x, o.z - d.z) < .5 && Math.abs(o.y - d.y) < .5)) return;
      const r = db.ref('doors').push(); doors[r.key] = d; r.set(d); I.doors--; touch(u); break; }
    case 'open': {
      let b = null, bd = 1e9; for (const k in doors) if (inRect(doors[k], p.x, p.z, 2.5)) { const q = Math.hypot(doors[k].x - p.x, doors[k].z - p.z); if (q < bd) { bd = q; b = k; } }
      if (b) { delete doors[b]; db.ref('doors/' + b).remove(); I.doors++; touch(u); break; }
      let tb = null; bd = 4; for (const k in tables) { const q = Math.hypot(tables[k].x - p.x, tables[k].z - p.z); if (q < bd) { bd = q; tb = k; } } // no trapdoor near: pick up a crafting table
      if (tb) { delete tables[tb]; db.ref('tables/' + tb).remove(); I.tables++; touch(u); } break; }
    case 'hit': {
      const m = mobs[a.id]; if (!m || !rate('h', 90) || Math.hypot(m.x - p.x, m.z - p.z) > 100) return;
      m.hp -= 20; if (m.hp <= 0) { delete mobs[a.id]; I.scrap++; touch(u); } break; }
    case 'chat': chat(u, String(a.text || '').slice(0, 200)); break;
  }
}
function chat(u, text) {
  const p = players[u], t = Date.now(), name = p.name || 'Survivor'; if (!text.trim() || t - (lastAct[u + 'm'] || 0) < 600) return; lastAct[u + 'm'] = t;
  if (text[0] !== '/') return void db.ref('chat').push({ name, text, t });
  const [cmd, ...r] = text.slice(1).split(/\s+/), arg = r.join(' ').trim(), hsA = homes[u], find = s => /^\d+$/.test(s) ? +s - 1 : hsA.findIndex(h => h.n.toLowerCase() === s.toLowerCase());
  const saveH = () => db.ref('homes/' + u).set(hsA.length ? hsA : null);
  const go = (x, y, z, label) => { if (t - (lastAct[u + 'tp'] || 0) < 5000) return tell(u, 'Teleport on cooldown (5s).'); lastAct[u + 'tp'] = t; teleport(u, x, y, z); tell(u, 'Teleported to ' + label + '.'); };
  switch (cmd.toLowerCase()) {
    case 'sethome': {
      const n = (arg || 'home' + (hsA.length + 1)).slice(0, 20), i = hsA.findIndex(h => h.n.toLowerCase() === n.toLowerCase()), h = { n, x: +p.x.toFixed(1), y: +(p.y - EYE).toFixed(1), z: +p.z.toFixed(1) };
      if (i >= 0) hsA[i] = h; else if (hsA.length >= MAXHOMES) return tell(u, `Max ${MAXHOMES} homes. /delhome one first.`); else hsA.push(h);
      saveH(); tell(u, `Home "${n}" saved as #${(i >= 0 ? i : hsA.length - 1) + 1}.`); break; }
    case 'delhome': { const i = find(arg); if (!arg || !hsA[i]) return tell(u, 'No such home. Use /homes to see them.'); const [d] = hsA.splice(i, 1); saveH(); tell(u, `Deleted home "${d.n}".`); break; }
    case 'home': { const i = !arg && hsA.length === 1 ? 0 : find(arg); if (!hsA[i]) return tell(u, hsA.length ? 'Which home? Use /home <name or number>. See /homes.' : 'You have no homes. Use /sethome [name].'); go(hsA[i].x, hsA[i].y, hsA[i].z, `"${hsA[i].n}"`); break; }
    case 'homes': tell(u, hsA.length ? hsA.map((h, i) => `${i + 1}) ${h.n}  (${Math.round(h.x)}, ${Math.round(h.y)}, ${Math.round(h.z)})`).join('\n') : 'No homes yet. Use /sethome [name].'); break;
    case 'rtp': {
      const left = RTP_COOLDOWN - (t - (lastAct[u + 'rtp'] || 0)); if (left > 0) return tell(u, `RTP cooldown: ${Math.ceil(left / 1000)}s left.`);
      let x = 0, z = 0, ok = false;
      for (let i = 0; i < 30 && !ok; i++) { const an = Math.random() * 6.283, r = RTP_MIN + Math.sqrt(Math.random()) * (RTP_MAX - RTP_MIN); x = Math.round(Math.cos(an) * r); z = Math.round(Math.sin(an) * r); ok = !doorBlock(x, z) && (dg[x + ',' + z] || 0) > -.3; }
      if (!ok) return tell(u, 'Could not find a safe spot, try again.');
      lastAct[u + 'rtp'] = lastAct[u + 'tp'] = t; teleport(u, x, H(x, z), z); tell(u, `Random teleport to ${x}, ${z} (max ${RTP_MAX} blocks from spawn).`); break; }
    case 'tpa': case 'tpahere': {
      const c = cmd.toLowerCase(); if (!arg) return tell(u, `Usage: /${c} <player>`);
      const q = arg.toLowerCase(), all = Object.entries(players).filter(([id]) => id !== u), ex = all.filter(([, p]) => (p.name || '').toLowerCase() === q), pre = all.filter(([, p]) => (p.name || '').toLowerCase().startsWith(q));
      const hit = ex.length === 1 ? ex : pre; if (hit.length > 1) return tell(u, 'More than one player matches. Type more of the name.'); if (!hit.length) return tell(u, 'Player not found (they must be online). You cannot /tpa yourself.');
      const o = hit[0][0]; tpaOut[u] = { to: o, type: c, t };
      tell(u, `Teleport request sent to ${players[o].name}. Expires in 60s. /tpacancel to cancel.`);
      tell(o, `${name} wants ${c === 'tpa' ? 'to teleport to you' : 'you to teleport to them'}. Type /tpaccept or /tpadeny (60s).`); break; }
    case 'tpaccept': case 'tpadeny': {
      const c = cmd.toLowerCase(), mine = Object.entries(tpaOut).filter(([f, r]) => r.to === u && t - r.t < TPA_TTL && players[f]);
      let pick; if (arg) { const q = arg.toLowerCase(); pick = mine.find(([f]) => (players[f].name || '').toLowerCase().startsWith(q)); } else pick = mine.sort((a, b) => b[1].t - a[1].t)[0];
      if (!pick) return tell(u, mine.length ? 'No request from that player. Pending: ' + mine.map(([f]) => players[f].name).join(', ') : 'No pending teleport requests.');
      const [f, r] = pick;
      if (c === 'tpadeny') { delete tpaOut[f]; tell(u, `Denied ${players[f].name}'s request.`); tell(f, `${name} denied your teleport request.`); break; }
      const mover = r.type === 'tpa' ? f : u, dest = r.type === 'tpa' ? u : f, pm = players[mover], pd = players[dest];
      if (t - (lastAct[mover + 'tp'] || 0) < 5000) return tell(u, 'Teleport on cooldown (5s). Try /tpaccept again in a moment.');
      delete tpaOut[f]; lastAct[mover + 'tp'] = t; teleport(mover, pd.x, pd.y - EYE, pd.z);
      tell(mover, `Teleported to ${pd.name}.`); tell(dest, `${pm.name} teleported to you.`); break; }
    case 'tpacancel': {
      const r = tpaOut[u]; if (!r || t - r.t >= TPA_TTL) return tell(u, 'You have no pending teleport request.');
      delete tpaOut[u]; tell(u, 'Teleport request cancelled.'); if (players[r.to]) tell(r.to, `${name} cancelled their teleport request.`); break; }
    case 'spawn': go(SPAWN.x, H(SPAWN.x, SPAWN.z), SPAWN.z, 'spawn'); break;
    case 'help': tell(u, '/sethome [name]  /delhome <name|#>  /home <name|#>  /homes  /spawn  /rtp\n/tpa <player>  /tpahere <player>  /tpaccept  /tpadeny  /tpacancel'); break;
    default: tell(u, 'Unknown command. Try /help.');
  }
}

// ---------- main loop ----------
let lastT = Date.now();
function tick() {
  const t = Date.now(), dt = Math.min(.25, (t - lastT) / 1000); lastT = t;
  const ps = Object.entries(players).filter(([, p]) => t - p.seen < 6000).map(([u, p]) => ({ u, ...p }));
  const dayT = (t / 1000 / 360) % 1, isNight = Math.sin(dayT * 6.283) < .62;
  if (wasNight !== null && isNight && !wasNight && ps.length) { night = Math.min(MAXLVL, night + 1); db.ref('world/night').set(night); spawnCd = 0; } wasNight = isNight; // only counts nights when someone is playing
  const ids = Object.keys(mobs);
  if (!ps.length) { if (ids.length) mobs = {}; }
  else {
    for (const id of ids) if (ps.every(p => Math.hypot(p.x - mobs[id].x, p.z - mobs[id].z) > 110)) delete mobs[id];
    if ((spawnCd -= dt) <= 0 && Object.keys(mobs).length < (isNight ? 8 + night * 4 + (ps.length - 1) * 4 : 2 * ps.length)) {
      const p = ps[Math.floor(Math.random() * ps.length)], an = Math.random() * 6.283, r = 40 + Math.random() * 20, x = p.x + Math.cos(an) * r, z = p.z + Math.sin(an) * r;
      const ty = Math.random() < .08 + night * .03 ? 2 : Math.random() < .3 ? 1 : 0, Z = ZT[ty];
      mobs['m' + t.toString(36) + (mobSeq++)] = { x, z, ry: 0, ty, hp: Z.hp * (1 + night * .15), sp: Z.sp * (.9 + Math.random() * .2), dmg: Z.dmg + night, sc: Z.sc };
      spawnCd = isNight ? 2 : 12;
    }
    const sl = Math.min(1, Math.max(0, (Math.sin(dayT * 6.283) - .65) * 10));
    for (const id in mobs) {
      const m = mobs[id]; if (sl > .3 && (m.hp -= sl * .5 * dt) <= 0) { delete mobs[id]; continue; }
      let tp = ps[0], bd = 1e9; for (const p of ps) { const q = Math.hypot(p.x - m.x, p.z - m.z); if (q < bd) { bd = q; tp = p; } }
      const dx = tp.x - m.x, dz = tp.z - m.z, d = Math.hypot(dx, dz), y = H(m.x, m.z); m.ry = Math.atan2(dx, dz);
      if (d > 1.5 * m.sc) {
        const sx = dx / d * m.sp * dt, sz = dz / d * m.sp * dt, px = m.x, pz = m.z;
        const steep = (nx, nz) => H(nx, nz) - y > 1.3 * Math.hypot(nx - px, nz - pz), blk = (nx, nz) => doorBlock(nx, nz) && !doorBlock(px, pz); // trapdoors are solid to zombies
        if (!steep(px + sx, pz) && !blk(px + sx, pz)) m.x += sx; if (!steep(m.x, pz + sz) && !blk(m.x, pz + sz)) m.z += sz;
      }
    }
  }
  for (const p of ps) { // zombie damage + regen, decided here, not by the client
    const S = st[p.u] || (st[p.u] = { hp: 100, cd: 0, calm: 99, w: -1 }); S.cd -= dt; S.calm += dt;
    if (S.cd <= 0 && !covered(p)) for (const id in mobs) { const m = mobs[id]; if (Math.hypot(p.x - m.x, p.z - m.z) <= 1.5 * m.sc && Math.abs(p.y - EYE - H(m.x, m.z)) < 2.5) { S.hp -= m.dmg; S.cd = .8; S.calm = 0; break; } }
    if (S.calm > 4 && S.hp < 100) S.hp = Math.min(100, S.hp + dt * 3);
    if (S.hp <= 0) { S.hp = 100; teleport(p.u, SPAWN.x, H(SPAWN.x, SPAWN.z), SPAWN.z); tell(p.u, 'You died and respawned at spawn.'); }
    if (Math.round(S.hp) !== S.w) { S.w = Math.round(S.hp); db.ref('stats/' + p.u).set({ hp: S.w }); }
  }
  if ((pubT -= dt) <= 0 && (hadMobs || Object.keys(mobs).length)) { pubT = .15; const o = {};
    for (const id in mobs) { const m = mobs[id]; o[id] = { x: +m.x.toFixed(1), z: +m.z.toFixed(1), r: +m.ry.toFixed(2), t: m.ty, h: Math.round(m.hp), s: +m.sp.toFixed(2), d: m.dmg }; }
    hadMobs = Object.keys(o).length > 0; db.ref('mobs').set(hadMobs ? o : null); }
  for (const u of dirtyInv) db.ref('inv/' + u).set(inv[u]); dirtyInv.clear();
}

async function main() {
  const [h, d, c, n, tb, mn] = await Promise.all(['holes', 'doors', 'chopped', 'world/night', 'tables', 'mined'].map(k => db.ref(k).once('value')));
  Object.assign(tables, tb.val() || {}); for (const k in (mn.val() || {})) mined.add(k);
  for (const [k, v] of Object.entries(h.val() || {})) { const [x, z] = k.split('_'); dg[x + ',' + z] = v; }
  Object.assign(doors, d.val() || {}); for (const k in (c.val() || {})) chopped.add(k); night = n.val() || 0; if (night > MAXLVL) { night = 0; db.ref('world/night').set(0); } // a value above the cap came from the old runaway bug: reset it
  await Promise.all([db.ref('actions').remove(), db.ref('mobs').remove()]); // drop stale requests / old zombies
  db.ref('players').on('value', s => { const v = s.val() || {}; for (const u in players) if (!(u in v)) delete players[u];
    for (const u in v) { const o = players[u]; if (!o || o.t !== v[u].t) players[u] = Object.assign({}, v[u], { seen: Date.now() }); else Object.assign(o, v[u]); if (!o) ensure(u); } });
  db.ref('actions').on('child_added', async s => { const a = s.val(); s.ref.remove(); if (!a || !players[a.uid]) return; try { await ensure(a.uid); handle(a); } catch (e) { console.error(e); } });
  setInterval(tick, 100); setInterval(() => db.ref('world/hb').set(TS), 3000);
  setInterval(async () => { const s = await db.ref('chat').once('value'), c = s.val() || {}, t = Date.now(); for (const k in c) if (t - (c[k].t || 0) > 60000) db.ref('chat/' + k).remove(); }, 10000); // chat messages are deleted after 1 minute
  // tiny web endpoint: Render's free plan needs a web service, and visits to /ping keep it awake
  require('http').createServer((q, r) => { r.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' }); r.end('mobase ok'); }).listen(process.env.PORT || 3000);
  console.log('MOBASE server running. night', night, '| holes', Object.keys(dg).length, '| doors', Object.keys(doors).length);
}
module.exports = { handle, tick, players, inv, ensure, doors, tables, mined, chunkProps, mobs: () => mobs, dg, st, homes, treePos, fitDoor };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
