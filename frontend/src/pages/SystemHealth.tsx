import { useQuery } from '@tanstack/react-query';
import { Boxes, Cpu, Database, Globe, HardDrive, MemoryStick, MonitorCog, RefreshCw, Server } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useSystemStatus } from '../app/useBackend';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, PageHeader } from '../components/ui/Card';
import { Callout, ProgressBar, Skeleton, Stat } from '../components/ui/Feedback';
import { api } from '../lib/api';
import { formatDuration } from '../lib/format';
import { useVision } from '../store/visionStore';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="num truncate text-right">{children}</span>
    </div>
  );
}

function useBrowserInfo() {
  return useMemo(() => {
    let gpu = 'Unknown';
    let webgl2 = false;
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      webgl2 = !!gl;
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      if (gl && ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL));
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      /* ignore */
    }
    const nav = navigator as Navigator & { deviceMemory?: number; gpu?: unknown };
    return {
      gpu: gpu.replace(/^ANGLE \((.*)\)$/, '$1'),
      webgl2,
      webgpu: 'gpu' in nav && !!nav.gpu,
      cores: navigator.hardwareConcurrency,
      memory: nav.deviceMemory,
      camera: !!navigator.mediaDevices?.getUserMedia,
      secure: window.isSecureContext,
    };
  }, []);
}

export default function SystemHealth() {
  const status = useSystemStatus(5000);
  const diag = useQuery({ queryKey: ['diagnostics'], queryFn: api.diagnostics, refetchInterval: 5000 });
  const browser = useBrowserInfo();
  const v = useVision();
  const offline = status.isError;

  return (
    <div className="mx-auto max-w-[1400px] animate-fade-in px-6 py-6">
      <PageHeader
        title="System Health"
        description="Live status of the inference backend, models, host resources and browser capabilities."
        actions={<Button icon={RefreshCw} onClick={() => { void status.refetch(); void diag.refetch(); }}>Refresh</Button>}
      />

      {offline && (
        <div className="mb-4">
          <Callout tone="danger" title="Backend unreachable">Start it with <code className="num text-fg">cd backend && python main.py</code></Callout>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Backend" icon={Server} tone={offline ? 'danger' : 'success'} value={offline ? 'Offline' : status.data ? 'Online' : '…'} hint={status.data ? `up ${formatDuration(status.data.uptime_s)}` : undefined} />
        <Stat label="CPU" icon={Cpu} tone="info" value={diag.data?.resources.cpu_percent ?? '—'} unit="%" hint={diag.data ? `${diag.data.platform.cpu_count} logical cores` : undefined} />
        <Stat label="Memory" icon={MemoryStick} tone="warning" value={diag.data?.resources.memory_used_percent ?? '—'} unit="%" hint={diag.data?.resources.process_memory_mb ? `backend uses ${diag.data.resources.process_memory_mb} MB` : undefined} />
        <Stat label="Vision pipeline" icon={MonitorCog} value={v.pipelineFps} unit="fps" hint={v.link === 'open' ? `detector ${v.backendLatencyMs} ms round-trip` : 'detector idle'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Backend models" icon={Boxes} description={status.data ? `ONNX Runtime ${status.data.onnxruntime.version} · ${status.data.onnxruntime.providers.join(', ')}` : undefined} bodyClassName="p-0">
          {status.data ? (
            <table className="w-full text-sm">
              <tbody>
                {Object.values(status.data.models).map((m) => (
                  <tr key={m.name} className="border-b border-line last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-medium">{m.task}</div>
                      <div className="num text-xs text-muted">{m.name}{m.size_mb ? ` · ${m.size_mb} MB` : ''}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">{m.license}</td>
                    <td className="px-4 py-3 text-right">
                      <Badge tone={m.loaded ? 'success' : m.available ? 'warning' : 'danger'} dot>{m.loaded ? 'Loaded' : m.available ? 'Available' : 'Missing'}</Badge>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-3 text-muted" colSpan={2}>Registered face samples</td>
                  <td className="num px-4 py-3 text-right">{status.data.registered_face_samples}</td>
                </tr>
              </tbody>
            </table>
          ) : (
            <div className="p-4"><Skeleton className="h-40" /></div>
          )}
        </Card>

        <Card title="Browser" icon={Globe} description="Hand & pose models run here via WebAssembly + WebGL">
          <div className="divide-y divide-line">
            <Row label="GPU">{browser.gpu}</Row>
            <Row label="WebGL 2">{browser.webgl2 ? <Badge tone="success">Supported</Badge> : <Badge tone="danger">Unavailable</Badge>}</Row>
            <Row label="WebGPU">{browser.webgpu ? <Badge tone="success">Supported</Badge> : <Badge>Not available</Badge>}</Row>
            <Row label="Camera API">{browser.camera && browser.secure ? <Badge tone="success">Available</Badge> : <Badge tone="danger">Requires https/localhost</Badge>}</Row>
            <Row label="CPU threads">{browser.cores ?? '—'}</Row>
            <Row label="Device memory">{browser.memory ? `≥ ${browser.memory} GB` : '—'}</Row>
            <Row label="Hand model">{v.handsModel}</Row>
            <Row label="Pose model">{v.poseModel}</Row>
          </div>
        </Card>

        <Card title="Host" icon={HardDrive}>
          {diag.data ? (
            <div className="divide-y divide-line">
              <Row label="Operating system">{diag.data.platform.os}</Row>
              <Row label="Architecture">{diag.data.platform.machine}</Row>
              <Row label="Python">{diag.data.platform.python}</Row>
              <Row label="Memory">{diag.data.resources.memory_total_gb ? `${diag.data.resources.memory_total_gb} GB` : '—'}</Row>
              <div className="py-3">
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-muted">Disk</span>
                  <span className="num">{diag.data.resources.disk_free_gb} GB free of {diag.data.resources.disk_total_gb} GB</span>
                </div>
                <ProgressBar value={100 - (diag.data.resources.disk_free_gb / diag.data.resources.disk_total_gb) * 100} />
              </div>
            </div>
          ) : (
            <Skeleton className="h-40" />
          )}
        </Card>

        <Card title="Storage" icon={Database}>
          {diag.data ? (
            <div className="divide-y divide-line">
              <Row label="Database size">{diag.data.storage.database_mb} MB</Row>
              <Row label="Uploaded videos">{diag.data.storage.videos} · {diag.data.storage.uploads_mb} MB</Row>
              <Row label="Identities">{diag.data.storage.identities} ({diag.data.storage.face_samples} samples)</Row>
              <Row label="Sessions">{diag.data.storage.sessions}</Row>
            </div>
          ) : (
            <Skeleton className="h-32" />
          )}
        </Card>
      </div>
    </div>
  );
}
