// ------------------------------------------------------------------
// 1. FIREBASE CONFIGURATION
// Replace the config object below with your actual Firebase project settings!
// ------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

let localUid = null;
let remotePlayers = {};
let placedBlocks = {};

// ------------------------------------------------------------------
// 2. THREE.JS 3D SCENE SETUP
// ------------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f0d);
scene.fog = new THREE.FogExp2(0x0a0f0d, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0x00ff66, 0.8);
dirLight.position.set(20, 40, 20);
dirLight.castShadow = true;
scene.add(dirLight);

// Ground Grid
const gridHelper = new THREE.GridHelper(200, 50, 0x00ff66, 0x053315);
scene.add(gridHelper);

const floorGeo = new THREE.PlaneGeometry(200, 200);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ------------------------------------------------------------------
// 3. FIRST-PERSON CONTROLS & MOVEMENT
// ------------------------------------------------------------------
const controls = new THREE.PointerLockControls(camera, document.body);
const blocker = document.getElementById('blocker');

blocker.addEventListener('click', () => { controls.lock(); });
controls.addEventListener('lock', () => { blocker.style.display = 'none'; });
controls.addEventListener('unlock', () => { blocker.style.display = 'flex'; });

let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let prevTime = performance.now();

document.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'KeyW': moveForward = true; break;
    case 'KeyS': moveBackward = true; break;
    case 'KeyA': moveLeft = true; break;
    case 'KeyD': moveRight = true; break;
    case 'Space': if (camera.position.y <= 2) velocity.y += 15; break;
  }
});

document.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': moveForward = false; break;
    case 'KeyS': moveBackward = false; break;
    case 'KeyA': moveLeft = false; break;
    case 'KeyD': moveRight = false; break;
  }
});

camera.position.y = 2; // Eye height

// ------------------------------------------------------------------
// 4. BASE BUILDING (CLICK TO PLACE WALL)
// ------------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const centerVector = new THREE.Vector2(0, 0);

window.addEventListener('pointerdown', (e) => {
  if (!controls.isLocked || e.button !== 0) return; // Only trigger on Left Click when locked

  raycaster.setFromCamera(centerVector, camera);
  const intersects = raycaster.intersectObjects(scene.children);

  if (intersects.length > 0) {
    const hit = intersects[0];
    const blockGeo = new THREE.BoxGeometry(2, 2, 2);
    const blockMat = new THREE.MeshStandardMaterial({ color: 0x00ff66, wireframe: false });

    // Calculate snapped grid placement
    const targetPos = hit.point.clone().add(hit.face.normal);
    const x = Math.round(targetPos.x / 2) * 2;
    const y = Math.max(1, Math.round(targetPos.y / 2) * 2);
    const z = Math.round(targetPos.z / 2) * 2;

    const blockId = `${x}_${y}_${z}`;

    // Save block to Firebase!
    db.ref(`bases/${blockId}`).set({ x, y, z, owner: localUid });
  }
});

// Listen for base blocks built by anyone in the server
db.ref('bases').on('child_added', (snapshot) => {
  const data = snapshot.val();
  if (placedBlocks[snapshot.key]) return;

  const geo = new THREE.BoxGeometry(2, 2, 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x00aa44, roughness: 0.3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(data.x, data.y, data.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  scene.add(mesh);
  placedBlocks[snapshot.key] = mesh;
});

// ------------------------------------------------------------------
// 5. FIREBASE MULTIPLAYER SYNC & LERPING ENGINE
// ------------------------------------------------------------------
auth.signInAnonymously().then((res) => {
  localUid = res.user.uid;
  document.getElementById('status').innerText = "Online (UID: " + localUid.substring(0,5) + ")";

  const userRef = db.ref(`players/${localUid}`);
  
  // Clean up user node on disconnect
  userRef.onDisconnect().remove();

  // Send position to Firebase 10 times per second (100ms throttle)
  setInterval(() => {
    if (!controls.isLocked) return;
    userRef.set({
      x: camera.position.x,
      y: camera.position.y,
      z: camera.position.z,
      rotY: camera.rotation.y
    });
  }, 100);
});

// Handle other players joining, moving, and leaving
db.ref('players').on('child_added', (snapshot) => {
  if (snapshot.key === localUid) return;
  
  // Create 3D Mesh for Remote Player
  const geo = new THREE.CapsuleGeometry(0.8, 1.8, 4, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0xff0055 });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);

  remotePlayers[snapshot.key] = {
    mesh: mesh,
    targetPos: new THREE.Vector3(0, 0, 0),
    targetRotY: 0
  };
  updatePlayerCount();
});

db.ref('players').on('child_changed', (snapshot) => {
  if (snapshot.key === localUid || !remotePlayers[snapshot.key]) return;
  const data = snapshot.val();
  
  // Update target destination for smooth interpolation
  remotePlayers[snapshot.key].targetPos.set(data.x, data.y - 1, data.z);
  remotePlayers[snapshot.key].targetRotY = data.rotY;
});

db.ref('players').on('child_removed', (snapshot) => {
  if (remotePlayers[snapshot.key]) {
    scene.remove(remotePlayers[snapshot.key].mesh);
    delete remotePlayers[snapshot.key];
    updatePlayerCount();
  }
});

function updatePlayerCount() {
  document.getElementById('player-count').innerText = Object.keys(remotePlayers).length + 1;
}

// ------------------------------------------------------------------
// 6. RENDER & ANIMATION LOOP
// ------------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);

  const time = performance.now();
  const delta = (time - prevTime) / 1000;
  prevTime = time;

  // Local Player Physics
  if (controls.isLocked) {
    velocity.x -= velocity.x * 10.0 * delta;
    velocity.z -= velocity.z * 10.0 * delta;
    velocity.y -= 9.8 * 3.0 * delta; // Gravity

    direction.z = Number(moveForward) - Number(moveBackward);
    direction.x = Number(moveRight) - Number(moveLeft);
    direction.normalize();

    if (moveForward || moveBackward) velocity.z -= direction.z * 100.0 * delta;
    if (moveLeft || moveRight) velocity.x -= direction.x * 100.0 * delta;

    controls.moveRight(-velocity.x * delta);
    controls.moveForward(-velocity.z * delta);
    camera.position.y += velocity.y * delta;

    if (camera.position.y < 2) {
      velocity.y = 0;
      camera.position.y = 2;
    }
  }

  // Smooth (Lerp) Remote Players to prevent choppy movement
  for (let id in remotePlayers) {
    const p = remotePlayers[id];
    p.mesh.position.lerp(p.targetPos, 0.2); // Smoothly slide towards target position
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
