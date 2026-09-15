const stage=document.getElementById('giftStage');
const sceneCanvas=document.getElementById('sceneCanvas');
const preview=document.getElementById('certificatePreview');
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let lastState=stage?.dataset.state||'';
let bridge=null;
let bridgeTimer=0;
let pdfBusy=false;

function sourceAspect(node){
  if(node?.tagName==='IMG')return (node.naturalWidth||1)/(node.naturalHeight||1);
  if(node?.tagName==='CANVAS')return (node.width||1)/(node.height||1);
  return 1.55;
}

function fitRect(box,aspect){
  let width=box.width,height=width/aspect;
  if(height>box.height){height=box.height;width=height*aspect;}
  return {left:box.left+(box.width-width)/2,top:box.top+(box.height-height)/2,width,height};
}

function cloneVisual(source){
  if(!source)return null;
  if(source.tagName==='IMG'){
    const image=source.cloneNode();
    image.removeAttribute('id');
    return image;
  }
  if(source.tagName==='CANVAS'){
    const canvas=document.createElement('canvas');
    canvas.width=source.width;canvas.height=source.height;
    canvas.getContext('2d')?.drawImage(source,0,0);
    return canvas;
  }
  if(source.classList?.contains('demo-certificate'))return source.cloneNode(true);
  return null;
}

function startRectFor(design,sceneRect,aspect){
  const envelope=design.startsWith('envelope');
  const widthRatio=envelope?.84:design==='scroll'?.47:design==='balloon'?.38:.39;
  const centerY=envelope?.38:design==='scroll'?.45:.48;
  const width=envelope?sceneRect.width*widthRatio:Math.min(sceneRect.width*widthRatio,230),height=width/aspect;
  return {left:sceneRect.left+(sceneRect.width-width)/2,top:sceneRect.top+sceneRect.height*centerY-height/2,width,height};
}

function cleanupBridge(){
  clearTimeout(bridgeTimer);bridgeTimer=0;
  if(preview)preview.style.opacity='1';
  if(sceneCanvas){sceneCanvas.style.opacity='1';sceneCanvas.style.transition='';}
  bridge?.remove();bridge=null;
}

function beginSeamlessHandoff(){
  if(reducedMotion.matches||!stage||!sceneCanvas||!preview||bridge)return;
  const source=preview.querySelector('img,canvas,.demo-certificate');
  if(!source)return;
  const visual=cloneVisual(source);
  if(!visual)return;
  const sceneRect=sceneCanvas.getBoundingClientRect(),targetRect=preview.getBoundingClientRect();
  if(!sceneRect.width||!targetRect.width)return;
  const aspect=sourceAspect(source),design=stage.dataset.design||'';
  const start=startRectFor(design,sceneRect,aspect),end=fitRect(targetRect,aspect);
  bridge=visual;
  visual.classList.add('preview-bridge-card');
  Object.assign(visual.style,{position:'fixed',left:start.left+'px',top:start.top+'px',width:start.width+'px',height:start.height+'px',margin:'0',zIndex:'1000',pointerEvents:'none',objectFit:'contain',transformOrigin:'center center',opacity:'1'});
  preview.style.opacity='0';
  document.body.append(visual);

  // The rendered scene gives way to the exact certificate clone with a very short
  // crossfade, avoiding the double-card ghost that was visible on iPhone.
  sceneCanvas.style.transition='opacity 160ms ease';
  bridgeTimer=setTimeout(()=>{if(sceneCanvas)sceneCanvas.style.opacity='0';},70);

  const animation=visual.animate([
    {left:start.left+'px',top:start.top+'px',width:start.width+'px',height:start.height+'px',transform:'translate3d(0,0,0)'},
    {offset:.58,transform:'translate3d(0,-1px,0)'},
    {left:end.left+'px',top:end.top+'px',width:end.width+'px',height:end.height+'px',transform:'translate3d(0,0,0)'}
  ],{duration:620,easing:'cubic-bezier(.2,.72,.25,1)',fill:'forwards'});
  animation.onfinish=cleanupBridge;
  animation.oncancel=cleanupBridge;
}

async function renderFirstPdfPage(object){
  if(pdfBusy||!object?.data||object.dataset.previewHandled)return;
  pdfBusy=true;object.dataset.previewHandled='1';
  try{
    const response=await fetch(object.data);
    const bytes=new Uint8Array(await response.arrayBuffer());
    const {getDocument,GlobalWorkerOptions}=await import('./pdf-DCt7qnim.js');
    const {default:worker}=await import('./pdf.worker.min-B8x2eVDF.js');
    GlobalWorkerOptions.workerSrc=worker;
    const task=getDocument({data:bytes,isEvalSupported:false});
    const pdf=await task.promise,page=await pdf.getPage(1),raw=page.getViewport({scale:1});
    const scale=Math.min(2,1800/Math.max(raw.width,raw.height)),viewport=page.getViewport({scale});
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    canvas.dataset.pdfFirstPage='1';canvas.setAttribute('aria-label','Первая страница сертификата');
    await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
    object.replaceWith(canvas);
    await pdf.destroy();
  }catch(error){
    object.dataset.previewHandled='';
    console.warn('Thauma preview: PDF first page unavailable',error);
  }finally{pdfBusy=false;}
}

function upgradeCertificatePreview(){
  if(!preview)return;
  const object=preview.querySelector('object[type="application/pdf"]');
  if(object)renderFirstPdfPage(object);
  const image=preview.querySelector('img');
  if(image){image.decoding='async';image.draggable=false;}
}

if(preview){
  new MutationObserver(upgradeCertificatePreview).observe(preview,{childList:true,subtree:true});
  upgradeCertificatePreview();
}

if(stage){
  new MutationObserver(()=>{
    const state=stage.dataset.state||'';
    if(state==='transition'&&lastState!=='transition'){
      upgradeCertificatePreview();
      requestAnimationFrame(()=>requestAnimationFrame(beginSeamlessHandoff));
    }
    if(state==='idle')cleanupBridge();
    lastState=state;
  }).observe(stage,{attributes:true,attributeFilter:['data-state']});
}
