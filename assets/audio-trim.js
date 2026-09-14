import {createWaveform, selectionEdge} from './audio-waveform.js';
// Non-destructive selection shared by uploaded audio and microphone recordings.
export function encodeSelection(buffer, start, end) {
  const rate = buffer.sampleRate, channels = buffer.numberOfChannels;
  const first = Math.max(0, Math.floor(start * rate));
  const last = Math.min(buffer.length, Math.ceil(end * rate));
  if (last <= first) throw new Error('Empty selection');
  const size = (last - first) * channels * 2;
  if (size + 44 > 25 * 1048576) throw new Error('Selection too large');
  const bytes = new ArrayBuffer(44 + size), view = new DataView(bytes);
  const word = (at, str) => [...str].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  word(0, 'RIFF'); view.setUint32(4, 36 + size, true); word(8, 'WAVE');
  word(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 2, true); view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true); word(36, 'data'); view.setUint32(40, size, true);
  const data = Array.from({length: channels}, (_, c) => buffer.getChannelData(c));
  let offset = 44;
  for (let i = first; i < last; i++) for (const channel of data) {
    const sample = Math.max(-1, Math.min(1, channel[i] || 0));
    view.setInt16(offset, Math.round(sample * (sample < 0 ? 32768 : 32767)), true); offset += 2;
  }
  return new Blob([bytes], {type: 'audio/wav'});
}

export function createAudioTrim(player, isRecording) {
  const panel = document.createElement('section'); panel.className = 'audio-trim'; panel.hidden = true;
  panel.innerHTML = `<h3></h3><div class="wave-host"></div><p class="trim-duration" aria-live="polite"></p><div class="audio-buttons"><button type="button" class="button secondary" data-action="play"></button><button type="button" class="button secondary" data-action="reset"></button></div><details class="trim-precise"><summary></summary><div class="trim-fields"><label><span data-copy="start"></span><input data-time="start" type="number" min="0" step="0.1" inputmode="decimal"></label><label><span data-copy="end"></span><input data-time="end" type="number" min="0" step="0.1" inputmode="decimal"></label></div></details><p class="trim-note" role="status"></p>`;
  player.after(panel);
  let source = null, decoded = null, pending = null, generation = 0, start = 0, end = 0, cache = null, playing = false, frame = 0;
  let audition = false;
  const en = () => document.documentElement.lang === 'en';
  const text = (ru, eng) => en() ? eng : ru;
  const note = panel.querySelector('.trim-note');
  const waveform = createWaveform(panel.querySelector('.wave-host'), (a, b) => {
    if (!decoded || isRecording()) return;
    start = a; end = b; selectionChanged();
  }, time => {
    if (!decoded || isRecording()) return;
    audition = true;
    player.currentTime = Math.max(0, Math.min(time, Math.max(0, decoded.duration - .01)));
  });
  function selectionChanged() {
    audition = false;
    cache = null; stop(); player.currentTime = start; waveform.position(start);
    note.textContent = text('В подарок и видео войдёт выделенный фрагмент. Оригинал не изменён.', 'The highlighted fragment will be used in the gift and video. The original is unchanged.');
  }
  function stop() { playing = false; cancelAnimationFrame(frame); player.pause(); refresh(); }
  function refresh() {
    player.hidden = !source || !!decoded;
    panel.querySelector('h3').textContent = text('Выберите фрагмент', 'Choose a fragment');
    panel.querySelector('summary').textContent = text('Указать точное время', 'Set exact times');
    panel.querySelector('[data-copy="start"]').textContent = text('Начало, сек.', 'Start, sec.');
    panel.querySelector('[data-copy="end"]').textContent = text('Конец, сек.', 'End, sec.');
    panel.querySelector('[data-action="play"]').textContent = playing ? text('Пауза', 'Pause') : text('Прослушать фрагмент', 'Play fragment');
    panel.querySelector('[data-action="reset"]').textContent = text('Вернуть целиком', 'Restore full audio');
    panel.querySelector('.trim-duration').textContent = decoded ? text('Длительность: ', 'Duration: ') + (end - start).toFixed(1) + text(' сек.', ' sec.') : '';
    panel.querySelectorAll('input,button').forEach(input => input.disabled = !decoded || isRecording());
    for (const key of ['start', 'end']) for (const kind of ['time']) {
      const input = panel.querySelector(`[data-${kind}="${key}"]`);
      input.step = 'any'; input.max = (decoded?.duration || 0).toFixed(3);
      input.value = (key === 'start' ? start : end).toFixed(3);
      input.setAttribute('aria-label', text(key === 'start' ? 'Начало фрагмента в секундах' : 'Конец фрагмента в секундах', key === 'start' ? 'Fragment start in seconds' : 'Fragment end in seconds'));
    }
    waveform.refresh(start, end, !decoded || isRecording(), en());
    waveform.position(player.currentTime ?? start);
  }
  panel.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
    if (!decoded || isRecording()) return;
    const value = Number(input.value); if (!Number.isFinite(value)) return;
    [start, end] = selectionEdge(input.dataset.time, value, start, end, decoded.duration);
    selectionChanged();
  }));
  function guardEnd() {
    if (!playing) return;
    waveform.position(player.currentTime);
    if (player.currentTime >= (audition ? decoded.duration : end) || isRecording()) { stop(); return; }
    frame = requestAnimationFrame(guardEnd);
  }
  player.addEventListener('timeupdate', () => { if (playing && decoded && player.currentTime >= (audition ? decoded.duration : end)) stop(); });
  player.addEventListener('ended', stop);
  player.addEventListener('pause', () => { playing = false; cancelAnimationFrame(frame); refresh(); });
  panel.querySelector('[data-action="play"]').onclick = async () => {
    if (playing) { stop(); return; }
    if (!decoded || isRecording()) return;
    if ((!audition && (player.currentTime < start || player.currentTime >= end)) || player.ended) player.currentTime = start;
    playing = true; refresh();
    try { await player.play(); guardEnd(); } catch { stop(); note.textContent = text('Не удалось воспроизвести. Попробуйте ещё раз.', 'Playback failed. Please try again.'); }
  };
  panel.querySelector('[data-action="reset"]').onclick = () => {
    if (!decoded || isRecording()) return;
    audition = false; start = 0; end = decoded.duration; cache = null; stop(); player.currentTime = 0; waveform.position(0);
    note.textContent = text('Будет использовано полное исходное аудио.', 'The full original audio will be used.');
  };
  window.addEventListener('pagehide', stop);
  return {
    refresh,
    setSource(value) {
      generation++; audition = false; source = value; decoded = null; cache = null; pending = null; start = end = 0; waveform.setBuffer(null); stop(); panel.hidden = !value;
      if (!value) return;
      note.textContent = text('Подготавливаем обрезку…', 'Preparing trim…');
      const version = generation;
      pending = (async () => {
        try {
          const Context = window.OfflineAudioContext || window.webkitOfflineAudioContext;
          const context = new Context(2, 1, 32000);
          const buffer = await context.decodeAudioData(await value.blob.arrayBuffer());
          if (version !== generation) return;
          decoded = buffer; end = buffer.duration; waveform.setBuffer(buffer);
          note.textContent = text('Двигайте верхний указатель, чтобы найти момент на слух. Белые края задают границы обрезки.', 'Drag the top playhead to find a moment by ear. The white edges set the trim boundaries.');
        } catch {
          if (version === generation) note.textContent = text('Обрезка этого формата недоступна. Можно использовать полную запись или загрузить MP3/WAV.', 'This format cannot be trimmed. You can use the full audio or upload MP3/WAV.');
        } finally { if (version === generation) refresh(); }
      })();
    },
    async value() {
      const version = generation; await pending;
      if (version !== generation) throw new Error('Audio changed');
      if (!source || !decoded || (start === 0 && end === decoded.duration)) return source;
      const key = `${start}:${end}`;
      if (cache?.key === key) return cache.value;
      try {
        const blob = encodeSelection(decoded, start, end);
        const value = {name: source.name.replace(/\.[^.]+$/, '') + '-trimmed.wav', type: blob.type, blob};
        cache = {key, value}; return value;
      } catch (error) {
        note.textContent = text('Фрагмент слишком большой. Сократите его, чтобы размер был не более 25 МБ.', 'The fragment is too large. Shorten it to fit within 25 MB.');
        throw error;
      }
    }
  };
}
