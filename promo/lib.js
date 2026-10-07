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

const DARK = '#04140f';

function slash(t, at, ang, sep, drawFn) {
  const sp = E.out3(P(t, at + .1, at + .6)) * sep, nx = -Math.sin(ang), ny = Math.cos(ang);
  for (const side of [-1, 1]) {
    ctx.save(); ctx.beginPath();
    if (side < 0) { ctx.moveTo(-1500, -1500); ctx.lineTo(1500, -1500); ctx.lineTo(1500, 1500 * Math.tan(ang)); ctx.lineTo(-1500, -1500 * Math.tan(ang)); }
    else { ctx.moveTo(-1500, 1500); ctx.lineTo(1500, 1500); ctx.lineTo(1500, 1500 * Math.tan(ang)); ctx.lineTo(-1500, -1500 * Math.tan(ang)); }
    ctx.closePath(); ctx.clip(); ctx.translate(side * nx * sp + side * sp * .6, side * ny * sp); drawFn(); ctx.restore();
  }
  const cut = P(t, at, at + .12), a = 1 - P(t, at + .12, at + .4);
  if (a > 0) { ctx.save(); ctx.rotate(ang); ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.fillRect(-900, -3, 1800 * E.out3(cut), 6); ctx.restore(); }
}

function lockup(t, { tag = "Highlight it. It's copied.", foot = true } = {}) {
  bg(t, 960, 500, '61,214,176', .16 + .04 * beatPulse(t, .5, 8), .05);
  const asm = E.out3(P(t, 0, .7));
  crab({ x: 640, y: 470, s: 1.0, assemble: asm, arm: snip(t, [.75, 1.6], .35) + .05 * beatPulse(t, .5, 8), blink: blinkAt(t, [1.3]), glow: asm >= 1 ? .7 : 0 });
  const rv = E.io3(P(t, .3, .9));
  ctx.save(); ctx.beginPath(); ctx.rect(830, 300, 1000 * rv, 260); ctx.clip();
  glitchTxt('SNIPY', 830 + (1 - rv) * -200, 440, { size: 230, align: 'left', ls: 24 }, 2 + 6 * bump(t, .9, .3));
  ctx.restore();
  const tg = E.out3(P(t, .9, 1.3));
  txt(tag, 838, 600 + (1 - tg) * 30, { size: 50, weight: 500, color: C.teal, align: 'left', alpha: tg });
  if (!foot) return;
  const ft = P(t, 1.3, 1.7), items = ['Rust', 'Windows', 'v0.1.0'];
  ctx.save(); ctx.globalAlpha = ft; let x = 960 - (items.join('').length * 15.6 + 2 * 60) / 2;
  items.forEach((s, i) => { txt(s, x, 880, { size: 26, font: MONO, weight: 400, color: C.dim, align: 'left' }); x += s.length * 15.6 + 30;
    if (i < items.length - 1) { ctx.fillStyle = C.teal; ctx.fillRect(x - 4, 876, 8, 8); x += 30; } });
  ctx.restore();
}

function appWin(t, at, x, y, title, pre, hit, post) {
  const u = t - at; if (u < 0) return;
  const p = E.outBack(clamp(u / .45)), AW = 780, AH = 300;
  ctx.save(); ctx.translate(x + AW / 2, y + AH / 2 + (1 - p) * 40); ctx.scale(lerp(.82, 1, p), lerp(.82, 1, p)); ctx.translate(-AW / 2, -AH / 2);
  ctx.globalAlpha *= clamp(u / .12);
  win(0, 0, AW, AH, title, 1);
  const glow = u >= 1 ? Math.exp(-(u - 1) * 2.5) : 0;
  if (glow > 0) { ctx.save(); ctx.shadowColor = C.teal; ctx.shadowBlur = 40 * glow; rrect(0, 0, AW, AH, 14, null, `rgba(61,214,176,${glow})`, 3); ctx.restore(); }
  ctx.font = `400 34px ${MONO}`; const cw = ctx.measureText('M').width, x0 = 44, y0 = 175;
  const sp = E.io3(P(u, .35, .85));
  if (sp > 0) { ctx.fillStyle = `rgba(61,214,176,${.3 + .4 * glow})`; ctx.fillRect(x0 + pre.length * cw - 2, y0 - 26, hit.length * sp * cw + 4, 52); }
  txt(pre + hit + post, x0, y0, { size: 34, font: MONO, weight: 400, align: 'left' });
  ibeam(x0 + (pre.length + hit.length * sp) * cw, y0, 44, clamp((u - .12) / .1) * (1 - P(u, 1.15, 1.35)));
  ripple(x0 + pre.length * cw, y0, t, at + .35); ripple(x0 + (pre.length + hit.length) * cw, y0, t, at + .85);
  if (u >= .9) { const b = E.outBack(P(u, .9, 1.2)); ctx.save(); ctx.translate(AW - 250, 25); ctx.scale(b, b);
    rrect(-64, -16, 128, 32, 16, C.teal); txt('COPIED ✓', 0, 1, { size: 15, font: MONO, color: DARK }); ctx.restore(); }
  ctx.restore();
}


function toastPill(x, y, s = 1, alpha = 1) {
  if (alpha <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.translate(x, y); ctx.scale(s, s);
  ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 8;
  rrect(-75, -26, 150, 52, 26, '#0E141A', 'rgba(61,214,176,.55)', 2); ctx.shadowColor = 'transparent';
  ctx.strokeStyle = C.teal; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-48, 1); ctx.lineTo(-40, 9); ctx.lineTo(-27, -7); ctx.stroke();
  txt('Copied', 14, 1, { size: 24, weight: 500 }); ctx.restore();
}

function shine(p, drawFn) {
  const m = ctx.getTransform();
  bctx.setTransform(1, 0, 0, 1, 0, 0); bctx.clearRect(0, 0, W, H);
  ctx = bctx; ctx.setTransform(m); drawFn(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (p > 0 && p < 1) {
    const x = lerp(-500, W + 500, p), g = ctx.createLinearGradient(x - 220, 0, x + 220, 260);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
  }
  ctx = mainCtx; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(buf, 0, 0); ctx.restore();
}

function follow(t, pts, ease = E.io3) {
  let x = pts[0][1], y = pts[0][2];
  for (let i = 0; i < pts.length - 1; i++) { const [ta, xa, ya] = pts[i], [tb, xb, yb] = pts[i + 1];
    if (t >= ta) { const p = ease(P(t, ta, tb)); x = lerp(xa, xb, p); y = lerp(ya, yb, p); } }
  return [x, y];
}

const SF = '"Inter", "Space Grotesk", sans-serif';
const buf2 = document.createElement('canvas'); buf2.width = W; buf2.height = H; const b2ctx = buf2.getContext('2d');
const acc = document.createElement('canvas'); acc.width = W; acc.height = H; const actx = acc.getContext('2d');

const VOX = (() => {
  const set = new Map(), key3 = (x, y, z) => x + ',' + y + ',' + z, r = rng(11);
  const inEye = (cx, cy) => EYES.some(([ex, ey, ew, eh]) => cx * 10 >= ex && cx * 10 < ex + ew && cy * 10 >= ey && cy * 10 < ey + eh);
  const isGlint = (cx, cy) => EYES.some(([ex, ey]) => cx * 10 === ex + 20 && cy * 10 === ey);
  CRAB.forEach(([rx, ry, rw, rh], ri) => {
    const g = groupOf(ri), z0 = ri === 0 ? 0 : 1, z1 = ri === 0 ? 3 : 2;
    for (let cy = ry / 10; cy < (ry + rh) / 10; cy++) for (let cx = rx / 10; cx < (rx + rw) / 10; cx++)
      for (let z = z0; z <= z1; z++) {
        if (ri === 0 && z === 3 && inEye(cx, cy)) continue;
        const a = r() * Math.PI * 2, b = (r() - .5) * 2, d = 50 + r() * 60;
        set.set(key3(cx, cy, z), { x: cx, y: cy, z, g, eye: ri === 0 && inEye(cx, cy), glint: isGlint(cx, cy),
          start: [Math.cos(a) * d, Math.sin(a) * d * .7, b * d], delay: clamp(Math.hypot(cx - 16, cy - 15.5) / 14 * .55 + r() * .4) });
      }
  });
  const vox = [...set.values()], faces = [];
  vox.forEach((v, vi) => {
    for (const n of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      if (set.has(key3(v.x + n[0], v.y + n[1], v.z + n[2]))) continue;
      const u = n[0] ? [0, 1, 0] : n[1] ? [1, 0, 0] : [1, 0, 0], w = n[2] ? [0, 1, 0] : [0, 0, 1];
      const c = [v.x + .5 + n[0] * .5, v.y + .5 + n[1] * .5, v.z + .5 + n[2] * .5];
      const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([a, b]) => [0, 1, 2].map(i => c[i] + u[i] * a * .5 + w[i] * b * .5));
      faces.push({ vi, n, corners, col: n[2] === 1 && v.eye ? (v.glint ? [205, 214, 218] : [6, 9, 11]) : null });
    }
  });
  return { vox, faces };
})();

function crab3d(o) {
  const { x, y, s = 14, yaw = 0, pitch = -.12, assemble = 1, light = 0, alpha = 1, arm = 0, leg = 0, legAmp = 0, rgb = [61, 214, 176], fov = 70, glint = null } = o;
  if (alpha <= 0) return;
  const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const Ld = [Math.sin(light) * .7 - .15, -.62, Math.cos(light) * .7 + .35], ll = Math.hypot(...Ld); Ld.forEach((v, i) => Ld[i] = v / ll);
  const rot = ([px, py, pz]) => { const x1 = px * cyw + pz * syw, z1 = -px * syw + pz * cyw; return [x1, py * cp - z1 * sp, py * sp + z1 * cp]; };
  const pv = VOX.vox.map(v => E.out3(clamp((assemble - v.delay * .55) / .45)));
  const grp = VOX.vox.map(v => {
    if (v.g === 'armL') return { ang: -arm, px: 11, py: 14, dy: 0 };
    if (v.g === 'armR') return { ang: arm, px: 21, py: 14, dy: 0 };
    if (v.g.startsWith('leg')) return { ang: 0, px: 0, py: 0, dy: -Math.max(0, Math.sin(leg + (+v.g.slice(3) % 2) * Math.PI)) * legAmp / 10 };
    return { ang: 0, px: 0, py: 0, dy: 0 };
  });
  const out = [];
  for (const f of VOX.faces) {
    const p = pv[f.vi]; if (p <= 0) continue;
    const g = grp[f.vi], v = VOX.vox[f.vi], ca = Math.cos(g.ang), sa = Math.sin(g.ang), k = 1 - p;
    const tf = ([px, py, pz]) => { let X = px, Y = py;
      if (g.ang) { X = g.px + (px - g.px) * ca - (py - g.py) * sa; Y = g.py + (px - g.px) * sa + (py - g.py) * ca; }
      return rot([X - 16 + v.start[0] * k, Y + g.dy - 15.5 + v.start[1] * k, pz - 2 + v.start[2] * k]); };
    const nr = rot([f.n[0] * ca - f.n[1] * sa, f.n[0] * sa + f.n[1] * ca, f.n[2]]);
    if (nr[2] <= .001) continue;
    const pts = f.corners.map(tf), zc = (pts[0][2] + pts[2][2]) / 2;
    out.push({ pts, zc, nr, col: f.col, a: clamp(p * 3) });
  }
  out.sort((a, b) => a.zc - b.zc);
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineWidth = 1.1;
  for (const f of out) {
    const d = Math.max(0, f.nr[0] * Ld[0] + f.nr[1] * Ld[1] + f.nr[2] * Ld[2]), br = .2 + .8 * d, rim = Math.max(0, .5 - f.nr[2]) * .9;
    const sxc = x + (f.pts[0][0] + f.pts[2][0]) / 2 * s, gl = glint === null || f.col ? 0 : Math.exp(-(((sxc - (x + glint)) / (s * 6)) ** 2));
    const base = f.col || rgb, c = base.map(v => Math.min(255, v * br + (255 - v * br) * (rim * .55 + gl * .32) | 0));
    ctx.globalAlpha = f.a * alpha; ctx.fillStyle = ctx.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.beginPath(); f.pts.forEach(([px, py, pz], i) => { const kk = fov / (fov - pz), sx = x + px * kk * s, sy = y + py * kk * s; i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy); });
    ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.13)'; ctx.stroke();
  }
  ctx.restore();
}

function reflect(baseY, drawFn, a = .2, h = 220) {
  drawFn();
  b2ctx.setTransform(1, 0, 0, 1, 0, 0); b2ctx.clearRect(0, 0, W, H);
  ctx = b2ctx; ctx.save(); ctx.translate(0, baseY * 2); ctx.scale(1, -1); drawFn(); ctx.restore(); ctx = mainCtx;
  b2ctx.globalCompositeOperation = 'destination-in';
  const g = b2ctx.createLinearGradient(0, baseY, 0, baseY + h); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  b2ctx.fillStyle = g; b2ctx.fillRect(0, 0, W, H); b2ctx.globalCompositeOperation = 'source-over';
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = a; ctx.drawImage(buf2, 0, 0); ctx.restore();
}

function stage(cx, cy, a, rgb = '61,214,176') {
  ctx.fillStyle = '#000'; ctx.fillRect(-60, -60, W + 120, H + 120);
  if (a <= 0) return;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 760); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(.55, `rgba(${rgb},${a * .25})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function rv(s, x, y, t, at, o = {}) {
  const p = E.out3(P(t, at, at + (o.dur ?? .9)));
  if (p <= 0) return;
  const out = o.out ? 1 - P(t, o.out, o.out + .5) : 1;
  ctx.save(); ctx.filter = `blur(${(1 - p) * 12}px)`;
  txt(s, x, y + (1 - p) * 24, { font: SF, weight: 700, ls: -(o.size ?? 100) * .02, ...o, alpha: p * out * (o.alpha ?? 1) }); ctx.restore();
}

function gradFill(cx, w, y0 = 0) {
  const g = ctx.createLinearGradient(cx - w / 2, y0, cx + w / 2, y0); g.addColorStop(0, '#3DD6B0'); g.addColorStop(1, '#F2F8F6'); return g;
}

function finishFrame(T, frame, clip) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  for (const [at, a, c] of clip.flashes || []) { const d = T - at; if (d < 0 || d > 1) continue; ctx.fillStyle = `rgba(${c},${a * Math.exp(-d * 7)})`; ctx.fillRect(0, 0, W, H); }
  const v = ctx.createRadialGradient(W / 2, H / 2, H * .4, W / 2, H / 2, H * 1.05);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${clip.clean ? .4 : .55})`); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  if (!clip.clean) { ctx.save(); ctx.globalAlpha = .05; ctx.globalCompositeOperation = 'overlay';
    const r = rng(frame); ctx.translate(-r() * 256, -r() * 256); ctx.fillStyle = ctx.createPattern(GRAIN[frame % 4], 'repeat'); ctx.fillRect(0, 0, W + 256, H + 256); ctx.restore(); }
  let fade = Math.max(1 - P(T, 0, clip.clean ? .6 : .3), P(T, clip.dur - (clip.clean ? .8 : .5), clip.dur));
  for (const b of clip.dips || []) fade = Math.max(fade, 1 - clamp(Math.abs(T - b) / .3));
  if (fade > 0) { ctx.fillStyle = `rgba(0,0,0,${fade})`; ctx.fillRect(0, 0, W, H); }
}
