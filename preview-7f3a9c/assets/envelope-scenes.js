import {isEnvelope, prepareEnvelope, drawEnvelope, EnvelopeScene} from './envelope-art.js';

export async function createGiftScene(canvas, options, OriginalScene) {
  if (!isEnvelope(options.design)) return new OriginalScene(canvas, options);
  const art = await prepareEnvelope(options.design);
  return new EnvelopeScene(canvas, art, options);
}

export async function renderEnvelopePreviews(theme, sceneName) {
  const results = await Promise.allSettled(['envelope', 'envelope-gold', 'envelope-copper'].map(async design => {
    const target = document.querySelector(`.design-card[data-design="${design}"] .design-preview`);
    if (!target) return;
    const art = await prepareEnvelope(design), canvas = document.createElement('canvas');
    canvas.width = 600; canvas.height = 470;
    drawEnvelope(canvas.getContext('2d'), 600, 470, art, {}, 0, {thumbnail: true, theme});
    const image = new Image(); image.alt = sceneName(design); image.width = 600; image.height = 470;
    image.src = canvas.toDataURL('image/webp', .92); target.replaceChildren(image);
  }));
  for (const result of results) if (result.status === 'rejected') console.warn('Envelope preview unavailable', result.reason);
}
