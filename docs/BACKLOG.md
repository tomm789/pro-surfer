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

## P1 — more from the pool

The pool has zones (`beach.zones`): a lap passes through a barrel section, a wall and a ramp, `wave.zoneAt(u)` names them, the wave meter shows them and a callout announces the next one. Three career levels (`wavepool-1..3`) open the career with `zone` goals (barrelled in the barrel section, airs off the ramp, named turns on the wall). The foil carriage leads the curl at a fixed distance, so it already moves at `breakSpeed`.

- [ ] Show the carriage starting a lap (it just exists at the moment), and give the pool a start-of-lap moment: a horn, the wave rising behind the rider.
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
- [ ] Wave variety: sets and lulls, multiple peaks, wave selection from the line-up, wind and chop affecting the face (`src/wave`).
- [ ] Trick catalogue completeness against design doc §5: check every listed trick has an entry in `data/tricks.json` with the right input and section; add missing exit moves and specials per rider.
- [ ] Specials (face and air) are still button sequences on the left stick gated by the meter. Give them shapes too (MECHANICS §10), or fold them into the recogniser as bigger versions of the basic turns.
- [ ] Tube tricks are still direction + button. They could read the feet as the air grabs do (`feet` on the tube entries and a `readGrabs` for the tube section).
- [ ] Longboard mode (design doc §11 requested feature): different physics, cross-stepping, nose rides.
- [ ] Create-a-surfer: suit colours and board graphics in the roster UI.
- [ ] Replay saving and sharing: recordings are small (inputs only); save the best chain per beach, allow export/import as a file or URL.
- [ ] Online leaderboards: needs a backend; keep it optional and privacy-safe.

## P2 — platform and polish

- [ ] Gamepad remapping UI and a keyboard remapping screen (`src/input/keymaps.ts`). Options → Controller test already shows what the pad sends (both sticks raw and deadzoned, the five stance quantities, every button), which is the first thing to open with a new pad.
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
