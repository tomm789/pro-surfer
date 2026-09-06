# Milestone plan

Milestones follow design doc §13. Each ends with `npm run check` green and a headless capture in `artifacts/`.

| M | Deliverable | Status |
|---|---|---|
| M0 | Vite/TS/Three project, sim core, tuning schema, headless screenshot/clip tooling | done |
| M1 | Parametric peeling wave, curl, sections/close-outs, hollowness → tube, water shader, ocean, sky | done (wave meter HUD in M5) |
| M2 | Rider: prone/stand/drop, face physics, launch/land with Perfect/Sloppy/wipeout, chase cam, input | done |
| M3 | Tube (stall in, balance meter, rail grab, quick cuts, spit out) and floater over sections | done |
| M4 | Trick catalogue as data (§5), input sequencer with 600 ms buffer and diagonal cone, trick tracker HUD | done |
| M5 | Special meter states, chain/multiplier, cash-in, repeat decay, proximity, rotation, tube time, clock + overrun, HUD (score, clock, meter, wave meter) | done |
| M6 | Goals & career: all goal types, icon stack, photo director, three-heat contests, hazards + object cam, level data, boat hub, world map, trick book, saves | done |
| M7 | Riders, boards, stats, unlock flow, suits, secret riders | done |
| M8 | Free surf, icon challenge, handicap, split-screen head-to-head, Push, time attack, record book | done |
| M9 | Presentation: rider model + animation, water polish (whitewater, spray, glint), beach landmarks, replays, music, TV transitions, scrapbook | done (procedural rider model; replays re-simulate the recorded inputs) |
| M10 | Tuning pass (§14), tutorial beach, polish, hosted build + local run instructions, optional native wrapper | done except the native wrapper (deferred: the browser build is the deliverable; see README) |

## §14 feel checklist status

`tests/feel.test.ts` encodes the checklist as sim measurements and writes a report (`LINEUP_SCRATCH=<dir> npx vitest run tests/feel.test.ts`). Current values: neutral trim holds 6.5–10.7 m/s and never gets caught; two pumps launch a 1.7 s air on 7 ft; launch height +17% with more speed, +40% on 12 ft, +32% with Air 1.0; mid Spin on 8 ft reaches a 540 (not a 900), Spin 1.0 on a 12 ft outer reef reaches a 900; a casual player holds the tube ~12 s and an expert with the rail grab 15 s+; a wipeout costs ~6.4 s of clock. Unknowns from design doc §15 resolved as: wipeout clock penalty 3 s, plain-rotation air base 200, meter yellow drain ~12 s.

## Delivery to the Mac

1. `git clone` + `npm install` + `npm run dev` → Chrome at `http://localhost:5173`. Press any key/button on the boot screen (unlocks audio and the gamepad).
2. Hosted static build (Netlify/Vercel) for a zero-install URL.
3. Optional later: Electron wrapper for a `.app` (needs an Apple Developer ID for Gatekeeper-clean distribution).
