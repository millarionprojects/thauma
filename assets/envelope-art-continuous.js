// Shared artwork for the picker, opening and export. Only packaging is cached.
const cache = new Map();
export const isEnvelope = design => ['envelope', 'envelope-gold', 'envelope-copper'].includes(design);
export const envelopeArt = {
  'envelope-copper': {file: 'envelope-copper-cutout.webp', box: [73, 71, 878, 560]},
  'envelope-gold': {file: 'envelope-graphite-gold.webp', box: [93.3, 87.5, 1095, 701]},
  envelope: {file: 'envelope-ivory.webp', box: [93.3, 87.5, 1095, 701]},
};
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = (value, start, end) => {
  const x = clamp((value - start) / (end - start));
  return x * x * x * (x * (x * 6 - 15) + 10);
};
export function envelopePose(progress) {
  return {angle: smooth(progress, .12, .55) * Math.PI * .96,
    lift: smooth(progress, .61, .94)};
}
function surface(w, h) {
  const c = document.createElement('canvas'); c.width = Math.round(w); c.height = Math.round(h); return c;
}
function paperOutline(ctx, w, h) {
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, 0);
  ctx.lineTo(w * .967, h * .132); ctx.quadraticCurveTo(w * .952, h * .171, w * .915, h * .215);
  ctx.lineTo(w * .5, h * .66); ctx.lineTo(w * .085, h * .215);
  ctx.quadraticCurveTo(w * .048, h * .171, w * .033, h * .132); ctx.closePath();
}
function sealOutline(ctx, w, h) {
  // The wax overhang belongs to the hinge too, never the certificate.
  ctx.moveTo(w * .619, h * .58);
  ctx.ellipse(w * .5, h * .58, w * .119, h * .203, 0, 0, Math.PI * 2);
}
function pocketOutline(ctx, w, h) {
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * .36, h * .45); ctx.lineTo(w * .64, h * .45);
  ctx.lineTo(w, 0); ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
}
export function buildEnvelopeLayers(image, spec) {
  const w = 1000, h = Math.round(w * spec.box[3] / spec.box[2]);
  const closed = surface(w, h), c = closed.getContext('2d');
  c.drawImage(image, ...spec.box, 0, 0, w, h);
  // The same paper supplies the previously hidden lining.
  const swatch = surface(180, 84);
  swatch.getContext('2d').drawImage(closed, w * .38, h * .075, w * .18, h * .13, 0, 0, 180, 84);
  // Reflected joins keep the grain continuous instead of exposing tile seams.
  const paper = surface(360, 168), paperCtx = paper.getContext('2d');
  for (const flipX of [0, 1]) for (const flipY of [0, 1]) {
    paperCtx.save(); paperCtx.translate(flipX ? 360 : 0, flipY ? 168 : 0);
    paperCtx.scale(flipX ? -1 : 1, flipY ? -1 : 1); paperCtx.drawImage(swatch, 0, 0); paperCtx.restore();
  }
  const back = surface(w, h), b = back.getContext('2d');
  b.fillStyle = b.createPattern(paper, 'repeat'); b.fillRect(0, 0, w, h);
  const shade = b.createLinearGradient(0, 0, 0, h);
  shade.addColorStop(0, 'rgba(0,0,0,.10)'); shade.addColorStop(.75, 'rgba(0,0,0,.33)');
  b.fillStyle = shade; b.fillRect(0, 0, w, h);
  const front = surface(w, h), f = front.getContext('2d');
  paperOutline(f, w, h); sealOutline(f, w, h); f.clip(); f.drawImage(closed, 0, 0);
  const inner = surface(w, h), i = inner.getContext('2d');
  paperOutline(i, w, h); i.clip(); i.drawImage(back, 0, 0);
  i.strokeStyle = 'rgba(255,255,255,.17)'; i.lineWidth = 2; paperOutline(i, w, h); i.stroke();
  const pocket = surface(w, h), p = pocket.getContext('2d');
  pocketOutline(p, w, h); p.clip();
  p.fillStyle = p.createPattern(paper, 'repeat'); p.fillRect(0, 0, w, h);
  const sideShade = p.createLinearGradient(0, 0, w, 0);
  sideShade.addColorStop(0, 'rgba(0,0,0,.03)'); sideShade.addColorStop(.5, 'rgba(0,0,0,.19)'); sideShade.addColorStop(1, 'rgba(0,0,0,.03)');
  p.fillStyle = sideShade; p.fillRect(0, 0, w, h);
  p.beginPath(); p.moveTo(0, h); p.lineTo(w * .36, h * .45); p.lineTo(w * .64, h * .45); p.lineTo(w, h); p.closePath();
  p.fillStyle = p.createPattern(paper, 'repeat'); p.fill();
  p.strokeStyle = 'rgba(0,0,0,.3)'; p.lineWidth = 3; p.stroke();
  p.strokeStyle = 'rgba(255,255,255,.17)'; p.lineWidth = 1; p.stroke();
  // The side and bottom foil come from the original photo; no photographed
  // centre is retained, so a second seal or its round cut-out cannot remain.
  const edge = w * .041, foot = h * .947;
  p.drawImage(closed, 0, 0, edge, h, 0, 0, edge, h);
  p.drawImage(closed, w - edge, 0, edge, h, w - edge, 0, edge, h);
  p.drawImage(closed, 0, foot, w, h - foot, 0, foot, w, h - foot);
  // Preserve the photographed exposed body and folds. Reconstruct only paper
  // that was hidden by the flap or wax, with a soft transition around its shadow.
  const body=surface(w,h),bc=body.getContext('2d');bc.drawImage(closed,0,0);
  const movingPaper=surface(w,h),mc=movingPaper.getContext('2d');
  paperOutline(mc,w,h);mc.fill();
  const mask=mc.getImageData(0,0,w,h).data,pixels=bc.getImageData(0,0,w,h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const n=(y*w+x)*4;
    const radius=Math.hypot((x-w*.5)/(w*.22),(y-h*.59)/(h*.32));
    const blend=clamp((radius-.65)/.35),outsideWax=blend*blend*(3-2*blend);
    pixels.data[n+3]*=(1-mask[n+3]/255)*outsideWax;
  }
  bc.putImageData(pixels,0,0);
  p.drawImage(body,0,0);
  return {closed, back, front, inner, pocket, width: w, height: h};
}
export async function prepareEnvelope(design) {
  if (!isEnvelope(design)) return null;
  if (!cache.has(design)) cache.set(design, new Promise((resolve, reject) => {
    const spec = envelopeArt[design], image = new Image();
    image.onload = () => { try { resolve(buildEnvelopeLayers(image, spec)); } catch (error) { reject(error); } };
    image.onerror = () => reject(new Error('Envelope artwork unavailable'));
    image.src = new URL('../media/' + spec.file, import.meta.url).href;
  }).catch(error => { cache.delete(design); throw error; }));
  return cache.get(design);
}
function card(ctx, gift, x, y, w, h) {
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.24)'; ctx.shadowBlur = w * .03; ctx.shadowOffsetY = h * .025;
  ctx.fillStyle = '#fffdfa'; ctx.fillRect(x, y, w, h); ctx.shadowColor = 'transparent';
  const image = gift.certificateImage;
  if (image && (image.width || image.naturalWidth)) {
    const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
    const margin = w * .018, scale = Math.min((w - margin * 2) / iw, (h - margin * 2) / ih);
    ctx.drawImage(image, x + (w - iw * scale) / 2, y + (h - ih * scale) / 2, iw * scale, ih * scale);
  } else {
    const en = gift.lang === 'en'; ctx.fillStyle = '#25423c'; ctx.textAlign = 'center'; ctx.font = `500 ${w * .065}px Georgia`;
    ctx.fillText(gift.file ? (en ? 'Your attached document' : 'Ваш документ') : gift.title || (en ? 'A gift for you' : 'Подарок для вас'), x + w / 2, y + h * .46, w * .87);
    ctx.font = `${w * .045}px Arial`;
    if (gift.amount) ctx.fillText(String(gift.amount), x + w / 2, y + h * .67, w * .85);
  }
  ctx.restore();
}
function flap(ctx, art, w, h, angle) {
  const facing = Math.cos(angle), source = facing >= 0 ? art.front : art.inner;
  // Perspective strips keep the top hinge fixed while the paper unfolds.
  if (Math.abs(facing) < .004) return;
  ctx.save(); ctx.scale(1, Math.sign(facing));
  const strips = 100, focal = w * 3.5;
  for (let row = 0; row < strips; row++) {
    const y0 = h * row / strips, y1 = h * (row + 1) / strips;
    const s0 = focal / (focal - y0 * Math.sin(angle)), s1 = focal / (focal - y1 * Math.sin(angle));
    const scale = (s0 + s1) / 2, top = y0 * Math.abs(facing) * s0, bottom = y1 * Math.abs(facing) * s1;
    ctx.drawImage(source, 0, source.height * row / strips, source.width, source.height / strips,
      w * (1 - scale) / 2, top, w * scale, bottom - top + .35);
  }
  ctx.restore();
}
export function envelopeLayout(width, height, art, thumbnail = false) {
  const ratio = art.height / art.width;
  const w = Math.min(width * .87, height / (thumbnail ? ratio * 1.2 : ratio * 2.2)), h = w * ratio;
  return {w, h, x: (width - w) / 2, y: thumbnail ? (height - h) / 2 : height * .485 - h * .035};
}
export function drawEnvelope(ctx, width, height, art, gift, progress = 0,
  {thumbnail = false, transparent = false, theme = 'light'} = {}) {
  ctx.clearRect(0, 0, width, height);
  if (!transparent) { ctx.fillStyle = theme === 'dark' ? '#0b191b' : '#e8f3ef'; ctx.fillRect(0, 0, width, height); }
  const {angle, lift} = envelopePose(progress), {w, h, x, y} = envelopeLayout(width, height, art, thumbnail);
  ctx.save(); ctx.translate(x, y);
  ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = w * .035; ctx.shadowOffsetY = h * .035;
  ctx.drawImage(art.back, 0, 0, w, h); ctx.shadowColor = 'transparent';
  if (angle > Math.PI / 2) flap(ctx, art, w, h, angle);
  card(ctx, gift, w * .09, h * (.12 - lift * 1.00), w * .82, h * .69);
  ctx.drawImage(art.pocket, 0, 0, w, h);
  if (angle <= Math.PI / 2) flap(ctx, art, w, h, angle);
  // Rest, picker, opening and export use exactly the same layers. No photo swap.
  ctx.restore();
}
export class EnvelopeScene {
  constructor(canvas, art, {design, theme = 'light', gift = {}, thumbnail = false, transparent = false} = {}) {
    this.canvas = canvas; this.art = art; this.design = design; this.theme = theme; this.gift = gift;
    this.thumbnail = thumbnail; this.transparent = transparent; this.progress = 0; this.elapsed = 0;
    this.width = 600; this.height = 700; this.disposed = false; this.running = false; this.playing = false;
    this.pixelRatio = thumbnail ? 1 : Math.min(globalThis.devicePixelRatio || 1, 1.8);
    this.ctx = canvas.getContext('2d'); if (!this.ctx) throw new Error('Canvas unavailable');
    this.renderer = {setPixelRatio: ratio => { this.pixelRatio = ratio; }};
    canvas.dataset.scene = design;
    this.onVisibility = () => { this.lastTime = 0; }; document.addEventListener('visibilitychange', this.onVisibility);
  }
  resize(width, height) {
    this.width = width; this.height = height;
    this.canvas.width = Math.round(width * this.pixelRatio); this.canvas.height = Math.round(height * this.pixelRatio);
  }
  render(progress = this.progress, elapsed = this.elapsed) {
    if (this.disposed) return;
    this.progress = clamp(progress); this.elapsed = elapsed;
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    drawEnvelope(this.ctx, this.width, this.height, this.art, this.gift, this.progress, this);
    this.canvas.dataset.phase = this.progress === 0 ? 'idle' : this.progress < 1 ? 'opening' : 'opened';
  }
  start() {
    if (this.running || this.disposed || !this.playing) return;
    this.running = true; this.lastTime = 0;
    const tick = time => {
      if (!this.running || this.disposed) return;
      if (!document.hidden) {
        const delta = this.lastTime ? Math.min((time - this.lastTime) / 1000, .1) : 0;
        this.lastTime = time; this.elapsed += delta; this.playElapsed += delta;
        this.render(this.playElapsed / this.duration); this.onProgress?.(this.progress);
        if (this.progress >= 1) { this.playing = false; this.stop(); this.onComplete?.(); return; }
      } else this.lastTime = 0;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  play({onComplete, onProgress, reducedMotion = false} = {}) {
    if (this.playing || this.disposed) return false;
    this.onComplete = onComplete; this.onProgress = onProgress; this.duration = reducedMotion ? .8 : 6.6;
    this.playElapsed = 0; this.playing = true; this.start(); return true;
  }
  reset() { this.stop(); this.playing = false; this.playElapsed = 0; this.render(0, 0); }
  stop() { this.running = false; cancelAnimationFrame(this.raf); this.lastTime = 0; }
  dispose() { this.stop(); this.disposed = true; document.removeEventListener('visibilitychange', this.onVisibility); this.gift = {}; }
}
