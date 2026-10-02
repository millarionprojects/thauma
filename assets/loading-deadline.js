export function withDeadline(work, milliseconds, {onTimeout, onLate} = {}) {
  let settled = false, timer;
  return new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const error = new Error('Loading timed out');
      error.code = 'LOADING_TIMEOUT';
      reject(error);
      try { onTimeout?.(); } catch {}
    }, milliseconds);
    Promise.resolve(work).then(value => {
      if (settled) { try { onLate?.(value); } catch {} return; }
      settled = true; clearTimeout(timer); resolve(value);
    }, error => {
      if (settled) return;
      settled = true; clearTimeout(timer); reject(error);
    });
  });
}
