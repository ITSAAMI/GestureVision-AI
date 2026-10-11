/** Typed client for the GestureVision FastAPI backend (proxied at /api in development). */

/**
 * Backend origin. Empty = same origin (Vite dev proxy, or the backend serving the
 * built app). Set VITE_API_URL (e.g. https://api.gvisionai.tech) for split deploys.
 */
export const API_BASE: string = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');
export const IS_REMOTE_BACKEND = API_BASE !== '';

export const apiUrl = (path: string) => `${API_BASE}${path}`;

export function wsUrl(path: string): string {
  if (API_BASE) return API_BASE.replace(/^http/, 'ws') + path;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${path}`;
}

export interface ModelInfo {
  name: string;
  task: string;
  license: string;
  available: boolean;
  loaded: boolean;
  size_mb: number | null;
}

export interface SystemStatus {
  status: string;
  name: string;
  version: string;
  uptime_s: number;
  onnxruntime: { version: string | null; providers: string[] };
  models: Record<'person_detection' | 'face_detection' | 'face_recognition', ModelInfo>;
  registered_face_samples: number;
}

export interface Diagnostics {
  platform: { os: string; machine: string; processor: string; python: string; cpu_count: number };
  resources: {
    cpu_percent: number | null;
    memory_total_gb: number | null;
    memory_used_percent: number | null;
    process_memory_mb: number | null;
    disk_free_gb: number;
    disk_total_gb: number;
  };
  storage: { database_mb: number; uploads_mb: number; face_samples: number; identities: number; sessions: number; videos: number };
}

export interface RuntimeSettings {
  detection_confidence: number;
  nms_iou_threshold: number;
  face_detection_confidence: number;
  face_recognition_threshold: number;
  max_detection_fps: number;
  enable_person_detection: boolean;
  enable_face_detection: boolean;
  enable_face_recognition: boolean;
  tracker_max_missed: number;
}

export interface FaceSample {
  id: number;
  name: string;
  created_at: string;
  thumbnail: string | null;
}

export interface Session {
  id: string;
  start_time: string;
  end_time: string | null;
  duration_s: number;
  frames_processed: number;
  detections_count: number;
  unique_persons: number;
  max_persons: number;
  identities: string[];
  gestures_count: number;
  gestures: Record<string, number>;
  avg_latency_ms: number;
  avg_fps: number;
}

export interface SessionStats {
  total_sessions: number;
  total_duration_s: number;
  total_frames: number;
  total_gestures: number;
  max_persons: number;
}

export interface VideoSummary {
  duration_s: number;
  source_fps: number;
  total_frames: number;
  frames_analyzed: number;
  sample_fps: number;
  width: number;
  height: number;
  max_persons: number;
  max_persons_at: number;
  avg_persons: number;
  unique_people: number;
  face_detections: number;
  processing_time_s: number;
  realtime_factor: number;
}

export interface VideoResults {
  summary: VideoSummary;
  timeline: Array<{ t: number; persons: number; faces: number }>;
  tracks: Array<{ track_id: number; first_seen: number; last_seen: number; duration_s: number; name: string | null }>;
  identities: Array<{ name: string; first_seen: number; last_seen: number; detections: number }>;
  has_peak_frame: boolean;
}

export type VideoStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface VideoAnalysis {
  id: string;
  filename: string;
  status: VideoStatus;
  progress: number;
  file_size: number;
  sample_fps: number;
  total_frames: number;
  processed_frames: number;
  created_at: string;
  completed_at: string | null;
  error: string | null;
  summary: VideoSummary | null;
  results?: VideoResults | null;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      headers: init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json', ...init?.headers } : init?.headers,
    });
  } catch {
    throw new ApiError(
      0,
      IS_REMOTE_BACKEND
        ? 'Detection server is starting up (free hosting sleeps when idle). Try again in a minute.'
        : 'Backend is unreachable. Is the server running on port 8000?',
    );
  }
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body.detail === 'string') message = body.detail;
      else if (Array.isArray(body.detail)) message = body.detail.map((d: { msg: string }) => d.msg).join('; ');
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string; version: string }>('/api/health'),
  status: () => request<SystemStatus>('/api/system/status'),
  diagnostics: () => request<Diagnostics>('/api/system/diagnostics'),

  getSettings: () => request<{ settings: RuntimeSettings; defaults: RuntimeSettings }>('/api/settings'),
  updateSettings: (patch: Partial<RuntimeSettings>) =>
    request<{ settings: RuntimeSettings; defaults: RuntimeSettings }>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  resetSettings: () => request<{ settings: RuntimeSettings; defaults: RuntimeSettings }>('/api/settings/reset', { method: 'POST' }),

  faces: () => request<{ faces: FaceSample[] }>('/api/faces'),
  registerFace: (name: string, imageBase64: string) =>
    request<{ face: FaceSample; detection_confidence: number; message: string }>('/api/faces/register', {
      method: 'POST',
      body: JSON.stringify({ name, image_base64: imageBase64 }),
    }),
  deleteFace: (id: number) => request<{ deleted: number }>(`/api/faces/${id}`, { method: 'DELETE' }),
  deleteIdentity: (name: string) => request<{ deleted: number }>(`/api/faces/identity/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  deleteAllFaces: () => request<{ deleted: number }>('/api/faces', { method: 'DELETE' }),

  sessions: () => request<{ sessions: Session[]; stats: SessionStats }>('/api/sessions'),
  deleteSession: (id: string) => request<{ deleted: number }>(`/api/sessions/${id}`, { method: 'DELETE' }),
  deleteAllSessions: () => request<{ deleted: number }>('/api/sessions', { method: 'DELETE' }),

  videos: () => request<{ videos: VideoAnalysis[] }>('/api/video'),
  video: (id: string) => request<VideoAnalysis>(`/api/video/${id}`),
  deleteVideo: (id: string) => request<{ deleted: number }>(`/api/video/${id}`, { method: 'DELETE' }),

  /** Upload with progress reporting (fetch has no upload progress events). */
  uploadVideo(file: File, sampleFps: number, onProgress: (fraction: number) => void): Promise<VideoAnalysis> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.append('file', file);
      form.append('sample_fps', String(sampleFps));
      xhr.open('POST', apiUrl('/api/video/upload'));
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => {
        let body: { detail?: string } & Partial<VideoAnalysis> = {};
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body as VideoAnalysis);
        else reject(new ApiError(xhr.status, typeof body.detail === 'string' ? body.detail : `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new ApiError(0, 'Upload failed: backend unreachable'));
      xhr.send(form);
    });
  },
};
