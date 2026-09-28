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
python3 serve.py 5189
```

`serve.py` is `http.server` with caching turned off. Left on, a browser holds
on to modules like `lace.js`, and a reload can leave a fresh page running stale
code — which looks exactly like a change that did not work.

Then open <http://127.0.0.1:5188/>. The demo page mounts the engine full-bleed
with a control panel; `Auto` drives it along a self-crossing demo path so it
shows what it does with no input.

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

## circle-type.html

A customiser for type set on a circle and rendered as dust — an address ring
set in fine dotted caps, or a headline in dots over a photograph.

Glyph outlines are read back out of the canvas rather than parsed: each ring is
drawn once into a scratch canvas and then sampled on a jittered grid, so any
font on the machine works with no font library and nothing fetched.

- **Rings** — as many as you like, each with its own text, radius, size and
  angle. `Angle` is where the middle of the run sits, clockwise from twelve
  o'clock. `↻` flips a ring to face inward and run the other way — the
  treatment for the lower arc, so it reads the right way up — and moves it to
  the opposite side, which is almost always what you wanted.
- **Decoration** — a dotted target, spiral or wave, sampled from the maths so
  spacing stays even at any size.
- **Ink** — spacing, dot size, scatter and spray control how the strokes break
  up; bleed and grain are the same ink treatment the cursor engine uses.
  `Solid type` renders the rings as clean type instead, for the fine-print look.
- **Ground** — a colour, or drop an image anywhere on the window to set it as
  the background, with a dim slider to hold the type off a busy photo.
  (`pixel-lace` uses fixed swatches for ground and thread instead: the working
  palette off the studio sheet — cream, yellow, olive, dark olive, charcoal,
  near-black, white — with a grey ramp under it.)
- **Assemble** replays the dots flying in and settling. `Save PNG` exports at
  the canvas's full pixel size.

## pixel-lace.html

A damask panel resolved onto a stitch grid — the pixelated lace ground.

Sized from the presets (4:5, 9:16 story, square, link preview, 16:9, 18 × 24
print) or from the width and height fields, which show the ratio as you type and
flip the preset to `custom`. The size travels in the shareable link with
everything else.

The motif is drawn as ordinary vector work into an offscreen canvas at ten times
the grid's resolution, and each cell then takes the average coverage of the
block beneath it. Quantising that average into a few levels is what gives the
woven look: the grid decides what survives, the way a weave does.

- **Motif** — a sprig of stems, leaves, buds and scrolls is generated from a
  seed and repeated under a symmetry group, which is what makes it read as
  damask rather than as a doodle. `Spread` pushes the stems off centre so the
  field opens into lace instead of clogging.
- **Seed** — typed in, stepped one at a time with `◀ ▶`, or thrown by
  `Shuffle`. Every control lives in the URL, so `Copy link` hands over an exact
  pattern and reopening a link restores it.
- **Symmetry** — none (a single free-standing spray, centred on its own ink,
  since nothing else balances it — and an image under none is placed whole and
  centred rather than cropped to fill),
  mirrored on both axes (the damask panel), mirrored on one axis
  (the halves then differ top to bottom), turned four-fold (a pinwheel),
  kaleidoscope of eight (a doily), or a half-drop repeat (wallpaper rather than
  a panel). The two radial modes work off the shorter side, so they suit a
  square panel best.
- **Grid** — columns (up to 400 — past about 200 the damask stops reading as
  pixels and starts reading as embroidery), gap, stitch shape (square, round,
  cross), how many tonal levels, and dither, which breaks flat areas into
  stitches instead of slabs.
- **Ink** — threshold and contrast decide how much of the motif makes the cut.
  `Offset` nudges each stitch off its cell by an amount fixed for that cell and
  that frame, so it re-rolls as it plays — printing that misses its register by
  a hair is alive in a way a perfect grid is not, and it gives the stitches
  something to do while the pattern itself holds still.
  `Relief` puts a lit copy behind each stitch and a shaded one under it, and
  `Swell` scales a stitch with how solid that part of the pattern is, so
  density reads as weight rather than only as tone — one flat colour at one
  size is what makes a panel read as a swatch. `Softness` feathers the stitches: they are drawn to their own layer and
  composited through a blur, so the edges come off hard-cut while the ground
  underneath stays clean. It is a raster effect — the SVG export stays crisp.
- **Border** — bands and corner scrolls. The motif is composed into the field
  the border encloses and clipped to it, so the frame reads as a frame; widen
  the border and the pattern tightens with it. A dropped image is placed in that
  same field.
- **Motion** — the grid is what moves, never the motif: re-running the vector
  work per frame costs 35ms at 120 columns and far more above that, while the
  stitches redraw in about one. What changes is which cells clear the
  threshold — with one exception. `gather` moves the stitches themselves. They
  wait in an even grid across the panel and are then arranged into the pattern
  over a counted number of frames — `Steps`, fifteen by default — and back out
  to the grid again. Every stitch moves together, one step per frame, so each
  frame is the whole set a step closer rather than a scatter of arrival times,
  and `Frames per second` only decides how long each step is held. The steps
  close up towards each end rather than arriving at full stride, and over the
  last of the run they ease off the lattice as well — held to whole cells right
  to the end, the final move is a jump onto the mark rather than a landing. The
  same easing runs in reverse going out, so it leaves gently too. Every frame is a legal
  arrangement on the same lattice the stitches end on, so blocks step from cell
  to cell rather than sliding between them — off-lattice positions are what
  made it read as things flying about instead of as a pattern rearranging
  itself. `Transition`
  picks between six ways of getting there, all ending on the same arrangement:
  `contract` from an even grid with each stitch taking a slot near where it is
  needed; `corner` the same but turning a corner, across and then down; `fall`
  down the column into place; `edges` in from the sides; `settle`, where each
  takes the closest slot still going, so the grid barely breaks up at all; and
  `swap`, paired at random, which is what the others are avoiding. Average trip
  runs from about 105px for `settle` to 770px for `edges` on a 1400 × 1000
  panel. In `contract` each stitch is paired to its slot along a
  Hilbert curve, which runs through two dimensions without favouring a
  direction, so neighbouring slots feed neighbouring targets and the set
  contracts evenly — ordering both by angle instead put a systematic twist
  between them and the whole thing wound in like a spiral. Every
  one is drawn at full strength wherever it is: they are the same stitches
  throughout, waiting to be arranged, not arriving out of nothing. At rest it
  is pixel-for-pixel the still composition. The rest move
  which cells are lit: `weight` orders that by how solid each part of the
  pattern already is, so the faint extremities go first and the dense core last; `breathe`
  opens and closes as a whole. The dither seed is held still throughout, since a moving
  seed sparkles where a fixed one lets blocks step from cell to cell. `morph` walks a series
  of uploaded images — `Add images…` takes as many as you like, in the order
  picked — dissolving each into the next and looping. Each of those is placed
  on its own, centred and whole, with no mirroring or repetition: it is a
  series of pictures, not a pattern. Uploads arrive at every size and crop, so
  each is measured on the way in — the ground is read from its corners, the
  subject is whatever differs from it, and the zoom and anchor that put that
  subject in the frame follow from its bounds, which is what stops a series
  jumping in scale from image to image. Every image then keeps its own zoom
  slider, and `Fit each` measures them all again.

  The change between two images is scheduled rather than faded. Both shapes are
  measured — `shapeField` walks the ink from its densest point outward, then
  walks outward from the ink for everything else — and each cell is given a
  turn from the pair: the outgoing picture lets go at its extremities first,
  the incoming one arrives at its heart first. Averaging two fields piles the
  values up around the middle, so the turns are ranked rather than used raw,
  which is what spreads the change evenly across the crossing instead of
  passing in a frame or two. `Flare` brightens cells as the front reaches them,
  so stitches gather along the edge of the change rather than the whole field
  dimming and lifting. With no images loaded it dissolves one
  seed into the next instead.

  `gather` takes a series too, and is the more physical way to do it: rather
  than dissolving one picture's coverage into the next, the stitches of one
  walk into the other's arrangement, under whichever `Transition` is chosen.
  Two pictures rarely have the same number of stitches, so whichever is short
  is padded with points just outside the frame — surplus stitches walk out of
  shot and new ones walk in, which keeps both ends exactly their own
  arrangement. `Amount` is the hold in seconds there, and the
  depth of the wave elsewhere. Each frame
  is held rather than tweened — it is stop motion, and `Frames per second` sets
  how choppy. `Record 5s` captures the canvas to mp4 where the browser supports
  it, webm otherwise.
- **Save PNG / Save SVG** — the SVG is the same stitches as vector, flattened:
  every stitch in one compound path on a transparent ground, so the file
  arrives as a single object to place, recolour or cut. Tone cannot survive
  that — one path carries one fill — so the levels collapse to solid. Set
  `Levels` to 1 and the canvas shows exactly what the file will be.
- **Riso** — a duplicator lays ink unevenly, on absorbent stock: `Grain` is the
  fine speckle over everything, ink and ground alike, laid on as departures
  from mid grey so some specks lift and some sink; `Mottle` is the broad
  patchiness of a drum that carried more ink in one place than another, drawn
  small and scaled up so the interpolation does the softening; `Speckle` is the
  ink that did not quite make it onto the mark — keyed to the print rather than
  to the frame, so specks travel with their stitch instead of re-rolling every
  frame and setting the whole ground crawling. `Offset` is the only part that
  moves on its own. With `Offset` for the
  misregistration, those four are most of what reads as riso over a clean
  print.
- **Transparent ground** — drops the panel colour so the PNG exports as the
  lace alone, to lay over a photograph or a product shot. The lower tonal
  levels stay semi-transparent, which is what you want over a busy ground.
- **Image** — upload or drop one and it comes back as lace: `image — laced`
  puts it through the same symmetry group as the motif, so a photograph is
  mirrored into a damask; `image — flat` just stitches it as it is. `Read as`
  decides what becomes thread — `edges` traces where the picture changes, which
  is what actually reads as lace, while `tone` follows its light and dark and
  stitches bright masses solid. `Image zoom` frames the crop, `Invert` swaps
  which side of it survives. The picture is placed inside the field the border
  encloses, rather than running under the frame and off the panel; with the
  border off it fills the panel.

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
