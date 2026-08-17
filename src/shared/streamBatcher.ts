export interface StreamBatcherPending {
  text: string;
  thinking: string;
}

export interface StreamBatcher {
  appendText(text: string): void;
  appendThinking(text: string): void;
  flushNow(): void;
  dispose(): void;
}

export interface StreamBatcherScheduler {
  scheduleFrame: (callback: () => void) => number;
  cancelFrame: (id: number) => void;
}

const defaultScheduler: StreamBatcherScheduler = {
  scheduleFrame: (callback) => (typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(callback)
    : (setTimeout(callback, 16) as unknown as number)),
  cancelFrame: (id) => {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
    else clearTimeout(id);
  },
};

// Coalesces high-frequency stream deltas into one flush per animation frame so
// the popup re-renders at most ~60 times per second while streaming.
export function createStreamBatcher(
  flush: (pending: StreamBatcherPending) => void,
  scheduler: StreamBatcherScheduler = defaultScheduler,
): StreamBatcher {
  let text = "";
  let thinking = "";
  let frame: number | null = null;
  let disposed = false;

  const runFlush = () => {
    frame = null;
    if (disposed || (!text && !thinking)) return;
    const pending = { text, thinking };
    text = "";
    thinking = "";
    flush(pending);
  };

  const schedule = () => {
    if (frame !== null || disposed) return;
    frame = scheduler.scheduleFrame(runFlush);
  };

  return {
    appendText(next: string) {
      if (disposed || !next) return;
      text += next;
      schedule();
    },
    appendThinking(next: string) {
      if (disposed || !next) return;
      thinking += next;
      schedule();
    },
    flushNow() {
      if (frame !== null) {
        scheduler.cancelFrame(frame);
        frame = null;
      }
      runFlush();
    },
    dispose() {
      if (frame !== null) scheduler.cancelFrame(frame);
      frame = null;
      text = "";
      thinking = "";
      disposed = true;
    },
  };
}
