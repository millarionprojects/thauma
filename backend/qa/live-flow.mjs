import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const config = await readFile(new URL('../../assets/sharing-config.js', import.meta.url), 'utf8');
const match = /export const API_BASE = ['"]([^'"]*)['"]/.exec(config);
if (!match?.[1]) {
  console.log('SKIP: live sharing is not configured');
  process.exit(0);
}
const root = match[1];
const site = 'https://millarionprojects.github.io/thauma/';
const revision = process.env.GITHUB_SHA || Date.now().toString();
let ready = false;
for (let attempt = 0; attempt < 24; attempt++) {
  try {
    const response = await fetch(site + 'assets/sharing-config.js?revision=' + revision, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const html = await fetch(site + '?revision=' + revision, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const [opener,bootstrap]=await Promise.all([
      fetch(site+'open.html?revision='+revision,{cache:'no-store',signal:AbortSignal.timeout(10000)}),
      fetch(site+'assets/open-bootstrap.js?v=20261003-duration1&revision='+revision,{cache:'no-store',signal:AbortSignal.timeout(10000)})
    ]);
    if (response.ok && (await response.text()).includes(root) && html.ok && (await html.text()).includes('20261002-loading1')
      && opener.ok && (await opener.text()).includes('open-bootstrap.js?v=20261003-duration1')
      && bootstrap.ok && (await bootstrap.text()).includes('open-continuous-review.js?v=20261003-duration1')) { ready = true; break; }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 5000));
}
assert.ok(ready, 'GitHub Pages has not published the current gift opener and server configuration');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5YsAAAAASUVORK5CYII=', 'base64');
const wav = Buffer.alloc(44 + 3200);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24); wav.writeUInt32LE(32000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(3200, 40);
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const senderContext = await browser.newContext();
  const sender = await senderContext.newPage();
  sender.on('pageerror', error => errors.push(error.message));
  await sender.goto(site + 'preview-7f3a9c/?revision=' + revision);
  await sender.waitForURL(url => !url.pathname.includes('/preview-7f3a9c/'));
  await sender.locator('#recordingMode').waitFor();
  await sender.locator('#giftFile').setInputFiles({ name: 'check.png', mimeType: 'image/png', buffer: png });
  await sender.locator('#audioFile').setInputFiles({ name: 'check.wav', mimeType: 'audio/wav', buffer: wav });
  await sender.locator('#giftTitle').fill('Проверка отправки Таумы');
  await sender.locator('#giftMessage').fill('Подарок с сертификатом и аудио');
  await sender.locator('#giftForm button[type=submit]').click();
  await sender.locator('.share-url').waitFor({ timeout: 120000 });
  const link = await sender.locator('.share-url').innerText();
  assert.match(new URL(link).searchParams.get('id'), /^[a-f0-9]{64}$/);
  assert.match(await sender.locator('.gift-expiry').innerText(), /Доступен до/);

  const recipientContext = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce'
  });
  const recipient = await recipientContext.newPage();
  recipient.on('pageerror', error => errors.push(error.message));
  await recipient.goto(link);
  await recipient.waitForFunction(() => document.querySelector('#openButton')?.disabled === false, null, { timeout: 60000 });
  assert.equal(await recipient.evaluate(id => window.MagixDB.get(id), new URL(link).searchParams.get('id')), undefined);
  await recipient.locator('#openButton').click();
  await recipient.waitForFunction(() => document.querySelector('#giftStage').dataset.state === 'revealed', null, { timeout: 30000 });
  assert.equal(await recipient.locator('#giftMessage').innerText(), 'Подарок с сертификатом и аудио');
  assert.equal(await recipient.locator('#giftAudioPanel').isVisible(), true);
  const bytes = await recipient.evaluate(async () => ({
    certificate: Array.from(new Uint8Array(await (await fetch(document.querySelector('#downloadCertificate').href)).arrayBuffer())),
    audio: Array.from(new Uint8Array(await (await fetch(document.querySelector('#giftAudio').src)).arrayBuffer()))
  }));
  assert.deepEqual(Buffer.from(bytes.certificate), png);
  assert.deepEqual(Buffer.from(bytes.audio), wav);
  await recipient.locator('#downloadVideo').click();
  await recipient.waitForFunction(()=>{
    return !document.querySelector('#exportPreview').hidden||!!document.querySelector('#revealStatus').dataset.exportError;
  },null,{timeout:90000});
  assert.equal(await recipient.locator('#exportPreview').isVisible(),true,await recipient.locator('#revealStatus').innerText());
  const timing=await recipient.evaluate(async()=>{
    const preview=document.querySelector('#exportPreview'),url=document.querySelector('#downloadVideoFile').href;
    const blob=await(await fetch(url)).blob();
    const {verifyVideo}=await import('./assets/export-integrity.js?v=20261003-duration1');
    const expected=Number(preview.dataset.expectedDuration),result=await verifyVideo(blob,expected,undefined,{audioSeconds:.1,videoSeconds:6});
    return {duration:result.duration,expected,displayed:Number(preview.dataset.actualDuration),minimum:Number(preview.dataset.minimumDuration),sameFile:preview.src===url};
  });
  assert.ok(timing.duration>=timing.minimum-.35&&timing.duration<=timing.expected+.75);
  assert.equal(timing.displayed,timing.duration);assert.equal(timing.sameFile,true);
  assert.deepEqual(errors, []);
  console.log('PASS: public GitHub Pages creates a real R2 gift; an independent mobile browser receives original files and exports a video with validated duration');
} finally {
  await browser.close();
}
