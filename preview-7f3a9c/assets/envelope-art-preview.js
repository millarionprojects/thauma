import * as base from './envelope-art-continuous.js?base=1';

const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(v,a,b)=>{const x=clamp((v-a)/(b-a));return x*x*x*(x*(x*6-15)+10);};
const mix=(a,b,t)=>a+(b-a)*t;
const remap=progress=>{
  const p=clamp(progress);
  // Shorter dead time: flap opens first, then the same certificate exits continuously.
  if(p<=.42)return p*1.25;
  return .525+(p-.42)*(.475/.58);
};

export const isEnvelope=base.isEnvelope;
export const envelopeArt=base.envelopeArt;
export const buildEnvelopeLayers=base.buildEnvelopeLayers;
export const prepareEnvelope=base.prepareEnvelope;
export const envelopeLayout=base.envelopeLayout;
export const envelopePose=progress=>base.envelopePose(remap(progress));

function drawCertificate(ctx,gift,x,y,w,h){
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,.22)';ctx.shadowBlur=w*.025;ctx.shadowOffsetY=h*.025;
  ctx.fillStyle='#fffdfa';ctx.fillRect(x,y,w,h);ctx.shadowColor='transparent';
  const image=gift?.certificateImage;
  if(image&&(image.naturalWidth||image.width)){
    const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,margin=w*.018;
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
  const focus=smooth(raw,.885,1);
  if(focus<=0)return;

  // Start from the exact card rectangle used by the base renderer at this frame.
  // The overlay therefore sits precisely on top of the existing card: no second-card ghost.
  const mapped=remap(raw),pose=base.envelopePose(mapped),layout=base.envelopeLayout(width,height,art,false);
  const start={
    x:layout.x+layout.w*.09,
    y:layout.y+layout.h*(.12-pose.lift),
    w:layout.w*.82,
    h:layout.h*.69
  };
  const aspect=start.w/start.h;
  let endW=Math.min(width*.86,height*.58*aspect),endH=endW/aspect;
  if(endH>height*.58){endH=height*.58;endW=endH*aspect;}
  const endX=(width-endW)/2,endY=Math.max(44,(height-endH)*.31);
  const x=mix(start.x,endX,focus),y=mix(start.y,endY,focus),w=mix(start.w,endW,focus),h=mix(start.h,endH,focus);
  drawCertificate(ctx,gift,x,y,w,h);
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
