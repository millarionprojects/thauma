// Called directly by a click. No await, file conversion or URL fetch precedes
// navigator.share(): iOS requires the original user activation.
export function shareVideoFile(file,native=navigator){
  if(typeof native.share!=='function'||typeof native.canShare!=='function'||!native.canShare({files:[file]})){
    return Promise.resolve({status:'unavailable'});
  }
  // Share only the file: extra title/text can change the available iOS actions.
  return native.share({files:[file]}).then(()=>({status:'handed-off'}));
}

export function saveMessage(result,language='ru'){
  const en=language==='en';
  if(result.status==='handed-off')return en
    ? 'The sharing menu has closed. If the video was not saved, use Download video.'
    : 'Меню закрылось. Если видео не сохранилось, нажмите «Скачать видео».';
  if(result.status==='unavailable')return en
    ? 'File sharing is unavailable in this browser. Use Download video.'
    : 'Меню сохранения недоступно в этом браузере. Нажмите «Скачать видео».';
  if(result.name==='AbortError')return en
    ? 'Sharing was cancelled or no suitable action was available. The video is ready: retry or use Download video.'
    : 'Меню закрыто или подходящее действие недоступно. Видео готово: можно повторить попытку или нажать «Скачать видео».';
  return en
    ? 'The browser could not share the file. The video is ready: use Download video.'
    : 'Браузер не смог передать файл. Видео готово — нажмите «Скачать видео».';
}
