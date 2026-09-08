# MECHANICS — hands to feet to board

**Source of truth for the control-to-body link.** When the code and this file disagree, this file is the intent and the code is the bug. When this file and `docs/DESIGN.md` disagree, this file wins for *how the rider is controlled and how the board behaves*; the design doc still owns scoring, goals, career and content.

The premise: a skater who plays Skate has instinctual thumbs. We are translating that instinct to surfing. Most of it transfers directly. The parts that do not transfer are the parts where a wave is not a street — and those are exactly the parts that must feel unique.

---

## 1. The one idea

**Each stick is a foot. The board obeys the difference between them.**

Nothing else in the control scheme is allowed to contradict that. If a move cannot be expressed as "what my two feet are doing", it does not belong on the sticks — put it on a button.

| | Left stick | Right stick |
|---|---|---|
| **is** | back foot (over the fins) | front foot (over the wide point) |
| **Y axis** | press down / lift that foot | press down / lift that foot |
| **X axis** | push that foot toe-side / heel-side | push that foot toe-side / heel-side |

Down on a stick = **weight that foot**. Up = **unweight it**. This is the single most important convention in the game and it is never inverted, in any state, for any reason. A player who learns "down is press" in the first ten seconds can then discover everything else by doing it.

---

## 2. The five derived quantities

Every frame, the two stick vectors are reduced to five numbers. All of the surfing comes out of these. They live in `src/rider/stance.ts` and are exposed on the rider as `rider.stance` so the character model and the camera can read them.

Let `pressBack = −backY` and `pressFront = −frontY`, each −1…+1.

| Quantity | Formula | Range | What it is |
|---|---|---|---|
| **compression** | `(pressBack + pressFront) / 2` | −1 extended … +1 crouched | How low you are. Loads the board, stores energy, drops your centre of mass. |
| **trim** | `(pressFront − pressBack) / 2` | −1 tail … +1 nose | Where your weight sits along the board. Nose = drive and speed. Tail = stall, pivot, brake. |
| **rail** | `(backX + frontX) / 2`, then × break direction | −1 heel … +1 toe (toward the wall) | Both feet pushing the same way. This is the **lean**. It is the carve. |
| **twist** | `(frontX − backX) / 2` | −1 … +1 | Feet pushing *opposite* ways. This is the **pivot**: the board yaws out from under the direction of travel. Snaps, slides, shove-its, air rotation. |
| **pumpWork** | rate of change of `compression`, gated by whether you are climbing or dropping | 0 … 1 | Energy you put in this frame. See §4. |

Two feet, four axes, five meanings. The "slight variations" the board responds to are variations in `twist` and in the *timing* of `compression` — not in the magnitude of a single steering axis.

---

## 3. The skate translation table

For each Skate-instinct, what the same thumbs do here and why.

| Skate instinct | Surfing equivalent | Why it transfers |
|---|---|---|
| Lean the left stick to turn, harder lean = harder turn | Both sticks toward the wall = rail engaged = carve | Identical. A big carve on a wave face **is** a massive lean bombing a hill: the board is on edge, the body is inside the arc, speed is traded for direction. |
| Crouch (right stick down) then flick up = ollie | Compress then explode = pop off the lip | Identical mechanic, different surface. On a wave the "ground" is moving up under you, which makes the timing *easier* to feel and harder to master. |
| Crouch before a ramp to load | Compress through the bottom turn | Identical. A bottom turn is a loaded ramp entry. |
| Manual: shift weight to the tail and hold the balance point | Stall: weight the tail to let the wave catch up, and to set up the tube | The balance discipline is the same; the reward is different (the barrel, not distance). |
| Shove-it: flick the sticks opposite ways | Twist: pivot the board out from under you | Identical. In surfing this is a snap, a tail slide, or a reverse. |
| Pumping a bowl transition | Pumping the face | Identical energy loop: compress in the trough, extend up the face. |
| Grinding a rail: hold an edge along a line | Trimming in the pocket: hold a line with the rail half-engaged | Similar discipline, much finer tolerance. |

### Where surfing is *not* skating

These are the four places where a skater's instinct will be wrong, and where the game must teach a new reflex. Each one is a design opportunity, not a problem to smooth over.

1. **The ground is moving and it is trying to leave you behind.** In skate, the terrain is static and speed is yours to keep. Here the wave has a speed of its own, the curl is chasing you, and standing still means being eaten. Consequence: *there is no neutral*. Every second you are either taking energy from the wave or losing position. The stall is not free — it is a deliberate sacrifice of position.
2. **Your "ramp" is only in one place and it is moving.** The lip is the only real launch, and it is at a specific `v` at a specific moment. Timing beats input quality. A skater's habit of ollie-ing whenever they want must become an anticipation habit.
3. **Rail engagement is analogue and continuous, not on/off.** A skateboard is on its wheels or on its edge. A surfboard has a continuously variable amount of rail in the water, and the amount is the difference between a limp turn and a bottom turn that throws spray. Consequence: `rail` magnitude is worth real points, and the character must show it (see §7).
4. **Recovery is possible.** A blown skate landing is a bail. A blown surf turn is often a recoverable slide — you can drag a hand, straighten out, and keep the wave. Consequence: the failure model is soft. `twist` beyond grip becomes a slide that you can steer out of before it becomes a wipeout.

---

## 4. The energy loop (why pumping is a rhythm, not a button)

Speed is generated, not held. The loop:

```
        ── extend (unweight, both sticks up) ──►
   climbing the face                                at the top: turn
        ◄── compress (weight, both sticks down) ──
        dropping down the face
```

Formally, per frame:

- **Climbing** (`sinH > 0`, moving up the face): extending puts energy in. `pumpWork = max(0, −d(compression)/dt)`
- **Dropping** (`sinH < 0`): compressing puts energy in. `pumpWork = max(0, +d(compression)/dt)`
- Out of phase, you get nothing. Holding a stick gets you nothing. **You have to move your thumbs in time with the wave.**

This is the single biggest departure from the old scheme (hold up to pump) and the single biggest reason the game should feel like Skate. It also means the skill ceiling is in rhythm, which is what makes a surf line look good on screen.

`trim` toward the nose adds a smaller, continuous drive — the "just stand on it and go" option for a beginner, worth roughly a third of a well-timed pump.

---

## 5. State by state

### Paddling (prone)
Alternating presses = paddle strokes; the sticks work like arms. Left stick down, then right stick down, in rhythm, moves you up the line and gets you into the wave. Both sticks forward and held = duck dive. Pop up = the same explosive extension as an ollie (both sticks down then flick up), which is exactly what standing up on a surfboard is.

### On the face
- **Trim**: rail near zero, weight slightly forward. Board runs flat and fast down the line.
- **Bottom turn**: compress through the trough (both down), rail hard toward the wall. This is the most important turn in surfing and it must be the most satisfying input in the game.
- **Off the lip / snap**: arrive at the top with speed, then *stab* — back foot down hard (`trim` to the tail) with `twist` in the direction of the turn. The board pivots off the tail, spray goes over the back.
- **Cutback**: at the shoulder, rail away from the wall, held long, weight even, then reverse the rail to come back. A two-part input, and it should feel like a two-part input.
- **Floater**: unweight (both up) as you reach the section, ride the foam, weight the nose to come down.
- **Roundhouse**: a cutback that ends with a rebound off the foam — the game rewards linking those two automatically because the recognizer sees the shape. Mechanically: reverse the rail *without pausing*. A turn only ends once the rail has stayed released for `recognizer.releaseSeconds`; a reversal inside that window is one turn, and a reversal that began away from the wall is the roundhouse.

### In the air
- `twist` is rotation. `rail` is the flip axis: both sticks leaning the same way in flight roll the board about its long axis at `stance.airRollRate`, and the landing is judged on the roll residual as well as the yaw (`air.rollPerfectDeg`, `rollSloppyDeg`; the worse of the two decides). A full roll landed flat is a **Flip**, two are a Double Flip, a roll with a spin on top is a **Rodeo**. Come down half-rolled and you are upside down. `compression` is the tuck: crouching in the air spins you faster (conservation of angular momentum — pull in to spin, extend to slow), which is real and reads instantly.
- **Grabs are shapes, not directions.** Hold a hand on the rail (Grab = back hand, Carve = front hand) and *where the feet are* says which grab it is: pull the front foot up and the nose comes to the hand (nose grab); pull the back foot up (tail grab); push both feet toe-side and the back hand finds the toe rail between them (indy); both heel-side is a melon, tucked hard it is a roast beef; feet twisted opposite ways under a hand is a shove-it. The full table is in §6. The shape has to hold for `stance.grabSettleSeconds` before it is read, and each press of a hand is one grab, so two grabs in one air means two presses.
- Landing is judged on how well the board's yaw lines up with the direction of travel, as it is today. Compressing on touchdown absorbs it: a landing with the feet loaded is forgiving, a landing with the legs locked out is not.

### In the tube
- Weight the tail (`trim` back) to slow down and let the barrel throw over you; weight the nose to drive out.
- The balance marker is corrected with `rail`, in small doses. Grabbing the rail (button) halves the drift.
- Compression matters: a crouch makes you smaller and buys you room in a tight barrel. Standing tall in a small barrel clips you.

---

## 6. Buttons

Sticks are the body. Buttons are the hands and the discrete decisions.

| Button | Does |
|---|---|
| Grab (B / K) | the back hand to the rail. In the air: a grab, which one depends on the foot shape (table below). In the tube: rail grab, halves the drift. Paddling: duck dive. |
| Slide (Y / L) | stand up from prone; unweighted slide/floater initiation. |
| Carve (X / J) | the front hand. On the face it commits the rail harder than the stick alone — the "dig in" modifier. In the air it is the front-hand grab and the flips (table below). |
| Spin (LB / RB) | assists rotation for players who do not want to use `twist` for air rotation. Optional, and off in Pro. |
| Cash in (R3 / Enter) | bank the chain. |
| Camera (LT / Shift) | cycle third person → first person → wide. |

### Grabs from the feet

A foot is *up* (stick up, pulled toward the body), *pressed* (stick down), *toe* (pushed toward the wall) or *heel* (pushed toward the shore). A diagonal stick is two cues at once. The grab that needs the most cues wins, so a tucked heel-side grab is a roast beef, not a melon. The shapes live in `data/tricks.json` under `feet`; this table is the intent.

| Hand | Feet | Grab | Why |
|---|---|---|---|
| Grab | front up | Nose grab | the front foot pulls the nose up to the hand |
| Grab | back up | Tail grab | the back foot pulls the tail up |
| Grab | both toe | Indy | the back hand finds the toe rail between the feet |
| Grab | both heel | Melon | the heel rail between the feet |
| Grab | both heel, tucked | Roast beef | the same rail, reached through the legs in a deep tuck |
| Grab | front toe, back up | Mute | toe rail with the tail tweaked up |
| Grab | front up, back toe | Nuclear | the toe rail out past the nose |
| Grab | front up, back pressed | Rocket | the board stood on its tail, both hands on the nose |
| Carve | front heel | Lien | front hand on the heel rail by the front foot |
| Carve | back heel | Stalefish | the heel rail behind the back foot |
| Carve | both heel | Method | heel rail, board pulled up behind |
| Carve | front up, back heel | Judo | the front foot kicked off the board |
| Carve | front heel, back up | Heel flip | the front heel kicks the board over |
| Carve | front toe, back up | Kick flip | the front toe flicks it |
| Carve | twisted in (front heel, back toe) | Shove this | the board spun under the feet, one way |
| Carve | twisted out (front toe, back heel) | Shove it | and the other |

In the barrel the free hand is Slide (Y / L) — Grab is the rail grab there — and the same idea picks the drags:

| Hand | Feet | Trick | Why |
|---|---|---|---|
| Slide | front up | One hand roof drag | the front foot lightens as the body rises to the roof |
| Slide | back up | Foot drag | the back foot lifts and trails in the wall |
| Slide | both up | Christ tube | arms out, feet light |
| Slide | both toe | One hand wall drag | leaning into the wall |
| Slide | both toe, tucked | Two hand wall drag | leaning into the wall, low |
| Slide | both heel | Layback drag | laid back the other way |
| Slide | both heel, tucked | Grab 'n' drag | laid back and low, hand on the rail |
| Slide | twisted out | Two hand roof drag | shoulders opened to the roof |

The specials (air, face and tube) are still button sequences gated by the special meter; giving them shapes is open (§10).

---

## 7. What the body must show

The character is the readout. If the player cannot see the five quantities in the body, the controls feel mushy no matter how good the physics is. Required, in priority order:

1. **compression** → knees and hips. This is the most-used input and must be the most visible: a deep crouch is unmistakable, an extension is a whole-body pop.
2. **rail** → the whole body leans *inside* the arc, shoulders roll, the inside arm reaches toward the face and eventually drags a hand in a hard bottom turn. The board tilts on its rail. A carve that does not visibly bury the rail is a bug.
3. **trim** → weight shifts visibly along the board: shoulders forward over the nose when driving, hips back over the tail when stalling, and the board's pitch follows.
4. **twist** → the board yaws away from the direction of travel while the shoulders *lead* the turn. Counter-rotation: the upper body opens before the board comes round. This is what makes a snap look like a snap.
5. **Anticipation** → the head looks where the player is steering, slightly before the board goes there. Cheap, and it makes the character look like it has intent.

The character is stylised and cute, not a photoreal human, so proportions are exaggerated: a big head, chunky limbs, small board-side feet. That means the *secondary motion* has to be exaggerated to match — a big head has visible inertia and should lag and settle; chunky limbs swing with weight; nothing snaps instantly to a target. Everything the body does is critically damped toward the pose the stance model asks for, with lag proportional to the mass of the part. A big head that turns instantly looks wrong on a cute character in a way it would not on a realistic one.

---

## 8. Camera

Third person is the default because the player must read the rail angle and the wave ahead at the same time. The camera sits low, close, and slightly off the tail — the Skate camera — because low and close is what makes speed legible.

First person is a supported option, and it includes the front foot and the nose of the board at the bottom of the frame. That anchor is not decoration: without a visible board, first person loses all sense of rail angle and the control scheme stops being readable.

The camera reads the stance: it swings a little wider on a committed rail, drops on compression, and rises with the pop. It never fights the player for control of the view.

---

## 8b. The stance readout

A new control scheme with no feedback is guesswork, so the HUD shows the model directly: a pad per foot with the stick position on it, a bar for the rail the board is on, and a bar for the load stored for a pop. It is deliberately small and in the corner — it is there to be learned from and then ignored. It only appears for the dual scheme.

If a player cannot tell from the readout why the board did what it did, either the model or the readout is wrong. Fix one of them; do not add a tooltip.

## 9. Assists (default on for a new player, all switchable)

The scheme has to be learnable in five minutes and deep for fifty hours. Assists close that gap without changing the physics:

- **Auto-trim**: with the sticks at rest the board finds a sensible line rather than washing out.
- **Pump assist**: a small continuous drive so a player who has not learned the rhythm still moves.
- **Rotation assist**: spin buttons in addition to `twist`.
- **Landing assist**: widens the perfect window.

Pro mode turns all four off. The physics is identical in both — assists only add input, never change the model. This is deliberate: a player who learns with assists is learning the real thing, slowly.

---

## 10. Open questions

Held here so they do not get lost, to be resolved with a controller in hand:

- Should `twist` be rate-based (torque) or position-based (target yaw offset)? Currently torque, which suits snaps; position may suit tail slides better.
- Regular versus goofy stance: swaps which stick is which foot, or leaves the mapping and only changes the model? Currently the mapping is fixed (left = back foot always) because thumbs are not stance-dependent.
- How much `twist` should the board grip before it breaks into a slide, and should that threshold scale with the Balance stat?
- Does pumping need an audible rhythm cue for new players, or does that patronise them?
- The specials are still button sequences gated by the meter. Should they be shapes too — a roundhouse held to a full reversal, a tail slide carried past 90° — and if so does the meter still gate them, or is the meter's job then only the cross-section chain?
- The grab table (§6) was designed at a desk. Which of the sixteen shapes come out by accident, and which never come out at all?
