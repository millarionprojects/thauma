import { API_BASE } from './sharing-config.js';

const root = API_BASE.trim().replace(/\/$/, '');
export const publicSharing = Boolean(root);
const remoteId = /^[a-f0-9]{64}$/;
const localId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const MAX_FILE = 25 * 1024 * 1024;
const MAX_TOTAL = 30 * 1024 * 1024;
let available = false;

function endpoint(path) {
  const url = new URL(root);
  const local = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
    throw new Error('Invalid gift service configuration');
  }
  return root + path;
}

function fail(code) {
  const en = document.documentElement.lang === 'en';
  const messages = {
    certificate_required: ['Сначала добавьте сертификат.', 'Attach a certificate first.'],
    too_large: ['Каждый файл должен быть до 25 МБ, сертификат и аудио вместе — до 30 МБ.', 'Each file must be up to 25 MB; certificate and audio together up to 30 MB.'],
    rate_limited: ['Слишком много попыток. Подождите минуту и попробуйте снова.', 'Too many attempts. Wait a minute and try again.'],
    invalid_file: ['Не удалось прочитать файл. Выберите PDF, JPG, PNG или WEBP; для аудио — MP3, M4A, WAV, OGG, WEBM или AAC.', 'Could not read the file. Use PDF, JPG, PNG or WEBP; for audio use MP3, M4A, WAV, OGG, WEBM or AAC.'],
    invalid_metadata: ['Проверьте название и поздравление.', 'Check the title and greeting.'],
    unavailable: ['Не удалось отправить подарок. Проверьте соединение и попробуйте снова. Форма сохранена.', 'Could not send the gift. Check your connection and retry. Your form is preserved.']
  };
  const error = new Error((messages[code] || messages.unavailable)[en ? 1 : 0]);
  error.userMessage = error.message;
  return error;
}

export async function checkSharing() {
  if (!publicSharing) return false;
  try {
    const response = await fetch(endpoint('/api/config'), {
      credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(7000)
    });
    const config = response.ok ? await response.json() : null;
    available = config?.publicSharing === true && config.audioSharing === true;
  } catch {
    available = false;
  }
  return available;
}

export async function saveGift(gift) {
  if (!publicSharing) {
    await window.MagixDB.put(gift);
    return { id: gift.id, local: true };
  }
  if (!gift.file?.blob?.size) throw fail('certificate_required');
  const attachments = [gift.file, gift.audio].filter(Boolean);
  if (attachments.some(item => !item.blob?.size || item.blob.size > MAX_FILE) ||
      attachments.reduce((size, item) => size + item.blob.size, 0) > MAX_TOTAL) throw fail('too_large');
  if (!available && !await checkSharing()) throw fail('unavailable');
  const { title, amount, message, design, lang, theme } = gift;
  const body = new FormData();
  body.set('metadata', JSON.stringify({ title, amount, message, design, lang, theme }));
  for (const [key, item] of [['file', gift.file], ['audio', gift.audio]]) {
    if (item) {
      let blob = item.blob;
      if (key === 'audio' && (!blob.type || blob.type === 'application/octet-stream')) {
        const extension = item.name?.split('.').pop().toLowerCase();
        const mime = { mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', aac: 'audio/aac' }[extension];
        if (mime) blob = new Blob([blob], { type: mime });
      }
      body.set(key, blob, item.name);
    }
  }
  try {
    const response = await fetch(endpoint('/api/gifts'), {
      method: 'POST', body, credentials: 'omit', signal: AbortSignal.timeout(120000)
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw fail(payload.error);
    }
    const saved = await response.json();
    if (!remoteId.test(saved.id) || !Number.isFinite(saved.expiresAt)) throw fail('unavailable');
    return { id: saved.id, local: false, expiresAt: saved.expiresAt };
  } catch (error) {
    if (error.userMessage) throw error;
    available = false;
    throw fail('unavailable');
  }
}

export async function loadGift(id) {
  if (!id) return null;
  if (localId.test(id)) return window.MagixDB.get(id);
  if (!remoteId.test(id)) return null;
  if (!publicSharing) throw new Error('Gift sharing is not configured');
  const response = await fetch(endpoint('/api/gifts/' + id), {
    credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(30000)
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error('Gift unavailable');
  const gift = await response.json();
  if (gift.id !== id) throw new Error('Invalid gift response');
  // URLs are constructed here; stored metadata cannot redirect downloads elsewhere.
  await Promise.all(['file', 'audio'].map(async key => {
    if (!gift[key]) return;
    const response = await fetch(endpoint('/api/gifts/' + id + '/' + key), {
      credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(120000)
    });
    if (!response.ok) throw new Error('Gift attachment unavailable');
    const blob = await response.blob();
    if (blob.size !== gift[key].size) throw new Error('Incomplete gift attachment');
    gift[key].blob = blob;
  }));
  return gift;
}
