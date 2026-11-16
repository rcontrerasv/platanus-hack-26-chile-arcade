// LIMPIAVIDRIOS vs EL DRON — Platanus Hack 26 Santiago
// Cuélgate, balancéate y sube la torre más rápido que el smog. El dron quiere tu pega.

const W = 800, H = 600;

// DO NOT replace existing keys — they match the physical arcade cabinet wiring.
// To add local testing shortcuts, append extra keys to any array.
const CABINET_KEYS = {
  P1_U: ['w'], P1_D: ['s'], P1_L: ['a'], P1_R: ['d'],
  P1_1: ['u'], P1_2: ['i'], P1_3: ['o'],
  P1_4: ['j'], P1_5: ['k'], P1_6: ['l'],
  P2_U: ['ArrowUp'], P2_D: ['ArrowDown'], P2_L: ['ArrowLeft'], P2_R: ['ArrowRight'],
  P2_1: ['r'], P2_2: ['t'], P2_3: ['y'],
  P2_4: ['f'], P2_5: ['g'], P2_6: ['h'],
  START1: ['Enter'], START2: ['2'],
};

const KEY_TO_ARCADE = {};
for (const [code, keys] of Object.entries(CABINET_KEYS)) {
  for (const k of keys) KEY_TO_ARCADE[k.length === 1 ? k.toLowerCase() : k] = code;
}
const held = Object.create(null), just = Object.create(null);
let AC = null, master = null, noiseBuf = null;
window.addEventListener('keydown', (e) => {
  const c = KEY_TO_ARCADE[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (c) { if (!held[c]) just[c] = true; held[c] = true; }
  if (AC && AC.state === 'suspended') AC.resume();
});
window.addEventListener('keyup', (e) => {
  const c = KEY_TO_ARCADE[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (c) held[c] = false;
});
const BTN = ['1', '2', '3', '4', '5', '6'];
const btnHeld = (k) => BTN.some((b) => held[k + '_' + b]);
const btnJust = (k) => BTN.some((b) => just[k + '_' + b]);
const anyJust = () => just.START1 || just.START2 || btnJust('P1') || btnJust('P2');

// ---------- Storage ----------
const store = {
  async get(k) {
    try {
      if (window.platanusArcadeStorage) return await window.platanusArcadeStorage.get(k);
      const r = localStorage.getItem(k);
      return r == null ? { found: false } : { found: true, value: JSON.parse(r) };
    } catch (e) { return { found: false }; }
  },
  async set(k, v) {
    try {
      if (window.platanusArcadeStorage) return await window.platanusArcadeStorage.set(k, v);
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { /* ignore */ }
  },
};
const BKEY = 'limpiavidrios-top10-v1';
let board = [];

// ---------- Audio ----------
function tone(f, d, type, v, f2, delay) {
  if (!AC || AC.state !== 'running') return;
  const t = AC.currentTime + (delay || 0);
  const o = AC.createOscillator(), gn = AC.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  gn.gain.setValueAtTime(v || 0.1, t);
  gn.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(gn); gn.connect(master);
  o.start(t); o.stop(t + d + 0.02);
}
function noise(d, v, fq, delay) {
  if (!AC || AC.state !== 'running') return;
  if (!noiseBuf) {
    noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const t = AC.currentTime + (delay || 0);
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), gn = AC.createGain();
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = fq || 1000;
  gn.gain.setValueAtTime(v, t); gn.gain.exponentialRampToValueAtTime(0.001, t + d);
  s.connect(f); f.connect(gn); gn.connect(master);
  s.start(t, Math.random() * 0.5); s.stop(t + d);
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const SFX = {
  grab: () => { tone(700, 0.07, 'square', 0.06, 1500); },
  rel: () => { tone(260, 0.12, 'triangle', 0.07, 520); },
  clean: (c) => { const f = mtof(76 + Math.min(c, 14)); tone(f, 0.09, 'square', 0.05); tone(f * 1.5, 0.12, 'sine', 0.06, 0, 0.05); },
  mult: () => { [0, 4, 7, 12].forEach((n, i) => tone(mtof(72 + n), 0.1, 'square', 0.05, 0, i * 0.05)); },
  hit: () => { noise(0.35, 0.35, 900); tone(220, 0.3, 'sawtooth', 0.08, 60); },
  near: () => { tone(1800, 0.05, 'sine', 0.05, 2400); },
  warn: () => { tone(880, 0.08, 'square', 0.05); tone(660, 0.08, 'square', 0.05, 0, 0.1); },
  boom: () => { noise(0.9, 0.5, 300); tone(120, 0.6, 'sawtooth', 0.12, 30); },
  bhit: () => { noise(0.2, 0.4, 2000); tone(160, 0.2, 'square', 0.12, 50); },
  die: () => { tone(440, 0.9, 'sawtooth', 0.1, 50); noise(0.8, 0.2, 400); },
  sel: () => { tone(990, 0.05, 'square', 0.05); },
  shot: () => { noise(0.08, 0.12, 3000); },
};
let seqT = 0, step = 0;
function music() {
  if (!AC || AC.state !== 'running') return;
  const boss = !!S.boss;
  const spb = 60 / (boss ? 150 : 124) / 4;
  if (seqT < AC.currentTime) seqT = AC.currentTime + 0.05;
  while (seqT < AC.currentTime + 0.15) {
    const s = step % 16, bar = Math.floor(step / 16) % 4, dl = seqT - AC.currentTime;
    const root = [0, -4, -2, -5][bar];
    if (s % 2 === 0) tone(mtof(40 + root + (s % 4 === 2 ? 12 : 0)), spb * 1.8, 'triangle', 0.09, 0, dl);
    if (S.mode === 'play' && (s === 0 || s === 3 || s === 6 || s === 10 || s === 12)) {
      tone(mtof(64 + root + [0, 3, 7, 10, 12][(s + bar) % 5]), spb * 0.9, 'square', 0.022, 0, dl);
    }
    if (s % 4 === 2) noise(0.03, boss ? 0.06 : 0.025, 7000, dl);
    if (boss && s % 8 === 4) noise(0.1, 0.1, 400, dl);
    seqT += spb; step++;
  }
}

// ---------- Helpers ----------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const lerpC = (a, b, t) => {
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  return ((ar + ((b >> 16) - ar) * t) << 16) | ((ag + (((b >> 8) & 255) - ag) * t) << 8) | (ab + ((b & 255) - ab) * t);
};
const PCOL = [0xffd23f, 0xff5fa2];
const PHEX = ['#ffd23f', '#ff5fa2'];
const ZONES = [
  [0, 0x4fa3e0, 0xc4e8ff, 0xffffff, 'MAÑANA EN PROVIDENCIA'],
  [150, 0x2f7fd0, 0xffe3a8, 0xfff0d8, 'HORA DE COLACIÓN'],
  [300, 0x5b3f8c, 0xff8a5c, 0xffc0a0, '¡SUPERASTE EL COSTANERA!'],
  [450, 0x0b0f2e, 0x40306a, 0x7080c0, 'NOCHE DE SMOG'],
  [600, 0x15171f, 0x3a4150, 0x7a8696, 'TORMENTA ANDINA'],
  [800, 0x000000, 0x120a30, 0x8070d0, '¿ESTO ES EL ESPACIO?'],
];
const MPX = 20; // pixels per meter
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const S = { mode: 'title' };
let SC, g, bg, fxg, hud, cam;

function T(x, y, s, size, col, fixed) {
  const t = SC.add.text(x, y, s, {
    fontFamily: 'monospace', fontSize: size + 'px', color: col || '#fff', fontStyle: 'bold',
    stroke: '#000', strokeThickness: Math.max(3, size / 5), align: 'center',
  }).setOrigin(0.5);
  if (fixed !== false) t.setScrollFactor(0);
  return t;
}

new Phaser.Game({
  type: Phaser.AUTO, width: W, height: H, parent: 'game-root', backgroundColor: '#4fa3e0',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: { create, update },
});

function makeTextures(sc) {
  const t = sc.add.graphics();
  // Glass facade panel
  for (let i = 0; i < 80; i += 4) { t.fillStyle(lerpC(0xa8dcf5, 0x3a78a8, i / 80), 0.86); t.fillRect(0, i, 100, 4); }
  t.fillStyle(0xffffff, 0.22);
  t.fillTriangle(10, 80, 55, 0, 75, 0); t.fillTriangle(10, 80, 75, 0, 30, 80);
  t.fillStyle(0xffffff, 0.12); t.fillTriangle(60, 80, 95, 20, 100, 30);
  t.fillStyle(0x56606c); t.fillRect(0, 0, 100, 4); t.fillRect(0, 0, 4, 80);
  t.fillStyle(0x9aa6b2); t.fillRect(0, 4, 100, 1); t.fillRect(4, 0, 1, 80);
  t.generateTexture('fac', 100, 80); t.clear();
  // Andes
  t.fillStyle(0x6f86a8);
  t.beginPath(); t.moveTo(0, 260);
  const pk = [[0, 150], [70, 90], [130, 140], [210, 50], [290, 120], [360, 70], [430, 130], [520, 40], [600, 115], [680, 60], [750, 110], [800, 80], [800, 260]];
  pk.forEach((p) => t.lineTo(p[0], p[1])); t.closePath(); t.fillPath();
  t.fillStyle(0xf4f8ff);
  for (let i = 1; i < pk.length - 2; i++) {
    const [x, y] = pk[i];
    if (y < 100) t.fillTriangle(x, y, x - 22, y + 26, x + 22, y + 26);
  }
  t.generateTexture('mtn', 800, 260); t.clear();
  // City skyline
  for (let x = 0; x < 800;) {
    const w = 30 + Math.random() * 50, h = 40 + Math.random() * 130;
    t.fillStyle(0x3d4f66); t.fillRect(x, 200 - h, w, h);
    t.fillStyle(0xbfd7ee, 0.5);
    for (let yy = 200 - h + 8; yy < 195; yy += 12) for (let xx = x + 5; xx < x + w - 6; xx += 10) if (Math.random() < 0.5) t.fillRect(xx, yy, 4, 5);
    x += w + 2;
  }
  t.generateTexture('city', 800, 200);
  t.destroy();
}

function create() {
  SC = this; cam = this.cameras.main;
  AC = this.sound.context || null;
  if (AC) { master = AC.createGain(); master.gain.value = 0.7; master.connect(AC.destination); }
  makeTextures(this);
  bg = this.add.graphics().setScrollFactor(0);
  S.stars = [];
  for (let i = 0; i < 70; i++) S.stars.push([Math.random() * W, Math.random() * H, Math.random()]);
  S.mtn = this.add.image(400, 300, 'mtn').setOrigin(0.5, 0).setScrollFactor(0);
  S.city = this.add.image(400, 400, 'city').setOrigin(0.5, 0).setScrollFactor(0);
  S.fac = this.add.tileSprite(400, 300, 560, 600, 'fac').setScrollFactor(0);
  g = this.add.graphics();
  fxg = this.add.graphics().setScrollFactor(0);
  hud = this.add.graphics().setScrollFactor(0);
  S.ui = [];
  S.hudT = [];
  S.banner = T(400, 230, '', 34, '#fff').setDepth(20).setAlpha(0);
  S.sub = T(400, 272, '', 18, '#ffe9a0').setDepth(20).setAlpha(0);
  store.get(BKEY).then((r) => {
    if (r && r.found && Array.isArray(r.value)) {
      board = r.value.filter((e) => e && typeof e.n === 'string' && typeof e.s === 'number').slice(0, 10);
    }
    if (S.mode === 'title') showTitle();
  });
  showTitle();
}

function clearUI() { S.ui.forEach((t) => t.destroy()); S.ui = []; }
function ui(t) { S.ui.push(t); return t; }

function boardText(n) {
  if (!board.length) return 'SIN RÉCORDS AÚN\n¡SÉ EL PRIMERO!';
  return board.slice(0, n).map((e, i) => `${String(i + 1).padStart(2)}. ${e.n.padEnd(3)} ${String(e.s).padStart(7)}  ${String(e.h || 0).padStart(4)}m`).join('\n');
}

function showTitle() {
  clearUI();
  S.mode = 'title'; S.boss = null; S.t = 0;
  cam.scrollY = 0;
  ui(T(400, 70, 'LIMPIAVIDRIOS', 64, '#ffd23f'));
  ui(T(400, 122, 'vs. EL DRON', 30, '#7fe3ff'));
  ui(T(400, 160, 'Sube la torre. Escapa del smog. Defiende tu pega.', 15, '#fff'));
  ui(T(400, 215, '— TOP 10 —', 18, '#ffd23f'));
  ui(T(400, 320, boardText(10), 15, '#fff')).setLineSpacing(2);
  S.blink = ui(T(400, 445, '1P: START   ·   2P: START 2', 24, '#fff'));
  ui(T(400, 500, 'MANTÉN BOTÓN: engancharte   ·   SUELTA: volar\n← → balanceo   ·   ↑ ↓ recoger / soltar cuerda', 15, '#cfefff')).setLineSpacing(4);
  ui(T(400, 565, 'Encadena enganches y limpia manchas para multiplicar', 13, '#ffe9a0'));
}

// ---------- Game setup ----------
function newPlayer(i, n) {
  return {
    i, k: i ? 'P2' : 'P1', x: n === 1 ? 400 : 360 + i * 80, y: -14, vx: 0, vy: 0,
    att: null, len: 100, alive: true, stun: 0, inv: 0, combo: 0, mult: 1, score: 0,
    maxH: 0, air: 0, hang: 0, onStart: true, lastA: null, lastT: 0, ang: 0, nm: 0,
  };
}

function startGame(n) {
  clearUI();
  S.mode = 'play'; S.n = n; S.t = 0;
  S.players = [newPlayer(0, n)];
  if (n === 2) S.players.push(newPlayer(1, n));
  S.anchors = []; S.spots = []; S.pigs = []; S.drones = []; S.drops = []; S.wins = []; S.parts = [];
  S.genY = -40; S.pathX = 400;
  S.smogY = 420; S.bestY = 0; S.started = false;
  S.wind = 0; S.windT = 9; S.windDir = 1; S.windOn = 0;
  S.pigT = 4; S.droneT = 12; S.winT = 7;
  S.boss = null; S.bossN = 0; S.nextBoss = 150;
  S.zone = 0; S.shake = 0; S.stop = 0; S.dieT = 0;
  S.flash = 0;
  cam.scrollY = -300;
  genAnchors(-1200);
  S.tut = [
    ui(T(400, -120, 'MANTÉN UN BOTÓN PARA ENGANCHARTE', 20, '#fff', false)),
    ui(T(400, -90, 'SUELTA PARA SALIR VOLANDO · ← → PARA BALANCEARTE', 15, '#ffe9a0', false)),
  ];
  makeHud();
  banner(ZONES[0][4], n === 2 ? '¡CARRERA A LA CIMA!' : '¡QUE NO TE ALCANCE EL SMOG!');
}

function makeHud() {
  S.hudT.forEach((t) => t.destroy());
  S.hudT = [];
  S.players.forEach((p, i) => {
    const x = S.n === 1 ? 90 : i ? 700 : 100;
    p.tH = T(x, 26, '0 m', 30, PHEX[i]);
    p.tS = T(x, 56, '0', 18, '#fff');
    p.tC = T(S.n === 1 ? 400 : i ? 560 : 240, 30, '', 26, '#fff');
    S.hudT.push(p.tH, p.tS, p.tC);
  });
  if (S.n === 1) {
    S.tBest = T(710, 26, 'RÉCORD\n' + (board[0] ? board[0].s : 0), 15, '#ffe9a0');
    S.hudT.push(S.tBest);
  }
}

function genAnchors(toY) {
  while (S.genY > toY) {
    const lvl = Math.min(1, -S.genY / 14000);
    S.genY -= rnd(80, 115 + lvl * 25);
    const prevX = S.pathX;
    S.pathX = clamp(S.pathX + rnd(-1, 1) * (150 + lvl * 60), 140, 660);
    S.anchors.push({ x: S.pathX, y: S.genY });
    if (Math.random() < 0.6 - lvl * 0.25) {
      S.anchors.push({ x: clamp(S.pathX + (Math.random() < 0.5 ? -1 : 1) * rnd(160, 300), 140, 660), y: S.genY + rnd(-25, 15) });
    }
    if (Math.random() < 0.55) {
      const cnt = Math.random() < 0.3 ? 3 : 1;
      for (let i = 0; i < cnt; i++) {
        const t = (i + 1) / (cnt + 1);
        S.spots.push({ x: prevX + (S.pathX - prevX) * t + rnd(-30, 30), y: S.genY + 60 - t * 40 + rnd(-10, 10), r: rnd(9, 14), s: Math.random() * 6 });
      }
    }
  }
}

function banner(a, b) {
  S.banner.setText(a).setAlpha(1).setScale(0.3);
  S.sub.setText(b || '').setAlpha(1);
  SC.tweens.killTweensOf([S.banner, S.sub]);
  SC.tweens.add({ targets: S.banner, scale: 1, duration: 350, ease: 'Back.Out' });
  SC.tweens.add({ targets: [S.banner, S.sub], alpha: 0, delay: 2000, duration: 500 });
}

function pop(x, y, s, col, size) {
  const t = T(x, y, s, size || 18, col || '#fff', false).setDepth(15);
  SC.tweens.add({ targets: t, y: y - 50, alpha: 0, duration: 900, ease: 'Cubic.Out', onComplete: () => t.destroy() });
}

function burst(x, y, col, n, sp, life) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283, v = rnd(0.3, 1) * (sp || 200);
    S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, l: life || 0.6, m: life || 0.6, c: col, s: rnd(2, 5) });
  }
}

function meters(y) { return Math.max(0, Math.floor(-y / MPX)); }

function addScore(p, v) { p.score += Math.round(v); }

// ---------- Player ----------
function target(p) {
  let best = null, bs = -1e9;
  const fx = p.x + p.vx * 0.2;
  for (const a of S.anchors) {
    if (a === p.lastA && S.t - p.lastT < 0.35) continue;
    const dx = a.x - p.x, dy = a.y - p.y;
    if (dy > 30) continue;
    const d = Math.hypot(dx, dy);
    if (d > 250 || d < 25) continue;
    const sc = -dy - 0.45 * Math.abs(a.x - fx);
    if (sc > bs) { bs = sc; best = a; }
  }
  return best;
}

function attach(p, a) {
  if (!p.onStart && p.air > 0.22) {
    p.combo++;
    const m = Math.min(10, 1 + Math.floor(p.combo / 3));
    if (m > p.mult) { SFX.mult(); pop(p.x, p.y - 30, 'x' + m + '!', '#ffd23f', 28); }
    p.mult = m;
  }
  if (p.onStart) {
    p.onStart = false;
    if (!S.started) { S.started = true; S.tut.forEach((t) => SC.tweens.add({ targets: t, alpha: 0, duration: 800 })); }
  }
  p.att = a; p.len = clamp(Math.hypot(p.x - a.x, p.y - a.y), 40, 260); p.hang = 0;
  burst(a.x, a.y, 0xffffff, 6, 120, 0.3);
  SFX.grab();
}

function release(p) {
  p.lastA = p.att; p.lastT = S.t; p.att = null; p.air = 0;
  if (p.vy < 0) { p.vx *= 1.08; p.vy *= 1.18; }
  SFX.rel();
}

function loseCombo(p, msg) {
  if (p.combo >= 3 && msg) pop(p.x, p.y - 30, msg || 'COMBO PERDIDO', '#ff7a7a', 16);
  p.combo = 0; p.mult = 1;
}

function hit(p, fx, fy, msg) {
  if (p.inv > 0 || !p.alive) return;
  if (p.att) { p.lastA = p.att; p.lastT = S.t; }
  p.att = null; p.stun = 0.45; p.inv = 1.3; p.air = 0;
  p.vx = fx; p.vy = fy;
  loseCombo(p, '');
  pop(p.x, p.y - 30, msg, '#7fe3ff', 22);
  burst(p.x, p.y, 0x7fe3ff, 16, 260, 0.6);
  S.shake = 0.3; SFX.hit();
}

function stepPlayer(p, dt) {
  const k = p.k;
  const L = held[k + '_L'] ? 1 : 0, R = held[k + '_R'] ? 1 : 0;
  const grab = btnHeld(k);
  p.stun -= dt; p.inv -= dt;
  if (p.onStart) {
    p.ang = Math.sin(S.t * 3) * 0.05;
    if (grab) { const a = target(p); if (a) attach(p, a); }
    return;
  }
  let ax = S.wind, ay = 980;
  if (p.att) {
    ax += (R - L) * 760;
    if (held[k + '_U']) p.len = Math.max(36, p.len - 240 * dt);
    if (held[k + '_D']) p.len = Math.min(280, p.len + 240 * dt);
    p.hang += dt;
    if (p.hang > 2.6 && p.combo > 0) loseCombo(p, '¡MUÉVETE!');
    if (!grab) release(p);
  } else {
    ax += (R - L) * 320;
    p.air += dt;
    if (grab && p.stun <= 0) { const a = target(p); if (a) attach(p, a); }
  }
  p.vx += ax * dt; p.vy += ay * dt;
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > 950) { p.vx *= 950 / sp; p.vy *= 950 / sp; }
  p.vx *= 1 - 0.25 * dt;
  p.x += p.vx * dt; p.y += p.vy * dt;
  if (p.att) {
    const dx = p.x - p.att.x, dy = p.y - p.att.y, d = Math.hypot(dx, dy);
    if (d > p.len) {
      const nx = dx / d, ny = dy / d;
      p.x = p.att.x + nx * p.len; p.y = p.att.y + ny * p.len;
      const vr = p.vx * nx + p.vy * ny;
      if (vr > 0) { p.vx -= vr * nx; p.vy -= vr * ny; }
    }
    p.ang = Math.atan2(p.att.x - p.x, p.y - p.att.y);
  } else {
    p.ang += (clamp(p.vx / 900, -0.6, 0.6) - p.ang) * dt * 5;
  }
  if (p.x < 18) { p.x = 18; p.vx = Math.abs(p.vx) * 0.5; }
  if (p.x > 782) { p.x = 782; p.vx = -Math.abs(p.vx) * 0.5; }

  // height score
  const m = meters(p.y);
  if (m > p.maxH) { addScore(p, (m - p.maxH) * 10 * p.mult); p.maxH = m; }
  if (p.y < S.bestY) S.bestY = p.y;

  // clean spots
  for (const s of S.spots) {
    if (!s.c && Math.abs(s.x - p.x) < 26 && Math.abs(s.y - p.y) < 28) {
      s.c = true;
      addScore(p, 50 * p.mult);
      pop(s.x, s.y, '+' + 50 * p.mult, '#bfffd0', 15);
      burst(s.x, s.y, 0xffffff, 8, 140, 0.5);
      SFX.clean(p.combo);
    }
  }
}

function drawGuy(p) {
  const x = p.x, y = p.y, c = Math.cos(p.ang), s = Math.sin(p.ang);
  const P = (dx, dy) => [x + dx * c - dy * s, y + dx * s + dy * c];
  const blink = p.inv > 0 && Math.floor(S.t * 20) % 2;
  if (blink) return;
  const col = PCOL[p.i];
  // legs
  g.lineStyle(4, 0x24477a);
  const sw = Math.sin(S.t * 10) * (p.att ? 2 : 6);
  let a = P(-3, 6), b = P(-5 + sw, 18); g.lineBetween(a[0], a[1], b[0], b[1]);
  a = P(3, 6); b = P(5 - sw, 18); g.lineBetween(a[0], a[1], b[0], b[1]);
  // body
  g.fillStyle(0x2e6bb8);
  const q = [P(-7, -8), P(7, -8), P(6, 8), P(-6, 8)];
  g.fillPoints(q.map((v) => ({ x: v[0], y: v[1] })), true);
  // harness
  g.lineStyle(2, 0xff7b00); a = P(-6, -7); b = P(6, 6); g.lineBetween(a[0], a[1], b[0], b[1]);
  // arms
  g.lineStyle(3, 0xf2c39b);
  a = P(-6, -6); b = P(-4, -20); g.lineBetween(a[0], a[1], b[0], b[1]);
  a = P(6, -6); b = P(14, 0); g.lineBetween(a[0], a[1], b[0], b[1]);
  // squeegee
  g.lineStyle(3, 0x333333); const e1 = P(14, -6), e2 = P(14, 6); g.lineBetween(e1[0], e1[1], e2[0], e2[1]);
  // head + helmet
  const h = P(0, -14);
  g.fillStyle(0xf2c39b); g.fillCircle(h[0], h[1], 6);
  g.fillStyle(col); g.slice(h[0], h[1], 7.5, p.ang + Math.PI, p.ang + 2 * Math.PI, false); g.fillPath();
  g.fillStyle(0x000000); const ey = P(3, -14); g.fillCircle(ey[0], ey[1], 1.3);
}

// ---------- Hazards ----------
function leader() {
  let l = null;
  for (const p of S.players) if (p.alive && (!l || p.y < l.y)) l = p;
  return l || S.players[0];
}
function nearest(x, y) {
  let b = null, bd = 1e9;
  for (const p of S.players) {
    if (!p.alive) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; b = p; }
  }
  return b;
}

function spawnHazards(dt) {
  const m = meters(S.bestY), top = cam.scrollY;
  if (!S.started) return;
  // pigeons
  if (m > 25 && (S.pigT -= dt) <= 0) {
    S.pigT = rnd(2.2, 4.5) - Math.min(1.5, m / 400);
    const d = Math.random() < 0.5 ? 1 : -1;
    S.pigs.push({ x: d > 0 ? -30 : 830, y: top + rnd(60, 360), vx: d * rnd(120, 190 + m * 0.2), t: Math.random() * 9, nm: 0 });
  }
  // windows that open
  if (m > 50 && (S.winT -= dt) <= 0) {
    S.winT = rnd(3.5, 6.5) - Math.min(2, m / 300);
    const L = leader();
    const col = clamp(Math.floor((L.x - 120 + rnd(-150, 150)) / 100), 0, 4);
    const row = Math.floor((L.y - rnd(140, 300)) / 80);
    S.wins.push({ x: 120 + col * 100, y: row * 80, t: 0 });
    SFX.warn();
  }
  // mini drones
  if (m > 70 && !S.boss && (S.droneT -= dt) <= 0) {
    S.droneT = rnd(6, 10) - Math.min(3, m / 250);
    const d = Math.random() < 0.5 ? 1 : -1;
    S.drones.push({ x: d > 0 ? -30 : 830, y: top + rnd(50, 200), vx: d * rnd(70, 110), ft: rnd(1, 2), t: 0 });
  }
  // wind gusts
  if (m > 90) {
    S.windT -= dt;
    if (S.windT <= 0 && S.windOn <= 0) {
      S.windDir = Math.random() < 0.5 ? -1 : 1;
      S.windOn = 2.6;
      S.windT = rnd(7, 11);
      pop(400, cam.scrollY + 150, S.windDir > 0 ? 'VIENTO  ⟶' : '⟵  VIENTO', '#e8f4ff', 26);
      noise(2.6, 0.12, 500);
    }
  }
  if (S.windOn > 0) {
    S.windOn -= dt;
    const storm = m > 600 ? 1.6 : 1;
    S.wind = S.windDir * (380 + Math.min(300, m * 0.5)) * storm * Math.min(1, S.windOn * 2);
  } else S.wind = 0;
  // boss
  if (!S.boss && m >= S.nextBoss) spawnBoss();
}

function spawnBoss() {
  S.bossN++;
  const lv = S.bossN, hp = 3 + lv;
  S.boss = { x: 400, y: cam.scrollY - 80, hy: leader().y - 230, hp, max: hp, lv, t: 0, atk: 2, tele: 0, burst: 0, bt: 0, ang: 0, inv: 0, rot: 0 };
  banner('⚠ DRON LIMPIADOR ' + (2999 + lv) + ' ⚠', ['"Tu pega ahora es mía."', '"Yo no pido colación."', '"Trabajo 24/7, sin contrato."', '"Me actualizaron."'][(lv - 1) % 4]);
  SFX.warn(); SFX.warn();
}

function fireDrop(x, y, a, sp) {
  S.drops.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, l: 3, nm: {} });
}

function updBoss(dt) {
  const b = S.boss; if (!b) return;
  b.t += dt; b.inv -= dt; b.rot += dt * 40;
  const L = leader();
  if (b.leave) {
    b.y -= 300 * dt;
    if (b.y < cam.scrollY - 200) S.boss = null;
    return;
  }
  b.x += (clamp(L.x, 140, 660) - b.x) * dt * (0.9 + b.lv * 0.1);
  if (L.y < b.hy + 30) b.hy = Math.min(b.hy, L.y - 230);
  b.hy = Math.max(b.hy, cam.scrollY + 90);
  b.y += (b.hy + Math.sin(b.t * 2) * 25 - b.y) * dt * 2.5;
  if (b.tele > 0) {
    b.tele -= dt;
    if (b.tele <= 0) { b.burst = 6 + b.lv; b.bt = 0; }
  } else if (b.burst > 0) {
    b.bt -= dt;
    if (b.bt <= 0) {
      b.bt = 0.07; b.burst--;
      const sp = 430 + b.lv * 20;
      fireDrop(b.x, b.y + 10, b.ang, sp);
      if (b.hp <= b.max / 2) { fireDrop(b.x, b.y + 10, b.ang + 0.35, sp); fireDrop(b.x, b.y + 10, b.ang - 0.35, sp); }
      SFX.shot();
    }
  } else if ((b.atk -= dt) <= 0) {
    b.atk = Math.max(0.7, 1.9 - b.lv * 0.2);
    const p = nearest(b.x, b.y);
    if (p) { b.ang = Math.atan2(p.y - b.y, p.x - b.x); b.tele = 0.65; SFX.warn(); }
  }
  for (const p of S.players) {
    if (!p.alive || p.onStart) continue;
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
    if (d < 40) {
      const sp = Math.hypot(p.vx, p.vy), nx = dx / d, ny = dy / d;
      if (sp > 250 && b.inv <= 0) {
        b.hp--; b.inv = 0.5; b.hy = L.y - 250;
        p.vx = nx * 420; p.vy = ny * 420 + 80;
        addScore(p, 500 * p.mult);
        pop(b.x, b.y - 40, '¡TOMA! +' + 500 * p.mult, '#ffd23f', 22);
        burst(b.x, b.y, 0xffffff, 18, 300, 0.5);
        S.shake = 0.35; S.stop = 0.07; SFX.bhit();
        if (b.hp <= 0) killBoss(p);
        return;
      } else if (b.inv <= 0) {
        hit(p, nx * 380, ny * 300 + 150, '¡SPLASH!');
      }
    }
  }
  if (b.t > 38) {
    b.leave = true; S.nextBoss = meters(S.bestY) + 220;
    banner('EL DRON SE FUE', '...a cobrar tu sueldo');
  }
}

function killBoss(p) {
  const b = S.boss;
  const bonus = 3000 * b.lv * p.mult;
  addScore(p, bonus);
  burst(b.x, b.y, 0xffffff, 40, 450, 1);
  burst(b.x, b.y, 0xff7b00, 30, 350, 0.9);
  burst(b.x, b.y, 0x7fe3ff, 30, 250, 1.1);
  S.shake = 0.8; S.flash = 0.5; SFX.boom();
  banner('¡LA PEGA ES NUESTRA!', '+' + bonus + '  —  ' + (S.n === 2 ? 'JUGADOR ' + (p.i + 1) : 'DRON DESTRUIDO'));
  S.boss = null; S.nextBoss = meters(S.bestY) + 220;
  S.drops = [];
}

function updHazards(dt) {
  const top = cam.scrollY;
  for (const q of S.pigs) {
    q.t += dt; q.x += q.vx * dt; q.y += Math.sin(q.t * 4) * 30 * dt;
    for (const p of S.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < 20) hit(p, Math.sign(q.vx) * 340, -60, '¡PALOMA!');
      else if (d < 40 && !(q.nm & (1 << p.i)) && p.inv <= 0) { q.nm |= 1 << p.i; nearMiss(p, q.x, q.y); }
    }
  }
  S.pigs = S.pigs.filter((q) => q.x > -60 && q.x < 860 && q.y < top + H + 100);

  for (const w of S.wins) {
    w.t += dt;
    if (w.t > 0.9 && w.t < 2.5) {
      for (const p of S.players) {
        if (p.alive && p.x > w.x - 6 && p.x < w.x + 106 && p.y > w.y - 6 && p.y < w.y + 86) {
          hit(p, (p.x < w.x + 50 ? -1 : 1) * 360, 40, '¡OIGA, CUIDADO!');
        }
      }
    }
  }
  S.wins = S.wins.filter((w) => w.t < 2.6);

  for (const d of S.drones) {
    d.t += dt; d.x += d.vx * dt; d.y += Math.sin(d.t * 3) * 20 * dt;
    d.ft -= dt;
    if (d.ft <= 0) {
      const p = nearest(d.x, d.y);
      if (p) { fireDrop(d.x, d.y, Math.atan2(p.y - d.y, p.x - d.x), 300); SFX.shot(); }
      d.ft = 2.4;
    }
    for (const p of S.players) {
      if (!p.alive) continue;
      const dd = Math.hypot(p.x - d.x, p.y - d.y);
      if (dd < 26) {
        if (Math.hypot(p.vx, p.vy) > 240) {
          d.dead = true; addScore(p, 200 * p.mult);
          pop(d.x, d.y, 'DRON FUERA +' + 200 * p.mult, '#ffd23f', 16);
          burst(d.x, d.y, 0xdddddd, 18, 250, 0.6); SFX.bhit(); S.shake = 0.2;
        } else hit(p, Math.sign(p.x - d.x || 1) * 300, 100, '¡SPLASH!');
      }
    }
  }
  S.drones = S.drones.filter((d) => !d.dead && d.x > -60 && d.x < 860 && d.y < top + H + 100);

  for (const o of S.drops) {
    o.x += o.vx * dt; o.y += o.vy * dt; o.vy += 120 * dt; o.l -= dt;
    for (const p of S.players) {
      if (!p.alive) continue;
      const d = Math.hypot(p.x - o.x, p.y - o.y);
      if (d < 15) { o.l = 0; hit(p, o.vx * 0.7, o.vy * 0.7 + 100, '¡SPLASH!'); }
      else if (d < 38 && !o.nm[p.i] && p.inv <= 0) { o.nm[p.i] = 1; nearMiss(p, o.x, o.y); }
    }
  }
  S.drops = S.drops.filter((o) => o.l > 0);
}

function nearMiss(p, x, y) {
  if (p.onStart) return;
  addScore(p, 25 * p.mult);
  pop(x, y - 10, '¡CERCA! +' + 25 * p.mult, '#ffffff', 14);
  SFX.near();
}

// ---------- Update ----------
function update(time, delta) {
  let dt = Math.min(0.033, delta / 1000);
  music();
  if (S.mode === 'title') updTitle(dt);
  else if (S.mode === 'play' || S.mode === 'dying') updPlay(dt);
  else if (S.mode === 'over') updOver(dt);
  else if (S.mode === 'name') updName(dt);
  for (const k in just) just[k] = false;
}

function updTitle(dt) {
  S.t += dt;
  drawBg(0, 0);
  g.clear(); fxg.clear(); hud.clear();
  // demo swinger
  const a = Math.sin(S.t * 2.2) * 0.8, ax = 700, ay = 200, L = 120;
  const p = { x: ax + Math.sin(a) * L, y: ay + Math.cos(a) * L, ang: -a, inv: 0, i: 0, att: 1 };
  g.lineStyle(2, 0xffffff); g.lineBetween(ax, ay, p.x, p.y);
  g.fillStyle(0xff7b00); g.fillCircle(ax, ay, 5);
  drawGuy(p);
  drawDrone(100, 280 + Math.sin(S.t * 2) * 20, 1.6, Math.floor(S.t * 2) % 2);
  hud.fillStyle(0x000000, 0.55); hud.fillRoundedRect(200, 196, 400, 230, 12);
  if (S.blink) S.blink.setAlpha(Math.floor(S.t * 2.5) % 2 ? 1 : 0.35);
  if (just.START1 || btnJust('P1')) startGame(1);
  else if (just.START2 || btnJust('P2')) startGame(2);
}

function updPlay(dt) {
  if (S.stop > 0) { S.stop -= dt; dt = 0.002; }
  S.t += dt;
  const alive = S.players.filter((p) => p.alive);
  if (S.mode === 'play') {
    for (const p of alive) stepPlayer(p, dt);
    if (S.n === 2) pvp();
  }
  const L = leader();
  // camera
  const ty = L.y - 330;
  cam.scrollY += (ty - cam.scrollY) * Math.min(1, dt * 4);
  // smog
  const m = meters(S.bestY);
  if (S.started) {
    let sp = 30 + Math.min(150, m * 0.3);
    if (S.boss) sp *= 0.55;
    S.smogY -= sp * dt;
  }
  S.smogY = Math.min(S.smogY, S.bestY + 720);
  cam.scrollY = Math.min(cam.scrollY, S.smogY - H + 70);
  if (S.mode === 'play') {
    genAnchors(cam.scrollY - 700);
    spawnHazards(dt);
    updBoss(dt);
    updHazards(dt);
    for (const p of alive) {
      if (p.y > S.smogY + 6) die(p, '¡TE TRAGÓ EL SMOG!');
      else if (S.n === 2 && p.y > cam.scrollY + H + 60) die(p, '¡QUEDASTE ATRÁS!');
    }
    // zones
    let z = 0;
    for (let i = 0; i < ZONES.length; i++) if (m >= ZONES[i][0]) z = i;
    if (z !== S.zone) { S.zone = z; banner(ZONES[z][4], z === 2 ? 'La torre sigue... ¿quién la construyó?' : ''); }
    // cleanup
    const lim = cam.scrollY + H + 400;
    S.anchors = S.anchors.filter((a) => a.y < lim || S.players.some((p) => p.att === a));
    S.spots = S.spots.filter((s) => s.y < lim);
  } else {
    S.dieT -= dt;
    if (S.dieT <= 0) { gameOver(); return; }
  }
  // particles
  for (const q of S.parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 400 * dt; q.l -= dt; }
  S.parts = S.parts.filter((q) => q.l > 0);
  if (S.shake > 0) { S.shake -= dt; cam.setScroll(0, cam.scrollY); cam.scrollX = rnd(-1, 1) * S.shake * 18; } else cam.scrollX = 0;
  render(dt);
}

function pvp() {
  const [a, b] = S.players;
  if (!a.alive || !b.alive || a.onStart || b.onStart) return;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  if (d < 26 && d > 0) {
    const sa = Math.hypot(a.vx, a.vy), sb = Math.hypot(b.vx, b.vy);
    const [f, s] = sa > sb ? [a, b] : [b, a];
    if (Math.max(sa, sb) > 260 && s.inv <= 0) {
      addScore(f, 300 * f.mult);
      hit(s, (s.x - f.x) / d * 420, 100, '¡CORTE!');
      pop(f.x, f.y - 30, '+' + 300 * f.mult, PHEX[f.i], 18);
    } else {
      const nx = dx / d, ny = dy / d, push = (26 - d) / 2;
      a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
    }
  }
}

function die(p, msg) {
  p.alive = false; p.att = null;
  burst(p.x, p.y, PCOL[p.i], 30, 300, 1);
  SFX.die();
  pop(p.x, p.y - 40, msg, PHEX[p.i], 22);
  if (S.players.every((q) => !q.alive)) {
    S.mode = 'dying'; S.dieT = 1.4; S.endMsg = msg;
  } else banner('JUGADOR ' + (p.i + 1) + ' ELIMINADO', msg);
}

// ---------- Rendering ----------
function drawBg(m, scroll) {
  let i = 0;
  while (i < ZONES.length - 1 && m >= ZONES[i + 1][0]) i++;
  const z0 = ZONES[i], z1 = ZONES[Math.min(i + 1, ZONES.length - 1)];
  const t = z1 === z0 ? 0 : clamp((m - z0[0]) / (z1[0] - z0[0]), 0, 1);
  const top = lerpC(z0[1], z1[1], t), bot = lerpC(z0[2], z1[2], t);
  bg.clear();
  bg.fillGradientStyle(top, top, bot, bot, 1); bg.fillRect(0, 0, W, H);
  if (m > 380) {
    const a = clamp((m - 380) / 100, 0, 1);
    for (const s of S.stars) {
      bg.fillStyle(0xffffff, a * (0.4 + 0.6 * Math.abs(Math.sin(S.t * (1 + s[2]) + s[0]))));
      bg.fillRect(s[0], (s[1] - scroll * 0.01) % H, 2, 2);
    }
  }
  const up = -scroll;
  S.mtn.y = 330 + up * 0.03; S.city.y = 420 + up * 0.12;
  S.mtn.setTint(lerpC(z0[3], z1[3], t)); S.city.setTint(lerpC(z0[3], z1[3], t));
  S.fac.tilePositionY = scroll; S.fac.setTint(lerpC(z0[3], z1[3], t));
}

function render(dt) {
  const m = meters(S.bestY), top = cam.scrollY;
  drawBg(m, top);
  g.clear(); fxg.clear(); hud.clear();
  // start scaffold
  if (top + H > -40) {
    g.fillStyle(0x666f7a); g.fillRect(300, 0, 200, 10);
    g.lineStyle(2, 0x999999); g.lineBetween(305, 0, 330, -60); g.lineBetween(495, 0, 470, -60);
  }
  // windows
  for (const w of S.wins) {
    if (w.t < 0.9) {
      if (Math.floor(w.t * 10) % 2) { g.lineStyle(4, 0xff7b00); g.strokeRect(w.x + 3, w.y + 3, 94, 74); }
    } else {
      const k = Math.min(1, (w.t - 0.9) * 6) * (w.t > 2.3 ? (2.6 - w.t) / 0.3 : 1);
      g.fillStyle(0x2a3440, 0.9); g.fillRect(w.x + 4, w.y + 4, 92, 76);
      g.fillStyle(0xe6f4ff, 0.85); g.fillRect(w.x + 4 - 14 * k, w.y + 4 - 10 * k, 92 + 28 * k, 76 + 20 * k);
      // angry office worker
      const cx = w.x + 50, cy = w.y + 46;
      g.fillStyle(0x1f2a44); g.fillRect(cx - 16, cy + 10, 32, 30);
      g.fillStyle(0xf2c39b); g.fillCircle(cx, cy, 14);
      g.fillStyle(0x3b2414); g.fillRect(cx - 14, cy - 15, 28, 7);
      g.lineStyle(2, 0x000000); g.lineBetween(cx - 9, cy - 5, cx - 3, cy - 2); g.lineBetween(cx + 9, cy - 5, cx + 3, cy - 2);
      g.lineBetween(cx - 5, cy + 7, cx + 5, cy + 7);
    }
  }
  // dirty spots
  for (const s of S.spots) {
    if (s.c || s.y < top - 40 || s.y > top + H + 40) continue;
    g.fillStyle(0x6b4f2a, 0.8); g.fillCircle(s.x, s.y, s.r);
    g.fillStyle(0x8a6a3a, 0.8); g.fillCircle(s.x + s.r * 0.5, s.y - s.r * 0.4, s.r * 0.6); g.fillCircle(s.x - s.r * 0.6, s.y + s.r * 0.3, s.r * 0.5);
  }
  // anchors + target
  for (const a of S.anchors) {
    if (a.y < top - 20 || a.y > top + H + 20) continue;
    g.fillStyle(0x333a44); g.fillCircle(a.x, a.y, 7);
    g.lineStyle(3, 0xff9a1f); g.strokeCircle(a.x, a.y, 6);
  }
  for (const p of S.players) {
    if (!p.alive || p.att) continue;
    const a = target(p);
    if (a) {
      const r = 13 + Math.sin(S.t * 12) * 3;
      g.lineStyle(3, PCOL[p.i], 0.9); g.strokeCircle(a.x, a.y, r);
    }
  }
  // ropes + players
  for (const p of S.players) {
    if (!p.alive) continue;
    if (p.att) { g.lineStyle(2, 0xffffff); g.lineBetween(p.att.x, p.att.y, p.x, p.y - 4); }
    else if (p.onStart) { g.lineStyle(1, 0xffffff, 0.5); g.lineBetween(p.x, p.y - 4, p.x, p.y - 60); }
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 520) {
      g.lineStyle(2, 0xffffff, 0.35);
      for (let i = 0; i < 3; i++) g.lineBetween(p.x + rnd(-8, 8), p.y + rnd(-10, 10), p.x - p.vx * 0.06 + rnd(-8, 8), p.y - p.vy * 0.06 + rnd(-8, 8));
    }
    drawGuy(p);
    if (p.onStart) { g.fillStyle(0x444c56); g.fillRect(p.x - 14, p.y + 18, 28, 4); }
  }
  // pigeons
  for (const q of S.pigs) {
    const d = Math.sign(q.vx), f = Math.sin(q.t * 18) * 8;
    g.fillStyle(0x8c929c); g.fillEllipse(q.x, q.y, 24, 13);
    g.fillStyle(0x6a707a); g.fillTriangle(q.x - 4, q.y - 2, q.x + 6, q.y - 2, q.x + 1, q.y - 10 - f);
    g.fillStyle(0x5d8a7a); g.fillCircle(q.x + d * 11, q.y - 4, 5);
    g.fillStyle(0xffa000); g.fillTriangle(q.x + d * 15, q.y - 5, q.x + d * 21, q.y - 3, q.x + d * 15, q.y - 1);
  }
  // mini drones
  for (const d of S.drones) drawDrone(d.x, d.y, 0.8, d.ft < 0.4);
  // boss
  const b = S.boss;
  if (b) {
    if (b.tele > 0) {
      g.lineStyle(2, 0x7fe3ff, 0.4 + 0.5 * (Math.floor(S.t * 20) % 2));
      g.lineBetween(b.x, b.y + 10, b.x + Math.cos(b.ang) * 900, b.y + 10 + Math.sin(b.ang) * 900);
    }
    if (!(b.inv > 0 && Math.floor(S.t * 25) % 2)) drawDrone(b.x, b.y, 1.9, b.tele > 0);
  }
  // water drops
  for (const o of S.drops) {
    g.fillStyle(0x7fe3ff); g.fillCircle(o.x, o.y, 6);
    g.fillStyle(0xffffff, 0.8); g.fillCircle(o.x - 2, o.y - 2, 2);
  }
  // particles
  for (const q of S.parts) { g.fillStyle(q.c, q.l / q.m); g.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s); }
  // smog
  const sy = S.smogY;
  g.fillStyle(0x5a4a3a, 0.55);
  g.beginPath(); g.moveTo(0, sy + 400);
  for (let x = 0; x <= W; x += 40) g.lineTo(x, sy - 18 + Math.sin(x * 0.03 + S.t * 2) * 10);
  g.lineTo(W, sy + 400); g.closePath(); g.fillPath();
  g.fillStyle(0x3d3128, 0.9); g.fillRect(0, sy + 8, W, 700);
  for (let x = 20; x < W; x += 70) { g.fillStyle(0x6e5c48, 0.5); g.fillCircle(x + Math.sin(S.t + x) * 15, sy + 6 + Math.cos(S.t * 1.3 + x) * 5, 26); }

  // wind streaks / rain
  if (S.wind) {
    fxg.lineStyle(2, 0xffffff, 0.35);
    for (let i = 0; i < 14; i++) {
      const y = (i * 47 + S.t * 30) % H, x = ((S.t * Math.abs(S.wind) * 1.5 + i * 133) % (W + 200)) - 100;
      const xx = S.wind > 0 ? x : W - x;
      fxg.lineBetween(xx, y, xx - Math.sign(S.wind) * 60, y);
    }
  }
  if (m > 600) {
    fxg.lineStyle(1, 0xaad4ff, 0.4);
    for (let i = 0; i < 40; i++) { const x = (i * 97 + S.t * 200) % W, y = (i * 61 + S.t * 900) % H; fxg.lineBetween(x, y, x - 6, y + 18); }
  }
  if (S.flash > 0) { S.flash -= dt; fxg.fillStyle(0xffffff, S.flash); fxg.fillRect(0, 0, W, H); }
  // smog warning
  const dist = S.smogY - leader().y;
  if (S.mode === 'play' && dist < 200) { fxg.fillStyle(0x5a3a1a, (200 - dist) / 400); fxg.fillRect(0, H - 60, W, 60); }
  drawHud();
}

function drawDrone(x, y, s, warn) {
  g.lineStyle(3 * s, 0x2b2f36);
  g.lineBetween(x - 22 * s, y - 6 * s, x + 22 * s, y - 6 * s);
  const r = Math.abs(Math.sin(S.t * 40)) * 12 * s;
  g.fillStyle(0xdde6ee, 0.7); g.fillEllipse(x - 22 * s, y - 9 * s, r * 2 + 4, 4 * s); g.fillEllipse(x + 22 * s, y - 9 * s, r * 2 + 4, 4 * s);
  g.fillStyle(0xf2f5f8); g.fillRoundedRect(x - 14 * s, y - 8 * s, 28 * s, 16 * s, 5 * s);
  g.fillStyle(0x1b8fd8); g.fillRect(x - 14 * s, y + 2 * s, 28 * s, 3 * s);
  g.fillStyle(warn ? 0xff2020 : 0x30d0ff); g.fillCircle(x, y - 1 * s, 4 * s);
  g.fillStyle(0x2b2f36); g.fillRect(x - 3 * s, y + 8 * s, 6 * s, 5 * s);
}

function drawHud() {
  hud.fillStyle(0x000000, 0.35); hud.fillRect(0, 0, W, 78);
  for (const p of S.players) {
    p.tH.setText(p.maxH + ' m').setAlpha(p.alive ? 1 : 0.4);
    p.tS.setText(p.score + ' pts');
    if (p.mult > 1 || p.combo > 0) {
      const cc = p.mult >= 5 ? '#ff7b00' : p.mult > 1 ? '#ffd23f' : '#ffffff';
      p.tC.setText('COMBO ' + p.combo + '  x' + p.mult);
      if (p.cc !== cc) { p.cc = cc; p.tC.setColor(cc); }
      p.tC.setScale(1 + Math.max(0, 0.08 * Math.sin(S.t * 10)) * (p.mult > 3 ? 1 : 0));
      if (p.att && p.combo > 0) {
        const f = clamp(1 - p.hang / 2.6, 0, 1), x = p.tC.x - 70;
        hud.fillStyle(0x222222, 0.8); hud.fillRect(x, 50, 140, 6);
        hud.fillStyle(f < 0.3 ? 0xff4040 : 0xffd23f); hud.fillRect(x, 50, 140 * f, 6);
      }
    } else p.tC.setText('');
  }
  if (S.tBest) S.tBest.setText('RÉCORD\n' + Math.max(board[0] ? board[0].s : 0, S.players[0].score));
  const b = S.boss;
  if (b && !b.leave) {
    hud.fillStyle(0x000000, 0.6); hud.fillRect(250, 84, 300, 14);
    hud.fillStyle(0xff3355); hud.fillRect(252, 86, 296 * (b.hp / b.max), 10);
    hud.fillStyle(0xffffff, 0.8); hud.fillRect(252, 86, 296 * Math.max(0, (38 - b.t) / 38), 2);
  }
}

// ---------- Game over / names ----------
function qualifies(s) { return s > 0 && (board.length < 10 || s > board[board.length - 1].s); }

function gameOver() {
  S.mode = 'over'; S.t = 0;
  clearUI();
  S.hudT.forEach((t) => t.destroy()); S.hudT = []; S.tBest = null;
  hud.clear();
  const ps = S.players;
  S.queue = ps.filter((p) => qualifies(p.score)).sort((a, b) => b.score - a.score);
  ui(SC.add.rectangle(400, 300, 640, 470, 0x000000, 0.78).setScrollFactor(0).setStrokeStyle(3, 0xffd23f));
  if (S.n === 1) {
    const p = ps[0];
    ui(T(400, 110, S.endMsg, 34, '#ff7a7a'));
    ui(T(400, 170, p.maxH + ' METROS', 44, '#ffd23f'));
    ui(T(400, 220, p.score + ' PUNTOS', 28, '#fff'));
  } else {
    const w = ps[0].score === ps[1].score ? -1 : ps[0].score > ps[1].score ? 0 : 1;
    ui(T(400, 110, w < 0 ? '¡EMPATE!' : 'GANA JUGADOR ' + (w + 1), 40, w < 0 ? '#fff' : PHEX[w]));
    ps.forEach((p, i) => ui(T(i ? 560 : 240, 180, 'J' + (i + 1) + '\n' + p.maxH + ' m\n' + p.score + ' pts', 22, PHEX[i])).setLineSpacing(4));
  }
  if (S.queue.length) startName();
  else showRetry();
}

function showRetry() {
  S.mode = 'over'; S.t = 0;
  ui(T(400, 380, boardText(5), 15, '#fff')).setLineSpacing(2);
  S.blink = ui(T(400, 490, 'START: OTRA VEZ   ·   ESPERA: MENÚ', 20, '#fff'));
}

function updOver(dt) {
  S.t += dt;
  if (S.blink) S.blink.setAlpha(Math.floor(S.t * 2.5) % 2 ? 1 : 0.4);
  if (S.t > 0.6 && anyJust()) { const n = just.START2 ? 2 : just.START1 ? 1 : S.n; startGame(n); }
  else if (S.t > 15) showTitle();
}

function startName() {
  const p = S.queue.shift();
  S.ne = { p, l: [0, 0, 0], pos: 0 };
  S.mode = 'name'; S.t = 0;
  if (S.nameUI) S.nameUI.forEach((t) => t.destroy());
  S.nameUI = [
    ui(T(400, 300, '¡NUEVO RÉCORD!' + (S.n === 2 ? '  J' + (p.i + 1) : ''), 28, PHEX[p.i])),
    ui(T(400, 360, '', 48, '#fff')),
    ui(T(400, 420, '↑ ↓ letra  ·  ← → mover  ·  BOTÓN: aceptar', 15, '#cfefff')),
  ];
  drawName();
}

function drawName() {
  const e = S.ne;
  S.nameUI[1].setText(e.l.map((c, i) => (i === e.pos && Math.floor(S.t * 4) % 2 ? '_' : LETTERS[c])).join(' '));
}

function updName(dt) {
  S.t += dt;
  const e = S.ne, k = e.p.k;
  if (just[k + '_U']) { e.l[e.pos] = (e.l[e.pos] + 1) % LETTERS.length; SFX.sel(); }
  if (just[k + '_D']) { e.l[e.pos] = (e.l[e.pos] + LETTERS.length - 1) % LETTERS.length; SFX.sel(); }
  if (just[k + '_L'] && e.pos > 0) { e.pos--; SFX.sel(); }
  if (just[k + '_R'] && e.pos < 2) { e.pos++; SFX.sel(); }
  if (btnJust(k) || just[k === 'P1' ? 'START1' : 'START2']) {
    SFX.sel();
    if (e.pos < 2) e.pos++;
    else {
      board.push({ n: e.l.map((c) => LETTERS[c]).join(''), s: e.p.score, h: e.p.maxH });
      board.sort((a, b) => b.s - a.s);
      board = board.slice(0, 10);
      store.set(BKEY, board);
      S.nameUI.forEach((t) => t.destroy()); S.nameUI = null;
      if (S.queue.length) startName();
      else showRetry();
      return;
    }
  }
  drawName();
}
