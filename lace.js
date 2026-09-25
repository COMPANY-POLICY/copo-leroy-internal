// Pixel lace: a symmetric damask panel, resolved onto a stitch grid.
//
// The motif is drawn as ordinary vector work into an offscreen canvas at a much
// higher resolution than the grid, then each cell takes the average coverage of
// the block beneath it. Quantising that average is what gives the woven look —
// the grid does the drawing's work of deciding what survives.

import { rng32 } from "./leroy-cursor.js";

// --- motif ------------------------------------------------------------------
function bez(g, p, steps = 40) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = p;
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    out.push([
      u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
      u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
    ]);
  }
  return out;
}

function stroke(g, pts, w) {
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}

function leaf(g, x, y, ang, len, wid) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.beginPath();
  g.moveTo(0, 0);
  g.quadraticCurveTo(len * 0.45, -wid, len, 0);
  g.quadraticCurveTo(len * 0.45, wid, 0, 0);
  g.fill();
  g.restore();
}

function scroll(g, x, y, ang, r, turns, w) {
  const pts = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = ang + t * turns * Math.PI * 2;
    const rr = r * (1 - t * 0.92);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  stroke(g, pts, w);
}

// One sprig of stems, fanned across an angle range and drawn from the centre
// outward. Repeating it under a symmetry group is what makes it read as damask
// rather than as a doodle — and the same seed every time is what keeps the
// copies identical.
function sprig(g, w, h, o, seed, from = 0.12, to = 1.42) {
  const r = rng32(seed);
  const { stems, weight, leafiness, spread } = o;
  const diag = Math.hypot(w, h);
  const span = to - from;
  // a wide fan has to reach less far, or it runs off its own box
  const reach = span > 4 ? 0.62 : span > 1.6 ? 0.78 : 1;
  for (let s = 0; s < stems; s++) {
    const a0 = from + ((s + 0.5) / stems) * span + (r() - 0.5) * (span / stems) * 0.5;
    // stems start away from the middle, or the centre clogs and the field
    // never opens out into lace
    const off = diag * spread * (0.25 + r() * 0.5);
    const sx0 = Math.cos(a0) * off, sy0 = Math.sin(a0) * off;
    const len = diag * (0.5 + r() * 0.4) * reach;
    const ex = sx0 + Math.cos(a0) * len, ey = sy0 + Math.sin(a0) * len;
    const bow = (0.3 + r() * 0.5) * len;
    const pts = bez(g, [
      sx0, sy0,
      sx0 + Math.cos(a0 - 0.8) * bow, sy0 + Math.sin(a0 - 0.8) * bow,
      ex - Math.cos(a0 + 0.9) * bow * 0.8, ey - Math.sin(a0 + 0.9) * bow * 0.8,
      ex, ey,
    ]);
    stroke(g, pts, weight * (1.1 + r() * 0.5));

    // leaves and buds along the stem, alternating sides
    const n = Math.round(3 + leafiness * 6);
    for (let i = 1; i <= n; i++) {
      const t = i / (n + 1);
      const idx = Math.round(t * (pts.length - 1));
      const [px, py] = pts[idx];
      const [qx, qy] = pts[Math.min(pts.length - 1, idx + 1)];
      const ang = Math.atan2(qy - py, qx - px);
      const side = i % 2 ? 1 : -1;
      const ll = diag * (0.04 + r() * 0.06) * leafiness * (1 - t * 0.3);
      leaf(g, px, py, ang + side * (0.7 + r() * 0.5), ll, ll * (0.3 + r() * 0.25));
      if (r() < 0.45) {
        const br = diag * (0.012 + r() * 0.016);
        g.beginPath();
        g.arc(px - Math.cos(ang) * br * 2, py - Math.sin(ang) * br * 2, br, 0, Math.PI * 2);
        g.fill();
      }
    }
    // a scroll where the stem runs out
    const last = pts[pts.length - 1], prev = pts[pts.length - 6];
    scroll(g, last[0], last[1], Math.atan2(last[1] - prev[1], last[0] - prev[0]),
      diag * (0.05 + r() * 0.05), 0.8 + r() * 0.5, weight);
  }
}

function medallion(g, r0, o, seed) {
  const r = rng32(seed);
  const { petals, weight } = o;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    leaf(g, Math.cos(a) * r0 * 0.25, Math.sin(a) * r0 * 0.25, a, r0 * 0.8, r0 * 0.3);
  }
  g.lineWidth = weight;
  for (const k of [0.34, 0.5]) {
    g.beginPath();
    g.arc(0, 0, r0 * k, 0, Math.PI * 2);
    g.stroke();
  }
  g.beginPath();
  g.arc(0, 0, r0 * 0.16, 0, Math.PI * 2);
  g.fill();
  if (r() < 2) return; // keeps the rng consumed the same way whatever changes
}

function border(g, w, h, o) {
  const { inset, bands, weight, corners } = o;
  g.lineWidth = weight * 1.4;
  for (let b = 0; b < bands; b++) {
    const d = inset + b * weight * 3.2;
    g.strokeRect(d, d, w - d * 2, h - d * 2);
  }
  if (!corners) return;
  const c = Math.min(w, h) * 0.13;
  const d = inset + bands * weight * 3.2 + c * 0.25;
  for (const [sx, sy, ox, oy] of [[1, 1, d, d], [-1, 1, w - d, d], [1, -1, d, h - d], [-1, -1, w - d, h - d]]) {
    g.save();
    g.translate(ox, oy);
    g.scale(sx, sy);
    scroll(g, 0, 0, Math.PI * 0.25, c * 0.5, 1.05, weight);
    leaf(g, 0, 0, Math.PI * 0.25, c * 0.9, c * 0.3);
    g.restore();
  }
}

// The motif itself, composed to fill whatever box it is handed.
function motif(g, w, h, qo, seed, o) {
  const cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) / 2;
  const at = (fn) => { g.save(); g.translate(cx, cy); fn(); g.restore(); };

  switch (o.symmetry || "mirror4") {
    case "none": // no repetition at all — one free-standing spray
      at(() => sprig(g, w / 2, h / 2, qo, seed, -Math.PI, Math.PI));
      break;
    case "mirrorX": // one axis only — the halves differ top to bottom
      for (const sx of [1, -1])
        at(() => { g.scale(sx, 1); sprig(g, w / 2, h / 2, qo, seed, -1.35, 1.35); });
      break;
    case "rot4": // turned, not mirrored, so it reads as a pinwheel
      for (let k = 0; k < 4; k++)
        at(() => { g.rotate((k * Math.PI) / 2); sprig(g, R, R, qo, seed); });
      break;
    case "kaleido8": // eight wedges, every other one flipped
      for (let i = 0; i < 8; i++)
        at(() => {
          g.rotate((i * Math.PI) / 4);
          if (i % 2) g.scale(1, -1);
          sprig(g, R, R, qo, seed, 0.04, Math.PI / 4);
        });
      break;
    case "tile": { // a half-drop repeat — wallpaper rather than a panel
      const n = Math.max(2, o.repeat || 4);
      const tw = w / n, th = tw;
      const rows = Math.ceil(h / th) + 1;
      for (let ry = -1; ry < rows; ry++) {
        for (let rx = -1; rx <= n; rx++) {
          const ox = rx * tw + (ry % 2 ? tw / 2 : 0) + tw / 2;
          const oy = ry * th + th / 2;
          for (const sx of [1, -1]) {
            g.save();
            g.translate(ox, oy);
            g.scale(sx, 1);
            sprig(g, tw / 2, th / 2, qo, seed, -1.3, 1.3);
            g.restore();
          }
        }
      }
      break;
    }
    default: // mirror4 — both axes
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]])
        at(() => { g.scale(sx, sy); sprig(g, w / 2, h / 2, qo, seed); });
  }
  if (o.medallion > 0 && (o.symmetry || "mirror4") !== "tile") {
    g.save();
    g.translate(cx, cy);
    medallion(g, Math.min(w, h) * 0.5 * o.medallion, qo, seed);
    g.restore();
  }
}

// Draws the whole panel at whatever resolution is asked. The motif is composed
// into the field the border encloses and clipped to it, so it fills that field
// rather than running under the frame and off the edge of the panel.
export function drawLace(g, w, h, o) {
  const seed = o.seed >>> 0;
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  g.lineCap = "round";
  g.lineJoin = "round";

  // stroke weight stays tied to the panel, so the frame and the motif match
  const weight = Math.min(w, h) * 0.006 * o.weight;
  const qo = { stems: o.stems, weight, leafiness: o.leafiness, petals: o.petals, spread: o.spread ?? 0.35 };

  const f = fieldRect(w, h, o);
  g.save();
  g.beginPath();
  g.rect(f.x, f.y, f.w, f.h);
  g.clip();
  if ((o.symmetry || "mirror4") === "none") {
    // Nothing balances a single spray, so it lands wherever its stems happen to
    // fan. Draw it aside, find what it actually covers, and centre that.
    const t = document.createElement("canvas");
    t.width = Math.max(1, Math.round(f.w));
    t.height = Math.max(1, Math.round(f.h));
    const tg = t.getContext("2d", { willReadFrequently: true });
    tg.fillStyle = "#fff";
    tg.strokeStyle = "#fff";
    tg.lineCap = "round";
    tg.lineJoin = "round";
    motif(tg, t.width, t.height, qo, seed, o);
    const b = inkBounds(tg, t.width, t.height);
    const dx = b ? (t.width - (b.x1 - b.x0)) / 2 - b.x0 : 0;
    const dy = b ? (t.height - (b.y1 - b.y0)) / 2 - b.y0 : 0;
    g.drawImage(t, f.x + dx, f.y + dy);
  } else {
    g.translate(f.x, f.y);
    motif(g, f.w, f.h, qo, seed, o);
  }
  g.restore();

  if (o.border) {
    border(g, w, h, {
      inset: Math.min(w, h) * o.inset, bands: o.bands, weight, corners: o.corners,
    });
  }
}

// An uploaded image put through the same symmetry group as the motif, so a
// photograph comes back as lace rather than as a pixelated photograph. Its
// luminance becomes coverage later, in the page.
// The whole picture, with ground around it — nothing cropped away. `anchor` is
// the point of the picture to put in the middle, in its own 0..1 coordinates;
// the default centres the frame, a measured one centres the subject.
function contain(g, img, x, y, w, h, zoom = 1, anchor) {
  const s = Math.min(w / img.width, h / img.height) * zoom;
  const iw = img.width * s, ih = img.height * s;
  const ax = anchor ? anchor[0] : 0.5, ay = anchor ? anchor[1] : 0.5;
  g.drawImage(img, x + w / 2 - iw * ax, y + h / 2 - ih * ay, iw, ih);
}

function cover(g, img, x, y, w, h, zoom = 1) {
  const s = Math.max(w / img.width, h / img.height) * zoom;
  const iw = img.width * s, ih = img.height * s;
  g.drawImage(img, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
}

export function drawImageLace(g, w, h, img, o) {
  const z = o.zoom ?? 1;
  const cx = w / 2, cy = h / 2;
  const R = Math.min(w, h) / 2;
  const at = (fn) => { g.save(); g.translate(cx, cy); fn(); g.restore(); };
  const wedge = (r, a0, a1) => {
    g.beginPath();
    g.moveTo(0, 0);
    g.arc(0, 0, r, a0, a1);
    g.closePath();
    g.clip();
  };

  switch (o.symmetry || "mirror4") {
    case "none": // placed once, whole, in the middle
      at(() => contain(g, img, -w / 2, -h / 2, w, h, z, o.anchor));
      break;
    case "mirrorX":
      for (const sx of [1, -1])
        at(() => { g.scale(sx, 1); cover(g, img, 0, -h / 2, w / 2, h, z); });
      break;
    case "rot4":
      for (let k = 0; k < 4; k++)
        at(() => { g.rotate((k * Math.PI) / 2); cover(g, img, 0, 0, R, R, z); });
      break;
    case "kaleido8":
      for (let i = 0; i < 8; i++)
        at(() => {
          g.rotate((i * Math.PI) / 4);
          if (i % 2) g.scale(1, -1);
          wedge(R * 1.5, 0, Math.PI / 4);
          // centre the picture inside the wedge rather than on its point
          const m = R * 0.62, bis = Math.PI / 8, box = R * 1.25;
          cover(g, img, Math.cos(bis) * m - box / 2, Math.sin(bis) * m - box / 2, box, box, z);
        });
      break;
    case "tile": {
      const n = Math.max(2, o.repeat || 4);
      const tw = w / n, th = tw;
      const rows = Math.ceil(h / th) + 1;
      for (let ry = -1; ry < rows; ry++)
        for (let rx = -1; rx <= n; rx++) {
          const ox = rx * tw + (ry % 2 ? tw / 2 : 0) + tw / 2;
          const oy = ry * th + th / 2;
          for (const sx of [1, -1]) {
            g.save();
            g.translate(ox, oy);
            g.scale(sx, 1);
            cover(g, img, 0, -th / 2, tw / 2, th, z);
            g.restore();
          }
        }
      break;
    }
    default:
      for (const [sx, sy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]])
        at(() => { g.scale(sx, sy); cover(g, img, 0, 0, w / 2, h / 2, z); });
  }
}

// What a drawing actually covers, sampled every few pixels — exact enough to
// centre by, and far cheaper than reading every one.
function inkBounds(g, w, h, step = 3) {
  const d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (d[(y * w + x) * 4 + 3] < 8) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

// The field the border encloses — where a picture belongs, rather than running
// under the frame and off the edge of the panel.
export function fieldRect(w, h, o) {
  if (!o.border) return { x: 0, y: 0, w, h };
  const weight = Math.min(w, h) * 0.006 * o.weight;
  const inset = Math.min(w, h) * o.inset;
  const d = inset + (o.bands - 1) * weight * 3.2 + weight * 3.2;
  const m = Math.min(d, Math.min(w, h) * 0.45); // never close the field entirely
  return { x: m, y: m, w: w - m * 2, h: h - m * 2 };
}

// The frame on its own, so a dropped image can take the same border.
export function drawBorder(g, w, h, o) {
  g.save();
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  g.lineCap = "round";
  g.lineJoin = "round";
  border(g, w, h, {
    inset: Math.min(w, h) * o.inset,
    bands: o.bands,
    weight: Math.min(w, h) * 0.006 * o.weight,
    corners: o.corners,
  });
  g.restore();
}

// --- grid -------------------------------------------------------------------
// Average coverage per cell, from a canvas rendered much larger than the grid.
export function toGrid(src, cols, rows) {
  const g = src.getContext("2d", { willReadFrequently: true });
  const { width: W, height: H } = src;
  const data = g.getImageData(0, 0, W, H).data;
  const cw = W / cols, ch = H / rows;
  const cells = new Float32Array(cols * rows);
  const stride = Math.max(1, Math.floor(Math.min(cw, ch) / 4));
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const x0 = Math.floor(rx * cw), x1 = Math.floor((rx + 1) * cw);
      const y0 = Math.floor(ry * ch), y1 = Math.floor((ry + 1) * ch);
      let sum = 0, n = 0;
      for (let y = y0; y < y1; y += stride) {
        for (let x = x0; x < x1; x += stride) {
          sum += data[(y * W + x) * 4 + 3];
          n++;
        }
      }
      cells[ry * cols + rx] = n ? sum / n / 255 : 0;
    }
  }
  return { cols, rows, cells };
}

// 4×4 ordered dither — breaks flat areas into stitches instead of slabs
const BAYER = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
].flat().map((v) => (v + 0.5) / 16);

// A field measured through the shape, not over the canvas: how far each cell
// lies from the heart of the pattern, travelling along the pattern itself.
// Motion driven by this runs out along the arms the motif actually has, where
// a wave keyed to the canvas centre would sweep across it regardless of what
// is drawn there.
//
// Two passes: geodesic distance through the ink from its densest point, then
// distance outward from the ink for everything else, so a front can push past
// the present silhouette and grow new stitches rather than only erasing them.
export function shapeField(grid, o = {}) {
  const { cols, rows, cells } = grid;
  const ink = o.ink ?? 0.12;
  const n = cols * rows;
  const dist = new Float32Array(n).fill(Infinity);

  let sx = 0, sy = 0, count = 0;
  for (let i = 0; i < n; i++) {
    if (cells[i] < ink) continue;
    sx += i % cols;
    sy += (i / cols) | 0;
    count++;
  }
  if (!count) return { field: new Float32Array(n), max: 1 };
  const cx = sx / count, cy = sy / count;

  const queue = new Int32Array(n);
  let head = 0, tail = 0;
  const push = (i, d) => { dist[i] = d; queue[tail++] = i; };

  // start at the ink cell closest to the middle of the ink — the heart of it
  let seed = -1, best = Infinity;
  for (let i = 0; i < n; i++) {
    if (cells[i] < ink) continue;
    const dx = (i % cols) - cx, dy = ((i / cols) | 0) - cy, d = dx * dx + dy * dy;
    if (d < best) { best = d; seed = i; }
  }
  push(seed, 0);

  const walk = (through) => {
    while (head < tail) {
      const i = queue[head++];
      const x = i % cols, y = (i / cols) | 0, d = dist[i] + 1;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx;
          if (dist[j] !== Infinity) continue;
          if (through && cells[j] < ink) continue;
          if (!through && cells[j] >= ink) continue;
          push(j, d);
        }
      }
    }
  };
  walk(true);

  // pieces the walk could not reach — the frame is its own island — start from
  // where each sits relative to the heart, so they move in step with it
  for (let i = 0; i < n; i++) {
    if (cells[i] < ink || dist[i] !== Infinity) continue;
    const dx = (i % cols) - cx, dy = ((i / cols) | 0) - cy;
    push(i, Math.hypot(dx, dy));
    walk(true);
  }

  // then outward from the ink, so the front has somewhere to grow into
  head = 0;
  tail = 0;
  for (let i = 0; i < n; i++) if (dist[i] !== Infinity) queue[tail++] = i;
  walk(false);

  let max = 0;
  for (let i = 0; i < n; i++) if (dist[i] !== Infinity && dist[i] > max) max = dist[i];
  max = max || 1;
  const field = new Float32Array(n);
  for (let i = 0; i < n; i++) field[i] = dist[i] === Infinity ? 1 : dist[i] / max;
  return { field, max };
}

// Which cells get a stitch, and at what level — worked out once and shared by
// the canvas and the SVG, so the file is what you were looking at.
export function stitchCells(grid, o) {
  const { cols, rows, cells } = grid;
  const {
    x = 0, y = 0, w, h, levels = 3, threshold = 0.5,
    contrast = 1, gap = 0.18, dither = 0.35, seed = 7,
  } = o;
  const cw = w / cols, ch = h / rows;
  const size = Math.min(cw, ch) * (1 - gap);
  const rnd = rng32(seed);
  const noise = new Float32Array(cols * rows);
  for (let i = 0; i < noise.length; i++) noise[i] = rnd();

  const byLevel = Array.from({ length: levels + 1 }, () => []);
  for (let ry = 0; ry < rows; ry++) {
    for (let rx = 0; rx < cols; rx++) {
      const i = ry * cols + rx;
      // threshold is a floor, not a pivot: below it the cell stays bare, and
      // what is left is stretched back over the full range. Without that, a
      // photograph's dark ground still stitches a dim cell everywhere.
      let v = (cells[i] - threshold) / Math.max(0.001, 1 - threshold);
      if (v <= 0) continue;
      v = Math.max(0, Math.min(1, 0.5 + (v - 0.5) * contrast));
      if (v <= 0) continue;
      const d = (BAYER[(ry % 4) * 4 + (rx % 4)] - 0.5) * dither
        + (noise[i] - 0.5) * dither * 0.6;
      const lv = Math.ceil(Math.max(0, Math.min(1, v + d)) * levels);
      if (lv < 1) continue;
      byLevel[Math.min(levels, lv)].push([
        x + rx * cw + (cw - size) / 2,
        y + ry * ch + (ch - size) / 2,
      ]);
    }
  }
  return { byLevel, size, levels };
}

export function drawStitches(ctx, grid, o) {
  const { ink = "#2fe36a", shape = "square" } = o;
  const { byLevel, size, levels } = stitchCells(grid, o);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  for (let l = 1; l <= levels; l++) {
    if (!byLevel[l].length) continue;
    ctx.globalAlpha = l / levels;
    ctx.beginPath();
    for (const [px, py] of byLevel[l]) {
      if (shape === "dot") {
        ctx.moveTo(px + size, py + size / 2);
        ctx.arc(px + size / 2, py + size / 2, size / 2, 0, Math.PI * 2);
      } else if (shape === "cross") {
        const t = size * 0.34;
        ctx.rect(px, py + (size - t) / 2, size, t);
        ctx.rect(px + (size - t) / 2, py, t, size);
      } else {
        ctx.rect(px, py, size, size);
      }
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// Every other mode moves which cells are lit; this one moves the stitches
// themselves. Each carries where it ends up, where it came in from and when its
// turn is, and is drawn somewhere along that line — so they arrive rather than
// appear, and at phase 1 they sit exactly where the still composition puts them.
export function drawLoose(ctx, items, o) {
  const { ink = "#2fe36a", shape = "square", size, levels = 3, phase = 1, stagger = 0 } = o;
  const buckets = Array.from({ length: levels + 1 }, () => []);
  const span = 1 - stagger;
  for (const it of items) {
    // linear, and by default everything moves together: the point is that each
    // frame is the whole set a step closer, not a scatter of arrival times
    const e = Math.max(0, Math.min(1, (phase - it.delay * stagger) / span));
    it.x = it.sx + (it.tx - it.sx) * e;
    it.y = it.sy + (it.ty - it.sy) * e;
    buckets[it.level].push(it);
  }
  // Every stitch is drawn at full strength wherever it is: they are the same
  // stitches throughout, waiting to be arranged, not arriving out of nothing.
  ctx.fillStyle = ink;
  const r = size / 2;
  for (let l = 1; l <= levels; l++) {
    const bucket = buckets[l];
    if (!bucket.length) continue;
    ctx.globalAlpha = l / levels;
    ctx.beginPath();
    for (const it of bucket) {
      if (shape === "dot") {
        ctx.moveTo(it.x + size, it.y + r);
        ctx.arc(it.x + r, it.y + r, r, 0, Math.PI * 2);
      } else if (shape === "cross") {
        const t = size * 0.34;
        ctx.rect(it.x, it.y + (size - t) / 2, size, t);
        ctx.rect(it.x + (size - t) / 2, it.y, t, size);
      } else ctx.rect(it.x, it.y, size, size);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// The same stitches as vector, flattened: every stitch in one compound path on
// a transparent ground, so the file arrives as a single object to place,
// recolour or cut. Tone cannot survive that — one path carries one fill — so
// the levels collapse to solid. Set Levels to 1 and the canvas shows exactly
// what the file will be.
export function toSVG(grid, o) {
  const { ink = "#2fe36a", shape = "square", w, h } = o;
  const { byLevel, size, levels } = stitchCells(grid, o);
  const n = (v) => Math.round(v * 100) / 100;
  const r = n(size / 2), sz = n(size);
  const d = [];
  for (let l = 1; l <= levels; l++) {
    for (const [px, py] of byLevel[l]) {
      const x = n(px), y = n(py);
      if (shape === "dot") {
        d.push(`M${x} ${n(y + r)}a${r} ${r} 0 1 0 ${sz} 0a${r} ${r} 0 1 0 ${n(-size)} 0z`);
      } else if (shape === "cross") {
        const t = n(size * 0.34), off = n((size - size * 0.34) / 2);
        d.push(`M${x} ${n(y + off)}h${sz}v${t}h${n(-size)}z`);
        d.push(`M${n(x + off)} ${y}h${t}v${sz}h${-t}z`);
      } else {
        d.push(`M${x} ${y}h${sz}v${sz}h${n(-size)}z`);
      }
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}">`,
    `<path fill="${ink}" d="${d.join("")}"/>`,
    "</svg>",
  ].join("\n");
}
