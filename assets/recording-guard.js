let locked=false;
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
