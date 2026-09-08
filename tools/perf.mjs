// Measures sim step, render and screenshot cost headlessly, and can fail on a budget so CI catches a
// regression in either the simulation or the draw call count.
// Usage: node tools/perf.mjs --scene wave [--beach sandbar] [--t 20] [--budget] [--maxStepMs 1500 --maxRenderMs 150 --maxDrawCalls 180 --maxTriangles 300000]
import { loadPlaywright, parseArgs, startServer, openGame, ensureDir } from './browser.mjs';

const args = parseArgs(process.argv.slice(2));
const scene = args.scene ?? 'wave';
const t = Number(args.t ?? 20);
// The budget is generous on purpose: SwiftShader on a CI runner is several times slower than a laptop
// GPU, and the point is to catch a 5× regression, not a 20% one. Baseline on the pool in this
// container: step ≈ 210 ms for 20 s of sim, render ≈ 8–16 ms, 100 draw calls, 92k triangles.
const budget = args.budget
  ? { stepMs: Number(args.maxStepMs ?? 1500), renderMs: Number(args.maxRenderMs ?? 150), drawCalls: Number(args.maxDrawCalls ?? 180), triangles: Number(args.maxTriangles ?? 300000) }
  : null;
const pw = loadPlaywright();
const server = await startServer({ mode: args.dev ? 'dev' : 'preview' });
ensureDir('artifacts');
let failures = 0;
try {
  for (const [w, h] of [
    [640, 360],
    [1280, 720],
  ]) {
    const t0 = Date.now();
    const extra = {};
    for (const k of Object.keys(args)) if (!['scene', 't', 'dev', 'budget', 'maxStepMs', 'maxRenderMs', 'maxDrawCalls', 'maxTriangles'].includes(k)) extra[k] = args[k];
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
      return { stepMs: +(b - a).toFixed(0), render1Ms: +(c - b).toFixed(0), render2Ms: +(d - c).toFixed(0), stats: window.__lineup.stats() };
    }, t);
    const t1 = Date.now();
    await page.screenshot({ path: `artifacts/_perf_${w}.png` });
    console.log(`${w}x${h} open=${tOpen}ms`, JSON.stringify(r), `screenshot=${Date.now() - t1}ms`, errors.length ? errors : '');
    if (errors.length) failures++;
    if (budget) {
      const over = [];
      if (r.stepMs > budget.stepMs) over.push(`step ${r.stepMs} ms > ${budget.stepMs}`);
      if (r.render2Ms > budget.renderMs) over.push(`render ${r.render2Ms} ms > ${budget.renderMs}`);
      if (r.stats.drawCalls > budget.drawCalls) over.push(`draw calls ${r.stats.drawCalls} > ${budget.drawCalls}`);
      if (r.stats.triangles > budget.triangles) over.push(`triangles ${r.stats.triangles} > ${budget.triangles}`);
      if (over.length) {
        failures++;
        console.log(`BUDGET EXCEEDED at ${w}x${h}: ${over.join(', ')}`);
      }
    }
    await browser.close();
  }
} finally {
  server.stop();
}
if (budget) console.log(failures ? `PERF FAILED (${failures})` : 'PERF OK');
process.exit(failures ? 1 : 0);
