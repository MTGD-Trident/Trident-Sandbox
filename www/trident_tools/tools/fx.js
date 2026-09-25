// ===================================================================
// Atmosphere: backgrounds, music, sound effects, settings
// -------------------------------------------------------------------
// Everything here is generated in code: backgrounds are CSS gradients or
// canvas animations, and music and sound effects are synthesized live with
// the Web Audio API. No image or audio files, so no licensing questions
// and no extra APK size. Settings persist separately from the game save.
// ===================================================================

const SETTINGS_KEY = 'trident_settings_v1';
const BACKGROUNDS = [
  { id: 'hearth',   name: 'Hearth',        css: 'radial-gradient(ellipse 120% 80% at 50% 0%, #3b2a1b 0%, #1a130d 55%, #0d0906 100%)' },
  { id: 'midnight', name: 'Midnight',      css: 'radial-gradient(ellipse 110% 90% at 30% 15%, #22306a 0%, #0c1230 50%, #05070f 100%)' },
  { id: 'grove',    name: 'Verdant Grove', css: 'radial-gradient(ellipse 120% 80% at 50% 100%, #24502c 0%, #0e2413 50%, #050b06 100%)' },
  { id: 'ashen',    name: 'Cinderforge',   css: 'radial-gradient(ellipse 120% 70% at 50% 110%, #6e2412 0%, #2a0d07 50%, #0e0504 100%)' },
  { id: 'tide',     name: 'Undertow',      css: 'radial-gradient(ellipse 120% 80% at 50% 0%, #0f4a52 0%, #06242a 50%, #020b0d 100%)' },
  { id: 'slate',    name: 'Slate',         css: 'radial-gradient(ellipse 110% 90% at 50% 40%, #2a2d35 0%, #16181d 60%, #0b0c0f 100%)' },
  { id: 'galaxy',   name: 'Galaxy',        animated: true, css: 'radial-gradient(ellipse at 40% 40%, #3a1f5c 0%, #140a2a 45%, #03020a 100%)' },
  { id: 'embers',   name: 'Embers',        animated: true, css: 'radial-gradient(ellipse at 50% 110%, #7a2a0e 0%, #2a0c05 45%, #080302 100%)' },
  { id: 'aurora',   name: 'Aurora',        animated: true, css: 'linear-gradient(180deg, #06111f 0%, #0b2a2e 55%, #041016 100%)' },
];
const TRACKS = [
  { id: 'off',     name: 'Off' },
  { id: 'ember',   name: 'Ember Hall',   note: 'warm, candlelit' },
  { id: 'starfall', name: 'Starfall',    note: 'celestial, shimmering' },
  { id: 'current', name: 'Deep Current', note: 'dark, tidal' },
  { id: 'council', name: 'War Council',  note: 'drums, tension' },
];
let settings = { bg: 'galaxy', music: 'ember', musicVol: 35, sfxVol: 60, muted: false };
let settingsOpen = false;

function loadSettings() {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); if (s) settings = Object.assign(settings, s); } catch (e) {}
}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }

// ---- Backgrounds -------------------------------------------------------
const BGFX = { canvas: null, g: null, raf: 0, last: 0, w: 0, h: 0, scene: null };

function applyBackground() {
  const def = BACKGROUNDS.find(b => b.id === settings.bg) || BACKGROUNDS[0];
  const stat = document.getElementById('bgstatic');
  if (stat) stat.style.background = def.css;
  stopBgAnim();
  if (def.animated) startBgAnim(def.id);
}
function sizeCanvas() {
  const c = BGFX.canvas; if (!c) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5); // cap the pixel cost on high-DPI tablets
  BGFX.w = window.innerWidth; BGFX.h = window.innerHeight;
  c.width = Math.round(BGFX.w * dpr); c.height = Math.round(BGFX.h * dpr);
  c.style.width = BGFX.w + 'px'; c.style.height = BGFX.h + 'px';
  BGFX.g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function startBgAnim(id) {
  const c = document.getElementById('bgfx');
  if (!c || !c.getContext) return;
  BGFX.canvas = c; BGFX.g = c.getContext('2d');
  if (!BGFX.g) return;
  c.style.display = 'block';
  sizeCanvas();
  BGFX.scene = SCENES[id]();
  const loop = t => {
    BGFX.raf = requestAnimationFrame(loop);
    if (document.hidden || t - BGFX.last < 33) return; // ~30fps is plenty for a backdrop
    const dt = Math.min(0.1, (t - (BGFX.last || t)) / 1000);
    BGFX.last = t;
    BGFX.scene.draw(BGFX.g, BGFX.w, BGFX.h, t / 1000, dt);
  };
  BGFX.raf = requestAnimationFrame(loop);
}
function stopBgAnim() {
  if (BGFX.raf) cancelAnimationFrame(BGFX.raf);
  BGFX.raf = 0; BGFX.scene = null; BGFX.last = 0;
  const c = document.getElementById('bgfx');
  if (c && c.style) c.style.display = 'none';
}
function glowSprite(r, rgb) {
  const s = document.createElement('canvas'); s.width = s.height = r * 2;
  const g = s.getContext('2d'), gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(0.35, 'rgba(' + rgb + ',0.45)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2);
  return s;
}
function makeStars(n) {
  return Array.from({ length: n }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.3 + 0.3,
    a: Math.random() * 0.6 + 0.3, s: Math.random() * 1.5 + 0.4, p: Math.random() * 6.3 }));
}
function drawStars(g, w, h, stars, t) {
  g.fillStyle = '#fff';
  stars.forEach(st => {
    g.globalAlpha = st.a * (0.55 + 0.45 * Math.sin(t * st.s + st.p));
    g.beginPath(); g.arc(st.x * w, st.y * h, st.r, 0, 6.283); g.fill();
  });
  g.globalAlpha = 1;
}
const SCENES = {
  galaxy() {
    const stars = makeStars(260);
    const blobs = [['150,70,220', 0.30, 0.35, 0.55], ['60,110,230', 0.70, 0.30, 0.45], ['230,80,170', 0.55, 0.70, 0.40], ['90,40,160', 0.20, 0.80, 0.50]];
    const sprites = blobs.map(b => glowSprite(256, b[0]));
    let shoot = null, nextShoot = 6;
    return { draw(g, w, h, t, dt) {
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#04030c'; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      blobs.forEach((b, i) => {
        const size = Math.max(w, h) * b[3] * (1 + 0.06 * Math.sin(t * 0.07 + i));
        const x = w * b[1] + Math.sin(t * 0.05 + i * 2) * w * 0.04, y = h * b[2] + Math.cos(t * 0.04 + i) * h * 0.03;
        g.globalAlpha = 0.55; g.drawImage(sprites[i], x - size, y - size, size * 2, size * 2);
      });
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      drawStars(g, w, h, stars, t);
      nextShoot -= dt;
      if (!shoot && nextShoot <= 0) { shoot = { x: Math.random() * w * 0.7, y: Math.random() * h * 0.4, life: 0 }; nextShoot = 8 + Math.random() * 10; }
      if (shoot) {
        shoot.life += dt; const k = shoot.life / 0.9;
        const x = shoot.x + k * w * 0.35, y = shoot.y + k * h * 0.18;
        const grad = g.createLinearGradient(x - 90, y - 45, x, y);
        grad.addColorStop(0, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(255,255,255,' + (0.9 * (1 - k)) + ')');
        g.strokeStyle = grad; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 90, y - 45); g.lineTo(x, y); g.stroke();
        if (k >= 1) shoot = null;
      }
    } };
  },
  embers() {
    const spr = [glowSprite(24, '255,140,50'), glowSprite(24, '255,90,30'), glowSprite(24, '255,200,120')];
    const make = (fresh) => ({ x: Math.random(), y: fresh ? 1.05 : Math.random() * 1.05, v: 0.03 + Math.random() * 0.06,
      wob: Math.random() * 6.3, ws: 0.6 + Math.random() * 1.2, r: 3 + Math.random() * 7, a: 0.4 + Math.random() * 0.6, k: (Math.random() * 3) | 0 });
    const parts = Array.from({ length: 110 }, () => make(false));
    return { draw(g, w, h, t, dt) {
      const bg = g.createRadialGradient(w / 2, h * 1.1, 0, w / 2, h * 1.1, h * 1.1);
      bg.addColorStop(0, '#6a2410'); bg.addColorStop(0.45, '#260b05'); bg.addColorStop(1, '#070302');
      g.globalCompositeOperation = 'source-over'; g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'lighter';
      parts.forEach((p, i) => {
        p.y -= p.v * dt; p.wob += p.ws * dt;
        if (p.y < -0.05) parts[i] = make(true);
        const fade = Math.min(1, p.y * 1.4);
        g.globalAlpha = p.a * fade * (0.7 + 0.3 * Math.sin(t * 3 + p.wob));
        const x = (p.x + Math.sin(p.wob) * 0.015) * w, y = p.y * h;
        g.drawImage(spr[p.k], x - p.r, y - p.r, p.r * 2, p.r * 2);
      });
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    } };
  },
  aurora() {
    const stars = makeStars(160).map(s => Object.assign(s, { y: s.y * 0.7 }));
    const bands = [['60,255,170', 0.30, 0.9, 0.00], ['80,200,255', 0.38, 1.3, 1.7], ['170,110,255', 0.24, 0.7, 3.1]];
    return { draw(g, w, h, t) {
      const bg = g.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#040a16'); bg.addColorStop(0.6, '#071c22'); bg.addColorStop(1, '#030b0e');
      g.globalCompositeOperation = 'source-over'; g.fillStyle = bg; g.fillRect(0, 0, w, h);
      drawStars(g, w, h, stars, t);
      g.globalCompositeOperation = 'lighter';
      bands.forEach((b, bi) => {
        const base = h * b[1], amp = h * 0.06;
        const grad = g.createLinearGradient(0, base - h * 0.22, 0, base + h * 0.12);
        grad.addColorStop(0, 'rgba(' + b[0] + ',0)'); grad.addColorStop(0.6, 'rgba(' + b[0] + ',0.22)'); grad.addColorStop(1, 'rgba(' + b[0] + ',0)');
        g.fillStyle = grad; g.beginPath();
        const step = w / 48;
        for (let x = 0; x <= w + step; x += step) {
          const y = base + Math.sin(x / w * 6.283 * b[2] + t * 0.25 + b[3]) * amp + Math.sin(x / w * 13 + t * 0.4 + bi) * amp * 0.35;
          if (x === 0) g.moveTo(x, y - h * 0.22); else g.lineTo(x, y - h * 0.22);
        }
        for (let x = w + step; x >= 0; x -= step) {
          const y = base + Math.sin(x / w * 6.283 * b[2] + t * 0.25 + b[3]) * amp + Math.sin(x / w * 13 + t * 0.4 + bi) * amp * 0.35;
          g.lineTo(x, y + h * 0.12);
        }
        g.closePath(); g.fill();
      });
      g.globalCompositeOperation = 'source-over';
    } };
  },
};

// ---- Audio: shared graph ------------------------------------------------
const AUD = { ctx: null, master: null, music: null, sfx: null, verb: null, delay: null, noise: null,
  track: null, timer: null, nextBeat: 0, beat: 0, drones: [], lastSfx: {} };

function audioReady() { return !!(AUD.ctx && AUD.ctx.state === 'running'); }
function initAudio() {
  if (AUD.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = AUD.ctx = new AC();
  AUD.master = ctx.createGain(); AUD.master.connect(ctx.destination);
  AUD.music = ctx.createGain(); AUD.sfx = ctx.createGain();
  // Reverb: a synthetic 2.8s impulse response.
  const len = ctx.sampleRate * 2.8, ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
  AUD.verb = ctx.createConvolver(); AUD.verb.buffer = ir;
  const verbOut = ctx.createGain(); verbOut.gain.value = 0.55;
  AUD.verb.connect(verbOut); verbOut.connect(AUD.master);
  // Echo for plucks.
  AUD.delay = ctx.createDelay(2); AUD.delay.delayTime.value = 0.42;
  const fb = ctx.createGain(); fb.gain.value = 0.38;
  const dOut = ctx.createGain(); dOut.gain.value = 0.35;
  AUD.delay.connect(fb); fb.connect(AUD.delay); AUD.delay.connect(dOut); dOut.connect(AUD.master); dOut.connect(AUD.verb);
  AUD.music.connect(AUD.master); AUD.music.connect(AUD.verb);
  AUD.sfx.connect(AUD.master);
  const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  AUD.noise = nb;
  applyVolumes();
}
function applyVolumes() {
  if (!AUD.ctx) return;
  const t = AUD.ctx.currentTime;
  AUD.master.gain.setTargetAtTime(settings.muted ? 0 : 1, t, 0.05);
  AUD.music.gain.setTargetAtTime(Math.pow(settings.musicVol / 100, 2) * 0.9, t, 0.1);
  AUD.sfx.gain.setTargetAtTime(Math.pow(settings.sfxVol / 100, 2) * 1.0, t, 0.05);
}
// Browsers only allow audio after a tap; the first one unlocks it.
function unlockAudio() {
  initAudio();
  if (!AUD.ctx) return;
  if (AUD.ctx.state !== 'running') AUD.ctx.resume().then(() => { if (!AUD.track) playTrack(settings.music); });
  else if (!AUD.track) playTrack(settings.music);
}

// ---- Instruments ------------------------------------------------------
const NOTE = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI note -> Hz
function env(g, t, a, peak, d, sustain) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
}
function pad(t, notes, dur, o) {
  o = o || {};
  const ctx = AUD.ctx, out = ctx.createGain(), f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = o.cutoff || 900; f.Q.value = 0.5;
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime((o.vol || 0.07) / Math.sqrt(notes.length), t + (o.attack || 1.6));
  out.gain.setValueAtTime((o.vol || 0.07) / Math.sqrt(notes.length), t + dur - 0.2);
  out.gain.exponentialRampToValueAtTime(0.0001, t + dur + (o.release || 2.2));
  f.connect(out); out.connect(AUD.music);
  notes.forEach(n => [-7, 7].forEach(det => {
    const osc = ctx.createOscillator(); osc.type = o.wave || 'sawtooth';
    osc.frequency.value = NOTE(n); osc.detune.value = det;
    osc.connect(f); osc.start(t); osc.stop(t + dur + (o.release || 2.2) + 0.1);
  }));
}
function pluck(t, n, o) {
  o = o || {};
  const ctx = AUD.ctx, osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.wave || 'triangle'; osc.frequency.value = NOTE(n);
  env(g, t, 0.005, o.vol || 0.12, o.decay || 1.2);
  osc.connect(g); g.connect(AUD.music); if (o.echo !== false) g.connect(AUD.delay);
  osc.start(t); osc.stop(t + (o.decay || 1.2) + 0.1);
}
function bell(t, n, vol) {
  const ctx = AUD.ctx;
  [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([ratio, amp]) => {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = NOTE(n) * ratio;
    env(g, t, 0.004, (vol || 0.07) * amp, 3.2 / ratio);
    osc.connect(g); g.connect(AUD.music); g.connect(AUD.delay);
    osc.start(t); osc.stop(t + 3.5);
  });
}
function drum(t, f0, vol, bus) {
  const ctx = AUD.ctx, osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(f0, t); osc.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.35);
  env(g, t, 0.004, vol, 0.45);
  osc.connect(g); g.connect(bus || AUD.music); osc.start(t); osc.stop(t + 0.6);
  noiseHit(t, 0.08, 600, vol * 0.35, bus || AUD.music, 'lowpass');
}
function noiseHit(t, dur, freq, vol, bus, type, freqEnd) {
  const ctx = AUD.ctx, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = AUD.noise; f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq, t);
  if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
  f.Q.value = 0.9;
  env(g, t, 0.004, vol, dur);
  src.connect(f); f.connect(g); g.connect(bus); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}
function tone(t, f0, f1, dur, vol, wave, bus) {
  const ctx = AUD.ctx, osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = wave || 'sine'; osc.frequency.setValueAtTime(f0, t);
  if (f1) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, 0.004, vol, dur);
  osc.connect(g); g.connect(bus || AUD.sfx); osc.start(t); osc.stop(t + dur + 0.05);
}
function drone(notes, o) {
  const ctx = AUD.ctx, f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  f.type = 'lowpass'; f.frequency.value = o.cutoff || 500; lfo.frequency.value = o.lfo || 0.05; lg.gain.value = o.depth || 300;
  lfo.connect(lg); lg.connect(f.frequency);
  g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(o.vol || 0.05, ctx.currentTime + 4);
  f.connect(g); g.connect(AUD.music);
  const oscs = notes.map(n => { const osc = ctx.createOscillator(); osc.type = o.wave || 'sawtooth'; osc.frequency.value = NOTE(n); osc.connect(f); osc.start(); return osc; });
  lfo.start();
  AUD.drones.push({ g, oscs: oscs.concat([lfo]) });
}

// ---- Tracks (one call per beat) --------------------------------------
const pick = arr => arr[(Math.random() * arr.length) | 0];
const MUSIC = {
  ember: { bpm: 60, start() {}, beat(t, b) {
    const chords = [[50, 53, 57, 62], [46, 50, 53, 58], [41, 45, 48, 53], [48, 52, 55, 60]]; // Dm Bb F C
    if (b % 8 === 0) pad(t, chords[(b / 8) % 4], 8, { cutoff: 850, vol: 0.075 });
    if (b % 8 === 0) pluck(t, chords[(b / 8) % 4][0] - 12, { vol: 0.09, decay: 3, echo: false, wave: 'sine' });
    if (Math.random() < 0.34) pluck(t + (Math.random() < 0.5 ? 0 : 0.5), pick([62, 65, 67, 69, 72, 74, 77]), { vol: 0.07, decay: 1.6 });
  } },
  starfall: { bpm: 72, start() {}, beat(t, b) {
    const chords = [[45, 49, 52, 56], [42, 45, 49, 52], [38, 42, 45, 49], [40, 44, 47, 52]]; // Amaj7 F#m7 Dmaj7 E
    const ch = chords[Math.floor(b / 8) % 4];
    if (b % 8 === 0) pad(t, ch.map(n => n + 12), 7, { cutoff: 1800, vol: 0.05, wave: 'triangle', attack: 2 });
    if (b % 2 === 1 || Math.random() < 0.3) bell(t + (Math.random() < 0.5 ? 0 : 0.42), pick(ch) + 24 + pick([0, 12]), 0.05);
  } },
  current: { bpm: 56, start() { drone([36, 43], { cutoff: 380, lfo: 0.04, depth: 260, vol: 0.06 }); }, beat(t, b) {
    const chords = [[48, 51, 55, 62], [44, 48, 51, 58], [41, 44, 48, 55], [43, 47, 50, 55]]; // Cm(add9) Ab Fm G
    if (b % 8 === 0) pad(t, chords[(b / 8) % 4], 8.5, { cutoff: 620, vol: 0.06, attack: 2.5 });
    if (Math.random() < 0.22) pluck(t, pick([60, 63, 67, 70, 72, 75]), { vol: 0.07, decay: 2.2, wave: 'sine' });
  } },
  council: { bpm: 84, start() { drone([38, 45], { cutoff: 420, lfo: 0.08, depth: 160, vol: 0.045 }); }, beat(t, b) {
    const spb = 60 / 84, bass = [38, 38, 41, 40];
    if (b % 2 === 0) drum(t, 90, 0.34);
    if (b % 4 === 3) { drum(t + spb * 0.5, 130, 0.2); drum(t + spb * 0.75, 120, 0.16); }
    pluck(t, bass[b % 4], { vol: 0.1, decay: 0.5, echo: false, wave: 'triangle' });
    if (b % 16 === 0) pad(t, (Math.floor(b / 16) % 2 ? [43, 46, 50, 55] : [38, 41, 45, 50]), 11, { cutoff: 700, vol: 0.05 });
    if (b % 8 === 6 && Math.random() < 0.6) noiseHit(t, 0.25, 3200, 0.05, AUD.music, 'highpass');
  } },
};
function playTrack(id) {
  if (!AUD.ctx) return;
  stopTrack();
  if (id === 'off' || !MUSIC[id]) return;
  AUD.track = MUSIC[id];
  AUD.beat = 0; AUD.nextBeat = AUD.ctx.currentTime + 0.15;
  AUD.track.start();
  const spb = 60 / AUD.track.bpm;
  AUD.timer = setInterval(() => {
    if (!AUD.track || AUD.ctx.state !== 'running') return;
    while (AUD.nextBeat < AUD.ctx.currentTime + 0.4) { AUD.track.beat(AUD.nextBeat, AUD.beat++); AUD.nextBeat += spb; }
  }, 120);
}
function stopTrack() {
  if (AUD.timer) clearInterval(AUD.timer);
  AUD.timer = null; AUD.track = null;
  if (!AUD.ctx) return;
  const t = AUD.ctx.currentTime;
  AUD.drones.forEach(d => { d.g.gain.setTargetAtTime(0.0001, t, 0.6); d.oscs.forEach(o => o.stop(t + 3)); });
  AUD.drones = [];
}

// ---- Sound effects ------------------------------------------------------
function sfx(name) {
  if (!audioReady() || settings.muted || settings.sfxVol === 0) return;
  const now = AUD.ctx.currentTime;
  if (AUD.lastSfx[name] && now - AUD.lastSfx[name] < 0.06) return; // stop bursts from stacking
  AUD.lastSfx[name] = now;
  const t = now + 0.01, B = AUD.sfx;
  switch (name) {
    case 'draw': noiseHit(t, 0.16, 900, 0.35, B, 'bandpass', 3600); break;
    case 'deal': [0, 0.07, 0.14, 0.21, 0.28].forEach(d => noiseHit(t + d, 0.1, 1400, 0.22, B, 'bandpass', 3800)); break;
    case 'play': noiseHit(t, 0.07, 1400, 0.3, B, 'lowpass'); tone(t, 150, 60, 0.14, 0.5); break;
    case 'event': [0, 0.05, 0.1].forEach((d, i) => tone(t + d, NOTE(76 + i * 4), null, 0.5, 0.12)); noiseHit(t, 0.35, 5000, 0.08, B, 'highpass'); break;
    case 'retire': noiseHit(t, 0.32, 2400, 0.3, B, 'bandpass', 280); tone(t, 220, 110, 0.3, 0.14, 'triangle'); break;
    case 'erase': for (let i = 0; i < 6; i++) tone(t + i * 0.035, 200 + Math.random() * 900, null, 0.05, 0.1, 'square'); noiseHit(t, 0.25, 800, 0.2, B, 'bandpass', 120); break;
    case 'up': tone(t, 660, 990, 0.09, 0.16); break;
    case 'down': tone(t, 440, 280, 0.12, 0.16, 'triangle'); break;
    case 'tap': tone(t, 1300, null, 0.035, 0.08, 'triangle'); break;
    case 'prompt': tone(t, NOTE(76), null, 0.35, 0.12); tone(t + 0.09, NOTE(83), null, 0.45, 0.1); break;
    case 'endturn': noiseHit(t, 0.28, 500, 0.2, B, 'bandpass', 2600); tone(t + 0.05, NOTE(69), null, 0.5, 0.12); tone(t + 0.05, NOTE(76), null, 0.5, 0.08); break;
    case 'conflict': [0, 0.28, 0.56].forEach((d, i) => drum(t + d, 80 - i * 6, 0.7, B)); break;
    case 'win': [72, 76, 79, 84].forEach((n, i) => tone(t + i * 0.11, NOTE(n), null, 0.6, 0.13, 'triangle')); break;
    case 'victory': [60, 64, 67, 72, 76, 79, 84].forEach((n, i) => tone(t + i * 0.1, NOTE(n), null, 0.9, 0.12, 'triangle'));
      [48, 55, 60].forEach(n => tone(t + 0.7, NOTE(n), null, 1.8, 0.12, 'sawtooth')); break;
  }
}

// ---- Settings panel -------------------------------------------------------
function openSettings() { settingsOpen = true; unlockAudio(); renderSettings(); }
function closeSettings() { settingsOpen = false; renderSettings(); }
function chooseBg(id) { settings.bg = id; saveSettings(); applyBackground(); renderSettings(); }
function chooseTrack(id) { settings.music = id; saveSettings(); unlockAudio(); if (AUD.ctx) playTrack(id); renderSettings(); }
function setVol(which, v) {
  settings[which] = +v; saveSettings(); applyVolumes();
  const lbl = document.getElementById(which + 'Lbl'); if (lbl) lbl.textContent = v + '%';
}
function setMuted(m) { settings.muted = !!m; saveSettings(); applyVolumes(); renderSettings(); }
function renderSettings() {
  const root = document.getElementById('settings-root');
  if (!root) return;
  if (!settingsOpen) { root.innerHTML = ''; return; }
  const tiles = BACKGROUNDS.map(b => '<button class="bg-tile' + (b.id === settings.bg ? ' on' : '') + '" onclick="chooseBg(\'' + b.id + '\')">' +
    '<span class="swatch" style="background:' + b.css + '">' + (b.animated ? '<span class="anim">\u2726 animated</span>' : '') + '</span>' +
    '<span class="nm">' + b.name + '</span></button>').join('');
  const tracks = TRACKS.map(tr => '<button class="track' + (tr.id === settings.music ? ' on' : '') + '" onclick="chooseTrack(\'' + tr.id + '\')">' +
    '<span class="nm">' + tr.name + '</span>' + (tr.note ? '<span class="note">' + tr.note + '</span>' : '') + '</button>').join('');
  root.innerHTML = '<div class="settings-backdrop" onclick="closeSettings()"><div class="settings-panel" onclick="event.stopPropagation()">' +
    '<div class="set-head"><span>Settings</span><button class="set-done" onclick="closeSettings()">Done</button></div>' +
    '<div class="set-sec"><div class="set-h">Background</div><div class="bg-grid">' + tiles + '</div></div>' +
    '<div class="set-sec"><div class="set-h">Music</div><div class="track-list">' + tracks + '</div>' +
      '<label class="vol">Music volume <input type="range" min="0" max="100" value="' + settings.musicVol + '" oninput="setVol(\'musicVol\', this.value)"><span id="musicVolLbl">' + settings.musicVol + '%</span></label></div>' +
    '<div class="set-sec"><div class="set-h">Sound effects</div>' +
      '<label class="vol">Effects volume <input type="range" min="0" max="100" value="' + settings.sfxVol + '" oninput="setVol(\'sfxVol\', this.value)" onchange="sfx(\'play\')"><span id="sfxVolLbl">' + settings.sfxVol + '%</span></label>' +
      '<div class="sfx-test">' + ['draw', 'play', 'event', 'retire', 'erase', 'conflict', 'win'].map(n => '<button onclick="sfx(\'' + n + '\')">' + n + '</button>').join('') + '</div></div>' +
    '<label class="mute"><input type="checkbox" ' + (settings.muted ? 'checked' : '') + ' onchange="setMuted(this.checked)"> Mute all sound</label>' +
    '</div></div>';
}

function initFx() {
  loadSettings();
  applyBackground();
  if (window.addEventListener) {
    window.addEventListener('resize', () => { if (BGFX.scene) sizeCanvas(); });
    ['pointerdown', 'touchstart', 'keydown'].forEach(ev => window.addEventListener(ev, unlockAudio, { once: true, passive: true }));
  }
  if (document.addEventListener) document.addEventListener('visibilitychange', () => {
    if (!AUD.ctx) return;
    if (document.hidden) AUD.ctx.suspend(); else AUD.ctx.resume();
  });
}
