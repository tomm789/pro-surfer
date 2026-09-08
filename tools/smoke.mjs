// Walks every menu flow headlessly by pressing keys, checks the game shell reaches the expected flow,
// and fails on any page error or console error. Usage: node tools/smoke.mjs   (needs a built dist: npm run build)
import { loadPlaywright, startServer, openGame } from './browser.mjs';

const pw = loadPlaywright();
const server = await startServer({ mode: 'preview' });
const rows = [];
let failures = 0;
try {
  const { browser, page, errors } = await openGame(pw, server.url, { width: 1280, height: 720, params: { scene: 'game', flow: 'menu', seed: '1' } });
  const stepN = (n) => page.evaluate((k) => window.__lineup.step(k), n);
  const flow = async () => (await page.evaluate(() => window.__lineup.state())).flow;
  const press = async (code, hold = 2, after = 6) => {
    await page.keyboard.down(code);
    await stepN(hold);
    await page.keyboard.up(code);
    await stepN(after);
  };
  // Menus wrap around, so the cursor is tracked explicitly; every freshly created menu starts at row 0.
  let cursor = 0;
  const goto = async (idx) => {
    const d = idx - cursor;
    for (let i = 0; i < Math.abs(d); i++) await press(d > 0 ? 'ArrowDown' : 'ArrowUp');
    cursor = idx;
  };
  const freshMenu = () => (cursor = 0);
  const backToBoat = async () => {
    await press('Escape'); // pause menu: continue, restart, end, back to the boat
    freshMenu();
    await goto(3);
    await press('Enter');
    await stepN(60);
    freshMenu();
  };
  const check = async (name, expected) => {
    const f = await flow();
    const ok = f === expected;
    if (!ok) failures++;
    rows.push(`${ok ? 'ok  ' : 'FAIL'} ${name}: flow=${f}${ok ? '' : ` expected ${expected}`}`);
  };

  // Main menu rows as the cursor sees them (disabled rows such as Stats are skipped; see gameScene.openMenu):
  // 0 career, 1 lessons, 2 free surf, 3 timed run, 4 icon challenge, 5 multiplayer, 6 record book,
  // 7 controls, 8 assists, 9 camera, 10 scrapbook, 11 surfer, 12 board, 13 trick book, 14 beach, 15 wave size
  await stepN(10);
  await check('boot → menu', 'menu');

  await goto(0);
  await press('Enter');
  await stepN(10);
  freshMenu(); // career map is a new menu
  await check('career map', 'menu');
  await press('Enter');
  await stepN(240);
  await check('career level ride', 'ride');
  await backToBoat();
  await check('back from career', 'menu');

  await goto(1);
  await press('Enter');
  await stepN(10);
  freshMenu(); // lessons list
  await press('Enter');
  await stepN(240);
  await check('lesson ride', 'ride');
  await backToBoat();
  await check('back from lesson', 'menu');

  for (const [name, idx] of [
    ['free surf', 2],
    ['timed run', 3],
    ['icon challenge', 4],
  ]) {
    await goto(idx);
    await press('Enter');
    await stepN(240);
    await check(`${name} ride`, 'ride');
    await backToBoat();
    await check(`back from ${name}`, 'menu');
  }

  for (const [name, sub] of [
    ['head to head', 0],
    ['push', 1],
  ]) {
    await goto(5);
    await press('Enter');
    await stepN(10);
    freshMenu(); // multiplayer submenu
    await goto(sub);
    await press('Enter');
    await stepN(240);
    await check(`split ${name}`, 'split');
    await backToBoat();
    await check(`back from ${name}`, 'menu');
  }

  for (const [name, idx, open] of [
    ['record book', 6, 'results'],
    ['scrapbook', 10, 'menu'],
    ['trick book', 13, 'menu'],
  ]) {
    await goto(idx);
    await press('Enter');
    await stepN(60);
    await check(`${name} open`, open);
    await press('KeyK');
    await stepN(60);
    freshMenu(); // back recreates the main menu
    await check(`${name} back`, 'menu');
  }

  for (const [name, idx] of [
    ['controls', 7],
    ['assists', 8],
    ['camera', 9],
    ['surfer', 11],
    ['board', 12],
    ['beach', 14],
    ['wave size', 15],
  ]) {
    await goto(idx);
    await press('ArrowRight');
    await press('ArrowRight');
    await press('ArrowLeft');
    await stepN(30);
    await check(`${name} adjust`, 'menu');
  }
  await goto(2);
  await press('Enter');
  await stepN(300);
  await check('free surf after adjustments', 'ride');
  await backToBoat();
  await check('final menu', 'menu');

  console.log(rows.join('\n'));
  if (errors.length) {
    failures += errors.length;
    console.log('page errors:\n' + errors.join('\n'));
  } else console.log('page errors: none');
  await browser.close();
} finally {
  server.stop();
}
console.log(failures ? `SMOKE FAILED (${failures})` : 'SMOKE OK');
process.exit(failures ? 1 : 0);
