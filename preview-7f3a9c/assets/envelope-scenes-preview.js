import {isEnvelope, prepareEnvelope, drawEnvelope, EnvelopeScene} from './envelope-art-preview.js';

const copperPatched = new WeakSet();
export function keepCopperDetails(art) {
  if (!art || copperPatched.has(art)) return;
  copperPatched.add(art);
  const w = art.width, h = art.height;
  function foilLayer(source,keep){
    const layer=document.createElement('canvas');layer.width=w;layer.height=h;
    const ctx=layer.getContext('2d'),pixels=source.getContext('2d').getImageData(0,0,w,h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const n=(y*w+x)*4,r=pixels.data[n],g=pixels.data[n+1],b=pixels.data[n+2];
      if(!keep(x,y)||r<65||r<g*1.12||g<b*1.10)pixels.data[n+3]=0;
    }
    ctx.putImageData(pixels,0,0);return layer;
  }
  const border=foilLayer(art.closed,(x,y)=>x<w*.085||x>w*.915||y>h*.86||y<h*.06);
  art.pocket.getContext('2d').drawImage(border,0,0);
  const reverse=foilLayer(art.front,(x,y)=>((x-w*.5)/(w*.14))**2+((y-h*.58)/(h*.235))**2>=1);
  art.inner.getContext('2d').drawImage(reverse,0,0);
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
