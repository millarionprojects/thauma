import * as base from './export-audio.js?base=1';

(function installExportAudioQuality(){
  const Native=window.MediaRecorder;
  if(!Native||window.__thaumaExportRecorderQualityPatched)return;
  class ThaumaExportRecorder extends Native{
    constructor(stream,options={}){
      const next={...(options||{})};
      if(stream?.getAudioTracks?.().length&&!next.audioBitsPerSecond)next.audioBitsPerSecond=192000;
      super(stream,next);
    }
    static isTypeSupported(type){return Native.isTypeSupported(type);}
  }
  window.MediaRecorder=ThaumaExportRecorder;
  window.__thaumaExportRecorderQualityPatched=true;
})();

export const mountAudioExport=base.mountAudioExport;
export const prepareSoundtrack=base.prepareSoundtrack;
export function recordingLength(animationSeconds,audioSeconds=0){
  // Keep a readable hold after a short/no-audio gift, but when a longer voice
  // message drives the export, end essentially with the audio instead of adding
  // a visible extra second of frozen video.
  return Math.max(animationSeconds+2.0,audioSeconds>0?audioSeconds+0.12:0);
}
