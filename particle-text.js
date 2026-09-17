// Type on a circle, turned into dust.
//
// Glyph outlines are read back out of the canvas rather than parsed: the ring
// is drawn once into a scratch canvas, then sampled on a jittered grid. Any
// font the machine has works, with no font library and no network.

import { stamps, paperGrain, rng32, valueNoise } from "./leroy-cursor.js";

const scratch = document.createElement("canvas");

function sampleInk(g, size, scale, R, cx, cy, o, seed) {
  const { spacing = 3, jitter = 0.85, threshold = 120, spray = 0, strayChance = 0 } = o;
  const img = g.getImageData(0, 0, size, size).data;
  const rnd = rng32(seed);
  const step = Math.max(1, Math.round(spacing * scale));
  const pts = [];
  for (let y = 0; y < size; y += step) {
    for (let x = 0; x < size; x += step) {
      const jx = x + (rnd() - 0.5) * step * jitter * 2;
      const jy = y + (rnd() - 0.5) * step * jitter * 2;
      const ix = Math.round(jx), iy = Math.round(jy);
      if (ix < 0 || iy < 0 || ix >= size || iy >= size) continue;
      if (img[(iy * size + ix) * 4 + 3] < threshold) continue;
      let wx = cx + jx / scale - R, wy = cy + jy / scale - R;
      if (spray > 0) {
        // a little of it lands off the stroke — ink does not stop at the edge
        const loose = rnd() < strayChance ? 3 : 1;
        wx += (rnd() - 0.5) * spray * 2 * loose;
        wy += (rnd() - 0.5) * spray * 2 * loose;
      }
      pts.push([wx, wy]);
    }
  }
  return pts;
}

// One ring of text. `startAngle` is where the middle of the run sits, in degrees
// clockwise from twelve o'clock, in both modes. `flip` turns the glyphs to face
// inward and runs them the other way round — the usual treatment for the lower
// half of a ring, so it reads the right way up. A flipped ring therefore wants
// an angle near 180.
export function circularText(o) {
  const {
    text, cx, cy, radius, fontSize, fontFamily = "system-ui", weight = 700,
    tracking = 0, startAngle = 0, flip = false, scale = 2, solid = false,
  } = o;
  if (!text) return { points: [], draw: null };

  const pad = fontSize * 1.6;
  const R = radius + pad;
  const size = Math.ceil(2 * R * scale);
  scratch.width = scratch.height = size;
  const g = scratch.getContext("2d", { willReadFrequently: true });
  g.setTransform(scale, 0, 0, scale, R * scale, R * scale);
  g.font = `${weight} ${fontSize}px ${fontFamily}`;
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";

  const chars = [...text];
  const widths = chars.map((c) => g.measureText(c).width + tracking);
  const span = widths.reduce((a, b) => a + b, 0) / radius; // radians of arc used
  const dir = flip ? -1 : 1;
  let a = (startAngle * Math.PI) / 180 - (dir * span) / 2;
  for (let i = 0; i < chars.length; i++) {
    const half = widths[i] / 2 / radius;
    a += dir * half;
    g.save();
    g.rotate(a);
    g.translate(0, -radius);      // out to the circle, glyph facing outward
    if (flip) g.rotate(Math.PI);  // turn it to face inward instead
    g.fillText(chars[i], 0, 0);
    g.restore();
    a += dir * half;
  }

  if (solid) {
    // keep the rendered ring as an image instead of dusting it
    const img = document.createElement("canvas");
    img.width = img.height = size;
    img.getContext("2d").drawImage(scratch, 0, 0);
    return { points: [], solid: { img, x: cx - R, y: cy - R, w: 2 * R, h: 2 * R }, span };
  }
  return { points: sampleInk(g, size, scale, R, cx, cy, o, o.seed ?? 0x1234), span };
}

// Dotted furniture: rings, a target, a spiral, a wave. Sampled from the maths
// rather than from pixels, so spacing stays even however big it gets.
export function shape(kind, o) {
  const { cx, cy, r = 100, spacing = 7, jitter = 0.6, seed = 0x77, turns = 3, rings = 3 } = o;
  const rnd = rng32(seed);
  const pts = [];
  const ring = (rad) => {
    const n = Math.max(6, Math.round((2 * Math.PI * rad) / spacing));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ((rnd() - 0.5) * spacing * jitter) / rad;
      const rr = rad + (rnd() - 0.5) * spacing * jitter;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  };
  if (kind === "ring") ring(r);
  if (kind === "target") {
    for (let i = 1; i <= rings; i++) ring((r * i) / rings);
    const core = Math.max(2, r * 0.1);
    for (let i = 0; i < Math.round(core * core * 0.9); i++) {
      const a = rnd() * Math.PI * 2, rr = Math.pow(rnd(), 0.5) * core;
      pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
    }
  }
  if (kind === "spiral") {
    const steps = Math.round((Math.PI * 2 * turns * r) / spacing / 1.6);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = t * turns * Math.PI * 2, rr = r * t;
      pts.push([
        cx + Math.cos(a) * rr + (rnd() - 0.5) * spacing * jitter,
        cy + Math.sin(a) * rr + (rnd() - 0.5) * spacing * jitter,
      ]);
    }
  }
  if (kind === "wave") {
    const w = r * 2, steps = Math.round(w / spacing);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push([
        cx - r + w * t + (rnd() - 0.5) * spacing * jitter,
        cy + Math.sin(t * Math.PI * 2 * turns) * r * 0.35 + (rnd() - 0.5) * spacing * jitter,
      ]);
    }
  }
  return pts;
}

// Give raw positions the properties the ink needs: a size, an absorbency, and
// whether this one lands as a ragged blot.
export function makeDots(points, o = {}) {
  const { size = 2.2, sizeVar = 0.5, blotChance = 0.22, mottle = 0.45, mottleScale = 0.012, seed = 0x5a } = o;
  const rnd = rng32(seed);
  return points.map(([x, y]) => ({
    x, y,
    size: size * (1 - sizeVar / 2 + rnd() * sizeVar),
    ink: 1 - mottle * valueNoise(x * mottleScale, y * mottleScale),
    shp: rnd() < blotChance ? Math.floor(rnd() * 16) : -1,
    // where it flies in from, for the assemble animation
    fx: x, fy: y, delay: 0,
  }));
}

const BUCKETS = 6;
export function drawDots(ctx, dots, o = {}) {
  const { ink = "#fff", stamp = true, bleed = 2.6, bleedAlpha = 0.12, alpha = 1 } = o;
  if (!dots.length) return;
  ctx.fillStyle = ink;
  const buckets = Array.from({ length: BUCKETS }, () => []);
  for (const d of dots) {
    const a = Math.max(0, Math.min(1, d.ink * alpha * (d.on ?? 1)));
    if (a <= 0) continue;
    buckets[Math.min(BUCKETS - 1, Math.floor(a * BUCKETS))].push(d);
  }
  if (stamp && bleedAlpha > 0) {
    for (let b = 0; b < BUCKETS; b++) {
      if (!buckets[b].length) continue;
      ctx.globalAlpha = ((b + 0.5) / BUCKETS) * bleedAlpha;
      ctx.beginPath();
      for (const d of buckets[b]) {
        const s = d.size * bleed;
        ctx.rect(d.x - s / 2, d.y - s / 2, s, s);
      }
      ctx.fill();
    }
  }
  const sp = stamp ? stamps(ink) : null;
  for (let b = 0; b < BUCKETS; b++) {
    const bucket = buckets[b];
    if (!bucket.length) continue;
    ctx.globalAlpha = (b + 0.5) / BUCKETS;
    ctx.beginPath();
    for (const d of bucket) {
      if (d.shp >= 0 && sp) continue;
      ctx.rect(d.x - d.size / 2, d.y - d.size / 2, d.size, d.size);
    }
    ctx.fill();
    if (!sp) continue;
    for (const d of bucket) {
      if (d.shp < 0) continue;
      const s = d.size * 2.9;
      ctx.drawImage(sp[d.shp], d.x - s / 2, d.y - s / 2, s, s);
    }
  }
  ctx.globalAlpha = 1;
}

export function drawGrain(ctx, w, h, amount, scale = 2) {
  if (!(amount > 0)) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = amount;
  ctx.scale(scale, scale);
  ctx.fillStyle = ctx.createPattern(paperGrain(), "repeat");
  ctx.fillRect(0, 0, w / scale, h / scale);
  ctx.restore();
}
