# Backlog

Prioritised open work. Milestones M0–M10 of `docs/DESIGN.md` §13 are implemented and the game is playable end to end, but it is a first pass everywhere. The gaps below are ordered by how much they separate this from a finished console-quality game. Pick from the top. When you start an item, list it under **In progress** with your name and branch; when it lands, move it to **Done** with the PR.

## In progress

(none)

## P0 — feel on a real screen

The simulation has only been tuned against measurements (`tests/feel.test.ts`) and headless screenshots. Nobody has yet played it on a real display with a gamepad. Expect the first human playtest to produce a list of tuning changes. Everything below is in `data/tuning.json` unless noted.

- [ ] Chase camera: look-ahead, height, smoothing, FOV per state (face, air, tube). `src/render/chaseCamera.ts`.
- [ ] Turning and pumping response: `rider.turnRate`, `carveTurnRate`, `pumpAccel`, `headingLevelRate`. Turns should feel weighty, not twitchy; pumping should visibly build speed within two pumps (§14).
- [ ] Jump load and launch: hold-to-load timing (`air.loadMaxSeconds`), launch angle and hang time versus speed. Airs should read as big; landings should feel judged, not random.
- [ ] Spin rate versus air time: `air.spinRateBase`, `spinRateStatScale`. A 540 with mid Spin on 8 ft is the target (§14).
- [ ] Tube balance: tap impulse, hold rate, drift ramp. Casual ≈ 12 s, expert 15 s+ today; verify it feels fair with a stick.
- [ ] Wipeout cost and respawn placement: 6.4 s of clock today; check the rider is placed ahead of the curl with time to stand.
- [ ] Input buffer (600 ms) and diagonal cone for trick sequences: check double-taps and grabs register reliably on a pad.
- [ ] Rumble strength and events.

## P1 — visual identity (the biggest gap)

- [ ] **Surfer model and animation.** The rider is a procedural, boxy, posed model (`src/render/surfer.ts`, `riderView.ts`). Replace with a rigged humanoid (glTF, CC0 or original) with animation clips: paddle, pop-up, trim, carve left/right, pump, crouch/load, air poses per grab, spins, tube crouch with rail grab, floater, wipeout ragdoll-ish tumble, celebrate. Blend clips by state and stick input; keep the board IK on the wave normal.
- [ ] **Wave.** The lip is thin and the barrel interior is flat. Wanted: thicker throwing lip with a translucent edge, curl foam sheets and spray off the lip, interior lighting in the tube (light through the back of the wave), whitewater with volume rather than blur, refraction and caustics on the face, better foam trails behind the rider. `src/render/waterShader.ts`, `waveMesh.ts`, `spray.ts`.
- [ ] **Beaches.** Each beach is identifiable but sparse. Add shoreline geometry (sand, rocks, reef under the water at the reef breaks), vegetation, boats and crowd for the contest beach, a pier with detail, distance haze. `src/render/landmarks.ts`, `environment.ts`, `data/beaches/*.json`.
- [ ] **Sky and light.** Gradient dome today. Add clouds, sun disc with glare, time-of-day per level (dawn, midday, golden hour), sun glitter on the water.
- [ ] **HUD and menus.** Functional DOM. Wanted: a proper art direction (typography, panels, iconography for trick icons, the balance meter, the wave meter), the boat hub as a 3D scene behind the menus, a world map for beach selection.
- [ ] **Transitions and results.** The results screen and replay chrome are plain; add the TV-broadcast feel the design doc asks for (score readouts, chain breakdown animation).

## P1 — audio

- [ ] Sample-based sound effects replacing the procedural ones (`src/audio/audio.ts`): board on water at speed, carve spray, lip crack, whitewater roar in the tube, wipeout, UI. CC0 sources or original recordings.
- [ ] Soundtrack: the generative dub loop (`src/audio/music.ts`) is a placeholder. Wanted: several original or licensed tracks, a menu track, an in-run track that ducks in the tube, track selection in options.

## P2 — gameplay depth

- [ ] Visible AI surfers: contest opponents exist only as a score model (`src/goals/contest.ts`). Render them surfing their own waves, and add drop-in hazards in free surf.
- [ ] Wave variety: sets and lulls, multiple peaks, wave selection from the line-up, wind and chop affecting the face (`src/wave`).
- [ ] Trick catalogue completeness against design doc §5: check every listed trick has an entry in `data/tricks.json` with the right input and section; add missing exit moves and specials per rider.
- [ ] Longboard mode (design doc §11 requested feature): different physics, cross-stepping, nose rides.
- [ ] Create-a-surfer: suit colours and board graphics in the roster UI.
- [ ] Replay saving and sharing: recordings are small (inputs only); save the best chain per beach, allow export/import as a file or URL.
- [ ] Online leaderboards: needs a backend; keep it optional and privacy-safe.

## P2 — platform and polish

- [ ] Gamepad remapping UI and a keyboard remapping screen (`src/input/keymaps.ts`).
- [ ] Safari check: audio unlock, gamepad rumble absence, WebGL2 performance on Apple GPUs at 2× pixel ratio.
- [ ] Native macOS wrapper (Tauri, `src-tauri`), signed and notarised, with fullscreen and gamepad passthrough.
- [ ] Save slots and export/import of the career save.
- [ ] Accessibility: colour-blind safe trick icons and meter states, reduced-motion option for the wipe and slow motion, remappable keys.

## P3 — engineering

- [ ] Split `src/scenes/gameScene.ts` (menus, results, replay, multiplayer flow are one class) into flow modules with a small state machine.
- [ ] Extend `tools/smoke.mjs` to cover the pause menu, results, and replay; run it in CI (already wired in `.github/workflows/ci.yml`).
- [ ] Perf budget check in CI using `tools/perf.mjs` thresholds.
- [ ] Vercel: production branch is still the original feature branch; switch it to `main` in the project settings.

## Done

- M0–M10 (see `docs/PLAN.md`): wave, rider, tube and floater, tricks and scoring, goals and career, riders and boards, multiplayer modes, replays, scrapbook, transitions, lessons, feel pass, README, hosted build.
