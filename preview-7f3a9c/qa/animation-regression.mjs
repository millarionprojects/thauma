// Run with node --expose-gc; THAUMA_TEST_PACKAGE points to a package.json whose
// dependencies include three and @napi-rs/canvas. No browser or GPU is required.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(process.env.THAUMA_TEST_PACKAGE||path.resolve('package.json'));
const THREE=require('three'),{createCanvas,loadImage}=require('@napi-rs/canvas');
const output=process.env.THAUMA_QA_OUTPUT||path.resolve('qa-output');fs.mkdirSync(output,{recursive:true});
const listeners=new Map(),frames=new Map();let frameId=0;
globalThis.document={hidden:false,createElement(){const c=createCanvas(1,1);c.dataset={};c.setAttribute=()=>{};return c;},addEventListener(n,f){listeners.set(f,n);},removeEventListener(n,f){listeners.delete(f);}};
globalThis.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};
globalThis.cancelAnimationFrame=id=>frames.delete(id);
const pkg=await import('../assets/scene-engine-preview.js');
const env=await import('../assets/envelope-art-preview.js');
const baseEnv=await import('../assets/envelope-art-continuous.js?base=20260916-astra1');
const {keepCopperDetails}=await import('../assets/envelope-scenes-preview.js');
const presentation=await import('../assets/certificate-presentation.js');
const certificate=createCanvas(360,600),ct=certificate.getContext('2d');
ct.fillStyle='#fc2ecc';ct.fillRect(0,0,360,600);ct.fillStyle='#153b35';ct.fillRect(12,12,336,576);
ct.fillStyle='white';ct.font='26px sans-serif';ct.fillText('TEST CERTIFICATE',40,100);ct.fillText('NO PERSONAL DATA',28,520);
fs.writeFileSync(path.join(output,'portrait-certificate.png'),certificate.toBuffer('image/png'));
const gift={title:'Test certificate',amount:'',lang:'en',theme:'light',certificateImage:certificate};
function pixelDifference(a,b){const x=a.getContext('2d').getImageData(0,0,a.width,a.height).data,y=b.getContext('2d').getImageData(0,0,b.width,b.height).data;let sum=0;for(let i=0;i<x.length;i++)sum+=Math.abs(x[i]-y[i]);return sum/x.length;}
function colorPixels(c){const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i]>220&&d[i+1]<80&&d[i+2]>160)n++;return n;}
const phases=[0,.45,.65,.76,.8,.87,.94,1],w=250,h=330;
const sheet=createCanvas(w*phases.length,(h+28)*3),sh=sheet.getContext('2d');sh.fillStyle='#e8f3ef';sh.fillRect(0,0,sheet.width,sheet.height);
let row=0;
for(const [design,spec]of Object.entries(env.envelopeArt)){
 const image=await loadImage(fileURLToPath(new URL('../media/'+spec.file,import.meta.url))),art=env.buildEnvelopeLayers(image,spec);
 if(design==='envelope-copper')keepCopperDetails(art);
 const closed=createCanvas(w,h),baseline=createCanvas(w,h);env.drawEnvelope(closed.getContext('2d'),w,h,art,gift,0);baseEnv.drawEnvelope(baseline.getContext('2d'),w,h,art,gift,0);
 assert.equal(pixelDifference(closed,baseline),0,'Closed artwork must not change');assert.equal(colorPixels(closed),0);
 for(const[col,p]of phases.entries()){
   const c=createCanvas(w,h);env.drawEnvelope(c.getContext('2d'),w,h,art,gift,p);sh.drawImage(c,col*w,row*(h+28)+28);
   sh.fillStyle='#153b35';sh.font='14px sans-serif';sh.fillText(design+' '+p,col*w+8,row*(h+28)+19);
 }
 const a=createCanvas(w,h),b=createCanvas(w,h);env.drawEnvelope(a.getContext('2d'),w,h,art,gift,.76);env.drawEnvelope(b.getContext('2d'),w,h,art,gift,.76001);
 const boundaryDifference=pixelDifference(a,b);console.log(design,'focus boundary mean channel difference',boundaryDifference);
 assert(boundaryDifference<.02,'Layer ownership switches without an erase rectangle or jump');
 const c=document.createElement('canvas'),scene=new env.EnvelopeScene(c,art,{design,gift});scene.resize(w,h);scene.render(1);
 assert(colorPixels(c)>100,'Actual certificate remains visible');
 const snapshot=scene.certificateSnapshot(),expected=presentation.rectQuad(presentation.fitRect({left:w*.05,top:h*.06,width:w*.9,height:h*.88},.6));
 snapshot.quad.forEach((p,i)=>assert(Math.hypot(p.x-expected[i].x,p.y-expected[i].y)<1e-6));
 const exportCanvas=createCanvas(w,h),ec=exportCanvas.getContext('2d');ec.fillStyle='#e8f3ef';ec.fillRect(0,0,w,h);presentation.drawExportPresentation(ec,scene,{left:0,top:0,width:w,height:h},1);
 assert(colorPixels(exportCanvas)>100);scene.reset();assert.equal(colorPixels(c),0);assert(!scene.certificateHidden);
 let complete=0;scene.play({onComplete:()=>complete++,reducedMotion:true});assert.equal(scene.play({}),false);
 for(let time=0;time<1200;time+=100){const tick=[...frames.values()];frames.clear();tick.forEach(fn=>fn(time));}
 assert.equal(complete,1);scene.dispose();assert.equal(listeners.size,0);assert.equal(frames.size,0);
 const safe=createCanvas(w,h);env.drawEnvelope(safe.getContext('2d'),w,h,art,{title:'A gift for you'},1);assert.equal(colorPixels(safe),0);
 row++;globalThis.gc?.();
}
fs.writeFileSync(path.join(output,'envelopes-after.png'),sheet.toBuffer('image/png'));
const q=[{x:20,y:40},{x:210,y:30},{x:230,y:180},{x:10,y:200}],matrix=presentation.homography(q);
[[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const p=presentation.project(matrix,u,v);assert(Math.hypot(p.x-q[i].x,p.y-q[i].y)<1e-8);});
const report=[];
for(const design of ['classic','jewelry','him','case','balloon','scroll']){
 const {root,rig}=pkg.createObjectRig(design,{...gift,message:'A test message'}),objects=[];root.traverse(o=>{if(o.isMesh)objects.push(o);});
 const isCard=o=>{for(let p=o;p;p=p.parent)if(p===rig.card)return true;return false;};
 const cardBox=new THREE.Box3(new THREE.Vector3(-1.069,-.659,.018),new THREE.Vector3(1.069,.659,.022));
 const triangle=new THREE.Triangle(),collisions=[];
 for(let i=0;i<=240;i++){
  const p=i/240;rig.update(p,p*pkg.D[design]);root.updateMatrixWorld(true);
  objects.forEach(o=>assert(o.matrixWorld.elements.every(Number.isFinite)));
  if(!rig.card?.visible||p<=.25)continue;
  const inverse=new THREE.Matrix4().copy(rig.card.matrixWorld).invert();
  for(const o of objects){
   if(isCard(o)||o.isInstancedMesh||o.material.transmission>0)continue;
   let hidden=false;for(let a=o;a;a=a.parent)if(!a.visible)hidden=true;if(hidden)continue;
   const matrix=new THREE.Matrix4().multiplyMatrices(inverse,o.matrixWorld),g=o.geometry;
   if(!g.boundingBox)g.computeBoundingBox();if(!g.boundingBox.clone().applyMatrix4(matrix).intersectsBox(cardBox))continue;
   const pos=g.attributes.position,index=g.index,count=index?.count||pos.count;let hit=false;
   for(let j=0;j<count&&!hit;j+=3){for(const[k,v]of [[0,triangle.a],[1,triangle.b],[2,triangle.c]])v.fromBufferAttribute(pos,index?index.getX(j+k):j+k).applyMatrix4(matrix);hit=cardBox.intersectsTriangle(triangle);}
   if(hit)collisions.push({progress:p,seconds:p*pkg.D[design],mesh:objects.indexOf(o),geometry:g.type});
  }
 }
 if(rig.card){
   rig.update(1,pkg.D[design]);root.updateMatrixWorld(true);
   const camera=new THREE.PerspectiveCamera(35,390/480,.1,70);camera.position.set(2.258,5.48,8.97);camera.lookAt(0,1.74,0);camera.updateMatrixWorld();
   const snap=presentation.certificateSnapshot({rig,gift,camera,width:390,height:480});assert(snap?.quad.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 }
 report.push({design,positions:241,collisions});
 console.log(design,collisions.length?JSON.stringify(collisions):'PASS no sampled certificate intersections');
 const geometries=new Set(),materials=new Set(),textures=new Set();root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));});
 materials.forEach(m=>{for(const k of ['map','bumpMap','emissiveMap'])if(m[k])textures.add(m[k]);m.dispose();});textures.forEach(t=>t.dispose());geometries.forEach(g=>g.dispose());globalThis.gc?.();
}
fs.writeFileSync(path.join(output,'model-regression.json'),JSON.stringify(report,null,2));
assert(report.every(r=>!r.collisions.length),'Certificate must clear every packaging surface');
console.log('PASS: exact projections, three envelope identities, single insert, privacy, replay, reduced motion, six model sweeps.');
