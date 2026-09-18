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
  const reach = span > 1.6 ? 0.78 : 1;
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

// Draws the whole panel, mirrored four ways, at whatever resolution is asked.
export function drawLace(g, w, h, o) {
  const seed = o.seed >>> 0;
  g.clearRect(0, 0, w, h);
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  g.lineCap = "round";
  g.lineJoin = "round";

  const cx = w / 2, cy = h / 2;
  const weight = Math.min(w, h) * 0.006 * o.weight;
  const qo = { stems: o.stems, weight, leafiness: o.leafiness, petals: o.petals, spread: o.spread ?? 0.35 };
  const R = Math.min(w, h) / 2;
  const at = (fn) => { g.save(); g.translate(cx, cy); fn(); g.restore(); };

  switch (o.symmetry || "mirror4") {
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
  if (o.border) {
    border(g, w, h, {
      inset: Math.min(w, h) * o.inset, bands: o.bands, weight, corners: o.corners,
    });
  }
}

// An uploaded image put through the same symmetry group as the motif, so a
// photograph comes back as lace rather than as a pixelated photograph. Its
// luminance becomes coverage later, in the page.
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

export function drawStitches(ctx, grid, o) {
  const { cols, rows, cells } = grid;
  const {
    x = 0, y = 0, w, h, ink = "#2fe36a", levels = 3, threshold = 0.5,
    contrast = 1, gap = 0.18, shape = "square", dither = 0.35, seed = 7,
  } = o;
  const cw = w / cols, ch = h / rows;
  const size = Math.min(cw, ch) * (1 - gap);
  const rnd = rng32(seed);
  const noise = new Float32Array(cols * rows);
  for (let i = 0; i < noise.length; i++) noise[i] = rnd();

  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  for (let l = 1; l <= levels; l++) {
    ctx.globalAlpha = l / levels;
    ctx.beginPath();
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
        if (lv !== l) continue;
        const px = x + rx * cw + (cw - size) / 2;
        const py = y + ry * ch + (ch - size) / 2;
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
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
