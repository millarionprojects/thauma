// Preview audio quality guard. Keep microphone capture as unprocessed as browsers allow.
// Uploaded audio is never touched.
(function installMicQualityGuard(){
  const media=navigator.mediaDevices;
  if(media?.getUserMedia&&!media.__thaumaQualityPatched){
    const native=media.getUserMedia.bind(media);
    media.getUserMedia=constraints=>{
      if(constraints?.audio){
        const requested=typeof constraints.audio==='object'?constraints.audio:{};
        constraints={...constraints,audio:{
          ...requested,
          echoCancellation:false,
          noiseSuppression:false,
          autoGainControl:false,
          channelCount:1,
          sampleRate:48000,
          sampleSize:16
        }};
      }
      return native(constraints);
    };
    media.__thaumaQualityPatched=true;
  }
  const Native=window.MediaRecorder;
  if(Native&&!window.__thaumaRecorderQualityPatched){
    class ThaumaMediaRecorder extends Native{
      constructor(stream,options={}){
        const next={...(options||{})};
        if(stream?.getAudioTracks?.().length&&!next.audioBitsPerSecond)next.audioBitsPerSecond=192000;
        super(stream,next);
      }
      static isTypeSupported(type){return Native.isTypeSupported(type);}
    }
    window.MediaRecorder=ThaumaMediaRecorder;
    window.__thaumaRecorderQualityPatched=true;
  }
})();

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
  // Gentle single gain only: no compressor, no per-word AGC and no noise gate.
  const targetRms = 0.055;
  const peakCeiling = 0.89;
  const desired = rms < 0.00001 ? 1 : targetRms / rms;
  const gain = Math.min(2.5, peak > 0 ? peakCeiling / peak : 1, Math.max(1, desired));
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
  const Context = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Context) throw Error('Audio processing unavailable');
  // Previous preview decoded at 32 kHz, which audibly dulled speech. Keep 48 kHz.
  const context = new Context(1, 1, 48000);
  return levelVoice(await context.decodeAudioData(await blob.arrayBuffer()));
}
