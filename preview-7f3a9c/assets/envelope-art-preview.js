import * as base from './envelope-art-continuous.js?base=1';

const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(v,a,b)=>{const x=clamp((v-a)/(b-a));return x*x*x*(x*(x*6-15)+10);};
const mix=(a,b,t)=>a+(b-a)*t;
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

function sourceAspect(gift,fallback){
  const image=gift?.certificateImage;
  if(image&&(image.naturalWidth||image.width)&&(image.naturalHeight||image.height)){
    return clamp((image.naturalWidth||image.width)/(image.naturalHeight||image.height),.62,2.1);
  }
  return fallback;
}

function fitRect(width,height,aspect){
  let w=width*.9,h=w/aspect;
  const maxH=height*.66;
  if(h>maxH){h=maxH;w=h*aspect;}
  return {x:(width-w)/2,y:(height-h)/2,w,h};
}

function drawCertificate(ctx,gift,x,y,w,h,progress){
  ctx.save();
  ctx.shadowColor=`rgba(0,0,0,${mix(.22,.14,progress)})`;
  ctx.shadowBlur=w*mix(.027,.018,progress);
  ctx.shadowOffsetY=h*mix(.026,.012,progress);
  ctx.fillStyle='#fffdfa';ctx.fillRect(x,y,w,h);ctx.shadowColor='transparent';
  const image=gift?.certificateImage;
  if(image&&(image.naturalWidth||image.width)){
    const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
    const margin=w*mix(.018,.003,progress);
    const scale=Math.min((w-margin*2)/iw,(h-margin*2)/ih);
    ctx.drawImage(image,x+(w-iw*scale)/2,y+(h-ih*scale)/2,iw*scale,ih*scale);
  }else{
    const en=gift?.lang==='en';ctx.fillStyle='#25423c';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`600 ${Math.max(15,w*.048)}px Georgia`;
    ctx.fillText(gift?.title||(en?'A gift for you':'Подарок для вас'),x+w/2,y+h*.47,w*.84);
    if(gift?.amount){ctx.font=`500 ${Math.max(13,w*.038)}px Arial`;ctx.fillText(String(gift.amount),x+w/2,y+h*.66,w*.8);}
  }
  ctx.restore();
}

function drawContinuousFocus(ctx,width,height,art,gift,raw,options){
  if(options.thumbnail)return;
  const focus=smooth(raw,.79,.995);
  if(focus<=0)return;

  // Begin exactly at the physical certificate rectangle already rendered in the envelope.
  const mapped=remap(raw),pose=base.envelopePose(mapped),layout=base.envelopeLayout(width,height,art,false);
  const start={x:layout.x+layout.w*.09,y:layout.y+layout.h*(.12-pose.lift),w:layout.w*.82,h:layout.h*.69};
  const target=fitRect(width,height,sourceAspect(gift,start.w/start.h));

  // Fade the packaging away behind the same card so no second card is visible during the move.
  const veil=smooth(raw,.82,.965);
  if(veil>0){
    ctx.save();ctx.globalAlpha=veil;
    ctx.fillStyle=options.theme==='dark'?'#0b191b':'#e8f3ef';
    ctx.fillRect(0,0,width,height);ctx.restore();
  }

  const e=smooth(focus,0,1);
  drawCertificate(ctx,gift,
    mix(start.x,target.x,e),mix(start.y,target.y,e),
    mix(start.w,target.w,e),mix(start.h,target.h,e),e);
}

export function drawEnvelope(ctx,width,height,art,gift,progress=0,options={}){
  const raw=clamp(progress);
  base.drawEnvelope(ctx,width,height,art,gift,remap(raw),options);
  drawContinuousFocus(ctx,width,height,art,gift,raw,options);
}

export class EnvelopeScene extends base.EnvelopeScene{
  render(progress=this.progress,elapsed=this.elapsed){
    if(this.disposed)return;
    const raw=clamp(progress);
    this.progress=raw;this.elapsed=elapsed;
    this.ctx.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);
    drawEnvelope(this.ctx,this.width,this.height,this.art,this.gift,raw,this);
    this.canvas.dataset.phase=raw===0?'idle':raw<1?'opening':'opened';
  }
  play({onComplete,onProgress,reducedMotion=false}={}){
    if(this.playing||this.disposed)return false;
    this.onComplete=onComplete;this.onProgress=onProgress;
    this.duration=reducedMotion?.8:5.6;
    this.playElapsed=0;this.playing=true;this.start();return true;
  }
}
