// Records a short clip by stepping the sim at fixed dt and capturing frames, then encodes with ffmpeg.
// Usage: node tools/clip.mjs --scene placeholder --seconds 6 --fps 30 [--from 0] [--input '{...}'] [--out artifacts/clip.mp4]
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import { loadPlaywright, parseArgs, ensureDir, startServer, openGame } from './browser.mjs';

const args = parseArgs(process.argv.slice(2));
const scene = args.scene ?? 'placeholder';
const seconds = Number(args.seconds ?? 5);
const fps = Number(args.fps ?? 30);
const from = Number(args.from ?? 0);
const width = Number(args.w ?? 960);
const height = Number(args.h ?? 540);
const out = args.out ?? `artifacts/${scene}-clip.mp4`;
const pw = loadPlaywright();

const server = await startServer({ mode: args.dev ? 'dev' : 'preview' });
try {
  const extra = {};
  for (const k of Object.keys(args)) if (!['scene', 'seconds', 'fps', 'from', 'w', 'h', 'out', 'dev', 'input'].includes(k)) extra[k] = args[k];
  const { browser, page, errors } = await openGame(pw, server.url, { width, height, params: { scene, seed: args.seed ?? '1', ...extra } });
  if (args.input) await page.evaluate((inp) => window.__lineup.setInput(inp), JSON.parse(args.input));
  if (from > 0) await page.evaluate((s) => window.__lineup.stepTo(s), from);
  const frameDir = ensureDir(resolve('artifacts', `_frames_${scene}`));
  const hz = await page.evaluate(() => 60);
  const stepsPerFrame = Math.max(1, Math.round(hz / fps));
  const frames = Math.round(seconds * fps);
  for (let i = 0; i < frames; i++) {
    await page.evaluate((n) => window.__lineup.step(n), stepsPerFrame);
    await page.screenshot({ path: join(frameDir, `f${String(i).padStart(5, '0')}.png`) });
  }
  await browser.close();
  ensureDir(resolve(out, '..'));
  const ff = spawnSync('ffmpeg', ['-y', '-framerate', String(fps), '-i', join(frameDir, 'f%05d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', out], { stdio: 'pipe' });
  if (ff.status !== 0) console.error(ff.stderr.toString().slice(-2000));
  rmSync(frameDir, { recursive: true, force: true });
  console.log(JSON.stringify({ out, frames, errors, ok: existsSync(out) }, null, 2));
  if (errors.length) process.exitCode = 2;
} finally {
  server.stop();
}
process.exit(process.exitCode ?? 0);
