import type { LinkState } from '../../store/visionStore';
import type { FrameAnalysis, ServerHello } from './types';

/**
 * WebSocket link to the backend detector. Only one frame is in flight at a
 * time (the next is sent after the reply), so a slow backend never builds a
 * queue of stale frames. Reconnects with exponential backoff.
 */
export class DetectionSocket {
  onAnalysis?: (analysis: FrameAnalysis, roundTripMs: number) => void;
  onHello?: (hello: ServerHello) => void;
  onState?: (state: LinkState) => void;

  private ws: WebSocket | null = null;
  private wanted = false;
  private retryMs = 1000;
  private timer: number | undefined;
  private inFlightSince = 0;

  get isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** True while waiting for a reply (stale requests are abandoned after 4 s). */
  get busy(): boolean {
    return this.inFlightSince > 0 && performance.now() - this.inFlightSince < 4000;
  }

  connect(): void {
    this.wanted = true;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.open();
  }

  disconnect(): void {
    this.wanted = false;
    window.clearTimeout(this.timer);
    const ws = this.ws;
    this.ws = null;
    this.inFlightSince = 0;
    ws?.close();
    this.onState?.('idle');
  }

  sendFrame(blob: Blob): boolean {
    if (!this.isOpen || this.busy) return false;
    this.ws!.send(blob);
    this.inFlightSince = performance.now();
    return true;
  }

  sendGesture(gesture: string): void {
    if (this.isOpen) this.ws!.send(JSON.stringify({ type: 'gesture', gesture }));
  }

  private open(): void {
    window.clearTimeout(this.timer);
    this.onState?.('connecting');
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/detect`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.retryMs = 1000;
      this.inFlightSince = 0;
      this.onState?.('open');
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let msg: { type?: string };
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (msg.type === 'analysis') {
        const rtt = this.inFlightSince ? performance.now() - this.inFlightSince : 0;
        this.inFlightSince = 0;
        this.onAnalysis?.(msg as FrameAnalysis, rtt);
      } else if (msg.type === 'hello') {
        this.onHello?.(msg as ServerHello);
      } else if (msg.type === 'error') {
        this.inFlightSince = 0;
      }
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.inFlightSince = 0;
      this.onState?.('closed');
      if (this.wanted) {
        this.timer = window.setTimeout(() => this.open(), this.retryMs);
        this.retryMs = Math.min(this.retryMs * 2, 10_000);
      }
    };
  }
}

/** Downscales the current video frame and encodes it as JPEG. */
export class FrameEncoder {
  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d');
  private busy = false;

  encode(video: HTMLVideoElement, maxWidth: number, quality: number): Promise<Blob | null> {
    if (this.busy || !this.ctx || !video.videoWidth) return Promise.resolve(null);
    this.busy = true;
    const w = Math.min(maxWidth, video.videoWidth);
    const h = Math.round((video.videoHeight * w) / video.videoWidth);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.drawImage(video, 0, 0, w, h);
    return new Promise((resolve) =>
      this.canvas.toBlob(
        (blob) => {
          this.busy = false;
          resolve(blob);
        },
        'image/jpeg',
        quality,
      ),
    );
  }
}
