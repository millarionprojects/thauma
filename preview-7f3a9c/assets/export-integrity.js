import {inspectMp4} from './mp4-integrity.js?v=20260922-duration1';
// A non-empty recorder Blob is not evidence of a complete movie.
export function checkDuration(actual, expected) {
  if (!Number.isFinite(actual) || actual < expected - 0.35 || actual > expected + 2) {
    const error = new Error('Incomplete video');
    error.code = 'INCOMPLETE_VIDEO';
    error.actualDuration = actual;
    error.expectedDuration = expected;
    throw error;
  }
  return actual;
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

export async function verifyVideo(blob, expected, signal, {audioSeconds=0}={}) {
  if(blob.type.toLowerCase().startsWith('video/mp4')){
    const result=await inspectMp4(blob,signal);
    checkDuration(result.duration,expected);
    if(audioSeconds)checkDuration(result.tracks.find(t=>t.kind==='soun')?.duration,audioSeconds);
    // iOS may not load/seek a detached video after the recording gesture has
    // expired. Validate encoded samples instead of making Save depend on it.
    return result;
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
    const duration = checkDuration(video.duration, expected);
    const target = Math.max(0, expected - 0.25);
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
