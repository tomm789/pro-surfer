# LINE-UP

A surf trick game in the spirit of the early-2000s console classics: peeling waves, airs, tubes and floaters, a special meter, chained combos you cash in before the clock runs out, and a career of goals across six beaches. Original IP; everything is procedural (no downloads, no assets to fetch).

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

## Controls

Keyboard (player 1):

| Action | Keys |
|---|---|
| Turn / paddle | Arrow keys or WASD |
| Pump for speed | Up |
| Stall (double-tap: super stall into the tube) | Down |
| Jump (hold to load, release at the lip) | Space |
| Carve | J |
| Grab (also duck dive when paddling) | K |
| Slide / stand up / floater | L |
| Spin left / right | Q / E |
| Cash in the chain | Enter |
| Camera | Shift |
| Object cam (when a hazard is flagged) | Tab |
| Pause | Esc |

Gamepad (standard mapping, e.g. Xbox or DualSense over Bluetooth or USB): left stick or d-pad to turn, A jump, X carve, B grab, Y slide / stand, LB / RB spin, R3 cash in, LT camera, RT object cam, Start pause. Rumble works in Chrome.

Player 2 in split screen uses the left-hand cluster: WASD move, F jump, G carve, H grab, V slide, R / T spin, B cash in, C camera, X object cam. Or plug in a second gamepad.

## Tricks in one minute

- **Airs**: pump up the face, hold jump, release as you hit the lip. Direction plus grab for grabs, spin buttons for rotations, direction plus jump in the air for flips. Land square to the wave for a Perfect (bigger multiplier); 45° off is a wipeout.
- **Face**: double-tap a direction with carve for snaps, cutbacks and layback slides.
- **Tube**: stall (Down) as the lip throws, then stay balanced with the stick. Hold grab to grip the rail and halve the drift. Tube time feeds the chain.
- **Floater**: slide (L) as you reach a section to ride over the whitewater.
- **Special meter**: fills as you score, flashes yellow when full and unlocks specials. While yellow you can link tricks across sections.
- **Cash in** to bank the chain. A wipeout loses it.

## Modes

Lessons (seven short tutorials with on-screen hints, from standing up to the tube), Career (12 levels of goals with unlocks and stat rewards), Free Surf, Timed Run, Icon Challenge, split-screen Head to Head and Push, turn-based Time Attack, a Record Book, a Trick Book, a Scrapbook of photos, TV-style replays of your best chain after every run (press K or B during a replay to snap a photo), and eight riders with eight boards.

## Development

```bash
npm run check        # typecheck + tests + build
npm run test         # vitest
npm run shot -- --scene ride --beach reefpass --ft 10 --t 20   # headless screenshot into artifacts/
npm run clip -- --scene ride --seconds 10                       # headless WebM clip
```

The simulation (`src/core`, `src/wave`, `src/rider`, `src/tricks`, `src/scoring`, `src/goals`, `src/world`, `src/save`) is deterministic and has no DOM or Three.js dependencies; a test enforces this. Every tunable constant lives in `data/tuning.json`; tricks, beaches, levels, riders and boards are data files under `data/`.

See `docs/DESIGN.md` for the design spec, `docs/DECISIONS.md` for the technical decisions and `docs/PLAN.md` for the milestone status.
