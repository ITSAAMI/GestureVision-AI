import { Camera, ChevronRight, Hand, MousePointer2, RotateCcw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { CameraStage } from '../components/camera/CameraStage';
import { Button } from '../components/ui/Button';
import { Slider, Switch } from '../components/ui/Controls';
import { GESTURES, gestureEmoji, gestureLabel } from '../features/gestures/catalog';
import { FORMATION_LABELS, FORMATIONS, PALETTES, type PaletteName } from '../features/particles/formations';
import { ParticleCanvas } from '../features/particles/ParticleField';
import { createControl, useParticles, type ParticleControl } from '../features/particles/particleStore';
import { useGestureEvents, useVisionDemand, visionEngine } from '../features/vision/engine';
import type { GestureEvent } from '../features/vision/types';
import { cn } from '../lib/format';
import { useCamera } from '../store/cameraStore';
import { useVision } from '../store/visionStore';

const HANDS_ONLY = { persons: false, faces: false, pose: false, trails: false, labels: false };

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('glass rounded-2xl', className)}>{children}</div>;
}

/** Continuous hand → particle forces, sampled every animation frame. */
function useHandForces(control: RefObject<ParticleControl>) {
  useEffect(() => {
    let raf = 0;
    let handDriven = false;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const c = control.current;
      const hands = visionEngine.hands;
      if (!hands.length) {
        if (handDriven) {
          c.mode = 'idle';
          c.cursorActive = false;
          c.pinchStart = null;
          handDriven = false;
        }
        return;
      }
      handDriven = true;
      const h = hands.find((x) => x.handedness === 'Right') ?? hands[0];
      const g = h.stableGesture;
      const p = g === 'one_finger' ? h.landmarks[8] : h.palm;
      // Mirror mapping: moving your hand to the right moves the cursor right.
      c.cursor = { x: (0.5 - p.x) * 13, y: (0.5 - p.y) * 8, z: 0 };
      c.cursorActive = true;
      c.mode = g === 'open_palm' ? 'spread' : g === 'closed_fist' ? 'attract' : g === 'one_finger' ? 'repel' : 'idle';
      if (g === 'pinch') {
        c.pinchStart ??= { y: h.palm.y, scale: c.baseScale };
        c.baseScale = Math.min(2.4, Math.max(0.35, c.pinchStart.scale * (1 + (c.pinchStart.y - h.palm.y) * 3)));
      } else {
        c.pinchStart = null;
      }
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [control]);
}

export default function ParticleStudio() {
  useVisionDemand({ hands: true });
  const p = useParticles();
  const cameraOn = useCamera((s) => s.status === 'on');
  const startCamera = useCamera((s) => s.start);
  const { left, right, twoHand, handsVisible } = useVision();
  const control = useRef<ParticleControl>(createControl());
  const [fps, setFps] = useState(0);
  const [flash, setFlash] = useState<{ text: string; key: number } | null>(null);
  const [legendOpen, setLegendOpen] = useState(true);

  useHandForces(control);

  const show = (text: string) => setFlash({ text, key: Date.now() });
  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(id);
  }, [flash]);

  const onGesture = useCallback((e: GestureEvent) => {
    const c = control.current;
    const now = performance.now() / 1000;
    const store = useParticles.getState();
    const emoji = gestureEmoji(e.gesture);
    switch (e.gesture) {
      case 'victory': {
        store.cycle(1);
        show(`${emoji} ${FORMATION_LABELS[useParticles.getState().formation]}`);
        break;
      }
      case 'two_finger': {
        store.cycle(-1);
        show(`${emoji} ${FORMATION_LABELS[useParticles.getState().formation]}`);
        break;
      }
      case 'thumbs_up':
        c.burstAt = now;
        c.spinBoostUntil = now + 2;
        show(`${emoji} Energy burst`);
        break;
      case 'thumbs_down':
        c.spinDir = c.spinDir === 1 ? -1 : 1;
        show(`${emoji} Rotation reversed`);
        break;
      case 'waving':
        c.waveAt = now;
        show(`${emoji} Ripple`);
        break;
      case 'both_hands_raised':
        c.baseScale = 1.6;
        show(`${emoji} Expand`);
        break;
      case 'hands_together':
        c.baseScale = 0.6;
        show(`${emoji} Compact`);
        break;
    }
  }, []);
  useGestureEvents(onGesture);

  const reset = () => {
    const c = control.current;
    c.baseScale = 1;
    c.spinDir = 1;
    show('View reset');
  };

  const active = twoHand ?? right?.gesture ?? left?.gesture ?? null;

  return (
    <div className="relative h-full min-h-[560px] overflow-hidden bg-[#05060a]">
      <div className="absolute inset-0">
        <ParticleCanvas
          count={p.count}
          formation={p.formation}
          palette={p.palette}
          speed={p.speed}
          size={p.size}
          autoRotate={p.autoRotate}
          control={control}
          onFps={setFps}
        />
      </div>

      {/* Title */}
      <div className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 text-center">
        <div className="label text-white/50">Particle Studio</div>
        <div className="mt-0.5 text-2xl font-semibold tracking-tight text-white">{FORMATION_LABELS[p.formation]}</div>
        <div className="num mt-1 text-[11px] text-white/40">{p.count.toLocaleString()} particles · {fps} fps</div>
      </div>

      {/* Controls */}
      <Panel className="absolute top-4 left-4 w-72 p-4">
        <div className="label mb-2">Formation</div>
        <div className="grid grid-cols-4 gap-1.5">
          {FORMATIONS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => p.set({ formation: f })}
              className={cn(
                'h-8 cursor-pointer truncate rounded-md px-1 text-[11px] font-medium transition-colors',
                p.formation === f ? 'bg-accent text-white' : 'bg-white/[0.05] text-muted hover:bg-white/10 hover:text-fg',
              )}
            >
              {FORMATION_LABELS[f]}
            </button>
          ))}
        </div>

        <div className="label mt-4 mb-2">Palette</div>
        <div className="flex gap-2">
          {(Object.keys(PALETTES) as PaletteName[]).map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              aria-label={`${name} palette`}
              onClick={() => p.set({ palette: name })}
              className={cn('size-7 cursor-pointer rounded-full ring-offset-2 ring-offset-surface transition-transform hover:scale-110', p.palette === name && 'ring-2 ring-white')}
              style={{ background: `linear-gradient(135deg, ${PALETTES[name].join(', ')})` }}
            />
          ))}
        </div>

        <div className="mt-4 space-y-2">
          <Slider label="Particles" value={p.count} min={2000} max={40000} step={1000} format={(v) => `${(v / 1000).toFixed(0)}k`} onChange={(v) => p.set({ count: v })} />
          <Slider label="Speed" value={p.speed} min={0.25} max={3} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => p.set({ speed: v })} />
          <Slider label="Glow size" value={p.size} min={0.4} max={2.5} step={0.05} format={(v) => `${v.toFixed(2)}×`} onChange={(v) => p.set({ size: v })} />
          <Switch label="Auto-rotate" checked={p.autoRotate} onChange={(v) => p.set({ autoRotate: v })} />
        </div>
        <Button size="sm" variant="ghost" icon={RotateCcw} className="mt-2 w-full" onClick={reset}>
          Reset scale & spin
        </Button>
      </Panel>

      {/* Camera PiP */}
      <div className="absolute bottom-4 left-4 w-72">
        {cameraOn ? (
          <Panel className="overflow-hidden p-1.5">
            <CameraStage layers={HANDS_ONLY} compact className="rounded-xl" />
            <div className="flex items-center justify-between px-2 pt-2 pb-1 text-xs">
              <span className="flex items-center gap-1.5 text-muted">
                <Hand className="size-3.5" /> {handsVisible ? `${handsVisible} hand${handsVisible > 1 ? 's' : ''}` : 'Show your hand'}
              </span>
              <span className="font-medium text-fg">{active && active !== 'unknown' ? `${gestureEmoji(active)} ${gestureLabel(active)}` : '—'}</span>
            </div>
          </Panel>
        ) : (
          <Panel className="p-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent"><Sparkles className="size-4" /></span>
              <div>
                <div className="text-sm font-medium">Control with your hands</div>
                <div className="mt-0.5 text-xs text-muted">Turn on the camera to steer particles with gestures.</div>
              </div>
            </div>
            <Button variant="primary" size="sm" icon={Camera} className="mt-3 w-full" onClick={() => void startCamera()}>
              Start camera
            </Button>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-subtle">
              <MousePointer2 className="size-3" /> Mouse: hover to push · hold left to pull · right-drag to orbit · scroll to zoom
            </div>
          </Panel>
        )}
      </div>

      {/* Gesture legend */}
      <Panel className="absolute top-4 right-4 w-64">
        <button type="button" onClick={() => setLegendOpen((o) => !o)} className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left">
          <span className="text-sm font-medium">Gesture controls</span>
          <ChevronRight className={cn('size-4 text-muted transition-transform', legendOpen && 'rotate-90')} />
        </button>
        {legendOpen && (
          <ul className="max-h-[calc(100vh-14rem)] space-y-0.5 overflow-y-auto px-2 pb-2">
            {GESTURES.map((g) => (
              <li
                key={g.id}
                className={cn('flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors', active === g.id && 'bg-hand/15')}
              >
                <span className="w-6 text-center text-base">{g.emoji}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium">{g.label}</span>
                  <span className="block truncate text-[11px] text-muted">{g.id === 'pinch' ? 'Pinch & move up/down to scale' : g.action}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {flash && (
        <div key={flash.key} className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 animate-slide-up">
          <div className="glass rounded-full px-5 py-2.5 text-sm font-medium text-white">{flash.text}</div>
        </div>
      )}
    </div>
  );
}
