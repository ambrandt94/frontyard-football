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

- **Throw** — you are the QB or the receiver. Snap, aim, throw, or call for the ball and run a route (`go`, `slant`, `out`, `hitch`, `curl`). A completed catch does not end the play: the receiver becomes the ball carrier and runs at the end zone. An AI pursuer closes after the catch (panel toggle, on by default). If you were the QB, control switches to the receiver (toggle **Auto-switch to receiver after catch**, on by default).
- **1v1 Run** — ball carrier versus one defender, with a trailing back. Truck, spin, juke, sidestep, hurdle, dive, stiff-arm, pitch, and tackle.
- **Catch** — you are always the receiver. Snap (or call for it) and the QB throws the next ball. Three throws per depth band, then it switches. A catch turns into the same carrier controls, toward a target line 20 yards past the catch or the end zone, whichever is closer. A pursuer is on by default. The next throw waits until that run ends.

## Controls

H hides the on-screen card. A controller with the standard mapping is preferred; keyboard and mouse cover the same actions.

### Gamepad

| Input | Action |
| --- | --- |
| Left stick | Move. Partial tilt jogs, full tilt runs. |
| L3 (click) | Sprint pump. Each click adds speed, it holds, then fades. Cuts and easing off fade it faster. |
| LT | Square up / slow down (two-hand catch, or a defender breaking down). |
| Right stick | QB aim spot. On a run, a flick is a move (sidestep, truck, spin, juke) relative to your heading. |
| RT | QB: throw (soft = loft, hard = bullet). Receiver: one-hand catch. |
| A | Pre-snap: snap the ball. Live: jump, or hurdle / wrap-up tackle once you are the ball carrier. |
| Y | Receiver: timed catch. Before the throw: call for the ball. Defender: punch the ball. |
| RB / X / B | Receiver plant (tap) or stretch (hold), dive, bat. |
| LB / RB double-tap | Pitch left / right. Flick the right stick to aim it. |
| Back | Switch the player you control. |
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
| Z / V | Pitch left / right (double-tap). Arrow keys flick the virtual right stick. |
| X / B | Dive / bat. |
| Tab | Switch player. |
| R / Enter | Reset / Start. |
| `[` `]` or 1–5 | Route. |
| M | Toggle 3D and the 2D canvas renderer. |
| N | Next mode. |
| P | Pose preview sheet (3D). |
| H | Hide or show the control card. |

1v1 carrier moves on the keyboard follow the right-stick table: arrows relative to your run (up = truck, down = juke, left/right = sidestep, down+left or down+right = spin). Z and V tap to switch hands, hold to stiff-arm, double-tap to pitch.

Those carrier controls are shared. In Throw and Catch they turn on the moment the catch is completed, and they stay off while the ball is still in the air. The run ends on a tackle, out of bounds, a touchdown or the Catch target line, or a dive that comes up short. Yards after catch show in the HUD (live, last, and total).

## Tuning, presets, and files

The **Sandbox settings** panel (lil-gui) is the live tuning UI. Every change is saved to `localStorage` under `tdfb.sandbox.settings.v1`.

Settings are a versioned document:

```json
{ "schemaVersion": 3, "values": { "accel": 30 } }
```

On load, unknown keys are ignored and missing keys are filled from the defaults, including older flat saves from the original one-file prototype. A newer `schemaVersion` still merges the keys this build knows.

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
index.html                 page shell and the control card
src/main.ts                fixed-timestep loop, camera, wiring
src/config/                constants, default tuning, settings schema + presets
src/sim/                   simulation only — no DOM, no Three.js
src/modes/                 mode ids and labels (Throw, 1v1 Run, Catch)
src/input/                 gamepad first, keyboard and mouse fallback
src/render/three/          Three.js renderer, skinned player, procedural poses
src/render/canvas2d/       flat canvas renderer
src/render/field.ts        shared field drawing
src/ui/                    HUD, sprint meter, lil-gui panel
public/assets/             player.glb, base color, ORM map
```

The sim steps at a fixed `1/120` second. Random rolls go through an injectable RNG (`src/sim/rng.ts`); the browser uses `Math.random`, tests use a seeded generator. There is no networking in this build.

The player is a 24-bone humanoid with a walk clip. Poses (throw, catch, sprint, truck, and the rest) are a table of bone offsets blended on top of that clip. If the model cannot load, players fall back to capsules. Team defense recolors the navy texels maroon.

## GitHub Pages

Pushes to `main` run `.github/workflows/pages.yml`, the only workflow in this repo. It runs `npm run build` (Vite `base` is `/frontyard-football/`), refuses to continue if `dist/index.html` still points at `/src/main.ts`, then uploads **`dist/`** with `actions/upload-pages-artifact` and deploys it with `actions/deploy-pages`.

**Settings → Pages → Build and deployment → Source** has to stay **GitHub Actions**. GitHub also keeps a managed `pages-build-deployment` workflow. While Source is a branch, that workflow publishes the repository root with Jekyll — the unbuilt `index.html` that loads `/src/main.ts` — and that publish can land after the Vite deploy and replace the game. With Source set to GitHub Actions, only `pages.yml` publishes.

## Later: multiplayer

The Pages site stays the client. An authoritative server (for example [Colyseus](https://colyseus.io/)) would run this same `src/sim` code: clients send inputs, the server steps the sim, and it sends state back. The fixed timestep and injectable RNG are there so that step can be shared without dragging Three.js or the DOM onto the server. Networking is not wired up yet.
