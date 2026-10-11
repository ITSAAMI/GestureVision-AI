export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type Gesture =
  | 'open_palm'
  | 'closed_fist'
  | 'thumbs_up'
  | 'thumbs_down'
  | 'victory'
  | 'one_finger'
  | 'two_finger'
  | 'pinch'
  | 'waving'
  | 'both_hands_raised'
  | 'hands_together'
  | 'unknown';

export type Handedness = 'Left' | 'Right';

export interface HandObservation {
  handedness: Handedness;
  score: number;
  landmarks: Landmark[];
  /** Per-frame classification. */
  gesture: Gesture;
  /** Smoothed gesture (majority over recent frames). */
  stableGesture: Gesture;
  confidence: number;
  palm: { x: number; y: number };
  palmSize: number;
  /** Thumb–index distance relative to palm size (≈0 pinched, ≈1.5 open). */
  pinch: number;
}

export type PoseActivity =
  | 'standing'
  | 'sitting'
  | 'arms_raised'
  | 'left_arm_raised'
  | 'right_arm_raised'
  | 't_pose'
  | 'leaning_left'
  | 'leaning_right'
  | 'unknown';

export interface PoseObservation {
  landmarks: Landmark[];
  activity: PoseActivity;
  confidence: number;
}

export interface GestureEvent {
  gesture: Gesture;
  hand: Handedness | 'Both';
  confidence: number;
  at: number;
}

/** Backend analysis message (see backend/app/api/websocket.py). */
export interface TrackedPerson {
  track_id: number;
  bbox: [number, number, number, number];
  confidence: number;
  frames_tracked: number;
  age_s: number;
  trail: Array<[number, number]>;
  name: string | null;
  identity_confidence: number | null;
}

export interface FaceDetection {
  bbox: [number, number, number, number];
  confidence: number;
  landmarks: Array<[number, number]> | null;
  name: string | null;
  similarity: number | null;
  track_id: number | null;
}

export interface FrameAnalysis {
  type: 'analysis';
  frame_id: number;
  width: number;
  height: number;
  persons: TrackedPerson[];
  faces: FaceDetection[];
  timing: { total_ms: number; person_ms: number; face_ms: number };
}

export interface ServerHello {
  type: 'hello';
  session_id: string;
  models: { person_detection: boolean; face_detection: boolean; face_recognition: boolean };
}
