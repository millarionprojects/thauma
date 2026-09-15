import * as base from './envelope-art-continuous.js?base=1';

const clamp=v=>Math.max(0,Math.min(1,v));
const smooth=(v,a,b)=>{const x=clamp((v-a)/(b-a));return x*x*x*(x*(x*6-15)+10);};
const mix=(a,b,t)=>a+(b-a)*t;
const rectMix=(a,b,t)=>({x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),w:mix(a.w,b.w,t),h:mix(a.h,b.h,t)});
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

function fitRect(width,height,aspect,widthRatio=.78,heightRatio=.56){
  let w=width*widthRatio,h=w/aspect;
  const maxH=height*heightRatio;
  if(h>maxH){h=maxH;w=h*aspect;}
  return {x:(width-w)/2,y:(height-h)/2,w,h};
}
function imageRect(gift,card,marginRatio=.018){
  const image=gift?.certificateImage;
  if(!image||(image.naturalWidth||image.width)<=0||(image.naturalHeight||image.height)<=0)return null;
  const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height,margin=card.w*marginRatio;
  const scale=Math.min((card.w-margin*2)/iw,(card.h-margin*2)/ih);
  const w=iw*scale,h=ih*scale;
  return {x:card.x+(card.w-w)/2,y:card.y+(card.h-h)/2,w,h,iw,ih,image};
}
function drawCardFrame(ctx,gift,card,progress,alpha=1,drawImage=true){
  ctx.save();ctx.globalAlpha=alpha;
  ctx.shadowColor=`rgba(0,0,0,${mix(.21,.13,progress)})`;
  ctx.shadowBlur=card.w*mix(.026,.016,progress);ctx.shadowOffsetY=card.h*mix(.024,.011,progress);
  ctx.fillStyle='#fffdfa';ctx.fillRect(card.x,card.y,card.w,card.h);ctx.shadowColor='transparent';
  const inner=imageRect(gift,card,mix(.018,.012,progress));
  if(drawImage&&inner){ctx.drawImage(inner.image,inner.x,inner.y,inner.w,inner.h);}
  else if(!inner){
    const en=gift?.lang==='en';ctx.fillStyle='#25423c';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`600 ${Math.max(15,card.w*.048)}px Georgia`;
    ctx.fillText(gift?.title||(en?'A gift for you':'Подарок для вас'),card.x+card.w/2,card.y+card.h*.47,card.w*.84);
    if(gift?.amount){ctx.font=`500 ${Math.max(13,card.w*.038)}px Arial`;ctx.fillText(String(gift.amount),card.x+card.w/2,card.y+card.h*.66,card.w*.8);}
  }
  ctx.restore();
  return inner;
}

function drawContinuousFocus(ctx,width,height,art,gift,raw,options){
  if(options.thumbnail)return;
  const approach=smooth(raw,.79,.94);
  if(approach<=0)return;

  const mapped=remap(raw),pose=base.envelopePose(mapped),layout=base.envelopeLayout(width,height,art,false);
  const start={x:layout.x+layout.w*.09,y:layout.y+layout.h*(.12-pose.lift),w:layout.w*.82,h:layout.h*.69};
  const frameTarget=fitRect(width,height,start.w/start.h,.78,.56);
  const card=rectMix(start,frameTarget,approach);
  const bg=options.theme==='dark'?'#0b191b':'#e8f3ef';

  // The base renderer has already drawn this card. Replace exactly that rectangle
  // with the one moving toward the viewer so there is never a doubled certificate.
  const eraseX=start.x-start.w*.052,eraseY=start.y-start.h*.065;
  ctx.save();ctx.fillStyle=bg;ctx.fillRect(eraseX,eraseY,start.w*1.104,start.h*1.14);ctx.restore();

  const image=gift?.certificateImage;
  const release=image?smooth(raw,.88,.998):0;
  const packageFade=smooth(raw,.885,.995);
  if(packageFade>0){ctx.save();ctx.globalAlpha=packageFade;ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);ctx.restore();}

  if(image){
    // Keep the white insert physically stable first. Near the camera, dissolve only
    // the insert frame while the *same uploaded certificate image* continues its
    // trajectory to its real aspect ratio. This avoids both a card-shape morph and
    // a cut to a second certificate.
    const frameAlpha=1-release;
    const inner=drawCardFrame(ctx,gift,card,approach,frameAlpha,false);
    if(inner){
      const finalImage=fitRect(width,height,inner.iw/inner.ih,.90,.88);
      const moving=rectMix({x:inner.x,y:inner.y,w:inner.w,h:inner.h},finalImage,release);
      ctx.save();
      ctx.shadowColor=`rgba(0,0,0,${mix(.18,.10,release)})`;ctx.shadowBlur=moving.w*mix(.018,.012,release);ctx.shadowOffsetY=moving.h*.012;
      ctx.drawImage(inner.image,moving.x,moving.y,moving.w,moving.h);
      ctx.restore();
    }
  }else{
    drawCardFrame(ctx,gift,card,approach,1,true);
  }
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
    this.duration=reducedMotion?.8:5.35;
    this.playElapsed=0;this.playing=true;this.start();return true;
  }
}
