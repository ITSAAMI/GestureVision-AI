/**
 * Rule-based hand gesture recognition on MediaPipe's 21 hand landmarks.
 *
 * Measurements are made in 3D, aspect-corrected space and normalised by palm
 * size, so they are robust to hand rotation, distance from the camera and
 * left/right hands.
 */
import type { Gesture, Landmark } from '../vision/types';

interface V3 {
  x: number;
  y: number;
  z: number;
}

const FINGERS = {
  index: [5, 6, 7, 8],
  middle: [9, 10, 11, 12],
  ring: [13, 14, 15, 16],
  pinky: [17, 18, 19, 20],
} as const;

type FingerName = keyof typeof FINGERS;

const sub = (a: V3, b: V3): V3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v: V3) => Math.hypot(v.x, v.y, v.z);
const dist = (a: V3, b: V3) => len(sub(a, b));
const cos = (u: V3, v: V3) => (u.x * v.x + u.y * v.y + u.z * v.z) / (len(u) * len(v) || 1);

export interface HandFeatures {
  palmSize: number;
  /** Palm centre in normalised image coordinates. */
  palm: { x: number; y: number };
  extended: Record<FingerName | 'thumb', boolean>;
  curled: Record<FingerName, boolean>;
  /** Thumb–index tip distance / palm size. */
  pinch: number;
  /** Index–middle tip distance / palm size. */
  spread: number;
  /** Unit 2D direction of the thumb (image space, y down). */
  thumbDir: { x: number; y: number };
  /** Index fingertip distance from the wrist / palm size. */
  indexReach: number;
}

export function handFeatures(lm: Landmark[], aspect = 1): HandFeatures {
  const p: V3[] = lm.map((l) => ({ x: l.x * aspect, y: l.y, z: (l.z ?? 0) * aspect }));
  const wrist = p[0];
  const palmSize = Math.max(1e-6, dist(wrist, p[9]));

  const extended = {} as Record<FingerName | 'thumb', boolean>;
  const curled = {} as Record<FingerName, boolean>;
  for (const name of Object.keys(FINGERS) as FingerName[]) {
    const [mcp, pip, , tip] = FINGERS[name];
    const reach = dist(p[tip], wrist) / Math.max(1e-6, dist(p[pip], wrist));
    const straight = cos(sub(p[pip], p[mcp]), sub(p[tip], p[pip]));
    extended[name] = reach > 1.18 && straight > 0.45;
    curled[name] = reach < 1.05;
  }

  const thumbStraight = cos(sub(p[3], p[2]), sub(p[4], p[3]));
  extended.thumb =
    dist(p[4], p[5]) / palmSize > 0.5 && dist(p[4], wrist) > dist(p[3], wrist) && thumbStraight > 0.5;

  const td = { x: p[4].x - p[2].x, y: p[4].y - p[2].y };
  const tdLen = Math.hypot(td.x, td.y) || 1;

  const palmIdx = [0, 5, 9, 13, 17];
  const palm = {
    x: palmIdx.reduce((s, i) => s + lm[i].x, 0) / palmIdx.length,
    y: palmIdx.reduce((s, i) => s + lm[i].y, 0) / palmIdx.length,
  };

  return {
    palmSize,
    palm,
    extended,
    curled,
    pinch: dist(p[4], p[8]) / palmSize,
    spread: dist(p[8], p[12]) / palmSize,
    thumbDir: { x: td.x / tdLen, y: td.y / tdLen },
    indexReach: dist(p[8], wrist) / palmSize,
  };
}

export interface Classification {
  gesture: Gesture;
  confidence: number;
}

export function classifyHand(f: HandFeatures): Classification {
  const { extended: e, curled: c } = f;
  const nExtended = [e.index, e.middle, e.ring, e.pinky].filter(Boolean).length;
  const allCurled = c.index && c.middle && c.ring && c.pinky;

  // Pinch: thumb and index tips touching while the index reaches away from the palm
  // (distinguishes it from a fist, where the index tip is folded in).
  if (f.pinch < 0.3 && f.indexReach > 1.1 && !(e.middle && e.ring && e.pinky && f.pinch > 0.22)) {
    return { gesture: 'pinch', confidence: clamp(1 - f.pinch / 0.45, 0.6, 0.97) };
  }

  if (nExtended === 4) {
    return { gesture: 'open_palm', confidence: e.thumb ? 0.93 : 0.8 };
  }

  if (allCurled || nExtended === 0) {
    if (e.thumb && Math.abs(f.thumbDir.y) > 0.6) {
      return { gesture: f.thumbDir.y < 0 ? 'thumbs_up' : 'thumbs_down', confidence: 0.6 + 0.35 * Math.abs(f.thumbDir.y) };
    }
    if (allCurled && !e.thumb) return { gesture: 'closed_fist', confidence: 0.92 };
    if (allCurled) return { gesture: 'closed_fist', confidence: 0.7 };
  }

  if (e.index && e.middle && !e.ring && !e.pinky) {
    return f.spread > 0.38 ? { gesture: 'victory', confidence: 0.9 } : { gesture: 'two_finger', confidence: 0.82 };
  }

  if (e.index && !e.middle && !e.ring && !e.pinky) {
    return { gesture: 'one_finger', confidence: 0.88 };
  }

  return { gesture: 'unknown', confidence: 0 };
}

/** Two-hand gestures. Returns null when no two-hand gesture applies. */
export function classifyTwoHands(
  a: { gesture: Gesture; palm: { x: number; y: number }; palmSize: number },
  b: { gesture: Gesture; palm: { x: number; y: number }; palmSize: number },
  aspect = 1,
): Classification | null {
  if (a.gesture === 'open_palm' && b.gesture === 'open_palm' && a.palm.y < 0.45 && b.palm.y < 0.45) {
    return { gesture: 'both_hands_raised', confidence: 0.9 };
  }
  const d = Math.hypot((a.palm.x - b.palm.x) * aspect, a.palm.y - b.palm.y);
  if (d / ((a.palmSize + b.palmSize) / 2) < 1.5) {
    return { gesture: 'hands_together', confidence: 0.85 };
  }
  return null;
}

/** Detects a side-to-side wave of an open hand from palm x positions over time. */
export class WaveDetector {
  private samples: Array<{ t: number; x: number }> = [];
  private readonly windowMs: number;
  private readonly minAmplitude: number;
  private readonly minReversals: number;

  constructor(windowMs = 1500, minAmplitude = 0.035, minReversals = 3) {
    this.windowMs = windowMs;
    this.minAmplitude = minAmplitude;
    this.minReversals = minReversals;
  }

  push(x: number, handOpen: boolean, t: number): boolean {
    if (!handOpen) {
      this.samples = [];
      return false;
    }
    this.samples.push({ t, x });
    while (this.samples.length && t - this.samples[0].t > this.windowMs) this.samples.shift();
    if (this.samples.length < 4) return false;

    let dir = 0;
    let extreme = this.samples[0].x;
    let reversals = 0;
    for (const { x: sx } of this.samples.slice(1)) {
      if (dir === 0) {
        if (Math.abs(sx - extreme) > this.minAmplitude) {
          dir = Math.sign(sx - extreme);
          extreme = sx;
        }
      } else if (dir > 0) {
        if (sx > extreme) extreme = sx;
        else if (extreme - sx > this.minAmplitude) {
          reversals++;
          dir = -1;
          extreme = sx;
        }
      } else if (sx < extreme) {
        extreme = sx;
      } else if (sx - extreme > this.minAmplitude) {
        reversals++;
        dir = 1;
        extreme = sx;
      }
    }
    if (reversals >= this.minReversals) {
      this.samples = [];
      return true;
    }
    return false;
  }

  reset() {
    this.samples = [];
  }
}

/**
 * Majority-vote smoothing with edge-triggered events: an event fires when the
 * stable gesture changes, at most once per cooldown per gesture.
 */
export class GestureSmoother {
  windowSize: number;
  cooldownMs: number;
  private history: Gesture[] = [];
  private stable: Gesture = 'unknown';
  private lastFired = new Map<Gesture, number>();

  constructor(windowSize = 6, cooldownMs = 800) {
    this.windowSize = windowSize;
    this.cooldownMs = cooldownMs;
  }

  get current(): Gesture {
    return this.stable;
  }

  push(gesture: Gesture, now: number): { stable: Gesture; fired: Gesture | null } {
    this.history.push(gesture);
    if (this.history.length > this.windowSize) this.history.splice(0, this.history.length - this.windowSize);

    const counts = new Map<Gesture, number>();
    for (const g of this.history) counts.set(g, (counts.get(g) ?? 0) + 1);
    let mode: Gesture = 'unknown';
    let best = 0;
    for (const [g, n] of counts) {
      if (n > best) {
        best = n;
        mode = g;
      }
    }

    let fired: Gesture | null = null;
    if (best >= Math.ceil(this.windowSize * 0.6) && mode !== this.stable) {
      this.stable = mode;
      if (mode !== 'unknown' && now - (this.lastFired.get(mode) ?? -Infinity) >= this.cooldownMs) {
        fired = mode;
        this.lastFired.set(mode, now);
      }
    }
    return { stable: this.stable, fired };
  }

  reset() {
    this.history = [];
    this.stable = 'unknown';
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
