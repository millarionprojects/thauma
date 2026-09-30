const MIB = 1024 * 1024;
const MAX_FILE = 25 * MIB;
const MAX_TOTAL = 30 * MIB;
const MAX_BODY = MAX_TOTAL + 64 * 1024;
const DESIGNS = new Set(['classic', 'envelope', 'envelope-gold', 'envelope-copper', 'scroll', 'jewelry', 'balloon', 'him', 'case']);
const ID = /^[a-f0-9]{64}$/;

class ApiError extends Error {
  constructor(status, code) { super(code); this.status = status; }
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' }
  });
}

function origins(env) {
  return new Set((env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
}

function headersFor(request, env) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Vary': 'Origin'
  });
  const origin = request.headers.get('Origin');
  if (origins(env).has(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return headers;
}

function metadata(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new ApiError(400, 'invalid_metadata');
  let input;
  try { input = JSON.parse(value); } catch { throw new ApiError(400, 'invalid_metadata'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new ApiError(400, 'invalid_metadata');
  const output = {};
  for (const [key, max, required] of [['title', 60, true], ['amount', 30, false], ['message', 220, true]]) {
    if (typeof input[key] !== 'string') throw new ApiError(400, 'invalid_metadata');
    const text = input[key].trim();
    if (text.length > max || (required && !text)) throw new ApiError(400, 'invalid_metadata');
    output[key] = text;
  }
  if (!DESIGNS.has(input.design) || !['ru', 'en'].includes(input.lang) || !['light', 'dark'].includes(input.theme)) {
    throw new ApiError(400, 'invalid_metadata');
  }
  return { ...output, design: input.design, lang: input.lang, theme: input.theme };
}

async function limitedForm(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY) throw new ApiError(413, 'too_large');
  if (!request.headers.get('Content-Type')?.startsWith('multipart/form-data;') || !request.body) {
    throw new ApiError(400, 'invalid_file');
  }
  // Count actual streamed bytes too: chunked requests cannot bypass the cap.
  const reader = request.body.getReader();
  let size = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) { controller.close(); reader.releaseLock(); return; }
        size += next.value.byteLength;
        if (size > MAX_BODY) {
          await reader.cancel();
          controller.error(new ApiError(413, 'too_large'));
          return;
        }
        controller.enqueue(next.value);
      } catch (error) { controller.error(error); }
    },
    cancel(reason) { return reader.cancel(reason); }
  });
  try {
    return await new Response(stream, {
      headers: { 'Content-Type': request.headers.get('Content-Type') }
    }).formData();
  } catch (error) {
    if (error instanceof ApiError || size > MAX_BODY) throw new ApiError(413, 'too_large');
    throw new ApiError(400, 'invalid_file');
  }
}

async function attachment(value, kind) {
  if (!value || typeof value !== 'object' || typeof value.arrayBuffer !== 'function' || !value.size) {
    throw new ApiError(400, kind === 'file' ? 'certificate_required' : 'invalid_file');
  }
  if (value.size > MAX_FILE) throw new ApiError(413, 'too_large');
  const bytes = new Uint8Array(await value.slice(0, 16).arrayBuffer());
  const ascii = (offset, text) => [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  const type = value.type.split(';')[0].toLowerCase();
  let canonical = null;
  if (kind === 'file') {
    if (type === 'application/pdf' && ascii(0, '%PDF-')) canonical = type;
    if (type === 'image/jpeg' && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) canonical = type;
    if (type === 'image/png' && [137,80,78,71,13,10,26,10].every((byte, index) => bytes[index] === byte)) canonical = type;
    if (type === 'image/webp' && ascii(0, 'RIFF') && ascii(8, 'WEBP')) canonical = type;
  } else {
    const mpeg = bytes[0] === 255 && (bytes[1] & 224) === 224;
    const checks = [
      [['audio/mpeg', 'audio/mp3'], 'audio/mpeg', ascii(0, 'ID3') || (mpeg && (bytes[1] & 6) !== 0)],
      [['audio/mp4', 'audio/x-m4a', 'video/mp4'], 'audio/mp4', ascii(4, 'ftyp')],
      [['audio/wav', 'audio/wave', 'audio/x-wav'], 'audio/wav', ascii(0, 'RIFF') && ascii(8, 'WAVE')],
      [['audio/ogg', 'application/ogg'], 'audio/ogg', ascii(0, 'OggS')],
      [['audio/webm', 'video/webm'], 'audio/webm', [26,69,223,163].every((byte, index) => bytes[index] === byte)],
      [['audio/aac', 'audio/x-aac'], 'audio/aac', mpeg && (bytes[1] & 6) === 0]
    ];
    for (const [types, mime, valid] of checks) if (types.includes(type) && valid) canonical = mime;
  }
  if (!canonical) throw new ApiError(400, 'invalid_file');
  const name = String(value.name || kind).replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 180);
  return { name, type: canonical, size: value.size };
}

function days(env) {
  const value = Number(env.GIFT_TTL_DAYS || 30);
  if (!Number.isInteger(value) || value < 1 || value > 365) throw new ApiError(503, 'unavailable');
  return value;
}

async function create(request, env) {
  // Uploads are only accepted from the configured frontend. Read links also work
  // without Origin (e.g. a download), but there is no list/search endpoint.
  if (!origins(env).has(request.headers.get('Origin'))) throw new ApiError(403, 'forbidden');
  if (!env.GIFTS || !env.GIFTS_UPLOAD_LIMIT) throw new ApiError(503, 'unavailable');
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  if (!(await env.GIFTS_UPLOAD_LIMIT.limit({ key: ip })).success) throw new ApiError(429, 'rate_limited');
  const form = await limitedForm(request);
  const keys = [...form.keys()];
  if (keys.some(key => !['metadata', 'file', 'audio'].includes(key)) || new Set(keys).size !== keys.length) {
    throw new ApiError(400, 'invalid_metadata');
  }
  const gift = metadata(form.get('metadata'));
  const file = form.get('file'), audio = form.get('audio');
  if ((file?.size || 0) + (audio?.size || 0) > MAX_TOTAL) throw new ApiError(413, 'too_large');
  gift.file = await attachment(file, 'file');
  gift.audio = audio === null ? null : await attachment(audio, 'audio');
  const id = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
  const prefix = 'gifts/' + id + '/';
  gift.id = id;
  gift.createdAt = Date.now();
  gift.expiresAt = gift.createdAt + days(env) * 86400000;
  try {
    for (const [key, data] of [['file', file], ['audio', audio]]) {
      if (data) await env.GIFTS.put(prefix + key, data.stream(), { httpMetadata: { contentType: gift[key].type } });
    }
    // Publish metadata last; incomplete uploads never produce a working gift link.
    await env.GIFTS.put(prefix + 'gift.json', JSON.stringify(gift), { httpMetadata: { contentType: 'application/json' } });
  } catch {
    await env.GIFTS.delete([prefix + 'file', prefix + 'audio', prefix + 'gift.json']).catch(() => {});
    throw new ApiError(503, 'unavailable');
  }
  return json({ id, expiresAt: gift.expiresAt }, 201);
}

async function read(request, env, id, key) {
  if (!ID.test(id)) throw new ApiError(404, 'not_found');
  const prefix = 'gifts/' + id + '/';
  const stored = await env.GIFTS.get(prefix + 'gift.json');
  if (!stored) throw new ApiError(404, 'not_found');
  const gift = await stored.json();
  if (gift.expiresAt <= Date.now()) throw new ApiError(410, 'expired');
  if (!key) return json(gift);
  if (!gift[key]) throw new ApiError(404, 'not_found');
  const object = await env.GIFTS.get(prefix + key);
  if (!object) throw new ApiError(503, 'unavailable');
  const headers = new Headers({
    'Content-Type': gift[key].type,
    'Content-Length': String(gift[key].size),
    'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(gift[key].name)
  });
  return new Response(object.body, { headers });
}

async function route(request, env) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && !origins(env).has(origin)) throw new ApiError(403, 'forbidden');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (url.pathname === '/api/config' && ['GET', 'HEAD'].includes(request.method)) {
    const ready = Boolean(env.GIFTS && env.GIFTS_UPLOAD_LIMIT && origins(env).size);
    return json({ publicSharing: ready, audioSharing: ready, maxFileBytes: MAX_FILE, maxTotalBytes: MAX_TOTAL, giftTtlDays: days(env) }, ready ? 200 : 503);
  }
  if (url.pathname === '/api/gifts' && request.method === 'POST') return create(request, env);
  const match = /^\/api\/gifts\/([a-f0-9]{64})(?:\/(file|audio))?$/.exec(url.pathname);
  if (match && ['GET', 'HEAD'].includes(request.method)) {
    if (!env.GIFTS) throw new ApiError(503, 'unavailable');
    return read(request, env, match[1], match[2]);
  }
  throw new ApiError(404, 'not_found');
}

export default {
  async fetch(request, env) {
    let response;
    try { response = await route(request, env); }
    catch (error) {
      response = error instanceof ApiError ? json({ error: error.message }, error.status) : json({ error: 'unavailable' }, 503);
    }
    const headers = headersFor(request, env);
    for (const [key, value] of response.headers) headers.set(key, value);
    if (response.status === 429) headers.set('Retry-After', '60');
    return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers });
  }
};
