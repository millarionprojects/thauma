// Peak envelope of the actual decoded audio, not a decorative waveform.
export function audioPeaks(buffer, count = 1200) {
  const peaks = new Float32Array(count);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const bin = Math.min(count - 1, Math.floor(i * count / data.length));
      peaks[bin] = Math.max(peaks[bin], Math.abs(data[i]) || 0);
    }
  }
  return peaks;
}
export function timeLabel(seconds) {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  return `${Math.floor(tenths / 600)}:${String(Math.floor(tenths / 10) % 60).padStart(2, '0')}.${tenths % 10}`;
}
export function selectionEdge(edge, value, start, end, duration) {
  const gap = Math.min(.1, duration);
  return edge === 'start'
    ? [Math.max(0, Math.min(value, end - gap)), end]
    : [start, Math.max(start + gap, Math.min(value, duration))];
}
export function createWaveform(host, change, seek) {
  host.innerHTML = `<div class="wave-ruler" aria-hidden="true"><span></span><span></span><span></span></div><div class="wave-track"><canvas aria-hidden="true"></canvas><div class="wave-shade wave-before"></div><div class="wave-shade wave-after"></div><div class="wave-selection" aria-hidden="true"></div><div class="wave-head" aria-hidden="true"></div><button type="button" role="slider" class="wave-handle wave-start" data-edge="start" aria-orientation="horizontal"></button><button type="button" role="slider" class="wave-handle wave-end" data-edge="end" aria-orientation="horizontal"></button></div><div class="wave-times"><span class="wave-in"></span><span class="wave-out"></span></div>`;
  const track = host.querySelector('.wave-track'), canvas = host.querySelector('canvas');
  const handles = [...host.querySelectorAll('.wave-handle')];
  const head = host.querySelector('.wave-head');
  head.removeAttribute('aria-hidden');
  head.innerHTML = '<button type="button" class="wave-scrubber" role="slider" aria-orientation="horizontal"></button>';
  const scrubber = head.querySelector('button');
  let headTime = 0, headDrag = null, seekTimer = null, queuedTime = null, lastSeek = 0;
  let duration = 0, start = 0, end = 0, peaks = null, disabled = true, drag = null;
  function draw() {
    const width = Math.max(1, track.clientWidth), height = 92, ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio); canvas.height = height * ratio;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = '#34606c'; ctx.beginPath(); ctx.moveTo(0, height / 2); ctx.lineTo(width, height / 2); ctx.stroke();
    if (!peaks) return;
    const max = Math.max(.01, ...peaks);
    ctx.fillStyle = '#48c4e6'; ctx.beginPath();
    const sample = x => {
      const a = Math.floor(x / width * peaks.length), b = Math.max(a + 1, Math.ceil((x + 1) / width * peaks.length));
      let peak = 0; for (let i = a; i < Math.min(b, peaks.length); i++) peak = Math.max(peak, peaks[i]);
      return peak / max * 35;
    };
    ctx.moveTo(0, height / 2);
    for (let x = 0; x < width; x++) ctx.lineTo(x, height / 2 - sample(x));
    for (let x = Math.ceil(width) - 1; x >= 0; x--) ctx.lineTo(x, height / 2 + sample(x));
    ctx.closePath(); ctx.fill();
  }
  const percent = value => `${duration ? Math.max(0, Math.min(100, value / duration * 100)) : 0}%`;
  function paintHead(time) {
    headTime = time; head.style.left = percent(time);
    scrubber.setAttribute('aria-valuenow', time);
    scrubber.setAttribute('aria-valuetext', timeLabel(time));
  }
  function position(time) { if (!headDrag) paintHead(time); }
  function commitSeek() {
    clearTimeout(seekTimer); seekTimer = null;
    if (queuedTime === null || disabled) { queuedTime = null; return; }
    const time = queuedTime; queuedTime = null; lastSeek = performance.now(); seek(time);
  }
  function scrub(time, immediate = false) {
    queuedTime = Math.max(0, Math.min(duration, time)); paintHead(queuedTime);
    // Limit decoder seek churn while the finger moves; always commit the final position.
    if (immediate || performance.now() - lastSeek >= 80) commitSeek();
    else if (!seekTimer) seekTimer = setTimeout(commitSeek, 80);
  }
  function refresh(nextStart, nextEnd, locked, english) {
    start = nextStart; end = nextEnd; disabled = locked || !duration;
    host.classList.toggle('wave-disabled', disabled);
    scrubber.disabled = disabled;
    scrubber.setAttribute('aria-label', english ? 'Playback position' : 'Позиция прослушивания');
    scrubber.setAttribute('aria-valuemin', 0); scrubber.setAttribute('aria-valuemax', duration);
    if (disabled) { clearTimeout(seekTimer); seekTimer = null; queuedTime = null; headDrag = null; }
    host.querySelector('.wave-before').style.width = percent(start);
    host.querySelector('.wave-after').style.left = percent(end);
    const selection = host.querySelector('.wave-selection');
    selection.style.left = percent(start); selection.style.width = percent(end - start);
    host.querySelector('.wave-in').textContent = timeLabel(start);
    host.querySelector('.wave-out').textContent = timeLabel(end);
    for (const handle of handles) {
      const isStart = handle.dataset.edge === 'start', value = isStart ? start : end;
      handle.style.left = percent(value); handle.disabled = disabled;
      handle.setAttribute('aria-label', english ? (isStart ? 'Fragment start' : 'Fragment end') : (isStart ? 'Начало фрагмента' : 'Конец фрагмента'));
      handle.setAttribute('aria-valuemin', isStart ? 0 : Math.min(duration, start + .1));
      handle.setAttribute('aria-valuemax', isStart ? Math.max(0, end - .1) : duration);
      handle.setAttribute('aria-valuenow', value);
      handle.setAttribute('aria-valuetext', timeLabel(value));
    }
  }
  function move(edge, value) { const bounds = selectionEdge(edge, value, start, end, duration); change(...bounds); }
  handles.forEach(handle => {
    handle.addEventListener('pointerdown', event => {
      if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault(); event.stopPropagation();
      drag = {id: event.pointerId, edge: handle.dataset.edge, x: event.clientX, value: handle.dataset.edge === 'start' ? start : end};
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId || disabled) return;
      event.preventDefault();
      move(drag.edge, drag.value + (event.clientX - drag.x) / Math.max(1, track.getBoundingClientRect().width) * duration);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) handle.addEventListener(type, () => { drag = null; });
    handle.addEventListener('keydown', event => {
      if (disabled) return;
      const edge = handle.dataset.edge, current = edge === 'start' ? start : end, step = event.shiftKey ? 1 : .1;
      const values = {ArrowLeft: current - step, ArrowDown: current - step, ArrowRight: current + step, ArrowUp: current + step, Home: 0, End: duration};
      if (event.key in values) { event.preventDefault(); move(edge, values[event.key]); }
    });
  });
  scrubber.addEventListener('pointerdown', event => {
    if (disabled || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); event.stopPropagation();
    headDrag = {id: event.pointerId, x: event.clientX, time: headTime};
    scrubber.setPointerCapture(event.pointerId);
  });
  scrubber.addEventListener('pointermove', event => {
    if (!headDrag || headDrag.id !== event.pointerId || disabled) return;
    event.preventDefault();
    scrub(headDrag.time + (event.clientX - headDrag.x) / Math.max(1, track.getBoundingClientRect().width) * duration);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) scrubber.addEventListener(type, () => {
    if (!headDrag) return;
    commitSeek(); headDrag = null;
  });
  scrubber.addEventListener('keydown', event => {
    if (disabled) return;
    const step = event.shiftKey ? 1 : .1;
    const values = {ArrowLeft: headTime - step, ArrowDown: headTime - step, ArrowRight: headTime + step, ArrowUp: headTime + step, Home: 0, End: duration};
    if (event.key in values) { event.preventDefault(); scrub(values[event.key], true); }
  });
  track.addEventListener('pointerdown', event => {
    if (disabled || event.target.closest('.wave-handle, .wave-scrubber')) return;
    const rect = track.getBoundingClientRect();
    scrub((event.clientX - rect.left) / Math.max(1, rect.width) * duration, true);
  });
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
  observer?.observe(track); window.addEventListener('resize', draw);
  return {
    refresh, position,
    setBuffer(buffer) {
      clearTimeout(seekTimer); seekTimer = null; queuedTime = null; headDrag = null;
      drag = null; duration = buffer?.duration || 0; peaks = buffer ? audioPeaks(buffer) : null;
      host.querySelectorAll('.wave-ruler span').forEach((label, i) => label.textContent = timeLabel(duration * i / 2));
      draw(); position(0);
    }
  };
}
