// Procedural soundtrack for the Snipy promo. 120 BPM, A minor, 52 s.
// Every hit lines up with an event in index.html (see the SFX list below).
import { writeFileSync } from 'node:fs';

const SR = 44100, DUR = 52, N = SR * DUR;
const mus = [new Float32Array(N), new Float32Array(N)];   // ducked by kick
const drm = [new Float32Array(N), new Float32Array(N)];   // drums / fx
const dly = [new Float32Array(N), new Float32Array(N)];   // send to ping-pong delay

let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const lpA = fc => 1 - Math.exp(-2 * Math.PI * fc / SR);
const add = (bus, i, v, pan = 0) => { if (i < 0 || i >= N) return; bus[0][i] += v * (1 - pan) * 0.5 * 2 ** 0.5; bus[1][i] += v * (1 + pan) * 0.5 * 2 ** 0.5; };
const inR = (t, a, b) => t >= a && t < b;

// ---------- arrangement ----------
const PROG = [ // Am F C G (one bar = 2 s)
  { root: 45, pad: [57, 60, 64, 69], arp: [69, 72, 76, 81] },
  { root: 41, pad: [53, 57, 60, 65], arp: [65, 69, 72, 77] },
  { root: 48, pad: [55, 60, 64, 67], arp: [67, 72, 76, 79] },
  { root: 43, pad: [55, 59, 62, 67], arp: [67, 71, 74, 79] },
];
const chordAt = t => PROG[Math.floor(t / 2) % 4];

// ---------- instruments ----------
function saw(bus, t0, dur, f, amp, { cut = 1200, cutEnv = 0, att = 0.01, rel = 0.1, det = 0, pan = 0, send = 0 } = {}) {
  const i0 = Math.floor(t0 * SR), n = Math.floor((dur + rel) * SR);
  let ph1 = Math.random(), ph2 = Math.random(), y = 0, y2 = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const env = Math.min(1, t / att) * (t > dur ? Math.max(0, 1 - (t - dur) / rel) : 1);
    ph1 += f * (1 + det) / SR; ph2 += f * (1 - det) / SR; ph1 %= 1; ph2 %= 1;
    const x = (ph1 * 2 - 1) + (det ? (ph2 * 2 - 1) : 0);
    const a = lpA(cut + cutEnv * Math.exp(-t * 18));
    y += a * (x - y); y2 += a * (y - y2);
    const v = y2 * amp * env;
    add(bus, i0 + k, v, pan);
    if (send) add(dly, i0 + k, v * send, pan);
  }
}
function pluck(t0, f, amp, pan) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(0.35 * SR);
  let ph = 0, y = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR; ph = (ph + f / SR) % 1;
    const x = ph < 0.5 ? 1 : -1;
    y += lpA(600 + 5000 * Math.exp(-t * 25)) * (x - y);
    const v = y * amp * Math.exp(-t * 9);
    add(mus, i0 + k, v, pan); add(dly, i0 + k, v * 0.5, -pan);
  }
}
function kick(t0, amp = 1) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(0.4 * SR); let ph = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR; ph += (48 + 110 * Math.exp(-t * 28)) / SR;
    add(drm, i0 + k, Math.tanh(Math.sin(2 * Math.PI * ph) * 1.6) * Math.exp(-t * 7) * amp * 0.9 + (k < 40 ? rnd() * 0.3 * amp : 0));
  }
}
function noiseHit(t0, dur, amp, { hp = 0.0, lp = 9000, dec = 20, pan = 0, send = 0, claps = 0 } = {}) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR); let y = 0, z = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR, x = rnd();
    y += lpA(lp) * (x - y); z += lpA(hp || 1) * (y - z);
    const s = hp ? y - z : y;
    let env = Math.exp(-t * dec);
    if (claps) { const c = Math.floor(t / 0.011); if (c < claps) env = Math.exp(-(t - c * 0.011) * 90); }
    add(drm, i0 + k, s * amp * env, pan);
    if (send) add(dly, i0 + k, s * amp * env * send, pan);
  }
}
function boom(t0, amp = 1) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(2.2 * SR); let ph = 0, y = 0;
  for (let k = 0; k < n; k++) {
    const t = k / SR; ph += (38 + 70 * Math.exp(-t * 6)) / SR;
    y += lpA(1800 * Math.exp(-t * 3) + 80) * (rnd() - y);
    add(drm, i0 + k, (Math.sin(2 * Math.PI * ph) * Math.exp(-t * 1.6) * 0.9 + y * Math.exp(-t * 2.5) * 0.9) * amp);
  }
}
function riser(t0, t1, amp = 0.5) {
  const i0 = Math.floor(t0 * SR), n = Math.floor((t1 - t0) * SR); let y = 0, ph = 0;
  for (let k = 0; k < n; k++) {
    const p = k / n; y += lpA(150 + 9000 * p * p) * (rnd() - y);
    ph += (200 + 1400 * p * p) / SR;
    const v = (y * 1.4 + Math.sin(2 * Math.PI * ph) * 0.12) * amp * p * p;
    add(drm, i0 + k, v, Math.sin(p * 30) * 0.5);
  }
}
function click(t0, amp = 0.35, f = 2400) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(0.05 * SR);
  for (let k = 0; k < n; k++) { const t = k / SR; add(drm, i0 + k, (Math.sin(2 * Math.PI * f * t) * 0.6 + rnd() * 0.4) * Math.exp(-t * 140) * amp, 0.2); }
}
function slam(t0, amp = 0.6) { // keycap thunk
  const i0 = Math.floor(t0 * SR), n = Math.floor(0.18 * SR); let ph = 0;
  for (let k = 0; k < n; k++) { const t = k / SR; ph += (120 + 260 * Math.exp(-t * 40)) / SR; add(drm, i0 + k, (Math.sin(2 * Math.PI * ph) * Math.exp(-t * 22) + rnd() * Math.exp(-t * 80) * 0.5) * amp); }
}
function swoosh(t0, dur = 0.45, amp = 0.25) {
  const i0 = Math.floor(t0 * SR), n = Math.floor(dur * SR); let y = 0;
  for (let k = 0; k < n; k++) { const p = k / n; y += lpA(500 + 6000 * Math.sin(p * Math.PI)) * (rnd() - y); add(drm, i0 + k, y * Math.sin(p * Math.PI) * amp, p * 1.6 - 0.8); }
}
function chime(t0, amp = 0.22) { // "copied" ding
  for (const [m, d] of [[88, 0], [95, 0.06]]) {
    const i0 = Math.floor((t0 + d) * SR), n = Math.floor(0.6 * SR), f = mtof(m);
    for (let k = 0; k < n; k++) { const t = k / SR; const v = (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(4 * Math.PI * f * t)) * Math.exp(-t * 7) * amp; add(mus, i0 + k, v, 0.3); add(dly, i0 + k, v * 0.5, -0.3); }
  }
}

// ---------- score ----------
const kicks = [];
const K = (t, a) => { kick(t, a); kicks.push(t); };

// Pads
for (let b = 0; b < 26; b++) {
  const t = b * 2; if (inR(t, 12, 14) || t >= 50) continue;
  const ch = chordAt(t), amp = t < 6 ? 0.06 : t < 12 ? 0.05 : inR(t, 40, 44) ? 0.085 : 0.06;
  const notes = inR(t, 6, 12) ? [57, 60, 64] : ch.pad;   // problem section: stuck on Am
  for (const m of notes) saw(mus, t, 2, mtof(m), amp, { cut: t < 14 ? 700 : 1500, att: 0.25, rel: 0.4, det: 0.006, pan: (m % 3 - 1) * 0.5, send: 0.2 });
}
// final chord
for (const m of [45, 57, 60, 64, 69, 76]) saw(mus, 50, 1.2, mtof(m), 0.07, { cut: 1600, att: 0.02, rel: 1.6, det: 0.006, send: 0.4 });

// Arp (16ths)
for (let s = 0; s < DUR * 8; s++) {
  const t = s / 8;
  const on = inR(t, 0.6, 6) || inR(t, 14, 44) || inR(t, 47, 50);
  if (!on) continue;
  const ch = chordAt(t), pat = [0, 1, 2, 3, 2, 1, 2, 3][s % 8] + (Math.floor(t / 4) % 2 && s % 8 === 7 ? 1 : 0);
  const m = ch.arp[Math.min(3, pat)] + (pat > 3 ? 12 : 0);
  const amp = t < 6 ? 0.05 * Math.min(1, (t - 0.6) / 2.4) : inR(t, 40, 44) ? 0.07 : 0.06;
  pluck(t, mtof(m), amp, s % 2 ? 0.35 : -0.35);
}

// Problem section (6–12): tense ticking + pulse
for (let s = 0; s < 6 * 8; s++) {
  const t = 6 + s / 8;
  saw(mus, t, 0.1, mtof(33), 0.17, { cut: 300, cutEnv: 900, rel: 0.05 });
  noiseHit(t, 0.03, s % 2 ? 0.05 : 0.09, { hp: 7000, dec: 120, pan: 0.3 });
}
for (let t = 6; t < 12; t += 1) K(t, 0.9);

// Main groove
const groove = (a, b) => {
  for (let t = a; t < b - 1e-6; t += 0.5) {
    K(t, 1);
    if (Math.round(t * 2) % 2 === 1) noiseHit(t, 0.25, 0.32, { hp: 900, lp: 7000, dec: 16, claps: 3, send: 0.15 });
    noiseHit(t + 0.25, 0.06, 0.12, { hp: 8000, dec: 60, pan: -0.3 });
    noiseHit(t + 0.125, 0.03, 0.04, { hp: 9000, dec: 120, pan: 0.4 });
    noiseHit(t + 0.375, 0.03, 0.04, { hp: 9000, dec: 120, pan: 0.4 });
    const r = chordAt(t).root;   // offbeat bass
    saw(mus, t + 0.25, 0.2, mtof(r - 12), 0.22, { cut: 260, cutEnv: 1300, rel: 0.04, det: 0.004 });
    saw(mus, t, 0.08, mtof(r - 12), 0.12, { cut: 200, cutEnv: 500, rel: 0.03 });
  }
};
groove(14, 41); groove(47, 50);
// breakdown 41-44: only half-time kicks
for (let t = 42; t < 44; t += 1) K(t, 0.6);

// Impacts & transitions
riser(1.0, 3.0, 0.35); boom(3.0, 1.0);
riser(12.2, 14.0, 0.55); boom(14.0, 1.15); K(14, 1);
boom(26.0, 0.8); boom(36.0, 0.7);
riser(42.4, 44.0, 0.5);
for (const t of [44, 45, 46]) { boom(t, 0.9); kick(t, 1.1); kicks.push(t); }
noiseHit(45.25, 0.25, 0.35, { hp: 3000, dec: 14 });   // the SNIP slice
boom(47.0, 0.8); boom(50.0, 0.5);

// UI sfx synced to visuals
[6.6, 7.3].forEach(t => click(t));            // old-way drag
slam(7.6); slam(7.85);                        // CTRL, C
[8.5, 9, 9.5, 10, 10.5, 11, 11.5].forEach((t, i) => slam(t, 0.25 + i * 0.05));
noiseHit(12.0, 0.4, 0.3, { hp: 2000, dec: 8 });  // freeze glitch
[16.3, 17.1].forEach(t => click(t)); swoosh(17.15); chime(17.8);
[19.5, 19.7].forEach(t => click(t)); swoosh(19.8); chime(20.45);
slam(22.2, 0.4); slam(22.4, 0.4); swoosh(23.0); chime(23.65);
swoosh(25.4, 0.6, 0.3);
for (let i = 0; i < 6; i++) slam(36 + i * 0.5, 0.25);
click(42.2, 0.25); click(42.7, 0.3); swoosh(40.8, 0.5, 0.25);
for (let i = 0; i < 8; i++) click(29.5 + i, 0.12, 3200);  // pipeline packets

// ---------- delay + mix ----------
const D = Math.floor(0.375 * SR);
for (let i = D; i < N; i++) { dly[0][i] += dly[1][i - D] * 0.38; dly[1][i] += dly[0][i - D] * 0.38; }
const duck = new Float32Array(N).fill(1);
for (const t of kicks) { const i0 = Math.floor(t * SR); for (let k = 0; k < SR * 0.4 && i0 + k < N; k++) duck[i0 + k] = Math.min(duck[i0 + k], 1 - 0.65 * Math.exp(-k / SR * 9)); }

const out = Buffer.alloc(44 + N * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVEfmt ', 8);
out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24);
out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34); out.write('data', 36); out.writeUInt32LE(N * 4, 40);
let peak = 0; const mix = [new Float32Array(N), new Float32Array(N)];
for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) {
  const fade = i / SR > 51 ? Math.max(0, 52 - i / SR) : 1;
  mix[c][i] = Math.tanh(((mus[c][i] + dly[c][i] * 0.35) * duck[i] + drm[c][i]) * 0.9) * fade;
  peak = Math.max(peak, Math.abs(mix[c][i]));
}
const g = 0.94 / peak;
for (let i = 0; i < N; i++) for (let c = 0; c < 2; c++) out.writeInt16LE(Math.round(mix[c][i] * g * 32767), 44 + i * 4 + c * 2);
writeFileSync(new URL('./music.wav', import.meta.url), out);
console.log('music.wav written, peak', peak.toFixed(2));
