const W = 1920, H = 1080;
const cv = document.getElementById('c'), mainCtx = cv.getContext('2d'); let ctx = mainCtx;
const buf = document.createElement('canvas'); buf.width = W; buf.height = H; const bctx = buf.getContext('2d');
const C = { bg: '#06080B', teal: '#3DD6B0', tealD: '#1E8C72', pink: '#FF4F81', amber: '#FFC857', blue: '#7AA2F7',
            ink: '#E8F1EE', dim: '#7C8A90', panel: '#0E141A', line: '#1F2A33' };
const DISPLAY = '"Space Grotesk", sans-serif', MONO = '"JetBrains Mono", monospace';

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const P = (t, a, b) => clamp((t - a) / (b - a));
const E = {
  out3: x => 1 - Math.pow(1 - x, 3), in3: x => x * x * x,
  io3: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x), inExpo: x => x <= 0 ? 0 : Math.pow(2, 10 * x - 10),
  outBack: x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
};
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const beatPulse = (t, period = .5, decay = 9) => Math.exp(-(((t % period) + period) % period) * decay);
const bump = (t, at, dur) => Math.sin(clamp((t - at) / dur) * Math.PI);   // 0 → 1 → 0

// ---------- drawing helpers ----------
function txt(s, x, y, o = {}) {
  const { size = 48, font = DISPLAY, weight = 700, color = C.ink, align = 'center', base = 'middle', alpha = 1, ls = 0 } = o;
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color;
  ctx.textAlign = align; ctx.textBaseline = base; ctx.letterSpacing = ls + 'px'; ctx.fillText(s, x, y); ctx.restore();
}
function measure(s, size, font = DISPLAY, weight = 700, ls = 0) {
  ctx.save(); ctx.font = `${weight} ${size}px ${font}`; ctx.letterSpacing = ls + 'px'; const w = ctx.measureText(s).width; ctx.restore(); return w;
}
function glitchTxt(s, x, y, o, amt) {
  if (amt > 0.3) { ctx.save(); ctx.globalCompositeOperation = 'lighter';
    txt(s, x - amt, y, { ...o, color: '#ff2a6d', alpha: (o.alpha ?? 1) * .85 }); txt(s, x + amt, y + amt * .3, { ...o, color: '#21e6ff', alpha: (o.alpha ?? 1) * .85 }); ctx.restore(); }
  txt(s, x, y, o);
}
function rrect(x, y, w, h, r, fill, stroke, lw = 2) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function key(x, y, w, h, label, press = 0, { alpha = 1, accent = false, scale = 1, rot = 0 } = {}) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.rotate(rot); ctx.scale(scale, scale);
  const d = 12 * (1 - press) + 2;
  rrect(-w / 2, -h / 2 + 10, w, h, 18, accent ? '#156b57' : '#11161c');
  rrect(-w / 2, -h / 2 + 10 - d, w, h, 18, accent ? C.teal : '#262f39', accent ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.12)', 2);
  txt(label, 0, 10 - d, { size: h * .3, font: MONO, color: accent ? '#032a20' : C.ink });
  ctx.restore();
}
function arrowCursor(x, y, s = 1, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.scale(s, s);
  ctx.beginPath(); [[0, 0], [0, 34], [9, 26], [15, 40], [21, 37], [15, 24], [27, 24]].forEach(([a, b], i) => i ? ctx.lineTo(a, b) : ctx.moveTo(a, b));
  ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.restore();
}
function ibeam(x, y, h = 40, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.lineCap = 'round';
  for (const [col, lw] of [['#000', 7], ['#fff', 3]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
    ctx.moveTo(x, y - h / 2); ctx.lineTo(x, y + h / 2);
    ctx.moveTo(x - 8, y - h / 2); ctx.lineTo(x + 8, y - h / 2); ctx.moveTo(x - 8, y + h / 2); ctx.lineTo(x + 8, y + h / 2); ctx.stroke();
  }
  ctx.restore();
}
function ripple(x, y, t, at, color = C.teal) {
  const p = P(t, at, at + .45); if (p <= 0 || p >= 1) return;
  ctx.save(); ctx.globalAlpha = 1 - p; ctx.strokeStyle = color; ctx.lineWidth = 4 * (1 - p) + 1;
  ctx.beginPath(); ctx.arc(x, y, 8 + 50 * E.out3(p), 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}
function win(x, y, w, h, title, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 60; ctx.shadowOffsetY = 20;
  rrect(x, y, w, h, 14, C.panel); ctx.shadowColor = 'transparent';
  rrect(x, y, w, h, 14, null, C.line, 2);
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, 48, [14, 14, 0, 0]); ctx.fillStyle = '#121a21'; ctx.fill(); ctx.restore();
  ctx.fillStyle = C.line; ctx.fillRect(x, y + 48, w, 2);
  txt(title, x + 22, y + 25, { size: 18, font: MONO, weight: 400, color: C.dim, align: 'left' });
  ctx.strokeStyle = C.dim; ctx.lineWidth = 1.6; const cx = x + w - 30;
  ctx.beginPath(); ctx.moveTo(cx - 6, y + 19); ctx.lineTo(cx + 6, y + 31); ctx.moveTo(cx + 6, y + 19); ctx.lineTo(cx - 6, y + 31);
  ctx.strokeRect(cx - 56, y + 19, 12, 12); ctx.moveTo(cx - 106, y + 25); ctx.lineTo(cx - 94, y + 25); ctx.stroke();
  ctx.restore();
}

// ---------- the crab ----------
const CRAB = [[40,140,240,100],[50,240,30,40],[100,240,30,40],[190,240,30,40],[240,240,30,40],
  [80,110,50,30],[60,80,50,30],[40,50,50,30],[30,30,30,20],[190,110,50,30],[210,80,50,30],[230,50,50,30],[260,30,30,20]];
const EYES = [[80,160,40,40],[200,160,40,40]];
const groupOf = i => i === 0 ? 'body' : i <= 4 ? 'leg' + i : i <= 8 ? 'armL' : 'armR';
const CELLS = (() => {
  const r = rng(42), cells = [];
  CRAB.forEach(([x, y, w, h], ri) => {
    for (let cy = y; cy < y + h; cy += 10) for (let cx = x; cx < x + w; cx += 10) {
      const a = r() * Math.PI * 2, d = 500 + r() * 900;
      const dist = Math.hypot(cx - 160, cy - 155) / 180;
      cells.push({ x: cx, y: cy, sx: cx + Math.cos(a) * d, sy: cy + Math.sin(a) * d, rot: (r() - .5) * 12,
                   delay: clamp(dist * .55 + r() * .35), eye: false });
    }
  });
  return cells;
})();
function crabXform(group, arm, leg, legAmp) {
  if (group === 'armL') { ctx.translate(110, 140); ctx.rotate(-arm); ctx.translate(-110, -140); }
  else if (group === 'armR') { ctx.translate(210, 140); ctx.rotate(arm); ctx.translate(-210, -140); }
  else if (group.startsWith('leg')) { const i = +group.slice(3); ctx.translate(0, -Math.max(0, Math.sin(leg + (i % 2) * Math.PI)) * legAmp); }
}
function crab(o) {
  const { x, y, s, assemble = 1, arm = 0, leg = 0, legAmp = 0, blink = 0, alpha = 1, glow = 0, color = C.teal, rot = 0 } = o;
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s); ctx.translate(-160, -155);
  if (assemble < 1) {
    ctx.fillStyle = color;
    for (const c of CELLS) {
      const p = E.out3(clamp((assemble - c.delay * .55) / .45)); if (p <= 0) continue;
      ctx.save(); ctx.globalAlpha *= Math.min(1, p * 2.5);
      ctx.translate(lerp(c.sx, c.x, p) + 5, lerp(c.sy, c.y, p) + 5); ctx.rotate(c.rot * (1 - p));
      const sz = 10 + (1 - p) * 6; ctx.fillRect(-sz / 2, -sz / 2, sz + .6, sz + .6); ctx.restore();
    }
  } else {
    if (glow > 0) { ctx.shadowColor = color; ctx.shadowBlur = 50 * glow; }
    ctx.fillStyle = color;
    CRAB.forEach(([rx, ry, rw, rh], i) => { ctx.save(); crabXform(groupOf(i), arm, leg, legAmp); ctx.fillRect(rx, ry, rw + .5, rh + .5); ctx.restore(); });
    ctx.shadowColor = 'transparent';
  }
  const eyeA = clamp((assemble - .85) / .15);
  if (eyeA > 0) {
    ctx.globalAlpha *= eyeA; ctx.fillStyle = '#05080a';
    EYES.forEach(([ex, ey, ew, eh]) => { const hh = eh * (1 - .9 * blink); ctx.fillRect(ex, ey + (eh - hh) / 2, ew, hh); });
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    EYES.forEach(([ex, ey]) => { if (blink < .5) ctx.fillRect(ex + 24, ey + 6, 10, 10); });
  }
  ctx.restore();
}
const snip = (t, times, amp = .35, dur = .22) => times.reduce((a, at) => a + bump(t, at, dur) * amp, 0);
const blinkAt = (t, times) => times.reduce((a, at) => Math.max(a, bump(t, at, .18)), 0);
function bg(t, gx = 960, gy = 540, gc = '61,214,176', ga = .12, dots = .06) {
  ctx.fillStyle = C.bg; ctx.fillRect(-60, -60, W + 120, H + 120);
  if (ga > 0) { const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 950);
    g.addColorStop(0, `rgba(${gc},${ga})`); g.addColorStop(1, `rgba(${gc},0)`); ctx.fillStyle = g; ctx.fillRect(-60, -60, W + 120, H + 120); }
  if (dots > 0) { ctx.fillStyle = `rgba(255,255,255,${dots})`; const off = (t * 24) % 48;
    for (let y = -48 + off; y < H + 48; y += 48) for (let x = 12; x < W; x += 48) ctx.fillRect(x, y, 2, 2); }
}
const GRAIN = [0, 1, 2, 3].map(k => { const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), d = g.createImageData(256, 256), r = rng(100 + k);
  for (let i = 0; i < d.data.length; i += 4) { const v = r() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
  g.putImageData(d, 0, 0); return c; });
const WIPE = (() => { const r = rng(77), out = []; for (let y = 0; y < H; y += 60) for (let x = 0; x < W; x += 60) out.push({ x, y, d: r() * .55 + (x / W) * .45 }); return out; })();
function pixelWipe(t, at, dur, reverse) {
  ctx.fillStyle = C.teal;
  for (const b of WIPE) { let p = clamp((t - at - b.d * dur) / (dur * .35)); if (reverse) p = 1 - p; if (p <= 0) continue;
    const s = 60 * E.out3(p); ctx.fillRect(b.x + (60 - s) / 2, b.y + (60 - s) / 2, s + .5, s + .5); }
}
