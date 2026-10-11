import { Camera, CameraOff, ChevronDown, Server } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useCamera } from '../store/cameraStore';
import { findNavItem } from './nav';
import { useBackendHealth } from './useBackend';

export function Header() {
  const { pathname } = useLocation();
  const item = findNavItem(pathname);
  const health = useBackendHealth();
  const { status, start, stop, devices, deviceId } = useCamera();
  const online = health.isSuccess && !health.isError;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line bg-bg/60 px-5 backdrop-blur-xl">
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold">{item?.label ?? 'GestureVision AI'}</div>
        {item && <div className="hidden truncate text-xs text-subtle sm:block">{item.description}</div>}
      </div>

      <div className="flex items-center gap-2">
        <Badge tone={health.isPending ? 'neutral' : online ? 'success' : 'danger'} dot pulse={online} className="hidden sm:inline-flex">
          <Server className="size-3" />
          {health.isPending ? 'Connecting…' : online ? `Backend v${health.data?.version}` : 'Backend offline'}
        </Badge>

        {status === 'on' && devices.length > 1 && (
          <label className="relative hidden md:block">
            <span className="sr-only">Camera device</span>
            <select
              value={deviceId ?? ''}
              onChange={(e) => void start(e.target.value)}
              className="h-9 max-w-48 cursor-pointer appearance-none truncate rounded-lg border border-line-strong bg-surface-3 py-0 pr-8 pl-3 text-xs text-fg outline-none"
            >
              {devices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId} className="bg-surface-2">
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-2.5 right-2.5 size-4 text-subtle" />
          </label>
        )}

        {status === 'on' ? (
          <Button icon={CameraOff} onClick={stop}>
            Stop camera
          </Button>
        ) : (
          <Button variant="primary" icon={Camera} loading={status === 'starting'} onClick={() => void start()}>
            Start camera
          </Button>
        )}
      </div>
    </header>
  );
}
