// node render-shorts.mjs                          -> every clip: shorts/teasers, shorts/launch (1080p30), shorts/films (1080p60); silent
// node render-shorts.mjs film-action              -> one clip
// node render-shorts.mjs snap film-action 1 2.5   -> snaps/<clip>-t1.png, ...
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const here = fileURLToPath(new URL('.', import.meta.url));
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const args = process.argv.slice(2), snapMode = args[0] === 'snap';
if (snapMode) args.shift();

const pageOf = clip => clip.startsWith('film-') ? 'films.html' : 'shorts.html';
const folderOf = clip => clip.startsWith('film-') ? 'films' : clip.startsWith('teaser') ? 'teasers' : 'launch';

const browser = await chromium.launch({ executablePath: CHROME, args: ['--force-device-scale-factor=1'] });
const open = async clip => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => console.error('PAGE ERROR', e.message));
  await page.goto(pathToFileURL(here + pageOf(clip)).href + `?render=1&clip=${clip}`);
  await page.evaluate(() => window.READY);
  return page;
};
const grab = (page, T, f, type = 'image/jpeg') => page.evaluate(([T, f, type]) => {
  window.renderAt(T, f); return document.getElementById('c').toDataURL(type, 0.95).split(',')[1];
}, [T, f, type]);

const meta = {};
for (const probe of ['launch-out-now', 'film-action']) {
  const page = await open(probe);
  Object.assign(meta, await page.evaluate(() => window.CLIPS));
  await page.close();
}
const clips = snapMode ? [args[0]] : args.length ? args : Object.keys(meta);

for (const clip of clips) {
  if (!meta[clip]) { console.error(`unknown clip "${clip}" (have: ${Object.keys(meta).join(', ')})`); process.exitCode = 1; continue; }
  const { dur, fps } = meta[clip], page = await open(clip);
  if (snapMode) {
    mkdirSync(here + 'snaps', { recursive: true });
    for (const T of args.slice(1).map(Number))
      writeFileSync(`${here}snaps/${clip}-t${T}.png`, Buffer.from(await grab(page, T, Math.round(T * fps), 'image/png'), 'base64'));
    console.log('snaps written');
  } else {
    const dir = `${here}shorts/${folderOf(clip)}/`;
    mkdirSync(dir, { recursive: true });
    const ff = spawn(ffmpeg, ['-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-', '-an',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${dir}${clip}.mp4`], { stdio: ['pipe', 'ignore', 'inherit'] });
    for (let f = 0; f < fps * dur; f++) {
      if (!ff.stdin.write(Buffer.from(await grab(page, f / fps, f), 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
    console.log(`done → ${dir}${clip}.mp4`);
  }
  await page.close();
}
await browser.close();
