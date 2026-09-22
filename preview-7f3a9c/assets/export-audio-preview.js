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

// The movie ends at the later of the complete visual sequence and the original
// audio. No synthetic one/two-second tail is added.
export function recordingLength(visualSeconds,audioSeconds=0){
  return Math.max(visualSeconds,Number(audioSeconds)||0);
}
