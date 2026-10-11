import { create } from 'zustand';
import { useSettings } from './settingsStore';

export type CameraStatus = 'off' | 'starting' | 'on' | 'error';

interface CameraStore {
  status: CameraStatus;
  stream: MediaStream | null;
  error: string | null;
  devices: MediaDeviceInfo[];
  deviceId: string | null;
  size: { width: number; height: number } | null;
  start: (deviceId?: string | null) => Promise<void>;
  stop: () => void;
  refreshDevices: () => Promise<void>;
}

function describeError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission was denied. Allow camera access in your browser’s site settings and try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found. Connect a webcam and try again.';
    case 'NotReadableError':
      return 'The camera is in use by another application. Close it and try again.';
    default:
      return err instanceof Error ? err.message : 'Could not start the camera.';
  }
}

export const useCamera = create<CameraStore>((set, get) => ({
  status: 'off',
  stream: null,
  error: null,
  devices: [],
  deviceId: null,
  size: null,

  async start(deviceId) {
    if (!navigator.mediaDevices?.getUserMedia) {
      set({ status: 'error', error: 'This browser does not support camera access (a secure context — https or localhost — is required).' });
      return;
    }
    get().stop();
    set({ status: 'starting', error: null });
    const [w, h] = useSettings.getState().resolution.split('x').map(Number);
    const id = deviceId ?? get().deviceId;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          ...(id ? { deviceId: { exact: id } } : { facingMode: 'user' }),
          width: { ideal: w },
          height: { ideal: h },
          frameRate: { ideal: 30 },
        },
      });
      const track = stream.getVideoTracks()[0];
      const s = track.getSettings();
      track.addEventListener('ended', () => {
        if (get().stream === stream) set({ status: 'off', stream: null, size: null });
      });
      set({
        status: 'on',
        stream,
        deviceId: s.deviceId ?? id ?? null,
        size: s.width && s.height ? { width: s.width, height: s.height } : null,
      });
      void get().refreshDevices();
    } catch (err) {
      set({ status: 'error', stream: null, error: describeError(err) });
    }
  },

  stop() {
    const { stream } = get();
    stream?.getTracks().forEach((t) => t.stop());
    set({ status: 'off', stream: null, size: null });
  },

  async refreshDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      set({ devices: all.filter((d) => d.kind === 'videoinput') });
    } catch {
      /* ignore */
    }
  },
}));
