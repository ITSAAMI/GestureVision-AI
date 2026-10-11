import { BookOpen, Hand, SlidersHorizontal } from 'lucide-react';
import { CameraStage } from '../components/camera/CameraStage';
import { Badge } from '../components/ui/Badge';
import { Card, PageHeader } from '../components/ui/Card';
import { Slider } from '../components/ui/Controls';
import { GESTURES, gestureEmoji, gestureLabel } from '../features/gestures/catalog';
import { useVisionDemand } from '../features/vision/engine';
import type { Gesture } from '../features/vision/types';
import { cn } from '../lib/format';
import { useSettings } from '../store/settingsStore';
import { useVision, type HandGestureState } from '../store/visionStore';

const HANDS_ONLY = { persons: false, faces: false, pose: false, trails: false };

function Readout({ side, state }: { side: string; state: HandGestureState | null }) {
  const g: Gesture = state?.gesture ?? 'unknown';
  const active = g !== 'unknown';
  const conf = state?.confidence ?? 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn('panel flex items-center gap-4 p-4 transition-colors', active && 'border-hand/30')}>
      <div className="relative grid size-16 shrink-0 place-items-center">
        <svg viewBox="0 0 64 64" className="absolute inset-0 -rotate-90">
          <circle cx="32" cy="32" r={r} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth="4" />
          <circle
            cx="32"
            cy="32"
            r={r}
            fill="none"
            stroke="var(--color-hand)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - (active ? conf : 0))}
            className="transition-[stroke-dashoffset] duration-300"
          />
        </svg>
        <span className={cn('text-2xl', !state && 'opacity-30 grayscale')}>{state ? gestureEmoji(g) : '🖐'}</span>
      </div>
      <div className="min-w-0">
        <div className="label">{side} hand</div>
        <div className="mt-1 truncate text-lg font-semibold">{state ? (active ? gestureLabel(g) : 'No gesture') : 'Not visible'}</div>
        <div className="num text-xs text-muted">{active ? `${Math.round(conf * 100)}% confidence` : state ? 'Hold a gesture steady' : 'Raise a hand into view'}</div>
      </div>
    </div>
  );
}

export default function GestureLab() {
  useVisionDemand({ hands: true });
  const { left, right, twoHand, gestureCounts, events } = useVision();
  const settings = useSettings();
  const activeSet = new Set<Gesture>([left?.gesture, right?.gesture, twoHand].filter(Boolean) as Gesture[]);
  const recent = events.filter((e) => e.kind === 'gesture').slice(0, 8);

  return (
    <div className="mx-auto max-w-[1400px] animate-fade-in px-6 py-6">
      <PageHeader
        title="Gesture Lab"
        description="11 gestures recognized from 21 hand landmarks per hand — scale and rotation invariant, with temporal smoothing. Two-hand and motion gestures included."
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <CameraStage layers={HANDS_ONLY} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Readout side="Left" state={left} />
            <Readout side="Right" state={right} />
          </div>
        </div>

        <div className="space-y-4">
          <Card title="Gesture library" icon={BookOpen} description="Lights up when detected · counts this session" bodyClassName="p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2 2xl:grid-cols-3">
              {GESTURES.map((g) => {
                const active = activeSet.has(g.id);
                return (
                  <div
                    key={g.id}
                    title={`${g.description} — ${g.action}`}
                    className={cn(
                      'relative rounded-lg border p-3 transition-all duration-200',
                      active ? 'scale-[1.02] border-hand/50 bg-hand/10 shadow-[0_0_24px_-6px_rgb(244_114_182/0.6)]' : 'border-line bg-surface-2/50',
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <span className="text-2xl leading-none">{g.emoji}</span>
                      {(gestureCounts[g.id] ?? 0) > 0 && <span className="num text-[10px] text-muted">×{gestureCounts[g.id]}</span>}
                    </div>
                    <div className="mt-2 text-sm font-medium">{g.label}</div>
                    <div className="mt-0.5 line-clamp-2 text-[11px] text-muted">{g.description}</div>
                    {g.twoHanded && <Badge className="mt-2 h-5 text-[10px]" tone="accent">2 hands</Badge>}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Recognition tuning" icon={SlidersHorizontal} bodyClassName="space-y-3">
            <Slider
              label="Stability window"
              value={settings.gestureWindow}
              min={3}
              max={12}
              step={1}
              format={(v) => `${v} frames`}
              onChange={(v) => settings.update({ gestureWindow: v })}
              description="Frames that must agree before a gesture is accepted. Higher = steadier, slower."
            />
            <Slider
              label="Repeat cooldown"
              value={settings.gestureCooldownMs}
              min={200}
              max={2000}
              step={50}
              format={(v) => `${v} ms`}
              onChange={(v) => settings.update({ gestureCooldownMs: v })}
              description="Minimum time before the same gesture can trigger again."
            />
            <Slider
              label="Hand detection confidence"
              value={settings.handConfidence}
              min={0.3}
              max={0.9}
              step={0.05}
              format={(v) => v.toFixed(2)}
              onChange={(v) => settings.update({ handConfidence: v })}
            />
          </Card>

          <Card title="Recent gestures" icon={Hand} bodyClassName="p-2">
            {recent.length ? (
              <ul>
                {recent.map((e) => (
                  <li key={e.id} className="flex items-center justify-between px-2 py-1.5 text-xs">
                    <span>{e.text}</span>
                    <span className="num text-subtle">{new Date(e.at).toLocaleTimeString([], { hour12: false })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-xs text-subtle">Confirmed gestures will appear here.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
