// Shared headless-browser helpers for tools/*.mjs. Uses the globally installed Playwright
// (matches the Chromium under /opt/pw-browsers) and falls back to a local install.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);

export function loadPlaywright() {
  const candidates = ['/opt/node22/lib/node_modules/playwright', 'playwright', '@playwright/test'];
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      /* try next */
    }
  }
  throw new Error('Playwright not found. Install it or use the container global.');
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else out[key] = 'true';
    }
  }
  return out;
}

export function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/** Start `vite preview` on the built dist (fast, deterministic) or `vite` dev server. Returns {url, stop}. */
export async function startServer({ mode = 'preview', port = 4179 } = {}) {
  const root = resolve(new URL('..', import.meta.url).pathname);
  // Spawn vite's bin directly (no npx intermediary) in its own process group so stop() kills everything.
  const viteBin = resolve(root, 'node_modules/vite/bin/vite.js');
  const args = mode === 'dev' ? [viteBin, '--port', String(port), '--strictPort'] : [viteBin, 'preview', '--port', String(port), '--strictPort'];
  const child = spawn(process.execPath, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
    detached: true,
  });
  const url = `http://localhost:${port}/`;
  let output = '';
  let exited = null;
  child.stdout.on('data', (d) => (output += d.toString()));
  child.stderr.on('data', (d) => (output += d.toString()));
  child.on('exit', (code) => (exited = code ?? -1));
  const stop = () => {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      /* already gone */
    }
    try {
      child.kill('SIGKILL');
    } catch {
      /* already gone */
    }
    child.stdout.destroy();
    child.stderr.destroy();
    child.unref();
  };
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (exited !== null) throw new Error(`server exited ${exited}\n${output}`);
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return { url, stop };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  stop();
  throw new Error(`server start timeout\n${output}`);
}

export async function openGame(pw, url, { width = 1280, height = 720, params = {} } = {}) {
  const browser = await pw.chromium.launch({
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[console.${m.type()}] ${m.text()}`);
  });
  const q = new URLSearchParams({ headless: '1', ...params });
  await page.goto(`${url}?${q.toString()}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.__lineup, null, { timeout: 30000 });
  await page.evaluate(() => window.__lineup.ready);
  return { browser, page, errors };
}
