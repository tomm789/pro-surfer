# Backlog

Prioritised open work. Milestones M0–M10 of `docs/DESIGN.md` §13 are implemented, and the control scheme has since been rebuilt around `docs/MECHANICS.md` (each stick is a foot). The game is playable end to end but it is a first pass everywhere. The gaps below are ordered by how much they separate this from a finished console-quality game. Pick from the top. When you start an item, list it under **In progress** with your name and branch; when it lands, move it to **Done** with the PR.

## In progress

(none)

## P0 — the stick scheme on a real controller

The stance model has been verified by measurement (`tests/stance.test.ts`, `tests/feel.test.ts`), by a scripted virtual player and by the smoke's scored run, but **nobody has held a controller yet**. Everything below is judged by feel, not by a test, and it is the only thing left that a test cannot do. Constants live in `data/tuning.json` under `stance`, `recognizer` and `camera`; every one of them is read live, so a change in the file shows on the next reload of the dev server.

The session, in order:

0. **Options → Controller test** first. Both sticks should move the dots, down should read as *pressed* on the bars, and every button should light. If the sticks are swapped or an axis is inverted on this pad, Options → Feet / Press fix it; a Nintendo pad wants Options → Buttons. Anything beyond that is an input-manager fix (`src/input/inputManager.ts`), not a tuning one. `npm run feel` prints the reference numbers (`dualPump`, `dualPop`, `dualRail`, `dualTwist`) to quote before and after a change.
1. **Lesson 1 at the pool** with assists on: stand, pump, carve. Then free surf at the pool.
2. Work through the feel list below, one constant at a time. Press **T** during the ride for the live tuning panel (PageUp/PageDown pick, `,` `.` nudge 5%, `0` reset, `9` copy the changed values as JSON), then write the numbers that felt right into `data/tuning.json` with a note in the commit about what changed and why. Options → Feet / Press swap the sticks or invert the press direction if the default mapping fights your thumbs.

- [ ] **Rail feel**: `stance.footFollowRate`, `railFollowRate`, `railCarveBonus`, `compressionTurnBonus`. A committed lean should feel heavy and deliberate, not twitchy; a small lean should hold a line. `rider.headingMaxRad` is the wall a held rail runs into.
- [ ] **Pump rhythm**: `pumpFullRate`, `pumpAccelScale`, `pumpPhaseDeadzone`. The window for being "in phase" must be generous enough to learn but tight enough to reward timing. Consider whether a beginner needs an audible or visual cue (open question in MECHANICS §10).
- [ ] **Pop**: `popRate`, `loadDecaySeconds`. Crouch-then-flick must fire reliably at the lip without firing accidentally during a pump. This is the single most likely thing to feel wrong.
- [ ] **Twist and slide**: `twistTorque`, `twistGrip`, `twistMaxRad`, `twistSteer`, `slideFailSeconds`. A snap should snap; a slide should be recoverable, not a death sentence (MECHANICS §3.4).
- [ ] **Grabs from the feet**: `stance.grabSettleSeconds` and the shapes in `data/tricks.json`. Does the grab you meant come out? If the shapes feel arbitrary, the table in MECHANICS §6 is the thing to redesign, not the matcher.
- [ ] **Recogniser thresholds**: `recognizer.*` (the Trick Book shows the live values). Does what the game names match what the player thinks they did? Wrong names are worse than no names. Watch for turns that score nothing because the rail never released.
- [ ] **Camera**: `skateDistance`, `skateHeight`, `railSwing`, `compressionDrop`, and the first-person `fp*` values. First person is rigid by design; if it feels sickening, damp the *look target* rather than the position.
- [ ] **Assists vs Pro**: assists on is the tuned default (auto-trim on quiet sticks, spin buttons, the wider landing window, trim drive). Pro turns them off (`proLevelRate`, `proTrimDrive`, `proLandingWindow`). Check Pro is playable and assists never fight a deliberate input.
- [ ] **Sets**: `beach.swell` on the ocean breaks. Is the lull too small to be fun, is the set a wall? `peak`, `lull`, `period`, `setSeconds` per beach.
- [ ] Classic scheme regression: it is still selectable and every lesson has classic hints; check it still plays after any stance change.
- [ ] Regular vs goofy: the mapping is fixed (left stick = back foot). If a goofy-footer wants the sticks swapped, that is an option to add (MECHANICS §10).

## P1 — more from the pool

The pool has zones (`beach.zones`): a lap passes through a barrel section, a wall and a ramp, `wave.zoneAt(u)` names them, the wave meter shows them and a callout announces the next one. Three career levels (`wavepool-1..3`) open the career with `zone` goals (barrelled in the barrel section, airs off the ramp, named turns on the wall). The foil carriage leads the curl at a fixed distance, so it already moves at `breakSpeed`.

- [ ] The carriage now pulls away from the curl over the first seconds of a ride with a horn and a "LAP · GO" call. Still wanted: the wave rising behind the rider from flat water at the very start, and a lap counter.
- [ ] Tune the zone shape with a controller: `wavelength` 140 m, `hollowAmp` 0.45, `heightAmp` 0.12 are a first guess.
- [ ] More pool levels once the feel is settled: a contest heat at the pool, a photo level at night.

## P1 — visual identity (the biggest gap)

- [ ] **Character.** A chunky stylised figure with an oversized head, driven continuously by the stance (`src/render/surfer.ts`). It now has a face that reacts (strain in the barrel, wide eyes in the air, shock in a wipeout, a grin on a landing or a big named turn, blinks), a hand that reaches for the water on a hard rail with spray where it touches, torso squash-and-stretch with compression, and arms that windmill in the air. Still primitives. Wanted next: hands that actually grip the rail on a grab (the grab poses are approximate), a wetsuit that deforms, a proper hair mesh. Keep it stylised, not human-proportioned, and keep the rule from MECHANICS §7 that heavier-looking parts lag more. `cam=portrait` is the lens for checking the face.
- [ ] **Wave.** The lip is thin and the barrel interior is flat. A spray sheet now comes off the throwing lip with blowback over the crest (`rideScene.updateSpray`). Wanted: thicker throwing lip with a translucent edge, interior lighting in the tube (light through the back of the wave), whitewater with volume rather than blur, refraction and caustics on the face, better foam trails behind the rider. `src/render/waterShader.ts`, `waveMesh.ts`, `spray.ts`.
- [ ] **Beaches.** Each beach is identifiable but sparse. Add shoreline geometry (sand, rocks, reef under the water at the reef breaks), vegetation, boats and crowd for the contest beach, a pier with detail, distance haze. `src/render/landmarks.ts`, `environment.ts`, `data/beaches/*.json`.
- [ ] **Sky and light.** Now: procedural clouds with per-preset cover, a sun disc with corona, sun glitter on the water, and a time of day per level (`sky`, `sunElevationDeg`, `sunAzimuthDeg` in a level file; presets `day|dawn|evening|dusk|night|cloudy` in `src/render/waterUniforms.ts`). Wanted next: cloud shadows on the water, a moon and stars for night, god rays through the lip at a low sun.
- [ ] **HUD and menus.** Functional DOM. Wanted: a proper art direction (typography, panels, iconography for trick icons, the balance meter, the wave meter), the boat hub as a 3D scene behind the menus, a world map for beach selection.
- [ ] **Transitions and results.** The results screen now counts the score up, reveals its rows one by one and breaks the score down by trick (`run.breakdown()`) and by section, with the best chain's shape. The replay chrome is still plain; wanted: a lower-third for the replay, a trick-by-trick ticker during it, and a proper "cash in" banner during the run.

## P1 — audio

- [ ] Sample-based sound effects replacing the procedural ones (`src/audio/audio.ts`): board on water at speed, carve spray, lip crack, whitewater roar in the tube, wipeout, UI. CC0 sources or original recordings.
- [ ] Soundtrack: the generative dub loop (`src/audio/music.ts`) is a placeholder. Wanted: several original or licensed tracks, a menu track, an in-run track that ducks in the tube, track selection in options.

## P2 — gameplay depth

- [ ] Visible AI surfers: contest opponents exist only as a score model (`src/goals/contest.ts`). Render them surfing their own waves, and add drop-in hazards in free surf.
- [ ] Wave variety: sets and lulls are in (`beach.swell`: the face pulses between `lull` and `peak` × nominal on a slow cycle, called on the wave meter; lessons keep a steady wave). Still wanted: multiple peaks, wave selection from the line-up, wind and chop affecting the face (`src/wave`).
- [ ] Trick catalogue completeness against design doc §5: check every listed trick has an entry in `data/tricks.json` with the right input and section; add missing exit moves and specials per rider.
- [ ] Specials (face and air) are still button sequences on the left stick gated by the meter. Give them shapes too (MECHANICS §10), or fold them into the recogniser as bigger versions of the basic turns.
- [ ] Tube tricks now read the feet like the air grabs (Slide is the free hand in the barrel; shapes in `data/tricks.json`, table in MECHANICS §6). Whether those eight shapes are the right eight is a controller question.
- [ ] Longboard mode (design doc §11 requested feature): different physics, cross-stepping, nose rides.
- [ ] Create-a-surfer: suit colours and board graphics in the roster UI.
- [ ] Replay sharing is in: the best chain at each beach is kept in the career as a compact recording (sticks are quantised to 1/64 so replays are exact), the Record Book plays them, and a replay can be copied as text and pasted on another machine. Wanted next: a URL form (needs compression: a jittery three-minute run is ~150 KB), and the replay of any run, not only the best chain.
- [ ] Online leaderboards: needs a backend; keep it optional and privacy-safe.

## P2 — platform and polish

- [ ] Gamepad remapping UI and a keyboard remapping screen (`src/input/keymaps.ts`). Options → Controller test already shows what the pad sends (both sticks raw and deadzoned, the five stance quantities, every button), which is the first thing to open with a new pad.
- [ ] Safari check: audio unlock, gamepad rumble absence, WebGL2 performance on Apple GPUs at 2× pixel ratio.
- [ ] Native macOS wrapper (Tauri, `src-tauri`), signed and notarised, with fullscreen and gamepad passthrough.
- [ ] Save slots. Export/import of the career save is in (Options → Export save / Import save, via the clipboard and a paste prompt).
- [ ] Accessibility: colour-blind safe trick icons and meter states, remappable keys. A reduced-motion option (Options → Motion) now cuts the wipe and the results reveal.

## P3 — engineering

- [ ] Split `src/scenes/gameScene.ts` (menus, results, replay, multiplayer flow are one class) into flow modules with a small state machine.
- [ ] The smoke now covers pause, results, the replay and the controller test, and `npm run perf` runs a budget in CI. Still missing from the smoke: the lessons list beyond the first lesson, the scrapbook's photo view, the head-to-head results.
- [ ] Vercel: production branch is still the original feature branch; switch it to `main` in the project settings.

## Done

- M0–M10 (see `docs/PLAN.md`): wave, rider, tube and floater, tricks and scoring, goals and career, riders and boards, multiplayer modes, replays, scrapbook, transitions, lessons, feel pass, README, hosted build.
- Dual-stick foot control (`docs/MECHANICS.md`, `src/rider/stance.ts`), with the classic scheme kept selectable.
- Skate-style close third person and a rigid first person with the front foot and board nose in frame.
- Stylised character driven continuously by the stance.
- Long Pool venue with the foil carriage and zones along its length; the default venue.
- Emergent turn recognition feeding the existing chain scoring.
- Stance readout on the HUD; Options submenu; assists as a Pro toggle.
- Onboarding tests that drive the real lessons, and a smoke test that drives a scored run through the
  game shell — added after a bug where the recogniser was never constructed in the real game and a
  full run scored zero while the ride scene scored fine in isolation.
- Pool zones on the wave meter with a section callout; audio that follows the stance (rail hiss, pop,
  named turns, slides, zone calls).
- Character face and reactions, hand drag with spray, squash and stretch, tail spray on a pivot;
  `cam=portrait`.
- Air grabs read from the foot shape under a held hand (`feet` in `data/tricks.json`, MECHANICS §6),
  and a Trick Book that describes shapes and the recogniser's real thresholds in the stick scheme.
