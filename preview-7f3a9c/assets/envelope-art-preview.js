import * as base from './envelope-art-continuous.js?base=20260916-astra1';

const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(v,a,b)=>{const x=clamp((v-a)/(b-a));return x*x*x*(x*(x*6-15)+10);};
const mix=(a,b,t)=>a+(b-a)*t;
const rectMix=(a,b,t)=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),w:mix(a.w,b.w,t),h:mix(a.h,b.h,t)});
// Clear the pocket before approaching the viewer; no reversal or dead hold.
const remap=p=>p<=.42?clamp(p)*(.55/.42):mix(.55,1,clamp((p-.42)/.34));

export const isEnvelope=base.isEnvelope;
export const envelopeArt=base.envelopeArt;
export const buildEnvelopeLayers=base.buildEnvelopeLayers;
export const prepareEnvelope=base.prepareEnvelope;
export const envelopeLayout=base.envelopeLayout;
export const envelopePose=p=>base.envelopePose(remap(p));
const packagingLayers=new WeakMap();

function fit(width,height,aspect,wr=.9,hr=.88){
  const w=Math.min(width*wr,height*hr*aspect),h=w/aspect;
  return{x:(width-w)/2,y:(height-h)/2,w,h};
}
function imageRect(image,card){
  if(!image)return null;
  const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
  if(!iw||!ih)return null;
  const margin=card.w*.018,scale=Math.min((card.w-margin*2)/iw,(card.h-margin*2)/ih);
  const w=iw*scale,h=ih*scale;
  return{x:card.x+(card.w-w)/2,y:card.y+(card.h-h)/2,w,h};
}
export function envelopePresentation(width,height,art,gift,progress){
  const raw=clamp(progress),layout=base.envelopeLayout(width,height,art,false),pose=envelopePose(raw);
  const start={x:layout.x+layout.w*.09,y:layout.y+layout.h*(.12-pose.lift),w:layout.w*.82,h:layout.h*.69};
  const focus=smooth(raw,.76,1),release=smooth(raw,.80,1);
  const card=rectMix(start,fit(width,height,start.w/start.h,.78,.56),focus);
  const inner=imageRect(gift?.certificateImage,card);
  const image=inner?rectMix(inner,fit(width,height,inner.w/inner.h),release):null;
  return{card,image,frameOpacity:inner?1-release:1,packagingOpacity:1-smooth(raw,.80,.99),focus};
}
function drawFocusedInsert(ctx,gift,{card,image,frameOpacity}){
  ctx.save();
  if(frameOpacity>0){
    ctx.globalAlpha*=frameOpacity;
    ctx.shadowColor='rgba(0,0,0,.24)';ctx.shadowBlur=card.w*.03;ctx.shadowOffsetY=card.h*.025;
    ctx.fillStyle='#fffdfa';ctx.fillRect(card.x,card.y,card.w,card.h);ctx.shadowColor='transparent';
    if(!image){
      ctx.fillStyle='#25423c';ctx.textAlign='center';ctx.font=`500 ${card.w*.065}px Georgia`;
      ctx.fillText(gift.title||(gift.lang==='en'?'A gift for you':'Подарок для вас'),card.x+card.w/2,card.y+card.h*.46,card.w*.87);
      if(gift.amount){ctx.font=`${card.w*.045}px Arial`;ctx.fillText(String(gift.amount),card.x+card.w/2,card.y+card.h*.67,card.w*.85);}
    }
  }
  ctx.restore();
  if(image){ctx.save();ctx.drawImage(gift.certificateImage,image.x,image.y,image.w,image.h);ctx.restore();}
}
export function drawEnvelope(ctx,width,height,art,gift,progress=0,options={}){
  const raw=clamp(progress),state=envelopePresentation(width,height,art,gift,raw);
  const focusing=!options.thumbnail&&state.focus>0;
  const hidden=options.certificateHidden;
  if(focusing){
    let layer=packagingLayers.get(ctx.canvas);
    if(!layer){layer=document.createElement('canvas');packagingLayers.set(ctx.canvas,layer);}
    const ratio=ctx.getTransform().a||1,pw=Math.round(width*ratio),ph=Math.round(height*ratio);
    if(layer.width!==pw||layer.height!==ph){layer.width=pw;layer.height=ph;}
    const pc=layer.getContext('2d');pc.setTransform(ratio,0,0,ratio,0,0);
    base.drawEnvelope(pc,width,height,art,gift,remap(raw),{...options,transparent:true,drawInsert:null});
    ctx.clearRect(0,0,width,height);
    if(!options.transparent){ctx.fillStyle=options.theme==='dark'?'#0b191b':'#e8f3ef';ctx.fillRect(0,0,width,height);}
    // Fade a completed layer, never the overlapping perspective strips separately.
    ctx.save();ctx.globalAlpha*=state.packagingOpacity;ctx.drawImage(layer,0,0,width,height);ctx.restore();
  }else base.drawEnvelope(ctx,width,height,art,gift,remap(raw),{...options,...(hidden?{drawInsert:null}:{})});
  // The insert is drawn once, in front only after it has cleared the pocket.
  // No rectangle is painted over the packaging to erase an earlier copy.
  if(focusing&&!hidden)drawFocusedInsert(ctx,gift,state);
}

export class EnvelopeScene extends base.EnvelopeScene{
  render(progress=this.progress,elapsed=this.elapsed){
    if(this.disposed)return;
    this.progress=clamp(progress);this.elapsed=elapsed;
    this.ctx.setTransform(this.pixelRatio,0,0,this.pixelRatio,0,0);
    drawEnvelope(this.ctx,this.width,this.height,this.art,this.gift,this.progress,this);
    this.canvas.dataset.phase=this.progress===0?'idle':this.progress<1?'opening':'opened';
  }
  certificateSnapshot(){
    if(!this.gift.certificateImage)return null;
    const rect=envelopePresentation(this.width,this.height,this.art,this.gift,this.progress).image;
    if(!rect)return null;
    return{image:this.gift.certificateImage,quad:[{x:rect.x,y:rect.y},{x:rect.x+rect.w,y:rect.y},{x:rect.x+rect.w,y:rect.y+rect.h},{x:rect.x,y:rect.y+rect.h}]};
  }
  setCertificateVisible(visible){this.certificateHidden=!visible;}
  reset(){this.certificateHidden=false;this.presentationSnapshot=null;super.reset();}
  play({onComplete,onProgress,reducedMotion=false}={}){
    if(this.playing||this.disposed)return false;
    this.onComplete=onComplete;this.onProgress=onProgress;
    this.duration=reducedMotion?.8:5.6;
    this.playElapsed=0;this.playing=true;this.start();return true;
  }
}
