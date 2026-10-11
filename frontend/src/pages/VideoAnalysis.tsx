import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Clock, Film, Gauge, ImageIcon, Trash2, UploadCloud, UserRound, Users } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, PageHeader } from '../components/ui/Card';
import { Segmented } from '../components/ui/Controls';
import { ConfirmDialog, EmptyState, ProgressBar, Skeleton, Stat } from '../components/ui/Feedback';
import { trackColor } from '../features/vision/drawing';
import { api, type VideoAnalysis as Video, type VideoResults } from '../lib/api';
import { cn, formatBytes, formatDuration, formatRelative, formatTimecode } from '../lib/format';
import { toast } from '../store/toastStore';
import { VideoStatusBadge } from './Overview';

const ACCEPT = '.mp4,.mov,.avi,.mkv,.webm,.m4v,.mpg,.mpeg,.wmv';

function Timeline({ data, duration }: { data: VideoResults['timeline']; duration: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 800;
  const H = 180;
  const pad = { l: 28, r: 8, t: 10, b: 22 };
  const maxY = Math.max(1, ...data.map((d) => Math.max(d.persons, d.faces)));
  const span = Math.max(duration, data.at(-1)?.t ?? 1, 0.001);
  const x = (t: number) => pad.l + (t / span) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
  const step = (key: 'persons' | 'faces') =>
    data.map((d, i) => `${i ? 'L' : 'M'}${x(d.t).toFixed(1)},${y(d[key]).toFixed(1)}`).join(' ');
  const persons = step('persons');
  const area = `${persons} L${x(data.at(-1)!.t)},${y(0)} L${x(data[0].t)},${y(0)} Z`;
  const ticks = Array.from(new Set([0, Math.ceil(maxY / 2), maxY]));
  const point = hover != null ? data[hover] : null;

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const t = (((e.clientX - rect.left) / rect.width) * W - pad.l) / (W - pad.l - pad.r) * span;
    let best = 0;
    for (let i = 1; i < data.length; i++) if (Math.abs(data[i].t - t) < Math.abs(data[best].t - t)) best = i;
    setHover(best);
  };

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label="People over time">
        <defs>
          <linearGradient id="tl-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.45" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="rgb(255 255 255 / 0.06)" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" className="fill-subtle text-[10px]">{t}</text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={x(f * span)} y={H - 4} textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'} className="fill-subtle text-[10px]">
            {formatTimecode(f * span)}
          </text>
        ))}
        <path d={area} fill="url(#tl-fill)" />
        <path d={persons} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
        <path d={step('faces')} fill="none" stroke="var(--color-face)" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.8" />
        {point && (
          <g>
            <line x1={x(point.t)} x2={x(point.t)} y1={pad.t} y2={H - pad.b} stroke="rgb(255 255 255 / 0.3)" />
            <circle cx={x(point.t)} cy={y(point.persons)} r="4" fill="var(--color-accent)" stroke="#fff" strokeWidth="1.5" />
          </g>
        )}
      </svg>
      {point && (
        <div
          className="glass pointer-events-none absolute top-0 rounded-lg px-2.5 py-1.5 text-xs"
          style={{ left: `${(x(point.t) / W) * 100}%`, transform: `translateX(${x(point.t) > W * 0.7 ? '-110%' : '10%'})` }}
        >
          <div className="num text-muted">{formatTimecode(point.t)}</div>
          <div><span className="text-accent">●</span> {point.persons} people</div>
          <div><span className="text-face">●</span> {point.faces} faces</div>
        </div>
      )}
      <div className="mt-2 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded bg-accent" /> People</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded border-t border-dashed border-face" /> Faces</span>
      </div>
    </div>
  );
}

function Detail({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const { data: video, isPending } = useQuery({
    queryKey: ['video', id],
    queryFn: () => api.video(id),
    refetchInterval: (q) => (q.state.data && ['queued', 'processing'].includes(q.state.data.status) ? 1000 : false),
  });
  const remove = useMutation({
    mutationFn: () => api.deleteVideo(id),
    onSuccess: () => {
      toast.success('Video deleted');
      void qc.invalidateQueries({ queryKey: ['videos'] });
      onDeleted();
    },
    onError: (e: Error) => toast.error('Delete failed', e.message),
  });

  if (isPending || !video) return <Skeleton className="h-96" />;
  const r = video.results;
  const s = r?.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold">{video.filename}</h2>
          <div className="text-xs text-muted">
            {formatBytes(video.file_size)} · uploaded {formatRelative(video.created_at)}
            {s && ` · ${s.width}×${s.height} @ ${s.source_fps} fps`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <VideoStatusBadge status={video.status} />
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setConfirm(true)} aria-label="Delete video" />
        </div>
      </div>

      {(video.status === 'queued' || video.status === 'processing') && (
        <Card>
          <div className="mb-2 flex justify-between text-sm">
            <span>{video.status === 'queued' ? 'Waiting in queue…' : 'Analyzing frames…'}</span>
            <span className="num text-muted">{video.progress.toFixed(0)}%</span>
          </div>
          <ProgressBar value={video.progress} />
          <div className="num mt-2 text-xs text-muted">
            {video.processed_frames} frames analyzed at {video.sample_fps} fps
          </div>
        </Card>
      )}

      {video.status === 'failed' && (
        <Card>
          <div className="flex items-start gap-3 text-sm">
            <AlertTriangle className="size-4 text-danger" />
            <div>
              <div className="font-medium">Analysis failed</div>
              <div className="text-muted">{video.error}</div>
            </div>
          </div>
        </Card>
      )}

      {s && r && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Unique people" icon={Users} value={s.unique_people} hint={`${r.identities.length} recognized`} />
            <Stat label="Peak in frame" icon={UserRound} tone="info" value={s.max_persons} hint={`at ${formatTimecode(s.max_persons_at)}`} />
            <Stat label="Duration" icon={Clock} tone="success" value={formatDuration(s.duration_s)} hint={`${s.frames_analyzed} frames @ ${s.sample_fps} fps`} />
            <Stat label="Speed" icon={Gauge} tone="warning" value={`${s.realtime_factor}×`} hint={`real time · ${formatDuration(s.processing_time_s)}`} />
          </div>

          <Card title="People over time" description={`Average ${s.avg_persons} people per frame`}>
            {r.timeline.length > 1 ? <Timeline data={r.timeline} duration={s.duration_s} /> : <p className="text-sm text-muted">Not enough frames for a timeline.</p>}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Peak moment" icon={ImageIcon} bodyClassName="p-3">
              {r.has_peak_frame ? (
                <img src={`/api/video/${id}/peak.jpg`} alt="Annotated frame with the most people" className="w-full rounded-lg border border-line" />
              ) : (
                <p className="text-sm text-muted">No people were detected.</p>
              )}
            </Card>
            <Card title="Tracks" description="When each person was on screen" bodyClassName="p-3">
              {r.tracks.length ? (
                <ul className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
                  {r.tracks.map((t) => (
                    <li key={t.track_id} className="grid grid-cols-[3.5rem_1fr] items-center gap-2 text-xs">
                      <span className="num truncate text-muted" title={t.name ?? undefined}>{t.name ?? `#${t.track_id}`}</span>
                      <div className="relative h-4 rounded bg-white/[0.04]">
                        <div
                          className="absolute top-0.5 bottom-0.5 rounded-sm"
                          title={`${formatTimecode(t.first_seen)} – ${formatTimecode(t.last_seen)}`}
                          style={{
                            left: `${(t.first_seen / s.duration_s) * 100}%`,
                            width: `${Math.max(0.8, ((t.last_seen - t.first_seen) / s.duration_s) * 100)}%`,
                            background: trackColor(t.track_id),
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">No people tracked.</p>
              )}
              {r.identities.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
                  {r.identities.map((i) => (
                    <Badge key={i.name} tone="warning">{i.name} · {formatTimecode(i.first_seen)}</Badge>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirm}
        title="Delete this video?"
        description="The uploaded file and its analysis results will be permanently removed."
        loading={remove.isPending}
        onCancel={() => setConfirm(false)}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

export default function VideoAnalysis() {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sampleFps, setSampleFps] = useState<'2' | '5' | '10'>('5');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);

  const videos = useQuery({
    queryKey: ['videos'],
    queryFn: api.videos,
    refetchInterval: (q) => (q.state.data?.videos.some((v) => v.status === 'queued' || v.status === 'processing') ? 1500 : false),
  });

  useEffect(() => {
    if (!selected && videos.data?.videos.length) setSelected(videos.data.videos[0].id);
  }, [videos.data, selected]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploadProgress(0);
    try {
      const video = await api.uploadVideo(file, Number(sampleFps), setUploadProgress);
      toast.success('Upload complete', 'Analysis has started');
      await qc.invalidateQueries({ queryKey: ['videos'] });
      setSelected(video.id);
    } catch (err) {
      toast.error('Upload failed', (err as Error).message);
    } finally {
      setUploadProgress(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void upload(e.dataTransfer.files[0]);
  };

  return (
    <div className="mx-auto max-w-[1400px] animate-fade-in px-6 py-6">
      <PageHeader
        title="Video Analysis"
        description="Upload recorded footage to count and track people, recognize enrolled faces and find the busiest moments. Processing runs on your machine."
      />

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            onClick={() => uploadProgress == null && inputRef.current?.click()}
            onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex cursor-pointer flex-col items-center rounded-xl border border-dashed px-4 py-8 text-center transition-colors',
              dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface/60 hover:border-accent/50 hover:bg-surface-2',
            )}
          >
            <UploadCloud className={cn('mb-3 size-7', dragging ? 'text-accent' : 'text-muted')} />
            {uploadProgress == null ? (
              <>
                <div className="text-sm font-medium">Drop a video or click to browse</div>
                <div className="mt-1 text-xs text-muted">MP4, MOV, AVI, MKV, WebM · up to 500 MB</div>
              </>
            ) : (
              <div className="w-full">
                <div className="mb-2 text-sm">Uploading… {Math.round(uploadProgress * 100)}%</div>
                <ProgressBar value={uploadProgress * 100} />
              </div>
            )}
            <input ref={inputRef} type="file" accept={ACCEPT} hidden onChange={(e) => void upload(e.target.files?.[0])} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">Sampling rate</span>
            <Segmented
              size="sm"
              value={sampleFps}
              onChange={setSampleFps}
              options={[
                { value: '2', label: '2 fps' },
                { value: '5', label: '5 fps' },
                { value: '10', label: '10 fps' },
              ]}
            />
          </div>

          <Card title="Library" icon={Film} bodyClassName="p-1.5">
            {videos.isPending ? (
              <div className="space-y-2 p-2">{[0, 1].map((i) => <Skeleton key={i} className="h-14" />)}</div>
            ) : videos.data?.videos.length ? (
              <ul className="max-h-[480px] space-y-0.5 overflow-y-auto">
                {videos.data.videos.map((v: Video) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(v.id)}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-left transition-colors',
                        selected === v.id ? 'bg-white/[0.07]' : 'hover:bg-white/[0.03]',
                      )}
                    >
                      <span className="grid h-10 w-16 shrink-0 place-items-center overflow-hidden rounded-md bg-black">
                        <img
                          src={`/api/video/${v.id}/thumbnail.jpg`}
                          alt=""
                          className="size-full object-cover"
                          onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
                        />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{v.filename}</span>
                        <span className="mt-1 block">
                          {v.status === 'processing' ? (
                            <ProgressBar value={v.progress} className="h-1" />
                          ) : (
                            <span className="text-xs text-muted">{v.summary ? `${v.summary.unique_people} people · ${formatDuration(v.summary.duration_s)}` : v.status}</span>
                          )}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-6 text-center text-xs text-subtle">No videos yet.</p>
            )}
          </Card>
        </div>

        <div className="min-w-0">
          {selected ? (
            <Detail key={selected} id={selected} onDeleted={() => setSelected(null)} />
          ) : (
            <div className="panel">
              <EmptyState icon={Film} title="Analyze your first video" description="Upload a clip. You’ll get a people-count timeline, per-person tracks, recognized identities and the busiest moment annotated." />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
