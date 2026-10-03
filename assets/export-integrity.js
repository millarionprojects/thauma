import {inspectMp4} from './mp4-integrity.js?v=20261003-duration1';
// A non-empty recorder Blob is not evidence of a complete movie.
export function checkDurationRange(actual, minimum, maximum) {
  if (!Number.isFinite(actual) || actual < minimum - .35 || actual > maximum + .75) {
    const error = new Error('Recording duration is outside the expected range');
    error.code = 'INCOMPLETE_VIDEO';
    error.actualDuration = actual;
    error.expectedDuration = maximum;
    throw error;
  }
  return actual;
}
export function checkDuration(actual, expected) {
  return checkDurationRange(actual, expected, expected);
}

export function waitForMedia(media, event, signal, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      media.removeEventListener(event, done);
      media.removeEventListener('error', failed);
      signal?.removeEventListener('abort', aborted);
    };
    const done = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('Video could not be decoded')); };
    const aborted = () => { cleanup(); reject(new Error('Recording interrupted')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('Video validation timed out')); }, timeout);
    media.addEventListener(event, done, { once: true });
    media.addEventListener('error', failed, { once: true });
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
  });
}

export async function verifyVideo(blob, expected, signal, {audioSeconds=0,videoSeconds=expected}={}) {
  if(blob.type.toLowerCase().startsWith('video/mp4')){
    const result=await inspectMp4(blob,signal);
    const video=result.tracks.find(t=>t.kind==='vide');
    const audio=result.tracks.find(t=>t.kind==='soun');
    if(!video?.samples){
      const error=new Error('Incomplete video');
      error.code='INCOMPLETE_VIDEO';
      throw error;
    }
    if(audioSeconds&&!audio?.samples){
      const error=new Error('Incomplete audio');
      error.code='INCOMPLETE_VIDEO';
      throw error;
    }
    checkDurationRange(video.duration, videoSeconds, expected);
    if(audioSeconds)checkDurationRange(audio.duration, audioSeconds, expected);
    const sampleEnd=Math.max(...result.tracks.filter(t=>t.samples).map(t=>t.duration+t.startTime));
    const duration=result.movieDuration||sampleEnd;
    checkDurationRange(duration,Math.max(videoSeconds,audioSeconds),expected);
    if(sampleEnd>expected+.75)checkDurationRange(sampleEnd,videoSeconds,expected);
    return {...result,duration};
  }
  const video = document.createElement('video');
  const url = URL.createObjectURL(blob);
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    const loaded = waitForMedia(video, 'loadedmetadata', signal);
    video.src = url;
    video.load();
    await loaded;
    // Some WebM recorders omit duration metadata. Seek once to discover it.
    if (!Number.isFinite(video.duration)) {
      const scanned = waitForMedia(video, 'seeked', signal);
      video.currentTime = 1e9;
      await scanned;
    }
    const duration = checkDurationRange(video.duration, Math.max(videoSeconds,audioSeconds), expected);
    const target = Math.max(0, Math.min(duration - .1, videoSeconds - .1));
    const decoded = waitForMedia(video, 'seeked', signal);
    video.currentTime = target;
    await decoded;
    if (video.readyState < 2 || !video.videoWidth || Math.abs(video.currentTime - target) > 0.35) {
      throw new Error('Final video frame unavailable');
    }
    return { duration, width: video.videoWidth, height: video.videoHeight };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
