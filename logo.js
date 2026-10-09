// ARCHADIA Particulate, as the panel's Logo tab: a word or a piece of artwork
// turned to particles blown along a curl-noise field, then stippled into dots.
// Brought over from archadia-particulate.html with its drawing untouched — only
// the ids are prefixed and the preview fits the stage. Imported the first time
// the tab opens, since a render at full particle count takes a moment.

// Every control and the canvas carry an lg- prefix in the page, so this
// tool's ids (seed, grain, ink…) cannot collide with the lace's.
const $ = id => document.getElementById('lg-' + id);
const cv = $('c'), ctx = cv.getContext('2d', {willReadFrequently:true});

/* ---------- noise ---------- */
let SEED = 1;
function hash(x, y){
  let h = Math.imul(x|0, 374761393) + Math.imul(y|0, 668265263) + Math.imul(SEED, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, y){
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf*xf*(3-2*xf), v = yf*yf*(3-2*yf);
  const a = hash(xi,yi), b = hash(xi+1,yi), c = hash(xi,yi+1), d = hash(xi+1,yi+1);
  return (a*(1-u)+b*u)*(1-v) + (c*(1-u)+d*u)*v;
}
function fbm(x,y){
  return vnoise(x,y)*0.55 + vnoise(x*2.03,y*2.03)*0.28 + vnoise(x*4.11,y*4.11)*0.17;
}
let rs = 1;
function rnd(){ rs ^= rs<<13; rs ^= rs>>>17; rs ^= rs<<5; return ((rs>>>0)/4294967296); }

/* ---------- state ---------- */
let LAST = null;
let IMG  = null;   // artwork used instead of typed letters

function loadImage(url, name){
  const im = new Image();
  im.onload  = () => { IMG = im; $('src').value = 'image'; logoRows(); go(); };
  im.onerror = () => console.warn('could not load image', name || url);
  im.src = url;
}

/* ---------- type setting ---------- */
// one size for the whole word, from the tallest ink in it, so a lowercase
// letter stays lowercase instead of being stretched to cap height
function fitWord(gx, word, fam, boxH, fill){
  gx.font = `100px "${fam}"`;
  let asc = 0, desc = 0;
  for(const ch of word){
    if(/\s/.test(ch)) continue;
    const m = gx.measureText(ch);
    asc  = Math.max(asc,  m.actualBoundingBoxAscent);
    desc = Math.max(desc, m.actualBoundingBoxDescent);
  }
  const h = Math.max(1, asc + desc);
  const fs = 100 * (boxH * fill) / h;
  return { fs, mid: (asc - desc)/2 * fs/100 };
}
function drawGlyph(gx, ch, fam, fit, cx, cy, wide, align){
  gx.font = `${fit.fs}px "${fam}"`;
  const m = gx.measureText(ch);
  const L = m.actualBoundingBoxLeft, R = m.actualBoundingBoxRight;   // ink spans [-L, R]
  const dx = align === 'center' ? -(R - L)/2
           : align === 'left'   ? L
           :                      -R;
  gx.save();
  gx.translate(cx, cy + fit.mid);          // shared baseline across every letter
  gx.scale(wide, 1);
  gx.textAlign = 'left'; gx.textBaseline = 'alphabetic';
  gx.fillText(ch, dx, 0);
  gx.restore();
}
// pen placement: advance widths, the way type actually sets
function drawGlyphPen(gx, ch, fam, fit, penX, cy, wide){
  gx.font = `${fit.fs}px "${fam}"`;
  gx.save();
  gx.translate(penX, cy + fit.mid);
  gx.scale(wide, 1);
  gx.textAlign = 'left'; gx.textBaseline = 'alphabetic';
  gx.fillText(ch, 0, 0);
  gx.restore();
}
function advances(gx, word, fam, fit, wide, track){
  gx.font = `${fit.fs}px "${fam}"`;
  const adv = [];
  let total = 0;
  for(let i=0;i<word.length;i++){
    const a = gx.measureText(word[i]).width * wide;
    adv.push(a); total += a;
  }
  total += track * Math.max(0, word.length-1);
  return {adv, total};
}

// Takes the inked area of `from` (type set somewhere roomy), scales it down
// (never up) to sit inside the margins of gx, and places it there: centred on
// the height, across by the alignment, then shifted by (sx, sy).
function fitInk(from, gx, W, H, mx, my, align, sx = 0, sy = 0){
  const FW = from.width, FH = from.height;
  const d = from.getContext('2d').getImageData(0,0,FW,FH).data;
  let x0 = FW, y0 = FH, x1 = -1, y1 = -1;
  for(let y=0;y<FH;y++){
    for(let x=0,q=y*FW*4;x<FW;x++,q+=4){
      if(d[q] >= 128) continue;                   // black type on white
      if(x < x0) x0 = x; if(x > x1) x1 = x;
      if(y < y0) y0 = y; if(y > y1) y1 = y;
    }
  }
  if(x1 < 0) return;                              // nothing set
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const k = Math.min(1, (W - 2*mx)/bw, (H - 2*my)/bh);
  const tw = bw*k, th = bh*k;
  const tx = (align === 'left' ? mx : align === 'right' ? W - mx - tw : (W - tw)/2) + sx;
  const ty = (H - th)/2 + sy;
  const t = document.createElement('canvas'); t.width = bw; t.height = bh;
  t.getContext('2d').drawImage(from, x0, y0, bw, bh, 0, 0, bw, bh);
  gx.fillStyle = '#fff'; gx.fillRect(0,0,W,H);
  gx.drawImage(t, tx, ty, tw, th);
  gx.fillStyle = '#000';
}

/* ---------- ONE description of the drawing ----------
   The canvas, the PNG and the SVG all walk this, so the preview is not an
   approximation of the export — it is the export.                        */
const inkColour = () => $('inkc').value;
const bgColour  = () => $('bgc').value;
function geometry(){
  const {cells,cellN,cellX,cellY,cw,ch,dot,W,H} = LAST;
  // a circle inscribed in the cell covers pi/4 of it; at 1-2px grow it so the
  // dot carries the weight the density asked for. Quantised once here, so the
  // canvas and the SVG draw the identical circle.
  const R = Math.round((dot > 2 ? dot/2 : dot*0.5642) * 100)/100;
  const q1 = v => Math.round(v*10)/10, q2 = v => Math.round(v*100)/100;
  return {
    W, H, R,
    // Every mark is a circle. A cell the shape clipped keeps the centre of mass
    // of its ink and shrinks to match that area, so edges feather instead of
    // stepping — nothing is ever a square.
    dots(cb){
      for(let cy=0;cy<ch;cy++){
        for(let cx=0;cx<cw;cx++){
          const ci = cy*cw+cx, f = cells[ci];
          if(f === 1){
            cb(q1(cx*dot + dot/2), q1(cy*dot + dot/2), R);
          } else if(f === 2){
            const r = Math.min(R, Math.max(0.35, Math.sqrt(cellN[ci]/Math.PI)));
            cb(q1(cellX[ci]), q1(cellY[ci]), q2(r));
          }
        }
      }
    }
  };
}
function paint(context, transparent){
  if(!LAST) return;
  const g = geometry();
  context.clearRect(0,0,g.W,g.H);
  if(!transparent){ context.fillStyle = bgColour(); context.fillRect(0,0,g.W,g.H); }
  const path = new Path2D();
  g.dots((x,y,r) => { path.moveTo(x+r, y); path.arc(x, y, r, 0, Math.PI*2); });
  context.fillStyle = inkColour();
  context.fill(path);
}
function buildSvg(){
  const g = geometry();
  const circles = [];
  g.dots((x,y,r) => {
    const sx = Math.round((x-r)*100)/100, d2 = Math.round(r*200)/100;
    circles.push(`M${sx} ${y}a${r} ${r} 0 1 0 ${d2} 0a${r} ${r} 0 1 0 -${d2} 0`);
  });
  const bg = $('alpha').checked ? '' : `<rect width="${g.W}" height="${g.H}" fill="${bgColour()}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${g.W}" height="${g.H}" viewBox="0 0 ${g.W} ${g.H}">${bg}<path fill="${inkColour()}" d="${circles.join('')}"/></svg>`;
}

/* ---------- main ---------- */
function render(){
  const t0 = performance.now();
  const word   = $('word').value || 'Archadia';   // typed exactly as entered, case included
  const FAM    = $('face').value;
  const NP     = +$('n').value * 1000;
  const SPRAY  = +$('spray').value;
  const SWIRL  = +$('swirl').value/100;
  const FSCALE = +$('scale').value;
  const DX     = +$('dx').value/100;
  const DY     = +$('dy').value/100;
  const EDGEB  = +$('edge').value/100;
  const CORE   = +$('core').value/100;
  const INK    = +$('ink').value/100;
  const GRAIN  = +$('grain').value/100;
  const DOT    = +$('dotpx').value;        // raster dot size, in px
  const WIDE   = +$('wide').value/100;
  const FILL   = 1;   // set as large as it comes; fitInk brings it inside the margin
  const TRACK  = +$('track').value;
  const ALIGN  = $('align').value;
  const MODE   = $('mode').value;          // 'all' | 'in' | 'out' | 'both'
  const OUTW   = +$('outw').value/100;     // how strongly the escaped cloud reads
  const SOLID  = +$('solid').value/100;    // lifts ink inside the shape toward solid
  const GRAD   = +$('grad').value/100;     // how hard the distress ramps across the piece
  const GDIR   = $('graddir').value;
  const layout = $('layout').value;
  SEED = +$('seed').value + 1; rs = SEED*2654435761 | 1;

  const useImg = $('src').value === 'image' && IMG;
  const IMGINK = $('imgink').value;
  const THR    = +$('thr').value;
  const stack  = !useImg && layout === 'stack';
  const n = Math.max(1, word.length);

  let W, H, iw = 0, ih = 0, P = 0;
  if(useImg){                                  // frame the artwork, with room to spray
    const k = 1800/Math.max(IMG.width, IMG.height);   // small art is scaled up so the stipple has room
    iw = Math.round(IMG.width*k); ih = Math.round(IMG.height*k);
    P  = Math.round(Math.max(iw,ih) * (+$('pad').value/100));
    W  = iw + 2*P; H = ih + 2*P;
  } else {
    W = stack ? 900 : 2200;
    H = stack ? Math.round(280*n) : 800;
  }
  cv.width = W; cv.height = H;
  fitCanvas(W, H);
  cv.style.height = 'auto';

  /* --- 1. mask: artwork or type --- */
  const g = document.createElement('canvas'); g.width = W; g.height = H;
  const gx = g.getContext('2d', {willReadFrequently:true});
  if(!useImg){ gx.fillStyle = '#fff'; gx.fillRect(0,0,W,H); }   // type sets on white
  gx.fillStyle = '#000';
  const band = stack ? H/n : W/n;
  // Type is set first on a sheet with room all round, so a swash or an italic
  // overhang that runs past the frame is still there to be measured and
  // fitted, rather than clipped at the edge before anything looks at it.
  const PX = Math.round(W*0.5), PY = Math.round(H*0.5);
  const sheet = document.createElement('canvas');
  if(!useImg){ sheet.width = W + 2*PX; sheet.height = H + 2*PY; }
  const tx = sheet.getContext('2d', {willReadFrequently:true});
  tx.fillStyle = '#fff'; tx.fillRect(0, 0, sheet.width, sheet.height);
  tx.translate(PX, PY); tx.fillStyle = '#000';
  if(useImg){
    gx.drawImage(IMG, P, P, iw, ih);          // transparent ground: alpha is kept
  } else if(stack){
    const fit = fitWord(tx, word, FAM, band, FILL);
    const cx = ALIGN === 'center' ? W/2 : ALIGN === 'left' ? 30 : W-30;
    for(let i=0;i<n;i++){
      if(/\s/.test(word[i])) continue;            // blank band for a space
      drawGlyph(tx, word[i], FAM, fit, cx, band*(i+0.5), WIDE, ALIGN);
    }
  } else {
    const M = 40;                                  // side margin
    let fit = fitWord(tx, word, FAM, H, FILL);
    let a = advances(tx, word, FAM, fit, WIDE, TRACK);
    if(a.total > W - 2*M){                         // too wide: scale the word down to fit
      const k = (W - 2*M) / a.total;
      fit = fitWord(tx, word, FAM, H, FILL*k);
      a = advances(tx, word, FAM, fit, WIDE, TRACK*k);
    }
    let pen = (W - a.total)/2;                     // centred as a whole
    for(let i=0;i<n;i++){
      if(!/\s/.test(word[i])) drawGlyphPen(tx, word[i], FAM, fit, pen, H*0.5, WIDE);
      pen += a.adv[i] + TRACK;
    }
  }
  // Type is set by its advances, but an italic's ink reaches past them — a
  // swash runs out beyond the first and last letters and was being cut off at
  // the edge. So the word is fitted by where its ink actually is, inside a
  // margin that leaves the spray somewhere to go.
  // How far the spray carries is roughly its distance times how fast the
  // field runs — swirl one way or another, drift always the same way — so the
  // margin grows with both, and the word is set back against the drift.
  if(!useImg){
    const base = Math.min(W, H) * 0.1;
    const reachX = SPRAY * (SWIRL*0.5 + Math.abs(DX)) * 0.6;
    const reachY = SPRAY * (SWIRL*0.5 + Math.abs(DY)) * 0.6;
    fitInk(sheet, gx, W, H, base + reachX, base + reachY, stack ? ALIGN : 'center',
      -SPRAY*DX*0.3, -SPRAY*DY*0.3);
  }
  const src = gx.getImageData(0,0,W,H).data;
  const mask = new Uint8Array(W*H);
  for(let p=0,q=0;p<W*H;p++,q+=4){
    const al  = src[q+3];
    const lum = src[q]*0.299 + src[q+1]*0.587 + src[q+2]*0.114;
    let ink;
    if(!useImg)                      ink = lum < 128;              // black type on white
    else if(IMGINK === 'dark')       ink = al >= 128 && lum <  THR;
    else if(IMGINK === 'light')      ink = al >= 128 && lum >  THR;
    else if(IMGINK === 'opaque')     ink = al >= THR;
    else                             ink = al <  THR;              // the knocked-out areas
    mask[p] = ink ? 1 : 0;
  }

  if(useImg && IMGINK === 'hole'){       // only the holes inside the artwork count
    for(let y=0;y<H;y++) for(let x=0;x<W;x++){
      if(x < P || y < P || x >= P+iw || y >= P+ih) mask[y*W+x] = 0;
    }
  }

  /* --- 2. seed lists --- */
  const interior = [], edgeList = [];
  for(let y=4;y<H-4;y++){
    for(let x=4;x<W-4;x++){
      const i = y*W+x;
      if(!mask[i]) continue;
      const isEdge = !mask[i-1] || !mask[i+1] || !mask[i-W] || !mask[i+W]
                  || !mask[i-3] || !mask[i+3] || !mask[i-3*W] || !mask[i+3*W];
      (isEdge ? edgeList : interior).push(i);
    }
  }
  const eN = edgeList.length, iN = interior.length;

  /* --- 3. curl-noise flow field --- */
  const GS = 6;
  const FW = Math.ceil(W/GS)+2, FH = Math.ceil(H/GS)+2;
  const flowX = new Float32Array(FW*FH), flowY = new Float32Array(FW*FH);
  const sc = 1/Math.max(4, FSCALE*6);
  const e = 1.2;
  for(let gy=0;gy<FH;gy++){
    for(let gxi=0;gxi<FW;gxi++){
      const x = gxi*GS, y = gy*GS;
      const dpy = fbm(x*sc, (y+e)*sc) - fbm(x*sc, (y-e)*sc);
      const dpx = fbm((x+e)*sc, y*sc) - fbm((x-e)*sc, y*sc);
      let vx = dpy, vy = -dpx;
      const m = Math.hypot(vx,vy) || 1e-6;
      vx /= m; vy /= m;
      const k = gy*FW+gxi;
      flowX[k] = vx*SWIRL + DX;
      flowY[k] = vy*SWIRL*0.75 + DY;
    }
  }
  function flowAt(x, y, out){
    let fx = x/GS, fy = y/GS;
    let xi = fx|0, yi = fy|0;
    if(xi<0)xi=0; else if(xi>FW-2)xi=FW-2;
    if(yi<0)yi=0; else if(yi>FH-2)yi=FH-2;
    const tx = fx-xi, ty = fy-yi, k = yi*FW+xi;
    const a = (1-tx)*(1-ty), b = tx*(1-ty), c = (1-tx)*ty, d = tx*ty;
    out[0] = flowX[k]*a + flowX[k+1]*b + flowX[k+FW]*c + flowX[k+FW+1]*d;
    out[1] = flowY[k]*a + flowY[k+1]*b + flowY[k+FW]*c + flowY[k+FW+1]*d;
  }

  // 0 at the clean end, 1 at the distressed end
  const gradAt = (x, y) => GDIR === 'lr' ? x/W
                         : GDIR === 'rl' ? 1 - x/W
                         : GDIR === 'tb' ? y/H
                         :                 1 - y/H;

  /* --- 4. advect particles --- */
  const dens = new Float32Array(W*H);
  const STEPS = 34;
  const v = [0,0];
  const stepLen = SPRAY/STEPS;
  for(let p=0;p<NP;p++){
    const fromEdge = rnd() < EDGEB;
    const list = (fromEdge && eN) ? edgeList : (iN ? interior : edgeList);
    if(!list.length) break;
    const idx = list[(rnd()*list.length)|0];
    let x = (idx % W) + rnd()-0.5;
    let y = ((idx / W)|0) + rnd()-0.5;
    const gseed = gradAt(x, y);
    const travel = 1 - GRAD*(1-gseed)*0.85;      // short trips where it should stay clean
    const stepL = stepLen * travel;
    const life = Math.max(1, Math.round(STEPS * Math.pow(rnd(), 0.75)));
    const jig = (0.55 + rnd()*1.3) * (0.3 + 0.7*travel);
    let w = 1;
    for(let s=0;s<life;s++){
      const xi = x|0, yi = y|0;
      if(xi>=0 && xi<W-1 && yi>=0 && yi<H-1){
        const tx = x-xi, ty = y-yi, k = yi*W+xi;
        dens[k]     += w*(1-tx)*(1-ty);
        dens[k+1]   += w*tx*(1-ty);
        dens[k+W]   += w*(1-tx)*ty;
        dens[k+W+1] += w*tx*ty;
      }
      flowAt(x, y, v);
      x += v[0]*stepL + (rnd()-0.5)*jig;
      y += v[1]*stepL + (rnd()-0.5)*jig*0.7;
      w *= 0.962;
    }
  }

  /* --- 5. one on/off decision per DOT x DOT cell --- */
  const bits = new Uint8Array(W*H);
  const gain = INK * 900 / Math.max(1, NP/1000) * 0.5;
  const gamma = 0.35 + (1-GRAIN)*1.6;
  const R = DOT/2, bite = 1 - CORE*0.92;
  const cw = Math.ceil(W/DOT), chh = Math.ceil(H/DOT);
  const cells = new Uint8Array(cw*chh);        // 0 empty · 1 whole dot · 2 partial
  const cellN = new Uint8Array(cw*chh);        // lit pixels, for the partial ones
  const cellX = new Float32Array(cw*chh), cellY = new Float32Array(cw*chh);
  let discCount = 0;                           // pixels a full dot covers
  for(let y=0;y<DOT;y++) for(let x=0;x<DOT;x++){
    if(DOT <= 2){ discCount++; continue; }
    const ddx = x-(R-0.5), ddy = y-(R-0.5);
    if(ddx*ddx + ddy*ddy <= R*R) discCount++;
  }
  for(let by=0;by<H;by+=DOT){
    const y1 = Math.min(by+DOT, H);
    for(let bx=0;bx<W;bx+=DOT){
      const x1 = Math.min(bx+DOT, W);
      let sum = 0, cnt = 0;
      for(let y=by;y<y1;y++){ const row=y*W; for(let x=bx;x<x1;x++){ sum += dens[row+x]; cnt++; } }
      const dAvg = sum/Math.max(1,cnt);
      const a    = Math.pow(1 - Math.exp(-dAvg*gain*0.02), gamma);
      const gcell = gradAt(bx + DOT/2, by + DOT/2);
      const solidL = SOLID + (1-SOLID)*(1-gcell)*GRAD;   // crisp at the clean end
      const outL   = OUTW * (1 - GRAD*(1-gcell)*0.9);    // little spray there either
      const aIn  = a + solidL*(1-a);
      const aOut = MODE === 'all' ? a*outL : a;
      const cellCX = (bx/DOT)|0, cellCY = (by/DOT)|0;
      const t = 0.12*((((cellCX&3)*5 + (cellCY&3)*3) % 16)/16) + 0.88*hash(cellCX*3+1, cellCY*7+5);
      const onIn = aIn > t, onOut = aOut > t;
      const ccx = bx + R - 0.5, ccy = by + R - 0.5;
      let litCount = 0, sxAcc = 0, syAcc = 0;
      for(let y=by;y<y1;y++){
        const row = y*W;
        for(let x=bx;x<x1;x++){
          const i = row+x;
          const inShape = mask[i];
          let lit = inShape ? onIn : onOut;
          if(DOT > 2){                                   // round it off
            const ddx = x-ccx, ddy = y-ccy;
            if(ddx*ddx + ddy*ddy > R*R) lit = false;
          }
          if(MODE === 'both' && inShape && 1 - bite*vnoise(x*0.06, y*0.06) > t) lit = true;
          if(MODE === 'out' && inShape) lit = false;     // clipped away by the mode
          if(MODE === 'in' && !inShape) lit = false;
          bits[i] = lit ? 1 : 0;
          if(lit){ litCount++; sxAcc += x + 0.5; syAcc += y + 0.5; }
        }
      }
      const whole = (x1-bx === DOT) && (y1-by === DOT) && litCount === discCount;
      const ci = cellCY*cw + cellCX;
      cells[ci] = litCount === 0 ? 0 : whole ? 1 : 2;
      if(cells[ci] === 2){                       // remember where the ink actually sat
        cellN[ci] = Math.min(255, litCount);
        cellX[ci] = sxAcc/litCount;
        cellY[ci] = syAcc/litCount;
      }
    }
  }

  // the field and the gradient are kept too: disintegrate blows the dots
  // along the same currents that made the spray
  LAST = {W,H,bits,mask,cells,cellN,cellX,cellY,cw,ch:chh,dot:DOT,mode:MODE,
          flowAt, gradAt, spray:SPRAY};
  paint(ctx, $('alpha').checked);         // the same primitives the SVG will use
  cv.classList.toggle('alpha', $('alpha').checked);

  let dotCells = 0; for(let i=0;i<cells.length;i++) if(cells[i]) dotCells++;
  $('stat').textContent = `${W}×${H} at ${Math.round(cv.clientWidth/W*100)}% · ${(NP/1000)|0}k particles · ${dotCells.toLocaleString()} dots · ${useImg ? 'image' : FAM} · ${Math.round(performance.now()-t0)}ms`;
}

/* ---------- export ---------- */
function fileBase(){
  const b = ($('src').value === 'image' && IMG) ? 'artwork' : ($('word').value || 'archadia');
  return b.toLowerCase().replace(/\s+/g,'') + '-particulate';
}
function save(blob, ext){
  const a = document.createElement('a');
  a.download = fileBase()+'.'+ext;
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
}
$('dlPng').onclick = () => {
  if(!LAST) return;
  const t = document.createElement('canvas'); t.width = LAST.W; t.height = LAST.H;
  paint(t.getContext('2d'), $('alpha').checked);
  t.toBlob(b => save(b,'png'), 'image/png');
};
$('dlSvg').onclick = () => {
  if(!LAST) return;
  save(new Blob([buildSvg()], {type:'image/svg+xml'}), 'svg');
};

/* ---------- presets ---------- */
const PRESETS = {
  // the house look, and what the tab opens on
  archadia: {mode:'all', edge:100, core:63, solid:37, grad:26, graddir:'lr', outw:100,
             spray:165, swirl:52, scale:19, ink:247, grain:43, dotpx:3, n:900,
             dx:44, dy:-2, seed:412, inkc:'#fff278', bgc:'#403b12'},
  // dots trace the contour of the form and the interior stays open
  contour:  {mode:'all', edge:100, core:0, solid:0,  grad:30, outw:100, spray:70,  swirl:120,
             scale:40, ink:70,  grain:55, dotpx:2, n:600, dx:0,  dy:0,
             inkc:'#fff278', bgc:'#403b12'},   // the studio's yellow on dark olive
  // the letterform reads solid, with spray coming off it
  wordmark: {mode:'all', edge:12, core:0, solid:45, grad:65, outw:60,  spray:127, swirl:160,
             scale:59, ink:163, grain:41, dotpx:2, n:900, dx:7,  dy:32,
             inkc:'#181818', bgc:'#ffffff'}
};
function applyPreset(name){
  const p = PRESETS[name];
  if(!p) return;
  for(const k in p) if($(k)) $(k).value = p[k];
  syncLabels();
  go();
}

// the preview always fits the stage, both ways — exports are full size anyway
const stageBox = document.getElementById('logoStage');
function fitCanvas(W = cv.width, H = cv.height){
  const pad = 24, bw = stageBox.clientWidth - pad*2, bh = stageBox.clientHeight - pad*2;
  if(bw <= 0 || bh <= 0) return;
  cv.style.width = Math.round(W * Math.min(1, bw/W, bh/H)) + 'px';
}
new ResizeObserver(() => fitCanvas()).observe(stageBox);

/* ---------- ui ---------- */
// only the controls that act on the source chosen: the type settings do
// nothing to an image, and the image's own nothing to typed letters
function logoRows(){
  const kind = $('src').value;
  for(const el of document.querySelectorAll('#tab-logo [data-for]'))
    el.hidden = el.dataset.for !== kind;
  $('alignRow').hidden = $('layout').value !== 'stack'; // a banner is always centred
}
$('layout').addEventListener('change', logoRows);
for(const b of $('alignBtns').children){
  b.onclick = () => {
    $('align').value = b.dataset.align;
    for(const o of $('alignBtns').children) o.dataset.on = String(o === b);
    queue();
  };
}
$('upload').onclick = () => $('imgFile').click();
// choosing the image source with nothing loaded asks for one straight away
$('src').addEventListener('change', () => {
  logoRows();
  if($('src').value === 'image' && !IMG) $('imgFile').click();
});
const readouts = {n:'vN',spray:'vSpray',swirl:'vSwirl',scale:'vScale',dx:'vDx',dy:'vDy',edge:'vEdge',core:'vCore',ink:'vInk',grain:'vGrain',dotpx:'vDotpx',outw:'vOut',solid:'vSolid',grad:'vGrad',wide:'vWide',track:'vTrack',thr:'vThr',pad:'vPad'};
function syncLabels(){ for(const k in readouts) $(readouts[k]).textContent = $(k).value; markSwatches(); }

// Colour off the same fixed palette as the Design tab, read from its swatches
// so there is one list of the studio's colours, not two.
const PALETTE = [...document.querySelectorAll('#bgSw button[data-hex]')].map(b => b.dataset.hex);
function buildSwatches(hostId, inputId){
  for(const hex of PALETTE){
    const b = document.createElement('button');
    b.style.background = hex; b.title = hex.toUpperCase(); b.dataset.hex = hex;
    b.onclick = () => {
      $(inputId).value = hex;
      if(inputId === 'bgc') $('alpha').checked = false;
      markSwatches(); go();
    };
    $(hostId).appendChild(b);
  }
  if(inputId === 'bgc'){   // no fill, as on the Design tab
    const b = document.createElement('button');
    b.className = 'clear'; b.title = 'Transparent'; b.setAttribute('aria-label', 'Transparent');
    b.onclick = () => { $('alpha').checked = true; markSwatches(); go(); };
    $(hostId).appendChild(b);
  }
}
function markSwatches(){
  for(const [hostId, inputId, outId] of [['bgSw','bgc','vBgC'], ['inkSw','inkc','vInkC']]){
    const clear = inputId === 'bgc' && $('alpha').checked;
    const cur = $(inputId).value.toLowerCase();
    for(const b of $(hostId).children)
      b.dataset.on = String(b.classList.contains('clear') ? clear : !clear && b.dataset.hex === cur);
    $(outId).textContent = clear ? 'Transparent' : cur.toUpperCase();
  }
}
buildSwatches('bgSw', 'bgc');
buildSwatches('inkSw', 'inkc');
let timer = null;
function queue(){ syncLabels(); clearTimeout(timer); timer = setTimeout(go, 90); }
async function go(){
  const fam = $('face').value;
  try { await document.fonts.load(`100px "${fam}"`, 'ARCHADIO'); } catch(e){}
  render();
}
Object.keys(readouts).concat(['word','layout','face','mode','src','imgink','graddir','seed']).forEach(id => $(id).addEventListener('input', queue));
$('preset').onchange = ev => applyPreset(ev.target.value);
$('rand').onclick = () => { $('seed').value = Math.floor(Math.random()*1000); queue(); };
$('seedDown').onclick = () => { $('seed').value = Math.max(0, +$('seed').value - 1); queue(); };
$('seedUp').onclick = () => { $('seed').value = +$('seed').value + 1; queue(); };
$('imgFile').onchange = ev => {
  const f = ev.target.files[0]; if(!f) return;
  loadImage(URL.createObjectURL(f), f.name);
};
applyPreset('archadia');
syncLabels();
logoRows();
document.fonts.ready.then(go);
go();

/* ---------- motion ----------
   The Motion tab's moves, on the logo's dots instead of the lace's stitches.
   Frames are counted the same way, so Steps, Offset, Amount and frames per
   second mean here what they mean there. Morph has no counterpart: it walks a
   series of pictures, and the logo is one. */
const h01 = (i, k) => (Math.imul(i + k, 2246822519 ^ Math.imul(k, 374761393)) >>> 0) / 4294967296;
let MO = null;
function motionDots(M){
  if(MO && MO.last === LAST && MO.transition === M.transition) return MO;
  const {W, H} = LAST;
  const dots = [];
  geometry().dots((x, y, r) => dots.push({tx:x, ty:y, r, sx:x, sy:y}));
  const n = dots.length;

  // Branch: outward from the middle of the ink, the edge left ragged by noise
  // so it grows rather than expanding as a ring.
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for(const d of dots){ x0 = Math.min(x0, d.tx); x1 = Math.max(x1, d.tx); y0 = Math.min(y0, d.ty); y1 = Math.max(y1, d.ty); }
  const cx = (x0 + x1)/2, cy = (y0 + y1)/2, maxR = Math.hypot(x1 - cx, y1 - cy) || 1;
  // Weight: how crowded each dot's neighbourhood is, so the sparse spray can
  // go first and the solid letters last.
  const B = 24, bw = Math.ceil(W/B), bins = new Uint16Array(bw * Math.ceil(H/B));
  for(const d of dots) bins[((d.ty/B)|0)*bw + ((d.tx/B)|0)]++;
  let top = 1; for(const v of bins) top = Math.max(top, v);
  dots.forEach((d, i) => {
    const radial = Math.hypot(d.tx - cx, d.ty - cy)/maxR;
    d.delay = Math.min(1, radial*0.8 + vnoise(d.tx*0.012, d.ty*0.012)*0.2);
    d.dens = bins[((d.ty/B)|0)*bw + ((d.tx/B)|0)]/top;
    d.i = i;
  });

  // Gather: where each dot waits before it walks in, by the same transitions.
  const kind = M.transition;
  const gc = Math.max(1, Math.round(Math.sqrt(n * W/H))), gr = Math.max(1, Math.ceil(n/gc));
  const stepX = W/gc, stepY = H/gr;
  if(kind === 'fall'){
    for(const d of dots){ d.sx = d.tx; d.sy = d.ty - H*(0.35 + (Math.floor(d.tx/(W/60)) % 3)*0.22); }
  } else if(kind === 'edges'){
    for(const d of dots){ d.sx = d.tx < W/2 ? d.tx - W*0.55 : d.tx + W*0.55; d.sy = d.ty; }
  } else if(kind === 'settle'){   // the nearest point of the even grid: the shortest move each can make
    for(const d of dots){
      d.sx = (Math.floor(d.tx/stepX) + 0.5)*stepX;
      d.sy = (Math.floor(d.ty/stepY) + 0.5)*stepY;
    }
  } else {
    const slots = [];
    for(let r=0;r<gr;r++){
      const inRow = Math.min(gc, n - r*gc); if(inRow <= 0) break;
      const pad = (gc - inRow)/2;
      for(let c=0;c<inRow;c++) slots.push([(c + pad + 0.5)*stepX, (r + 0.5)*stepY]);
    }
    if(kind === 'swap'){   // no pairing at all
      let z = 0x2545f491;
      const rand = () => (z = (Math.imul(z, 1664525) + 1013904223) >>> 0)/4294967296;
      for(let i=slots.length-1;i>0;i--){ const j = (rand()*(i+1))|0; [slots[i], slots[j]] = [slots[j], slots[i]]; }
      dots.forEach((d, i) => { d.sx = slots[i][0]; d.sy = slots[i][1]; });
    } else {               // contract and corner: paired along a Hilbert curve
      const SIDE = 256;
      const hil = (px, py) => {
        let x = Math.max(0, Math.min(SIDE-1, Math.floor(px/W*SIDE)));
        let y = Math.max(0, Math.min(SIDE-1, Math.floor(py/H*SIDE)));
        let d = 0;
        for(let s=SIDE/2;s>0;s/=2){
          const rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0;
          d += s*s*((3*rx) ^ ry);
          if(ry === 0){ if(rx === 1){ x = s-1-x; y = s-1-y; } const t = x; x = y; y = t; }
        }
        return d;
      };
      const order = dots.map((_, i) => i).sort((a, b) => hil(dots[a].tx, dots[a].ty) - hil(dots[b].tx, dots[b].ty));
      slots.sort((a, b) => hil(a[0], a[1]) - hil(b[0], b[1]));
      order.forEach((idx, k) => { const s = slots[k] || slots[slots.length-1]; dots[idx].sx = s[0]; dots[idx].sy = s[1]; });
    }
  }
  MO = {last: LAST, transition: kind, dots};
  return MO;
}

// Disintegrate: the clean wordmark — every cell of the letters a whole dot —
// breaking down into the distressed one and coming back. Each cell is one of
// three things. Kept: in the letters and still inked when distressed, it only
// settles to its distressed place and size. Lost: in the letters but gone in
// the distressed version, it is blown off along the field and fades. Spray:
// outside the letters, it is traced back up the field to where it left the
// letters and streams out from there. The distress runs across in the
// gradient's direction, from the distressed end.
let DIS = null;
function disintegration(M){
  if(DIS && DIS.last === LAST && DIS.flare === M.flare) return DIS;
  const {W, H, mask, cw, ch, dot, flowAt, gradAt, spray} = LAST;
  const g = geometry(), R = g.R;
  const distressed = new Map();
  g.dots((x, y, r) => distressed.set(Math.min(ch - 1, (y/dot)|0)*cw + Math.min(cw - 1, (x/dot)|0), [x, y, r]));
  const inside = (x, y) => {
    const xi = x|0, yi = y|0;
    return xi >= 0 && yi >= 0 && xi < W && yi < H && mask[yi*W + xi] === 1;
  };
  const v = [0, 0];
  // a short run along the field, forwards or back, as points to travel through
  const trail = (x, y, dist, dir, stopInside) => {
    const pts = [[x, y]], N = 10;
    for(let k=0;k<N;k++){
      flowAt(x, y, v);
      x += v[0]*dir*dist/N; y += v[1]*dir*dist/N;
      pts.push([x, y]);
      if(stopInside && inside(x, y)) break;
    }
    return pts;
  };
  const travel = Math.max(40, spray*0.8) * (0.6 + M.flare);
  const items = [];
  for(let cy=0; cy<ch; cy++){
    for(let cx=0; cx<cw; cx++){
      const px = cx*dot + dot/2, py = cy*dot + dot/2;
      // whole in the clean wordmark if most of the cell is letter
      let hits = 0;
      for(const [ox, oy] of [[0,0],[-0.3,-0.3],[0.3,-0.3],[-0.3,0.3],[0.3,0.3]]) hits += inside(px + ox*dot, py + oy*dot);
      const clean = hits >= 3;
      const d = distressed.get(cy*cw + cx);
      if(!clean && !d) continue;
      const i = items.length;
      if(clean && d){
        // a kept dot is stirred on the way: it swings out along the current
        // and comes back to land, so the body of the letters churns too
        flowAt(px, py, v);
        const swing = travel*0.22*(0.4 + h01(i, 5));
        const mx = (px + d[0])/2 + v[0]*swing, my = (py + d[1])/2 + v[1]*swing;
        items.push({kind:'kept', path:[[px, py], [mx, my], [d[0], d[1]]], r0:R, r1:d[2], a0:1, a1:1});
      } else if(clean){
        items.push({kind:'lost', path:trail(px, py, travel*(0.5 + h01(i, 3)), 1, false), r0:R, r1:R*0.35, a0:1, a1:0});
      } else {
        const back = trail(d[0], d[1], travel*1.5, -1, true).reverse();
        items.push({kind:'spray', path:back, r0:d[2]*0.4, r1:d[2], a0:0.15, a1:1});
      }
      const [sx, sy] = items[i].path[0];
      // the distressed end goes first, and the front eats in by patches rather
      // than as a line — broad noise, with a little grain on top
      items[i].delay = Math.min(1, (1 - gradAt(sx, sy))*0.6 + vnoise(sx*0.006, sy*0.006)*0.3 + h01(i, 11)*0.1);
      items[i].i = i;
    }
  }
  DIS = {last: LAST, flare: M.flare, items};
  return DIS;
}
function along(path, e){
  if(path.length === 2) return [path[0][0] + (path[1][0] - path[0][0])*e, path[0][1] + (path[1][1] - path[0][1])*e];
  const f = e*(path.length - 1), k = Math.min(path.length - 2, f|0), u = f - k;
  return [path[k][0] + (path[k+1][0] - path[k][0])*u, path[k][1] + (path[k+1][1] - path[k][1])*u];
}

// One frame of motion M (the lace's own settings object) onto the preview.
export function frame(n, M){
  if(!LAST) return;
  if(M.motion === 'disintegrate'){
    const {items} = disintegration(M);
    const fps = Math.max(1, M.fps);
    const steps = Math.max(2, Math.round(M.steps));
    const lag = Math.round(M.lag * fps);
    // whole, breaking down, distressed, coming back: Amount is each hold
    const hold = Math.max(1, Math.round((0.4 + M.amount*3)*fps));
    const run = steps + lag, cycle = (hold + run)*2, k = ((n % cycle) + cycle) % cycle;
    const j = k < hold ? 0 : k < hold + run ? k - hold : k < hold*2 + run ? run : run - (k - hold*2 - run);
    const at = (x) => Math.max(0, Math.min(steps, x))/steps;
    const p0 = at(j), p1 = at(j - lag), S = 0.6;
    // Distressed is never quite still: the spray keeps drifting a little way
    // back and forth along its current, and every dot boils by a hair from
    // frame to frame, the way a hand-drawn line does. Clean stays crisp.
    const t = n/fps, dotSize = LAST.dot;
    const marks = [];
    for(const it of items){
      const raw = Math.max(0, Math.min(1, ((lag > 0 && h01(it.i, 97) < 0.5 ? p1 : p0) - it.delay*S)/(1 - S)));
      // blown dots are caught by the wind and pick up speed; spray shoots
      // out and slows as it lands; kept dots ease both ways
      let e = it.kind === 'lost' ? raw*raw : it.kind === 'spray' ? 1 - (1 - raw)*(1 - raw) : raw*raw*(3 - 2*raw);
      const a = it.a0 + (it.a1 - it.a0)*e;
      if(a <= 0.02) continue;
      let pe = e;
      if(it.kind === 'spray' && raw >= 1)
        pe = 1 - 0.12*(0.5 - 0.5*Math.cos(t*(1.2 + h01(it.i, 41)*1.6) + h01(it.i, 43)*6.283));
      let [x, y] = along(it.path, pe);
      if(raw > 0){
        const b = dotSize*0.35*raw;
        x += (h01(it.i*31 + n, 51) - 0.5)*b;
        y += (h01(it.i*17 + n, 53) - 0.5)*b;
      }
      marks.push([x, y, it.r0 + (it.r1 - it.r0)*e, a]);
    }
    drawMarks(marks);
    return;
  }
  const {dots} = motionDots(M);
  const fps = Math.max(1, M.fps), amt = M.amount, t = n/fps;
  const steps = Math.max(2, Math.round(M.steps));
  const lag = (M.motion === 'branch' || M.motion === 'gather') ? Math.round(M.lag * fps) : 0;
  const late = (d) => lag > 0 && h01(d.i, 97) < 0.5;   // the half held back by Offset
  const at = (j) => Math.max(0, Math.min(steps, j));
  const marks = [];   // [x, y, r, alpha]

  if(M.motion === 'branch'){
    // grows and stays; Amount is how long it holds before starting again
    const hold = Math.max(1, Math.round((0.5 + amt*6)*fps));
    const cycle = steps + lag + hold, k = ((n % cycle) + cycle) % cycle;
    const p0 = at(k)/steps, p1 = at(k - lag)/steps;
    for(const d of dots) if((late(d) ? p1 : p0) - d.delay*0.85 > 0) marks.push([d.tx, d.ty, d.r, 1]);
  } else if(M.motion === 'gather'){
    const hold = Math.max(1, Math.round((0.4 + amt*3)*fps));
    const shape = (s) => 1 - Math.pow(1 - s/steps, 1.55);
    const run = steps + lag, cycle = run*2 + hold*2, k = ((n % cycle) + cycle) % cycle;
    const j = k < run ? k : k < run + hold ? run : k < run*2 + hold ? run - (k - run - hold) : 0;
    const e0 = shape(at(j)), e1 = shape(at(j - lag));
    const corner = M.transition === 'corner';
    for(const d of dots){
      const e = late(d) ? e1 : e0;
      const ex = corner ? Math.min(1, e*2) : e, ey = corner ? Math.max(0, e*2 - 1) : e;
      marks.push([d.sx + (d.tx - d.sx)*ex, d.sy + (d.ty - d.sy)*ey, d.r, 1]);
    }
  } else if(M.motion === 'weight'){
    // a level rising through the crowding: the sparse dots go first
    const lvl = amt * (0.5 - 0.5*Math.cos(t*2));
    for(const d of dots) if(d.dens >= lvl) marks.push([d.tx, d.ty, d.r, 1]);
  } else if(M.motion === 'breathe'){
    // random dots fading on their own clocks; Amount is how many take part
    const share = Math.max(0.02, amt);
    for(const d of dots){
      const i = d.i;
      let a = 1;
      if(h01(i, 1) <= share){
        const ph = h01(i, 7)*Math.PI*2, rate = 0.25 + Math.pow(h01(i, 13), 2)*2.6;
        const depth = 0.25 + Math.pow(h01(i, 23), 1.4)*0.72, curve = 0.45 + Math.pow(h01(i, 31), 1.6)*2.8;
        a = 1 - depth*(1 - Math.pow(0.5 + 0.5*Math.sin(t*rate + ph), curve));
      }
      marks.push([d.tx, d.ty, d.r, a]);
    }
  } else { still(); return; }
  drawMarks(marks);
}
function drawMarks(marks){
  const {W, H} = LAST;
  ctx.clearRect(0, 0, W, H);
  if(!$('alpha').checked){ ctx.fillStyle = bgColour(); ctx.fillRect(0, 0, W, H); }
  ctx.fillStyle = inkColour();
  // fading dots are drawn in a few strengths, one path each
  const LV = 6, paths = Array.from({length: LV + 1}, () => new Path2D());
  for(const [x, y, r, a] of marks){
    const p = paths[Math.round(a*LV)];
    p.moveTo(x + r, y); p.arc(x, y, r, 0, Math.PI*2);
  }
  for(let l=1;l<=LV;l++){ ctx.globalAlpha = l/LV; ctx.fill(paths[l]); }
  ctx.globalAlpha = 1;
}
// back to the finished logo
export function still(){ paint(ctx, $('alpha').checked); }
export const canvas = cv;
export const recordingName = () => fileBase();
