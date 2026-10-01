// 1. YOUR FIREBASE CONFIGURATION
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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();  // Realtime Database for high-speed positions & bases
const fs = firebase.firestore(); // Firestore for user profiles
const auth = firebase.auth();

let localUid = null;
let localDisplayName = "Survivor";
let remotePlayers = {};
let placedBlocks = {};

// 2. GOOGLE AUTHENTICATION FLOW
const googleBtn = document.getElementById('google-btn');
const provider = new firebase.auth.GoogleAuthProvider();

googleBtn.addEventListener('click', () => {
  auth.signInWithPopup(provider).catch((error) => {
    alert("Login failed: " + error.message);
  });
});

auth.onAuthStateChanged((user) => {
  if (user) {
    localUid = user.uid;
    localDisplayName = user.displayName || "Survivor";

    // Update UI elements
    document.getElementById('player-name').innerText = localDisplayName;
    document.getElementById('status').innerText = "Online";
    document.getElementById('status').className = "success";
    document.getElementById('google-btn').style.display = "none";
    document.getElementById('login-subtext').style.display = "none";
    document.getElementById('controls-info').style.display = "block";
    document.getElementById('blocker').style.cursor = "pointer";

    // Save profile to Firestore
    fs.collection('users').doc(localUid).set({
      name: localDisplayName,
      email: user.email,
      photoURL: user.photoURL,
      lastLogin: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Start 3D Multiplayer Sync
    initMultiplayer();
  }
});

// 3. THREE.JS GRAPHICS SETUP
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f0d);
scene.fog = new THREE.FogExp2(0x0a0f0d, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.3));
const dirLight = new THREE.DirectionalLight(0x00ff66, 0.9);
dirLight.position.set(50, 100, 50);
dirLight.castShadow = true;
scene.add(dirLight);

// Floor & Grid
const floorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);
scene.add(new THREE.GridHelper(500, 100, 0x00ff66, 0x053315));

// 4. CONTROLS & PHYSICS
const controls = new THREE.PointerLockControls(camera, document.body);
document.getElementById('blocker').addEventListener('click', () => {
  if (localUid) controls.lock();
});
controls.addEventListener('lock', () => document.getElementById('blocker').style.display = 'none');
controls.addEventListener('unlock', () => document.getElementById('blocker').style.display = 'flex');

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let prevTime = performance.now();

document.addEventListener('keydown', (e) => {
  if(e.code === 'KeyW') moveForward = true;
  if(e.code === 'KeyS') moveBackward = true;
  if(e.code === 'KeyA') moveLeft = true;
  if(e.code === 'KeyD') moveRight = true;
  if(e.code === 'Space' && camera.position.y <= 2) velocity.y += 12;
});

document.addEventListener('keyup', (e) => {
  if(e.code === 'KeyW') moveForward = false;
  if(e.code === 'KeyS') moveBackward = false;
  if(e.code === 'KeyA') moveLeft = false;
  if(e.code === 'KeyD') moveRight = false;
});
camera.position.y = 2;

// 5. BASE BUILDING MECHANICS
const raycaster = new THREE.Raycaster();
window.addEventListener('pointerdown', (e) => {
  if (!controls.isLocked || e.button !== 0) return;

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const intersects = raycaster.intersectObjects(scene.children);

  if (intersects.length > 0) {
    const hit = intersects[0];
    const target = hit.point.clone().add(hit.face.normal);
    
    // Grid snap (2x2 units)
    const x = Math.round(target.x / 2) * 2;
    const y = Math.max(1, Math.round(target.y / 2) * 2);
    const z = Math.round(target.z / 2) * 2;

    db.ref(`bases/${x}_${y}_${z}`).set({
      x, y, z, 
      owner: localUid, 
      ownerName: localDisplayName 
    });
  }
});

// Render base blocks from Realtime Database
db.ref('bases').on('child_added', (snapshot) => {
  const data = snapshot.val();
  const mat = new THREE.MeshStandardMaterial({ color: 0x334433, roughness: 0.6 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), mat);
  mesh.position.set(data.x, data.y, data.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  placedBlocks[snapshot.key] = mesh;
});

// 6. MULTIPLAYER NETWORKING
function initMultiplayer() {
  const userRef = db.ref(`players/${localUid}`);
  userRef.onDisconnect().remove();

  // Send position update every 100ms
  setInterval(() => {
    if (!controls.isLocked) return;
    userRef.set({
      name: localDisplayName,
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      rotY: camera.rotation.y
    });
  }, 100);
}

db.ref('players').on('child_added', (snap) => {
  if (snap.key === localUid) return;
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 1.5, 4, 8), 
    new THREE.MeshStandardMaterial({ color: 0xff0055 })
  );
  mesh.castShadow = true;
  scene.add(mesh);
  remotePlayers[snap.key] = { mesh, targetPos: new THREE.Vector3(), targetRotY: 0 };
  updatePlayerCount();
});

db.ref('players').on('child_changed', (snap) => {
  if (snap.key === localUid || !remotePlayers[snap.key]) return;
  const d = snap.val();
  remotePlayers[snap.key].targetPos.set(d.x, d.y - 1, d.z);
  remotePlayers[snap.key].targetRotY = d.rotY;
});

db.ref('players').on('child_removed', (snap) => {
  if (remotePlayers[snap.key]) {
    scene.remove(remotePlayers[snap.key].mesh);
    delete remotePlayers[snap.key];
    updatePlayerCount();
  }
});

function updatePlayerCount() {
  document.getElementById('player-count').innerText = Object.keys(remotePlayers).length + 1;
}

// 7. GAME LOOP
function animate() {
  requestAnimationFrame(animate);
  const delta = (performance.now() - prevTime) / 1000;
  prevTime = performance.now();

  if (controls.isLocked) {
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= 30.0 * delta; // Gravity

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    if (moveForward || moveBackward) velocity.z -= direction.z * 60.0 * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * 60.0 * delta;

    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);
    camera.position.y += velocity.y * delta;

    if (camera.position.y < 2) { velocity.y = 0; camera.position.y = 2; }
  }

  // Smooth remote player interpolation
  for (let id in remotePlayers) {
    const p = remotePlayers[id];
    p.mesh.position.lerp(p.targetPos, 0.2);
    p.mesh.rotation.y += (p.targetRotY - p.mesh.rotation.y) * 0.2;
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
