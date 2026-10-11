import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

/** Served from node_modules by the Vite plugin in vite.config.ts (and copied into dist). */
const WASM_BASE = '/mediapipe/wasm';

const MODELS = {
  hand: {
    local: '/models/hand_landmarker.task',
    remote: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  },
  pose: {
    local: '/models/pose_landmarker_lite.task',
    remote: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  },
};

let fileset: Promise<WasmFileset> | null = null;

function getFileset(): Promise<WasmFileset> {
  fileset ??= FilesetResolver.forVisionTasks(WASM_BASE).catch((err) => {
    fileset = null;
    throw err;
  });
  return fileset;
}

/** Prefer locally downloaded models (offline, private); fall back to Google's CDN. */
async function resolveModel(model: { local: string; remote: string }): Promise<string> {
  try {
    const res = await fetch(model.local, { method: 'HEAD' });
    const type = res.headers.get('content-type') ?? '';
    if (res.ok && !type.includes('text/html')) return model.local;
  } catch {
    /* fall through */
  }
  return model.remote;
}

async function withDelegate<T>(create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  try {
    return await create('GPU');
  } catch (err) {
    console.warn('[vision] GPU delegate unavailable, using CPU', err);
    return create('CPU');
  }
}

export async function createHandLandmarker(minConfidence: number): Promise<HandLandmarker> {
  const [vision, model] = await Promise.all([getFileset(), resolveModel(MODELS.hand)]);
  return withDelegate((delegate) =>
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: model, delegate },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: minConfidence,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
  );
}

export async function createPoseLandmarker(): Promise<PoseLandmarker> {
  const [vision, model] = await Promise.all([getFileset(), resolveModel(MODELS.pose)]);
  return withDelegate((delegate) =>
    PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: model, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }),
  );
}

export const HAND_CONNECTIONS: Array<[number, number]> = HandLandmarker.HAND_CONNECTIONS.map((c) => [c.start, c.end]);
export const POSE_CONNECTIONS: Array<[number, number]> = PoseLandmarker.POSE_CONNECTIONS.map((c) => [c.start, c.end]);
