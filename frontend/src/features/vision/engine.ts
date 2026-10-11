/**
 * The vision engine: a single app-wide loop that runs MediaPipe hands/pose on
 * the shared camera stream, classifies gestures, and streams frames to the
 * backend for person/face detection.
 *
 * Pages declare what they need with `useVisionDemand`, so work only happens
 * for features that are on screen. Per-frame results live on the engine
 * (read them in rAF loops); summarized state is pushed to `useVision`.
 */
import type { HandLandmarker, HandLandmarkerResult, PoseLandmarker } from '@mediapipe/tasks-vision';
import { useEffect } from 'react';
import { useCamera } from '../../store/cameraStore';
import { useSettings } from '../../store/settingsStore';
import { useVision, type HandGestureState } from '../../store/visionStore';
import { gestureLabel } from '../gestures/catalog';
import { classifyHand, classifyTwoHands, GestureSmoother, handFeatures, WaveDetector } from '../gestures/classifier';
import { classifyPose } from '../pose/classifier';
import { DetectionSocket, FrameEncoder } from './detectionSocket';
import { createHandLandmarker, createPoseLandmarker } from './mediapipe';
import type { FrameAnalysis, GestureEvent, Handedness, HandObservation, PoseObservation } from './types';

export interface Demand {
  hands?: boolean;
  pose?: boolean;
  backend?: boolean;
}

type GestureListener = (event: GestureEvent) => void;

const PERSON_LEAVE_MS = 1500;
const DISCONNECT_GRACE_MS = 2000;

class VisionEngine {
  hands: HandObservation[] = [];
  pose: PoseObservation | null = null;
  analysis: FrameAnalysis | null = null;
  analysisReceivedAt = 0;

  private video: HTMLVideoElement | null = null;
  private raf = 0;
  private demands = new Map<symbol, Demand>();
  private listeners = new Set<GestureListener>();

  private handLm: HandLandmarker | null = null;
  private poseLm: PoseLandmarker | null = null;
  private handLoading: Promise<void> | null = null;
  private poseLoading: Promise<void> | null = null;

  private socket = new DetectionSocket();
  private encoder = new FrameEncoder();
  private lastSentAt = 0;
  private disconnectTimer: number | undefined;

  private lastVideoTime = -1;
  private frameNo = 0;
  private fpsFrames = 0;
  private fpsStart = 0;
  private backendFrames = 0;
  private lastTimestamp = 0;

  private smoothers: Record<Handedness, GestureSmoother> = { Left: new GestureSmoother(), Right: new GestureSmoother() };
  private waves: Record<Handedness, WaveDetector> = { Left: new WaveDetector(), Right: new WaveDetector() };
  private waveUntil: Record<Handedness, number> = { Left: 0, Right: 0 };
  private twoSmoother = new GestureSmoother(6, 1200);

  private personsSeen = new Map<number, { lastSeen: number; name: string | null }>();

  constructor() {
    this.socket.onState = (link) => useVision.getState().set({ link });
    this.socket.onHello = (hello) => {
      useVision.getState().set({ sessionId: hello.session_id, backendModels: hello.models });
      useVision.getState().log('system', 'Connected to detection backend');
    };
    this.socket.onAnalysis = (analysis, rtt) => this.handleAnalysis(analysis, rtt);

    useCamera.subscribe((state, prev) => {
      if (state.stream !== prev.stream) this.bindStream(state.stream);
      this.reconcile();
    });
    useSettings.subscribe((s, prev) => {
      for (const sm of Object.values(this.smoothers)) {
        sm.windowSize = s.gestureWindow;
        sm.cooldownMs = s.gestureCooldownMs;
      }
      if (s.handConfidence !== prev.handConfidence) {
        void this.handLm?.setOptions({ minHandDetectionConfidence: s.handConfidence });
      }
      this.reconcile();
    });
    const s = useSettings.getState();
    for (const sm of Object.values(this.smoothers)) {
      sm.windowSize = s.gestureWindow;
      sm.cooldownMs = s.gestureCooldownMs;
    }
  }

  // ---- wiring -------------------------------------------------------------------

  attachVideo = (el: HTMLVideoElement | null) => {
    this.video = el;
    if (el) this.bindStream(useCamera.getState().stream);
    this.reconcile();
  };

  /** Register what a component needs; returns a release function. */
  acquire(demand: Demand): () => void {
    const token = Symbol('demand');
    this.demands.set(token, demand);
    this.reconcile();
    return () => {
      this.demands.delete(token);
      this.reconcile();
    };
  }

  onGesture(listener: GestureListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** JPEG data URL of the current (unmirrored) camera frame. */
  snapshot(maxWidth = 1280, quality = 0.92): string | null {
    const v = this.video;
    if (!v || !v.videoWidth) return null;
    const w = Math.min(maxWidth, v.videoWidth);
    const h = Math.round((v.videoHeight * w) / v.videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(v, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', quality);
  }

  get needs(): Required<Demand> {
    const s = useSettings.getState();
    const need = { hands: false, pose: false, backend: false };
    for (const d of this.demands.values()) {
      need.hands ||= !!d.hands;
      need.pose ||= !!d.pose;
      need.backend ||= !!d.backend;
    }
    return { hands: need.hands && s.enableHands, pose: need.pose && s.enablePose, backend: need.backend && s.streamToBackend };
  }

  private bindStream(stream: MediaStream | null) {
    const v = this.video;
    if (!v) return;
    if (v.srcObject !== stream) {
      v.srcObject = stream;
      if (stream) void v.play().catch(() => {});
    }
  }

  private reconcile() {
    const cameraOn = useCamera.getState().status === 'on';
    const needs = this.needs;
    const active = cameraOn && !!this.video && (needs.hands || needs.pose || needs.backend);

    if (active && !this.raf) {
      this.fpsStart = performance.now();
      this.raf = requestAnimationFrame(this.tick);
    } else if (!active && this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      useVision.getState().set({ pipelineFps: 0 });
    }

    if (cameraOn && needs.hands) void this.ensureHands();
    if (cameraOn && needs.pose) void this.ensurePose();

    window.clearTimeout(this.disconnectTimer);
    if (cameraOn && needs.backend) {
      this.socket.connect();
    } else if (this.socket.isOpen || useVision.getState().link !== 'idle') {
      // Grace period: navigating between pages that both need the backend
      // shouldn't drop the connection (and split the recorded session).
      const delay = cameraOn ? DISCONNECT_GRACE_MS : 0;
      this.disconnectTimer = window.setTimeout(() => {
        this.socket.disconnect();
        this.clearAnalysis();
      }, delay);
    }

    if (!cameraOn || !needs.hands) this.clearHands();
    if (!cameraOn || !needs.pose) this.clearPose();
    if (!cameraOn) this.clearAnalysis();
  }

  private ensureHands(): Promise<void> {
    if (this.handLm) return Promise.resolve();
    this.handLoading ??= (async () => {
      useVision.getState().set({ handsModel: 'loading' });
      try {
        this.handLm = await createHandLandmarker(useSettings.getState().handConfidence);
        useVision.getState().set({ handsModel: 'ready' });
      } catch (err) {
        console.error('[vision] hand model failed', err);
        useVision.getState().set({ handsModel: 'error', modelError: 'Hand tracking model failed to load' });
        this.handLoading = null;
      }
    })();
    return this.handLoading;
  }

  private ensurePose(): Promise<void> {
    if (this.poseLm) return Promise.resolve();
    this.poseLoading ??= (async () => {
      useVision.getState().set({ poseModel: 'loading' });
      try {
        this.poseLm = await createPoseLandmarker();
        useVision.getState().set({ poseModel: 'ready' });
      } catch (err) {
        console.error('[vision] pose model failed', err);
        useVision.getState().set({ poseModel: 'error', modelError: 'Pose model failed to load' });
        this.poseLoading = null;
      }
    })();
    return this.poseLoading;
  }

  // ---- main loop ----------------------------------------------------------------

  private tick = () => {
    this.raf = requestAnimationFrame(this.tick);
    const v = this.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return;

    const now = performance.now();
    const needs = this.needs;

    if (v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      this.frameNo++;
      // MediaPipe requires strictly increasing timestamps.
      const ts = Math.max(now, this.lastTimestamp + 1);
      this.lastTimestamp = ts;
      const aspect = v.videoWidth / v.videoHeight;

      if (needs.hands && this.handLm) {
        try {
          this.processHands(this.handLm.detectForVideo(v, ts), aspect, now);
        } catch (err) {
          console.error('[vision] hand inference failed', err);
        }
      }
      // Pose runs on alternate frames to leave headroom for the rest of the app.
      if (needs.pose && this.poseLm && this.frameNo % 2 === 0) {
        try {
          const res = this.poseLm.detectForVideo(v, ts);
          this.processPose(res.landmarks[0] ?? null, aspect);
        } catch (err) {
          console.error('[vision] pose inference failed', err);
        }
      }
      this.fpsFrames++;
    }

    if (now - this.fpsStart >= 1000) {
      const secs = (now - this.fpsStart) / 1000;
      useVision.getState().set({
        pipelineFps: Math.round(this.fpsFrames / secs),
        backendFps: Math.round((this.backendFrames / secs) * 10) / 10,
      });
      this.fpsFrames = 0;
      this.backendFrames = 0;
      this.fpsStart = now;
      this.expirePersons(now);
    }

    if (needs.backend) this.maybeSendFrame(v, now);
  };

  private maybeSendFrame(v: HTMLVideoElement, now: number) {
    const s = useSettings.getState();
    if (!this.socket.isOpen || this.socket.busy || now - this.lastSentAt < 1000 / s.streamFps) return;
    this.lastSentAt = now;
    void this.encoder.encode(v, s.streamWidth, s.streamQuality).then((blob) => {
      if (blob) this.socket.sendFrame(blob);
    });
  }

  // ---- hands --------------------------------------------------------------------

  private processHands(res: HandLandmarkerResult, aspect: number, now: number) {
    const hands: HandObservation[] = [];
    const seen = new Set<Handedness>();

    res.landmarks.forEach((lm, i) => {
      const cat = res.handedness[i]?.[0];
      // MediaPipe assumes a mirrored (selfie) image; our frames are raw, so swap.
      let hand: Handedness = cat?.categoryName === 'Left' ? 'Right' : 'Left';
      if (seen.has(hand)) hand = hand === 'Left' ? 'Right' : 'Left';
      seen.add(hand);

      const f = handFeatures(lm, aspect);
      const cls = classifyHand(f);
      const { stable, fired } = this.smoothers[hand].push(cls.gesture, now);

      if (this.waves[hand].push(f.palm.x, stable === 'open_palm' || cls.gesture === 'open_palm', now)) {
        this.waveUntil[hand] = now + 900;
        this.emit({ gesture: 'waving', hand, confidence: 0.85, at: now });
      } else if (fired) {
        this.emit({ gesture: fired, hand, confidence: cls.confidence, at: now });
      }

      hands.push({
        handedness: hand,
        score: cat?.score ?? 0,
        landmarks: lm,
        gesture: cls.gesture,
        stableGesture: now < this.waveUntil[hand] ? 'waving' : stable,
        confidence: cls.confidence,
        palm: f.palm,
        palmSize: f.palmSize,
        pinch: f.pinch,
      });
    });

    for (const h of ['Left', 'Right'] as Handedness[]) {
      if (!seen.has(h)) {
        this.smoothers[h].reset();
        this.waves[h].reset();
      }
    }

    let twoHand: HandObservation['stableGesture'] | null = null;
    if (hands.length === 2) {
      const two = classifyTwoHands(
        { gesture: hands[0].stableGesture, palm: hands[0].palm, palmSize: hands[0].palmSize },
        { gesture: hands[1].stableGesture, palm: hands[1].palm, palmSize: hands[1].palmSize },
        aspect,
      );
      const { stable, fired } = this.twoSmoother.push(two?.gesture ?? 'unknown', now);
      if (fired) this.emit({ gesture: fired, hand: 'Both', confidence: two?.confidence ?? 0.8, at: now });
      twoHand = stable === 'unknown' ? null : stable;
    } else {
      this.twoSmoother.reset();
    }

    this.hands = hands;
    this.publishHands(twoHand);
  }

  private publishHands(twoHand: HandObservation['stableGesture'] | null) {
    const summarize = (h?: HandObservation): HandGestureState | null =>
      h ? { gesture: h.stableGesture, confidence: Math.round(h.confidence * 20) / 20 } : null;
    const left = summarize(this.hands.find((h) => h.handedness === 'Left'));
    const right = summarize(this.hands.find((h) => h.handedness === 'Right'));
    const st = useVision.getState();
    const same = (a: HandGestureState | null, b: HandGestureState | null) =>
      a === b || (!!a && !!b && a.gesture === b.gesture && a.confidence === b.confidence);
    if (!same(st.left, left) || !same(st.right, right) || st.twoHand !== twoHand || st.handsVisible !== this.hands.length) {
      st.set({ left, right, twoHand, handsVisible: this.hands.length });
    }
  }

  private emit(event: GestureEvent) {
    const st = useVision.getState();
    st.set({
      lastGesture: { gesture: event.gesture, at: Date.now() },
      gestureCounts: { ...st.gestureCounts, [event.gesture]: (st.gestureCounts[event.gesture] ?? 0) + 1 },
    });
    st.log('gesture', `${gestureLabel(event.gesture)}${event.hand === 'Both' ? ' (both hands)' : ` · ${event.hand.toLowerCase()} hand`}`);
    this.socket.sendGesture(event.gesture);
    for (const listener of this.listeners) listener(event);
  }

  private clearHands() {
    if (!this.hands.length && !useVision.getState().handsVisible) return;
    this.hands = [];
    for (const h of ['Left', 'Right'] as Handedness[]) {
      this.smoothers[h].reset();
      this.waves[h].reset();
    }
    useVision.getState().set({ left: null, right: null, twoHand: null, handsVisible: 0 });
  }

  // ---- pose ---------------------------------------------------------------------

  private processPose(landmarks: PoseObservation['landmarks'] | null, aspect: number) {
    if (!landmarks) {
      this.clearPose();
      return;
    }
    const { activity, confidence } = classifyPose(landmarks, aspect);
    this.pose = { landmarks, activity, confidence };
    const prev = useVision.getState().pose;
    if (prev?.activity !== activity) useVision.getState().set({ pose: { activity, confidence } });
  }

  private clearPose() {
    this.pose = null;
    if (useVision.getState().pose) useVision.getState().set({ pose: null });
  }

  // ---- backend ------------------------------------------------------------------

  private handleAnalysis(analysis: FrameAnalysis, rtt: number) {
    const now = performance.now();
    this.analysis = analysis;
    this.analysisReceivedAt = now;
    this.backendFrames++;
    const st = useVision.getState();

    for (const p of analysis.persons) {
      const known = this.personsSeen.get(p.track_id);
      if (!known) {
        st.log('person', `Person #${p.track_id} entered`);
        this.personsSeen.set(p.track_id, { lastSeen: now, name: p.name });
      } else {
        known.lastSeen = now;
        if (p.name && known.name !== p.name) {
          known.name = p.name;
          st.log('face', `Recognized ${p.name} (#${p.track_id})`);
        }
      }
    }
    st.set({ analysis, backendLatencyMs: Math.round(rtt), inferenceMs: analysis.timing.total_ms });
  }

  private expirePersons(now: number) {
    for (const [id, info] of this.personsSeen) {
      if (now - info.lastSeen > PERSON_LEAVE_MS) {
        this.personsSeen.delete(id);
        useVision.getState().log('person', `${info.name ?? `Person #${id}`} left`);
      }
    }
  }

  private clearAnalysis() {
    this.analysis = null;
    this.personsSeen.clear();
    if (useVision.getState().analysis) useVision.getState().set({ analysis: null, backendLatencyMs: 0, inferenceMs: 0, backendFps: 0 });
  }
}

export const visionEngine = new VisionEngine();

/** Declare which vision features the calling component needs while mounted. */
export function useVisionDemand(demand: Demand) {
  const { hands, pose, backend } = demand;
  useEffect(() => visionEngine.acquire({ hands, pose, backend }), [hands, pose, backend]);
}

/** Subscribe to confirmed gesture events while mounted. */
export function useGestureEvents(listener: GestureListener) {
  useEffect(() => visionEngine.onGesture(listener), [listener]);
}
