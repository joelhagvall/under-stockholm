/**
 * How long a slice of work behind the loading screen may run before it lets a frame through. The bar needs only a
 * few updates a second, and every frame waited for is time the player waits too: at 14 ms a phone spent a third of
 * the loading idle, between frames.
 */
export const LOADING_SLICE_MS = 50;

/**
 * Resolves on the next animation frame, so a long job can let the page paint
 * between slices. A hidden page gets no frames and its timers are throttled
 * to once a second, so there the promise resolves through a message instead,
 * which background tabs do not throttle.
 */
export function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (document.hidden) {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(null);
      return;
    }
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      resolve();
    };
    const frame = requestAnimationFrame(go);
    // A frame that never comes (a window minimized mid-load) must not stall the build.
    const timeout = setTimeout(go, 100);
  });
}
