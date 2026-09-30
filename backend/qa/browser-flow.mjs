import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import worker from '../worker.mjs';

const root = resolve(new URL('../../', import.meta.url).pathname);
const objects = new Map();
const env = {
  GIFT_TTL_DAYS: '30',
  GIFTS_UPLOAD_LIMIT: { limit: async () => ({ success: true }) },
  GIFTS: {
    async put(key, body) { objects.set(key, new Uint8Array(await new Response(body).arrayBuffer())); },
    async get(key) {
      const bytes = objects.get(key);
      return bytes ? { body: bytes.slice(), json: async () => JSON.parse(new TextDecoder().decode(bytes)) } : null;
    },
    async delete(keys) { for (const key of [].concat(keys)) objects.delete(key); }
  }
};
let cloud = true;
let base;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, base);
    if (url.pathname.startsWith('/api/')) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks);
      const request = new Request(url, {
        method: req.method, headers: req.headers,
        ...(['GET', 'HEAD'].includes(req.method) ? {} : { body })
      });
      const response = await worker.fetch(request, env);
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (url.pathname === '/assets/sharing-config.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end('export const API_BASE = ' + JSON.stringify(cloud ? base : '') + ';');
      return;
    }
    const path = resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(root + '/')) { res.writeHead(403); res.end(); return; }
    const types = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.mp4': 'video/mp4' };
    const content = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' });
    res.end(content);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
base = 'http://127.0.0.1:' + server.address().port;
env.ALLOWED_ORIGINS = base;

const certificate = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5YsAAAAASUVORK5CYII=', 'base64');
const audio = Buffer.alloc(44 + 3200);
audio.write('RIFF', 0); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8);
audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22);
audio.writeUInt32LE(16000, 24); audio.writeUInt32LE(32000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34);
audio.write('data', 36); audio.writeUInt32LE(3200, 40);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const pageErrors = [];
async function createOn(page) {
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#fileStatus').textContent.length && window.MagixDB);
  await page.locator('#giftFile').setInputFiles({ name: 'certificate.png', mimeType: 'image/png', buffer: certificate });
  await page.locator('#audioFile').setInputFiles({ name: 'greeting.wav', mimeType: 'audio/wav', buffer: audio });
  await page.locator('#giftTitle').fill('Подарок для тебя');
  await page.locator('#giftMessage').fill('С днём рождения!');
  await page.locator('#giftForm button[type=submit]').click();
  await page.locator('.share-url').waitFor({ timeout: 30000 });
  return page.locator('.share-url').innerText();
}
try {
  const sender = await browser.newContext();
  const senderPage = await sender.newPage();
  const link = await createOn(senderPage);
  assert.match(new URL(link).searchParams.get('id'), /^[a-f0-9]{64}$/);
  assert.match(await senderPage.locator('.gift-expiry').innerText(), /Доступен до/);
  assert.equal(await senderPage.getByRole('button', { name: 'Отправить подарок', exact: true }).count(), 1);
  const recipient = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce'
  });
  const recipientPage = await recipient.newPage();
  recipientPage.on('pageerror', error => pageErrors.push(error.message));
  await recipientPage.goto(link);
  await recipientPage.waitForFunction(() => document.querySelector('#openButton')?.disabled === false, { timeout: 30000 });
  // Recipient starts with a fresh browser context: nothing from sender's IndexedDB.
  assert.equal(await recipientPage.evaluate(id => window.MagixDB.get(id), new URL(link).searchParams.get('id')), undefined);
  await recipientPage.locator('#openButton').click();
  await recipientPage.waitForFunction(() => document.querySelector('#giftStage').dataset.state === 'revealed', { timeout: 30000 });
  assert.equal(await recipientPage.locator('#giftMessage').innerText(), 'С днём рождения!');
  const attachments = await recipientPage.evaluate(async () => ({
    certificate: Array.from(new Uint8Array(await (await fetch(document.querySelector('#downloadCertificate').href)).arrayBuffer())),
    audio: Array.from(new Uint8Array(await (await fetch(document.querySelector('#giftAudio').src)).arrayBuffer()))
  }));
  assert.deepEqual(Buffer.from(attachments.certificate), certificate);
  assert.deepEqual(Buffer.from(attachments.audio), audio);
  assert.equal(await recipientPage.locator('#giftAudioPanel').isVisible(), true);
  console.log('PASS: full UI creation and opening in an independent mobile browser context, certificate and audio unchanged');

  const count = objects.size;
  await senderPage.route('**/api/gifts', route => route.abort('internetdisconnected'));
  await senderPage.locator('#giftTitle').fill('Сохрани мою форму');
  await senderPage.locator('#giftForm button[type=submit]').click();
  await senderPage.waitForFunction(() => !document.querySelector('#giftForm button[type=submit]').disabled);
  assert.equal(await senderPage.locator('#giftTitle').inputValue(), 'Сохрани мою форму');
  assert.equal(await senderPage.locator('.share-url').innerText(), link);
  assert.equal(objects.size, count);
  assert.match(await senderPage.locator('#toast').innerText(), /Не удалось отправить/);
  console.log('PASS: failed upload preserves form and creates no new link');

  cloud = false;
  const localContext = await browser.newContext();
  const localPage = await localContext.newPage();
  const localLink = await createOn(localPage);
  assert.match(new URL(localLink).searchParams.get('id'), /^[a-f0-9-]{36}$/);
  assert.match(await localPage.locator('.result-hint').innerText(), /этом браузере/);
  await localPage.goto(localLink);
  await localPage.waitForFunction(() => document.querySelector('#openButton')?.disabled === false, { timeout: 30000 });
  console.log('PASS: unconfigured local preview remains available');
  assert.deepEqual(pageErrors, []);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
