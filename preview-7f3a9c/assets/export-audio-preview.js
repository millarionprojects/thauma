import * as base from './export-audio.js?base=1';

export const mountAudioExport=base.mountAudioExport;
export const prepareSoundtrack=base.prepareSoundtrack;
export function recordingLength(animationSeconds,audioSeconds=0){
  return Math.max(animationSeconds+2.35,audioSeconds+.45);
}
