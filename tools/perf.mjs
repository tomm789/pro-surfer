// Measures sim step, render and screenshot cost headlessly. Usage: node tools/perf.mjs --scene wave [--beach sandbar] [--t 20]
import { loadPlaywright, parseArgs, startServer, openGame, ensureDir } from './browser.mjs';

const args = parseArgs(process.argv.slice(2));
const scene = args.scene ?? 'wave';
const t = Number(args.t ?? 20);
const pw = loadPlaywright();
const server = await startServer({ mode: args.dev ? 'dev' : 'preview' });
ensureDir('artifacts');
try {
  for (const [w, h] of [
    [640, 360],
    [1280, 720],
  ]) {
    const t0 = Date.now();
    const extra = {};
    for (const k of Object.keys(args)) if (!['scene', 't', 'dev'].includes(k)) extra[k] = args[k];
    const { browser, page, errors } = await openGame(pw, server.url, { width: w, height: h, params: { scene, ...extra } });
    const tOpen = Date.now() - t0;
    const r = await page.evaluate((tt) => {
      const a = performance.now();
      window.__lineup.stepTo(tt);
      const b = performance.now();
      window.__lineup.render();
      const c = performance.now();
      window.__lineup.render();
      const d = performance.now();
      return { stepMs: (b - a).toFixed(0), render1Ms: (c - b).toFixed(0), render2Ms: (d - c).toFixed(0), stats: window.__lineup.stats() };
    }, t);
    const t1 = Date.now();
    await page.screenshot({ path: `artifacts/_perf_${w}.png` });
    console.log(`${w}x${h} open=${tOpen}ms`, JSON.stringify(r), `screenshot=${Date.now() - t1}ms`, errors.length ? errors : '');
    await browser.close();
  }
} finally {
  server.stop();
}
process.exit(0);
