const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const uiStartScreen = document.getElementById('start-screen');
const uiGameOverScreen = document.getElementById('game-over-screen');
const uiHud = document.getElementById('hud');
const uiAltitude = document.getElementById('altitude');
const uiScore = document.getElementById('score'); // New UI element for score
const btnStart = document.getElementById('btn-start');
const btnRestart = document.getElementById('btn-restart');
const endTitle = document.getElementById('end-title');

let gameWidth = window.innerWidth;
let gameHeight = window.innerHeight;
canvas.width = gameWidth;
canvas.height = gameHeight;

window.addEventListener('resize', () => {
    gameWidth = window.innerWidth;
    gameHeight = window.innerHeight;
    canvas.width = gameWidth;
    canvas.height = gameHeight;
    if (currentState === STATE.MENU || currentState === STATE.GAMEOVER) draw();
});

const STATE = { MENU: 0, PLAYING: 1, GAMEOVER: 2, STARTING: 3 };
let currentState = STATE.MENU;
let lastTime = 0;

const INITIAL_ALTITUDE = 1000;
let altitude = INITIAL_ALTITUDE;
const FALL_SPEED = 25;
let clouds = [];
let coins = [];
let diamonds = []; // New diamonds array
let birds = []; // New birds array
let gameTime = 0;
let score = 0;
let keys = { ArrowLeft: false, ArrowRight: false, a: false, d: false };
let targetX = 0;

// Web Audio API Synth Settings
let audioCtx;
let synthTimeout;
let bgmPlaybackRate = 1.0;
let currentNoteIndex = 0;
const DURATION = 0.15; // length of each note
// 8-bit arpeggio melody (C Maj, G Maj, A Min, F Maj)
const melody = [
    261.6, 329.6, 392.0, 523.3, 392.0, 329.6,
    196.0, 246.9, 293.7, 392.0, 293.7, 246.9,
    220.0, 261.6, 329.6, 440.0, 329.6, 261.6,
    174.6, 220.0, 261.6, 349.2, 261.6, 220.0
];

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSynthNote() {
    if (currentState !== STATE.PLAYING && currentState !== STATE.STARTING) return;
    
    if (!audioCtx || audioCtx.state === 'suspended') return;
    
    let freq = melody[currentNoteIndex % melody.length];
    currentNoteIndex++;
    
    let osc = audioCtx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    let gainNode = audioCtx.createGain();
    
    // Smooth attack and release to prevent clipping/popping
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.02); // Louder BGM
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + DURATION);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + DURATION);
    
    let nextTimeMs = (DURATION * 1000) / bgmPlaybackRate;
    synthTimeout = setTimeout(playSynthNote, nextTimeMs);
}

// Sound Effects
function playCoinSound() {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // "Tada" - Two fast rising notes
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.setValueAtTime(800, t + 0.1);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.8, t + 0.05); // Much louder
    gain.gain.linearRampToValueAtTime(0, t + 0.2);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(t);
    osc.stop(t + 0.2);
}

function playCoinSound() {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // "Tada" - Two fast rising notes
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.setValueAtTime(800, t + 0.1);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1.0, t + 0.05); // Maximum Coin volume
    gain.gain.linearRampToValueAtTime(0, t + 0.2);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(t);
    osc.stop(t + 0.2);
}

function playDiamondSound() {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // "Tudu" - Higher, faster arpeggio
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(1108.73, t + 0.05);
    osc.frequency.setValueAtTime(1318.51, t + 0.1);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1.0, t + 0.02); // Maximum Diamond volume
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(t);
    osc.stop(t + 0.3);
}

function playJumpSound() {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // "Aaaaaahhhh!" - Long descending pitch (like falling)
    osc.type = 'sawtooth'; // Sawtooth sounds more like a yell
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 1.2); // Slower drop over 1.2s (the freefall duration)
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1.5, t + 0.1); // Max volume!
    gain.gain.linearRampToValueAtTime(0, t + 1.2);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(t);
    osc.stop(t + 1.2);
}

function playLandSound() {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    const t = audioCtx.currentTime;
    
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // "Thud/Plopp" heavily emphasized
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(150, t);
    osc1.frequency.exponentialRampToValueAtTime(10, t + 0.2);
    
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(100, t);
    osc2.frequency.exponentialRampToValueAtTime(10, t + 0.2);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(2.0, t + 0.01); // Exceed standard loud
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.2);
    osc2.stop(t + 0.2);
}

function playHitSound() {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    // "Aua/Zonk" - Discordant drop
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.15);
    
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1.5, t + 0.02); // Loud hit sound
    gain.gain.linearRampToValueAtTime(0, t + 0.15);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(t);
    osc.stop(t + 0.15);
}

const player = {
    x: gameWidth / 2, y: 250, vx: 0,
    width: 60, height: 80,
    maxSpeed: 400, acceleration: 1500, friction: 0.95,
    parachuteDeployed: false, freefallTimer: 0
};

const plane = { x: -200, y: 100, vx: 400, width: 160, height: 60 };

window.addEventListener('keydown', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = true; });
window.addEventListener('keyup', (e) => { if (keys.hasOwnProperty(e.key)) keys[e.key] = false; });

function spawnCloud(yOverride) {
    return {
        x: Math.random() * gameWidth,
        y: yOverride !== undefined ? yOverride : gameHeight + Math.random() * 200,
        size: 50 + Math.random() * 80,
        speed: 150 + Math.random() * 200,
        opacity: 0.2 + Math.random() * 0.4
    };
}

function spawnCoin(yOverride) {
    return {
        x: Math.random() * (gameWidth - 40) + 20,
        y: yOverride !== undefined ? yOverride : gameHeight + Math.random() * 200,
        radius: 15,
        speed: FALL_SPEED * 10,
        collected: false
    };
}

function spawnDiamond(avoidCoins) {
    let x, y, validPosition;
    let attempts = 0;
    
    do {
        validPosition = true;
        x = Math.random() * (gameWidth - 40) + 20;
        y = gameHeight + Math.random() * (INITIAL_ALTITUDE * 10); // Spread across the whole height of the jump mapped to canvas 

        // Ensure diamond is far away from coins initially if specified
        if (avoidCoins) {
            for (let c of coins) {
                const dist = Math.sqrt(Math.pow(c.x - x, 2) + Math.pow(c.y - y, 2));
                if (dist < 300) { // Keep at least 300px away from coins
                    validPosition = false;
                    break;
                }
            }
        }
        attempts++;
    } while (!validPosition && attempts < 50);

    return {
        x: x,
        y: y,
        size: 18,
        collected: false
    };
}

function spawnBird(yOverride) {
    let x = Math.random() * (gameWidth - 200) + 100; // Keep away from edges
    let y = yOverride !== undefined ? yOverride : gameHeight + Math.random() * (INITIAL_ALTITUDE * 9);
    return {
        baseX: x,
        x: x,
        y: y,
        range: 150 + Math.random() * 250, // flies 150-400px left/right
        speed: 1.0 + Math.random() * 1.5, // slightly slower oscillation for larger sweeps
        timeOffset: Math.random() * Math.PI * 2,
        hit: false,
        size: 35 // larger size
    };
}

function initGame() {
    altitude = INITIAL_ALTITUDE;
    player.x = gameWidth / 2;
    player.y = plane.y + 30; // Starts attached to plane
    player.vx = plane.vx * 0.8; // Initial velocity from plane momentum
    player.parachuteDeployed = false;
    player.freefallTimer = 0;
    
    plane.x = -plane.width;
    plane.vx = 400; // Fly in fast
    
    targetX = gameWidth * 0.2 + Math.random() * gameWidth * 0.6;
    score = 0;
    uiScore.innerText = score;

    clouds = [];
    for(let i=0; i<15; i++) clouds.push(spawnCloud(Math.random() * gameHeight));
    
    coins = [];
    // Spawn initial coins
    for(let i=0; i<3; i++) coins.push(spawnCoin(Math.random() * gameHeight + 400));
    
    diamonds = [];
    // Spawn exactly 10 diamonds scattered across the drop
    for(let i=0; i<10; i++) diamonds.push(spawnDiamond(true));

    birds = [];
    // Spawn exactly 10 birds scattered
    for(let i=0; i<10; i++) birds.push(spawnBird());
    gameTime = 0;

    // Reset and start 8-Bit music
    if (synthTimeout) clearTimeout(synthTimeout);
    bgmPlaybackRate = 1.0;
    currentNoteIndex = 0;
    playSynthNote();

    currentState = STATE.STARTING;
    uiStartScreen.classList.add('hidden');
    uiGameOverScreen.classList.add('hidden');
    uiHud.classList.add('hidden'); // Hide HUD until plane drops
    
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function endGame() {
    currentState = STATE.GAMEOVER;
    uiHud.classList.add('hidden');
    uiGameOverScreen.classList.remove('hidden');
    
    const dist = Math.abs(player.x - targetX);
    let landingScore = 0;
    
    if (dist < 40) {
        landingScore = 100;
        endTitle.innerText = `Bullseye! Gesamt: ${score + landingScore} Pkt`;
    } else if (dist < 100) {
        landingScore = 50;
        endTitle.innerText = `Gute Landung! Gesamt: ${score + landingScore} Pkt`;
    } else if (dist < 200) {
        landingScore = 10;
        endTitle.innerText = `Knapp vorbei! Gesamt: ${score + landingScore} Pkt`;
    } else {
        if (Math.abs(player.vx) > player.maxSpeed * 0.7) endTitle.innerText = `Stolper-Landung! Gesamt: ${score} Pkt`;
        else endTitle.innerText = `Sichere Landung! Gesamt: ${score} Pkt`;
    }
    
    // Stop music
    if (synthTimeout) clearTimeout(synthTimeout);
    
    playLandSound(); // Lande-"Plopp"
    
    draw();
}

function update(dt) {
    gameTime += dt;
    if (currentState === STATE.STARTING) {
        plane.x += plane.vx * dt;
        
        // Panda drops when plane passes center left slightly
        if (player.parachuteDeployed === false && plane.x > gameWidth / 2 - 100) {
            
            // Trigger jump sound exactly when freefall starts
            if (player.freefallTimer === 0) {
                playJumpSound();
            }
            
            // Panda is now falling
            player.x += player.vx * dt;
            player.y += 200 * dt; // Fall down
            player.vx *= 0.98; // Air resistance in freefall
            player.freefallTimer += dt;
            
            if (player.freefallTimer > 1.2) { // parachute opens after 1.2s
                player.parachuteDeployed = true;
                currentState = STATE.PLAYING;
                uiHud.classList.remove('hidden');
            }
        } else if (player.parachuteDeployed === false) {
            // Panda follows plane until drop
            player.x = plane.x + 50;
            player.y = plane.y + 30;
        }

        clouds.forEach(c => { c.y -= c.speed * dt * 0.2; });
        return;
    }

    if (currentState !== STATE.PLAYING) return;

    // Smoothly bring panda to normal y position (250)
    if (player.y > 250) {
        player.y -= 100 * dt;
        if (player.y < 250) player.y = 250;
    } else if (player.y < 250) {
        player.y += 100 * dt;
        if (player.y > 250) player.y = 250;
    }

    let moving = false;
    if (keys.ArrowLeft || keys.a) { player.vx -= player.acceleration * dt; moving = true; }
    if (keys.ArrowRight || keys.d) { player.vx += player.acceleration * dt; moving = true; }

    if (!moving) player.vx *= player.friction;
    if (player.vx > player.maxSpeed) player.vx = player.maxSpeed;
    if (player.vx < -player.maxSpeed) player.vx = -player.maxSpeed;

    player.x += player.vx * dt;
    if (player.x < -player.width) player.x = gameWidth + player.width;
    if (player.x > gameWidth + player.width) player.x = -player.width;

    altitude -= FALL_SPEED * dt;
    if (altitude <= 0) { altitude = 0; endGame(); }
    uiAltitude.innerText = Math.ceil(altitude);

    // Update music playback speed based on altitude inverse (1.0 => 2.5)
    // 1000m = base speed (1.0). 0m = max speed (e.g., 2.5x)
    if (currentState === STATE.PLAYING) {
        bgmPlaybackRate = 1.0 + (1.5 * ((INITIAL_ALTITUDE - altitude) / INITIAL_ALTITUDE));
    }

    // Coins Logic
    for (let i = coins.length - 1; i >= 0; i--) {
        let coin = coins[i];
        
        // Coins go up visually at roughly FALL_SPEED mapping
        // 2000m -> canvas taking maybe 60 seconds. So FALL_SPEED 25 is about 25m/s.
        // Let's make visual speed = 250 px/s
        coin.y -= 250 * dt; 
        
        // Collision detection
        if (!coin.collected) {
            // Check distance from player center
            const dx = player.x - coin.x;
            const dy = player.y - coin.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Panda hitbox roughly 40px radius
            if (distance < 55) {
                coin.collected = true;
                score += 10;
                uiScore.innerText = score;
                playCoinSound(); // Tada
            }
        }

        if (coin.y + coin.radius < 0) {
            coins.splice(i, 1);
        }
    }
    
    // Diamonds Logic
    for (let i = diamonds.length - 1; i >= 0; i--) {
        let diamond = diamonds[i];
        
        diamond.y -= 250 * dt; 
        
        if (!diamond.collected) {
            const dx = player.x - diamond.x;
            const dy = player.y - diamond.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 55) {
                diamond.collected = true;
                score += 50; // Diamond gives 50 points
                uiScore.innerText = score;
                playDiamondSound(); // Tudu
            }
        }

        // We don't splice uncollected diamonds, just let them fall off screen
        // as there are precisely 10.
    }
    
    // Birds Logic
    for (let i = birds.length - 1; i >= 0; i--) {
        let bird = birds[i];
        
        bird.y -= 250 * dt; 
        // Oscillate left/right based on time
        bird.x = bird.baseX + Math.sin(gameTime * bird.speed + bird.timeOffset) * bird.range;
        
        if (!bird.hit) {
            const dx = player.x - bird.x;
            const dy = player.y - bird.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 60) { // Collision radius increased for larger birds
                bird.hit = true;
                score -= 50; 
                uiScore.innerText = score;
                playHitSound(); // Aua
            }
        }
    }
    
    // Spawn coins (~10 per 100m)
    // Probabilty spawn:
    if (altitude > 100 && Math.random() < 2.5 * dt) {
        coins.push(spawnCoin());
    }

    for (let i = clouds.length - 1; i >= 0; i--) {
        let cloud = clouds[i];
        cloud.y -= cloud.speed * dt;
        if (cloud.y + cloud.size < 0) {
            clouds.splice(i, 1);
            if (altitude > 100) clouds.push(spawnCloud());
        }
    }
}

function drawPlane(x, y) {
    ctx.save();
    ctx.translate(x, y);
    // Flugzeug Rumpf
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath(); ctx.ellipse(0, 0, 80, 20, 0, 0, Math.PI * 2); ctx.fill();
    // Cockpit
    ctx.fillStyle = '#60a5fa';
    ctx.beginPath(); ctx.ellipse(30, -5, 20, 10, 0, 0, Math.PI * 2); ctx.fill();
    // Flügel
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(-40, -40); ctx.lineTo(10, -40); ctx.lineTo(20, 0); ctx.fill();
    // Heck
    ctx.beginPath(); ctx.moveTo(-70, -10); ctx.lineTo(-90, -40); ctx.lineTo(-60, -40); ctx.lineTo(-50, -10); ctx.fill();
    ctx.restore();
}

function draw() {
    const progress = Math.max(0, altitude / INITIAL_ALTITUDE);
    const rTop = Math.floor(13 + (110 - 13) * (1 - progress));
    const gTop = Math.floor(27 + (180 - 27) * (1 - progress));
    const bTop = Math.floor(42 + (255 - 42) * (1 - progress));
    
    const rBot = Math.floor(28 + (150 - 28) * (1 - progress));
    const gBot = Math.floor(63 + (220 - 63) * (1 - progress));
    const bBot = Math.floor(96 + (255 - 96) * (1 - progress));

    const gradient = ctx.createLinearGradient(0, 0, 0, gameHeight);
    gradient.addColorStop(0, `rgb(${rTop}, ${gTop}, ${bTop})`);
    gradient.addColorStop(1, `rgb(${rBot}, ${gBot}, ${bBot})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, gameWidth, gameHeight);

    clouds.forEach(cloud => {
        ctx.fillStyle = `rgba(255, 255, 255, ${cloud.opacity})`;
        ctx.beginPath();
        ctx.arc(cloud.x, cloud.y, cloud.size, 0, Math.PI * 2);
        ctx.arc(cloud.x + cloud.size * 0.8, cloud.y + cloud.size * 0.2, cloud.size * 0.8, 0, Math.PI * 2);
        ctx.arc(cloud.x - cloud.size * 0.8, cloud.y + cloud.size * 0.2, cloud.size * 0.8, 0, Math.PI * 2);
        ctx.fill();
    });

    // Draw Coins
    coins.forEach(coin => {
        if (!coin.collected) {
            ctx.fillStyle = '#fbbf24'; // Golden outer
            ctx.beginPath();
            ctx.arc(coin.x, coin.y, coin.radius, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#f59e0b'; // Golden inner ring
            ctx.beginPath();
            ctx.arc(coin.x, coin.y, coin.radius * 0.7, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = '#fbbf24'; 
            ctx.beginPath();
            ctx.arc(coin.x, coin.y, coin.radius * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }
    });
    
    // Draw Diamonds
    diamonds.forEach(diamond => {
        if (!diamond.collected) {
            ctx.save();
            ctx.translate(diamond.x, diamond.y);
            
            // Neon Cyan Diamond Shape
            ctx.fillStyle = '#22d3ee'; // cyan-400
            ctx.beginPath();
            ctx.moveTo(0, -diamond.size); // Top point
            ctx.lineTo(diamond.size, 0);  // Right point
            ctx.lineTo(0, diamond.size * 1.5); // Bottom point
            ctx.lineTo(-diamond.size, 0); // Left point
            ctx.closePath();
            ctx.fill();
            
            // Inner glare
            ctx.fillStyle = '#67e8f9'; // cyan-300
            ctx.beginPath();
            ctx.moveTo(0, -diamond.size * 0.7);
            ctx.lineTo(diamond.size * 0.5, 0);
            ctx.lineTo(0, diamond.size * 0.9);
            ctx.lineTo(-diamond.size * 0.5, 0);
            ctx.closePath();
            ctx.fill();
            
            ctx.fillStyle = '#cffafe'; // cyan-100 highlight
            ctx.beginPath();
            ctx.moveTo(0, -diamond.size * 0.6);
            ctx.lineTo(diamond.size * 0.3, 0);
            ctx.lineTo(0, 0);
            ctx.closePath();
            ctx.fill();
            
            ctx.restore();
        }
    });

    // Draw Birds
    birds.forEach(bird => {
        ctx.save();
        ctx.translate(bird.x, bird.y);
        
        // Determine facing direction based on current velocity over time (derivative of sin is cos)
        const isFlyingRight = Math.cos(gameTime * bird.speed + bird.timeOffset) > 0;
        if (!isFlyingRight) {
            ctx.scale(-1, 1);
        }
        
        ctx.fillStyle = bird.hit ? '#ef4444' : '#5c4033'; // Hit turns red, otherwise dark brown
        
        const flapDir = Math.sin(gameTime * bird.speed * 8); // Flapping animation -1 to 1
        
        // Tail
        ctx.beginPath();
        ctx.moveTo(-15, 0);
        ctx.lineTo(-35, -15);
        ctx.lineTo(-35, 15);
        ctx.fill();

        // Bird body
        ctx.beginPath();
        ctx.ellipse(0, 0, 25, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(20, -3, 10, 0, Math.PI * 2);
        ctx.fill();
        
        // Beak
        ctx.fillStyle = '#fbbf24'; // Yellow beak
        ctx.beginPath();
        ctx.moveTo(25, -3);
        ctx.lineTo(40, -1);
        ctx.lineTo(25, 5);
        ctx.fill();
        
        // Eye
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(23, -5, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(24, -5, 1.5, 0, Math.PI * 2);
        ctx.fill();
        
        // Wings (front and back) -> depends on flap
        // Back Wing
        ctx.fillStyle = bird.hit ? '#b91c1c' : '#3e2723'; // Darker brown for contrast
        ctx.beginPath();
        ctx.moveTo(5, -5);
        ctx.lineTo(-10, -5);
        ctx.lineTo(-5, -40 * flapDir - 10);
        ctx.fill();
        
        // Front Wing
        ctx.fillStyle = bird.hit ? '#f87171' : '#795548'; // Lighter brown
        ctx.beginPath();
        ctx.moveTo(5, 5);
        ctx.lineTo(-15, 5);
        ctx.lineTo(-10, 30 * flapDir + 10);
        ctx.fill();

        ctx.restore();
    });

    if (altitude < 100) {
        // Starts hiding at 100m bottom edge, comes up as altitude -> 0
        const groundY = gameHeight - ((100 - altitude) / 100) * gameHeight * 0.8;
        
        // Draw flat ground for easier landing targeting
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(gameWidth, groundY);
        ctx.lineTo(gameWidth, gameHeight);
        ctx.lineTo(0, gameHeight);
        ctx.fill();
        
        ctx.fillStyle = '#16a34a';
        ctx.fillRect(0, groundY + 80, gameWidth, gameHeight);
        
        // Draw Target
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.ellipse(targetX, groundY, 80, 20, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.ellipse(targetX, groundY, 50, 12, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath(); ctx.ellipse(targetX, groundY, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
    }

    if (currentState === STATE.STARTING) drawPlane(plane.x, plane.y);

    let drawY = player.y;
    if (altitude === 0) {
        const finalGroundY = gameHeight - gameHeight * 0.8;
        drawY = finalGroundY - 50; 
    }

    if (currentState !== STATE.STARTING || (plane.x > gameWidth / 2 - 100)) {
        drawPanda(player.x, drawY, player.vx, altitude === 0, player.parachuteDeployed);
    }
}

function drawPanda(x, y, vx, landed, hasParachute) {
    ctx.save();
    ctx.translate(x, y);

    const tilt = landed ? 0 : (vx / player.maxSpeed) * 0.3;
    ctx.rotate(tilt);

    if (!landed && hasParachute) {
        ctx.beginPath();
        ctx.fillStyle = '#ef4444';
        ctx.arc(0, -90, 80, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-80, -90); ctx.lineTo(-20, 0);
        ctx.moveTo(-40, -90); ctx.lineTo(-10, 0);
        ctx.moveTo(0, -90);   ctx.lineTo(0, 0);
        ctx.moveTo(40, -90);  ctx.lineTo(10, 0);
        ctx.moveTo(80, -90);  ctx.lineTo(20, 0);
        ctx.stroke();
    }

    const isFreefall = (!landed && !hasParachute);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(0, 20, 30, 35, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#111827';
    if (isFreefall) {
        ctx.beginPath(); ctx.ellipse(-35, 10, 10, 15, Math.PI/4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(35, 10, 10, 15, -Math.PI/4, 0, Math.PI*2); ctx.fill();
    } else if (!landed) {
        ctx.beginPath(); ctx.arc(-25, -5, 10, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(25, -5, 10, 0, Math.PI*2); ctx.fill();
    } else {
        ctx.beginPath(); ctx.ellipse(-28, 20, 10, 15, Math.PI/4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(28, 20, 10, 15, -Math.PI/4, 0, Math.PI*2); ctx.fill();
    }

    ctx.beginPath(); 
    if (isFreefall) {
        ctx.ellipse(-25, 45, 10, 15, -Math.PI/4, 0, Math.PI*2); ctx.fill(); 
        ctx.ellipse(25, 45, 10, 15, Math.PI/4, 0, Math.PI*2); ctx.fill(); 
    } else if (!landed) {
        ctx.ellipse(-15, 48, 12, 18, -Math.PI/6, 0, Math.PI*2); ctx.fill();
        ctx.ellipse(15, 48, 12, 18, Math.PI/6, 0, Math.PI*2); ctx.fill();
    } else {
        ctx.ellipse(-18, 52, 14, 10, 0, 0, Math.PI*2); ctx.fill(); 
        ctx.ellipse(18, 52, 14, 10, 0, 0, Math.PI*2); ctx.fill(); 
    }

    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, -10, 26, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.arc(-22, -26, 11, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(22, -26, 11, 0, Math.PI*2); ctx.fill();

    ctx.beginPath(); ctx.ellipse(-10, -12, 7, 9, -Math.PI/6, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(10, -12, 7, 9, Math.PI/6, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-10, -14, 2.5, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(10, -14, 2.5, 0, Math.PI*2); ctx.fill();

    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.arc(0, -2, 4, 0, Math.PI * 2); ctx.fill();
    
    if (isFreefall) {
        ctx.beginPath(); ctx.arc(0, 5, 4, 0, Math.PI*2); ctx.fill();
    } else if (landed) {
        ctx.beginPath(); ctx.arc(0, 2, 8, 0, Math.PI); ctx.lineWidth = 2; ctx.strokeStyle = '#111827'; ctx.stroke();
    }

    ctx.restore();
}

function gameLoop(time) {
    if (currentState === STATE.PLAYING || currentState === STATE.STARTING) requestAnimationFrame(gameLoop);
    const dt = (time - lastTime) / 1000;
    lastTime = time;
    update(dt);
    draw();
}

btnStart.addEventListener('click', () => {
    initAudio();
    initGame();
});
btnRestart.addEventListener('click', () => {
    initAudio();
    initGame();
});

targetX = gameWidth * 0.2 + Math.random() * gameWidth * 0.6;
altitude = INITIAL_ALTITUDE;
clouds = [];
for(let i=0; i<15; i++) clouds.push(spawnCloud(Math.random() * gameHeight));
coins = [];
diamonds = [];
player.parachuteDeployed = true;
draw();
