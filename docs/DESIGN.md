# Surf Sequel Design Guide

Reverse-engineered mechanics of *Kelly Slater's Pro Surfer* (Treyarch / Activision O2, 2002) and a build plan for a spiritual sequel on macOS.

Working title used throughout: **LINE-UP** (rename freely).

---

## 0. How to use this document in Claude Code

- Sections 1–10 describe **what the original did**. Treat them as the spec for "does this feel like a sequel?"
- Sections 11–15 describe **what to build**, with decisions already made so implementation can start without re-litigating design.
- Anything marked **[proposed]** is a tuning starting point where the original's exact numbers were never documented. Anything marked **[uncertain]** is a detail the sources disagree on or don't cover.
- Suggested workflow: paste the `CLAUDE.md` snippet in Appendix A into the repo root, keep this file at `docs/DESIGN.md`, and work milestone by milestone (Section 13). Each milestone has acceptance criteria; ask Claude Code to write tests against them where practical.

---

## 1. Source game at a glance

| Item | Detail |
|---|---|
| Developer / Publisher | Treyarch (console + PC/Mac), published by Activision under the Activision O2 label. GBA version by HotGen is a different 2D game — ignore it as a reference. |
| Release | Sept 2002 (PS2, Xbox, GameCube); Oct 2003 (Windows, Mac OS X via Aspyr). |
| Formula | Tony Hawk's Pro Skater structure adapted to surfing: timed runs, goal lists per level, a special meter, trick linking, unlockable tricks and gear. |
| Reception | Metacritic ~77–82 across console/PC. Praised: responsive control, convincing wave motion, depth of trick system, the special-meter linking twist, distinct personality (boat trip, laid-back soundtrack). Criticised: camera sits too close to the surfer, levels look repetitive and rarely show the environment, water surface texture too uniform, analog diagonal inputs misfire on the GameCube stick. |
| Presentation | You are a pro on a globe-trotting boat trip searching for the perfect wave. The boat is the main menu. World map to pick beaches. TV-style replays with cuts, pans and zooms. Licensed but mellow soundtrack (world / reggae / acoustic rather than punk). Real surf-film footage as unlockable extras. A scrapbook of in-game photos. Cheats entered as phone numbers into an in-game mobile phone. |

---

## 2. Core loops

### 2.1 Session loop
1. Boat (hub): pick board, read trick book, view scrapbook, options.
2. World map: pick an unlocked beach → pick a level (each beach has 1–3 levels, each with 2–5 goals).
3. Ride: a timed run (normally **3 minutes**; competition heats are shorter).
4. Completing the **required** goal unlocks new beaches/levels. **Optional** goals grant boards, special tricks, stat boosts, costumes, movies.
5. Return to boat, repeat. Career ends at a final "perfect wave" level requiring a 170-second no-wipeout ride and 500,000 points.

### 2.2 Ride loop (the second-to-second game)
1. Lie prone on the board. Turn toward the peak. Optionally **duck dive** under a wave to wait for a bigger one (the wave meter shows the next wave's height).
2. **Stand** as the wave lifts you and make the drop.
3. Ride the face ahead of the breaking curl. Pump (Up) for speed, carve up and down the face for more speed.
4. Do face tricks to fill the **special meter** (green).
5. When the meter is full it flashes **yellow**: special tricks unlock and tricks from *different wave sections* (face, tube, air) can be linked into one chain.
6. Keep the meter flashing by continuing to trick, landing aerials **Perfect**, and riding the tube.
7. **Cash in** the chain at any time while it's flashing, or let it bank automatically when the meter drains.
8. **Wipe out** → lose the entire uncashed chain and the meter, lose time, go prone, catch the next wave.
9. Repeat until the clock runs out. The run only ends after the clock hits zero *and* the special meter has drained, so a long chain can run past the buzzer.

The whole design tension is step 7: bank now, or risk it for a bigger multiplier. Reviewers singled this out as the game's identity.

---

## 3. Wave model

This is the part a sequel must get right, because the wave is both the level and the physics.

### 3.1 Structure
- Each ride is **one continuous peeling wave** that lasts as long as the run (the clock, not the wave, ends the ride). It breaks **right** or **left** depending on the beach (fixed per beach).
- You surf **ahead of the breaking part**. Regions of the wave, as the game itself defines them:
  - **The Face** — clean, unbroken wall ahead of the curl. Face tricks, floaters (at the lip), launches (at the lip).
  - **The Tube / Barrel** — inside the curl. Enter by stalling until the lip throws over you. Only exists on hollow beaches.
  - **The Air** — above the lip after a launch.
  - **The lip** — top edge; floaters ride along it; launching from it gives air.
  - **Whitewater / impact zone** — behind the curl. Getting caught here = wipeout.
- **Sections**: parts of the wave ahead of you can break early (close out). The game warns you visually ("watch that break"). You either float over the section, race past it, or get wiped. Section frequency and severity is a per-beach difficulty lever (G-Land, Teahupoo, J-Bay and the Cosmos level all break in sections; Trestles occasionally). Curls can approach from both sides on the harder waves.
- **Wave size**: each level defines a set of three wave heights (see Section 9 table). Bigger = taller face, more air, bigger barrel, faster. The **wave meter** (HUD, lower right) shows the current wave's height and breaking sections, plus the height of the next wave so you can choose to wait.
- **Barrel availability** is per beach: Mavericks explicitly has no rideable tube; Pipeline, G-Land, Teahupoo, Kirra, Jaws are barrel-heavy; Bells is sandy-bottom with occasional barrels.

### 3.2 Populated waves
Other surfers and objects share the wave and are used both as hazards and as goal targets: windsurfers, kayaks, inflatable rafts, jet-skis, bodyboarders ("spongers"), guys floating on inner tubes ("Fatty"), turtles, ice patches (Antarctica), a pier (Sebastian). A yellow **hazard sign** flashes when one is near, and holding the **object cam** button swings the camera to show it.

### 3.3 What it felt like
- Speed management is real: too slow high on the face and you bog and slide down; carving builds speed; the tube requires deliberately *losing* speed (stall / super stall).
- The curl is a constant pressure behind you; drifting back into it is the default way to die.
- Waves are big relative to the surfer (8 ft at the tutorial, 60 ft at Cortes Bank), so the face reads as a wall you climb.

---

## 4. Player states and controls

The original has four control contexts, and the same button does different things in each. Preserve this — it is a big part of the feel.

### 4.1 Original mapping (PS2 names / GameCube names)

| Context | Input | Action |
|---|---|---|
| **Prone (catching a wave)** | Stick L/R | Turn toward/away from the peak |
| | Circle / X | Duck dive (hold, facing the oncoming wave) — wait for a better wave |
| | Triangle / Y | Stand up (must stand before you get too high on the wave) |
| **Face** | Stick L/R | Turn / angle the board |
| | Stick Up | Speed up (pump) |
| | Stick Down | Stall; double-tap = Super Stall (used to drop into the barrel) |
| | X / A | Jump: hold to load, point the nose up the face, release at the lip to launch. Pressing Up while holding cancels the jump. |
| | Square / B | Carve (hold + direction). Double-tap near the lip = Snap; double-tap elsewhere = Rebound |
| | Circle / X | Grab-rail turn (smoother, less abrupt turn). Double-tap = Tail Chuck |
| | Triangle / Y | Tail slide (hold + L/R); Floater when near the lip (release at the top); double-tap = Revert Cutback |
| | R3 / C-stick Up | **Cash in** the current chain |
| | L2 / Z (hold) | Camera toggle (tube cam / focus) |
| | R2 / Z | Rear view / **Object cam** (only when the "!" hazard warning is up) |
| **Tube** | Stick Down | Stall deeper; Up = speed out |
| | Stick L/R (tap) | Keep the balance marker centred |
| | L1/R1 / L/R | Quick cut left/right to reposition in the barrel |
| | X / A | Speed up to escape |
| | Circle / X | Grab rail — dampens the balance meter while held |
| | Triangle / Y + direction | Tube tricks (Section 5) |
| **Air** | Stick or L1/R1 | Spin left / right |
| | Square / B + direction | Flip tricks |
| | Circle / X + direction | Grab tricks |
| | Triangle / Y, Y then Y + direction | Exit move (a styled dismount that ends the ride) |
| Any | Start | Pause: continue, retry wave, restart competition, beach goals, tips, options, trick book, end ride, return to boat |

### 4.2 Proposed macOS mapping [proposed]

| Action | Keyboard | Gamepad (Xbox layout; PS layout equivalents) |
|---|---|---|
| Turn / pump / stall | Arrow keys or WASD | Left stick / D-pad |
| Jump (hold + release) | Space | A / Cross |
| Carve / snap / flip | J | X / Square |
| Grab turn / rail grab / grab tricks / duck dive | K | B / Circle |
| Tail slide / floater / tube tricks / stand | L | Y / Triangle |
| Spin left / quick cut left | Q | LB / L1 |
| Spin right / quick cut right | E | RB / R1 |
| Cash in | Enter | R3 |
| Camera toggle | Shift | LT / L2 |
| Object cam / rear view | Tab | RT / R2 |
| Pause | Esc | Start |

Design note: the original's biggest control complaint was diagonal inputs misfiring on an analog stick. Give diagonals a generous dead-zone cone (≥ 30° each side) and accept D-pad diagonals literally.

---

## 5. Complete trick catalogue

Directions are 8-way. "Seq" means a stick sequence (e.g. Up, Down) followed by the button, entered within a short window. Special tricks must be unlocked in career and can only be performed while the meter is flashing yellow.

### 5.1 Face tricks

| Trick | Input | Notes |
|---|---|---|
| Carve turn | Hold Carve + L/R | Basic; builds speed and spray. Carving close to objects "sprays" them |
| Grab turn | Hold Grab + L/R | Smoother turn |
| Snap | Carve, Carve at the lip | Requires nose pointed up at the lip; if you're too low you get a Rebound instead |
| Rebound | Carve, Carve on the face | |
| Tail Chuck | Grab, Grab | |
| Revert Cutback | Slide, Slide | |
| Gouge | Carve, Slide | |
| Lay Back Slide | Slide, Carve | |
| Tail Slide | Hold Slide + L/R | |
| Power Slide | Slide + Grab + L/R | |
| Floater | Slide near the lip / release at the top | Rides along the lip and over breaking sections. Multiple angle variations. No special floaters exist |
| Super Stall | Down, Down | Drops you into the barrel |
| **Special face** | | |
| Shove It Ollie | Seq Up, Down + Carve | |
| Hang Ten | Seq Up, Up + Slide | |
| Dark Slide | Seq Up, Down + Slide | |
| Cheaters Five | Seq Up, Up + Grab | |
| Cruzer | Seq Up, Down + Grab | |
| Headstand | — | Character-specific (the motocross secret rider) |

### 5.2 Air — grabs (Grab button + direction)

| Direction | Trick |
|---|---|
| Up | Nose Grab |
| Down | Tail Grab |
| Left | Indy Grab |
| Right | Roast Beef |
| Up-Left | Nuclear Grab |
| Up-Right | Rocket Grab |
| Down-Left | Melon Grab |
| Down-Right | Mute Grab |

### 5.3 Air — flips and grab-flips (Carve/Flip button + direction)

| Direction | Trick |
|---|---|
| Up | Lien Air |
| Down | Stalefish Grab |
| Left | Judo Air |
| Right | Method Grab |
| Up-Left | Shove This |
| Up-Right | Shove It |
| Down-Left | Heel Flip |
| Down-Right | Kick Flip |

Spins are separate: hold spin left/right in the air for continuous rotation; 180 / 360 / 540 / 720 / 900 / 1260 are all achievable depending on Spin stat and board. Two tricks can be done in one air (e.g. Tail Grab then Judo Air).

### 5.4 Air — special aerials (sequence + button)

| Trick | Input |
|---|---|
| Alley Oop | Down, Down + Flip |
| Rodeo Clown | Up, Up + Flip |
| Front Flip | Down, Up + Flip |
| Back Flip | Up, Down + Flip |
| Air Walk | Left, Left + Flip |
| Helicopter | Right, Right + Flip |
| Right Flip | Left, Right + Flip |
| Left Flip | Right, Left + Flip |
| Nacnac | Left, Left + Grab |
| Tweaker Air | Right, Right + Grab |
| Cross Air | Up, Down + Grab |
| Superman | Down, Up + Grab |
| Indian | Right, Left + Grab |
| JC Air | Left, Right + Grab |
| Monkey Man | Down, Down + Grab |

### 5.5 Tube tricks (Slide/Tube button + direction, while the balance meter is showing)

| Direction | Trick |
|---|---|
| Up | One Hand Roof Drag |
| Down | Foot Drag |
| Left | One Hand Wall Drag |
| Right | Layback Drag |
| Up-Left | Christ Tube (arms out) |
| Up-Right | Two Hand Roof Drag |
| Down-Left | Two Hand Wall Drag |
| Down-Right | Grab 'N' Drag |
| Up, Up | Tube Spit (exit with the spray) |

Special tube: **Tube Spit** (Up, Up), **Coffin** (Down, Down — lying flat on the board), **Caveman** (Down, Up), **Lawn Dart** (Up, Down).

### 5.6 Exit moves (ride-ending dismounts)
Launch, press Slide twice, then: Up = Indy Bail, Down = Flapper, Left = Cannon Ball, Right = Nose Dive, Right-Right = Pressure Drop, Left-Left = Fist Pump, Down-Down = Back Flop, Up-Up = Tuck And Roll. They end the ride on your terms rather than by wipeout. [uncertain: whether they add score; treat as a small flourish bonus in the sequel.]

### 5.7 Environmental / secret tricks
Appear **orange** on the trick tracker and add points and multiplier: splashing, spraying, smashing or jumping objects and people; landing on top of the barrel; punching through the tube wall. The sequel should keep a hidden list of these as discoverable "secrets" per beach.

### 5.8 Per-surfer special sets
Each rider has their own subset of special tricks and gains more through career. Secret riders have near-max stats but no full quiver.

---

## 6. Special meter, linking and scoring — the heart of the game

### 6.1 Special meter states

| State | How you get there | What it allows |
|---|---|---|
| **Empty** | Start of every wave; after any wipeout | Regular tricks only |
| **Green (filling)** | Doing tricks. Face tricks fill it fastest; Perfect landings add; Sloppy landings subtract | Regular tricks; linking only *within* a section (face→face, tube→tube, air→air) |
| **Yellow (flashing)** | Meter full | Special tricks; **cross-section linking** (face→air→tube→face…); icon chaining bonus; photo bonus |
| **Draining** | Yellow decays continuously; repeating tricks drains it faster; Sloppy landings hit it | Each new unique trick tops it back up. Floaters and tube time are cheap ways to keep it alive |

The meter is the game's "manual/revert": there is no other way to link across sections.

### 6.2 Chain (trick tracker) rules
1. A chain has a **base score** (sum of trick values, "style") and a **multiplier** (variety, roughly the count of distinct tricks).
2. Repeated tricks in the same chain are worth progressively less and drain the meter.
3. Landing an aerial is rated **Perfect**, **Sloppy**, or unrated. Perfect = you land at the mirror angle of your launch (nose pointed down the face). Perfect feeds the meter; Sloppy costs it; a bad landing is a wipeout.
4. **Proximity**: tricks performed closer to the breaking part of the wave are worth more, and launches closer to the curl go higher.
5. **Tube**: base points accrue every second in the barrel and scale with depth; tricks inside add on top. Deeper = the balance meter turns from yellow to red and drifts harder.
6. **Rotation**: more rotation = more base points, but only full rotations count for rotation goals.
7. **Cash in** (R3) banks `base × multiplier` immediately. Otherwise the chain banks automatically when the meter drains to empty.
8. **Wipeout** while a chain is open = chain lost, meter emptied, clock penalised.
9. **Icons** (Section 9.2): chaining five icon tricks while yellow adds a 10,000 bonus.
10. Cited benchmarks from players: 4–5 linked tricks ≈ 30,000+; a well-built single chain with max stats can exceed 500,000 in about 15 seconds. Late-career "beat the local" targets reach 500,000 per run, so the scoring curve is steep.

### 6.3 Proposed numeric model [proposed]
The original's tables were never published; these numbers are chosen so that the career thresholds in Section 9 are reachable at the right points in progression.

```
chain_total = round( Σ_i ( base_i × repeat_i × prox_i × rot_i ) × multiplier )

base_i        face basic 250–450 | face special 1,500
              grab 300 | flip 400 | air special 2,000–3,000
              tube: 150/s + 40·s² (s = seconds in barrel), tube trick 500, tube special 2,000
              floater: 120/s
              env/secret 500–1,000
repeat_i      1.0, 0.5, 0.25, 0.1 … per prior occurrence of the same trick in this chain
prox_i        1.0 → 1.5 as distance to the curl goes from far → within one board length
rot_i         1 + 0.35 × (full 180s landed)
multiplier    number of distinct tricks in the chain (cap 30)
perfect       +12% meter, ×1.1 on that air's base;  sloppy −15% meter
meter fill    face trick +18%, grab/flip +12%, special +25%, tube +6%/s, floater +5%/s
meter drain   −8%/s while yellow; −20% on a repeat; wipeout → 0
```

Sanity check: five distinct tricks averaging 1,500 base at prox 1.2 ≈ 9,000 × 5 = 45,000. Matches the "30,000+" benchmark for a mid-career board.

### 6.4 Clock
- Standard runs: 3:00. Competition heats: shorter [uncertain: ~1:30–2:00 per heat, three heats].
- Wipeout subtracts time.
- A second on-screen timer counts how long the meter has been yellow (used for "keep your special maxed for N seconds" goals).
- When the clock hits 0, the ride continues until the meter drains, so you can finish and cash the chain.

---

## 7. HUD

| Position | Element |
|---|---|
| Top right | Score; clock; special meter (green bar → flashing yellow); secondary "special time" counter when a goal needs it |
| Top left | Objective display (goal-specific counters: icons collected, 360s landed, seconds ridden, object hits) |
| Left edge | **Icon stack** (icon challenges only): trick icons drop down and pile up; complete the bottom one to clear it; if the stack fills you fail. Green triangle = air, purple square = face, red circle = tube, yellow = special. Early beaches print the button combo under the icon; later beaches don't |
| Lower right | Wave meter (current height, breaking sections, next wave's height); yellow hazard sign when an object is near; "!" prompt = press object cam |
| Bottom centre | Trick tracker: running chain string, base points, multiplier. Orange entries = secret tricks |
| Near surfer | Perfect / Sloppy landing rating; balance meter while in the tube (inverted red triangle to keep centred; bar shifts yellow→red with depth) |
| Photo events | Viewfinder overlay with a four-beep countdown; trick on beep three and be landing when the shutter fires |

---

## 8. Progression systems

### 8.1 Stats
Four stats, shown as 10-segment bars. Base values roughly 30–75%, upgraded through career to ~65–100%. The rider contributes ~65% and the board ~35% of effective stats.

| Stat | Governs |
|---|---|
| Spin | Rotation speed in the air |
| Speed | Speed on the face; how easily you outrun sections and climb the wall |
| Air | Launch height / hang time |
| Balance | Tube balance drift and landing tolerance |

Rider archetypes in the original (for balancing a fresh roster): all-rounder (4/5/4/5), balance specialist (3/4/3/6), speed-and-balance veterans (3/6/3–4/5–6), aerialists (4/5/6/4), a well-rounded progressive (5/5/5/5), and secret riders at 5–8 across the board.

### 8.2 Gear
- Each rider has a **quiver of 9 boards**, starting on the weakest; boards are unlocked by specific goals and each shifts the stat mix.
- **14 bonus boards** unlock late (finishing the penultimate required goal); an **ultimate board** with perfect stats unlocks on career completion.
- **Personality suits** (alternate costumes with a themed board) unlock per rider.
- **Handicap** setting for non-career modes scales stats up or down.

### 8.3 Trick unlocks
"Learn how to pull off X" goals reveal a new special trick with part of its input hidden; perform it three times to add it to the trick book. Stat boosts (Air skill improved, Spin improved, Speed increased, Balance improved) are also goal rewards.

---

## 9. Career structure

### 9.1 Layout
- 16 beaches; with time-of-day and weather variants (Evening, Night, Dusk, Cloudy, "B.C.") there are 22 level sets. Most beaches are visited twice with different goal sets.
- Level names are wordplay on the goal type: icon challenges are always "*something* blocks" (falling / diving / frigid / sliding / descending / dropping / downward / block party), photo levels are "photo shoot", "click flash", "cover shot", contests are "get ranked", "top two", "superiority".
- Only the required goal gates progression. Optional goals give gear and tricks. Some unlocks are goal-specific, not level-specific.

### 9.2 Goal taxonomy (every goal in the game is one of these)

| Type | Rule | Range across the career |
|---|---|---|
| Score total | Reach N points in the run | 10,000 → 500,000 |
| Beat the Grom / Beat the Local | Two score bars, Local = 2× Grom | 12,500/25,000 → 250,000/500,000 |
| Section score | N points from Air / Face / Tube tricks only | 5,000 → 75,000 |
| Ride without wiping out | Ride N seconds and score M | 60 s / 25k → 170 s / 500k |
| Special time | Keep the meter yellow for N seconds | 5 s → 40 s |
| Icons | Perform N icon tricks before the stack fills | 10 → 30 |
| Photo | Three photos per ride; either sum of three or best single; some require a special trick in the frame | 2,000 (3 shots) → 12,500 (1 shot) / 10,000 special-trick shot |
| Competition | Three heats, judged across air, tube and face; wipeouts cost score and time | Place 3rd → 2nd → 1st |
| Rotation | Land N full 360s / 540s | 2×360 → 8×540 |
| Learn a trick | Do the revealed special trick 3× | — |
| Objects | Spray / splash / smash / jump 3 of a named object | windsurfers, tubers, pier, ice, spongers, rafters, kayaks, turtles, jet-skis |

### 9.3 Beach progression table (original)

| Beach – level | Wave (ft) / break | Required goal | Grom / Local |
|---|---|---|---|
| Wave House (tutorials ×3) | 8.6 R | Complete tutorials | — |
| Sebastian – photo shoot | 5.7–7.7 R | 2,000 in 3 photos + 10,000 | 12.5k / 25k (+ jump the pier) |
| Trestles – air assault | 5.8–8.3 R | 5,000 air + 10,000 | 12.5k / 25k (+ spray 3 windsurfers) |
| Trestles – falling blocks | 7.9–9.4 R | 10 icons + 20,000 | 25k / 50k |
| Sebastian – diving blocks | 5.7–7.3 R | 10 icons + 20,000 | 25k / 50k (+ splash 3 tubers) |
| Mavericks – get ranked | 15.7–20.9 R | Place 3rd+ (no tube) | — (2×360, 10k face) |
| Mavericks – nu skool | 16.7–25 R | Learn Dark Slide + 20,000 | 25k / 50k |
| Antarctica – frigid blocks | 18–20 R | 15 icons + 25,000 | — (60 s no-wipe + 25k, smash 3 ice) |
| Antarctica – pretty pictures | 18–21 R | 6,000 photo + 30,000 | — (4×360) |
| Jaws – shacked | 17–24 R | 10,000 tube + 30,000 | 40k / 80k |
| Pipeline – top two | 16–20 L | Place 2nd+ | — (25k tube, 25k air) |
| Pipeline – sliding blocks | 13–17 L | 17 icons + 70,000 | 75k / 150k (+ smash 3 spongers) |
| Jaws – click flash | 19–22 R | 7,500 special-trick photo + 80,000 | 100k / 200k |
| Teahupoo – rotations | 11–12.5 L | 4×540 + 70,000 | 75k / 150k (+ splash 3 rafters) |
| Teahupoo (evening) – edukashun | 11–12.5 L | Learn Alley Oop + 40,000 | 50k / 100k |
| Bells – descending blocks | 8–10 R | 18 icons + 40,000 | 50k / 100k (+ jump 3 kayaks) |
| Bells (night) – face lift | 7–10 R | 20,000 face + 80,000 | 100k / 200k |
| Curren's Point – dropping blocks | 13–16 R | 20 icons + 100,000 | — (90 s no-wipe + 50k, jump 3 turtles) |
| Kirra (dusk) – photo op | 6–9 R | 15,000 in 3 photos + 100,000 | 150k / 300k |
| Kirra – downward blocks | 5–7 R | 22 icons + 100,000 | 150k / 300k |
| Curren's Point – back of my forehead | 13–15 R | 8×540 + 110,000 | — |
| G-Land – superiority | 12–14 L | Place 1st | — (25k tube, 25k face) |
| G-Land (cloudy) – in the pit | 13–14 L | 25,000 tube + 100,000 | 150k / 300k |
| J-Bay – no posers | 6–9 R | 12,500 photo + 150,000 | 200k / 400k (+ 75k air) |
| J-Bay – maximum revolution | 6–8 R | 30,000 air + 120,000 | 200k / 400k (+ smash 3 spongers) |
| Mundaka – cover shot | 10–14 L | 10,000 special-trick photo + 150,000 | 200k / 400k |
| Mundaka (cloudy) – block party | 9–14 L | 25 icons + 200,000 | 250k / 500k (+ spray 3 windsurfers) |
| Cortes Bank – face off | 60 R | 40,000 face + 200,000 | — (90 s no-wipe + 100k, splash 3 jet-skis) |
| Teahupoo (B.C.) – tiki god | 11–12.5 L | 30 icons + 250,000 | — (unlocks secret riders + 14 boards) |
| Cosmos – shambala | 20 R | Ride 170 s without wiping out + 500,000 | — (unlocks ultimate board) |

Takeaways for the sequel's difficulty curve: score targets roughly double every 3–4 levels; wave size is *not* monotonic (small aerial waves alternate with big ones); each beach type teaches one thing (Trestles = air, Jaws/Pipeline = tube, Mavericks = face and closeouts, Kirra/J-Bay = long rides, Cortes = scale).

### 9.4 Unlock tree shape
Sebastian and Trestles open first. Their required goals branch to Mavericks, then Antarctica, which fans out to Jaws and Pipeline, then Teahupoo, Bells, Curren's Point, Kirra, G-Land, J-Bay, Mundaka, Cortes Bank, a fantasy Teahupoo variant, and a final fantasy "perfect wave" beach. Second levels at a beach are usually unlocked by a *different* beach's required goal, which is what sends you back and forth across the map.

---

## 10. Modes

| Mode | Rules |
|---|---|
| Career | Section 9 |
| Free Surf | Any unlocked beach, no clock, no goals; high-score practice |
| Icon Challenge | The career's icon goals as a standalone mode |
| Handicap | Adjusted stats for novice/expert play in non-career modes |
| Head-to-Head | Split screen, most points wins |
| **Push** | Split screen where the divider moves toward whoever is scoring less; own the whole screen (or most of it at time-out) to win. The most original multiplayer idea in the game — keep it |
| Time Attack | Turn-based; your score reduces the next player's run time |
| Record book | Per-rider stats and world records |

---

## 11. Sequel design brief

### 11.1 The "it's a sequel" checklist
A player who loved the original should recognise all of these within ten minutes:
1. Four wave zones (prone / face / tube / air) with context-sensitive buttons.
2. Pump-and-carve speed, launch by loading the jump and releasing at the lip, land nose-down for **Perfect**.
3. Stall into the barrel, balance meter, rail grab to steady, tube tricks by holding a button plus a direction, spit out.
4. Special meter: green = same-section linking; yellow = specials and cross-section linking; **cash in** button; wipeout loses everything.
5. Trick tracker with base × variety multiplier and orange secret tricks.
6. Career goal taxonomy from 9.2, including icon stacks, photo countdowns, three-heat contests, and object goals with the object cam.
7. Stats (Spin/Speed/Air/Balance), a quiver of boards, trick-book unlocks, costumes.
8. Boat hub, world map, TV-style replays, mellow soundtrack, an ending "perfect wave".
9. Push mode.

### 11.2 Improvements the original was criticised for (fix these)
- **Camera**: pull back and up; frame the curl and the section ahead, not just the rider. Offer a "wide" preset. Keep tube cam and object cam as toggles, add a wave-relative auto-cam that looks down the line when you're going fast.
- **Level identity**: show the beach. Landmarks on the horizon, spectators, boats, cliffs, the pier, aurora at night. The original's locales were criticised for rarely being visible.
- **Water look**: vary foam, texture and light along the wave; spray particles; sun glint. Uniform water was the main graphics complaint.
- **Inputs**: forgiving diagonals; input buffering for sequences; a visible input hint on failed specials.
- **Onboarding**: keep the three-stage tutorial (basics / intermediate / advanced). The FAQs are explicit that the tutorial explains the game better than the manual did.
- **Requested features** the original lacked: longboard style (different physics, cross-stepping, noserides), create-a-surfer, wave selection variety (multiple peaks), replay saving/sharing, online leaderboards.

### 11.3 Content plan for the sequel [proposed]
- **Roster**: 8 original riders with archetypes from 8.1, plus 2–3 secret novelty riders (the original used non-surf athletes and a tiki mascot).
- **Beaches**: 12–16 real break locations (place names are fine to use; do not name breaks after real people), each with a fixed break direction, hollowness, section profile, hazard set, and three wave heights per level. Add one indoor wave-pool tutorial and one fantasy finale.
- **Goals**: reuse the taxonomy in 9.2 exactly; it's what makes career feel like the original. Add one new type: "Section survival" (float or outrun N closeouts).
- **New mechanics** (keep small, additive): late-drop bonus, tube depth zones (shallow/deep/"pit"), aerial reverts landing backwards (the original let you land backwards as Perfect), longboard mode.

### 11.4 IP and naming
Build it as an original property: original title, riders, board brands, sponsors, magazines, music, and no real-person likenesses or names. Real geographic place names are generally fine to reference; branded event names, real athletes and the original's logos are not. I'm not a lawyer — if this ever goes beyond personal use, get proper advice before release.

---

## 12. Technical plan (macOS)

### 12.1 Engine
**Recommended: Godot 4.x, GDScript** (C# optional). Reasons: native Apple Silicon export, built-in 3D, animation, gamepad and split-screen support, free, fast iteration with Claude Code because the whole project is text files. Alternative: TypeScript + Three.js in the browser — quickest first playable and zero install, but split-screen, controller and replay work get harder later. Decide on engine before M1; everything below is engine-agnostic.

### 12.2 Architecture

```
src/
  wave/        WaveModel (parametric surface), SectionScheduler, CurlTracker
  rider/       RiderController (state machine), RiderPhysics, Animator
  tricks/      TrickCatalogue (data), InputSequencer, TrickExecutor
  scoring/     SpecialMeter, ChainTracker, ScoreBank, LandingJudge
  goals/       GoalDefinitions (data), GoalEvaluators, IconStack, PhotoDirector, Contest
  world/       Beach (data), ObjectSpawner (hazards), Weather
  camera/      ChaseCam, TubeCam, ObjectCam, ReplayRecorder
  ui/          HUD, TrickTracker, WaveMeter, PauseMenu, Boat, WorldMap, TrickBook, Scrapbook
  save/        CareerSave, Records
data/
  tricks.json  beaches/*.json  riders.json  boards.json  goals/*.json
```

**Wave as a parametric surface.** Define the wave in *wave space* `(u, v)`: `u` = distance along the crest (grows with time as the wave peels), `v` = 0 at the trough to 1 at the lip. Height, steepness, hollowness and curl overhang are functions `H(u)`, `S(u)`, `C(u)` driven by the beach profile plus a section schedule. The curl position `u_curl(t)` advances at the beach's break speed; sections are events that push `u_curl` forward temporarily (close-out) or add a second curl ahead. Generate the mesh each frame (or displace a strip in a vertex shader) from these functions. The tube is the region where `C(u) > threshold` and `v` is within the barrel band.

**Rider in wave space.** Simulate the rider in `(u, v)` with a scalar speed and a heading angle; convert to world space for rendering. Face physics: gravity along `v`, pump adds speed when descending, climbing costs speed, stalling bleeds speed toward the curl. Launch converts speed and lip angle into an air arc in world space; landing re-projects into wave space and judges the angle for Perfect/Sloppy/wipeout. Tube: lock `u` to `u_curl + offset`, `v` to the barrel band, and run the balance meter.

**State machine.** `Prone → Face ⇄ Tube`, `Face → Air → Face`, `Face → Floater → Face`, any → `Wipeout → Prone`, `Air → Exit → RideEnd`. Each state owns its input map (Section 4).

**Tricks are data.** Each entry: id, display name, section (face/air/tube/exit), input (button + direction, or sequence + button), base points, meter delta, special flag, rider whitelist, animation id, unlock source. The InputSequencer keeps a 600 ms ring buffer of direction presses [proposed] and matches sequences on button press; direction-plus-button tricks read the current stick with the diagonal cone from 4.2.

**Scoring** implements Section 6 verbatim. Keep every constant in one tuning file.

**Goals are data.** Each level JSON lists goals by type from 9.2 with parameters; evaluators subscribe to game events (trick landed, chain banked, tube entered, object hit, photo taken, wipeout). Contest goals wrap three heats and a judging function that weights air/tube/face.

**Camera.** Chase cam with look-ahead along `+u`, smoothed; tube cam when in the tube; object cam when a hazard is flagged; a replay recorder that logs rider transform, wave params and events at 30 Hz so replays can be re-rendered with different cameras.

**Presentation order.** Placeholder everything first: capsule rider, flat-shaded wave, text HUD. Do not spend time on art until the ride loop feels right (M2).

---

## 13. Milestones for Claude Code sessions

Each milestone is one or more sessions. Acceptance criteria are what to test before moving on.

| M | Deliverable | Acceptance |
|---|---|---|
| **M0** | Repo, engine project, `CLAUDE.md`, `docs/DESIGN.md` (this file), data schemas for tricks/beaches/goals, tuning file | Project opens and runs an empty scene on macOS; JSON schemas validate sample data |
| **M1** | Wave: parametric surface, curl tracker, sections, three wave heights, wave meter | A wave peels indefinitely at a chosen break direction and size; sections close out on a schedule; toggling hollowness produces a visible tube |
| **M2** | Rider: prone/stand/drop, face physics (pump/carve/stall), launch/land with Perfect/Sloppy/wipeout, chase cam | Can ride for 3 minutes without art; speed feels earned; landing judgement matches Section 6.2 rule 3 |
| **M3** | Tube and floater: stall into barrel, balance meter, rail grab, quick cuts, exit/spit; floater along the lip over a section | Can enter a tube deliberately, hold it 6+ seconds with active balancing, exit clean; floater carries you over a closeout |
| **M4** | Trick system: full catalogue from Section 5 as data, input sequencer, animations as placeholders, trick tracker HUD | Every trick in Section 5 is executable with its listed input; specials gated by meter |
| **M5** | Scoring: special meter states, chain, cash-in, repeat decay, proximity, rotation, tube time, clock and overrun rule | A 5-trick cross-section chain banks ≈ 30–50k with mid stats; meter behaviour matches 6.1 |
| **M6** | Goals and career: all goal types, icon stack, photo director, three-heat contests, object hazards + object cam, level/beach data, boat hub, world map, trick book, saves | Play Sebastian → Trestles → Mavericks with the original's goal mix and thresholds from 9.3 |
| **M7** | Riders, boards, stats and unlock flow; personality suits; secret riders | Stat changes measurably alter spin rate, air height, balance drift and top speed |
| **M8** | Modes: free surf, icon challenge, handicap, split-screen head-to-head, Push, time attack; record book | Push divider moves with score differential; two controllers work |
| **M9** | Presentation: real rider model and animation set, water shading, spray, beach landmarks, replays, music, TV-style transitions, scrapbook | Reviewer complaints in 11.2 are addressed |
| **M10** | Tuning pass with the checklist below; tutorial beach; polish; macOS build and notarisation | Full career playable start to finish |

---

## 14. Feel checklist (tuning targets)

- Neutral trimming mid-face holds speed; the curl only catches you if you stall or bog. [proposed: curl speed ≈ 0.9 × trim speed]
- Pumping from lip to trough should add enough speed for a launch within two pumps on a 7 ft wave.
- Launch height scales visibly with speed, wave height and Air stat; a 540 is reachable with mid Spin on an 8 ft wave, 900+ needs high Spin and a big wave.
- Perfect landing window: ±20° of the mirror angle [proposed]; Sloppy: ±20–45°; beyond that, wipeout.
- Tube: balance drift accelerates with depth; rail grab halves drift; 6 seconds is comfortable, 15 seconds is expert.
- Yellow meter with no input should drain in ~12 seconds [proposed]; a floater or tube time should stretch it noticeably.
- Cash-in should feel like a decision: a 5-chain at ×5 is safe money; a 12-chain at ×12 is the run.
- Wipeout costs ~5–8 seconds of clock including re-catching the wave [proposed].
- Every beach should be identifiable from a still frame.

---

## 15. Unknowns to resolve during tuning

- Exact base point values and meter fill/drain rates (never published).
- Competition heat length and judging weights.
- Whether exit moves score.
- How much the clock is penalised per wipeout.
- Exact proximity bonus curve.
- Whether Perfect landings require the board to be nose-down or merely the mirror angle (FAQs say both; treat them as the same condition).

---

## 16. Sources consulted

- GameFAQs guide by Suspectii (GameCube, v1.3, 2004): controls per context, meters and scoring, goal types, full beach/goal/unlock listing, rider stats.
- GameFAQs guide by Swiftshark (PS2, final, 2005): full control map, complete trick inputs by category, special meter description, tube meter, icon rules, wave sizes per level, walkthrough of every goal.
- GameFAQs guide by ProtoDude (GameCube, 2002): GameCube trick book with inputs, early walkthrough.
- GameSpot review (Ryan Davis, 2002): same-section vs cross-section linking rule, career and mode descriptions, multiplayer modes, criticisms.
- GameZone, Gaming Nexus, Nintendo World Report, Everygamegoing reviews: tube entry behaviour, meter-as-multiplier framing, per-beach wave character.
- Wikipedia: release data, platforms, reception summary.

---

## Appendix A — `CLAUDE.md` snippet for the repo

```markdown
# LINE-UP (working title) — surf trick game, macOS

Read `docs/DESIGN.md` before any gameplay work. It is the spec.
- Sections 3–6 of the design doc define wave, rider states, tricks and scoring. Implement them as written; put every tunable constant in `data/tuning.json`.
- Tricks, beaches, goals, riders and boards are data files under `data/`. Never hard-code a trick or a goal.
- Rider physics runs in wave space (u along the crest, v up the face) and is converted to world space for rendering.
- Milestones and acceptance criteria are in design doc §13. Work one milestone at a time; propose the plan for a milestone before writing code.
- Original IP only: no real surfers, brands, logos or the original game's name anywhere in code, assets or UI.
- Engine: Godot 4.x, GDScript. Target: Apple Silicon macOS build.
```

## Appendix B — Note on the earlier 2D prototype

The single-file HTML prototype built earlier in this project deviates from the original in one important way: it used a "link carve" (hold Shift) to keep a combo alive, which is a Tony Hawk manual analogue. The original has no such move — the **special meter** is the only link mechanic, and same-section linking works even when the meter is green. Its curl-chase, balance-meter and section logic are still a reasonable 2D reference for M1–M3.
