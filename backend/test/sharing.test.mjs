import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import worker from '../worker.mjs';
import {withDeadline} from '../../assets/loading-deadline.js';

const ORIGIN = 'https://millarionprojects.github.io';
const ROOT = 'https://thauma.test';
const MIB = 1024 * 1024;
const PDF = new Blob(['%PDF-1.4\ncertificate'], { type: 'application/pdf' });
const WAV = new Blob(['RIFF0000WAVEvoice greeting'], { type: 'audio/wav' });
const META = { title: 'Для тебя', amount: '5 000 ₽', message: 'С днём рождения!', design: 'envelope-copper', lang: 'ru', theme: 'dark' };
const clientSource = await readFile(new URL('../../assets/gift-api.js', import.meta.url), 'utf8');

class Bucket {
  data = new Map();
  failKey = null;
  async put(key, body, options) {
    if (key.endsWith(this.failKey || '\u0000')) throw new Error('Storage failed');
    const bytes = new Uint8Array(await new Response(body).arrayBuffer());
    this.data.set(key, { bytes, options });
  }
  async get(key) {
    const item = this.data.get(key);
    if (!item) return null;
    return { body: item.bytes.slice(), json: async () => JSON.parse(new TextDecoder().decode(item.bytes)) };
  }
  async delete(keys) { for (const key of [].concat(keys)) this.data.delete(key); }
}
function environment() {
  return { GIFTS: new Bucket(), ALLOWED_ORIGINS: ORIGIN, GIFT_TTL_DAYS: '30', GIFTS_UPLOAD_LIMIT: { limit: async () => ({ success: true }) } };
}
function form({ meta = META, file = PDF, audio = WAV } = {}) {
  const data = new FormData();
  data.set('metadata', JSON.stringify(meta));
  if (file) data.set('file', file, 'сертификат.pdf');
  if (audio) data.set('audio', audio, 'voice.wav');
  return data;
}
async function post(env, data = form(), origin = ORIGIN) {
  return worker.fetch(new Request(ROOT + '/api/gifts', {
    method: 'POST', body: data, headers: origin ? { Origin: origin } : {}
  }), env);
}
async function get(env, path, method = 'GET', origin = ORIGIN) {
  return worker.fetch(new Request(ROOT + path, { method, headers: origin ? { Origin: origin } : {} }), env);
}
function client(env, { root = ROOT, fetcher, localGet = async () => { throw new Error('Recipient has no local gift'); }, localPut = async () => { throw new Error('Must not fall back to local storage'); } } = {}) {
  const fetch = fetcher || ((url, init = {}) => worker.fetch(new Request(url, {
    ...init, headers: { ...init.headers, Origin: ORIGIN }
  }), env));
  const source = clientSource.replace(/^import[^;]+;/gm, '').replace(/export (?=(?:async )?(?:function|const))/g, '');
  return new Function('API_BASE', 'fetch', 'window', 'document', 'URL', 'FormData', 'Blob', 'AbortSignal', 'withDeadline',
    source + '\nreturn { checkSharing, saveGift, loadGift, loadGiftAudio, publicSharing };'
  )(root, fetch, { MagixDB: { get: localGet, put: localPut } }, { documentElement: { lang: 'ru' } }, URL, FormData, Blob, AbortSignal, withDeadline);
}
function gift() {
  return { id: crypto.randomUUID(), ...META, file: { name: 'сертификат.pdf', type: PDF.type, blob: PDF }, audio: { name: 'voice.wav', type: WAV.type, blob: WAV } };
}

test('sender creates a gift, independent recipient loads the original certificate and audio', async () => {
  const env = environment();
  const sender = client(env);
  assert.equal(await sender.checkSharing(), true);
  const saved = await sender.saveGift(gift());
  assert.equal(saved.local, false);
  assert.match(saved.id, /^[a-f0-9]{64}$/);
  assert.ok(saved.expiresAt > Date.now());
  const recipient = client(env);
  const loaded = await recipient.loadGift(saved.id);
  for (const key of ['title', 'amount', 'message', 'design', 'lang', 'theme']) assert.equal(loaded[key], META[key]);
  assert.equal(loaded.file.name, 'сертификат.pdf');
  assert.deepEqual(await loaded.file.blob.arrayBuffer(), await PDF.arrayBuffer());
  assert.deepEqual(await loaded.audio.blob.arrayBuffer(), await WAV.arrayBuffer());
  assert.equal(env.GIFTS.data.size, 3);
  assert.equal(loaded.expiresAt - loaded.createdAt, 30 * 86400000);
});

test('certificate-only gifts work and random links are unique', async () => {
  const env = environment();
  const first = await (await post(env, form({ audio: null }))).json();
  const second = await (await post(env, form({ audio: null }))).json();
  assert.notEqual(first.id, second.id);
  const loaded = await client(env).loadGift(first.id);
  assert.equal(loaded.audio, null);
  assert.equal((await get(env, '/api/gifts/' + first.id + '/audio')).status, 404);
});

test('download headers, HEAD, CORS and preflight', async () => {
  const env = environment(), saved = await (await post(env)).json();
  const path = '/api/gifts/' + saved.id + '/file';
  const response = await get(env, path);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(response.headers.get('Content-Type'), PDF.type);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.match(response.headers.get('Content-Disposition'), /attachment; filename\*=UTF-8''/);
  assert.equal((await get(env, path, 'HEAD')).headers.get('Content-Length'), String(PDF.size));
  assert.equal(await (await get(env, path, 'HEAD')).text(), '');
  const preflight = await get(env, '/api/gifts', 'OPTIONS');
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get('Access-Control-Allow-Methods'), /POST/);
  assert.equal((await get(env, path, 'GET', null)).status, 200);
});

test('foreign origins cannot upload or read via CORS; uploads without Origin are rejected', async () => {
  const env = environment();
  assert.equal((await post(env, form(), 'https://other.test')).status, 403);
  assert.equal((await post(env, form(), null)).status, 403);
  assert.equal(env.GIFTS.data.size, 0);
  const response = await get(env, '/api/config', 'GET', 'https://other.test');
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
  assert.equal((await get(env, '/api/gifts')).status, 404);
});

test('validation rejects missing certificate, unknown designs, duplicate fields and disguised files', async () => {
  const env = environment();
  assert.equal((await post(env, form({ file: null }))).status, 400);
  assert.equal((await post(env, form({ meta: { ...META, design: 'unknown' } }))).status, 400);
  assert.equal((await post(env, form({ meta: { ...META, title: 'a'.repeat(61) } }))).status, 400);
  const duplicate = form(); duplicate.append('metadata', JSON.stringify(META));
  assert.equal((await post(env, duplicate)).status, 400);
  const fake = new Blob(['<script>bad</script>'], { type: 'application/pdf' });
  assert.equal((await post(env, form({ file: fake }))).status, 400);
  const audio = new Blob(['not audio'], { type: 'audio/wav' });
  assert.equal((await post(env, form({ audio }))).status, 400);
  assert.equal(env.GIFTS.data.size, 0);
});

test('per-file and combined limits reject uploads before storing', async () => {
  const env = environment();
  const large = new Blob([PDF, new Uint8Array(25 * MIB)], { type: PDF.type });
  assert.equal((await post(env, form({ file: large, audio: null }))).status, 413);
  const file = new Blob([PDF, new Uint8Array(16 * MIB)], { type: PDF.type });
  const audio = new Blob([WAV, new Uint8Array(16 * MIB)], { type: WAV.type });
  assert.equal((await post(env, form({ file, audio }))).status, 413);
  assert.equal(env.GIFTS.data.size, 0);
});

test('streamed requests cannot bypass the size limit by omitting Content-Length', async () => {
  const env = environment();
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(30 * MIB + 65537)); controller.close(); }
  });
  const request = new Request(ROOT + '/api/gifts', {
    method: 'POST', body, duplex: 'half',
    headers: { Origin: ORIGIN, 'Content-Type': 'multipart/form-data; boundary=oversize' }
  });
  assert.equal((await worker.fetch(request, env)).status, 413);
  assert.equal(env.GIFTS.data.size, 0);
});

test('rate-limited uploads return a retry delay and do not store files', async () => {
  const env = environment();
  env.GIFTS_UPLOAD_LIMIT.limit = async () => ({ success: false });
  const response = await post(env);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.equal((await response.json()).error, 'rate_limited');
  assert.equal(env.GIFTS.data.size, 0);
});

test('partial storage failure rolls back files and returns no shareable ID', async () => {
  const env = environment(); env.GIFTS.failKey = 'audio';
  const response = await post(env);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: 'unavailable' });
  assert.equal(env.GIFTS.data.size, 0);
});

test('expired links cannot load metadata, certificate or audio', async () => {
  const env = environment(), saved = await (await post(env)).json();
  const key = 'gifts/' + saved.id + '/gift.json';
  const record = await (await env.GIFTS.get(key)).json();
  record.expiresAt = Date.now() - 1;
  await env.GIFTS.put(key, JSON.stringify(record));
  for (const suffix of ['', '/file', '/audio']) assert.equal((await get(env, '/api/gifts/' + saved.id + suffix)).status, 410);
  assert.equal(await client(env).loadGift(saved.id), null);
});

test('unconfigured backend does not advertise public sharing', async () => {
  const response = await get({ ALLOWED_ORIGINS: ORIGIN }, '/api/config');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).publicSharing, false);
});

test('network failure preserves the error instead of creating a misleading local link', async () => {
  const env = environment();
  const broken = client(env, { fetcher: async () => { throw new TypeError('Network disconnected'); } });
  await assert.rejects(broken.saveGift(gift()), error => Boolean(error.userMessage));
  assert.equal(env.GIFTS.data.size, 0);
});

test('missing gifts differ from service errors and incomplete attachments', async () => {
  const env = environment(), missing = '0'.repeat(64);
  assert.equal(await client(env).loadGift(missing), null);
  const broken = client(env, { fetcher: async () => new Response('{}', { status: 503 }) });
  await assert.rejects(broken.loadGift(missing), /Gift unavailable/);
  const saved = await (await post(env)).json();
  await env.GIFTS.put('gifts/' + saved.id + '/audio', 'truncated');
  await assert.rejects(client(env).loadGift(saved.id), /Incomplete gift attachment/);
});

test('legacy local previews continue to work; malformed IDs are never queried', async () => {
  const env = environment(), original = gift();
  const legacy = client(env, { localGet: async id => id === original.id ? original : null });
  assert.equal(await legacy.loadGift(original.id), original);
  assert.equal(await legacy.loadGift('../anything'), null);
  const local = client(env, { root: '', localPut: async data => assert.equal(data, original) });
  assert.equal(local.publicSharing, false);
  assert.deepEqual(await local.saveGift(original), { id: original.id, local: true });
});

test('missing MIME on audio is inferred from its filename', async () => {
  const env = environment(), original = gift();
  original.audio.blob = new Blob([WAV]);
  const saved = await client(env).saveGift(original);
  const loaded = await client(env).loadGift(saved.id);
  assert.equal(loaded.audio.type, 'audio/wav');
  assert.deepEqual(await loaded.audio.blob.arrayBuffer(), await WAV.arrayBuffer());
});

test('opening can defer unavailable audio and export loads the original bytes on demand', async () => {
  const env = environment(), saved = await (await post(env)).json();
  let audioRequests = 0;
  const slowAudio = client(env, {fetcher: (url, init) => {
    if (url.endsWith('/audio')) {audioRequests++; return new Promise(() => {});}
    return worker.fetch(new Request(url, {...init, headers:{Origin:ORIGIN}}), env);
  }});
  const loaded = await slowAudio.loadGift(saved.id, {deferAudio:true});
  assert.equal(audioRequests, 0);
  assert.equal(loaded.audio.blob, undefined);
  assert.equal(loaded.audio.url, ROOT + '/api/gifts/' + saved.id + '/audio');
  assert.deepEqual(await loaded.file.blob.arrayBuffer(), await PDF.arrayBuffer());
  const audio = await client(env).loadGiftAudio(loaded);
  assert.deepEqual(await audio.arrayBuffer(), await WAV.arrayBuffer());
});

test('deadline rejects stalled preparation and disposes a late scene result', async () => {
  let resolve, late, cancelled = false;
  const work = new Promise(r => {resolve=r;});
  await assert.rejects(withDeadline(work, 5, {
    onTimeout:()=>{cancelled=true;},
    onLate:value=>{late=value;}
  }), error => error.code === 'LOADING_TIMEOUT');
  assert.equal(cancelled,true);
  const scene = {};
  resolve(scene);
  await Promise.resolve();
  assert.equal(late,scene);
});
