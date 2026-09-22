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

// Keep the audio MediaStream clock parked until MediaRecorder has actually
// started. Previously the AudioContext was resumed while the export scene was
// still being built; Safari then preserved that elapsed context time as leading
// silence/timestamps in the AAC track, making the movie look like
// visual-duration + audio-duration.
export async function prepareSoundtrack(blob,enabled,signal){
  if(!enabled||!blob)return null;
  const Context=window.AudioContext||window.webkitAudioContext;
  if(!Context)throw Error('Audio export unavailable');

  // Decode in a temporary context so the recording context itself never ages
  // while scene/canvas preparation is happening.
  const decodeContext=new Context();
  let buffer;
  try{
    await decodeContext.resume();
    const bytes=await blob.arrayBuffer();
    if(signal?.aborted)throw Error('Aborted');
    buffer=await decodeContext.decodeAudioData(bytes);
    if(!Number.isFinite(buffer.duration)||buffer.duration<=0)throw Error('Empty audio');
  }finally{
    if(decodeContext.state!=='closed')await decodeContext.close().catch(()=>{});
  }

  const context=new Context();
  let source=null,destination=null,closed=false,started=false;
  // Prime audio under the original user gesture, then freeze its clock at ~0.
  await context.resume();
  await context.suspend();
  source=context.createBufferSource();
  source.buffer=buffer;
  destination=context.createMediaStreamDestination();
  source.connect(destination);

  async function close(){
    if(closed)return;closed=true;
    try{source?.stop();}catch{}
    source?.disconnect();
    destination?.stream.getTracks().forEach(track=>track.stop());
    if(context.state!=='closed')await context.close().catch(()=>{});
  }
  const abort=()=>{close().catch(()=>{});};
  signal?.addEventListener('abort',abort,{once:true});

  return {
    duration:buffer.duration,
    track:destination.stream.getAudioTracks()[0],
    async start(){
      if(started)return;started=true;
      if(signal?.aborted)throw Error('Aborted');
      await context.resume();
      source.start(0);
    },
    async close(){
      signal?.removeEventListener('abort',abort);
      await close();
    }
  };
}

// The movie ends at the later of the complete visual sequence and the original
// audio. No synthetic one/two-second tail is added.
export function recordingLength(visualSeconds,audioSeconds=0){
  return Math.max(visualSeconds,Number(audioSeconds)||0);
}
