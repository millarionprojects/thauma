import * as base from './envelope-art-continuous.js?base=1';

const clamp=v=>Math.max(0,Math.min(1,v));
const remap=progress=>{
  const p=clamp(progress);
  if(p<=.42)return p*1.25;
  return .525+(p-.42)*(.475/.58);
};

export const isEnvelope=base.isEnvelope;
export const envelopeArt=base.envelopeArt;
export const buildEnvelopeLayers=base.buildEnvelopeLayers;
export const prepareEnvelope=base.prepareEnvelope;
export const envelopeLayout=base.envelopeLayout;
export const envelopePose=progress=>base.envelopePose(remap(progress));
export function drawEnvelope(ctx,width,height,art,gift,progress=0,options={}){
  return base.drawEnvelope(ctx,width,height,art,gift,remap(progress),options);
}

export class EnvelopeScene extends base.EnvelopeScene{
  render(progress=this.progress,elapsed=this.elapsed){
    const raw=clamp(progress);
    super.render(remap(raw),elapsed);
    this.progress=raw;
    this.canvas.dataset.phase=raw===0?'idle':raw<1?'opening':'opened';
  }
  play({onComplete,onProgress,reducedMotion=false}={}){
    if(this.playing||this.disposed)return false;
    this.onComplete=onComplete;this.onProgress=onProgress;
    this.duration=reducedMotion?.8:5.6;
    this.playElapsed=0;this.playing=true;this.start();return true;
  }
}
