# Backlog

Prioritised open work. Milestones M0–M10 of `docs/DESIGN.md` §13 are implemented, and the control scheme has since been rebuilt around `docs/MECHANICS.md` (each stick is a foot). The game is playable end to end but it is a first pass everywhere. The gaps below are ordered by how much they separate this from a finished console-quality game. Pick from the top. When you start an item, list it under **In progress** with your name and branch; when it lands, move it to **Done** with the PR.

## In progress

(none)

## P0 — the stick scheme on a real controller

The stance model has been verified by measurement (`tests/stance.test.ts`, `tests/feel.test.ts`) and by a scripted virtual player, but **nobody has held a controller yet**. This is the first thing to fix and everything here is judged by feel, not by a test. Constants live in `data/tuning.json` under `stance`, `recognizer` and `camera`.

- [ ] **Rail feel**: `stance.footFollowRate`, `railFollowRate`, `railCarveBonus`, `compressionTurnBonus`. A committed lean should feel heavy and deliberate, not twitchy; a small lean should hold a line.
- [ ] **Pump rhythm**: `pumpFullRate`, `pumpAccelScale`, `pumpPhaseDeadzone`. The window for being "in phase" must be generous enough to learn but tight enough to reward timing. Consider whether a beginner needs an audible or visual cue (open question in MECHANICS §10).
- [ ] **Pop**: `popRate`, `loadDecaySeconds`. Crouch-then-flick must fire reliably at the lip without firing accidentally during a pump. This is the single most likely thing to feel wrong.
- [ ] **Twist and slide**: `twistTorque`, `twistGrip`, `twistMaxRad`, `twistSteer`, `slideFailSeconds`. A snap should snap; a slide should be recoverable, not a death sentence (MECHANICS §3.4).
- [ ] **Recogniser thresholds**: `recognizer.*`. Does what the game names match what the player thinks they did? Wrong names are worse than no names. Watch for turns that score nothing because the rail never released.
- [ ] **Camera**: `skateDistance`, `skateHeight`, `railSwing`, `compressionDrop`, and the first-person `fp*` values. First person is rigid by design; if it feels sickening, damp the *look target* rather than the position.
- [ ] **Assists**: `career.options.assists` is stored but nothing reads it yet. Implement the four assists in MECHANICS §9 (auto-trim, pump assist, rotation assist, landing assist) and default them on, with a Pro toggle that turns all four off.
- [ ] Classic scheme regression: it is still selectable and every lesson has classic hints; check it still plays after any stance change.

## P0 — the pool needs shape

The pool wave is deliberately uniform and never closes out, which gives the long ride it should. The cost is that nothing ever prompts the player to do anything: a virtual player settled into a groove and did four turns in two minutes. The real venue solves this with named sections along its length.

- [ ] Vary the pool wave along `u` — a barrel section, a ramp/air section, a soft turn section — so a lap has structure. Probably an optional per-beach modulation of hollowness in `src/wave/wave.ts` (`profileAt`), defaulted off so the ocean breaks are untouched.
- [ ] Give the sections names and let goals reference them ("get barrelled in the tube section").
- [ ] The foil carriage is currently decoration at a fixed lead. Tie its speed and the wave's `breakSpeed` together explicitly, and show it starting a lap.

## P1 — visual identity (the biggest gap)

- [ ] **Character.** Now a chunky stylised figure with an oversized head, driven continuously by the stance (`src/render/surfer.ts`). It reads at a distance but is still primitives. Wanted: a proper cute character — hands that actually grip the rail, a face with expressions (strain in a barrel, delight on a landing), a wetsuit that deforms, arms that windmill for balance. Keep it stylised, not human-proportioned, and keep the rule from MECHANICS §7 that heavier-looking parts lag more.
- [ ] **Read the stance harder.** A hard bottom turn should visibly drag a hand; a snap should throw spray over the tail; a compression should squash the whole figure. The hooks are all in `SurferDrive` — this is animation work, not plumbing.
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
- [ ] The Trick Book still lists button inputs, which is wrong for the dual scheme. Rewrite it as a description of *shapes* — what the board has to do for each recognised turn — and show the recogniser's thresholds so the player can learn what counts as a snap.
- [ ] Air tricks are still catalogue-driven (grab buttons). Consider recognising grabs from which stick is pushed where while the grab button is held, so the air game matches the face game.
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
- Dual-stick foot control (`docs/MECHANICS.md`, `src/rider/stance.ts`), with the classic scheme kept selectable.
- Skate-style close third person and a rigid first person with the front foot and board nose in frame.
- Stylised character driven continuously by the stance.
- Long Pool venue with the foil carriage; the default venue.
- Emergent turn recognition feeding the existing chain scoring.
