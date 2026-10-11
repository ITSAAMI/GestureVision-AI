import type { ReactNode } from 'react';
import { gestureEmoji, gestureLabel } from '../features/gestures/catalog';
import { cn } from '../lib/format';
import { useCamera } from '../store/cameraStore';
import { useVision } from '../store/visionStore';
import { StatusDot } from '../components/ui/Badge';

function Item({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <span className={cn('flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span className="text-subtle">{label}</span>
      <span className="num text-muted">{children}</span>
    </span>
  );
}

export function StatusBar() {
  const camera = { status: useCamera((s) => s.status), size: useCamera((s) => s.size) };
  const v = useVision();
  const linkTone = v.link === 'open' ? 'success' : v.link === 'connecting' ? 'warning' : 'neutral';
  const gesture = v.twoHand ?? v.right?.gesture ?? v.left?.gesture ?? null;

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between gap-4 overflow-hidden border-t border-line bg-surface/60 px-4 text-[11px] backdrop-blur-xl">
      <div className="flex items-center gap-4 overflow-hidden">
        <span className="flex items-center gap-1.5">
          <StatusDot tone={camera.status === 'on' ? 'danger' : 'neutral'} pulse={camera.status === 'on'} />
          <span className="text-muted">{camera.status === 'on' ? 'LIVE' : 'Camera off'}</span>
          {camera.size && <span className="num text-subtle">{camera.size.width}×{camera.size.height}</span>}
        </span>
        <Item label="Pipeline">{v.pipelineFps} fps</Item>
        <span className="flex items-center gap-1.5">
          <StatusDot tone={linkTone} />
          <span className="text-subtle">Detector</span>
          <span className="num text-muted">{v.link === 'open' ? `${v.backendLatencyMs} ms` : v.link}</span>
        </span>
        <Item label="People" className="hidden md:flex">{v.analysis?.persons.length ?? 0}</Item>
        <Item label="Faces" className="hidden md:flex">{v.analysis?.faces.length ?? 0}</Item>
        <Item label="Hands" className="hidden lg:flex">{v.handsVisible}</Item>
        <Item label="Gesture" className="hidden lg:flex">
          {gesture && gesture !== 'unknown' ? `${gestureEmoji(gesture)} ${gestureLabel(gesture)}` : '—'}
        </Item>
      </div>
      <div className="hidden items-center gap-4 sm:flex">
        {v.sessionId && <Item label="Session">{v.sessionId.slice(0, 8)}</Item>}
        <span className="text-subtle">GestureVision AI 2.0</span>
      </div>
    </footer>
  );
}
