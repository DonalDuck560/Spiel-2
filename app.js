if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log(err));
}

// --- SOUND ENGINE ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') { audioCtx.resume(); }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'explosion') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now);
        osc.frequency.linearRampToValueAtTime(10, now + 0.4);
        gain.gain.setValueAtTime(0.3, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
        osc.start(); osc.stop(now + 0.4);
    } else if (type === 'mg') {
        osc.type = 'square'; osc.frequency.setValueAtTime(280, now);
        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.06);
        osc.start(); osc.stop(now + 0.06);
    }
}

function speak(text) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    window.speechSynthesis.speak(utterance);
}

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// DYNAMISCHE GRÖSSENANPASSUNG AN DAS IPHONE
function resizeCanvas() {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
}
window.addEventListener('resize', resizeCanvas);

// --- GAME STATE ---
let hp = 100;
let currentStage = "boot"; 
let screenShake = 0;
let particles = [];
let bullets = [];

const player = { x: 40, y: 100, radius: 10, speed: 3, angle: 0 };
const squad = [
    { x: 25, y: 70, alive: true, name: "Miller" },
    { x: 20, y: 130, alive: true, name: "Jones" }
];

// --- TOUCH & MAUS STEUERUNG ---
let targetTouchX = null;
let targetTouchY = null;
let isTouching = false;

function handleTouch(e) {
    if (e.touches.length > 0) {
        const rect = canvas.getBoundingClientRect();
        targetTouchX = e.touches[0].clientX - rect.left;
        targetTouchY = e.touches[0].clientY - rect.top;
        isTouching = true;
    }
}

canvas.addEventListener("touchstart", (e) => { handleTouch(e); if (audioCtx.state === 'suspended') audioCtx.resume(); }, {passive: true});
canvas.addEventListener("touchmove", (e) => { handleTouch(e); }, {passive: true});
canvas.addEventListener("touchend", () => { isTouching = false; }, {passive: true});

// Zusätzliche PC-Tastatur-Steuerung als Backup
const keys = {};
window.addEventListener("keydown", e => { keys[e.key.toLowerCase()] = true; });
window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

function createExplosion(x, y) {
    playSound('explosion');
    screenShake = 12; 
    for (let i = 0; i < 15; i++) {
        particles.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 5,
            vy: (Math.random() - 0.5) * 5,
            radius: Math.random() * 3 + 2,
            color: Math.random() > 0.5 ? "#ff4500" : "#555555",
            alpha: 1
        });
    }
}

// --- GAME UPDATE ---
function update() {
    if (screenShake > 0) screenShake -= 0.5;

    particles.forEach((p, index) => {
        p.x += p.vx; p.y += p.vy; p.alpha -= 0.02;
        if (p.alpha <= 0) particles.splice(index, 1);
    });

    if (currentStage === "strand" && Math.random() < 0.12) {
        playSound('mg');
        bullets.push({ x: canvas.width, y: Math.random() * canvas.height, speed: 6 });
    }

    bullets.forEach((b, index) => {
        b.x -= b.speed;
        let dist = Math.hypot(player.x - b.x, player.y - b.y);
        if (dist < player.radius) {
            hp -= 5;
            bullets.splice(index, 1);
            document.getElementById("hp-display").innerText = hp;
        }
        if (b.x < 0) bullets.splice(index, 1);
    });

    if (Math.random() < 0.02) {
        let expX = Math.random() * canvas.width;
        let expY = Math.random() * canvas.height;
        if (currentStage === "boot" && expX < 120) expX = 180; 
        createExplosion(expX, expY);
    }

    // BEWEGUNGSLOGIK (Touch priorisiert, Tastatur als Backup)
    let dx = 0, dy = 0, moved = false;

    if (isTouching && targetTouchX !== null && targetTouchY !== null) {
        let angleToTarget = Math.atan2(targetTouchY - player.y, targetTouchX - player.x);
        let distance = Math.hypot(targetTouchX - player.x, targetTouchY - player.y);
        
        if (distance > 5) { // Kleiner Schwellenwert gegen Ruckeln
            dx = Math.cos(angleToTarget) * player.speed;
            dy = Math.sin(angleToTarget) * player.speed;
            moved = true;
        }
    } else {
        if (keys["w"] || keys["arrowup"]) { dy = -player.speed; moved = true; }
        if (keys["s"] || keys["arrowdown"]) { dy = player.speed; moved = true; }
        if (keys["a"] || keys["arrowleft"]) { dx = -player.speed; moved = true; }
        if (keys["d"] || keys["arrowright"]) { dx = player.speed; moved = true; }
    }

    player.x += dx; player.y += dy;
    if (moved) player.angle = Math.atan2(dy, dx);

    // Grenzen im Boot (angepasst an flexible Höhen)
    if (currentStage === "boot") {
        if (player.x < player.radius) player.x = player.radius;
        if (player.x > canvas.width * 0.25) {
            currentStage = "strand";
            document.getElementById("location-display").innerText = "Omaha Beach";
            speak("Die Rampe ist unten! Raus, raus, raus! Sucht Deckung am Strand!");
        }
        if (player.y < canvas.height * 0.25) player.y = canvas.height * 0.25;
        if (player.y > canvas.height * 0.75) player.y = canvas.height * 0.75;
    }

    squad.forEach((m, i) => {
        if (!m.alive) return;
        let targetX = player.x - 25;
        let targetY = player.y + (i === 0 ? -25 : 25);
        m.x += (targetX - m.x) * 0.05;
        m.y += (targetY - m.y) * 0.05;

        if (currentStage === "strand" && m.x > canvas.width * 0.3 && Math.random() < 0.002) {
            m.alive = false;
            speak(`${m.name} wurde getroffen! Sanitäter!`);
        }
    });

    if (hp <= 0) {
        alert("Du bist am Strand gefallen. Das Spiel startet neu.");
        hp = 100; currentStage = "boot"; player.x = 40; player.y = canvas.height / 2;
        squad.forEach(m => { m.alive = true; m.x = player.x - 20; m.y = player.y; });
        document.getElementById("hp-display").innerText = hp;
        document.getElementById("location-display").innerText = "Im Landungsboot";
    }
}

// --- RENDER ---
function draw() {
    ctx.save();
    if (screenShake > 0) {
        ctx.translate((Math.random() - 0.5) * screenShake, (Math.random() - 0.5) * screenShake);
    }

    ctx.fillStyle = currentStage === "boot" ? "#1d2a3a" : "#c2b280";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (currentStage === "boot" || player.x < canvas.width * 0.4) {
        ctx.fillStyle = "#5a6366"; 
        ctx.fillRect(0, canvas.height * 0.25, canvas.width * 0.25, canvas.height * 0.5);
        ctx.fillStyle = "#333b3d";
        ctx.fillRect(canvas.width * 0.25 - 5, canvas.height * 0.25, 5, canvas.height * 0.5);
    }

    particles.forEach(p => {
        ctx.fillStyle = p.color; ctx.globalAlpha = p.alpha;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI*2); ctx.fill();
    });
    ctx.globalAlpha = 1.0;

    ctx.fillStyle = "#ffffff";
    bullets.forEach(b => ctx.fillRect(b.x, b.y, 5, 1.5));

    squad.forEach(m => {
        if (!m.alive) { ctx.fillStyle = "#3a3a3a"; ctx.beginPath(); ctx.arc(m.x, m.y, 8, 0, Math.PI*2); ctx.fill(); return; }
        ctx.fillStyle = "#556b2f"; ctx.beginPath(); ctx.arc(m.x, m.y, 9, 0, Math.PI*2); ctx.fill();
    });

    ctx.fillStyle = "#84cc16";
    ctx.beginPath(); ctx.arc(player.x, player.y, player.radius, 0, Math.PI*2); ctx.fill();
    ctx.restore();
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// Erster Start Setup
resizeCanvas();
player.y = canvas.height / 2;
squad[0].y = player.y - 25;
squad[1].y = player.y + 25;
document.getElementById("location-display").innerText = "Im Landungsboot";
speak("Kopf runter! Wir erreichen gleich den Strand. Macht euch bereit.");
loop();
