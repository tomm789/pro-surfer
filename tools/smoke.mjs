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
  // 7 options, 8 scrapbook, 9 surfer, 10 board, 11 trick book, 12 beach, 13 wave size
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
    ['scrapbook', 8, 'menu'],
    ['trick book', 11, 'menu'],
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
    ['surfer', 9],
    ['board', 10],
    ['beach', 12],
    ['wave size', 13],
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

  // A scored run through the real game shell. The menu walk above only proves the flows exist; this
  // proves the whole chain works — sticks → stance → recognised turns → chain → score.
  await goto(2); // free surf
  await press('Enter');
  await stepN(120);
  const script = [{ t: 0.4, input: { backY: -1, frontY: -1 } }, { t: 0.8, input: { backY: 1, frontY: 1 } }];
  let t = 2;
  while (t < 34) {
    for (const [rail, press2] of [
      [0.55, -1],
      [0.55, 1],
      [-0.5, -1],
      [-0.5, 1],
    ]) {
      script.push({ t: +t.toFixed(2), input: { backX: rail, frontX: rail, backY: press2, frontY: press2 } });
      t += 0.5;
    }
  }
  // turns every half second keep the chain open, so bank it the way a player would: cash in at the end
  script.push({ t: 33.4, input: { cashIn: true } }, { t: 33.6, input: {} });
  await page.evaluate((s) => window.__lineup.setInput({ script: s }), script);
  await page.evaluate(() => window.__lineup.stepTo(window.__lineup.time() + 34));
  const scored = await page.evaluate(() => {
    const st = window.__lineup.state();
    const ride = st.ride ?? {};
    return { score: ride.run?.score ?? 0, events: (ride.events ?? []).filter((e) => e.includes('trickLand')).length };
  });
  const scoreOk = scored.score > 0 && scored.events > 0;
  if (!scoreOk) failures++;
  rows.push(`${scoreOk ? 'ok  ' : 'FAIL'} scored run: score=${scored.score} recognised=${scored.events}`);
  await page.evaluate(() => window.__lineup.setInput(null));

  // The rest of a session: pause and continue, end it to the results screen, watch the replay of the
  // best chain, and come back to the boat. The scored run above is what makes the replay exist.
  await press('Escape');
  await check('pause menu', 'paused');
  freshMenu();
  await press('Enter'); // continue
  await stepN(10);
  await check('continue from pause', 'ride');
  await press('Escape');
  freshMenu();
  await goto(2); // end session
  await press('Enter');
  await stepN(240); // the end countdown, the transition, and the results screen's own settle time
  await check('results after the session', 'results');
  await press('KeyL'); // L / Y: replay of the best chain
  await stepN(60);
  await check('replay of the best chain', 'replay');
  await stepN(240);
  await press('Enter'); // ends the replay early
  await stepN(90);
  await check('results after the replay', 'results');
  await press('Enter');
  await stepN(90);
  freshMenu();
  await check('boat after results', 'menu');

  // The controller test: opens from options, and leaves only on a held press.
  const title = async () => page.evaluate(() => document.querySelector('.scr h1')?.textContent ?? '');
  await goto(7); // options
  await press('Enter');
  await stepN(10);
  freshMenu();
  await goto(3); // controller test
  await press('Enter');
  await stepN(10);
  const opened = (await title()) === 'CONTROLLER TEST';
  if (!opened) failures++;
  rows.push(`${opened ? 'ok  ' : 'FAIL'} controller test open: title=${await title()}`);
  await press('KeyK', 2, 6); // a tap must not leave
  const stayed = (await title()) === 'CONTROLLER TEST';
  if (!stayed) failures++;
  rows.push(`${stayed ? 'ok  ' : 'FAIL'} controller test survives a tap`);
  await page.keyboard.down('KeyK');
  for (let i = 0; i < 14; i++) await stepN(5); // input is polled once per step() call, so hold across batches
  await page.keyboard.up('KeyK');
  await stepN(10);
  const left = (await title()) === 'OPTIONS';
  if (!left) failures++;
  rows.push(`${left ? 'ok  ' : 'FAIL'} controller test leaves on a held press: title=${await title()}`);

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
