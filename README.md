# LINE-UP

A surf trick game where each thumbstick is one of your feet. Lean them together to bury a rail, press the tail to stall into the barrel, crouch and explode off the lip. Peeling waves, airs, tubes and floaters, a special meter, chained turns you cash in before the clock runs out, and a career of goals across a wave pool and six ocean breaks. Original IP; everything is procedural (no downloads, no assets to fetch).

Runs in the browser on Apple Silicon and Intel Macs. Chrome is recommended (Safari works; Chrome has the best gamepad support).

## Play on your Mac

```bash
git clone https://github.com/tomm789/pro-surfer.git
cd pro-surfer
npm install
npm run dev
```

Open <http://localhost:5173> in Chrome. Press any key or gamepad button on the boot screen (this unlocks audio and the controller). Press F on the menu for fullscreen.

Or just play the hosted build: <https://line-up-surf.vercel.app> (redeploys on every push, no install).

## Controls — each stick is a foot

A gamepad is strongly recommended. **Left stick is your back foot, right stick is your front foot. Down presses that foot into the board, up unweights it.** That one rule never inverts, and everything else follows from it:

| What your thumbs do | What the board does |
|---|---|
| Both sticks the same way | **Rail / lean** — this is the carve. The harder the lean, the harder the turn. |
| Both sticks **down**, then flick both **up** | **Crouch and pop** — a bottom-turn load, an ollie off the lip, or standing up from prone. |
| Sticks **opposite** ways | **Twist** — the board pivots out from under you: snaps, tail slides, rotation in the air. |
| Right stick down (front foot) | **Drive** — weight forward, down the line, more speed. |
| Left stick down (back foot) | **Stall** — weight on the tail; how you set up for the barrel. |

**Speed is a rhythm, not a button.** Extend as you climb the face, compress as you drop. Out of phase gets you nothing, and holding a stick gets you nothing at all. This is the same energy loop as pumping a bowl on a skateboard.

Buttons: **B / K** grab (rail grab in the tube, grabs in the air, duck dive when paddling) · **X / J** carve harder · **Y / L** slide / floater · **LB / RB** or **Q / E** rotation assist · **R3 / Enter** cash in the chain · **LT / Shift** cycle camera (third person → first person → wide) · **Start / Esc** pause.

On a keyboard the back foot is **WASD** and the front foot is the **arrow keys**. It works, but two sticks is the way this is meant to be played.

Prefer the old single-stick scheme? **Controls** on the boat menu switches to Classic (arrows to turn, ↑ pump, ↓ stall, Space jump), and every lesson teaches whichever scheme you picked.

`docs/MECHANICS.md` is the full mapping from real surfing body movement to the sticks, including where surfing stops behaving like skating.

## Tricks in one minute

Turns are not button combinations. The game watches what the board actually did — how much rail you buried, how far the direction changed, where on the face it happened, whether the tail broke loose — and names it: **bottom turn**, **snap**, **off the lip**, **cutback**, **roundhouse**, **tail slide**, **layback**. Do a good turn and you get credit for the turn you did.

- **Airs**: crouch as you climb, explode at the lip. Twist to rotate, crouch in the air to spin faster, land with your legs loaded to absorb it.
- **Tube**: press the tail to slow down and let the lip throw over you, crouch to fit, correct the balance marker with small rail leans, hold grab for the rail.
- **Floater**: unweight both feet as you reach a section and ride over the whitewater.
- **Special meter** fills as you score and flashes yellow when full; while yellow you can link across sections.
- **Cash in** to bank the chain. A wipeout loses it.

## Where you surf

**Long Pool** is the home venue: a machine-made wave on an inland basin, driven by a foil carriage that runs the length of the pool ahead of you. It is perfectly uniform and it does not close out, so the ride lasts as long as the clock does. Six ocean breaks — a sandbar, a point, a reef pass, a cove, a slab and an outer bommie — are selectable from the boat menu and behave as they always did, with sections, close-outs and hazards.

## Modes

Lessons (seven short tutorials with on-screen hints, from standing up to the tube), Career (12 levels of goals with unlocks and stat rewards), Free Surf, Timed Run, Icon Challenge, split-screen Head to Head and Push, turn-based Time Attack, a Record Book, a Trick Book, a Scrapbook of photos, TV-style replays of your best chain after every run (press K or B during a replay to snap a photo), and eight riders with eight boards.

**Start with Lessons.** Seven minutes of them will teach the stick scheme better than this page can.

## Development

```bash
bash scripts/setup.sh   # npm ci, headless Chromium for the tools, npm run check
npm run check           # typecheck + tests + build
npm run test            # vitest
npm run smoke           # walks every menu flow headlessly, fails on runtime errors
npm run feel            # design doc §14 feel checklist with a measurement report
npm run shot -- --scene ride --beach reefpass --ft 10 --t 20   # headless screenshot into artifacts/
npm run clip -- --scene ride --seconds 10                       # headless WebM clip
```

Coding agents (Codex, Claude) read `AGENTS.md`; `docs/CODEX.md` has the Codex setup and kickoff prompt; `docs/BACKLOG.md` is the prioritised open work.

The simulation (`src/core`, `src/wave`, `src/rider`, `src/tricks`, `src/scoring`, `src/goals`, `src/world`, `src/save`) is deterministic and has no DOM or Three.js dependencies; a test enforces this. Every tunable constant lives in `data/tuning.json`; tricks, beaches, levels, riders and boards are data files under `data/`.

See `docs/MECHANICS.md` for the control-to-body model (the source of truth for how the rider is controlled), `docs/DESIGN.md` for the design spec, `docs/DECISIONS.md` for the technical decisions and `docs/PLAN.md` for the milestone status.
