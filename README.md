# Frontyard Football

A top-down American football sandbox: throw routes, a 1v1 run to the end zone, and a catch-rep trainer. The simulation is plain TypeScript with no rendering or DOM in it, so the same code can later run on a game server. This site is the client.

Play it at [ambrandt94.github.io/frontyard-football](https://ambrandt94.github.io/frontyard-football/).

## Run locally

Node 22 (Node 20+ is fine).

```bash
npm i
npm run dev
```

Then open the URL Vite prints (the app is served under `/frontyard-football/`).

Other scripts:

- `npm run build` — typecheck and production build into `dist/`
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — Vitest (movement acceleration and the sprint pump)
- `npm run preview` — serve the production build

## Modes

Cycle with **N** or **D-pad up**, or the Mode dropdown.

- **Throw** — you are the QB or the receiver. Snap, aim, throw, or call for the ball and run a route (`go`, `slant`, `out`, `hitch`, `curl`, `post`, `corner`, `comeback`, `dig`). A completed catch does not end the play: the receiver becomes the ball carrier and runs at the end zone. An AI pursuer closes after the catch (panel toggle, on by default). If you were the QB, control switches to the receiver (toggle **Auto-switch to receiver after catch**, on by default). **Throw: add defender** puts the Coverage defender on the field so this mode and Coverage share one play.
- **1v1 Run** — ball carrier versus one defender, with a trailing back. Truck, spin, juke, sidestep, hurdle, dive, stiff-arm, pitch, and tackle.
- **Catch** — you are always the receiver. Snap (or call for it) and the QB throws the next ball, led to where you will be when it arrives (the same lead the Throw-mode quarterback uses). Three throws per depth band, then it switches. The quarterback sets up behind the way you are heading. A stationary rep still makes you move, but the spot is ahead or to the side, not behind you. A catch turns into the same carrier controls, toward a target line 20 yards past the catch or the end zone, whichever is closer. A pursuer is on by default. The next throw waits until that run ends.
- **Coverage** — 1-on-1 coverage, built on the Throw play. You start as the defender. Back or Tab switches you to the receiver; the other one is AI. The bot quarterback waits for the route: a slant or hitch at least 0.9–1.2s, an out, curl, or dig 1.4–1.8s, and a post, corner, comeback, or go 2.0–2.6s, times the min-hold slider. After that he throws at the route's break or once separation clears the threshold. If the receiver stays covered he holds to the max, then throws it away. The same clock is used in Throw mode when you are the defender. Outcomes are INCOMPLETE, PBU (bat), INT, CATCH, then yards after the catch until a tackle or a score, plus FLAG if the arm-check is held too long. An interception makes the defender the ball carrier on a return toward the home end zone. The HUD keeps targets, catches allowed, PBUs, INTs, and average separation at the throw.
- **Throw Around** — a loose game of catch for two to six players. Whoever has the ball can throw it to anyone else. A catch does not end the play. Bots spread into a ring about 8–20 yards from the ball and at least 6 yards from each other, jog to a new spot every few seconds, face the thrower, and call for it. Only the intended receiver chases a pass. Offline, you and one AI start on the field. Online, the host sets how many bodies spawn and friends fill the slots.

## Controls

The controls card is a small overlay. The first visit shows it; after that it starts hidden, and a **? Controls (H)** pill in the corner opens it again. **H** hides or shows it. On a controller, hold **Start** or press **Back+Start**. **G** hides the settings panel. The card lists the roles for the mode you are in, with **Show all** for the rest. A controller with the standard mapping is preferred; keyboard and mouse cover the same actions.

### Gamepad

| Input | Action |
| --- | --- |
| Left stick | Move. Partial tilt jogs, full tilt runs. |
| L3 (click) | Sprint pump. Each click adds speed, it holds, then fades. Cuts and easing off fade it faster. |
| LT | Square up / slow down (two-hand catch, or a defender breaking down). |
| Right stick | QB aim spot. The reticle eases after the stick and holds the spot when the stick springs back, so releasing the throw keeps that target. On a run, a flick is a move (sidestep, truck, spin, juke) relative to your heading. A defender lunges in that world direction: forward and at speed goes farthest, sideways is shorter, and backward is a short weak step. |
| RT | QB: throw (soft = loft, hard = bullet). Receiver: one-hand catch. |
| A | Pre-snap: snap the ball. Live: jump. A defender uses the same jump as a receiver. The ball carrier hurdles. |
| Y | Receiver: timed catch. Before the throw: call for the ball. Defender in Coverage: interception if the ball is in the air, otherwise a punch. |
| RB / X / B | Receiver plant (tap) or stretch (hold), dive, bat. |
| LB / RB double-tap | Pitch left / right. Flick the right stick to aim it. |
| LB (hold, Coverage) | Arm-check. Slows a nearby receiver and helps you stay with them. Hold it too long and the play shows FLAG — HOLDING. |
| Back | Switch the player you control. In Coverage that is defender ⇄ receiver. |
| Start | Reset the play. As the receiver, Start makes the QB throw now. In Catch mode it pauses throws. |
| D-pad left / right | Cycle the receiver's route. |
| D-pad up | Next mode. |

### Keyboard and mouse

| Input | Action |
| --- | --- |
| WASD | Move. Hold C for a jog. |
| Shift (tap) | Sprint pump (same as L3). |
| Q | Square up (LT). |
| Mouse | QB aim spot. Wheel zooms. |
| Hold left mouse or F | Throw power. Release to throw. |
| E / F | Receiver: catch / one-hand. E before the throw calls for the ball. |
| V / Space | Plant (hold V to stretch). Space is jump, or snap before the play. |
| Z / V | Pitch left / right (double-tap). Arrow keys are the right stick for a defender too. |
| X / B | Dive / bat. |
| Tab | Switch player. |
| R / Enter | Reset / Start. |
| `[` `]` or 1–9 | Route (`go`, `slant`, `out`, `hitch`, `curl`, `post`, `corner`, `comeback`, `dig`). |
| M | Toggle 3D and the 2D canvas renderer. |
| N | Next mode. |
| P | Pose preview sheet (3D). |
| H | Hide or show the control card. The choice is remembered. |
| G | Hide or show the settings panel. |

1v1 carrier moves on the keyboard follow the right-stick table: arrows relative to your run (up = truck, down = juke, left/right = sidestep, down+left or down+right = spin). The same arrow keys are the defender's right stick, but that lunge is in world space: upfield, toward either sideline, or back. It is not relative to the way the defender is facing. Forward and already running covers the most ground. A sideways lunge is shorter. A backward lunge barely moves. Holding LT makes it a shorter, more reliable wrap. X stays the low diving tackle. A whiff plants the defender, longer the farther the lunge went. Z and V tap to switch hands, hold to stiff-arm, double-tap to pitch.

Those carrier controls are shared. In Throw and Catch they turn on the moment the catch is completed, and they stay off while the ball is still in the air. The run ends on a tackle, out of bounds, a touchdown or the Catch target line, or a dive that comes up short. Yards after catch show in the HUD (live, last, and total). Coverage uses the same set after a catch, and again after an interception, with the defender returning the other way.

Coverage defender, before the catch: LT squares up, LB arm-checks, Y plays the ball (interception timing, or a punch if it is still in the quarterback's hands), B bats it down, and A jumps. The right stick does not lunge while the quarterback still has the ball or while the pass is in the air. After a catch, when a runner is there to wrap, the stick lunges (arrow keys too). X is the low diving tackle against that runner. The defender can move anywhere before the snap. Press or off coverage, and inside or outside shade, are sliders in the Coverage folder, along with the bot quarterback's min-hold multiplier, separation, max hold, and accuracy, and the AI defender's aggressiveness. Throw Around spacing min, spacing max, and reposition time are in their own folder. Lunge distance, speed, alignment, speed scaling, stick threshold, cooldown, contact window, and miss recovery are host sliders in the tackling folder, next to wrap success.

## Tuning, presets, and files

The **Sandbox settings** panel (lil-gui) is the live tuning UI. Every change is saved to `localStorage` under `tdfb.sandbox.settings.v1`.

Settings are a versioned document:

```json
{ "schemaVersion": 6, "host": { "accel": 30 }, "local": { "deadzone": 0.15 } }
```

`host` is gameplay and physics (movement, sprint, throws, catching, carrier moves, tackling, AI, time scale, and the mode toggles). `local` stays on this machine: camera, renderer, player model, stick deadzone, and the TURN login. Time scale (the Play folder, or T) runs from 0.1× to 2× by taking fewer or more of the same 1/120 steps each real second. Buttons jump to 0.25×, 0.5×, and 1×. The HUD shows the scale whenever it is not 1×. In a room the host owns it. On load, unknown keys are ignored and missing keys are filled from the defaults. Older flat saves and schema 5 `{ "values": { ... } }` documents still load. A newer `schemaVersion` still merges the keys this build knows.

The **Presets** folder adds:

- Five built-in feels in the same dropdown. Picking one applies it immediately and only changes movement, sprint, cut, and carrier-move tuning. They are not saved over and cannot be deleted.
  - **Default/Balanced** — current values, 10 sprint pumps.
  - **Arcade Snappy** — very high accel, cuts keep their speed, about 6 pumps to sprint, bigger sidesteps.
  - **Sim Heavy** — low accel, strong momentum, cuts bleed a lot, 12 pumps to a high top speed, longer move recoveries.
  - **Elusive Back** — quick sidesteps, strong spins and jukes, short cooldowns, average top speed.
  - **Power Back** — slower cuts, strong truck and stiff-arm, higher break-tackle odds, a big sprint top that takes about 14 pumps.
- **Save as…** / **Load** / **Delete** for your own presets (`tdfb.sandbox.presets.v1` in `localStorage`), listed after the built-ins
- **Export JSON file** and **Import JSON file** (same document shape; a flat object imports too)
- **Reset to defaults** (also the button at the bottom of the panel)
- **Copy settings JSON** puts the versioned document on the clipboard

## Sprint

Full speed stays **8 yd/s**. Max sprint is **12 yd/s**. Each L3 / Shift pump adds **0.4 yd/s**, so **10 pumps** fill the bar. The sliders are boost per pump **0.1–1.5** and max sprint **8–16**.

Decay is **2.75 yd/s²** (it was 1.2 when the boost pool was only 1.75 yd/s). The pool is now 4 yd/s, about 2.3× larger, so the rate is scaled by the same factor (`1.2 × 4 / 1.75 ≈ 2.75`). A full bar still fades in about **1.45s** after the 0.5s hold, and a cut or an ease-off (×3.5) still dumps it in about **0.4s**. The hold delay and the cut-angle rule are unchanged.

The sprint meter is a row of pips (one per pump, up to 16) plus the percent of the way from full speed to max sprint.

AI players, including the receiver, pump about **10 times a second** (every 0.1s of sim time) instead of ~3 times a second. That keeps the climb to the new cap at about one second, which is what the old 3–4 pump cap took, so the receiver can still arrive on the spot the catch planner picks.

## Project layout

```
index.html                 page shell
src/main.ts                fixed-timestep loop, camera, wiring
src/config/                constants, default tuning, settings schema + presets
src/sim/                   simulation only — no DOM, no Three.js
src/modes/                 mode ids and labels (Throw, 1v1 Run, Catch, Coverage, Throw Around)
src/input/                 gamepad first, keyboard and mouse fallback
src/net/                   lobby session, snapshots, and the PeerJS transport behind a small interface
src/render/three/          Three.js renderer, skinned player, procedural poses
src/render/canvas2d/       flat canvas renderer
src/render/field.ts        shared field drawing
src/ui/                    HUD, sprint meter, lil-gui panel, online lobby
public/assets/             player.glb, base color, ORM map
```

The sim steps at a fixed `1/120` second. Random rolls go through an injectable RNG (`src/sim/rng.ts`); the browser uses `Math.random`, tests use a seeded generator. Online play reuses that sim on the host.

The player is a 24-bone humanoid with a walk clip. Poses (throw, catch, sprint, truck, and the rest) are a table of bone offsets blended on top of that clip. If the model cannot load, players fall back to capsules. Team defense recolors the navy texels maroon.

## GitHub Pages

Pushes to `main` run `.github/workflows/pages.yml`, the only workflow in this repo. It runs `npm run build` (Vite `base` is `/frontyard-football/`), refuses to continue if `dist/index.html` still points at `/src/main.ts`, then uploads **`dist/`** with `actions/upload-pages-artifact` and deploys it with `actions/deploy-pages`.

**Settings → Pages → Build and deployment → Source** has to stay **GitHub Actions**. GitHub also keeps a managed `pages-build-deployment` workflow. While Source is a branch, that workflow publishes the repository root with Jekyll — the unbuilt `index.html` that loads `/src/main.ts` — and that publish can land after the Vite deploy and replace the game. With Source set to GitHub Actions, only `pages.yml` publishes.

## Online

Click **Online**. **Host game** makes a 4-character room code and a link like `https://ambrandt94.github.io/frontyard-football/?room=CODE`. Send either one. **Join** types the code. A `?room=` link joins by itself, using the name saved in the browser or “Guest”.

The host picks the mode and hits **Start**. Each person picks a slot. Empty slots are AI. Throw and Coverage have quarterback, receiver, and defender. 1v1 Run has carrier and defender. Throw Around puts everyone on the field (2–6) and whoever has the ball can throw it. Catch mode stays single-player. Snap is **A** from the host or the quarterback (or the carrier in 1v1). Names sit over the players, with a colored ring per person. `` ` `` or **Net** shows ping and snapshot rate.

This is peer-to-peer. The host's browser runs `src/sim`. Everyone else sends their stick, triggers, and buttons. The host steps at 60 Hz (two of the usual 1/120 sim steps, so the physics match solo play) and broadcasts snapshots at 20 Hz. Clients **interpolate** those snapshots. They do not predict their own player. You are looking about a tenth of a second behind the host, plus half the ping. The host is watching the live sim, so the host has less delay. That is the host advantage.

Signaling uses the public [PeerJS](https://peerjs.com/) broker (`0.peerjs.com`). There is no account and no server of ours. Google's public STUN server is included. A strict NAT can still fail to connect until someone puts a TURN server in **Online / TURN** in the settings panel (`netTurnUrl`, `netTurnUser`, `netTurnCred`). Those fields start empty.

In a room, only the host can change gameplay, physics, and the mode. Moving a slider, picking a built-in or saved preset, or changing the mode is sent to everyone as it happens. Clients see those folders locked, with a **Host controls this** note. Each player still edits their own camera, 2D/3D renderer, model or capsule, outline, player scale, stick deadzone, and the HUD and net overlay. Solo play leaves every control editable.

If a player drops, their slot goes back to AI and they can rejoin the same code. A closed tab is treated as gone after a few seconds without a reply. If the host leaves, the room ends and everyone sees that message. The host tab has to stay open and in the foreground. Browsers slow a background tab down, and that stalls the sim for everyone.

### Later: a dedicated server

`src/net` keeps PeerJS behind a transport interface (`NetTransport`). A [Colyseus](https://colyseus.io/) (or any WebSocket) server can replace that transport and run this same `src/sim`: clients still send input frames, the server steps, and it sends the same snapshots. The Pages site would stay the client. Interpolation-only is the v1 client; a predicted local player can be added on the client side of that interface without changing the sim.
