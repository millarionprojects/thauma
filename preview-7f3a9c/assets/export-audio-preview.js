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
  // The certificate now reaches its final state inside the scene itself, so a
  // short settle is enough. Longer attached audio still keeps the video alive.
  return Math.max(animationSeconds+1.05,audioSeconds+1.0);
}
