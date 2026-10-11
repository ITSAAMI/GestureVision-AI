import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface OverlayLayers {
  persons: boolean;
  faces: boolean;
  hands: boolean;
  pose: boolean;
  trails: boolean;
  labels: boolean;
}

export type Resolution = '640x480' | '1280x720' | '1920x1080';

export interface ClientSettings {
  mirror: boolean;
  resolution: Resolution;
  layers: OverlayLayers;
  streamToBackend: boolean;
  streamFps: number;
  streamQuality: number;
  streamWidth: number;
  enableHands: boolean;
  enablePose: boolean;
  handConfidence: number;
  gestureWindow: number;
  gestureCooldownMs: number;
}

export const DEFAULT_SETTINGS: ClientSettings = {
  mirror: true,
  resolution: '1280x720',
  layers: { persons: true, faces: true, hands: true, pose: true, trails: true, labels: true },
  streamToBackend: true,
  streamFps: 10,
  streamQuality: 0.72,
  streamWidth: 640,
  enableHands: true,
  enablePose: true,
  handConfidence: 0.6,
  gestureWindow: 6,
  gestureCooldownMs: 800,
};

interface SettingsStore extends ClientSettings {
  update: (patch: Partial<ClientSettings>) => void;
  setLayer: (layer: keyof OverlayLayers, value: boolean) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      setLayer: (layer, value) => set((s) => ({ layers: { ...s.layers, [layer]: value } })),
      reset: () => set(DEFAULT_SETTINGS),
    }),
    {
      name: 'gv-settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ClientSettings>;
        return { ...current, ...p, layers: { ...current.layers, ...p.layers } };
      },
    },
  ),
);
