# Leroy — particulate cursor

A cursor-motion engine in the family of Root Cursor, but the trail is matter
rather than growth. The pointer lays down a thin chain; dust precipitates out of
it and condenses into dense globules where the chain crosses itself or where the
pointer lingers — the look of a polymer beading up on itself.

The dots are stamped rather than plotted: each one lands with its own soak
halo, a ragged blot shape, mottled density from the ground's absorbency, and
paper grain over the top — so it reads as ink on stock rather than pixels.

No dependencies, canvas 2D.

## Run

```bash
python3 -m http.server 5188
```

Then open <http://127.0.0.1:5188/>. The demo page mounts the engine full-bleed
with a control panel; `Auto` drives it along a self-crossing demo path so it
shows what it does with no input.

`border.html` is the other end of it: an 18 × 24 poster whose Art Nouveau frame
is drawn entirely in dust. The chain traces the ornament instead of following
the cursor, nothing fades, and the cursor is left free to smudge the ink — drag
through the frame and the dust scatters, then re-condenses on its nodes.

## How it behaves

- **Chain** — the smoothed pointer path. It is the skeleton the dust clings to,
  not a mark: it is not drawn unless you set `spine.show`. The trail you see is
  entirely particles.
- **Precipitation** — every chain point sheds dust as it is laid down, and the
  whole live chain keeps shedding, so density accrues where the pointer has
  already been. Free dust diffuses brownianly and is held in a loose sleeve
  around the chain by a spring, so it fuzzes the line instead of drifting off.
- **Nucleation** — a nucleus forms where the chain crosses an older pass of
  itself, where the pointer dwells, and at a low ambient rate along the chain.
- **Condensation** — dust within reach is pulled in and packs onto a shell,
  dense at the core with a loose corona. A globule grows as it packs, then
  saturates at `capacity` and stops capturing, so the rest keeps drifting.
- **Settling** — dust is laid down, not left simmering. A particle sets once it
  has had time to find its place (`particle.freezeAfter`, or `settleFrames` for
  dust packed onto a nucleus) and then holds still — dust still within reach of
  a nucleus stays awake, or it would set before it had a chance to condense. A
  mount with `repel` wakes what the pointer passes through, so you can smudge a
  settled trace and watch it re-condense.
- **Dissolution** — nuclei age out; their globules release back into dust that
  drifts and fades, leaving the ghost clouds behind the live chain.

Linger and it condenses. Move fast and you get a thin dusty line.

## The ornament

`ornament.js` builds the frame as strokes for the engine to trace. Each ribbon
is a rounded rectangle pushed in and out along its own normal by a cosine — an
even lobe count keeps it symmetric about both axes — and two ribbons in counter
phase weave through each other. Every place they cross is a place the engine
beads up on its own, which is where this kind of ornament wants its nodes
anyway, so the frame's joints are emergent rather than drawn in.

```js
import { artNouveauFrame, strokeDriver } from "./ornament.js";
const driver = strokeDriver(artNouveauFrame(1350, 1800, { lobes: 8 }), 6);
```

`border.html` takes `?lobes=`, `?speed=`, `?ink=`, and `?scale=` (the pixel
ratio — the default of 2 gives a 2700 × 3600 canvas, about 150 dpi at 18 × 24;
`?scale=1` is a lighter preview). `Save PNG` bakes the ground in and exports at
that resolution.

## Use it

```js
import { mountLeroyCursor, CONFIG } from "./leroy-cursor.js";

const leroy = mountLeroyCursor(canvas, {
  auto: true,          // self-drawing demo path
  driver,              // or: trace a path — driver(frame) -> {x, y, penUp}
  smoothing: 1,        // 1 tracks the driver exactly; default eases the pointer
  pixelRatio: 2,       // override devicePixelRatio (print-scale renders)
  repel: { radius: 90, strength: 1.1 }, // the pointer shoves settled dust
});

leroy.setAuto(false);  // follow the real pointer
leroy.setDriver(fn);   // swap the traced path, or null to stop
leroy.clear();         // reset, reseed
leroy.stats();         // { particles, nuclei, chain }
leroy.destroy();
```

Set `palette.bg` to `null` to keep the canvas transparent over whatever is
behind it, and `spine.hold` / `particle.hold` to `Infinity` to make a trace
persist instead of fading — at the particle cap the oldest dust is recycled, so
a persisting trace keeps laying down new ground.

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
| `particle.freezeAfter` / `settleFrames` | how long before dust sets and stops moving |
| `spine.show` / `width` | draw the chain itself, off by default |
| `fade` (`spine.hold/out`, `particle.hold/out`) | how long any of it survives |
| `stamp.bleed` / `bleedAlpha` | the soak halo under each dot |
| `stamp.blotChance` / `blotScale` | how much of the dust lands as ragged blots |
| `stamp.mottle` | how much the ground's absorbency varies density |
| `stamp.grain` | paper grain laid over the ink |

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
