const container = document.getElementById('game-container');
const hud = document.getElementById('hud');
const scoreEl = document.getElementById('score');
const coinsEl = document.getElementById('coins');
const bestScoreEl = document.getElementById('best-score');
const startScreen = document.getElementById('start-screen');
const gameoverScreen = document.getElementById('gameover-screen');
const finalScoreEl = document.getElementById('final-score');
const finalBestEl = document.getElementById('final-best');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

let scene, camera, renderer;
let carGroup, carBody;
let roadTiles = [];
let coinsList = [];
let skidMarks = [];

let isPlaying = false;
let isGameOver = false;
let isDrifting = false;

let score = 0;
let coinsCount = parseInt(localStorage.getItem('drift_coins') || '0');
let bestScore = parseInt(localStorage.getItem('drift_best') || '0');

const TILE_SIZE = 3.2;
const CAR_SPEED = 0.19;
let currentSpeed = CAR_SPEED;

let carPos = { x: 0, y: 0.5, z: 0 };
let carDir = 0;
let carVisualAngle = 0;
let fallVelocity = 0;

let lastTilePos = { x: 0, z: 0 };
let buildDir = 0;
let stepsInCurrentDir = 0;

function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x38bdf8);
    scene.fog = new THREE.Fog(0x38bdf8, 25, 65);

    const aspect = window.innerWidth / window.innerHeight;
    const d = 14;
    camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 100);
    camera.position.set(18, 20, 18);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
    dirLight.position.set(15, 30, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    const shadowD = 30;
    dirLight.shadow.camera.left = -shadowD;
    dirLight.shadow.camera.right = shadowD;
    dirLight.shadow.camera.top = shadowD;
    dirLight.shadow.camera.bottom = -shadowD;
    scene.add(dirLight);

    createCar();
    window.addEventListener('resize', onResize);
}

function createCar() {
    carGroup = new THREE.Group();

    const chassisGeo = new THREE.BoxGeometry(1.1, 0.5, 1.9);
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3 });
    carBody = new THREE.Mesh(chassisGeo, chassisMat);
    carBody.position.y = 0.35;
    carBody.castShadow = true;
    carGroup.add(carBody);

    const cabinGeo = new THREE.BoxGeometry(0.9, 0.4, 1.0);
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2 });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 0.75, -0.1);
    cabin.castShadow = true;
    carGroup.add(cabin);

    const spoilerGeo = new THREE.BoxGeometry(1.1, 0.1, 0.25);
    const spoilerMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const spoiler = new THREE.Mesh(spoilerGeo, spoilerMat);
    spoiler.position.set(0, 0.7, -0.85);
    carGroup.add(spoiler);

    const wheelGeo = new THREE.CylinderGeometry(0.25, 0.25, 0.2, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });

    const wheelPositions = [
        [-0.6, 0.25, 0.6],
        [0.6, 0.25, 0.6],
        [-0.6, 0.25, -0.6],
        [0.6, 0.25, -0.6]
    ];

    wheelPositions.forEach(pos => {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.position.set(pos[0], pos[1], pos[2]);
        carGroup.add(wheel);
    });

    scene.add(carGroup);
}

function spawnTile(x, z, isStart = false) {
    const geo = new THREE.BoxGeometry(TILE_SIZE, 1.2, TILE_SIZE);
    const isAlt = (Math.round(x / TILE_SIZE) + Math.round(z / TILE_SIZE)) % 2 === 0;
    const mat = new THREE.MeshStandardMaterial({
        color: isAlt ? 0xf8fafc : 0xe2e8f0,
        roughness: 0.7
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, -0.6, z);
    mesh.receiveShadow = true;

    const borderGeo = new THREE.BoxGeometry(TILE_SIZE + 0.1, 0.2, TILE_SIZE + 0.1);
    const borderMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b });
    const border = new THREE.Mesh(borderGeo, borderMat);
    border.position.y = -0.55;
    mesh.add(border);

    scene.add(mesh);
    roadTiles.push({ x, z, mesh, passed: false });

    if (!isStart && Math.random() < 0.25) {
        spawnCoin(x, z);
    }
}

function spawnCoin(x, z) {
    const geo = new THREE.CylinderGeometry(0.45, 0.45, 0.15, 20);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xd97706,
        emissiveIntensity: 0.3,
        metalness: 0.6,
        roughness: 0.2
    });
    const coin = new THREE.Mesh(geo, mat);
    coin.position.set(x, 0.8, z);
    coin.castShadow = true;
    scene.add(coin);
    coinsList.push({ x, z, mesh: coin, collected: false });
}

function generateNextTiles(count) {
    for (let i = 0; i < count; i++) {
        if (stepsInCurrentDir <= 0) {
            buildDir = buildDir === 0 ? 1 : 0;
            stepsInCurrentDir = Math.floor(Math.random() * 4) + 2;
        }

        if (buildDir === 0) {
            lastTilePos.z -= TILE_SIZE;
        } else {
            lastTilePos.x += TILE_SIZE;
        }

        spawnTile(lastTilePos.x, lastTilePos.z);
        stepsInCurrentDir--;
    }
}

function resetGame() {
    roadTiles.forEach(t => scene.remove(t.mesh));
    coinsList.forEach(c => scene.remove(c.mesh));
    skidMarks.forEach(s => scene.remove(s.mesh));
    roadTiles = [];
    coinsList = [];
    skidMarks = [];

    score = 0;
    currentSpeed = CAR_SPEED;
    carPos = { x: 0, y: 0, z: 0 };
    carDir = 0;
    carVisualAngle = 0;
    fallVelocity = 0;
    isDrifting = false;
    isGameOver = false;

    carGroup.position.set(0, 0, 0);
    carGroup.rotation.set(0, 0, 0);

    lastTilePos = { x: 0, z: 0 };
    buildDir = 0;
    stepsInCurrentDir = 4;

    spawnTile(0, 0, true);
    for (let i = 1; i <= 4; i++) {
        lastTilePos.z -= TILE_SIZE;
        spawnTile(lastTilePos.x, lastTilePos.z, true);
    }

    generateNextTiles(35);
    updateHUD();
}

function updateHUD() {
    scoreEl.textContent = score;
    coinsEl.textContent = coinsCount;
    bestScoreEl.textContent = bestScore;
}

function spawnSkidMark() {
    const geo = new THREE.PlaneGeometry(0.35, 0.5);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0.45
    });
    const mark = new THREE.Mesh(geo, mat);
    mark.position.set(carPos.x, 0.02, carPos.z);
    mark.rotation.y = carGroup.rotation.y;
    scene.add(mark);
    skidMarks.push({ mesh: mark, life: 45 });
}

function checkOnRoad() {
    for (let i = 0; i < roadTiles.length; i++) {
        const t = roadTiles[i];
        const half = TILE_SIZE * 0.54;
        if (Math.abs(carPos.x - t.x) <= half && Math.abs(carPos.z - t.z) <= half) {
            if (!t.passed) {
                t.passed = true;
                score++;
                currentSpeed = Math.min(0.32, CAR_SPEED + score * 0.0008);
                if (score > bestScore) {
                    bestScore = score;
                    localStorage.setItem('drift_best', bestScore);
                }
                updateHUD();
            }
            return true;
        }
    }
    return false;
}

function triggerGameOver() {
    isGameOver = true;
    finalScoreEl.textContent = score;
    finalBestEl.textContent = bestScore;
    setTimeout(() => {
        gameoverScreen.classList.remove('hidden');
        hud.classList.add('hidden');
    }, 600);
}

let frameTick = 0;
function animate() {
    requestAnimationFrame(animate);

    if (isPlaying) {
        if (!isGameOver) {
            const targetDir = isDrifting ? 1 : 0;
            carDir += (targetDir - carDir) * 0.18;

            const moveAngle = -carDir * (Math.PI / 2);
            carPos.x += Math.sin(-moveAngle) * currentSpeed;
            carPos.z -= Math.cos(-moveAngle) * currentSpeed;

            const driftExtra = isDrifting ? -0.35 : 0.15;
            const targetVisual = moveAngle + (Math.abs(targetDir - carDir) > 0.05 ? driftExtra : 0);
            carVisualAngle += (targetVisual - carVisualAngle) * 0.22;

            carGroup.position.set(carPos.x, 0, carPos.z);
            carGroup.rotation.y = carVisualAngle;

            frameTick++;
            if (isDrifting && frameTick % 2 === 0) {
                spawnSkidMark();
            }

            if (!checkOnRoad()) {
                triggerGameOver();
            }

            coinsList.forEach(c => {
                if (!c.collected) {
                    c.mesh.rotation.y += 0.06;
                    if (Math.hypot(carPos.x - c.x, carPos.z - c.z) < 1.3) {
                        c.collected = true;
                        c.mesh.visible = false;
                        coinsCount++;
                        localStorage.setItem('drift_coins', coinsCount);
                        updateHUD();
                    }
                }
            });

            if (Math.hypot(lastTilePos.x - carPos.x, lastTilePos.z - carPos.z) < 55) {
                generateNextTiles(15);
            }

            while (roadTiles.length > 0 && roadTiles[0].z - carPos.z > 25 && carPos.x - roadTiles[0].x > 25) {
                scene.remove(roadTiles[0].mesh);
                roadTiles.shift();
            }
        } else {
            fallVelocity += 0.025;
            carPos.y -= fallVelocity;
            carGroup.position.y = carPos.y;
            carGroup.rotation.x += 0.05;
            carGroup.rotation.z += 0.04;
        }

        const camTargetX = carPos.x + 18;
        const camTargetZ = carPos.z + 18;
        camera.position.x += (camTargetX - camera.position.x) * 0.1;
        camera.position.z += (camTargetZ - camera.position.z) * 0.1;
        camera.lookAt(carPos.x, 0, carPos.z);
    }

    for (let i = skidMarks.length - 1; i >= 0; i--) {
        skidMarks[i].life--;
        skidMarks[i].mesh.material.opacity = (skidMarks[i].life / 45) * 0.45;
        if (skidMarks[i].life <= 0) {
            scene.remove(skidMarks[i].mesh);
            skidMarks.splice(i, 1);
        }
    }

    renderer.render(scene, camera);
}

function onResize() {
    if (!renderer || !camera) return;
    const aspect = window.innerWidth / window.innerHeight;
    const d = 14;
    camera.left = -d * aspect;
    camera.right = d * aspect;
    camera.top = d;
    camera.bottom = -d;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function setDrift(state) {
    if (!isPlaying || isGameOver) return;
    isDrifting = state;
}

window.addEventListener('mousedown', (e) => {
    if (e.button === 0) setDrift(true);
});
window.addEventListener('mouseup', () => setDrift(false));

window.addEventListener('touchstart', (e) => {
    if (e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        setDrift(true);
    }
}, { passive: false });
window.addEventListener('touchend', () => setDrift(false));

window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'ArrowUp') {
        setDrift(true);
    }
});
window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'ArrowUp') {
        setDrift(false);
    }
});

startBtn.addEventListener('click', () => {
    startScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    resetGame();
    isPlaying = true;
});

restartBtn.addEventListener('click', () => {
    gameoverScreen.classList.add('hidden');
    hud.classList.remove('hidden');
    resetGame();
    isPlaying = true;
});

initThree();
resetGame();
animate();