# LINE-UP — agent guide

This file is the canonical contributor guide for every coding agent working in this repository (Codex, Claude, or a person). Read it fully before changing anything. `CLAUDE.md` points here.

LINE-UP is an original surf trick game in the spirit of the early-2000s console classics: peeling waves, airs, tubes, floaters, a special meter, chained tricks you cash in, a career of goals across six beaches, split-screen multiplayer, replays and a scrapbook. It runs in the browser (TypeScript + Three.js + Vite) and is hosted at <https://line-up-surf.vercel.app>. Milestones M0–M10 from the design doc are implemented; the game is playable end to end but far from finished. `docs/BACKLOG.md` lists what needs work, in priority order.

## Read these first

1. `docs/MECHANICS.md` — **the control-to-body source of truth.** Each stick is a foot; the board obeys the difference between them. It owns how the rider is controlled and how the board behaves, and it beats the design doc on those points.
2. `docs/DESIGN.md` — the spec for everything else. Sections 3–6 define the wave, rider states, tricks and scoring. Implement them as written; do not invent different rules.
3. `docs/DECISIONS.md` — engine and architecture decisions and why.
4. `docs/PLAN.md` — milestone status and the §14 feel-checklist numbers.
5. `docs/BACKLOG.md` — prioritised open work. Pick from the top unless told otherwise.

## Hard rules

- **Original IP only.** No real surfers, brands, logos, song titles, or the name of the game that inspired this one, anywhere in code, data, assets, UI text or commit messages.
- **Simulation and presentation are separate.** `src/core`, `src/wave`, `src/rider`, `src/tricks`, `src/scoring`, `src/goals`, `src/world`, `src/save` are the deterministic, fixed-timestep (60 Hz) simulation: no DOM, no `three`, no `Math.random` (use `Rng` from `src/core/rng.ts`), no wall-clock time. `tests/architecture.test.ts` enforces the import rule. `src/render`, `src/ui`, `src/audio`, `src/input`, `src/scenes`, `src/app` are presentation and may use the DOM and `three`.
- **Every tunable constant lives in `data/tuning.json`**, validated by the zod schema in `src/core/tuning.ts`. Never hard-code a number that a designer would want to tweak. When you add a tunable, add it to both files.
- **Content is data.** Tricks (`data/tricks.json`), beaches (`data/beaches/*.json`), levels and lessons (`data/levels/*.json`), riders and boards (`data/riders.json`, `data/boards.json`). Never hard-code a trick, a goal, a beach or a rider.
- **Units:** metres, seconds, radians. World is Y-up. The wave's crest runs along +X, the shore is toward −Z, the lip throws toward −Z. Rider physics runs in wave space (`u` along the crest, `v` from trough 0 to lip 1) and is converted to world space only for rendering.
- **Determinism matters.** Replays re-simulate recorded inputs, so any nondeterminism in the sim breaks replays. `tests/replay.test.ts` checks a round trip.
- **Keep `npm run check` green** (typecheck + all tests + build) before every commit. Add or update tests for simulation changes.

## Layout

| Path | What |
|---|---|
| `src/core` | fixed-step loop, seeded RNG, event bus, tuning schema, replay recorder |
| `src/wave` | parametric peeling wave, curl, sections and close-outs, tube window |
| `src/rider` | rider state machine (prone, face, air, tube, floater, wipeout), the stance model (`stance.ts`), launch and landing judge |
| `src/tricks` | trick catalogue loader, input sequencer (600 ms buffer, 8-way quantisation), executor, and the emergent turn recogniser (`recognizer.ts`) |
| `src/scoring` | special meter, chain tracker and multipliers, run controller and clock |
| `src/goals` | goal types, level and lesson loading, icon stack, photo director, contests |
| `src/world` | beach definitions, hazards and wave objects, rider and board roster |
| `src/save` | career save, record book, scrapbook (localStorage with in-memory fallback) |
| `src/modes` | Push divider and time-attack maths |
| `src/render` | water shader and wave mesh, environment and sky, procedural surfer model, spray, cameras, replay director, landmarks |
| `src/ui` | HUD, menus, results, trick book, scrapbook, transitions |
| `src/scenes` | `rideScene.ts` (one ride), `splitScene.ts` (two rides), `gameScene.ts` (the whole flow) |
| `src/app` | app shell, fixed stepper, headless API |
| `tools/` | headless screenshot, clip, perf and smoke tools (Playwright + SwiftShader) |
| `tests/` | vitest suites, including `feel.test.ts` (design doc §14 as measurements) |

## Commands

```bash
npm install                 # once; then: npx playwright install chromium   (for the headless tools)
npm run dev                 # dev server on http://localhost:5173
npm run check               # typecheck + tests + build — must pass before every commit
npm run test                # vitest only
npm run shot -- --scene game --flow ride --auto 1 --t 8 --out artifacts/ride.png   # headless screenshot
npm run clip -- --scene ride --beach reefpass --ft 10 --seconds 10                 # headless WebM clip
npm run smoke               # walks every menu flow headlessly and fails on any runtime error
npm run feel                # runs the §14 feel checklist and prints the measurement report
```

`artifacts/` is git-ignored; put screenshots and clips there.

## Verifying your work (this is not optional)

You cannot play the game, so verify like this:

- **Visual change** (shader, mesh, model, camera, HUD, menu): take a headless screenshot with `npm run shot`, open the PNG and look at it. Compare against a screenshot from before your change. Describe what you saw in the PR.
- **Gameplay or physics change**: add or update a test in `tests/`. For feel, run `npm run feel` and quote the numbers before and after. Design doc §14 lists the targets.
- **Flow or UI change**: run `npm run smoke`. It presses keys through every mode and reports page errors.
- **Performance**: `node tools/perf.mjs --scene game --flow ride --t 20` prints sim step cost, render cost, draw calls and triangles. Keep draw calls in the low hundreds and triangles under ~300k at 1280×720.

### Headless API and URL parameters

The app exposes `window.__lineup` in headless mode (`?headless=1`): `stepTo(seconds)`, `step(n)`, `render()`, `state()` (scene debug state including the ride event log), `setInput(partialInput | { script: [{ t, input }] })`. The tools wrap this; `--script` feeds time-keyed inputs, e.g. `--script '[{"t":1,"input":{"stand":true}},{"t":2,"input":{"stickY":1}}]'`.

Useful URL parameters (also accepted as `--flag value` by the tools): `scene=game|ride|wave`, `flow=menu|ride|push|head`, `level=<id>`, `beach=<id>`, `ft=<n>`, `seed=<n>`, `auto=1` (stand automatically), `free=1`, `seconds=<n>`, `cam=chase|first|wide|close|shore|beach|portrait` (portrait: from the wall side looking at the face), `controls=dual|classic`, `assist=balance`, `debug=1` (on-screen state), `rider=<id>`, `board=<id>`, `alltricks=1`, `objects=0`, `autoreplay=1`, `cheat=riders|boards`.

Rider input fields: `backX`, `backY`, `frontX`, `frontY` (the two feet, −1..1, stick up positive), `stickX`, `stickY` (classic single stick, and menu navigation), `jump`, `carve`, `grab`, `slide`, `spinLeft`, `spinRight`, `cashIn`, `stand`, `duckDive`, `cameraToggle`, `objectCam`, `pause`.

Note when scripting headless input: `auto=1` only presses stand. A rider with all four foot axes at zero still trims down the line, which is fine for screenshots but means a fixed script is a poor test of the control scheme — pumping and turning are closed-loop (see `tests/stance.test.ts` for how to drive them properly).

### Gotchas

- Vitest hides `console.log`; write measurements to a file (see `tests/feel.test.ts`) or assert on them.
- The headless step loop advances sim time synchronously. Never use `setTimeout` for game timing; count down in `step(dt)`.
- The tools spawn `vite preview` on port 4179 in their own process group. If a run is interrupted, a stale server can hold the port; kill it by PID, not with a broad `pkill -f` pattern.
- SwiftShader (CPU WebGL) is slow but faithful. A screenshot takes 1–3 s; a 30 s sim step-through takes about a second.
- Landing is judged by the spin residual modulo 180°, so a fakie landing is perfect. Cross-section linking (air + face in one chain) only works while the meter is yellow; same-section tricks always link.

## Git and pull requests

- Branch from `main`, one topic per branch, small PRs. CI (`.github/workflows/ci.yml`) runs `npm run check`, the smoke test and a screenshot on every PR; the screenshot is attached as a workflow artifact.
- Commit messages: imperative summary line, then what and why. No model names or agent chatter in commit messages.
- Do not commit `artifacts/`, `dist/` or `node_modules/`.
- When you pick up a backlog item, note it under "In progress" in `docs/BACKLOG.md`; when done, move it to "Done" with the PR number. Other agents work in parallel; this is how we avoid collisions.
- Do not reformat files you are not otherwise changing.

## Working alongside other agents

Claude built M0–M10 and continues to work here; Codex works here too. The rules above apply to everyone. If you disagree with a design-doc rule, say so in the PR description and implement the doc's version anyway unless a human decides otherwise. Keep this file accurate: when a command, path or rule changes, update `AGENTS.md` in the same PR.
