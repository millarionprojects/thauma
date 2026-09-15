import * as base from './export-audio.js?base=1';

// Raise the encoded audio bitrate for saved opening videos when the browser allows it.
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
  return Math.max(animationSeconds+2.35,audioSeconds+.45);
}
