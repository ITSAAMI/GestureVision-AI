/**
 * UI-facing vision state. Updated by the vision engine at a low rate (only on
 * change), so React components can subscribe without re-rendering every frame.
 * Per-frame data (landmarks, boxes) is read directly from the engine instead.
 */
import { create } from 'zustand';
import type { FrameAnalysis, Gesture, PoseActivity } from '../features/vision/types';

export type ModelState = 'idle' | 'loading' | 'ready' | 'error';
export type LinkState = 'idle' | 'connecting' | 'open' | 'closed';

export interface HandGestureState {
  gesture: Gesture;
  confidence: number;
}

export interface LogEvent {
  id: number;
  at: number;
  kind: 'gesture' | 'person' | 'face' | 'system';
  text: string;
}

interface VisionStore {
  handsModel: ModelState;
  poseModel: ModelState;
  modelError: string | null;
  link: LinkState;
  sessionId: string | null;
  backendModels: { person_detection: boolean; face_detection: boolean; face_recognition: boolean } | null;

  pipelineFps: number;
  backendFps: number;
  backendLatencyMs: number;
  inferenceMs: number;

  left: HandGestureState | null;
  right: HandGestureState | null;
  twoHand: Gesture | null;
  lastGesture: { gesture: Gesture; at: number } | null;
  handsVisible: number;
  pose: { activity: PoseActivity; confidence: number } | null;

  analysis: FrameAnalysis | null;
  events: LogEvent[];
  gestureCounts: Partial<Record<Gesture, number>>;

  set: (patch: Partial<VisionStore>) => void;
  log: (kind: LogEvent['kind'], text: string) => void;
  clearEvents: () => void;
}

let eventId = 1;

export const useVision = create<VisionStore>((set, get) => ({
  handsModel: 'idle',
  poseModel: 'idle',
  modelError: null,
  link: 'idle',
  sessionId: null,
  backendModels: null,
  pipelineFps: 0,
  backendFps: 0,
  backendLatencyMs: 0,
  inferenceMs: 0,
  left: null,
  right: null,
  twoHand: null,
  lastGesture: null,
  handsVisible: 0,
  pose: null,
  analysis: null,
  events: [],
  gestureCounts: {},

  set: (patch) => set(patch),
  log(kind, text) {
    set({ events: [{ id: eventId++, at: Date.now(), kind, text }, ...get().events].slice(0, 60) });
  },
  clearEvents: () => set({ events: [], gestureCounts: {} }),
}));
