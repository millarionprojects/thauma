// Bound work independently of a 60/120 Hz display. The final still is copied,
// not re-rendered through the scene engine for the remainder of the soundtrack.
export function createExportPainter({canvas, draw, sceneSeconds, presentationSeconds, onStill, fps = 30}) {
  const context = canvas.getContext('2d');
  let lastFrame = -1, still = null;
  return {
    paint(seconds) {
      const frame = Math.floor(Math.max(0, seconds) * fps + 1e-6);
      if (frame <= lastFrame) return false;
      lastFrame = frame;
      if (still) {
        context.drawImage(still, 0, 0);
      } else {
        draw(Math.min(1, seconds / sceneSeconds), seconds);
        if (seconds >= sceneSeconds + presentationSeconds) {
          still = document.createElement('canvas');
          still.width = canvas.width; still.height = canvas.height;
          still.getContext('2d').drawImage(canvas, 0, 0);
          onStill?.();
        }
      }
      return true;
    },
    dispose() {
      if (still) { still.width = 1; still.height = 1; still = null; }
    }
  };
}
