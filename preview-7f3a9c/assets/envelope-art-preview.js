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

function drawCertificate(ctx,gift,x,y,w,h,alpha=1){
  ctx.save();
  ctx.globalAlpha=alpha;
  ctx.shadowColor='rgba(0,0,0,.24)';ctx.shadowBlur=w*.035;ctx.shadowOffsetY=h*.035;
  ctx.fillStyle='#fffdfa';ctx.fillRect(x,y,w,h);ctx.shadowColor='transparent';
  const image=gift?.certificateImage;
  if(image&&(image.naturalWidth||image.width)){
    const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,margin=w*.025;
    const scale=Math.min((w-margin*2)/iw,(h-margin*2)/ih);
    ctx.drawImage(image,x+(w-iw*scale)/2,y+(h-ih*scale)/2,iw*scale,ih*scale);
  }else{
    const en=gift?.lang==='en';
    ctx.fillStyle='#25423c';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`600 ${Math.max(15,w*.045)}px Georgia`;
    ctx.fillText(gift?.title||(en?'A gift for you':'Подарок для вас'),x+w/2,y+h*.47,w*.82);
    if(gift?.amount){ctx.font=`500 ${Math.max(13,w*.04)}px Arial`;ctx.fillText(String(gift.amount),x+w/2,y+h*.66,w*.8);}
  }
  ctx.restore();
}

function drawFinalFocus(ctx,width,height,art,gift,raw,options){
  if(options.thumbnail)return;
  const focus=smooth(raw,.905,.995);
  if(focus<=0)return;
  const layout=base.envelopeLayout(width,height,art,false);
  const ratio=(layout.w*.82)/(layout.h*.69);
  const startW=layout.w*.82,startH=startW/ratio;
  const startX=layout.x+layout.w*.09,startY=layout.y-layout.h*.88;
  let endW=Math.min(width*.9,height*.62*ratio),endH=endW/ratio;
  if(endH>height*.62){endH=height*.62;endW=endH*ratio;}
  const endX=(width-endW)/2,endY=Math.max(58,(height-endH)*.34);
  const w=mix(startW,endW,focus),h=mix(startH,endH,focus),x=mix(startX,endX,focus),y=mix(startY,endY,focus);
  drawCertificate(ctx,gift,x,y,w,h,.2+.8*focus);
}

export function drawEnvelope(ctx,width,height,art,gift,progress=0,options={}){
  const raw=clamp(progress);
  base.drawEnvelope(ctx,width,height,art,gift,remap(raw),options);
  drawFinalFocus(ctx,width,height,art,gift,raw,options);
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
