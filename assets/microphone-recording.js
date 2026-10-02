// Keep voice capture compatible with the existing raw microphone recording.
// Request stereo for music when the device supports it; no exact constraints.
export function recordingOptions(mode = 'voice') {
  const music = mode === 'music';
  return {
    constraints: { audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: music ? 2 : 1 },
      sampleRate: { ideal: 48000 },
      sampleSize: { ideal: 16 }
    }},
    recorder: { audioBitsPerSecond: music ? 256000 : 192000 }
  };
}
