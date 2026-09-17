// Leroy — a particulate cursor-motion engine.
//
// The pointer lays down a thin chain. Matter precipitates out of the chain as
// dust, and where the chain crosses itself or slows down a nucleus forms: dust
// in reach condenses onto it into a dense globule with a fuzzy halo. Nuclei
// saturate, chains age out, globules dissolve back into drifting dust.

const CONFIG = {
  palette: { ink: "#141414", bg: "#FFFFFF" },

  // The chain the pointer draws.
  trail: {
    minGap: 4,       // px between chain points (also the interpolation step)
    smoothing: 0.16, // applied once per frame — lower = smoother/laggier
    maxSteps: 40,
  },
  // The chain is the skeleton the dust clings to; `show` only decides whether
  // it is also drawn. Off by default — the trail is the particles.
  spine: { show: false, width: 0.9, hold: 330, out: 190 },

  // Precipitation off the chain.
  emit: {
    perPoint: 13,  // particles shed per new chain point
    ambient: 18,   // particles/frame shed from a random point of the live chain
    spread: 4.2,   // px jitter at birth
    speed: 0.5,    // initial outward speed
    max: 13000,
  },

  // Free-particle behaviour.
  particle: {
    hold: 300,
    out: 220,
    drag: 0.87,
    wander: 0.34,      // brownian kick per frame
    noiseScale: 0.004,
    curl: 0.035,       // coherent drift from the noise field
    spinePull: 0.012,  // spring holding dust in a sleeve around the chain
    tubeR: 5.5,        // rest distance from the chain — the sleeve's radius
    spineReach: 60,
    size: 1.2,
    bigChance: 0.18,
    bigSize: 2,
    trailChance: 0.035, // a few particles leave stray whiskers
    trailLen: 9,
    // Dust settles and then holds still — it is laid down, not simmering. The
    // pointer (with `repel`) is the only thing that wakes it again.
    freezeAfter: 70,   // frames adrift before a free particle sets (0 = never)
    settleFrames: 22,  // frames on a nucleus before packed dust sets
  },

  // Condensation onto nuclei.
  condense: {
    captureR: 110,
    pull: 0.55,
    coreR: 9,        // radius at one captured particle
    maxCoreR: 32,
    capacity: 520,   // past this a nucleus is saturated and captures nothing
    settle: 0.2,     // how hard bound particles hold their shell radius
    jitter: 0.95,
    fuzz: 0.3,       // radial noise on the shell — the soft outer edge
    haloChance: 0.2, // share of captured dust parked outside the core, sparse
    haloR: 2.3,      // how far out, in core radii
    spin: 0.004,
    max: 70,
  },

  // Where nuclei appear.
  nucleate: {
    crossDist: 15,   // self-intersection radius
    crossAgeGap: 70, // frames the two passes must differ by to count as a cross
    minSpacing: 34,  // no two nuclei closer than this
    slowSpeed: 1.8,  // px/frame below which the chain beads up
    slowFrames: 6,
    beadEvery: 22,   // chain points between ambient beads
    beadChance: 0.5,
  },

  // Ink behaviour — dots that soak, blot and sit on a grained ground rather
  // than reading as clean pixels.
  stamp: {
    enabled: true,
    bleed: 2.7,        // soak halo, in dot widths
    bleedAlpha: 0.13,
    mottle: 0.5,       // how much the ground's absorbency varies density
    mottleScale: 0.011,
    blotChance: 0.26,  // share stamped as ragged polygons instead of squares
    blotScale: 1.55,
    pool: 1.25,        // extra weight on dust packed into a globule
    grain: 0.16,       // paper grain laid over the ink (0 = off)
    grainScale: 2,
  },

  // Self-drawing demo path (deterministic).
  auto: { enabled: true, speed: 0.015 },
};

// --- math / noise / rng -----------------------------------------------------
function rng32(seed) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noiseHash(ix, iy) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + 1442695040;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h >>> 0) / 4294967296;
}
function valueNoise(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n00 = noiseHash(x0, y0), n10 = noiseHash(x0 + 1, y0);
  const n01 = noiseHash(x0, y0 + 1), n11 = noiseHash(x0 + 1, y0 + 1);
  const a = n00 + (n10 - n00) * sx, b = n01 + (n11 - n01) * sx;
  return a + (b - a) * sy;
}
function ageAlpha(age, hold, out) {
  if (age <= hold) return 1;
  const t = (age - hold) / out;
  return t >= 1 ? 0 : 1 - t * t * (3 - 2 * t);
}
// Read from CONFIG rather than frozen at load: a page can set hold to Infinity
// to make a trace persist instead of fading.
const particleLife = () => CONFIG.particle.hold + CONFIG.particle.out;
const spineLife = () => CONFIG.spine.hold + CONFIG.spine.out;

// --- spatial grid -----------------------------------------------------------
function buildGrid(items, cell) {
  const grid = new Map();
  for (let i = 0; i < items.length; i++) {
    const k = Math.floor(items[i].y / cell) * 4096 + Math.floor(items[i].x / cell);
    const b = grid.get(k);
    if (b) b.push(i); else grid.set(k, [i]);
  }
  return grid;
}
function nearestIn(px, py, items, grid, cell, maxD2) {
  const cx = Math.floor(px / cell), cy = Math.floor(py / cell);
  let best = -1, bestD = maxD2;
  for (let oy = -1; oy <= 1; oy++)
    for (let ox = -1; ox <= 1; ox++) {
      const b = grid.get((cy + oy) * 4096 + (cx + ox));
      if (!b) continue;
      for (const i of b) {
        const dx = px - items[i].x, dy = py - items[i].y, d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
  return best;
}

// --- rendering --------------------------------------------------------------
const BUCKETS = 6;

// Ink blots, pre-rendered once per colour: a ragged core, a soaked halo and a
// few specks thrown off it. Sprites rather than paths — filling thousands of
// little polygons per frame costs an order of magnitude more.
const STAMP_COUNT = 16;
let stampCache = null, stampKey = "";
function stamps(ink) {
  if (stampCache && stampKey === ink) return stampCache;
  const r = rng32(0x9b7d);
  const N = 32;
  const out = [];
  for (let i = 0; i < STAMP_COUNT; i++) {
    const c = document.createElement("canvas");
    c.width = c.height = N;
    const g = c.getContext("2d");
    g.fillStyle = ink;
    g.beginPath();
    const n = 6 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (r() - 0.5) * 0.6;
      const rad = (0.2 + r() * 0.15) * N;
      const x = N / 2 + Math.cos(a) * rad, y = N / 2 + Math.sin(a) * rad;
      if (k) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
    g.fill();
    g.globalAlpha = 0.4; // the soak around the blot
    g.filter = `blur(${N * 0.1}px)`;
    g.drawImage(c, 0, 0);
    g.filter = "none";
    for (let k = 0; k < 5; k++) { // specks thrown off the edge
      const a = r() * Math.PI * 2, rad = (0.28 + r() * 0.18) * N;
      g.globalAlpha = 0.55 * r();
      const sz = 1 + r() * 2;
      g.fillRect(N / 2 + Math.cos(a) * rad, N / 2 + Math.sin(a) * rad, sz, sz);
    }
    g.globalAlpha = 1;
    out.push(c);
  }
  stampCache = out;
  stampKey = ink;
  return out;
}

let grainTile = null;
function paperGrain() {
  if (grainTile) return grainTile;
  const n = 128;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d");
  const img = g.createImageData(n, n);
  const r = rng32(0x51ce);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r();
    const fleck = v > 0.965 ? 1 : 0; // the odd dark speck in the stock
    img.data[i] = img.data[i + 1] = img.data[i + 2] = fleck ? 0 : 255 * v;
    img.data[i + 3] = fleck ? 90 : 26 * v;
  }
  g.putImageData(img, 0, 0);
  grainTile = c;
  return c;
}

function drawDust(ctx, s) {
  const S = CONFIG.stamp;
  const dots = Array.from({ length: BUCKETS }, () => []);
  for (const p of s.parts) {
    let a = ageAlpha(s.frame - p.born, CONFIG.particle.hold, CONFIG.particle.out);
    if (a <= 0) continue;
    if (S.enabled) a *= p.ink * (p.nuc ? S.pool : 1);
    dots[Math.max(0, Math.min(BUCKETS - 1, Math.floor(a * BUCKETS)))].push(p);
  }

  // the soak first, so the cores sit on top of their own halos
  if (S.enabled && S.bleedAlpha > 0) {
    for (let b = 0; b < BUCKETS; b++) {
      const bucket = dots[b];
      if (!bucket.length) continue;
      ctx.globalAlpha = ((b + 0.5) / BUCKETS) * S.bleedAlpha;
      ctx.beginPath();
      for (const p of bucket) {
        const sz = p.size * S.bleed;
        ctx.rect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
      }
      ctx.fill();
    }
  }

  const sp = S.enabled ? stamps(CONFIG.palette.ink) : null;
  for (let b = 0; b < BUCKETS; b++) {
    const bucket = dots[b];
    if (!bucket.length) continue;
    ctx.globalAlpha = ((b + 0.5) / BUCKETS) * 0.92;
    ctx.beginPath();
    for (const p of bucket) {
      if (p.shp >= 0 && sp) continue; // blots are stamped, not filled
      ctx.rect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
    }
    ctx.fill();
    if (!sp) continue;
    for (const p of bucket) {
      if (p.shp < 0) continue;
      const sz = p.size * S.blotScale * 2.6;
      ctx.drawImage(sp[p.shp], p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
    }
  }
}

function paint(ctx, dpr, w, h, s) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (CONFIG.palette.bg) {
    ctx.fillStyle = CONFIG.palette.bg;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.clearRect(0, 0, w, h); // let whatever is behind the canvas show through
  }
  ctx.fillStyle = CONFIG.palette.ink;
  ctx.strokeStyle = CONFIG.palette.ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // the chain, segment alpha bucketed by age
  const spine = s.spine;
  if (CONFIG.spine.show && spine.length > 1) {
    ctx.lineWidth = CONFIG.spine.width;
    const paths = Array.from({ length: BUCKETS }, () => []);
    for (let i = 1; i < spine.length; i++) {
      if (spine[i].brk) continue; // pen-up: no segment joins these two
      const a = ageAlpha(s.frame - spine[i - 1].born, CONFIG.spine.hold, CONFIG.spine.out);
      if (a <= 0) continue;
      const b = Math.min(BUCKETS - 1, Math.floor(a * BUCKETS));
      paths[b].push(spine[i - 1], spine[i]);
    }
    for (let b = 0; b < BUCKETS; b++) {
      const seg = paths[b];
      if (!seg.length) continue;
      ctx.globalAlpha = (b + 0.5) / BUCKETS;
      ctx.beginPath();
      for (let i = 0; i < seg.length; i += 2) {
        ctx.moveTo(seg[i].x, seg[i].y);
        ctx.lineTo(seg[i + 1].x, seg[i + 1].y);
      }
      ctx.stroke();
    }
  }

  // whiskers — the stray hairlines a few free particles drag behind them
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  let anyWhisker = false;
  for (const p of s.parts) {
    if (!p.trail || p.trail.length < 4) continue;
    const a = ageAlpha(s.frame - p.born, CONFIG.particle.hold, CONFIG.particle.out);
    if (a < 0.35) continue;
    anyWhisker = true;
    ctx.moveTo(p.trail[0], p.trail[1]);
    for (let i = 2; i < p.trail.length; i += 2) ctx.lineTo(p.trail[i], p.trail[i + 1]);
  }
  if (anyWhisker) ctx.stroke();

  drawDust(ctx, s);

  // grain over the ink only — source-atop keeps it off bare ground
  if (CONFIG.stamp.enabled && CONFIG.stamp.grain > 0) {
    const g = CONFIG.stamp.grainScale;
    ctx.globalCompositeOperation = "source-atop";
    ctx.globalAlpha = CONFIG.stamp.grain;
    ctx.scale(g, g);
    ctx.fillStyle = ctx.createPattern(paperGrain(), "repeat");
    ctx.fillRect(0, 0, w / g, h / g);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
  }
  ctx.globalAlpha = 1;
}

// --- mount ------------------------------------------------------------------
export function mountLeroyCursor(canvas, opts = {}) {
  const ctx = canvas.getContext("2d");
  const s = {
    spine: [],
    parts: [],
    nuclei: [],
    nucSeq: 1,
    smooth: null,
    raw: null,
    last: null,
    speed: 0,
    slowRun: 0,
    spineCount: 0,
    rng: rng32(0x5eed10),
    w: 0, h: 0, frame: 0,
    auto: opts.auto ?? CONFIG.auto.enabled,
    autoT: 0,
    // A driver traces a path instead of the pointer: driver(frame) returns
    // {x, y, penUp} while it still has something to lay down, else null.
    driver: opts.driver ?? null,
    smoothing: opts.smoothing ?? null, // 1 = track the driver exactly
    pointer: null,                     // last real pointer position, for repel
  };
  const ratio = () => opts.pixelRatio ?? window.devicePixelRatio ?? 1;

  function resize() {
    const dpr = ratio();
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    // Setting width/height wipes the canvas, and the observer also fires for
    // sizes that did not change — so bail out unless it really did.
    if (canvas.width === cw && canvas.height === ch && s.w === w && s.h === h) return;
    canvas.width = cw;
    canvas.height = ch;
    s.w = w; s.h = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (CONFIG.palette.bg) {
      ctx.fillStyle = CONFIG.palette.bg;
      ctx.fillRect(0, 0, w, h);
    }
  }
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  // --- nucleation -----------------------------------------------------------
  function addNucleus(x, y) {
    const { minSpacing, } = CONFIG.nucleate;
    const min2 = minSpacing * minSpacing;
    for (const n of s.nuclei) {
      const dx = n.x - x, dy = n.y - y;
      if (dx * dx + dy * dy < min2) return false;
    }
    if (s.nuclei.length >= CONFIG.condense.max) s.nuclei.shift();
    s.nuclei.push({
      id: s.nucSeq++,
      x, y,
      born: s.frame,
      count: 0,
      coreR: CONFIG.condense.coreR,
      phase: s.rng() * Math.PI * 2,
    });
    return true;
  }

  function checkNucleation(x, y) {
    const { crossDist, crossAgeGap, beadEvery, beadChance, slowSpeed, slowFrames } =
      CONFIG.nucleate;
    // self-intersection: an older pass of the chain sitting under this point
    const cross2 = crossDist * crossDist;
    for (let i = s.spine.length - 1; i >= 0; i--) {
      const p = s.spine[i];
      if (s.frame - p.born < crossAgeGap) continue;
      const dx = p.x - x, dy = p.y - y;
      if (dx * dx + dy * dy < cross2) {
        addNucleus((p.x + x) * 0.5, (p.y + y) * 0.5);
        break;
      }
    }
    // dwell: the pointer lingering lets the chain bead up where it stalls
    if (s.speed < slowSpeed) {
      s.slowRun++;
      if (s.slowRun >= slowFrames) { addNucleus(x, y); s.slowRun = 0; }
    } else s.slowRun = 0;
    // ambient beads so a fast clean stroke still gets some structure
    if (s.spineCount % beadEvery === 0 && s.rng() < beadChance) addNucleus(x, y);
  }

  // --- emission -------------------------------------------------------------
  function shed(x, y, heading, n) {
    const { spread, speed, max } = CONFIG.emit;
    const P = CONFIG.particle;
    for (let i = 0; i < n; i++) {
      // At the cap, recycle the oldest dust rather than refusing to shed — so a
      // trace that never fades (a persisting one) still keeps laying down new
      // ground instead of starving everything after the first stretch.
      const recycle = s.parts.length >= max;
      if (recycle && s.frame - s.parts[0].born < 2) return;
      const a = heading + Math.PI * 0.5 * (s.rng() < 0.5 ? 1 : -1) + (s.rng() - 0.5) * 1.6;
      const r = s.rng() * spread;
      const big = s.rng() < P.bigChance;
      const S = CONFIG.stamp;
      const born = {
        // how well the ground takes ink here, and which ragged stamp it makes
        ink: S.enabled ? 1 - S.mottle * valueNoise(x * S.mottleScale, y * S.mottleScale) : 1,
        shp: S.enabled && s.rng() < S.blotChance ? Math.floor(s.rng() * STAMP_COUNT) : -1,
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: Math.cos(a) * speed * s.rng(),
        vy: Math.sin(a) * speed * s.rng(),
        born: s.frame,
        size: big ? P.bigSize : P.size * (0.75 + s.rng() * 0.5),
        nuc: 0,
        bindAt: 0,
        fixed: false,
        rq: 0,
        pa: 0,
        trail: s.rng() < P.trailChance ? [] : null,
      };
      if (recycle) {
        s.parts.shift();
        s.parts.push(born);
      } else s.parts.push(born);
    }
  }

  // The live chain keeps precipitating, not just its growing tip — that is what
  // lets dust accumulate where the pointer has already been.
  function shedAmbient() {
    const n = s.spine.length;
    if (n < 2) return;
    for (let i = 0; i < CONFIG.emit.ambient; i++) {
      if (s.parts.length >= CONFIG.emit.max) return;
      const idx = 1 + Math.floor(s.rng() * (n - 1));
      const a = s.spine[idx], b = s.spine[idx - 1];
      shed(a.x, a.y, Math.atan2(a.y - b.y, a.x - b.x), 1);
    }
  }

  function feedPointer(rawX, rawY, penUp) {
    if (penUp) {
      // lift the pen: start a fresh stroke here, with no segment joining back
      s.smooth = { x: rawX, y: rawY };
      s.last = { x: rawX, y: rawY };
      s.spineCount++;
      s.spine.push({ x: rawX, y: rawY, born: s.frame, brk: true });
      return;
    }
    const sm = s.smoothing ?? CONFIG.trail.smoothing;
    if (!s.smooth) s.smooth = { x: rawX, y: rawY };
    else
      s.smooth = {
        x: s.smooth.x + (rawX - s.smooth.x) * sm,
        y: s.smooth.y + (rawY - s.smooth.y) * sm,
      };
    const cx = s.smooth.x, cy = s.smooth.y;

    if (!s.last) {
      s.spine.push({ x: cx, y: cy, born: s.frame });
      s.last = { x: cx, y: cy };
      s.spineCount++;
      return;
    }
    const dx = cx - s.last.x, dy = cy - s.last.y, gap = Math.hypot(dx, dy);
    s.speed = s.speed * 0.8 + gap * 0.2;
    if (gap < CONFIG.trail.minGap) {
      // still dwelling — the chain does not advance but it can still nucleate
      checkNucleation(s.last.x, s.last.y);
      return;
    }
    const heading = Math.atan2(dy, dx);
    const steps = Math.min(CONFIG.trail.maxSteps, Math.floor(gap / CONFIG.trail.minGap));
    const x0 = s.last.x, y0 = s.last.y;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const px = x0 + dx * t, py = y0 + dy * t;
      s.spineCount++;
      checkNucleation(px, py);
      s.spine.push({ x: px, y: py, born: s.frame });
      shed(px, py, heading, CONFIG.emit.perPoint);
    }
    s.last = { x: s.spine[s.spine.length - 1].x, y: s.spine[s.spine.length - 1].y };
  }

  // --- simulation -----------------------------------------------------------
  function step() {
    const P = CONFIG.particle, C = CONFIG.condense;
    // The pointer shoves dust around: free dust is pushed out of the way and
    // packed dust is knocked off its nucleus, to drift and re-condense.
    const rep = opts.repel;
    const pt = rep && s.pointer;
    const repR2 = rep ? rep.radius * rep.radius : 0;

    // nuclei age out; their globules dissolve back into dust
    const nucLife = particleLife() * 0.95;
    s.nuclei = s.nuclei.filter((n) => s.frame - n.born <= nucLife);
    const byId = new Map();
    for (const n of s.nuclei) { n.count = 0; byId.set(n.id, n); }

    const nucGrid = buildGrid(s.nuclei, Math.max(16, C.captureR));
    const spineGrid = buildGrid(s.spine, Math.max(16, P.spineReach));
    const capture2 = C.captureR * C.captureR;
    const reach2 = P.spineReach * P.spineReach;

    for (const p of s.parts) {
      let nuc = p.nuc ? byId.get(p.nuc) : undefined;
      if (!nuc && p.nuc) { // its nucleus dissolved — kick it loose
        p.nuc = 0;
        p.fixed = false;
        p.vx += (s.rng() - 0.5) * 1.2;
        p.vy += (s.rng() - 0.5) * 1.2;
      }

      if (p.fixed) {
        // set: it still counts toward its globule, but nothing moves it until
        // the pointer comes through
        if (nuc) nuc.count++;
        if (!pt) continue;
        const dx = p.x - pt.x, dy = p.y - pt.y;
        if (dx * dx + dy * dy >= repR2) continue;
        p.fixed = false;
      }

      if (pt) {
        const dx = p.x - pt.x, dy = p.y - pt.y, d2 = dx * dx + dy * dy;
        if (d2 < repR2) {
          const d = Math.sqrt(d2) || 1;
          const f = rep.strength * (1 - d / rep.radius);
          if (nuc && d < rep.radius * 0.6) { p.nuc = 0; nuc = undefined; }
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
          if (nuc) { // shoved but still held — move it directly, it is pinned
            p.x += (dx / d) * f * 0.6;
            p.y += (dy / d) * f * 0.6;
          }
        }
      }

      let inReach = false;
      if (nuc) {
        // bound: hold a noisy shell radius, which grows as the globule packs
        nuc.count++;
        p.pa += C.spin + (s.rng() - 0.5) * 0.05;
        const fz = 1 + (valueNoise(p.x * 0.05, p.y * 0.05) - 0.5) * 2 * C.fuzz;
        const tr = nuc.coreR * p.rq * fz;
        const tx = nuc.x + Math.cos(p.pa) * tr;
        const ty = nuc.y + Math.sin(p.pa) * tr;
        p.x += (tx - p.x) * C.settle + (s.rng() - 0.5) * C.jitter;
        p.y += (ty - p.y) * C.settle + (s.rng() - 0.5) * C.jitter;
        p.vx = p.vy = 0;
      } else {
        // free: brownian + curl drift + a weak pull back onto the chain
        const ni = nearestIn(p.x, p.y, s.nuclei, nucGrid, Math.max(16, C.captureR), capture2);
        inReach = ni >= 0;
        if (ni >= 0) {
          const n = s.nuclei[ni];
          const dx = n.x - p.x, dy = n.y - p.y, d = Math.hypot(dx, dy) || 1;
          if (d < n.coreR * 1.3 && n.count < C.capacity) {
            p.nuc = n.id;
            p.bindAt = s.frame;
            // most of it packs into the core; the rest hangs in a loose corona
            p.rq =
              s.rng() < C.haloChance
                ? 1 + s.rng() * (C.haloR - 1)
                : Math.pow(s.rng(), 0.55);
            p.pa = Math.atan2(-dy, -dx);
            n.count++;
            continue;
          }
          const grip = n.count < C.capacity ? 1 : 0.25;
          const f = C.pull * grip * (1 - d / C.captureR);
          p.vx += (dx / d) * f;
          p.vy += (dy / d) * f;
        } else {
          const si = nearestIn(p.x, p.y, s.spine, spineGrid, Math.max(16, P.spineReach), reach2);
          if (si >= 0) {
            const sp = s.spine[si];
            const dx = sp.x - p.x, dy = sp.y - p.y, d = Math.hypot(dx, dy) || 1;
            if (d > P.tubeR) {
              const f = P.spinePull * (d - P.tubeR);
              p.vx += (dx / d) * f;
              p.vy += (dy / d) * f;
            }
          }
        }
        const nz = valueNoise(p.x * P.noiseScale, p.y * P.noiseScale) * Math.PI * 4;
        p.vx += Math.cos(nz) * P.curl + (s.rng() - 0.5) * P.wander;
        p.vy += Math.sin(nz) * P.curl + (s.rng() - 0.5) * P.wander;
        p.vx *= P.drag;
        p.vy *= P.drag;
        p.x += p.vx;
        p.y += p.vy;
      }

      if (p.trail) {
        p.trail.push(p.x, p.y);
        if (p.trail.length > P.trailLen * 2) p.trail.splice(0, 2);
      }

      // settle, once it has had time to find its place — but dust still within
      // reach of a nucleus stays awake, or it would set before it condenses
      if (P.freezeAfter > 0) {
        p.fixed = p.nuc
          ? s.frame - p.bindAt >= P.settleFrames
          : !inReach && s.frame - p.born >= P.freezeAfter;
      }
    }

    // globule radius follows how much has packed onto it
    for (const n of s.nuclei) {
      const fill = Math.min(1, n.count / C.capacity);
      n.coreR = Math.min(C.maxCoreR, C.coreR + (C.maxCoreR - C.coreR) * Math.sqrt(fill));
    }

    // cull
    s.parts = s.parts.filter(
      (p) =>
        s.frame - p.born <= particleLife() &&
        p.x > -40 && p.x < s.w + 40 && p.y > -40 && p.y < s.h + 40,
    );
    let cut = 0;
    while (cut < s.spine.length && s.frame - s.spine[cut].born > spineLife()) cut++;
    if (cut) s.spine.splice(0, cut);
  }

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (s.w === 0) return;
    const dpr = ratio();
    s.frame++;

    if (s.driver) {
      const p = s.driver(s.frame);
      if (p) feedPointer(p.x, p.y, p.penUp);
      s.raw = null; // the driver feeds directly; nothing to replay below
    } else if (s.auto) {
      const t = s.autoT;
      s.raw = {
        x: s.w * 0.5 + Math.cos(t) * s.w * 0.27 + Math.cos(t * 2.7 + 0.9) * s.w * 0.1,
        y: s.h * 0.5 + Math.sin(t * 1.5) * s.h * 0.29 + Math.sin(t * 2.1 + 2) * s.h * 0.09,
      };
      // the demo path breathes — it stalls at the turns, so it beads there
      s.autoT += CONFIG.auto.speed * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 0.55)));
    }
    if (s.raw) feedPointer(s.raw.x, s.raw.y);
    shedAmbient();

    step();
    paint(ctx, dpr, s.w, s.h, s);
  };
  raf = requestAnimationFrame(tick);

  // getBoundingClientRect forces a layout flush, and pointer events can arrive
  // several times a frame — so read it at most once per frame.
  let rectCache = null, rectFrame = -1;
  const rel = (clientX, clientY) => {
    if (rectFrame !== s.frame || !rectCache) {
      rectCache = canvas.getBoundingClientRect();
      rectFrame = s.frame;
    }
    const r = rectCache;
    // the canvas may be CSS-scaled (the poster is), so map back to its own space
    const sx = canvas.clientWidth / (r.width || 1);
    const sy = canvas.clientHeight / (r.height || 1);
    const p = { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
    s.pointer = p;
    if (!s.auto && !s.driver) s.raw = p;
  };
  const onMove = (e) => rel(e.clientX, e.clientY);
  const onTouch = (e) => { if (e.touches[0]) rel(e.touches[0].clientX, e.touches[0].clientY); };
  const onLeave = () => { s.pointer = null; };
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("touchmove", onTouch, { passive: true });
  canvas.addEventListener("mouseleave", onLeave);

  function reset() {
    s.spine = [];
    s.parts = [];
    s.nuclei = [];
    s.smooth = null;
    s.raw = null;
    s.last = null;
    s.speed = 0;
    s.slowRun = 0;
    s.spineCount = 0;
  }

  return {
    clear() {
      reset();
      s.autoT = 0;
      s.rng = rng32((Date.now() & 0x7fffffff) >>> 0);
      const dpr = ratio();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, s.w, s.h);
      if (CONFIG.palette.bg) {
        ctx.fillStyle = CONFIG.palette.bg;
        ctx.fillRect(0, 0, s.w, s.h);
      }
    },
    setDriver(fn) {
      s.driver = fn || null;
    },
    setAuto(v) {
      s.auto = !!v;
      s.smooth = null;
      s.raw = null;
      s.last = null;
    },
    stats: () => ({ particles: s.parts.length, nuclei: s.nuclei.length, chain: s.spine.length }),
    // internals, for dev/frame-shot.html and tuning
    debug: () => s,
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("touchmove", onTouch);
      canvas.removeEventListener("mouseleave", onLeave);
    },
  };
}

export { CONFIG };
