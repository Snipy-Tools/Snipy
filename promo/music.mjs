// Soundtrack for the Snipy promo — 120 BPM, A minor, 48 s, 48 kHz stereo.
// Band-limited oscillators, RBJ biquads, Freeverb, ping-pong delay, sidechain, glue comp + limiter.
// Every hit is timed to an event in index.html (see "SFX" below).
import { writeFileSync } from 'node:fs';

const SR = 48000, DUR = 48, N = SR * DUR, TAU = Math.PI * 2;
const GAIN_DB = +(process.env.GAIN_DB ?? -1);           // pre-limiter drive; tuned for ~-14 LUFS
let seed = 1; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2147483648 - 1;
const mtof = m => 440 * 2 ** ((m - 69) / 12), db = x => 10 ** (x / 20);
const panLR = p => [Math.cos((p + 1) * Math.PI / 4) * Math.SQRT2, Math.sin((p + 1) * Math.PI / 4) * Math.SQRT2];

class Bus { constructor() { this.L = new Float32Array(N); this.R = new Float32Array(N); }
  add(i, v, p = 0) { if (i < 0 || i >= N) return; const [l, r] = panLR(p); this.L[i] += v * l; this.R[i] += v * r; }
  add2(i, l, r) { if (i >= 0 && i < N) { this.L[i] += l; this.R[i] += r; } } }
const B = { pad: new Bus(), arp: new Bus(), bass: new Bus(), lead: new Bus(), kick: new Bus(), drums: new Bus(), fx: new Bus(), verb: new Bus(), echo: new Bus() };

class BQ { constructor(type, f, q = .707, g = 0) { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(type, f, q, g); }
  set(type, f, q = .707, g = 0) {
    f = Math.min(Math.max(f, 10), SR * .45); const w = TAU * f / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * q); let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else { const A = 10 ** (g / 40), s = 2 * Math.sqrt(A) * al;   // high shelf
      b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s);
      a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s; }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0; return this; }
  p(x) { const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y; return y; } }

const blep = (t, dt) => t < dt ? (t /= dt, t + t - t * t - 1) : t > 1 - dt ? (t = (t - 1) / dt, t * t + t + t + 1) : 0;
class Saw { constructor(f) { this.ph = Math.random(); this.f = f; }
  next(f = this.f) { const dt = f / SR; this.ph += dt; if (this.ph >= 1) this.ph -= 1; return 2 * this.ph - 1 - blep(this.ph, dt); } }
const env = (t, len, a, r) => t < 0 ? 0 : Math.min(1, t / a) * (t > len ? Math.max(0, 1 - (t - len) / r) : 1);
const smooth = x => x * x * (3 - 2 * x);

// ---------- harmony ----------
const PROG = [ // Am9 – Fmaj9 – C – G
  { root: 33, pad: [57, 60, 64, 67, 71], arp: [69, 72, 76, 79] },
  { root: 29, pad: [53, 57, 60, 64, 67], arp: [65, 69, 72, 76] },
  { root: 36, pad: [52, 55, 60, 64, 67], arp: [67, 72, 76, 79] },
  { root: 31, pad: [55, 59, 62, 67, 71], arp: [67, 71, 74, 79] }];
const chordAt = t => PROG[Math.floor(t / 2 + 1e-9) % 4];

// ---------- instruments ----------
function pad(t0, len, notes, amp) {
  const DET = [-.0085, -.004, 0, .004, .0085], PAN = [-.85, -.4, 0, .4, .85], rel = 1.0;
  for (const m of notes) { const oscs = DET.map(d => new Saw(mtof(m) * (1 + d)));
    const i0 = Math.round(t0 * SR), n = Math.round((len + rel) * SR);
    for (let k = 0; k < n; k++) { const e = smooth(env(k / SR, len, .45, rel)) * amp; if (!e) continue;
      let l = 0, r = 0; for (let v = 0; v < 5; v++) { const s = oscs[v].next(), [pl, pr] = panLR(PAN[v]); l += s * pl; r += s * pr; }
      B.pad.add2(i0 + k, l * e * .2, r * e * .2); } }
}
function pluck(t0, f, amp, pan, bright = 1) {
  const a = new Saw(f), b = new Saw(f * 2.004), flt = new BQ('lp', 3000, 2), i0 = Math.round(t0 * SR), n = Math.round(.55 * SR);
  for (let k = 0; k < n; k++) { const t = k / SR; if (k % 16 === 0) flt.set('lp', 350 + 4200 * bright * Math.exp(-t * 16), 2.2);
    const v = flt.p(a.next() + .35 * b.next()) * Math.min(1, t / .003) * Math.exp(-t * 6.5) * amp; B.arp.add(i0 + k, v, pan); }
}
function lead(t0, len, m, amp) {
  const f = mtof(m), o = [new Saw(f * 1.0035), new Saw(f / 1.0035), new Saw(f / 2)], flt = new BQ('lp', 2000, 1.6);
  const i0 = Math.round(t0 * SR), n = Math.round((len + .12) * SR);
  for (let k = 0; k < n; k++) { const t = k / SR; if (k % 16 === 0) flt.set('lp', 900 + 3800 * Math.exp(-t * 7), 1.6);
    const vib = 1 + .004 * Math.sin(TAU * 5.5 * t) * Math.min(1, Math.max(0, (t - .15) * 4));
    const s = o[0].next(f * 1.0035 * vib) + o[1].next(f / 1.0035 * vib) + .5 * o[2].next(f / 2 * vib);
    const v = flt.p(s) * smooth(env(t, len, .006, .12)) * amp; B.lead.add2(i0 + k, v * .9, v * 1.0); }
}
function bass(t0, len, root, amp) {
  const f = mtof(root), saw = new Saw(f * 2), flt = new BQ('lp', 600, 1.2), i0 = Math.round(t0 * SR), n = Math.round((len + .03) * SR); let ph = 0;
  for (let k = 0; k < n; k++) { const t = k / SR; ph += f / SR; if (k % 16 === 0) flt.set('lp', 220 + 1100 * Math.exp(-t * 18), 1.4);
    const e = env(t, len, .004, .03); B.bass.add(i0 + k, (Math.sin(TAU * ph) * .9 + flt.p(saw.next()) * .45) * e * amp); }
}
const kicks = [];
function kick(t0, amp = 1) {
  kicks.push(t0); const i0 = Math.round(t0 * SR), n = Math.round(.5 * SR); let ph = 0; const hp = new BQ('hp', 2500, .7);
  for (let k = 0; k < n; k++) { const t = k / SR; ph += (46 + 120 * Math.exp(-t * 32) + 60 * Math.exp(-t * 200)) / SR;
    const body = Math.tanh(Math.sin(TAU * ph) * 1.3) / Math.tanh(1.3) * (t < .02 ? 1 : Math.exp(-(t - .02) * 6.5));
    const click = hp.p(rnd()) * Math.exp(-t * 300) * .5;
    B.kick.add(i0 + k, (body + click) * amp * .95); }
}
function clap(t0, amp = 1) {
  const bp = new BQ('bp', 1250, .9), hp = new BQ('hp', 500), i0 = Math.round(t0 * SR), n = Math.round(.35 * SR);
  for (let k = 0; k < n; k++) { const t = k / SR, c = Math.floor(t / .009);
    const e = c < 3 ? Math.exp(-(t - c * .009) * 160) : Math.exp(-(t - .027) * 16);
    const v = hp.p(bp.p(rnd())) * e * amp * 1.7; B.drums.add(i0 + k, v, .05); B.verb.add(i0 + k, v * .45); }
}
function snare(t0, amp = 1) {
  const bp = new BQ('bp', 2200, .7), i0 = Math.round(t0 * SR), n = Math.round(.22 * SR); let ph = 0;
  for (let k = 0; k < n; k++) { const t = k / SR; ph += (185 + 60 * Math.exp(-t * 40)) / SR;
    const v = (bp.p(rnd()) * 1.4 * Math.exp(-t * 18) + Math.sin(TAU * ph) * .5 * Math.exp(-t * 30)) * amp;
    B.drums.add(i0 + k, v, -.05); B.verb.add(i0 + k, v * .3); }
}
const HATF = [205.3, 304.4, 369.6, 522.7, 540, 800].map(f => f * 1.9);
function hat(t0, amp = 1, open = false, pan = .25) {
  const hp = new BQ('hp', 7500, .8), bp = new BQ('bp', 10500, .6), i0 = Math.round(t0 * SR), n = Math.round((open ? .35 : .06) * SR);
  const ph = HATF.map(() => Math.random());
  for (let k = 0; k < n; k++) { const t = k / SR; let s = 0;
    for (let j = 0; j < 6; j++) { ph[j] = (ph[j] + HATF[j] / SR) % 1; s += ph[j] < .5 ? 1 : -1; }
    const v = hp.p(bp.p(s * .15 + rnd() * .5)) * Math.exp(-t * (open ? 12 : 70)) * amp * .9;
    B.drums.add(i0 + k, v, pan); }
}
function impact(t0, amp = 1) {
  const hp = new BQ('hp', 2500, .7), lp = new BQ('lp', 9000), i0 = Math.round(t0 * SR), n = Math.round(2.5 * SR); let ph = 0;
  for (let k = 0; k < n; k++) { const t = k / SR; ph += (34 + 60 * Math.exp(-t * 7)) / SR;
    const sub = Math.sin(TAU * ph) * Math.exp(-t * 1.8) * .9;
    const crash = lp.p(hp.p(rnd())) * Math.exp(-t * 2.2) * .35;
    B.fx.add(i0 + k, (sub + crash) * amp); B.verb.add(i0 + k, crash * amp * .9); }
}
function riser(t0, t1, amp = 1) {
  const bp = new BQ('bp', 400, 2.5), i0 = Math.round(t0 * SR), n = Math.round((t1 - t0) * SR), o = new Saw(100);
  for (let k = 0; k < n; k++) { const p = k / n; if (k % 32 === 0) bp.set('bp', 300 + 9000 * p * p, 2.5);
    const v = (bp.p(rnd()) * 1.2 + o.next(110 * 2 ** (p * 3)) * .04 * p) * amp * p * p;
    B.fx.add(i0 + k, v, Math.sin(p * 24) * .4); B.verb.add(i0 + k, v * .6); }
}
function roll(t0, t1, amp = .6) {   // snare roll that speeds up into the drop
  let t = t0; while (t < t1 - 1e-6) { const p = (t - t0) / (t1 - t0); snare(t, amp * (.25 + .75 * p * p)); t += p < .5 ? .125 : .0625; }
}
function stab(t0, notes, amp = 1) {
  const DET = [-.01, 0, .01];
  for (const m of notes) { const oscs = DET.map(d => new Saw(mtof(m) * (1 + d))), flt = new BQ('lp', 4000, 1.2);
    const i0 = Math.round(t0 * SR), n = Math.round(1.2 * SR);
    for (let k = 0; k < n; k++) { const t = k / SR; if (k % 16 === 0) flt.set('lp', 500 + 6000 * Math.exp(-t * 5), 1.2);
      const v = flt.p(oscs[0].next() + oscs[1].next() + oscs[2].next()) * Math.exp(-t * 3.2) * Math.min(1, t / .004) * amp * .1;
      B.fx.add(i0 + k, v, (m % 5 - 2) * .3); B.verb.add(i0 + k, v * .8); } }
}
// ---- UI sound effects
function click(t0, amp = .5) {
  const bp = new BQ('bp', 3800, 1.5), i0 = Math.round(t0 * SR), n = Math.round(.03 * SR);
  for (let k = 0; k < n; k++) { const t = k / SR; B.fx.add(i0 + k, (bp.p(rnd()) * 2 + Math.sin(TAU * 1700 * t) * .3) * Math.exp(-t * 220) * amp, .25); }
}
function thunk(t0, amp = .6) { // keycap press
  const lp = new BQ('lp', 3000), i0 = Math.round(t0 * SR), n = Math.round(.15 * SR); let ph = 0;
  for (let k = 0; k < n; k++) { const t = k / SR; ph += (110 + 200 * Math.exp(-t * 45)) / SR;
    B.fx.add(i0 + k, (Math.sin(TAU * ph) * Math.exp(-t * 26) + lp.p(rnd()) * Math.exp(-t * 90) * .6) * amp); }
}
function chime(t0, amp = .5) { // "copied" — glassy FM bell, two notes
  for (const [m, d, a] of [[88, 0, 1], [93, .07, .8]]) {
    const f = mtof(m), i0 = Math.round((t0 + d) * SR), n = Math.round(1.1 * SR);
    for (let k = 0; k < n; k++) { const t = k / SR, idx = 2.2 * Math.exp(-t * 9);
      const v = Math.sin(TAU * f * t + idx * Math.sin(TAU * f * 3.5 * t)) * Math.exp(-t * 5) * Math.min(1, t / .002) * amp * a * .25;
      B.fx.add(i0 + k, v, .2); B.verb.add(i0 + k, v * .5); B.echo.add(i0 + k, v * .45); } }
}
function swoosh(t0, dur = .5, amp = .5) {
  const bp = new BQ('bp', 800, 1.2), i0 = Math.round(t0 * SR), n = Math.round(dur * SR);
  for (let k = 0; k < n; k++) { const p = k / n; if (k % 32 === 0) bp.set('bp', 600 + 5000 * Math.sin(p * Math.PI) ** 2, 1.2);
    const v = bp.p(rnd()) * Math.sin(p * Math.PI) ** 2 * amp; B.fx.add(i0 + k, v, p * 1.4 - .7); B.verb.add(i0 + k, v * .3); }
}
function pop(t0, amp = .5) { // window appears
  const i0 = Math.round(t0 * SR), n = Math.round(.18 * SR); let ph = 0;
  for (let k = 0; k < n; k++) { const t = k / SR; ph += (180 + 500 * (1 - Math.exp(-t * 30))) / SR;
    const v = Math.sin(TAU * ph) * Math.exp(-t * 22) * amp * .5; B.fx.add(i0 + k, v); B.verb.add(i0 + k, v * .3); }
}
function shink(t0, amp = .7) { // the SNIP slice
  const hp = new BQ('hp', 5000), i0 = Math.round(t0 * SR), n = Math.round(.7 * SR);
  for (let k = 0; k < n; k++) { const t = k / SR;
    const v = (hp.p(rnd()) * Math.exp(-t * 18) * .8 + Math.sin(TAU * 3100 * t + 1.5 * Math.sin(TAU * 4400 * t)) * Math.exp(-t * 6) * .25) * amp;
    B.fx.add(i0 + k, v, Math.min(.8, -.8 + t * 6)); B.verb.add(i0 + k, v * .6); B.echo.add(i0 + k, v * .3); }
}
function glitch(t0, amp = .5) { // freeze moment: stuttering bit-crushed blips
  const i0 = Math.round(t0 * SR), n = Math.round(.32 * SR); let held = 0;
  for (let k = 0; k < n; k++) { const t = k / SR; if (k % 160 === 0) held = rnd(); const gate = Math.floor(t / .04) % 2 === 0 ? 1 : .2;
    B.fx.add(i0 + k, (Math.sign(Math.sin(TAU * 220 * (1 + Math.floor(t / .04)) * t)) * .25 + held * .5) * gate * Math.exp(-t * 6) * amp, rnd() * .5); }
}

// =====================================================================
// SCORE
// =====================================================================
const inR = (t, a, b) => t >= a - 1e-9 && t < b - 1e-9;
// pads
for (let bar = 0; bar < 24; bar++) {
  const t = bar * 2;
  if (inR(t, 12, 14) || inR(t, 40, 43) || t >= 46) continue;
  const notes = inR(t, 6, 12) ? [45, 52, 57, 60, 64] : chordAt(t).pad;
  const amp = t < 6 ? .55 : t < 12 ? .45 : inR(t, 34, 40) ? .6 : .45;
  pad(t, inR(t, 10, 12) ? 1.9 : 2, notes, amp);
}
pad(43, 3, PROG[0].pad, .5);
pad(46, .2, [45, 57, 60, 64, 67, 71, 76], .55);                        // final chord rings out on the reverb

// arp (16ths)
for (let s = 0; s < DUR * 8; s++) {
  const t = s / 8; const on = inR(t, 3, 6) || inR(t, 14, 40) || inR(t, 43, 46); if (!on) continue;
  if (t < 6 && s % 2) continue;                                          // intro: 8ths only
  const ch = chordAt(t), step = [0, 1, 2, 3, 2, 1, 3, 2][s % 8], m = ch.arp[step] + (s % 16 >= 12 ? 12 : 0);
  const amp = t < 6 ? .22 * (t - 2.5) / 3.5 : inR(t, 34, 40) ? .3 : .26;
  pluck(t, mtof(m), amp * (s % 4 === 0 ? 1 : .75), s % 2 ? .4 : -.4, inR(t, 34, 40) ? .55 : 1);
}

// lead hook (8ths, 4-bar loop)
const HOOK = [[76, null, 81, null, 79, 76, null, 74], [72, null, 76, null, 74, 72, null, 69],
              [76, null, 79, null, 81, 79, null, 76], [74, null, 71, null, 74, 76, null, null]];
const leadIn = t => inR(t, 18, 26) || inR(t, 28, 34) || inR(t, 43, 46);
for (let s = 0; s < DUR * 4; s++) {
  const t = s / 4; if (!leadIn(t)) continue;
  const bar = Math.floor(t / 2) % 4, m = HOOK[bar][s % 8]; if (m == null) continue;
  let len = .25; for (let j = 1; j < 4 && HOOK[bar][(s % 8) + j] === null && (s % 8) + j < 8; j++) len += .25;
  lead(t, len * .9, m, .2);
}

// problem section 6–12: tense pulse + ticking
for (let s = 0; s < 48; s++) { const t = 6 + s / 8;
  bass(t, .1, 33, .55 + .3 * (s / 48));
  hat(t, s % 2 ? .25 : .45, false, .35); }
for (let t = 6; t < 12; t += 1) kick(t, .85);
[8.5, 9, 9.5, 10, 10.5, 11, 11.5].forEach((t, i) => stab(t, [57 + i, 60 + i, 64 + i].map(m => m), .5 + i * .06));

// main grooves
function groove(a, b, { lead = true } = {}) {
  for (let t = a; t < b - 1e-6; t += .5) {
    kick(t, 1);
    if (Math.round(t * 2) % 2 === 1) clap(t, .9);
    hat(t + .25, .7, true, -.2);
    for (const o of [.125, .375]) hat(t + o, .35, false, .3);
    const r = chordAt(t).root;
    bass(t + .25, .2, r, .8);
    if (Math.round(t * 2) % 4 === 3) bass(t + .375, .1, r + 12, .4);
  }
}
groove(14, 34); groove(43, 46);
// tray breakdown: soft bass + light ticks
for (let t = 34; t < 38; t += 2) bass(t, 1.8, chordAt(t).root, .45);
for (let t = 35; t < 38.5; t += .5) hat(t + .25, .3, false, .3);

// transitions
riser(1, 3, .6); impact(3, .9);
glitch(12.0, .55); riser(12.3, 14, .8); roll(13, 14, .55); impact(14, 1.1);
swoosh(25.35, .6, .6); impact(26, .45);
swoosh(33.3, .6, .6); impact(34, .4);
riser(38.2, 40, .8); roll(39, 40, .45);
[[40, [57, 60, 64, 69]], [41, [53, 57, 60, 65]], [42, [55, 59, 62, 67]]].forEach(([t, ch]) => { impact(t, 1); kick(t, 1.1); stab(t, ch, 1.1); });
shink(41.25, .8);
impact(43, .8);

// SFX synced to visuals
click(6.6); click(7.3); thunk(7.6); thunk(7.85);
[8.5, 9, 9.5, 10, 10.5, 11, 11.5].forEach((t, i) => thunk(t, .35 + i * .04));
click(16.3); click(17.1); swoosh(17.15, .55, .35); chime(17.8);
click(19.5); click(19.7); swoosh(19.8, .55, .35); chime(20.45);
thunk(22.2, .45); thunk(22.4, .45); swoosh(23.0, .55, .35); chime(23.65);
[26.3, 27.8, 29.3, 30.8].forEach(t => { pop(t, .55); click(t + .35, .4); click(t + .85, .3); chime(t + .9, .45); });
swoosh(34.0, .5, .3); click(36.5, .5); click(37.3, .3);
[43.85, 46.0, 46.3].forEach(t => click(t, .35));

// =====================================================================
// MIX
// =====================================================================
function busFilter(bus, type, fFn, q = .707) {
  const l = new BQ(type, fFn(0), q), r = new BQ(type, fFn(0), q);
  for (let i = 0; i < N; i++) { if (i % 64 === 0) { const f = fFn(i / SR); l.set(type, f, q); r.set(type, f, q); }
    bus.L[i] = l.p(bus.L[i]); bus.R[i] = r.p(bus.R[i]); }
}
// pad filter automation: opens during intro, dark in the problem section, wide in the drop
busFilter(B.pad, 'lp', t => t < 3 ? 500 + 1500 * (t / 3) ** 2 : t < 6 ? 2200 : t < 12 ? 900 : inR(t, 34, 40) ? 1800 : 3200, .9);
busFilter(B.pad, 'hp', () => 140);
busFilter(B.arp, 'hp', () => 250);
busFilter(B.lead, 'hp', () => 200);
// sends from melodic buses
for (let i = 0; i < N; i++) {
  B.verb.L[i] += B.pad.L[i] * .35 + B.arp.L[i] * .25 + B.lead.L[i] * .3; B.verb.R[i] += B.pad.R[i] * .35 + B.arp.R[i] * .25 + B.lead.R[i] * .3;
  B.echo.L[i] += B.arp.L[i] * .3 + B.lead.L[i] * .28; B.echo.R[i] += B.arp.R[i] * .3 + B.lead.R[i] * .28;
}

function freeverb(inp, room = .86, damp = .3) {
  const sc = SR / 44100, CT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], AT = [556, 441, 341, 225];
  const pre = new BQ('hp', 300), out = [new Float32Array(N), new Float32Array(N)];
  const mono = new Float32Array(N); for (let i = 0; i < N; i++) mono[i] = pre.p((inp.L[i] + inp.R[i]) * .5);
  [0, 23].forEach((spread, ch) => {
    const combs = CT.map(t => ({ b: new Float32Array(Math.round((t + spread) * sc)), i: 0, f: 0 }));
    const aps = AT.map(t => ({ b: new Float32Array(Math.round((t + spread) * sc)), i: 0 }));
    const o = out[ch];
    for (let n = 0; n < N; n++) { const x = mono[n] * .03; let s = 0;
      for (const c of combs) { const y = c.b[c.i]; c.f = y * (1 - damp) + c.f * damp; c.b[c.i] = x + c.f * room; if (++c.i >= c.b.length) c.i = 0; s += y; }
      for (const a of aps) { const bo = a.b[a.i]; a.b[a.i] = s + bo * .5; if (++a.i >= a.b.length) a.i = 0; s = bo - s; }
      o[n] = s; }
  });
  return out;
}
function pingpong(inp, time = .375, fb = .4) {
  const D = Math.round(time * SR), L = new Float32Array(N), R = new Float32Array(N), lpL = new BQ('lp', 3500), lpR = new BQ('lp', 3500), hp = new BQ('hp', 400);
  for (let n = 0; n < N; n++) { const x = hp.p((inp.L[n] + inp.R[n]) * .5);
    L[n] = x + (n >= D ? lpL.p(R[n - D]) * fb : 0); R[n] = n >= D ? lpR.p(L[n - D]) * fb : 0; }
  return [L, R];
}
const [vL, vR] = freeverb(B.verb), [eL, eR] = pingpong(B.echo);

// sidechain from kicks
const duck = new Float32Array(N).fill(1);
for (const t of kicks) { const i0 = Math.round(t * SR);
  for (let k = 0; k < .32 * SR && i0 + k < N; k++) { const x = k / SR / .32; duck[i0 + k] = Math.min(duck[i0 + k], 1 - .7 * (1 - smooth(x))); } }

if (process.env.DEBUG) { const st = (n, l, r) => { let pk = 0, ss = 0; for (let i = 0; i < N; i++) { pk = Math.max(pk, Math.abs(l[i]), Math.abs(r[i])); ss += l[i] * l[i] + r[i] * r[i]; } console.log(n.padEnd(6), 'peak', (20 * Math.log10(pk)).toFixed(1), 'rms', (10 * Math.log10(ss / N / 2)).toFixed(1)); };
  for (const k of ['pad', 'arp', 'bass', 'lead', 'kick', 'drums', 'fx']) st(k, B[k].L, B[k].R); st('verb', vL, vR); st('echo', eL, eR); }
const LV = { pad: db(-15), arp: db(-5), bass: db(-11), lead: db(-4), kick: db(-7), drums: db(-1), fx: db(-9), verb: db(-3), echo: db(-4) };
let L = new Float32Array(N), R = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const d = duck[i], dl = .5 + .5 * d;
  L[i] = B.pad.L[i] * LV.pad * d + B.arp.L[i] * LV.arp * dl + B.bass.L[i] * LV.bass * d + B.lead.L[i] * LV.lead * dl
       + B.kick.L[i] * LV.kick + B.drums.L[i] * LV.drums + B.fx.L[i] * LV.fx + vL[i] * LV.verb * dl + eL[i] * LV.echo * dl;
  R[i] = B.pad.R[i] * LV.pad * d + B.arp.R[i] * LV.arp * dl + B.bass.R[i] * LV.bass * d + B.lead.R[i] * LV.lead * dl
       + B.kick.R[i] * LV.kick + B.drums.R[i] * LV.drums + B.fx.R[i] * LV.fx + vR[i] * LV.verb * dl + eR[i] * LV.echo * dl;
}
// master: low cut, air shelf, glue compressor, lookahead limiter
{ const h = [new BQ('hp', 28), new BQ('hp', 28)], s = [new BQ('hs', 9000, .7, 1.5), new BQ('hs', 9000, .7, 1.5)];
  for (let i = 0; i < N; i++) { L[i] = s[0].p(h[0].p(L[i])); R[i] = s[1].p(h[1].p(R[i])); } }
{ const g0 = db(GAIN_DB), at = Math.exp(-1 / (.012 * SR)), rl = Math.exp(-1 / (.18 * SR)), thr = -10, ratio = 2.2; let e = 0;
  for (let i = 0; i < N; i++) { const l = L[i] * g0, r = R[i] * g0, x = Math.max(Math.abs(l), Math.abs(r));
    e = x > e ? at * e + (1 - at) * x : rl * e + (1 - rl) * x;
    const over = 20 * Math.log10(e + 1e-9) - thr, g = over > 0 ? db(-over * (1 - 1 / ratio)) : 1;
    L[i] = l * g; R[i] = r * g; } }
{ const LA = Math.round(.004 * SR), ceil = db(-1.2), rel = 1 - Math.exp(-1 / (.09 * SR)), atk = 1 - Math.exp(-1 / (LA / 4));
  const req = new Float32Array(N); for (let i = 0; i < N; i++) req[i] = Math.min(1, ceil / Math.max(1e-9, Math.abs(L[i]), Math.abs(R[i])));
  const win = new Float32Array(N); const dq = [];          // sliding-window minimum over [i, i+LA]
  for (let i = N - 1; i >= 0; i--) { while (dq.length && req[dq[dq.length - 1]] >= req[i]) dq.pop(); dq.push(i); while (dq[0] > i + LA) dq.shift(); win[i] = req[dq[0]]; }
  let g = 1; for (let i = 0; i < N; i++) { const tg = win[i]; g += (tg - g) * (tg < g ? atk : rel);
    const fade = i / SR > 46.8 ? Math.max(0, (48 - i / SR) / 1.2) ** 2 : Math.min(1, i / (SR * .02));
    L[i] = Math.max(-ceil, Math.min(ceil, L[i] * g)) * fade; R[i] = Math.max(-ceil, Math.min(ceil, R[i] * g)) * fade; } }

const out = Buffer.alloc(44 + N * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVEfmt ', 8); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20);
out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { out.writeInt16LE(Math.round(L[i] * 32767), 44 + i * 4); out.writeInt16LE(Math.round(R[i] * 32767), 46 + i * 4); }
writeFileSync(new URL('./music.wav', import.meta.url), out);
console.log('music.wav written');
