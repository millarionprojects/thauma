import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {webkit, chromium} from 'playwright';

const root = resolve(new URL('../../', import.meta.url).pathname);
const id = 'a'.repeat(64); // Synthetic fixture, never a real gift capability.
let base;
const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, '.' + (new URL(req.url, base).pathname === '/' ? '/index.html' : new URL(req.url, base).pathname));
    if (!path.startsWith(root + '/')) {res.writeHead(403);res.end();return;}
    const types = {'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.webp':'image/webp'};
    res.writeHead(200, {'Content-Type':types[extname(path)] || 'application/octet-stream'});
    res.end(await readFile(path));
  } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
base = 'http://127.0.0.1:' + server.address().port;

try {
  for (const [name, engine] of [['WebKit',webkit], ['Chromium',chromium]]) {
    const browser = await engine.launch(name === 'Chromium' ? {args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']} : {});
    try {
      const context = await browser.newContext({viewport:{width:390,height:844}, reducedMotion:'reduce'});
      await context.route('**/api/config', route=>route.fulfill({
        headers:{'Access-Control-Allow-Origin':base}, contentType:'application/json',
        body:JSON.stringify({publicSharing:true,audioSharing:true})
      }));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror',error=>errors.push(error.message));
      // Make a realistic 1920x1080 certificate with the browser's own encoder.
      await page.goto(base);
      const png = Buffer.from(await page.evaluate(() => {
        const c = document.createElement('canvas');c.width=1920;c.height=1080;
        const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);
        ctx.fillStyle='#153e36';ctx.font='64px serif';ctx.fillText('Gift certificate',100,180);
        return c.toDataURL('image/png').split(',')[1];
      }), 'base64');
      let audioRequests = 0, design='envelope-copper';
      await context.route('**/api/gifts/**', async route => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith('/audio')) {audioRequests++;await route.abort();return;}
        if (path.endsWith('/file')) {await route.fulfill({headers:{'Access-Control-Allow-Origin':base},contentType:'image/png',body:png});return;}
        await route.fulfill({headers:{'Access-Control-Allow-Origin':base},contentType:'application/json',body:JSON.stringify({
          id, title:'Gift', amount:'', message:'Happy birthday', design, lang:'ru',theme:'light',
          file:{name:'certificate.png',type:'image/png',size:png.length},
          audio:{name:'song.mp3',type:'audio/mpeg',size:10000000},expiresAt:Date.now()+86400000
        })});
      });
      for (const chosen of ['envelope-copper','classic']) {
        design=chosen;
        await page.goto(base+'/open.html?id='+id,{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>document.querySelector('#openButton')?.disabled===false,null,{timeout:30000});
        // Remote audio has a playable URL while the certificate is immediately usable.
        assert.equal(await page.locator('#soundVideo').isEnabled(),true);
        const readyAudioRequests=audioRequests;
        await page.locator('#openButton').click();
        await page.waitForFunction(()=>document.querySelector('#giftStage').dataset.state==='revealed');
        const bytes = await page.evaluate(async()=>[...new Uint8Array(await (await fetch(document.querySelector('#downloadCertificate').href)).arrayBuffer())]);
        assert.deepEqual(Buffer.from(bytes),png);
        assert.equal(await page.locator('#certificatePreview canvas[data-certificate-preview]').count(),1);
        assert.equal(await page.locator('#certificatePreview img').count(),0);
        const bounds = await page.locator('#certificatePreview canvas').boundingBox();
        assert.ok(bounds.width <= 390);
        assert.match(await page.locator('#giftAudio').getAttribute('src'),/\/audio$/);
        // Audio controls may prefetch metadata; app initialization does not wait for it.
        assert.ok(audioRequests >= readyAudioRequests);
      }
      console.log('PASS: '+name+' mobile opening with large image and unavailable audio; original certificate preserved');

      // Safari must not depend on HTMLImageElement.decode() completing.
      const decodePage = await context.newPage();
      await decodePage.addInitScript(()=>{HTMLImageElement.prototype.decode=()=>new Promise(()=>{});});
      await decodePage.goto(base+'/open.html?id='+id,{waitUntil:'domcontentloaded'});
      await decodePage.waitForFunction(()=>document.querySelector('#openButton')?.disabled===false,null,{timeout:30000});
      console.log('PASS: '+name+' opening does not wait for stalled image.decode()');
      await decodePage.close();

      // A missing artwork response must enable the direct certificate fallback.
      const artworkPage = await context.newPage();
      design='envelope-copper';
      await artworkPage.route('**/media/envelope-copper-cutout.webp',()=>{});
      await artworkPage.goto(base+'/open.html?id='+id,{waitUntil:'domcontentloaded'});
      await artworkPage.waitForFunction(()=>document.querySelector('#giftStage').dataset.renderError==='true',null,{timeout:25000});
      assert.equal(await artworkPage.locator('#openButton').isEnabled(),true);
      await artworkPage.locator('#openButton').click();
      await artworkPage.waitForFunction(()=>document.querySelector('#giftStage').dataset.state==='revealed');
      assert.ok(await artworkPage.locator('#downloadCertificate').getAttribute('href'));
      console.log('PASS: '+name+' stalled artwork falls back to an accessible certificate');
      await artworkPage.close();

      // The independent bootstrap reports module failures instead of an endless spinner.
      const modulePage = await context.newPage();
      await modulePage.route('**/open-continuous-review.js*',route=>route.abort());
      await modulePage.goto(base+'/open.html?id='+id,{waitUntil:'domcontentloaded'});
      await modulePage.getByRole('button',{name:'Попробовать снова',exact:true}).waitFor();
      assert.match(await modulePage.locator('#sceneLoading').innerText(),/Не удалось/);
      await modulePage.close();
      assert.deepEqual(errors,[]);
      console.log('PASS: '+name+' module failure has a retry action');
      await context.close();
    } finally {await browser.close();}
  }
} finally {await new Promise(resolve=>server.close(resolve));}
