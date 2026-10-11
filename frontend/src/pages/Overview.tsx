import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Boxes, Clock, Cpu, Film, Hand, History, PersonStanding, ScanEye, ScanFace, Sparkles, UserRound, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useBackendHealth, useSystemStatus } from '../app/useBackend';
import { Badge, type Tone } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { Callout, EmptyState, Skeleton, Stat } from '../components/ui/Feedback';
import { api } from '../lib/api';
import { formatDuration, formatRelative } from '../lib/format';
import { useVision, type ModelState } from '../store/visionStore';

function ModelRow({ icon: Icon, name, task, runtime, state, detail }: {
  icon: typeof Cpu;
  name: string;
  task: string;
  runtime: string;
  state: { tone: Tone; label: string };
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-muted">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{task}</span>
        </div>
        <div className="truncate text-xs text-muted">
          {name} · {runtime}
          {detail ? ` · ${detail}` : ''}
        </div>
      </div>
      <Badge tone={state.tone} dot>{state.label}</Badge>
    </div>
  );
}

function browserState(s: ModelState): { tone: Tone; label: string } {
  return {
    idle: { tone: 'neutral' as Tone, label: 'On demand' },
    loading: { tone: 'warning' as Tone, label: 'Loading' },
    ready: { tone: 'success' as Tone, label: 'Ready' },
    error: { tone: 'danger' as Tone, label: 'Failed' },
  }[s];
}

function QuickAction({ to, icon: Icon, title, text, accent }: { to: string; icon: typeof Cpu; title: string; text: string; accent?: boolean }) {
  return (
    <Link
      to={to}
      className={`group panel flex items-start gap-3 p-4 transition-colors hover:border-line-strong hover:bg-surface-2 ${accent ? 'border-accent/30 bg-accent-soft/40' : ''}`}
    >
      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${accent ? 'bg-accent text-white' : 'bg-white/[0.06] text-fg'}`}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-medium">
          {title}
          <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
        </span>
        <span className="mt-0.5 block text-xs text-muted">{text}</span>
      </span>
    </Link>
  );
}

export default function Overview() {
  const health = useBackendHealth();
  const status = useSystemStatus();
  const sessions = useQuery({ queryKey: ['sessions'], queryFn: api.sessions, enabled: health.isSuccess });
  const videos = useQuery({ queryKey: ['videos'], queryFn: api.videos, enabled: health.isSuccess });
  const diag = useQuery({ queryKey: ['diagnostics'], queryFn: api.diagnostics, enabled: health.isSuccess });
  const handsModel = useVision((s) => s.handsModel);
  const poseModel = useVision((s) => s.poseModel);

  const backendModel = (key: 'person_detection' | 'face_detection' | 'face_recognition'): { tone: Tone; label: string } => {
    if (health.isError) return { tone: 'danger', label: 'Offline' };
    const m = status.data?.models[key];
    if (!m) return { tone: 'neutral', label: '…' };
    if (m.loaded) return { tone: 'success', label: 'Ready' };
    return m.available ? { tone: 'warning', label: 'Not loaded' } : { tone: 'danger', label: 'Missing' };
  };
  const missing = status.data ? Object.values(status.data.models).filter((m) => !m.available) : [];

  return (
    <div className="mx-auto max-w-[1400px] animate-fade-in px-6 py-6">
      <section className="relative mb-6 overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-surface-2 via-surface to-surface p-6 md:p-8">
        <div className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 size-72 rounded-full bg-info/10 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <Badge tone="accent" className="mb-4">Open-weight AI · runs 100% locally</Badge>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              See people, faces and gestures —{' '}
              <span className="bg-gradient-to-r from-accent to-info bg-clip-text text-transparent">in real time.</span>
            </h1>
            <p className="mt-3 text-sm text-muted md:text-base">
              GestureVision combines YOLO11, SCRFD, ArcFace and MediaPipe into one workstation for live detection, identity
              recognition, video analytics and gesture-controlled 3D.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/live" className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-5 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgb(139_123_255/0.8)] hover:bg-accent-strong">
              <ScanEye className="size-4" /> Start live detection
            </Link>
            <Link to="/particles" className="inline-flex h-11 items-center gap-2 rounded-lg border border-line-strong bg-surface-3 px-5 text-sm font-medium hover:bg-white/[0.08]">
              <Sparkles className="size-4" /> Particle Studio
            </Link>
          </div>
        </div>
      </section>

      {health.isError && (
        <div className="mb-6">
          <Callout tone="danger" title="Backend is offline">
            Start it with <code className="num rounded bg-white/10 px-1.5 py-0.5 text-xs text-fg">cd backend && python main.py</code>. Hand
            tracking, pose and the Particle Studio still work without it.
          </Callout>
        </div>
      )}
      {missing.length > 0 && (
        <div className="mb-6">
          <Callout tone="warning" title={`${missing.length} AI model${missing.length > 1 ? 's are' : ' is'} not installed`}>
            Run <code className="num rounded bg-white/10 px-1.5 py-0.5 text-xs text-fg">python scripts/download_models.py</code> and restart the backend.
          </Callout>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Identities" icon={UserRound} value={diag.data?.storage.identities ?? '—'} hint={`${diag.data?.storage.face_samples ?? 0} face samples`} />
        <Stat label="Sessions" icon={History} tone="info" value={sessions.data?.stats.total_sessions ?? '—'} hint={`${sessions.data?.stats.total_gestures ?? 0} gestures recognized`} />
        <Stat label="Live time" icon={Clock} tone="success" value={sessions.data ? formatDuration(sessions.data.stats.total_duration_s) : '—'} hint={`${(sessions.data?.stats.total_frames ?? 0).toLocaleString()} frames analyzed`} />
        <Stat label="Videos" icon={Film} tone="warning" value={diag.data?.storage.videos ?? '—'} hint={`Peak ${sessions.data?.stats.max_persons ?? 0} people in one frame`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card title="AI models" description="Five open-weight models across browser and backend" icon={Boxes} className="lg:col-span-3" bodyClassName="py-1">
          <div className="divide-y divide-line">
            <ModelRow icon={Users} task="Person detection & tracking" name={status.data?.models.person_detection.name ?? 'yolo11n.onnx'} runtime="ONNX Runtime" detail="AGPL-3.0" state={backendModel('person_detection')} />
            <ModelRow icon={ScanFace} task="Face detection" name={status.data?.models.face_detection.name ?? 'det_500m.onnx'} runtime="ONNX Runtime" detail="SCRFD-500M" state={backendModel('face_detection')} />
            <ModelRow icon={UserRound} task="Face recognition" name={status.data?.models.face_recognition.name ?? 'w600k_mbf.onnx'} runtime="ONNX Runtime" detail="ArcFace 512-d" state={backendModel('face_recognition')} />
            <ModelRow icon={Hand} task="Hand landmarks (21 pts × 2 hands)" name="hand_landmarker.task" runtime="MediaPipe · WebAssembly/WebGL" state={browserState(handsModel)} />
            <ModelRow icon={PersonStanding} task="Body pose (33 pts)" name="pose_landmarker_lite.task" runtime="MediaPipe · WebAssembly/WebGL" state={browserState(poseModel)} />
          </div>
        </Card>

        <div className="grid gap-3 lg:col-span-2">
          <QuickAction to="/live" icon={ScanEye} title="Live Detection" text="Track people, recognize faces, read gestures and pose." accent />
          <QuickAction to="/faces" icon={ScanFace} title="Enroll a face" text="Capture a few samples to recognize someone by name." />
          <QuickAction to="/video" icon={Film} title="Analyze a video" text="Upload footage for people counts, timeline and identities." />
          <QuickAction to="/gestures" icon={Hand} title="Gesture Lab" text="Try all 11 gestures and tune recognition." />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Recent sessions" icon={History} actions={<Link to="/sessions" className="text-xs text-muted hover:text-fg">View all</Link>} bodyClassName="p-0">
          {sessions.isPending && health.isSuccess ? (
            <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : sessions.data?.sessions.length ? (
            <ul className="divide-y divide-line">
              {sessions.data.sessions.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="text-muted">{formatRelative(s.start_time)}</span>
                  <span className="flex items-center gap-4 text-xs text-muted">
                    <span className="num">{formatDuration(s.duration_s)}</span>
                    <span className="num">{s.unique_persons} people</span>
                    <span className="num">{s.gestures_count} gestures</span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={History} title="No sessions yet" description="Sessions are recorded automatically while live detection runs." className="py-8" />
          )}
        </Card>
        <Card title="Recent videos" icon={Film} actions={<Link to="/video" className="text-xs text-muted hover:text-fg">View all</Link>} bodyClassName="p-0">
          {videos.data?.videos.length ? (
            <ul className="divide-y divide-line">
              {videos.data.videos.slice(0, 5).map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="truncate">{v.filename}</span>
                  <VideoStatusBadge status={v.status}>{v.summary ? `${v.summary.unique_people} people` : undefined}</VideoStatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={Film} title="No videos analyzed" description="Upload a clip to get people counts and a timeline." className="py-8" />
          )}
        </Card>
      </div>
    </div>
  );
}

export function VideoStatusBadge({ status, children }: { status: string; children?: ReactNode }) {
  const tone: Tone = status === 'completed' ? 'success' : status === 'failed' ? 'danger' : status === 'processing' ? 'accent' : 'neutral';
  return (
    <Badge tone={tone} dot pulse={status === 'processing'}>
      {children ?? status}
    </Badge>
  );
}
