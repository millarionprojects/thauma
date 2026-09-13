let locked=false;

// Thauma accepts both speech and music. iPhone/Safari's default echo and noise
// processing can chop audio played from a nearby speaker, so request the least
// processed microphone signal available. Unsupported constraints are ignored.
const media=navigator.mediaDevices;
if(media?.getUserMedia&&!media.__thaumaNaturalCapture){
 const original=media.getUserMedia.bind(media);
 try{
  media.getUserMedia=constraints=>{
   if(constraints?.audio){
    const requested=constraints.audio===true?{}:constraints.audio;
    constraints={...constraints,audio:{...requested,echoCancellation:false,noiseSuppression:false,autoGainControl:false}};
   }
   return original(constraints);
  };
  media.__thaumaNaturalCapture=true;
 }catch{}
}

export function lockPlayback(){
 locked=true;
 document.querySelectorAll('audio,video').forEach(player=>player.pause());
 const preview=document.getElementById('audioPreview');if(preview)preview.controls=false;
}
export function unlockPlayback(){
 locked=false;
 const preview=document.getElementById('audioPreview');if(preview)preview.controls=true;
}
// Never monitor microphone input through speakers, or play two page players.
document.addEventListener('play',event=>{
 const current=event.target;if(!current.matches?.('audio,video'))return;
 if(locked){current.pause();return;}
 document.querySelectorAll('audio,video').forEach(player=>{if(player!==current)player.pause();});
},true);
window.addEventListener('pagehide',()=>{lockPlayback();unlockPlayback();});
