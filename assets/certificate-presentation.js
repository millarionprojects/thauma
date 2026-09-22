// One measured certificate surface, shared by live handoff and recorded video.
export const PRESENTATION_SECONDS=.85;
const clamp=x=>Math.max(0,Math.min(1,x));
export const ease=x=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10);};
const part=(p,a,b)=>ease((p-a)/(b-a));
const mix=(a,b,t)=>a+(b-a)*t;
export function fitRect(box,aspect){
  const width=Math.min(box.width,box.height*aspect),height=width/aspect;
  return{left:box.left+(box.width-width)/2,top:box.top+(box.height-height)/2,width,height};
}
export const rectQuad=r=>[{x:r.left,y:r.top},{x:r.left+r.width,y:r.top},{x:r.left+r.width,y:r.top+r.height},{x:r.left,y:r.top+r.height}];
export const mixQuad=(a,b,t)=>a.map((p,i)=>({x:mix(p.x,b[i].x,t),y:mix(p.y,b[i].y,t)}));
const mapQuad=(quad,box,w,h)=>quad.map(p=>({x:box.left+p.x*box.width/w,y:box.top+p.y*box.height/h}));

// Unit-square homography. CSS and canvas exports use the same projection.
export function homography(q){
  const [a,b,c,d]=q,dx1=b.x-c.x,dx2=d.x-c.x,dx3=a.x-b.x+c.x-d.x;
  const dy1=b.y-c.y,dy2=d.y-c.y,dy3=a.y-b.y+c.y-d.y,det=dx1*dy2-dx2*dy1;
  const g=Math.abs(det)>1e-9?(dx3*dy2-dx2*dy3)/det:0,h=Math.abs(det)>1e-9?(dx1*dy3-dx3*dy1)/det:0;
  return[b.x-a.x+g*b.x,d.x-a.x+h*d.x,a.x,b.y-a.y+g*b.y,d.y-a.y+h*d.y,a.y,g,h];
}
export function project(h,u,v){const w=h[6]*u+h[7]*v+1;return{x:(h[0]*u+h[1]*v+h[2])/w,y:(h[3]*u+h[4]*v+h[5])/w};}
function cssMatrix(q){const [a,b,c,d,e,f,g,h]=homography(q);return`matrix3d(${a},${d},0,${g},${b},${e},0,${h},0,0,1,0,${c},${f},0,1)`;}

export function certificateSnapshot(scene){
  if(!scene)return null;
  if(scene.certificateSnapshot)return scene.certificateSnapshot();
  const card=scene.rig?.card,image=scene.gift?.certificateImage;
  if(!card||!image)return null;
  const face=card.children.find(n=>n.geometry?.type==='PlaneGeometry'&&n.material?.map?.image);
  if(!face)return null;
  const texture=face.material.map.image,iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
  if(!iw||!ih)return null;
  face.updateWorldMatrix(true,false);scene.camera.updateMatrixWorld();
  const fw=face.geometry.parameters.width,fh=face.geometry.parameters.height;
  const projected=(u,v)=>{
    const p=face.position.clone().set((u-.5)*fw,(.5-v)*fh,0).applyMatrix4(face.matrixWorld).project(scene.camera);
    return{x:(p.x+1)*scene.width/2,y:(1-p.y)*scene.height/2};
  };
  const scale=Math.min(1000/iw,616/ih),u=(1024-iw*scale)/2048,v=(640-ih*scale)/1280;
  const frame=document.createElement('canvas');frame.width=texture.width;frame.height=texture.height;
  frame.getContext('2d').fillStyle='#fff';frame.getContext('2d').fillRect(0,0,frame.width,frame.height);
  return{image,quad:[projected(u,v),projected(1-u,v),projected(1-u,1-v),projected(u,1-v)],frame,frameQuad:[projected(0,0),projected(1,0),projected(1,1),projected(0,1)]};
}
function overlay(image){
  const c=document.createElement('canvas');c.width=image.naturalWidth||image.width;c.height=image.naturalHeight||image.height;
  c.getContext('2d').drawImage(image,0,0,c.width,c.height);
  c.className='certificate-flight';c.setAttribute('aria-hidden','true');
  document.body.append(c);return c;
}

export function beginCertificateTransition({scene,opening,reveal,preview,reducedMotion=false}){
  let resolve,done=false,raf=0,imageLayer=null,frameLayer=null;
  const finished=new Promise(r=>{resolve=r;});
  const snapshot=reducedMotion?null:certificateSnapshot(scene);
  const cleanup=()=>{
    cancelAnimationFrame(raf);imageLayer?.remove();frameLayer?.remove();
    reveal.classList.remove('handoff-ready');preview.classList.remove('certificate-in-flight');
    opening.style.opacity='';opening.style.transition='';opening.style.transform='';
    reveal.style.opacity='';reveal.style.transition='';reveal.style.transform='';
    scene?.setCertificateVisible?.(true);
    window.removeEventListener('resize',finish);document.removeEventListener('visibilitychange',visibility);
  };
  const settle=completed=>{if(done)return;done=true;cleanup();resolve(completed);};
  const finish=()=>settle(true),visibility=()=>{if(document.hidden)finish();};
  if(reducedMotion){settle(true);return{finished,cancel:()=>settle(false),finish};}
  opening.style.transition='none';opening.style.transform='none';
  reveal.style.transition='none';reveal.style.transform='none';reveal.style.opacity='0';
  reveal.classList.add('handoff-ready');
  let start=null,startFrame=null,end=null,endFrame=null;
  if(snapshot){
    const box=scene.canvas.getBoundingClientRect();
    const target=preview.getBoundingClientRect();
    const content={left:target.left+preview.clientLeft,top:target.top+preview.clientTop,width:preview.clientWidth,height:preview.clientHeight};
    const ratio=(snapshot.image.naturalWidth||snapshot.image.width)/(snapshot.image.naturalHeight||snapshot.image.height);
    start=mapQuad(snapshot.quad,box,scene.width,scene.height);end=rectQuad(fitRect(content,ratio));
    endFrame=rectQuad(content);preview.classList.add('certificate-in-flight');
    if(snapshot.frame){frameLayer=overlay(snapshot.frame);startFrame=mapQuad(snapshot.frameQuad,box,scene.width,scene.height);frameLayer.style.transform=cssMatrix(startFrame);}
    imageLayer=overlay(snapshot.image);imageLayer.style.transform=cssMatrix(start);
    scene.setCertificateVisible?.(false);scene.render(scene.progress,scene.elapsed);
  }
  window.addEventListener('resize',finish);document.addEventListener('visibilitychange',visibility);
  let started=null;
  const duration=snapshot?PRESENTATION_SECONDS*1000:320;
  const tick=time=>{
    if(done)return;if(started===null)started=time;
    const p=clamp((time-started)/duration),t=ease(p);
    opening.style.opacity=String(1-part(p,.06,.72));reveal.style.opacity=String(part(p,.16,.88));
    if(imageLayer)imageLayer.style.transform=cssMatrix(mixQuad(start,end,t));
    if(frameLayer){frameLayer.style.transform=cssMatrix(mixQuad(startFrame,endFrame,t));frameLayer.style.opacity=String(1-part(p,.12,.72));}
    if(p>=1)finish();else raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
  return{finished,cancel:()=>settle(false),finish};
}

function triangle(ctx,image,source,target){
  const [a,b,c]=source,[p,q,r]=target,det=(b.x-a.x)*(c.y-a.y)-(c.x-a.x)*(b.y-a.y);
  if(Math.abs(det)<1e-9)return;
  const A=((q.x-p.x)*(c.y-a.y)-(r.x-p.x)*(b.y-a.y))/det;
  const B=((q.y-p.y)*(c.y-a.y)-(r.y-p.y)*(b.y-a.y))/det;
  const C=((r.x-p.x)*(b.x-a.x)-(q.x-p.x)*(c.x-a.x))/det;
  const D=((r.y-p.y)*(b.x-a.x)-(q.y-p.y)*(c.x-a.x))/det;
  const center={x:(p.x+q.x+r.x)/3,y:(p.y+q.y+r.y)/3};
  ctx.save();ctx.beginPath();
  target.forEach((v,i)=>{const dx=v.x-center.x,dy=v.y-center.y,k=1+.25/Math.max(1,Math.hypot(dx,dy));const x=center.x+dx*k,y=center.y+dy*k;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.closePath();ctx.clip();ctx.transform(A,B,C,D,p.x-A*a.x-C*a.y,p.y-B*a.x-D*a.y);ctx.drawImage(image,0,0);ctx.restore();
}
export function drawQuad(ctx,image,quad){
  const iw=image.naturalWidth||image.width,ih=image.naturalHeight||image.height;
  if(Math.abs(quad[0].y-quad[1].y)<.01&&Math.abs(quad[1].x-quad[2].x)<.01&&Math.abs(quad[2].y-quad[3].y)<.01&&Math.abs(quad[3].x-quad[0].x)<.01){ctx.drawImage(image,quad[0].x,quad[0].y,quad[1].x-quad[0].x,quad[3].y-quad[0].y);return;}
  const h=homography(quad),steps=6;
  for(let y=0;y<steps;y++)for(let x=0;x<steps;x++){
    const uv=[[x/steps,y/steps],[(x+1)/steps,y/steps],[(x+1)/steps,(y+1)/steps],[x/steps,(y+1)/steps]];
    const target=uv.map(([u,v])=>project(h,u,v)),source=uv.map(([u,v])=>({x:u*iw,y:v*ih}));
    for(const ids of [[0,1,2],[0,2,3]])triangle(ctx,image,ids.map(i=>source[i]),ids.map(i=>target[i]));
  }
}
export function drawExportPresentation(ctx,scene,box,progress){
  const p=clamp(progress),t=ease(p);
  if(p<=0){ctx.drawImage(scene.canvas,box.left,box.top,box.width,box.height);return;}
  if(!scene.presentationSnapshot)scene.presentationSnapshot=certificateSnapshot(scene);
  const snapshot=scene.presentationSnapshot;
  if(!snapshot){ctx.drawImage(scene.canvas,box.left,box.top,box.width,box.height);return;}
  scene.setCertificateVisible?.(false);scene.render(1,scene.elapsed);
  ctx.save();ctx.globalAlpha*=1-part(p,.06,.72);ctx.drawImage(scene.canvas,box.left,box.top,box.width,box.height);ctx.restore();
  const start=mapQuad(snapshot.quad,box,scene.width,scene.height);
  const ratio=(snapshot.image.naturalWidth||snapshot.image.width)/(snapshot.image.naturalHeight||snapshot.image.height);
  const targetBox={left:box.left+box.width*.05,top:box.top+box.height*.06,width:box.width*.90,height:box.height*.88};
  const end=rectQuad(fitRect(targetBox,ratio));
  if(snapshot.frame&&p<.72){ctx.save();ctx.globalAlpha*=1-part(p,.12,.72);drawQuad(ctx,snapshot.frame,mixQuad(mapQuad(snapshot.frameQuad,box,scene.width,scene.height),end,t));ctx.restore();}
  drawQuad(ctx,snapshot.image,mixQuad(start,end,t));
}
