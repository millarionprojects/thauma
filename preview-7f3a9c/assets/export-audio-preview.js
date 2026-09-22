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

function audibleEnd(buffer){
  const rate=buffer.sampleRate||48000;
  const windowSize=Math.max(128,Math.round(rate*.02));
  const threshold=.006;
  let lastAudible=buffer.length;
  let found=false;
  for(let end=buffer.length;end>0;end-=windowSize){
    const start=Math.max(0,end-windowSize);
    let maxRms=0;
    for(let ch=0;ch<buffer.numberOfChannels;ch++){
      const data=buffer.getChannelData(ch);let sum=0;
      for(let i=start;i<end;i++){const x=data[i];sum+=x*x;}
      maxRms=Math.max(maxRms,Math.sqrt(sum/Math.max(1,end-start)));
    }
    if(maxRms>threshold){lastAudible=end;found=true;break;}
  }
  if(!found)return buffer.duration;
  const trailing=(buffer.length-lastAudible)/rate;
  // Only remove an unmistakable silent tail; keep 180 ms after the final
  // audible window so consonants/reverb never feel clipped.
  if(trailing<.45)return buffer.duration;
  return Math.min(buffer.duration,lastAudible/rate+.18);
}

export async function prepareSoundtrack(blob,enabled,signal){
  if(!enabled||!blob)return null;
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)throw Error('Audio export unavailable');
  const context=new Context();let source,destination,closed=false;
  async function close(){
    if(closed)return;closed=true;
    try{source?.stop();}catch{}
    source?.disconnect();
    destination?.stream.getTracks().forEach(track=>track.stop());
    if(context.state!=='closed')await context.close();
  }
  const abort=()=>{close().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});
  try{
    await context.resume();
    const bytes=await blob.arrayBuffer();if(signal?.aborted)throw Error('Aborted');
    const buffer=await context.decodeAudioData(bytes);if(signal?.aborted)throw Error('Aborted');
    if(!Number.isFinite(buffer.duration)||buffer.duration<=0)throw Error('Empty audio');
    const duration=audibleEnd(buffer);
    source=context.createBufferSource();source.buffer=buffer;
    destination=context.createMediaStreamDestination();source.connect(destination);
    return {
      duration,
      originalDuration:buffer.duration,
      track:destination.stream.getAudioTracks()[0],
      start(){source.start(0,0,duration);},
      async close(){signal?.removeEventListener('abort',abort);await close();}
    };
  }catch(error){
    signal?.removeEventListener('abort',abort);await close();throw error;
  }
}

export function recordingLength(animationSeconds,audioSeconds=0){
  // Keep a readable hold after a short/no-audio gift, but when a longer voice
  // message drives the export, end essentially with the audio instead of adding
  // a visible extra second of frozen video.
  return Math.max(animationSeconds+2.0,audioSeconds>0?audioSeconds+0.12:0);
}
