// Pixel lace: a symmetric damask panel, resolved onto a stitch grid.
//
// The motif is drawn as ordinary vector work into an offscreen canvas at a much
// higher resolution than the grid, then each cell takes the average coverage of
// the block beneath it. Quantising that average is what gives the woven look —
// the grid does the drawing's work of deciding what survives.

import { rng32, valueNoise } from "./leroy-cursor.js";

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

// When each cell is reached if growth spreads through the ink from its densest
// point at an uneven rate — first-passage percolation. A plain breadth-first
// walk gives every cell its distance and the front comes out as a clean ring;
// charging a cost for each step instead lets some paths race ahead and others
// lag, so the front ends up ragged and lobed, which is what a colony spreading
// on a plate looks like. Growth still only reaches a cell through its
// neighbours, so nothing can appear before what it grew out of.
//
// The cost has to come in patches, not per step. Independent noise on each step
// washes straight out — a shortest path simply routes around any one slow cell,
// and the front comes back almost as smooth as it started. Ground that is slow
// or quick in patches the size of several cells cannot be routed around, and
// that is what makes fingers.
export function growthField(grid, o = {}) {
  const { cols, rows, cells } = grid;
  const ink = o.ink ?? 0.12;
  const rough = o.roughness ?? 1;
  const seed = (o.seed ?? 1) >>> 0;
  const scale = o.scale ?? 0.14;
  const jitter = (seed % 997) * 3.7;
  const costAt = (x, y) => {
    const a = valueNoise(x * scale + jitter, y * scale + jitter);
    const b = valueNoise(x * scale * 2.9 + 31, y * scale * 2.9 + 17);
    const nz = a * 0.72 + b * 0.28;
    // squared, so the slow ground is properly slow and growth has to go round
    return 0.2 + rough * 7 * nz * nz;
  };
  const n = cols * rows;
  const dist = new Float32Array(n).fill(Infinity);
  const rnd = rng32(seed);

  let sx = 0, sy = 0, count = 0;
  for (let i = 0; i < n; i++) {
    if (cells[i] < ink) continue;
    sx += i % cols; sy += (i / cols) | 0; count++;
  }
  if (!count) return { field: new Float32Array(n), max: 1 };
  const cx = sx / count, cy = sy / count;
  let seedCell = -1, best = Infinity;
  for (let i = 0; i < n; i++) {
    if (cells[i] < ink) continue;
    const dx = (i % cols) - cx, dy = ((i / cols) | 0) - cy, d = dx * dx + dy * dy;
    if (d < best) { best = d; seedCell = i; }
  }

  // a binary heap, since the step costs differ and a queue would no longer
  // come out in order
  const hv = new Float64Array(n + 1), hi = new Int32Array(n + 1);
  let size = 0;
  const push = (v, idx) => {
    let k = ++size; hv[k] = v; hi[k] = idx;
    while (k > 1 && hv[k >> 1] > hv[k]) {
      [hv[k], hv[k >> 1]] = [hv[k >> 1], hv[k]];
      [hi[k], hi[k >> 1]] = [hi[k >> 1], hi[k]];
      k >>= 1;
    }
  };
  const pop = () => {
    const top = hi[1];
    hv[1] = hv[size]; hi[1] = hi[size--];
    let k = 1;
    for (;;) {
      const l = k << 1, r = l + 1;
      let m = k;
      if (l <= size && hv[l] < hv[m]) m = l;
      if (r <= size && hv[r] < hv[m]) m = r;
      if (m === k) break;
      [hv[k], hv[m]] = [hv[m], hv[k]];
      [hi[k], hi[m]] = [hi[m], hi[k]];
      k = m;
    }
    return top;
  };

  dist[seedCell] = 0;
  push(0, seedCell);
  const walk = (through) => {
    while (size > 0) {
      const i = pop();
      const x = i % cols, y = (i / cols) | 0, base = dist[i];
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const j = ny * cols + nx;
          if (through !== (cells[j] >= ink)) continue;
          const step = (ox && oy ? 1.414 : 1) * costAt(nx, ny) * (0.85 + rnd() * 0.3);
          const d = base + step;
          if (d < dist[j]) { dist[j] = d; push(d, j); }
        }
      }
    }
  };
  walk(true);

  // islands the growth cannot reach — the frame is one — start from where they
  // sit, so they come in around the same time as the ink nearest them
  for (let i = 0; i < n; i++) {
    if (cells[i] < ink || dist[i] !== Infinity) continue;
    const dx = (i % cols) - cx, dy = ((i / cols) | 0) - cy;
    dist[i] = Math.hypot(dx, dy) * (1 + rough);
    push(dist[i], i);
    walk(true);
  }

  let max = 0;
  for (let i = 0; i < n; i++) if (dist[i] !== Infinity && dist[i] > max) max = dist[i];
  max = max || 1;
  const field = new Float32Array(n);
  for (let i = 0; i < n; i++) field[i] = dist[i] === Infinity ? 1 : dist[i] / max;
  return { field, max };
}

// --- riso -------------------------------------------------------------------
// A duplicator lays ink unevenly and on absorbent stock: fine grain everywhere,
// broad patches where the drum carried more ink than elsewhere, and a scatter
// of stray specks around every mark. Those three over a clean print are most of
// what reads as riso.
let grainTile = null, grainKey = "";
function grain(seed) {
  const key = String(seed);
  if (grainTile && grainKey === key) return grainTile;
  const N = 256;
  const c = document.createElement("canvas");
  c.width = c.height = N;
  const g = c.getContext("2d");
  const img = g.createImageData(N, N);
  const r = rng32(seed >>> 0);
  for (let i = 0; i < img.data.length; i += 4) {
    // mid grey does nothing under overlay, so the tile is a field of
    // departures from it — some specks lift, some sink
    const v = r();
    const lift = v > 0.5 ? 1 : -1;
    const mag = Math.pow(Math.abs(v * 2 - 1), 1.7);
    const level = 128 + lift * mag * 127;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = level;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  grainKey = key;
  return c;
}

let mottleTile = null, mottleKey = "";
function mottle(seed, w, h) {
  const key = `${seed}|${Math.round(w)}x${Math.round(h)}`;
  if (mottleTile && mottleKey === key) return mottleTile;
  // drawn small and scaled up, so the interpolation does the softening
  const cols = 24, rows = Math.max(4, Math.round((24 * h) / w));
  const c = document.createElement("canvas");
  c.width = cols;
  c.height = rows;
  const g = c.getContext("2d");
  const img = g.createImageData(cols, rows);
  const r = rng32((seed ^ 0x51ed) >>> 0);
  for (let i = 0; i < img.data.length; i += 4) {
    const level = 128 + (r() - 0.5) * 150;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = level;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  mottleTile = c;
  mottleKey = key;
  return c;
}

export function applyRiso(ctx, w, h, o = {}) {
  const { grain: gAmt = 0, mottle: mAmt = 0, seed = 1, scale = 1 } = o;
  if (mAmt > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = mAmt;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mottle(seed, w, h), 0, 0, w, h);
    ctx.restore();
  }
  if (gAmt > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "overlay";
    ctx.globalAlpha = gAmt;
    ctx.scale(scale, scale);
    ctx.fillStyle = ctx.createPattern(grain(seed), "repeat");
    ctx.fillRect(0, 0, w / scale, h / scale);
    ctx.restore();
  }
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

// --- relief -----------------------------------------------------------------
// A flat fill of one colour at one size reads as a swatch. Two things give a
// stitch body: its size following how solid that part of the pattern is, and a
// shaded copy under it with a lit one behind, which is what turns a square into
// something sitting on the ground rather than printed onto it.
function mix(hex, to, t) {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  const r2 = Math.round(r + (to - r) * t), g2 = Math.round(g + (to - g) * t), b2 = Math.round(b + (to - b) * t);
  return `rgb(${r2},${g2},${b2})`;
}

// A stitch nudged off its cell, by an amount fixed for that cell and that
// frame. Printing that misses its register by a hair is alive in a way a
// perfect grid is not — and in motion it gives the stitches something to do
// while the pattern itself holds still.
export function hash01(x, y, seed) {
  let h = (Math.imul(Math.round(x) | 0, 374761393) ^ Math.imul(Math.round(y) | 0, 668265263)
    ^ Math.imul(seed | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function nudge(x, y, amount, seed) {
  if (!(amount > 0)) return [x, y];
  let h = (Math.imul(Math.round(x) | 0, 374761393) ^ Math.imul(Math.round(y) | 0, 668265263)
    ^ Math.imul(seed | 0, 2246822519)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  const a = (h >>> 8) / 16777216 * Math.PI * 2;
  const r = ((h & 255) / 255) * amount;
  return [x + Math.cos(a) * r, y + Math.sin(a) * r];
}

export function stitchShape(ctx, x, y, size, shape) {
  const r = size / 2;
  if (shape === "dot") {
    ctx.moveTo(x + size, y + r);
    ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  } else if (shape === "cross") {
    const t = size * 0.34;
    ctx.rect(x, y + (size - t) / 2, size, t);
    ctx.rect(x + (size - t) / 2, y, t, size);
  } else ctx.rect(x, y, size, size);
}

// Paints one level: the lit copy behind, the shaded copy under, the stitch on
// top. `at` hands back each position so both the still and the moving stitches
// can use it.
function paintLevel(ctx, count, at, size, o, alpha) {
  const { ink, shape, relief = 0, offset = 0, offsetSeed = 0,
    speckle = 0, speckleSeed = 0,
    // both keyed to the print: the lattice is broken once, not per frame
    scatter = 0, vary = 0, printSeed = 0 } = o;
  const run = (dx, dy, colour, a) => {
    ctx.globalAlpha = a;
    ctx.fillStyle = colour;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const p = at(i);
      const base = p[2] ?? size;
      // off its cell for good, then off that again for this frame
      const c = scatter > 0 ? nudge(p[0], p[1], scatter, printSeed) : p;
      const n = nudge(c[0], c[1], offset, offsetSeed);
      // and no two quite the same size, which is what stops a field of them
      // reading as a grid however far they are moved off one
      const sz = vary > 0
        ? base * (1 + (hash01(p[0], p[1], printSeed ^ 0x9e37) * 2 - 1) * vary)
        : base;
      const k = (base - sz) / 2; // grown or shrunk about its own middle
      stitchShape(ctx, n[0] + dx + k, n[1] + dy + k, sz, shape);
    }
    ctx.fill();
  };
  if (relief > 0) {
    // The bevel fades with the stitch it belongs to. Held at a fixed strength
    // while the ink dims, the two offset copies come to outweigh it and the
    // mark's centre slides towards the shaded one — which looks exactly like
    // the stitch moving. Scaled together, the mark only ever gets fainter.
    const d = size * 0.34 * relief;
    run(-d, -d, mix(ink, 255, 0.45), alpha * 0.55 * relief); // lit from the top left
    run(d, d, mix(ink, 0, 0.5), alpha * 0.7 * relief);
  }
  run(0, 0, ink, alpha);

  if (speckle > 0) {
    // ink that did not quite make it onto the mark
    ctx.globalAlpha = alpha * 0.55;
    ctx.fillStyle = ink;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const p = at(i);
      for (let k = 0; k < 3; k++) {
        // keyed to the print, not the frame: specks are part of the mark and
        // travel with it, where re-rolling them every frame set the whole
        // ground crawling
        const n = nudge(p[0] + k * 37, p[1] - k * 53, size * 2.2 * speckle, speckleSeed + k * 911);
        const d = size * (0.12 + 0.16 * ((k * 7 + i) % 3) / 2);
        ctx.rect(n[0], n[1], d, d);
      }
    }
    ctx.fill();
  }
}

// Which cells get a stitch, and at what level — worked out once and shared by
// the canvas and the SVG, so the file is what you were looking at.
export function stitchCells(grid, o) {
  const { cols, rows, cells } = grid;
  const {
    x = 0, y = 0, w, h, levels = 3, threshold = 0.5,
    contrast = 1, gap = 0.18, dither = 0.35, seed = 7,
    // what a stitch's size is taken from. Motion changes which cells are lit
    // and how strongly, but a stitch that grows or shrinks between frames reads
    // as one that moved, so size comes from the still composition and stays put.
    sizeFrom = null,
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
        Math.max(0, Math.min(1, (sizeFrom ? sizeFrom[i] : cells[i]))),
        Math.max(0, Math.min(1, v + d)), // the value itself, before it was stepped
        i,                                // which cell it is, for per-stitch fades
      ]);
    }
  }
  return { byLevel, size, levels };
}

// How finely a fading stitch is allowed to fade. Only the motions that fade use
// it — a stitch that is simply there is drawn at full strength. Sixteen steps
// were coarse enough that stitches at different depths landed on the same one,
// which flattened the variation between them.
const SMOOTH_STEPS = 32;

export function drawStitches(ctx, grid, o) {
  const { ink = "#2fe36a", shape = "square", relief = 0, swell = 0,
    offset = 0, offsetSeed = 0, speckle = 0, speckleSeed = 0,
    scatter = 0, vary = 0, printSeed = 0,
    // fade(cellIndex) -> 0..1, multiplying a stitch's opacity. Nothing else
    // about the stitch changes: same cell, same size, same place.
    fade = null } = o;
  const { byLevel, size, levels } = stitchCells(grid, o);
  const marks = { ink, shape, relief, offset, offsetSeed, speckle, speckleSeed, scatter, vary, printSeed };
  const place = (cells) => (i) => {
    const lsize = size * (1 - swell * (1 - cells[i][2]));
    const off = (size - lsize) / 2;
    return [cells[i][0] + off, cells[i][1] + off, lsize];
  };

  if (fade) {
    // grouped by the opacity each stitch ends up at
    const buckets = Array.from({ length: SMOOTH_STEPS + 1 }, () => []);
    for (let l = 1; l <= levels; l++) {
      for (const c of byLevel[l]) {
        let a = fade(c[4]);
        const b = Math.round(a * SMOOTH_STEPS);
        if (b < 1) continue; // faded away entirely
        buckets[Math.min(SMOOTH_STEPS, b)].push(c);
      }
    }
    for (let b = 1; b <= SMOOTH_STEPS; b++) {
      const cells = buckets[b];
      if (!cells.length) continue;
      paintLevel(ctx, cells.length, place(cells), size, marks, b / SMOOTH_STEPS);
    }
    ctx.globalAlpha = 1;
    return;
  }

  // Full strength, every one of them. Tone — stepped or smooth — put the faint
  // parts of the pattern in at a fraction of the ink, which reads as a print
  // that did not take; a stitch is either there or it is not.
  for (let l = 1; l <= levels; l++) {
    const cells = byLevel[l];
    if (!cells.length) continue;
    paintLevel(ctx, cells.length, place(cells), size, marks, 1);
  }
  ctx.globalAlpha = 1;
}

// Every other mode moves which cells are lit; this one moves the stitches
// themselves. Each carries where it ends up, where it came in from and when its
// turn is, and is drawn somewhere along that line — so they arrive rather than
// appear, and at phase 1 they sit exactly where the still composition puts them.
export function drawLoose(ctx, items, o) {
  const {
    ink = "#2fe36a", shape = "square", size, levels = 3, phase = 1, stagger = 0,
    cw = 0, ch = 0, offX = 0, offY = 0, // the cell lattice, to land on
    path = "line",  // "manhattan" turns a corner: across first, then down
    loosen = 0,     // over the last of the run, let them off the lattice again
    relief = 0, swell = 0, offset = 0, offsetSeed = 0, speckle = 0, speckleSeed = 0,
    scatter = 0, vary = 0, printSeed = 0,
    emerge = false, // a stitch that has not had its turn is not there at all
  } = o;
  const buckets = Array.from({ length: levels + 1 }, () => []);
  const span = 1 - stagger;
  const snap = cw > 0 && ch > 0;
  for (const it of items) {
    // linear, and by default everything moves together: the point is that each
    // frame is the whole set a step closer, not a scatter of arrival times
    const e = Math.max(0, Math.min(1, (phase - it.delay * stagger) / span));
    // A growing stitch is simply there or it is not: no easing in, by size or
    // by opacity. Something dividing appears whole.
    if (emerge && e <= 0) continue;
    let x, y;
    if (path === "manhattan") {
      const ex = Math.min(1, e * 2), ey = Math.max(0, e * 2 - 1);
      x = it.sx + (it.tx - it.sx) * ex;
      y = it.sy + (it.ty - it.sy) * ey;
    } else {
      x = it.sx + (it.tx - it.sx) * e;
      y = it.sy + (it.ty - it.sy) * e;
    }
    if (snap) {
      // Every frame is a legal arrangement on the same lattice the stitches
      // end on, so blocks step from cell to cell instead of sliding between
      // them. Off-lattice positions are what made it read as things flying
      // about rather than as a pattern rearranging itself.
      const sx2 = Math.round((x - offX) / cw) * cw + offX;
      const sy2 = Math.round((y - offY) / ch) * ch + offY;
      // ...except at the very end, where holding them to whole cells makes the
      // last move a jump onto the mark. Easing off the lattice there lets them
      // close the final fraction of a cell instead.
      const k = loosen > 0 ? Math.max(0, Math.min(1, (e - (1 - loosen)) / loosen)) : 0;
      const m = k * k * (3 - 2 * k);
      x = sx2 + (x - sx2) * m;
      y = sy2 + (y - sy2) * m;
    }
    it.x = x;
    it.y = y;
    buckets[it.level].push(it);
  }
  // Every stitch is drawn at full strength wherever it is: they are the same
  // stitches throughout, waiting to be arranged, not arriving out of nothing.
  for (let l = 1; l <= levels; l++) {
    const bucket = buckets[l];
    if (!bucket.length) continue;
    const paintOpts = { ink, shape, relief, offset, offsetSeed, speckle, speckleSeed, scatter, vary, printSeed };
    // Each stitch at the size its own cell asks for — the same rule the still
    // panel uses. Sizing these by their level instead left the two disagreeing,
    // so a gather never quite landed on the picture it came from.
    const at = (i) => {
      const it = bucket[i];
      const sz = size * (1 - swell * (1 - (it.w ?? 1)));
      const k = (size - sz) / 2;
      return [it.x + k, it.y + k, sz];
    };
    paintLevel(ctx, bucket.length, at, size, paintOpts, 1);
  }
  ctx.globalAlpha = 1;
}

// The same stitches as vector, flattened: every stitch in one compound path on
// a transparent ground, so the file arrives as a single object to place,
// recolour or cut. Tone cannot survive that — one path carries one fill — so
// the levels collapse to solid. Set Levels to 1 and the canvas shows exactly
// what the file will be.
export function toSVG(grid, o) {
  const { ink = "#2fe36a", shape = "square", w, h, bg = null, soft = 0, relief = 0, shadow = null,
    swell = 0, scatter = 0, vary = 0, printSeed = 0,
    offset = 0, offsetSeed = 0, speckle = 0, speckleSeed = 0 } = o;
  const { byLevel, size, levels } = stitchCells(grid, o);
  const n = (v) => Math.round(v * 100) / 100;

  // Mirrors what the canvas paints, level by level, rather than flattening it:
  // a file that does not match the picture it came from is not much use. Tone
  // needs an opacity per level and relief needs its own colours, so it is a
  // handful of paths rather than one. Grain and mottle cannot come — they are
  // per-pixel noise, and vector has nowhere to put them.
  const mark = (d, x, y, sz) => {
    const r = n(sz / 2), s2 = n(sz), X = n(x), Y = n(y);
    if (shape === "dot") {
      d.push(`M${X} ${n(y + sz / 2)}a${r} ${r} 0 1 0 ${s2} 0a${r} ${r} 0 1 0 ${n(-sz)} 0z`);
    } else if (shape === "cross") {
      const t = n(sz * 0.34), off = n((sz - sz * 0.34) / 2);
      d.push(`M${X} ${n(y + off)}h${s2}v${t}h${n(-sz)}z`);
      d.push(`M${n(x + off)} ${Y}h${t}v${s2}h${-t}z`);
    } else {
      d.push(`M${X} ${Y}h${s2}v${s2}h${n(-sz)}z`);
    }
  };

  const body = [];
  for (let l = 1; l <= levels; l++) {
    const cells = byLevel[l];
    if (!cells.length) continue;
    const alpha = l / levels;
    // where each stitch of this level ends up, and how big it is — its weight
    // follows its own place in the pattern, as on the canvas
    const placed = [];
    for (const [px, py, cov] of cells) {
      const lsize = size * (1 - swell * (1 - (cov ?? 1)));
      const loff = (size - lsize) / 2;
      const base = [px + loff, py + loff];
      const c = scatter > 0 ? nudge(base[0], base[1], scatter, printSeed) : base;
      const p = nudge(c[0], c[1], offset, offsetSeed);
      const sz = vary > 0
        ? lsize * (1 + (hash01(px, py, printSeed ^ 0x9e37) * 2 - 1) * vary)
        : lsize;
      const k = (lsize - sz) / 2;
      placed.push([p[0] + k, p[1] + k, sz]);
    }

    const layer = (dx, dy, colour, a) => {
      const d = [];
      for (const [x, y, sz] of placed) mark(d, x + dx, y + dy, sz);
      body.push(`<path fill="${colour}" fill-opacity="${n(a)}" d="${d.join("")}"/>`);
    };
    if (relief > 0) {
      // fades with the stitch, as on the canvas
      const dd = size * 0.34 * relief;
      layer(-dd, -dd, mix(ink, 255, 0.45), alpha * 0.55 * relief);
      layer(dd, dd, mix(ink, 0, 0.5), alpha * 0.7 * relief);
    }
    layer(0, 0, ink, alpha);

    if (speckle > 0) {
      const d = [];
      for (const [x, y] of placed) {
        for (let q = 0; q < 3; q++) {
          const sp = nudge(x + q * 37, y - q * 53, lsize * 2.2 * speckle, speckleSeed + q * 911);
          mark(d, sp[0], sp[1], lsize * (0.12 + 0.16 * ((q * 7) % 3) / 2));
        }
      }
      body.push(`<path fill="${ink}" fill-opacity="${n(alpha * 0.55)}" d="${d.join("")}"/>`);
    }
  }

  const out = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(w)}" height="${n(h)}" viewBox="0 0 ${n(w)} ${n(h)}">`,
  ];
  // canvas blur(Npx) is a gaussian of standard deviation N, same as this, and
  // the shadow is the same offset, spread and strength the canvas casts
  const fx = [];
  if (soft > 0) fx.push(`<feGaussianBlur stdDeviation="${n(soft)}"/>`);
  if (shadow) {
    fx.push(`<feDropShadow dx="${n(shadow.dx)}" dy="${n(shadow.dy)}" ` +
      `stdDeviation="${n(soft + shadow.blur)}" flood-color="#000" ` +
      `flood-opacity="${n(shadow.alpha)}"/>`);
  }
  if (fx.length) {
    out.push(`<defs><filter id="fx" x="-10%" y="-10%" width="120%" height="120%">` +
      `${fx.join("")}</filter></defs>`);
  }
  if (bg) out.push(`<rect width="${n(w)}" height="${n(h)}" fill="${bg}"/>`);
  out.push(fx.length ? `<g filter="url(#fx)">${body.join("")}</g>` : body.join("\n"));
  out.push("</svg>");
  return out.join("\n");
}
