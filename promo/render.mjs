// node render.mjs            -> snipy-promo.mp4 (1080p60 + soundtrack)
// node render.mjs snap 3 14.5 -> snaps/t3.png, snaps/t14.5.png (preview single frames)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const here = fileURLToPath(new URL('.', import.meta.url));
const FPS = 60, DUR = 52;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({ executablePath: CHROME, args: ['--force-device-scale-factor=1'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('pageerror', e => console.error('PAGE ERROR', e.message));
await page.goto(pathToFileURL(here + 'index.html').href + '?render=1');
await page.evaluate(() => window.READY);

const grab = (T, f, type = 'image/jpeg') => page.evaluate(([T, f, type]) => {
  window.renderAt(T, f); return document.getElementById('c').toDataURL(type, 0.95).split(',')[1];
}, [T, f, type]);

if (process.argv[2] === 'snap') {
  mkdirSync(here + 'snaps', { recursive: true });
  for (const T of process.argv.slice(3).map(Number)) {
    writeFileSync(`${here}snaps/t${T}.png`, Buffer.from(await grab(T, Math.round(T * FPS), 'image/png'), 'base64'));
  }
  console.log('snaps written');
} else {
  const ff = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-i', here + 'music.wav', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', here + 'snipy-promo.mp4'], { stdio: ['pipe', 'ignore', 'inherit'] });
  const total = FPS * DUR, t0 = Date.now();
  for (let f = 0; f < total; f++) {
    const ok = ff.stdin.write(Buffer.from(await grab(f / FPS, f), 'base64'));
    if (!ok) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 300 === 0) console.log(`frame ${f}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log('done → snipy-promo.mp4');
}
await browser.close();
