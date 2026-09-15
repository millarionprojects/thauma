import './recording-guard.js';
const en=()=>document.documentElement.lang==='en';
export function mountAudioExport(gift,clearPrepared){
 const audio=document.getElementById('soundVideo'),personal=document.getElementById('personalVideo');
 const available=!!gift.audio?.blob;
 audio.disabled=!available;audio.checked=available;
 document.getElementById('soundVideoLabel').textContent=en()?'Include voice or music':'Добавить голос или музыку';
 function refresh(){
  document.getElementById('soundVideoHint').textContent=!available?(en()?'No audio attached. The video will be silent.':'Аудио не добавлено. Видео будет без звука.'):
   audio.checked?(en()?'Everyone receiving the video can hear this recording.':'Запись будет слышна всем, кому вы отправите видео.'):(en()?'The video will be saved without sound.':'Видео сохранится без звука.');
  document.getElementById('privacyHint').textContent=personal.checked?(en()?'The video will show your original certificate and personal text.':'В видео попадут настоящий сертификат и личный текст.'):(en()?'The certificate, QR code and personal text will be hidden. Audio is selected separately.':'Сертификат, QR-код и личный текст будут скрыты. Звук выбирается отдельно.');
 }
 audio.addEventListener('change',()=>{clearPrepared();refresh();});
 personal.addEventListener('change',refresh);refresh();
}
// Keep a guaranteed visual tail after the opening. The previous 1.5 s tail could
// finish before the polished envelope handoff completed on iPhone.
export function recordingLength(animationSeconds,audioSeconds=0){return Math.max(animationSeconds+3.25,audioSeconds+1.0);}
export async function prepareSoundtrack(blob,enabled,signal){
 if(!enabled||!blob)return null;
 const Context=window.AudioContext||window.webkitAudioContext;
 if(!Context)throw Error('Audio export unavailable');
 const context=new Context();let source,destination,closed=false;
 async function close(){if(closed)return;closed=true;try{source?.stop();}catch{}source?.disconnect();destination?.stream.getTracks().forEach(track=>track.stop());if(context.state!=='closed')await context.close();}
 const abort=()=>{close().catch(()=>{});};signal?.addEventListener('abort',abort,{once:true});
 try{
  await context.resume();
  const bytes=await blob.arrayBuffer();if(signal?.aborted)throw Error('Aborted');
  const buffer=await context.decodeAudioData(bytes);if(signal?.aborted)throw Error('Aborted');
  if(!Number.isFinite(buffer.duration)||buffer.duration<=0)throw Error('Empty audio');
  source=context.createBufferSource();source.buffer=buffer;
  destination=context.createMediaStreamDestination();source.connect(destination);
  return {duration:buffer.duration,track:destination.stream.getAudioTracks()[0],start(){source.start();},async close(){signal?.removeEventListener('abort',abort);await close();}};
 }catch(error){signal?.removeEventListener('abort',abort);await close();throw error;}
}
