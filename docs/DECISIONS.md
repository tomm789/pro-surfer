# Technical decisions

Recorded after research (September 2026). `docs/DESIGN.md` is the game spec; this file records how it is built and why.

## 1. Engine: TypeScript + Three.js (WebGL2) + Vite

The design doc recommended Godot 4.x with Three.js as the alternative and asked for the decision before M1. Chosen: **Three.js r185 on the WebGL2 renderer**, TypeScript 5.9, Vite 8, Vitest 5.

Why:
- **Verifiable where it is built.** Development happens in a GPU-less Linux container. Headless Chromium renders WebGL2 through SwiftShader out of the box (measured: a 720p frame of the wave scene in ~3 s, sim stepping in milliseconds), so every change can be screenshot, clipped and measured before it is pushed. Godot 4.7 can only be unit-tested headless here; visual verification needs Xvfb + llvmpipe on the Compatibility renderer and never sees the Metal path the Mac would use.
- **Zero-install on the Mac.** The game runs from a URL or `npm run dev` in Chrome/Safari on Apple Silicon. Gamepad API supports Xbox Series and DualSense with the standard mapping in Chrome and Safari; dual-rumble works in Chrome 89+ and Safari 17+; fullscreen and pointer lock work in both. Chrome is the primary target (120 Hz rAF, Keyboard Lock); Safari secondary.
- **No signing dead end.** Distributing an unsigned/ad-hoc `.app` on Sequoia/Tahoe is painful without a paid Apple Developer ID. A wrapper is deferred; if one is wanted, Electron is preferred over Tauri (WKWebView caps rAF at 60 Hz before macOS 26, needs first-responder for gamepads, has no rumble via the community polyfill).
- **WebGL2, not WebGPU, for now.** Three's WebGPURenderer is mature on Chrome, but Safari's WebGPU is only default on macOS 26 and still has correctness bugs; headless WebGPU is unavailable here. Shaders are plain GLSL; a later TSL port is optional.

## 2. Simulation / presentation split

- `src/core`, `src/wave`, `src/rider`, `src/tricks`, `src/scoring`, `src/goals`, `src/world`, `src/save` are deterministic, fixed-timestep (60 Hz), seeded-RNG, and never import `three` or touch the DOM. `tests/architecture.test.ts` enforces it.
- `src/render`, `src/ui`, `src/audio`, `src/input` are presentation.
- Camera and rider-view interpolation advance in the sim step so headless captures and replays are exact.

## 3. Wave model

One parametric model answers both the mesh and the physics, so the board rides exactly the surface drawn.

- Wave space: `u` metres along the crest (the curl advances toward +u), `v` in [0,1] from trough to lip along the face arc. World: `x = dir·u`, `y` height, `z = -d` (shore at −Z).
- Cross-section (`src/wave/profile.ts`): an elliptical arc centred above the trough. The curl angle `phi` runs from ~0.52π (feathering face) through π (roof) to ~1.62π (throwing barrel). Lip thickness offsets the outer surface; a whitewater morph lowers and widens broken columns. The rider's `v=1` is capped at ~104° so it is always "the lip you launch from", never the underside of the roof.
- Fields along the crest (`src/wave/wave.ts`): `broken(u)` behind any breaking edge, `hollow(u)` in a throw band ahead of it (plateau then falloff over `throwLength ≈ 3.6·H`), `tube(u)` where a roof exists and the wave has not collapsed. Sections (`src/wave/sections.ts`) are scheduled deterministically from the beach profile, announced `warnSeconds` early, grow from a point, and merge into the main curl (a close-out jump).
- Mesh: 176 columns × 56 rows rebuilt on the CPU each frame (~10k vertices); the u-window snaps to the column spacing so columns don't swim. Ambient ocean is 4 Gerstner waves masked to zero under the strip; sky is a shader dome.
- Shading follows the original's signature: colour ramps from deep blue to teal with height up the face, plus foam from geometry + scrolling fbm, Schlick fresnel to the sky, sun glint, lip translucency, and tube darkening.

## 4. Rider model

- State machine: `prone → face ⇄ tube`, `face → air → face`, `face → floater → face`, any → `wipeout → prone`.
- Face physics: heading angle in the tangent plane, scalar speed. Gravity along the face (`g·sin(slope)·sin(heading)`), relaxation toward a trim speed that peaks mid-face and in the pocket and falls off on the shoulder (`wavePower`), pump adds acceleration (strong when descending, scaled by wave power so you cannot outrun the wave forever), stall bleeds, carve turns faster and adds a little speed. Heading auto-levels toward the line when the stick is neutral.
- Launch: explicit model (base pop + loaded pop + a slice of speed, scaled by the Air stat; carry down the line; shoreward drift so the arc lands on the face) instead of the raw face tangent, which is nearly vertical at the lip.
- Landing: the board pitches with the arc, so a straight air comes down at the mirror angle by itself; the judged quantity is the spin residual modulo 180° (Perfect ±20°, Sloppy ±45°, else wipeout). Fakie is Perfect. Rotation count rounds to the nearest 180.
- Wipeout: tumble in the whitewater, then respawn prone 20 m ahead of the curl (the next wave); the clock penalty is time lost plus a fixed penalty (M5).

## 5. Data

Tricks, beaches, goals, riders and boards are JSON under `data/`, validated with zod at load and in tests. Every tunable constant is in `data/tuning.json`.

## 6. Verification

- `npm run check` = typecheck + vitest + build.
- `npm run shot -- --scene <name> --t <s> [--beach --ft --auto 1 --input '{...}']` renders a deterministic headless screenshot; `npm run clip` records a clip; `tools/perf.mjs` measures step/render/screenshot cost.
- Feel targets in design doc §14 are encoded as tests where practical (climb time, pumping, curl catch, launch/land windows).

## 7. Resolved unknowns (design doc §15) and decisions taken

| Question | Decision | Basis |
|---|---|---|
| Base points, meter rates | Design doc §6.3 numbers, in `data/tuning.json` | never published; tuned in M5/M10 |
| Heat length / judging | 3 heats × 90 s; judged on best two waves, 0–10 each, weighted air/tube/face per level | original had three heats; rest undocumented |
| Exit moves score? | Small flourish bonus (300) and they end the wave, not the run | unknown in sources |
| Wipeout clock penalty | 6 s fixed + time to re-catch | doc's 5–8 s target |
| Perfect landing | mirror angle = spin residual within ±20° of a 180-multiple; backwards counts | GameFAQs: mirror of launch, "perfect is still perfect backwards" |
| Xbox frame rate | target 60 fps (120 on ProMotion in Chrome); delta-time everywhere | |

## 8. Assets and IP

Original IP only. Placeholders first (capsule rider, procedural water, shader sky). Presentation pass (M9) uses CC0/OFL sources only (Poly Haven HDRIs, Kenney/Quaternius props, Google Fonts) or procedural generation; music and SFX are synthesised in Web Audio or sourced CC0. No real surfers, brands or the original title anywhere.
