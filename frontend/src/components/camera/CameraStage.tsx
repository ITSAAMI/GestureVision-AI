import { Camera, CameraOff, Loader2, VideoOff } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { drawOverlay } from '../../features/vision/drawing';
import { visionEngine } from '../../features/vision/engine';
import { cn } from '../../lib/format';
import { useCamera } from '../../store/cameraStore';
import { useSettings, type OverlayLayers } from '../../store/settingsStore';
import { useVision } from '../../store/visionStore';
import { Button } from '../ui/Button';

interface CameraStageProps {
  /** Restrict which overlay layers may be drawn on this stage (intersected with user settings). */
  layers?: Partial<OverlayLayers>;
  className?: string;
  /** Extra HUD content rendered above the video. */
  children?: ReactNode;
  compact?: boolean;
}

export function CameraStage({ layers: allowed, className, children, compact }: CameraStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const allowedRef = useRef(allowed);
  const stream = useCamera((s) => s.stream);
  const status = useCamera((s) => s.status);
  const error = useCamera((s) => s.error);
  const size = useCamera((s) => s.size);
  const start = useCamera((s) => s.start);
  const mirror = useSettings((s) => s.mirror);
  const handsModel = useVision((s) => s.handsModel);

  useEffect(() => {
    allowedRef.current = allowed;
  });

  // Show the shared stream.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.srcObject !== stream) v.srcObject = stream;
    if (stream) void v.play().catch(() => {});
  }, [stream]);

  // Overlay render loop (independent of React renders).
  useEffect(() => {
    if (status !== 'on') return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    const render = () => {
      raf = requestAnimationFrame(render);
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (!w || !h) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const s = useSettings.getState();
      const layers = { ...s.layers };
      const allow = allowedRef.current;
      if (allow) {
        for (const key of Object.keys(layers) as Array<keyof OverlayLayers>) layers[key] = layers[key] && allow[key] !== false;
      }
      drawOverlay(ctx, {
        width: w,
        height: h,
        mirror: s.mirror,
        layers,
        hands: visionEngine.hands,
        pose: visionEngine.pose,
        analysis: visionEngine.analysis,
        analysisAge: performance.now() - visionEngine.analysisReceivedAt,
      });
    };
    render();
    return () => cancelAnimationFrame(raf);
  }, [status]);

  const aspect = size ? size.width / size.height : 16 / 9;

  return (
    <div className={cn('relative overflow-hidden rounded-xl border border-line bg-black', className)} style={{ aspectRatio: String(aspect) }}>
      <div className="absolute inset-0">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          className={cn('size-full object-contain', mirror && '-scale-x-100', status !== 'on' && 'opacity-0')}
        />
        {/* The container uses the video's aspect ratio, so the overlay maps 1:1 onto the frame. */}
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" />
      </div>

      {status === 'on' && (
        <div className="pointer-events-none absolute top-3 left-3 flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-[10px] font-semibold tracking-wider text-white backdrop-blur">
            <span className="size-1.5 animate-pulse rounded-full bg-danger" /> LIVE
          </span>
          {handsModel === 'loading' && (
            <span className="flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-[10px] text-white/80 backdrop-blur">
              <Loader2 className="size-3 animate-spin" /> Loading hand model…
            </span>
          )}
        </div>
      )}

      {status !== 'on' && (
        <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,rgb(139_123_255/0.08),transparent_70%)] p-6">
          <div className="flex max-w-sm flex-col items-center text-center">
            <div className="mb-4 grid size-14 place-items-center rounded-2xl border border-line-strong bg-surface-2/80 text-muted">
              {status === 'starting' ? <Loader2 className="size-6 animate-spin" /> : status === 'error' ? <VideoOff className="size-6 text-danger" /> : <CameraOff className="size-6" />}
            </div>
            {!compact && (
              <>
                <h3 className="text-sm font-semibold text-fg">
                  {status === 'starting' ? 'Starting camera…' : status === 'error' ? 'Camera unavailable' : 'Camera is off'}
                </h3>
                <p className="mt-1.5 text-sm text-muted">
                  {status === 'error' ? error : 'Video is processed on this device. Nothing is recorded or uploaded to the internet.'}
                </p>
              </>
            )}
            {status !== 'starting' && (
              <Button variant="primary" size={compact ? 'sm' : 'md'} icon={Camera} className="mt-4" onClick={() => void start()}>
                {status === 'error' ? 'Try again' : 'Start camera'}
              </Button>
            )}
          </div>
        </div>
      )}

      {status === 'on' && children}
    </div>
  );
}
