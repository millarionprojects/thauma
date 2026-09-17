import assert from 'node:assert/strict';
import fs from 'node:fs';
import {beginCertificateTransition,homography,project} from '../assets/certificate-presentation.js';
const nodes=new Set(),events=new Map(),frames=new Map();let id=0;
function classList(){const names=new Set();return{add:n=>names.add(n),remove:n=>names.delete(n),contains:n=>names.has(n)};}
function element(){return{style:{},classList:classList(),setAttribute(){},remove(){nodes.delete(this);},getContext(){return{drawImage(){}};}};}
globalThis.document={hidden:false,createElement:element,body:{append:n=>nodes.add(n)},addEventListener:(n,f)=>events.set(f,n),removeEventListener:(n,f)=>events.delete(f)};
globalThis.window={addEventListener:(n,f)=>events.set(f,n),removeEventListener:(n,f)=>events.delete(f)};
globalThis.requestAnimationFrame=f=>{frames.set(++id,f);return id;};globalThis.cancelAnimationFrame=i=>frames.delete(i);
function tick(time){const pending=[...frames.values()];frames.clear();pending.forEach(f=>f(time));}
function setup(hasCertificate=true){
 const image={width:360,height:600},quad=[{x:90,y:40},{x:162,y:40},{x:162,y:160},{x:90,y:160}];
 const opening=element(),reveal=element(),preview=element();Object.assign(preview,{clientLeft:1,clientTop:1,clientWidth:320,clientHeight:400,getBoundingClientRect:()=>({left:20,top:180,width:322,height:402})});
 const scene={width:250,height:330,progress:1,elapsed:5.6,visible:true,renderCount:0,
  canvas:{getBoundingClientRect:()=>({left:0,top:200,width:250,height:330})},
  certificateSnapshot:()=>hasCertificate?{image,quad}:null,
  setCertificateVisible(value){this.visible=value;},render(){this.renderCount++;}};
 return{scene,opening,reveal,preview};
}
{
 const context=setup(),flight=beginCertificateTransition(context);
 assert.equal(nodes.size,1);assert.equal(context.scene.visible,false);assert(context.preview.classList.contains('certificate-in-flight'));
 const initial=[...nodes][0].style.transform,values=initial.slice(9,-1).split(',').map(Number);
 assert.equal(values[12],90);assert.equal(values[13],240,'Initial projection uses actual canvas offset, not guessed scene percentages');
 tick(0);tick(425);assert.equal(nodes.size,1);assert.notEqual([...nodes][0].style.transform,initial);
 tick(850);assert(await flight.finished);assert.equal(nodes.size,0);assert.equal(context.scene.visible,true);assert.equal(events.size,0);assert.equal(frames.size,0);
 assert(!context.preview.classList.contains('certificate-in-flight'));
}
{
 const context=setup(),flight=beginCertificateTransition(context);tick(0);tick(100);flight.cancel();assert.equal(await flight.finished,false);assert.equal(nodes.size,0);assert.equal(events.size,0);assert.equal(frames.size,0);
 const replay=beginCertificateTransition(context);tick(200);tick(1050);assert(await replay.finished);assert.equal(nodes.size,0);
}
{
 const flight=beginCertificateTransition({...setup(),reducedMotion:true});assert(await flight.finished);assert.equal(nodes.size,0);assert.equal(frames.size,0);
}
{
 const context=setup(false),flight=beginCertificateTransition(context);assert.equal(nodes.size,0);tick(0);tick(320);assert(await flight.finished);
}
{
 const flight=beginCertificateTransition(setup());document.hidden=true;for(const [fn,event]of [...events])if(event==='visibilitychange')fn();assert(await flight.finished);document.hidden=false;assert.equal(nodes.size,0);
}
const source=fs.readFileSync(new URL('../assets/open-continuous-review.js',import.meta.url),'utf8');
const sanitize=new Function(source.slice(source.indexOf('function se('),source.indexOf('\nconst e ='))+';return se;')();
const privateGift={design:'classic',theme:'light',lang:'en',title:'PRIVATE',message:'PRIVATE',amount:'100',file:{name:'SECRET.pdf'},certificateImage:{private:true},audio:{blob:'PRIVATE AUDIO'}};
const safe=sanitize(privateGift);assert(!safe.file&&!safe.certificateImage&&!safe.audio);assert.equal(safe.title,'A gift for you');assert.equal(sanitize(privateGift,true).certificateImage,privateGift.certificateImage);
const html=fs.readFileSync(new URL('../open.html',import.meta.url),'utf8');assert(!html.includes('preview-open-upgrades.js'),'No racing observer handoff remains');
const css=fs.readFileSync(new URL('../assets/polish-review.css',import.meta.url),'utf8');assert(css.includes('.gift-stage{overflow:clip}'),'The stage cannot acquire a hidden internal scroll offset');assert(css.includes('scrollbar-gutter:stable'),'The final view must not change desktop horizontal centering');
const {recordingLength}=await import('../assets/export-audio-preview.js');assert.equal(recordingLength(5.8),7.8);assert.equal(recordingLength(5.8,18),19);
console.log('PASS: exact live handoff, one image, cleanup, replay, reduced motion, visibility loss, fallback, safe exports, final hold/audio duration.');
