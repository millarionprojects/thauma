import {isEnvelope, prepareEnvelope, drawEnvelope, EnvelopeScene} from './envelope-art.js';

const copperPatched = new WeakSet();
function keepCopperDetails(art) {
  if (!art || copperPatched.has(art)) return;
  copperPatched.add(art);
  const w = art.width, h = art.height;

  // Keep the outer top foil on the envelope body when the flap lifts.
  const pocket = art.pocket.getContext('2d');
  const topStrip = Math.max(2, Math.round(h * .06));
  pocket.drawImage(art.closed, 0, 0, w, topStrip, 0, 0, w, topStrip);

  // The reverse side is generated from paper, so restore a matching copper
  // outline there instead of letting the decoration disappear at 90 degrees.
  const inner = art.inner.getContext('2d');
  const traceFlap = () => {
    inner.beginPath();
    inner.moveTo(w * .04, h * .04);
    inner.lineTo(w * .96, h * .04);
    inner.lineTo(w * .928, h * .132);
    inner.quadraticCurveTo(w * .913, h * .17, w * .88, h * .21);
    inner.lineTo(w * .5, h * .635);
    inner.lineTo(w * .12, h * .21);
    inner.quadraticCurveTo(w * .087, h * .17, w * .072, h * .132);
    inner.closePath();
  };
  inner.save();
  inner.lineJoin = 'round'; inner.lineCap = 'round';
  traceFlap();
  inner.strokeStyle = 'rgba(72,34,21,.92)';
  inner.lineWidth = Math.max(3, w * .006);
  inner.stroke();
  const foil = inner.createLinearGradient(0, 0, w, 0);
  foil.addColorStop(0, '#7d452b');
  foil.addColorStop(.28, '#c27d4b');
  foil.addColorStop(.5, '#efad72');
  foil.addColorStop(.72, '#c27d4b');
  foil.addColorStop(1, '#7d452b');
  traceFlap();
  inner.strokeStyle = foil;
  inner.lineWidth = Math.max(1.4, w * .0024);
  inner.stroke();
  inner.restore();
}

export async function createGiftScene(canvas, options, OriginalScene) {
  if (!isEnvelope(options.design)) return new OriginalScene(canvas, options);
  const art = await prepareEnvelope(options.design);
  if (options.design === 'envelope-copper') keepCopperDetails(art);
  return new EnvelopeScene(canvas, art, options);
}

export async function renderEnvelopePreviews(theme, sceneName) {
  const results = await Promise.allSettled(['envelope', 'envelope-gold', 'envelope-copper'].map(async design => {
    const target = document.querySelector(`.design-card[data-design="${design}"] .design-preview`);
    if (!target) return;
    const art = await prepareEnvelope(design), canvas = document.createElement('canvas');
    if (design === 'envelope-copper') keepCopperDetails(art);
    canvas.width = 600; canvas.height = 470;
    drawEnvelope(canvas.getContext('2d'), 600, 470, art, {}, 0, {thumbnail: true, theme});
    const image = new Image(); image.alt = sceneName(design); image.width = 600; image.height = 470;
    image.src = canvas.toDataURL('image/webp', .92); target.replaceChildren(image);
  }));
  for (const result of results) if (result.status === 'rejected') console.warn('Envelope preview unavailable', result.reason);
}
