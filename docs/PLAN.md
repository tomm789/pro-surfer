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
| M10 | Tuning pass (§14), tutorial beach, polish, hosted build + local run instructions, optional native wrapper | |

## Delivery to the Mac

1. `git clone` + `npm install` + `npm run dev` → Chrome at `http://localhost:5173`. Press any key/button on the boot screen (unlocks audio and the gamepad).
2. Hosted static build (Netlify/Vercel) for a zero-install URL.
3. Optional later: Electron wrapper for a `.app` (needs an Apple Developer ID for Gatekeeper-clean distribution).
