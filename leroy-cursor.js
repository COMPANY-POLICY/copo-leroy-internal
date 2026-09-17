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
  spine: { width: 0.9, hold: 330, out: 190 },

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
const PARTICLE_LIFE = CONFIG.particle.hold + CONFIG.particle.out;
const SPINE_LIFE = CONFIG.spine.hold + CONFIG.spine.out;

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

function paint(ctx, dpr, w, h, s) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = CONFIG.palette.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = CONFIG.palette.ink;
  ctx.strokeStyle = CONFIG.palette.ink;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // the chain, segment alpha bucketed by age
  const spine = s.spine;
  if (spine.length > 1) {
    ctx.lineWidth = CONFIG.spine.width;
    const paths = Array.from({ length: BUCKETS }, () => []);
    for (let i = 1; i < spine.length; i++) {
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

  // the dust itself — one filled path per alpha bucket
  const dots = Array.from({ length: BUCKETS }, () => []);
  for (const p of s.parts) {
    const a = ageAlpha(s.frame - p.born, CONFIG.particle.hold, CONFIG.particle.out);
    if (a <= 0) continue;
    dots[Math.min(BUCKETS - 1, Math.floor(a * BUCKETS))].push(p);
  }
  for (let b = 0; b < BUCKETS; b++) {
    const bucket = dots[b];
    if (!bucket.length) continue;
    ctx.globalAlpha = ((b + 0.5) / BUCKETS) * 0.92;
    ctx.beginPath();
    for (const p of bucket) {
      const sz = p.size;
      ctx.rect(p.x - sz * 0.5, p.y - sz * 0.5, sz, sz);
    }
    ctx.fill();
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
  };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    s.w = w; s.h = h;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = CONFIG.palette.bg;
    ctx.fillRect(0, 0, w, h);
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
      if (s.parts.length >= max) return;
      const a = heading + Math.PI * 0.5 * (s.rng() < 0.5 ? 1 : -1) + (s.rng() - 0.5) * 1.6;
      const r = s.rng() * spread;
      const big = s.rng() < P.bigChance;
      s.parts.push({
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        vx: Math.cos(a) * speed * s.rng(),
        vy: Math.sin(a) * speed * s.rng(),
        born: s.frame,
        size: big ? P.bigSize : P.size * (0.75 + s.rng() * 0.5),
        nuc: 0,
        rq: 0,
        pa: 0,
        trail: s.rng() < P.trailChance ? [] : null,
      });
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

  function feedPointer(rawX, rawY) {
    if (!s.smooth) s.smooth = { x: rawX, y: rawY };
    else
      s.smooth = {
        x: s.smooth.x + (rawX - s.smooth.x) * CONFIG.trail.smoothing,
        y: s.smooth.y + (rawY - s.smooth.y) * CONFIG.trail.smoothing,
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

    // nuclei age out; their globules dissolve back into dust
    const nucLife = PARTICLE_LIFE * 0.95;
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
        p.vx += (s.rng() - 0.5) * 1.2;
        p.vy += (s.rng() - 0.5) * 1.2;
      }

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
        if (ni >= 0) {
          const n = s.nuclei[ni];
          const dx = n.x - p.x, dy = n.y - p.y, d = Math.hypot(dx, dy) || 1;
          if (d < n.coreR * 1.3 && n.count < C.capacity) {
            p.nuc = n.id;
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
    }

    // globule radius follows how much has packed onto it
    for (const n of s.nuclei) {
      const fill = Math.min(1, n.count / C.capacity);
      n.coreR = Math.min(C.maxCoreR, C.coreR + (C.maxCoreR - C.coreR) * Math.sqrt(fill));
    }

    // cull
    s.parts = s.parts.filter(
      (p) =>
        s.frame - p.born <= PARTICLE_LIFE &&
        p.x > -40 && p.x < s.w + 40 && p.y > -40 && p.y < s.h + 40,
    );
    let cut = 0;
    while (cut < s.spine.length && s.frame - s.spine[cut].born > SPINE_LIFE) cut++;
    if (cut) s.spine.splice(0, cut);
  }

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    if (s.w === 0) return;
    const dpr = window.devicePixelRatio || 1;
    s.frame++;

    if (s.auto) {
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

  const rel = (clientX, clientY) => {
    const r = canvas.getBoundingClientRect();
    s.raw = { x: clientX - r.left, y: clientY - r.top };
  };
  const onMove = (e) => { if (!s.auto) rel(e.clientX, e.clientY); };
  const onTouch = (e) => { if (!s.auto && e.touches[0]) rel(e.touches[0].clientX, e.touches[0].clientY); };
  canvas.addEventListener("mousemove", onMove);
  canvas.addEventListener("touchmove", onTouch, { passive: true });

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
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = CONFIG.palette.bg;
      ctx.fillRect(0, 0, s.w, s.h);
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
    },
  };
}

export { CONFIG };
