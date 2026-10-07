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

// Scales the inked area down (never up) to sit inside the margin, and places it:
// centred on the height, and across by the alignment.
function fitInk(gx, W, H, m, align){
  const d = gx.getImageData(0,0,W,H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for(let y=0;y<H;y++){
    for(let x=0,q=y*W*4;x<W;x++,q+=4){
      if(d[q] >= 128) continue;                   // black type on white
      if(x < x0) x0 = x; if(x > x1) x1 = x;
      if(y < y0) y0 = y; if(y > y1) y1 = y;
    }
  }
  if(x1 < 0) return;                              // nothing set
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const k = Math.min(1, (W - 2*m)/bw, (H - 2*m)/bh);
  const tw = bw*k, th = bh*k;
  const tx = align === 'left' ? m : align === 'right' ? W - m - tw : (W - tw)/2;
  const ty = (H - th)/2;
  const t = document.createElement('canvas'); t.width = bw; t.height = bh;
  t.getContext('2d').drawImage(gx.canvas, x0, y0, bw, bh, 0, 0, bw, bh);
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
  const FILL   = +$('size').value/100;
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
  if(useImg){
    gx.drawImage(IMG, P, P, iw, ih);          // transparent ground: alpha is kept
  } else if(stack){
    const fit = fitWord(gx, word, FAM, band, FILL);
    const cx = ALIGN === 'center' ? W/2 : ALIGN === 'left' ? 30 : W-30;
    for(let i=0;i<n;i++){
      if(/\s/.test(word[i])) continue;            // blank band for a space
      drawGlyph(gx, word[i], FAM, fit, cx, band*(i+0.5), WIDE, ALIGN);
    }
  } else {
    const M = 40;                                  // side margin
    let fit = fitWord(gx, word, FAM, H, FILL);
    let a = advances(gx, word, FAM, fit, WIDE, TRACK);
    if(a.total > W - 2*M){                         // too wide: scale the word down to fit
      const k = (W - 2*M) / a.total;
      fit = fitWord(gx, word, FAM, H, FILL*k);
      a = advances(gx, word, FAM, fit, WIDE, TRACK*k);
    }
    let pen = (W - a.total)/2;                     // centred as a whole
    for(let i=0;i<n;i++){
      if(!/\s/.test(word[i])) drawGlyphPen(gx, word[i], FAM, fit, pen, H*0.5, WIDE);
      pen += a.adv[i] + TRACK;
    }
  }
  // Type is set by its advances, but an italic's ink reaches past them — a
  // swash runs out beyond the first and last letters and was being cut off at
  // the edge. So the word is fitted by where its ink actually is, inside a
  // margin that leaves the spray somewhere to go.
  if(!useImg) fitInk(gx, W, H, Math.round(Math.min(W, H) * 0.12), stack ? ALIGN : 'center');
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

  LAST = {W,H,bits,mask,cells,cellN,cellX,cellY,cw,ch:chh,dot:DOT,mode:MODE};
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
  // dots trace the contour of the form and the interior stays open
  contour:  {mode:'all', edge:100, solid:0,  grad:30, outw:100, spray:70,  swirl:120,
             scale:40, ink:70,  grain:55, dotpx:2, n:600, dx:0,  dy:0,
             inkc:'#fff278', bgc:'#403b12'},   // the studio's yellow on dark olive
  // the letterform reads solid, with spray coming off it
  wordmark: {mode:'all', edge:12,  solid:45, grad:65, outw:60,  spray:127, swirl:160,
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
const readouts = {n:'vN',spray:'vSpray',swirl:'vSwirl',scale:'vScale',dx:'vDx',dy:'vDy',edge:'vEdge',core:'vCore',ink:'vInk',grain:'vGrain',dotpx:'vDotpx',outw:'vOut',solid:'vSolid',grad:'vGrad',wide:'vWide',size:'vSize',track:'vTrack',thr:'vThr',pad:'vPad'};
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
applyPreset('contour');
syncLabels();
logoRows();
document.fonts.ready.then(go);
go();
