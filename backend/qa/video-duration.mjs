import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {webkit,chromium} from 'playwright';
import {normalizeMp4Timeline} from '../../assets/mp4-integrity.js';

const root=resolve(new URL('../../',import.meta.url).pathname),id='b'.repeat(64);
const dir=mkdtempSync(join(tmpdir(),'thauma-player-'));
const path=join(dir,'player.mp4');
execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=160x288:rate=30',
  '-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v','libx264','-preset','ultrafast','-c:a','aac',path]);
const original=readFileSync(path),damaged=Buffer.from(original);
function damage(start=0,end=damaged.length){
  for(let p=start;p<end;){
    const size=damaged.readUInt32BE(p),type=damaged.toString('ascii',p+4,p+8);
    if(['moov','trak','mdia'].includes(type))damage(p+8,p+size);
    if(['mvhd','tkhd','mdhd'].includes(type)){
      assert.equal(damaged[p+8],0);
      damaged.writeUInt32BE(0x7fffffff,p+8+(type==='tkhd'?20:16));
    }
    p+=size;
  }
}
damage();
const repaired=Buffer.from(await (await normalizeMp4Timeline(new Blob([damaged],{type:'video/mp4'}),undefined,{expectedDuration:3})).arrayBuffer());
function wav(seconds){
  const rate=48000,count=rate*seconds,out=Buffer.alloc(44+count*2);
  out.write('RIFF',0);out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);
  out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);
  out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);
  out.write('data',36);out.writeUInt32LE(count*2,40);
  for(let i=0;i<count;i++)out.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/rate)*6000),44+i*2);
  return out;
}
const audio=wav(12);
let base;
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,base).pathname;
    if(pathname==='/fixture.mp4'){res.writeHead(200,{'Content-Type':'video/mp4'});res.end(repaired);return;}
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
    const types={'.js':'text/javascript','.mjs':'text/javascript','.html':'text/html','.css':'text/css','.webp':'image/webp'};
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
try{
  for(const [name,engine] of [['WebKit',webkit],['Chrome',chromium]]){
    const browser=await engine.launch(name==='Chrome'?{channel:'chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{});
    try{
      const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
      await context.route('**/api/config',route=>route.fulfill({headers:{'Access-Control-Allow-Origin':base},
        contentType:'application/json',body:JSON.stringify({publicSharing:true,audioSharing:true})}));
      const page=await context.newPage();
      await page.goto(base);
      const native=await page.evaluate(async()=>{
        const bounded=promise=>new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(Error('Media did not finish within 15 seconds')),15000);
          promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
        });
        const v=document.createElement('video');v.muted=true;v.playsInline=true;document.body.append(v);
        const loaded=new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=()=>reject(Error('MP4 decode failed: '+v.error?.code+' '+v.error?.message));});
        const url=URL.createObjectURL(await(await fetch('/fixture.mp4')).blob());
        v.src=url;await bounded(loaded);
        const duration=v.duration;
        const seeked=new Promise((resolve,reject)=>{v.onseeked=resolve;v.onerror=()=>reject(Error('MP4 seek failed: '+v.error?.code+' '+v.error?.message));});
        v.currentTime=2.8;await bounded(seeked);
        const result={duration,width:v.videoWidth,ready:v.readyState,time:v.currentTime};v.remove();URL.revokeObjectURL(url);return result;
      });
      assert.ok(Math.abs(native.duration-3)<.05);assert.equal(native.width,160);
      assert.ok(native.ready>=2);assert.ok(Math.abs(native.time-2.8)<.1);
      console.log('PASS: '+name+' native player reports repaired MP4 duration and decodes its final frame');

      const png=Buffer.from(await page.evaluate(()=>{
        const c=document.createElement('canvas');c.width=960;c.height=540;
        const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
        ctx.fillStyle='#153e36';ctx.font='52px serif';ctx.fillText('Gift certificate',80,180);
        return c.toDataURL('image/png').split(',')[1];
      }),'base64');
      await context.route('**/api/gifts/**',async route=>{
        const pathname=new URL(route.request().url()).pathname,headers={'Access-Control-Allow-Origin':base};
        if(pathname.endsWith('/audio'))return route.fulfill({headers,contentType:'audio/wav',body:audio});
        if(pathname.endsWith('/file'))return route.fulfill({headers,contentType:'image/png',body:png});
        return route.fulfill({headers,contentType:'application/json',body:JSON.stringify({
          id,title:'Gift',amount:'',message:'Happy birthday',design:'classic',lang:'ru',theme:'light',
          file:{name:'certificate.png',type:'image/png',size:png.length},
          audio:{name:'music.wav',type:'audio/wav',size:audio.length},expiresAt:Date.now()+86400000
        })});
      });
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.addInitScript(()=>{
        const Base=window.MediaRecorder;if(!Base)return;
        window.__exportRecordings=[];
        window.MediaRecorder=class extends Base{
          constructor(stream,options){
            super(stream,options);
            const entry={mime:options?.mimeType,events:[],chunks:[]};
            window.__exportRecordings.push(entry);
            for(const event of ['start','stop','pause','resume','error'])this.addEventListener(event,()=>entry.events.push({event,time:performance.now()}));
            this.addEventListener('dataavailable',event=>{if(event.data.size)entry.chunks.push(event.data);});
          }
        };
      });
      await page.goto(base+'/open.html?id='+id,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#openButton')?.disabled===false,null,{timeout:30000});
      await page.locator('#openButton').click();
      await page.waitForFunction(()=>document.querySelector('#giftStage').dataset.state==='revealed');
      const supported=await page.evaluate(()=>!!HTMLCanvasElement.prototype.captureStream&&!!window.MediaRecorder);
      if(!supported){
        console.log('SKIP: '+name+' build cannot record canvas streams; native MP4 metadata test passed');
      }else{
        for(const sound of [true,false]){
          await page.locator('#soundVideo').setChecked(sound);
          await page.locator('#downloadVideo').click();
          await page.waitForFunction(()=>{
            const preview=document.querySelector('#exportPreview'),status=document.querySelector('#revealStatus');
            return !preview.hidden||!!status.dataset.exportError;
          },null,{timeout:90000});
          const status=await page.locator('#revealStatus').innerText();
          if(!await page.locator('#exportPreview').isVisible()){
            const diagnostic=await page.evaluate(async()=>{
              const entry=window.__exportRecordings.at(-1),blob=new Blob(entry.chunks,{type:entry.mime});
              const {inspectMp4}=await import('./assets/mp4-integrity.js?v=20261003-duration1');
              const inspected=blob.type.startsWith('video/mp4')?await inspectMp4(blob):null;
              return {mime:entry.mime,size:blob.size,events:entry.events,inspected};
            });
            console.log('Export diagnostics: '+JSON.stringify(diagnostic));
          }
          assert.equal(await page.locator('#exportPreview').isVisible(),true,status);
          const result=await page.evaluate(async()=>{
            const bounded=promise=>new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>reject(Error('Media did not finish within 15 seconds')),15000);
          promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
        });
            const video=document.querySelector('#exportPreview'),download=document.querySelector('#downloadVideoFile');
            if(video.readyState<1)await bounded(new Promise((resolve,reject)=>{
              video.addEventListener('loadedmetadata',resolve,{once:true});video.addEventListener('error',reject,{once:true});
            }));
            if(!Number.isFinite(video.duration)){
              const scanned=new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));
              video.currentTime=1e9;await bounded(scanned);
            }
            const duration=video.duration,expected=Number(video.dataset.expectedDuration),actual=Number(video.dataset.actualDuration);
            const target=Math.max(0,Math.min(expected-.4,duration-.1));
            const seeked=new Promise(resolve=>video.addEventListener('seeked',resolve,{once:true}));
            video.currentTime=target;await bounded(seeked);
            const blob=await (await fetch(download.href)).blob();
            return {duration,expected,actual,ready:video.readyState,time:video.currentTime,type:blob.type,size:blob.size,
              sameFile:video.src===download.href};
          });
          assert.ok(Math.abs(result.actual-result.expected)<.75,JSON.stringify(result));
          assert.ok(Math.abs(result.duration-result.expected)<.75,JSON.stringify(result));
          assert.ok(result.ready>=2);assert.equal(result.sameFile,true);assert.ok(result.size>10000);
          assert.ok(result.expected>=(sound?12:7));
          assert.match(status,/Видео готово:/);
          console.log('PASS: '+name+' actual '+(sound?'12-second soundtrack':'silent')+' export, verified and saved duration '+result.duration.toFixed(2)+' s ('+result.type+')');
        }
      }
      assert.deepEqual(errors,[]);await context.close();
    }finally{await browser.close();}
  }
}finally{await new Promise(resolve=>server.close(resolve));rmSync(dir,{recursive:true,force:true});}
