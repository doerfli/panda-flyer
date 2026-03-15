const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Matter.js aliases
const { Engine, Bodies, Body, World, Events } = Matter;

// UI Elements
const uiStartScreen    = document.getElementById('start-screen');
const uiGameOverScreen = document.getElementById('game-over-screen');
const uiHud            = document.getElementById('hud');
const uiAltitude       = document.getElementById('altitude');
const uiScore          = document.getElementById('score');
const btnStart         = document.getElementById('btn-start');
const btnRestart       = document.getElementById('btn-restart');
const endTitle         = document.getElementById('end-title');

let gameWidth  = window.innerWidth;
let gameHeight = window.innerHeight;
canvas.width   = gameWidth;
canvas.height  = gameHeight;

window.addEventListener('resize', () => {
    gameWidth  = window.innerWidth;
    gameHeight = window.innerHeight;
    canvas.width  = gameWidth;
    canvas.height = gameHeight;
    if (currentState === STATE.MENU || currentState === STATE.GAMEOVER) draw();
});

const STATE = { MENU: 0, PLAYING: 1, GAMEOVER: 2, STARTING: 3 };
let currentState = STATE.MENU;
let lastTime = 0;

// ===== WORLD CONSTANTS =====
const WORLD_SCALE       = 10;    // pixels per meter of altitude
const INITIAL_ALTITUDE  = 1000;  // meters
const PANDA_START_Y     = 150;   // world-Y where the plane flies
// Total fall distance = 1000m * 10px/m = 10 000px
const GROUND_Y = PANDA_START_Y + INITIAL_ALTITUDE * WORLD_SCALE; // 10 150
const MAX_VX   = 7;   // px per physics-frame horizontal cap
const MAX_VY   = 4;   // px per physics-frame vertical cap (parachute terminal velocity)

// ===== GAME STATE =====
let altitude          = INITIAL_ALTITUDE;
let score             = 0;
let gameTime          = 0;
let parachuteDeployed = false;
let freefallTimer     = 0;
let cameraY           = 0;
let targetX           = 0;
let keys = { ArrowLeft: false, ArrowRight: false, a: false, d: false };

window.addEventListener('keydown', e => { if (e.key in keys) keys[e.key] = true; });
window.addEventListener('keyup',   e => { if (e.key in keys) keys[e.key] = false; });

// Plane (not physics-driven)
const plane = { x: -200, y: PANDA_START_Y, vx: 400, width: 160, height: 60 };

// ===== MATTER.JS =====
let engine;
let mWorld;
let pandaBody;
let birdBodies = [];

// ===== COLLECTIONS =====
let clouds   = [];
let coins    = [];
let diamonds = [];
let birds    = [];

// ===== WEB AUDIO =====
let audioCtx;
let bgmPlaybackRate  = 1.0;
let currentNoteIndex = 0;
const DURATION = 0.5;

const melodyCalm = [
    261.6, 329.6, 392.0, 523.3,
    329.6, 392.0, 523.3, 392.0,
    261.6, 329.6, 392.0, 329.6,
    196.0, 261.6, 329.6, 261.6,
];
const melodyLively = [
    392.0, 523.3, 659.3, 784.0,
    659.3, 523.3, 392.0, 523.3,
    523.3, 392.0, 329.6, 392.0,
    329.6, 261.6, 329.6, 392.0,
];
const melodyJoyful = [
    523.3, 659.3, 784.0, 1046.5,
    784.0, 659.3, 784.0, 1046.5,
    659.3, 784.0, 659.3, 523.3,
    392.0, 523.3, 659.3, 784.0,
];

function getCurrentMelody() {
    if (score >= 150) return melodyJoyful;
    if (score >= 50)  return melodyLively;
    return melodyCalm;
}

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

let nextNoteTime  = 0.0;
let schedulerTimer = null;

function scheduleNote(freq, time) {
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.3, time + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, time + DURATION * 0.9);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + DURATION);
}

function runScheduler() {
    if (!audioCtx || currentState === STATE.GAMEOVER || currentState === STATE.MENU) {
        schedulerTimer = null; return;
    }
    const SCHEDULE_AHEAD = 0.2;
    const melody         = getCurrentMelody();
    const noteDuration   = DURATION / bgmPlaybackRate;
    while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD) {
        scheduleNote(melody[currentNoteIndex % melody.length], nextNoteTime);
        currentNoteIndex++;
        nextNoteTime += noteDuration;
    }
    schedulerTimer = setTimeout(runScheduler, 50);
}

function startMusic() {
    if (schedulerTimer) clearTimeout(schedulerTimer);
    currentNoteIndex = 0;
    nextNoteTime     = audioCtx.currentTime + 0.05;
    bgmPlaybackRate  = 1.0;
    runScheduler();
}

function stopMusic() {
    if (schedulerTimer) { clearTimeout(schedulerTimer); schedulerTimer = null; }
}

// ===== SOUND EFFECTS =====
function playCoinSound() {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.setValueAtTime(800, t + 0.1);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1.0, t + 0.05);
    gain.gain.linearRampToValueAtTime(0, t + 0.2);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.2);
}

function playDiamondSound() {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1108.73, t + 0.05);
    osc.frequency.setValueAtTime(1318.51, t + 0.1);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1.0, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.3);
}

function playJumpSound() {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 1.2);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1.5, t + 0.1);
    gain.gain.linearRampToValueAtTime(0, t + 1.2);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 1.2);
}

function playLandSound() {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    const t = audioCtx.currentTime;
    const osc1 = audioCtx.createOscillator(), osc2 = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc1.type = 'sine';   osc1.frequency.setValueAtTime(150, t); osc1.frequency.exponentialRampToValueAtTime(10, t + 0.2);
    osc2.type = 'square'; osc2.frequency.setValueAtTime(100, t); osc2.frequency.exponentialRampToValueAtTime(10, t + 0.2);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(2.0, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc1.connect(gain); osc2.connect(gain); gain.connect(audioCtx.destination);
    osc1.start(t); osc2.start(t); osc1.stop(t + 0.2); osc2.stop(t + 0.2);
}

function playHitSound() {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1.5, t + 0.02);
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(t); osc.stop(t + 0.15);
}

// ===== PHYSICS SETUP =====
function initPhysics() {
    if (engine) {
        Events.off(engine, 'collisionStart');
        World.clear(mWorld);
        Engine.clear(engine);
    }

    engine = Engine.create({ gravity: { x: 0, y: 1, scale: 0.0008 } });
    mWorld = engine.world;

    // Static ground
    const gnd = Bodies.rectangle(gameWidth / 2, GROUND_Y + 30, gameWidth * 3, 60, {
        isStatic: true, label: 'ground', friction: 0.5, restitution: 0.1
    });
    World.add(mWorld, gnd);

    // Panda starts static (attached to plane)
    pandaBody = Bodies.circle(plane.x + 50, plane.y + 30, 25, {
        label: 'panda', frictionAir: 0.01, restitution: 0.15, friction: 0.1, mass: 5
    });
    Body.setStatic(pandaBody, true);
    World.add(mWorld, pandaBody);

    birdBodies = [];

    Events.on(engine, 'collisionStart', onCollision);
}

function onCollision(event) {
    for (const pair of event.pairs) {
        const { bodyA, bodyB } = pair;
        if (bodyA.label !== 'panda' && bodyB.label !== 'panda') continue;

        const other = bodyA.label === 'panda' ? bodyB : bodyA;

        if (other.label === 'ground') {
            if (currentState === STATE.PLAYING && altitude < 20) endGame();
            continue;
        }

        if (other.label.startsWith('coin_')) {
            const idx = parseInt(other.label.split('_')[1]);
            if (coins[idx] && !coins[idx].collected) {
                coins[idx].collected = true;
                score += 10;
                uiScore.innerText = score;
                playCoinSound();
                World.remove(mWorld, other);
            }
        } else if (other.label.startsWith('diamond_')) {
            const idx = parseInt(other.label.split('_')[1]);
            if (diamonds[idx] && !diamonds[idx].collected) {
                diamonds[idx].collected = true;
                score += 50;
                uiScore.innerText = score;
                playDiamondSound();
                World.remove(mWorld, other);
            }
        } else if (other.label.startsWith('bird_')) {
            const idx = parseInt(other.label.split('_')[1]);
            if (birds[idx] && !birds[idx].hit) {
                birds[idx].hit = true;
                score -= 50;
                uiScore.innerText = score;
                playHitSound();
            }
        }
    }
}

// ===== SPAWN HELPERS =====
function spawnCloud() {
    return {
        x:      Math.random() * gameWidth,
        worldY: PANDA_START_Y + Math.random() * INITIAL_ALTITUDE * WORLD_SCALE,
        size:   50  + Math.random() * 80,
        opacity: 0.2 + Math.random() * 0.4
    };
}

function spawnCoin(index) {
    const x = Math.random() * (gameWidth - 40) + 20;
    const y = PANDA_START_Y + 500 + Math.random() * (INITIAL_ALTITUDE * WORLD_SCALE - 700);
    const body = Bodies.circle(x, y, 20, { isSensor: true, isStatic: true, label: `coin_${index}` });
    World.add(mWorld, body);
    return { x, worldY: y, radius: 15, collected: false };
}

function spawnDiamond(index) {
    const x = Math.random() * (gameWidth - 40) + 20;
    const y = PANDA_START_Y + 600 + Math.random() * (INITIAL_ALTITUDE * WORLD_SCALE - 800);
    const body = Bodies.circle(x, y, 20, { isSensor: true, isStatic: true, label: `diamond_${index}` });
    World.add(mWorld, body);
    return { x, worldY: y, size: 18, collected: false };
}

function spawnBird(index) {
    const x = Math.random() * (gameWidth - 200) + 100;
    const y = PANDA_START_Y + 700 + Math.random() * (INITIAL_ALTITUDE * WORLD_SCALE - 900);
    const body = Bodies.circle(x, y, 30, { isSensor: true, isStatic: true, label: `bird_${index}` });
    World.add(mWorld, body);
    birdBodies[index] = body;
    return {
        baseX: x, x, worldY: y,
        range: 150 + Math.random() * 250,
        speed: 1.0 + Math.random() * 1.5,
        timeOffset: Math.random() * Math.PI * 2,
        hit: false, size: 35
    };
}

// ===== INIT / END =====
function initGame() {
    altitude          = INITIAL_ALTITUDE;
    score             = 0;
    gameTime          = 0;
    parachuteDeployed = false;
    freefallTimer     = 0;
    cameraY           = 0;
    uiScore.innerText = score;

    plane.x   = -plane.width;
    plane.y   = PANDA_START_Y;
    plane.vx  = 400;
    targetX   = gameWidth * 0.2 + Math.random() * gameWidth * 0.6;

    initPhysics();

    clouds = [];
    for (let i = 0; i < 25; i++) clouds.push(spawnCloud());

    coins = [];
    for (let i = 0; i < 50; i++) coins.push(spawnCoin(i));

    diamonds = [];
    for (let i = 0; i < 10; i++) diamonds.push(spawnDiamond(i));

    birds = []; birdBodies = [];
    for (let i = 0; i < 10; i++) birds.push(spawnBird(i));

    stopMusic();
    bgmPlaybackRate = 1.0;
    audioCtx.resume().then(() => startMusic());

    currentState = STATE.STARTING;
    uiStartScreen.classList.add('hidden');
    uiGameOverScreen.classList.add('hidden');
    uiHud.classList.add('hidden');

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function endGame() {
    if (currentState === STATE.GAMEOVER) return;
    currentState = STATE.GAMEOVER;
    uiHud.classList.add('hidden');
    uiGameOverScreen.classList.remove('hidden');

    const dist = Math.abs(pandaBody.position.x - targetX);
    const speed = Math.sqrt(pandaBody.velocity.x ** 2 + pandaBody.velocity.y ** 2);
    let landingScore = 0;

    if (dist < 40)       { landingScore = 100; endTitle.innerText = `Bullseye! Gesamt: ${score + landingScore} Pkt`; }
    else if (dist < 100) { landingScore = 50;  endTitle.innerText = `Gute Landung! Gesamt: ${score + landingScore} Pkt`; }
    else if (dist < 200) { landingScore = 10;  endTitle.innerText = `Knapp vorbei! Gesamt: ${score + landingScore} Pkt`; }
    else if (speed > 5)  {                     endTitle.innerText = `Stolper-Landung! Gesamt: ${score} Pkt`; }
    else                 {                     endTitle.innerText = `Sichere Landung! Gesamt: ${score} Pkt`; }

    stopMusic();
    playLandSound();
    draw();
}

// ===== UPDATE =====
function update(dt) {
    gameTime += dt;

    if (currentState === STATE.STARTING) {
        plane.x += plane.vx * dt;

        if (pandaBody.isStatic && plane.x > gameWidth / 2 - 100) {
            // Drop: unlock physics body
            Body.setStatic(pandaBody, false);
            Body.setPosition(pandaBody, { x: plane.x + 50, y: plane.y + 30 });
            Body.setVelocity(pandaBody, { x: plane.vx * 0.0005, y: 0 });
            freefallTimer = 0.0001;
            playJumpSound();
        }

        if (!pandaBody.isStatic) {
            freefallTimer += dt;
            if (freefallTimer > 1.2 && !parachuteDeployed) {
                parachuteDeployed = true;
                pandaBody.frictionAir = 0.06;
                currentState = STATE.PLAYING;
                uiHud.classList.remove('hidden');
            }
        } else {
            // Still glued to plane
            Body.setPosition(pandaBody, { x: plane.x + 50, y: plane.y + 30 });
        }

        Engine.update(engine, dt * 1000);
        cameraY = Math.max(0, pandaBody.position.y - 250);
        return;
    }

    if (currentState !== STATE.PLAYING) return;

    // Horizontal forces
    const FORCE = 0.005 * pandaBody.mass;
    if (keys.ArrowLeft || keys.a)  Body.applyForce(pandaBody, pandaBody.position, { x: -FORCE, y: 0 });
    if (keys.ArrowRight || keys.d) Body.applyForce(pandaBody, pandaBody.position, { x:  FORCE, y: 0 });

    // Velocity caps
    const vel = pandaBody.velocity;
    if (Math.abs(vel.x) > MAX_VX) Body.setVelocity(pandaBody, { x: Math.sign(vel.x) * MAX_VX, y: vel.y });
    if (vel.y > MAX_VY)           Body.setVelocity(pandaBody, { x: pandaBody.velocity.x, y: MAX_VY });

    // Horizontal screen wrap
    const px = pandaBody.position;
    if (px.x < -30)              Body.setPosition(pandaBody, { x: gameWidth + 30, y: px.y });
    else if (px.x > gameWidth + 30) Body.setPosition(pandaBody, { x: -30, y: px.y });

    // Oscillate birds
    birds.forEach((bird, i) => {
        const newX = bird.baseX + Math.sin(gameTime * bird.speed + bird.timeOffset) * bird.range;
        bird.x = newX;
        if (birdBodies[i]) Body.setPosition(birdBodies[i], { x: newX, y: bird.worldY });
    });

    Engine.update(engine, dt * 1000);

    // Camera follows panda
    cameraY = Math.max(0, Math.min(pandaBody.position.y - 250, GROUND_Y + 200));

    // Altitude
    altitude = Math.max(0, (GROUND_Y - pandaBody.position.y) / WORLD_SCALE);
    uiAltitude.innerText = Math.ceil(altitude);

    // Music speed ramps up as altitude drops
    bgmPlaybackRate = 1.0 + 0.3 * ((INITIAL_ALTITUDE - altitude) / INITIAL_ALTITUDE);
}

// ===== DRAW HELPERS =====
function drawPlane(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath(); ctx.ellipse(0, 0, 80, 20, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath(); ctx.ellipse(30, -5, 20, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-40, -40); ctx.lineTo(10, -40); ctx.lineTo(20, 0); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-70, -10); ctx.lineTo(-90, -40); ctx.lineTo(-60, -40); ctx.lineTo(-50, -10); ctx.fill();
    ctx.restore();
}

function drawPanda(x, y, vx, landed, hasParachute) {
    ctx.save();
    ctx.translate(x, y);

    const MAX_SPEED = 420; // px/s ~ MAX_VX * 60
    const tilt = landed ? 0 : (vx / MAX_SPEED) * 0.3;
    ctx.rotate(tilt);

    if (!landed && hasParachute) {
        ctx.beginPath(); ctx.fillStyle = '#ef4444';
        ctx.arc(0, -90, 80, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-80, -90); ctx.lineTo(-20, 0);
        ctx.moveTo(-40, -90); ctx.lineTo(-10, 0);
        ctx.moveTo(  0, -90); ctx.lineTo(  0, 0);
        ctx.moveTo( 40, -90); ctx.lineTo( 10, 0);
        ctx.moveTo( 80, -90); ctx.lineTo( 20, 0);
        ctx.stroke();
    }

    const isFreefall = (!landed && !hasParachute);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(0, 20, 30, 35, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#111827';
    if (isFreefall) {
        ctx.beginPath(); ctx.ellipse(-35, 10, 10, 15,  Math.PI / 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse( 35, 10, 10, 15, -Math.PI / 4, 0, Math.PI * 2); ctx.fill();
    } else if (!landed) {
        ctx.beginPath(); ctx.arc(-25, -5, 10, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc( 25, -5, 10, 0, Math.PI * 2); ctx.fill();
    } else {
        ctx.beginPath(); ctx.ellipse(-28, 20, 10, 15,  Math.PI / 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse( 28, 20, 10, 15, -Math.PI / 4, 0, Math.PI * 2); ctx.fill();
    }

    ctx.beginPath();
    if (isFreefall) {
        ctx.ellipse(-25, 45, 10, 15, -Math.PI / 4, 0, Math.PI * 2); ctx.fill();
        ctx.ellipse( 25, 45, 10, 15,  Math.PI / 4, 0, Math.PI * 2); ctx.fill();
    } else if (!landed) {
        ctx.ellipse(-15, 48, 12, 18, -Math.PI / 6, 0, Math.PI * 2); ctx.fill();
        ctx.ellipse( 15, 48, 12, 18,  Math.PI / 6, 0, Math.PI * 2); ctx.fill();
    } else {
        ctx.ellipse(-18, 52, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.ellipse( 18, 52, 14, 10, 0, 0, Math.PI * 2); ctx.fill();
    }

    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, -10, 26, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.arc(-22, -26, 11, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( 22, -26, 11, 0, Math.PI * 2); ctx.fill();

    ctx.beginPath(); ctx.ellipse(-10, -12, 7, 9, -Math.PI / 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 10, -12, 7, 9,  Math.PI / 6, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-10, -14, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( 10, -14, 2.5, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.arc(0, -2, 4, 0, Math.PI * 2); ctx.fill();

    if (isFreefall) {
        ctx.beginPath(); ctx.arc(0, 5, 4, 0, Math.PI * 2); ctx.fill();
    } else if (landed) {
        ctx.beginPath(); ctx.arc(0, 2, 8, 0, Math.PI);
        ctx.lineWidth = 2; ctx.strokeStyle = '#111827'; ctx.stroke();
    }

    ctx.restore();
}

// ===== DRAW =====
function draw() {
    // Sky gradient
    const progress = Math.max(0, altitude / INITIAL_ALTITUDE);
    const rTop = Math.floor(13  + (110 - 13)  * (1 - progress));
    const gTop = Math.floor(27  + (180 - 27)  * (1 - progress));
    const bTop = Math.floor(42  + (255 - 42)  * (1 - progress));
    const rBot = Math.floor(28  + (150 - 28)  * (1 - progress));
    const gBot = Math.floor(63  + (220 - 63)  * (1 - progress));
    const bBot = Math.floor(96  + (255 - 96)  * (1 - progress));

    const gradient = ctx.createLinearGradient(0, 0, 0, gameHeight);
    gradient.addColorStop(0, `rgb(${rTop},${gTop},${bTop})`);
    gradient.addColorStop(1, `rgb(${rBot},${gBot},${bBot})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, gameWidth, gameHeight);

    // ---- World-space drawing (camera offset) ----
    ctx.save();
    ctx.translate(0, -cameraY);

    // Clouds
    clouds.forEach(c => {
        ctx.fillStyle = `rgba(255,255,255,${c.opacity})`;
        ctx.beginPath();
        ctx.arc(c.x, c.worldY, c.size, 0, Math.PI * 2);
        ctx.arc(c.x + c.size * 0.8, c.worldY + c.size * 0.2, c.size * 0.8, 0, Math.PI * 2);
        ctx.arc(c.x - c.size * 0.8, c.worldY + c.size * 0.2, c.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
    });

    // Coins
    coins.forEach(coin => {
        if (coin.collected) return;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(coin.x, coin.worldY, coin.radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath(); ctx.arc(coin.x, coin.worldY, coin.radius * 0.7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.arc(coin.x, coin.worldY, coin.radius * 0.5, 0, Math.PI * 2); ctx.fill();
    });

    // Diamonds
    diamonds.forEach(d => {
        if (d.collected) return;
        ctx.save();
        ctx.translate(d.x, d.worldY);
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.moveTo(0, -d.size); ctx.lineTo(d.size, 0);
        ctx.lineTo(0, d.size * 1.5); ctx.lineTo(-d.size, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#67e8f9';
        ctx.beginPath();
        ctx.moveTo(0, -d.size * 0.7); ctx.lineTo(d.size * 0.5, 0);
        ctx.lineTo(0, d.size * 0.9);  ctx.lineTo(-d.size * 0.5, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#cffafe';
        ctx.beginPath();
        ctx.moveTo(0, -d.size * 0.6); ctx.lineTo(d.size * 0.3, 0); ctx.lineTo(0, 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();
    });

    // Birds
    birds.forEach(bird => {
        ctx.save();
        ctx.translate(bird.x, bird.worldY);

        const isFlyingRight = Math.cos(gameTime * bird.speed + bird.timeOffset) > 0;
        if (!isFlyingRight) ctx.scale(-1, 1);

        ctx.fillStyle = bird.hit ? '#ef4444' : '#5c4033';
        const flapDir = Math.sin(gameTime * bird.speed * 8);

        // Tail
        ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(-35, -15); ctx.lineTo(-35, 15); ctx.fill();
        // Body
        ctx.beginPath(); ctx.ellipse(0, 0, 25, 12, 0, 0, Math.PI * 2); ctx.fill();
        // Head
        ctx.beginPath(); ctx.arc(20, -3, 10, 0, Math.PI * 2); ctx.fill();
        // Beak
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.moveTo(25, -3); ctx.lineTo(40, -1); ctx.lineTo(25, 5); ctx.fill();
        // Eye
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(23, -5, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.beginPath(); ctx.arc(24, -5, 1.5, 0, Math.PI * 2); ctx.fill();
        // Back wing
        ctx.fillStyle = bird.hit ? '#b91c1c' : '#3e2723';
        ctx.beginPath(); ctx.moveTo(5, -5); ctx.lineTo(-10, -5); ctx.lineTo(-5, -40 * flapDir - 10); ctx.fill();
        // Front wing
        ctx.fillStyle = bird.hit ? '#f87171' : '#795548';
        ctx.beginPath(); ctx.moveTo(5, 5); ctx.lineTo(-15, 5); ctx.lineTo(-10, 30 * flapDir + 10); ctx.fill();

        ctx.restore();
    });

    // Ground (visible when panda is close)
    const screenGround = GROUND_Y - cameraY;
    if (screenGround < gameHeight + 200) {
        ctx.fillStyle = '#22c55e';
        ctx.fillRect(0, GROUND_Y, gameWidth, 600);
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(0, GROUND_Y + 80, gameWidth, 520);

        // Landing target
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.ellipse(targetX, GROUND_Y, 80, 20, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(targetX, GROUND_Y, 50, 12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.ellipse(targetX, GROUND_Y, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore(); // end camera transform

    // ---- Screen-space drawing ----
    // Plane (adjust y for camera)
    if (currentState === STATE.STARTING) {
        drawPlane(plane.x, plane.y - cameraY);
    }

    // Panda (screen coords)
    if (pandaBody && (currentState !== STATE.STARTING || !pandaBody.isStatic)) {
        const sx = pandaBody.position.x;
        const sy = pandaBody.position.y - cameraY;
        const vxScreen = pandaBody.velocity.x * 60; // approximate px/s for tilt calc
        const landed = altitude <= 2;
        drawPanda(sx, sy, vxScreen, landed, parachuteDeployed);
    }
}

// ===== GAME LOOP =====
function gameLoop(time) {
    if (currentState === STATE.PLAYING || currentState === STATE.STARTING) {
        requestAnimationFrame(gameLoop);
    }
    const dt = Math.min((time - lastTime) / 1000, 0.05); // cap dt to prevent tunneling
    lastTime = time;
    update(dt);
    draw();
}

// ===== BUTTON HANDLERS =====
btnStart.addEventListener('click', () => { initAudio(); initGame(); });
btnRestart.addEventListener('click', () => { initAudio(); initGame(); });

// Initial menu render (no physics yet)
targetX = gameWidth * 0.2 + Math.random() * gameWidth * 0.6;
altitude = INITIAL_ALTITUDE;
clouds = [];
for (let i = 0; i < 20; i++) clouds.push(spawnCloud());
draw();
