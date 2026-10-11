import { Activity, FlipHorizontal2, Hand, ListTree, PersonStanding, ScanFace, Trash2, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { CameraStage } from '../components/camera/CameraStage';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { gestureEmoji, gestureLabel, POSE_LABELS } from '../features/gestures/catalog';
import { trackColor } from '../features/vision/drawing';
import { useVisionDemand } from '../features/vision/engine';
import { cn, formatDuration } from '../lib/format';
import { useCamera } from '../store/cameraStore';
import { useSettings, type OverlayLayers } from '../store/settingsStore';
import { useVision, type HandGestureState, type LogEvent } from '../store/visionStore';

const LAYERS: Array<{ key: keyof OverlayLayers; label: string; color?: string }> = [
  { key: 'persons', label: 'People', color: 'bg-person' },
  { key: 'faces', label: 'Faces', color: 'bg-face' },
  { key: 'hands', label: 'Hands', color: 'bg-hand' },
  { key: 'pose', label: 'Pose', color: 'bg-pose' },
  { key: 'trails', label: 'Trails' },
  { key: 'labels', label: 'Labels' },
];

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs font-medium transition-colors',
        active ? 'border-line-strong bg-surface-3 text-fg' : 'border-line bg-transparent text-subtle hover:text-muted',
      )}
    >
      {children}
    </button>
  );
}

function Metric({ label, value, unit, tone }: { label: string; value: ReactNode; unit?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5">
      <div className="label">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={cn('num text-xl font-semibold', tone)}>{value}</span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </div>
    </div>
  );
}

function HandTile({ side, state }: { side: string; state: HandGestureState | null }) {
  const active = state && state.gesture !== 'unknown';
  return (
    <div className={cn('rounded-lg border px-3 py-3 transition-colors', active ? 'border-hand/30 bg-hand/[0.06]' : 'border-line bg-surface-2/60')}>
      <div className="label">{side} hand</div>
      <div className="mt-2 flex items-center gap-2.5">
        <span className={cn('text-2xl leading-none', !state && 'opacity-30 grayscale')}>{state ? gestureEmoji(state.gesture) : '🖐'}</span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{state ? (active ? gestureLabel(state.gesture) : 'Tracking…') : 'Not visible'}</div>
          {active && <div className="num text-xs text-muted">{Math.round(state.confidence * 100)}% confidence</div>}
        </div>
      </div>
    </div>
  );
}

const EVENT_STYLE: Record<LogEvent['kind'], string> = {
  gesture: 'bg-hand',
  person: 'bg-person',
  face: 'bg-face',
  system: 'bg-subtle',
};

export default function LiveDetection() {
  useVisionDemand({ hands: true, pose: true, backend: true });
  const cameraOn = useCamera((s) => s.status === 'on');
  const { layers, setLayer, mirror, update } = useSettings();
  const v = useVision();
  const persons = v.analysis?.persons ?? [];
  const faces = v.analysis?.faces ?? [];

  return (
    <div className="flex h-full animate-fade-in flex-col gap-4 p-4 xl:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5">
            {LAYERS.map((l) => (
              <Toggle key={l.key} active={layers[l.key]} onClick={() => setLayer(l.key, !layers[l.key])}>
                {l.color && <span className={cn('size-2 rounded-full', l.color, !layers[l.key] && 'opacity-40')} />}
                {l.label}
              </Toggle>
            ))}
          </div>
          <Toggle active={mirror} onClick={() => update({ mirror: !mirror })}>
            <FlipHorizontal2 className="size-3.5" /> Mirror
          </Toggle>
        </div>

        <div className="flex min-h-0 flex-1 items-start justify-center">
          <CameraStage className="max-h-full w-full" />
        </div>
      </div>

      <aside className="flex w-full shrink-0 flex-col gap-3 xl:w-[340px]">
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Pipeline" value={v.pipelineFps} unit="fps" />
          <Metric label="Detector" value={v.link === 'open' ? v.backendLatencyMs : '—'} unit={v.link === 'open' ? 'ms' : undefined} />
          <Metric label="People" value={persons.length} tone="text-person" />
          <Metric label="Faces" value={faces.length} tone="text-face" />
        </div>

        {cameraOn && v.link !== 'open' && (
          <div className="rounded-lg border border-warning/25 bg-warning/[0.06] px-3 py-2 text-xs text-warning">
            {v.link === 'connecting' ? 'Connecting to the detection backend…' : 'Detection backend unreachable — people & faces paused. Hands and pose still run locally.'}
          </div>
        )}

        <Card title="People in view" icon={Users} actions={<Badge>{persons.length}</Badge>} bodyClassName="p-2">
          {persons.length ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto">
              {persons.map((p) => (
                <li key={p.track_id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.03]">
                  <span className="num grid h-6 min-w-7 place-items-center rounded-md px-1 text-[11px] font-semibold text-black" style={{ background: trackColor(p.track_id) }}>
                    {p.track_id}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{p.name ?? <span className="text-muted">Unidentified</span>}</div>
                    <div className="num text-[11px] text-subtle">tracked {formatDuration(p.age_s)}</div>
                  </div>
                  <span className="num text-xs text-muted">{Math.round(p.confidence * 100)}%</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-2 py-3 text-center text-xs text-subtle">{cameraOn ? 'No one detected' : 'Start the camera to begin'}</p>
          )}
        </Card>

        <Card title="Gestures" icon={Hand} bodyClassName="space-y-2 p-3">
          <div className="grid grid-cols-2 gap-2">
            <HandTile side="Left" state={v.left} />
            <HandTile side="Right" state={v.right} />
          </div>
          {v.twoHand && (
            <div className="flex animate-slide-up items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-sm">
              <span className="text-lg">{gestureEmoji(v.twoHand)}</span> {gestureLabel(v.twoHand)}
            </div>
          )}
        </Card>

        <Card title="Body pose" icon={PersonStanding} bodyClassName="p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{v.pose ? POSE_LABELS[v.pose.activity] : <span className="text-muted">No body detected</span>}</span>
            {v.pose && v.pose.activity !== 'unknown' && <Badge tone="success">{Math.round(v.pose.confidence * 100)}%</Badge>}
          </div>
        </Card>

        <Card
          title="Activity"
          icon={ListTree}
          className="min-h-56 flex-1"
          bodyClassName="p-0"
          actions={v.events.length > 0 && <Button size="sm" variant="ghost" icon={Trash2} onClick={v.clearEvents} aria-label="Clear activity" />}
        >
          {v.events.length ? (
            <ul className="max-h-72 overflow-y-auto py-1 xl:max-h-none">
              {v.events.map((e) => (
                <li key={e.id} className="flex animate-fade-in items-center gap-2.5 px-4 py-1.5 text-xs">
                  <span className={cn('size-1.5 shrink-0 rounded-full', EVENT_STYLE[e.kind])} />
                  <span className="min-w-0 flex-1 truncate text-fg/90">{e.text}</span>
                  <span className="num shrink-0 text-subtle">{new Date(e.at).toLocaleTimeString([], { hour12: false })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-xs text-subtle">
              <Activity className="size-4" />
              Gestures, arrivals and recognitions will appear here.
            </div>
          )}
        </Card>

        {v.backendModels && !v.backendModels.face_recognition && (
          <div className="flex items-center gap-2 text-xs text-muted">
            <ScanFace className="size-3.5" /> Face recognition model not installed
          </div>
        )}
      </aside>
    </div>
  );
}
