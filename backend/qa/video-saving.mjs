import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';

const root=resolve(new URL('../../',import.meta.url).pathname),id='b'.repeat(64);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5YsAAAAASUVORK5CYII=','base64');
let base;
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,base).pathname;
    const file=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(root+'/')){res.writeHead(403);res.end();return;}
    const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.webp':'image/webp'};
    res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  for(const failure of ['normalization','verification','abort']){
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    try{
      await context.route('**/api/config',route=>route.fulfill({headers:{'Access-Control-Allow-Origin':base},
        contentType:'application/json',body:JSON.stringify({publicSharing:true,audioSharing:true})}));
      await context.route('**/api/gifts/**',route=>{
        const pathname=new URL(route.request().url()).pathname,headers={'Access-Control-Allow-Origin':base};
        if(pathname.endsWith('/file'))return route.fulfill({headers,contentType:'image/png',body:png});
        return route.fulfill({headers,contentType:'application/json',body:JSON.stringify({
          id,title:'Synthetic gift',amount:'',message:'Saving check',design:'classic',lang:'ru',theme:'light',
          file:{name:'check.png',type:'image/png',size:png.length},audio:null,expiresAt:Date.now()+86400000
        })});
      });
      async function wrapper(pattern,body){
        await context.route(pattern,route=>{
          if(new URL(route.request().url()).searchParams.get('qa')==='original')return route.continue();
          return route.fulfill({contentType:'text/javascript',body});
        });
      }
      // Shorten only the QA fixture; capture and encoding remain real.
      await wrapper('**/assets/export-audio-preview.js*',
        "export * from './export-audio-preview.js?qa=original';export function recordingLength(){return 1;}");
      const normalization=failure==='normalization'
        ?"throw new Error('Synthetic normalization failure');"
        :failure==='verification'
          ?"return new Blob([blob,'synthetic changed metadata'],{type:blob.type});"
          :"return blob;";
      await wrapper('**/assets/mp4-integrity.js*',
        "export * from './mp4-integrity.js?qa=original';export async function normalizeMp4Timeline(blob){"+normalization+"}");
      if(failure!=='normalization')await wrapper('**/assets/export-integrity.js*',
        "export * from './export-integrity.js?qa=original';export async function verifyVideo(){"+
        (failure==='abort'?"throw new DOMException('Synthetic cancellation','AbortError');":"throw new Error('Synthetic verification failure');")+"}");
      await context.addInitScript(()=>{
        const Native=window.MediaRecorder;
        window.__recordings=[];
        window.MediaRecorder=class extends Native{
          constructor(stream,options){
            super(stream,options);
            const entry={chunks:[],mime:this.mimeType};window.__recordings.push(entry);
            this.addEventListener('dataavailable',event=>{if(event.data.size)entry.chunks.push(event.data);});
          }
        };
        Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>true});
        Object.defineProperty(navigator,'share',{configurable:true,value:data=>{
          window.__sharedFile=data.files[0];window.__shareKeys=Object.keys(data);return Promise.resolve();
        }});
      });
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(base+'/open.html?id='+id,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.querySelector('#openButton')?.disabled===false,null,{timeout:30000});
      await page.locator('#openButton').click();
      await page.waitForFunction(()=>document.querySelector('#giftStage').dataset.state==='revealed');
      await page.locator('#downloadVideo').click();
      await page.waitForFunction(()=>!document.querySelector('#exportPreview').hidden||
        !!document.querySelector('#revealStatus').dataset.exportError,null,{timeout:90000});
      const status=await page.locator('#revealStatus').innerText();
      if(failure==='abort'){
        assert.equal(await page.locator('#exportPreview').isVisible(),false);
        assert.equal(await page.locator('#downloadVideoFile').isVisible(),false);
        assert.equal(await page.locator('#saveVideo').isVisible(),false);
        assert.match(await page.locator('#revealStatus').getAttribute('data-export-error'),/^checking:(?:AbortError|20)$/);
        console.log('PASS: cancellation during checking does not offer a recording for saving');
      }else{
        assert.equal(await page.locator('#exportPreview').isVisible(),true,status);
        assert.equal(await page.locator('#downloadVideoFile').isVisible(),true);
        assert.equal(await page.locator('#saveVideo').isVisible(),true);
        assert.match(status,/^Видео готово\. Выберите способ сохранения\./);
        const result=await page.evaluate(async()=>{
          const preview=document.querySelector('#exportPreview'),download=document.querySelector('#downloadVideoFile');
          const file=await(await fetch(download.href)).blob(),entry=window.__recordings.at(-1);
          const raw=new Blob(entry.chunks,{type:entry.mime});
          const hash=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))).join(',');
          window.__rawHash=await hash(raw);
          return {hash:await hash(file),raw:window.__rawHash,size:file.size,sameFile:preview.src===download.href,
            verified:preview.dataset.durationVerified,duration:preview.dataset.actualDuration,
            error:document.querySelector('#revealStatus').dataset.exportError};
        });
        assert.ok(result.size>0);assert.equal(result.hash,result.raw);assert.equal(result.sameFile,true);
        assert.equal(result.verified,'false');assert.equal(result.duration,'');assert.equal(result.error,undefined);
        await page.locator('#saveVideo').click();
        const shared=await page.evaluate(async()=>{
          const file=window.__sharedFile;
          return {hash:Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))).join(','),
            keys:window.__shareKeys,name:file.name,type:file.type};
        });
        assert.equal(shared.hash,result.raw);assert.deepEqual(shared.keys,['files']);
        assert.match(shared.name,/^thauma-classic-opening\.mp4$/);assert.equal(shared.type,'video/mp4');
        console.log('PASS: '+failure+' failure preserves original recording bytes for preview, download and native sharing');
      }
      assert.deepEqual(errors,[]);
    }finally{await context.close();}
  }
}finally{
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
}
