// An Art Nouveau frame, as strokes for the Leroy engine to trace.
//
// Each ribbon is a rounded rectangle pushed in and out along its own normal by
// a cosine — even lobe counts keep it symmetric about both axes. Two ribbons in
// counter-phase weave through each other, and every place they cross is a place
// the engine will bead up, which is where this kind of ornament wants its nodes
// anyway. Corner spirals and a palmette at the head and foot finish it.

function roundedRect(x0, y0, x1, y1, r, steps = 900) {
  const seg = [];
  const arc = (cx, cy, a0, a1) => {
    const n = Math.max(2, Math.round((steps * Math.abs(a1 - a0) * r) / 8 / Math.PI));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      seg.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  const line = (ax, ay, bx, by) => {
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, by - ay) / 3));
    for (let i = 1; i <= n; i++) seg.push([ax + (bx - ax) * (i / n), ay + (by - ay) * (i / n)]);
  };
  // start at top centre, run clockwise, so u = 0 sits on the axis of symmetry
  const xm = (x0 + x1) / 2;
  seg.push([xm, y0]);
  line(xm, y0, x1 - r, y0);
  arc(x1 - r, y0 + r, -Math.PI / 2, 0);
  line(x1, y0 + r, x1, y1 - r);
  arc(x1 - r, y1 - r, 0, Math.PI / 2);
  line(x1 - r, y1, x0 + r, y1);
  arc(x0 + r, y1 - r, Math.PI / 2, Math.PI);
  line(x0, y1 - r, x0, y0 + r);
  arc(x0 + r, y0 + r, Math.PI, Math.PI * 1.5);
  line(x0 + r, y0, xm, y0);
  return seg;
}

function resample(pts, n) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++)
    cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = (i / n) * total;
    while (j < cum.length - 2 && cum[j + 1] < d) j++;
    const t = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([
      pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t,
      pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t,
    ]);
  }
  return out;
}

// push a closed loop along its own normal: amp * cos(2π·lobes·u + phase)
function undulate(loop, amp, lobes, phase, skew = 0) {
  const n = loop.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const a = loop[(i - 1 + n) % n], b = loop[(i + 1) % n];
    const tx = b[0] - a[0], ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len, ny = tx / len;
    const w = Math.cos(2 * Math.PI * lobes * u + phase);
    const d = amp * (w + skew * Math.cos(4 * Math.PI * lobes * u + phase));
    out.push([loop[i][0] + nx * d, loop[i][1] + ny * d]);
  }
  out.push(out[0]);
  return out;
}

function spiral(cx, cy, r0, r1, a0, turns, dir = 1, steps = 120) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + dir * turns * Math.PI * 2 * t;
    const r = r0 + (r1 - r0) * t;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

// a teardrop palmette, pointing along `dir` (1 = down, -1 = up)
function palmette(cx, cy, w, h, dir, steps = 140) {
  const out = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const s = Math.sin(t / 2);
    out.push([cx + Math.cos(t) * w * s, cy + dir * (h * (1 - Math.cos(t)) * 0.5)]);
  }
  return out;
}

export function artNouveauFrame(w, h, o = {}) {
  const inset = o.inset ?? Math.min(w, h) * 0.075;
  const r = o.radius ?? Math.min(w, h) * 0.2;
  const lobes = o.lobes ?? 8;          // even keeps it symmetric on both axes
  const amp = o.amp ?? Math.min(w, h) * 0.055;
  const x0 = inset, y0 = inset, x1 = w - inset, y1 = h - inset;

  const base = resample(roundedRect(x0, y0, x1, y1, r), o.samples ?? 1400);
  const strokes = [
    undulate(base, amp, lobes, 0, 0.18),
    undulate(base, -amp * 0.92, lobes, 0, -0.14),
    undulate(base, amp * 0.3, lobes * 2, Math.PI, 0),
  ];

  // corner spirals, curling in toward the middle of the frame
  const cs = Math.min(w, h) * 0.075;
  const corners = [
    [x0 + r * 0.42, y0 + r * 0.42, Math.PI * 1.25],
    [x1 - r * 0.42, y0 + r * 0.42, Math.PI * 1.75],
    [x1 - r * 0.42, y1 - r * 0.42, Math.PI * 0.25],
    [x0 + r * 0.42, y1 - r * 0.42, Math.PI * 0.75],
  ];
  for (const [cx, cy, a] of corners) {
    strokes.push(spiral(cx, cy, cs * 1.5, cs * 0.12, a, 1.15, 1));
    strokes.push(spiral(cx, cy, cs * 1.5, cs * 0.12, a, 1.15, -1));
  }

  // head and foot flourishes on the axis of symmetry
  const pw = Math.min(w, h) * 0.055, ph = Math.min(w, h) * 0.085;
  const xm = (x0 + x1) / 2;
  strokes.push(palmette(xm, y0 + amp * 0.2, pw, ph, 1));
  strokes.push(palmette(xm, y1 - amp * 0.2, pw, ph, -1));
  for (const side of [-1, 1]) {
    strokes.push(spiral(xm + side * pw * 2.1, y0 + ph * 0.5, pw * 1.25, pw * 0.1, side > 0 ? 0 : Math.PI, 0.85, side));
    strokes.push(spiral(xm + side * pw * 2.1, y1 - ph * 0.5, pw * 1.25, pw * 0.1, side > 0 ? 0 : Math.PI, 0.85, -side));
  }
  return strokes;
}

// Walks a list of strokes at a fixed speed, lifting the pen between them, and
// returns null once the whole ornament has been laid down.
export function strokeDriver(strokes, speed = 5) {
  let si = 0, along = 0, done = false;
  const lens = strokes.map((pts) => {
    const cum = [0];
    for (let i = 1; i < pts.length; i++)
      cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return cum;
  });
  return () => {
    if (done) return null;
    const pts = strokes[si], cum = lens[si], total = cum[cum.length - 1];
    const fresh = along === 0;
    let j = 0;
    while (j < cum.length - 2 && cum[j + 1] < along) j++;
    const t = (along - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const p = {
      x: pts[j][0] + (pts[j + 1][0] - pts[j][0]) * t,
      y: pts[j][1] + (pts[j + 1][1] - pts[j][1]) * t,
      penUp: fresh,
    };
    along += speed;
    if (along > total) {
      along = 0;
      si++;
      if (si >= strokes.length) done = true;
    }
    return p;
  };
}
