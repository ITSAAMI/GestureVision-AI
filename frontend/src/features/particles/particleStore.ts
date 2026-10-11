import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { FORMATIONS, type Formation, type PaletteName } from './formations';

interface ParticleStore {
  formation: Formation;
  palette: PaletteName;
  count: number;
  speed: number;
  size: number;
  autoRotate: boolean;
  set: (patch: Partial<Omit<ParticleStore, 'set' | 'cycle'>>) => void;
  cycle: (dir: 1 | -1) => void;
}

export const useParticles = create<ParticleStore>()(
  persist(
    (set, get) => ({
      formation: 'galaxy',
      palette: 'aurora',
      count: 12000,
      speed: 1,
      size: 1,
      autoRotate: true,
      set: (patch) => set(patch),
      cycle: (dir) => {
        const i = FORMATIONS.indexOf(get().formation);
        set({ formation: FORMATIONS[(i + dir + FORMATIONS.length) % FORMATIONS.length] });
      },
    }),
    { name: 'gv-particles', version: 1 },
  ),
);

/** Mutable interaction state shared between the gesture controller and the render loop. */
export interface ParticleControl {
  cursor: { x: number; y: number; z: number };
  cursorActive: boolean;
  mode: 'idle' | 'spread' | 'attract' | 'repel';
  scale: number;
  baseScale: number;
  spinDir: 1 | -1;
  spinBoostUntil: number;
  burstAt: number;
  waveAt: number;
  pinchStart: { y: number; scale: number } | null;
}

export function createControl(): ParticleControl {
  return {
    cursor: { x: 0, y: 0, z: 0 },
    cursorActive: false,
    mode: 'idle',
    scale: 1,
    baseScale: 1,
    spinDir: 1,
    spinBoostUntil: 0,
    burstAt: -1,
    waveAt: -1,
    pinchStart: null,
  };
}
