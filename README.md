# Leroy — particulate cursor

A cursor-motion engine in the family of Root Cursor, but the trail is matter
rather than growth. The pointer lays down a thin chain; dust precipitates out of
it and condenses into dense globules where the chain crosses itself or where the
pointer lingers — the look of a polymer beading up on itself.

Single file, no dependencies, canvas 2D.

## Run

```bash
python3 -m http.server 5188
```

Then open <http://127.0.0.1:5188/>. The demo page mounts the engine full-bleed
with a control panel; `Auto` drives it along a self-crossing demo path so it
shows what it does with no input.

## How it behaves

- **Chain** — the smoothed pointer path, drawn thin, fading from the tail.
- **Precipitation** — every chain point sheds dust as it is laid down, and the
  whole live chain keeps shedding, so density accrues where the pointer has
  already been. Free dust diffuses brownianly and is held in a loose sleeve
  around the chain by a spring, so it fuzzes the line instead of drifting off.
- **Nucleation** — a nucleus forms where the chain crosses an older pass of
  itself, where the pointer dwells, and at a low ambient rate along the chain.
- **Condensation** — dust within reach is pulled in and packs onto a shell,
  dense at the core with a loose corona. A globule grows as it packs, then
  saturates at `capacity` and stops capturing, so the rest keeps drifting.
- **Dissolution** — nuclei age out; their globules release back into dust that
  drifts and fades, leaving the ghost clouds behind the live chain.

Linger and it condenses. Move fast and you get a thin dusty line.

## Use it

```js
import { mountLeroyCursor, CONFIG } from "./leroy-cursor.js";

const leroy = mountLeroyCursor(canvas, { auto: true });
leroy.setAuto(false);  // follow the real pointer
leroy.clear();         // reset, reseed
leroy.stats();         // { particles, nuclei, chain }
leroy.destroy();
```

The canvas is sized from its CSS box (the engine reads `clientWidth`/`Height`
and observes resizes). `CONFIG` is read every frame, so mutating it live retunes
the engine — which is all the demo page's sliders do.

### The knobs that matter

| | |
| --- | --- |
| `emit.perPoint` / `emit.ambient` | how much dust, at the tip and along the chain |
| `particle.wander` / `curl` | brownian spread vs. coherent drift |
| `particle.spinePull` / `tubeR` | how tightly dust sleeves the chain |
| `condense.pull` / `captureR` | how hard and how far a nucleus draws dust in |
| `condense.maxCoreR` / `capacity` | how big and how dense a globule gets |
| `nucleate.crossDist` / `crossAgeGap` | what counts as the chain crossing itself |
| `nucleate.slowSpeed` / `slowFrames` | how much dwelling it takes to bead up |
| `fade` (`spine.hold/out`, `particle.hold/out`) | how long any of it survives |

## dev/frame-shot.html

Renders frame N synchronously with `requestAnimationFrame` stubbed out, for
tuning stills without waiting on real time (and for driving the engine when the
page is offscreen and rAF is throttled).

```
dev/frame-shot.html?frames=1100&mode=mouse
```

`mode=auto` (default) uses the engine's demo path; `mode=mouse` drives it with
synthetic mousemove events that pause twice, exercising the pointer path and
dwell beading. Re-pump at any time with `__pump(n)` from the console.
