// game.js (ES module)
'use strict';

/*
  Enhanced Treasure Dash
  - Modular, readable, commented.
  - Uses canvas with scaling to preserve aspect ratio.
  - Multiple levels, power-ups, sounds, mobile controls.
  - Place images & sounds in same folder as index.html.
*/

/* -------------------------
   CONFIG / CONSTANTS
   ------------------------- */
const CANVAS_BASE_W = 1280;
const CANVAS_BASE_H = 720;

const GRAVITY = 0.7;
const PLAYER_SPEED = 5.0;
const JUMP_V = -14;
const MAX_LEVEL = 6;

/* Asset filenames you should add to folder (examples below):
   player.png, enemy.png, bg1.png, bg2.png, treasure.png,
   power_time.png, power_double.png, power_inv.png,
   platform.png,
   jump.wav, collect.wav, power.wav, win.wav, lose.wav, bgm.mp3
*/

/* -------------------------
   DOM / CANVAS SETUP
   ------------------------- */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');
const timerEl = document.getElementById('timer');
const levelEl = document.getElementById('level');

const mobileControls = document.getElementById('mobileControls');
const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
const btnJump = document.getElementById('btnJump');

const menu = document.getElementById('menu');
const startBtn = document.getElementById('startBtn');
const howBtn = document.getElementById('howBtn');
const muteBtn = document.getElementById('muteBtn');
const howTo = document.getElementById('howTo');

// scale handling
function resizeCanvasToWindow() {
  const containerW = window.innerWidth;
  const containerH = window.innerHeight - 120; // little reserve for HUD/footer
  const baseRatio = CANVAS_BASE_W / CANVAS_BASE_H;
  let w = containerW, h = Math.min(containerH, containerW / baseRatio);
  if (w / h > baseRatio) w = h * baseRatio;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}
window.addEventListener('resize', resizeCanvasToWindow);
resizeCanvasToWindow();

/* -------------------------
   AUDIO (preload)
   ------------------------- */
const audio = {
  bgm: new Audio('bgm.mp3'),
  jump: new Audio('jump.wav'),
  collect: new Audio('collect.wav'),
  power: new Audio('power.wav'),
  win: new Audio('win.wav'),
  lose: new Audio('lose.wav')
};
audio.bgm.loop = true;
let audioEnabled = true;
muteBtn.addEventListener('click', () => {
  audioEnabled = !audioEnabled;
  if (audioEnabled) audio.bgm.play().catch(()=>{});
  else audio.bgm.pause();
  muteBtn.innerText = audioEnabled ? 'Mute Music' : 'Unmute';
});

/* mobile browsers require user gesture - resume audio on first interaction */
function unlockAudioOnUserGesture() {
  if (audioEnabled) {
    audio.bgm.play().catch(()=>{});
  }
  window.removeEventListener('touchstart', unlockAudioOnUserGesture);
  window.removeEventListener('mousedown', unlockAudioOnUserGesture);
}
window.addEventListener('touchstart', unlockAudioOnUserGesture, {once:true});
window.addEventListener('mousedown', unlockAudioOnUserGesture, {once:true});


/* -------------------------
   ASSET LOADING (simple)
   ------------------------- */
const images = {};
const imageFiles = {
  player: 'player.png',
  enemy: 'enemy.png',
  treasure: 'treasure.png',
  platform: 'platform.png',
  bg1: 'bg1.png',
  bg2: 'bg2.png',
  power_time: 'power_time.png',
  power_double: 'power_double.png',
  power_inv: 'power_inv.png'
};

function loadImages(list) {
  const promises = [];
  for (const key in list) {
    const img = new Image();
    img.src = list[key];
    images[key] = img;
    promises.push(new Promise((res, rej) => {
      img.onload = res; img.onerror = () => res(); // resolve even if missing
    }));
  }
  return Promise.all(promises);
}

/* -------------------------
   GAME STATE
   ------------------------- */
let state = {
  running: false,
  paused: false,
  score: 0,
  lives: 3,
  level: 1,
  timer: 60,
  player: null,
  platforms: [],
  treasures: [],
  enemies: [],
  powerups: [],
  activePower: { double: false, inv: false, endTime: 0 },
  keys: { left:false, right:false, up:false },
  lastTime: null,
};

/* -------------------------
   ENTITY CLASSES
   ------------------------- */
class Player {
  constructor(x,y) {
    this.x = x; this.y = y;
    this.w = 48; this.h = 64;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.anim = 0;
  }
  get centerX(){ return this.x + this.w/2; }
  applyPhysics(dt) {
    this.vy += GRAVITY;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // bounds clamp
    if (this.x < 0) this.x = 0;
    if (this.x + this.w > CANVAS_BASE_W) this.x = CANVAS_BASE_W - this.w;
    if (this.y > CANVAS_BASE_H) {
      // fell off map
      loseLife();
    }
  }
  draw(ctx) {
    // if image exists, draw image else fallback rectangle
    if (images.player && images.player.complete && images.player.naturalWidth) {
      ctx.drawImage(images.player, this.x, this.y, this.w, this.h);
    } else {
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(this.x, this.y, this.w, this.h);
    }
  }
}

class Platform {
  constructor(x,y,w,h) { Object.assign(this,{x,y,w,h}); }
  draw(ctx){
    if (images.platform && images.platform.complete && images.platform.naturalWidth) {
      ctx.drawImage(images.platform, this.x, this.y, this.w, this.h);
    } else {
      ctx.fillStyle = '#6b4f2e';
      ctx.fillRect(this.x,this.y,this.w,this.h);
    }
  }
}

/* -------------------------
   LEVEL GENERATOR (data-driven)
   ------------------------- */
function makeLevel(n) {
  // For brevity levels are simple modifications; expand as needed.
  const lvl = { platforms:[], treasures:[], enemies:[], powerups:[], timer:60 - (n-1)*6 };
  // ground
  lvl.platforms.push(new Platform(0, 660, 1280, 60));
  // add platforms depending on level
  for (let i=0;i<4;i++){
    const px = 180 + i*240;
    const py = 520 - i*60 + (n-1)*10; // different heights
    lvl.platforms.push(new Platform(px, py, 180, 18));
    // treasure on some platforms
    if (i < 3) lvl.treasures.push({x:px+70,y:py-32, collected:false});
  }
  // enemies: vary by level
  const enemyCount = Math.min(1 + Math.floor(n/2), 4);
  for (let i=0;i<enemyCount;i++){
    lvl.enemies.push({x:320 + i*180, y:620, w:42, h:42, dir: (i%2?1:-1), speed:1.6 + n*0.25});
  }
  // powerups: occasionally
  if (n % 2 === 0) {
    lvl.powerups.push({x:900, y:420, type: 'time', picked:false});
  }
  if (n >= 3) {
    lvl.powerups.push({x:520, y:300, type: 'double', picked:false});
  }
  if (n >= 5) {
    lvl.powerups.push({x:1080, y:540, type: 'inv', picked:false});
  }

  return lvl;
}

/* -------------------------
   GAME FLOW: start/stop/win/lose
   ------------------------- */
function startLevel(n) {
  // set state
  state.level = n;
  const lvl = makeLevel(n);
  state.platforms = lvl.platforms;
  state.treasures = lvl.treasures;
  state.enemies = lvl.enemies;
  state.powerups = lvl.powerups;
  state.player = new Player(80, 580);
  state.timer = lvl.timer;
  state.activePower = { double: false, inv:false, endTime: 0 };
  state.running = true;
  state.paused = false;
  state.lastTime = performance.now();
  updateHUD();
  if (audioEnabled) audio.bgm.play().catch(()=>{});
  requestAnimationFrame(gameLoop);
}

function nextLevel() {
  if (state.level < MAX_LEVEL) startLevel(state.level + 1);
  else {
    // game won
    if (audioEnabled) audio.win.play().catch(()=>{});
    alert(`You completed all levels! Final score: ${state.score}`);
    resetGame();
    menu.classList.remove('hidden');
  }
}

function resetGame() {
  state.running = false;
  state.score = 0;
  state.lives = 3;
  state.level = 1;
  updateHUD();
}

/* -------------------------
   HUD update
   ------------------------- */
function updateHUD(){
  scoreEl.innerText = `Score: ${state.score}`;
  livesEl.innerText = `Lives: ${state.lives}`;
  timerEl.innerText = `Time: ${Math.max(0, Math.floor(state.timer))}`;
  levelEl.innerText = `Level: ${state.level}`;
}

/* -------------------------
   COLLISIONS
   ------------------------- */
function rectIntersect(a,b){
  return a.x < b.x + (b.w||20) &&
         a.x + (a.w||20) > b.x &&
         a.y < b.y + (b.h||20) &&
         a.y + (a.h||20) > b.y;
}

/* -------------------------
   LIVES / TIMER HANDLING
   ------------------------- */
function loseLife(){
  state.lives -= 1;
  if (audioEnabled) audio.lose.play().catch(()=>{});
  if (state.lives <= 0) {
    alert(`Game Over! Score: ${state.score}`);
    resetGame();
    menu.classList.remove('hidden');
    if (audioEnabled) audio.bgm.pause();
  } else {
    // restart current level
    startLevel(state.level);
  }
}

/* -------------------------
   GAME LOOP
   ------------------------- */
function gameLoop(ts) {
  if (!state.running || state.paused) return;
  const dt = Math.min( (ts - (state.lastTime||ts)) / (1000/60), 4 ); // dt in game ticks (rough)
  state.lastTime = ts;

  // handle inputs
  let horizontal = 0;
  if (state.keys.left) horizontal -= 1;
  if (state.keys.right) horizontal += 1;
  state.player.vx = horizontal * PLAYER_SPEED;

  // jump
  if (state.keys.up && state.player.onGround) {
    state.player.vy = JUMP_V;
    state.player.onGround = false;
    if (audioEnabled) audio.jump.play().catch(()=>{});
  }

  // physics
  state.player.applyPhysics(dt);

  // simple platform collision (AABB)
  state.player.onGround = false;
  for (const p of state.platforms) {
    if (rectIntersect(state.player, p)) {
      // landing check
      const prevBottom = state.player.y + state.player.h - state.player.vy

