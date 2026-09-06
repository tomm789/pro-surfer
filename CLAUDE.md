# LINE-UP (working title) — surf trick game, macOS

Read `AGENTS.md` first. It is the canonical contributor guide for every agent (Claude, Codex, humans): rules, layout, commands, verification standard, git workflow. This file only repeats the essentials.

Read `docs/DESIGN.md` before any gameplay work. It is the spec. `docs/DECISIONS.md` records the technical decisions made after research; `docs/PLAN.md` is the milestone plan; `docs/BACKLOG.md` is the prioritised open work.

- Sections 3–6 of the design doc define wave, rider states, tricks and scoring. Implement them as written; put every tunable constant in `data/tuning.json`.
- Tricks, beaches, goals, riders and boards are data files under `data/`. Never hard-code a trick or a goal.
- Rider physics runs in wave space (u along the crest, v up the face) and is converted to world space for rendering.
- Original IP only: no real surfers, brands, logos or the original game's name anywhere in code, assets or UI.

## Engine and layout

- Engine: TypeScript + Three.js (WebGL2) + Vite. Native macOS wrapper via Tauri is optional and comes last.
- `src/core`, `src/wave`, `src/rider`, `src/tricks`, `src/scoring`, `src/goals`, `src/world`, `src/save` are the **simulation**: deterministic, fixed-timestep, no DOM, no `three` imports. A test enforces this.
- `src/render`, `src/ui`, `src/audio`, `src/input` are the **presentation** layer and may use the DOM and `three`.
- Units: metres, seconds, radians. World is Y-up. The wave's crest runs along +X; the shore is toward −Z; the lip throws toward −Z.

## Workflow

- `npm run dev` — dev server (host 0.0.0.0, port 5173). `npm run check` — typecheck + tests + build.
- `npm run shot -- --scene <name> --t <seconds>` renders a headless screenshot into `artifacts/` (SwiftShader WebGL2 works in this container).
- `npm run clip -- --scene <name> --seconds 10` records a short WebM clip into `artifacts/`.
- `npm run smoke` walks every menu flow headlessly; `npm run feel` prints the design doc §14 measurements.
- Unit tests live in `tests/` (vitest). Simulation code must be testable without a browser.
