// node render-shorts.mjs                          -> every clip into shorts/teasers/ and shorts/launch/ (1080p30, silent)
// node render-shorts.mjs launch-out-now           -> one clip
// node render-shorts.mjs snap launch-out-now 1 2.5 -> snaps/<clip>-t1.png, ...
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const here = fileURLToPath(new URL('.', import.meta.url));
const FPS = 30;
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const args = process.argv.slice(2), snapMode = args[0] === 'snap';
if (snapMode) args.shift();

const browser = await chromium.launch({ executablePath: CHROME, args: ['--force-device-scale-factor=1'] });
const open = async clip => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.error('PAGE ERROR', e.message));
  await page.goto(pathToFileURL(here + 'shorts.html').href + `?render=1&clip=${clip}`);
  await page.evaluate(() => window.READY);
  return page;
};
const grab = (page, T, f, type = 'image/jpeg') => page.evaluate(([T, f, type]) => {
  window.renderAt(T, f); return document.getElementById('c').toDataURL(type, 0.95).split(',')[1];
}, [T, f, type]);

const probe = await open('launch-out-now');
const durs = await probe.evaluate(() => window.CLIPS);
await probe.close();
const clips = snapMode ? [args[0]] : args.length ? args : Object.keys(durs);

for (const clip of clips) {
  if (!durs[clip]) { console.error(`unknown clip "${clip}" (have: ${Object.keys(durs).join(', ')})`); process.exitCode = 1; continue; }
  const page = await open(clip);
  if (snapMode) {
    mkdirSync(here + 'snaps', { recursive: true });
    for (const T of args.slice(1).map(Number))
      writeFileSync(`${here}snaps/${clip}-t${T}.png`, Buffer.from(await grab(page, T, Math.round(T * FPS), 'image/png'), 'base64'));
    console.log('snaps written');
  } else {
    const dir = `${here}shorts/${clip.startsWith('teaser') ? 'teasers' : 'launch'}/`;
    mkdirSync(dir, { recursive: true });
    const ff = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-an',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${dir}${clip}.mp4`], { stdio: ['pipe', 'ignore', 'inherit'] });
    const total = FPS * durs[clip];
    for (let f = 0; f < total; f++) {
      if (!ff.stdin.write(Buffer.from(await grab(page, f / FPS, f), 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    console.log(`done → ${dir}${clip}.mp4`);
  }
  await page.close();
}
await browser.close();
