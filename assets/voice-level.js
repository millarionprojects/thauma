// Applied only to a new microphone recording, before preview or gift storage.
// Uploaded music is left unchanged. Use one fixed gain; never pump between words.
export function levelVoice(buffer) {
  const channels = Math.min(2, buffer.numberOfChannels);
  let peak = 0, sum = 0;
  for (let c = 0; c < channels; c++) {
    for (const sample of buffer.getChannelData(c)) {
      if (!Number.isFinite(sample)) throw Error('Invalid audio samples');
      peak = Math.max(peak, Math.abs(sample));
      sum += sample * sample;
    }
  }
  const rms = Math.sqrt(sum / Math.max(1, buffer.length * channels));
  const gain = rms < 0.00001 ? 1 : Math.min(12, 0.708 / Math.max(peak, 0.00001), Math.max(1, 0.08 / rms));
  const size = buffer.length * channels * 2;
  if (!channels || size + 44 > 25 * 1048576) throw Error('Recording too large');
  const data = new ArrayBuffer(44 + size), view = new DataView(data);
  const text = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, size + 36, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, size, true);
  const samples = Array.from({length: channels}, (_, c) => buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) for (let c = 0; c < channels; c++) {
    const value = Math.max(-1, Math.min(1, samples[c][i] * gain));
    view.setInt16(44 + (i * channels + c) * 2, Math.round(value * (value < 0 ? 32768 : 32767)), true);
  }
  return new Blob([data], {type: 'audio/wav'});
}
export async function prepareVoice(blob) {
  // Offline decoding does not open a speaker route or monitor the microphone.
  const Context = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Context) throw Error('Audio processing unavailable');
  const context = new Context(1, 1, 32000);
  return levelVoice(await context.decodeAudioData(await blob.arrayBuffer()));
}
