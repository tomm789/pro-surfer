// Usage: node tools/screenshot.mjs --scene placeholder --t 2.5 [--w 1280 --h 720] [--out artifacts/x.png] [--dev]
//        [--input '{"pump":true}'] [--steps 60]
import { resolve } from 'node:path';
import { loadPlaywright, parseArgs, ensureDir, startServer, openGame } from './browser.mjs';

const args = parseArgs(process.argv.slice(2));
const scene = args.scene ?? 'placeholder';
const t = Number(args.t ?? 0);
const width = Number(args.w ?? 1280);
const height = Number(args.h ?? 720);
const out = args.out ?? `artifacts/${scene}-t${t}.png`;
const pw = loadPlaywright();

const server = await startServer({ mode: args.dev ? 'dev' : 'preview' });
try {
  const extra = {};
  for (const k of Object.keys(args)) if (!['scene', 't', 'w', 'h', 'out', 'dev', 'input', 'steps'].includes(k)) extra[k] = args[k];
  const { browser, page, errors } = await openGame(pw, server.url, { width, height, params: { scene, seed: args.seed ?? '1', ...extra } });
  if (args.input) await page.evaluate((inp) => window.__lineup.setInput(inp), JSON.parse(args.input));
  if (args.steps) await page.evaluate((n) => window.__lineup.step(n), Number(args.steps));
  else await page.evaluate((s) => window.__lineup.stepTo(s), t);
  const state = await page.evaluate(() => ({ time: window.__lineup.time(), scene: window.__lineup.scene(), state: window.__lineup.state(), stats: window.__lineup.stats() }));
  ensureDir(resolve(out, '..'));
  await page.screenshot({ path: out });
  console.log(JSON.stringify({ out, ...state, errors }, null, 2));
  await browser.close();
  if (errors.length) process.exitCode = 2;
} finally {
  server.stop();
}
