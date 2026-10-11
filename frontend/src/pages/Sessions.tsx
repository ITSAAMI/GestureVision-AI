import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Clock, Hand, History, Trash2, Users, Zap } from 'lucide-react';
import { Fragment, useState } from 'react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, PageHeader } from '../components/ui/Card';
import { Callout, ConfirmDialog, EmptyState, Skeleton, Stat } from '../components/ui/Feedback';
import { gestureEmoji, gestureLabel } from '../features/gestures/catalog';
import type { Gesture } from '../features/vision/types';
import { api, type Session } from '../lib/api';
import { cn, formatDateTime, formatDuration } from '../lib/format';
import { toast } from '../store/toastStore';

function GestureBars({ gestures }: { gestures: Record<string, number> }) {
  const entries = Object.entries(gestures).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  if (!entries.length) return <p className="text-xs text-subtle">No gestures recorded.</p>;
  return (
    <ul className="space-y-1.5">
      {entries.map(([g, n]) => (
        <li key={g} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-3 text-xs">
          <span className="truncate">{gestureEmoji(g as Gesture)} {gestureLabel(g as Gesture)}</span>
          <span className="h-1.5 rounded-full bg-white/[0.06]">
            <span className="block h-full rounded-full bg-hand" style={{ width: `${(n / max) * 100}%` }} />
          </span>
          <span className="num text-right text-muted">{n}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Sessions() {
  const qc = useQueryClient();
  const { data, isPending, isError, error } = useQuery({ queryKey: ['sessions'], queryFn: api.sessions });
  const [open, setOpen] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'all' | Session | null>(null);

  const remove = useMutation({
    mutationFn: (target: 'all' | Session) => (target === 'all' ? api.deleteAllSessions() : api.deleteSession(target.id)),
    onSuccess: () => {
      toast.success('Deleted');
      setConfirm(null);
      void qc.invalidateQueries({ queryKey: ['sessions'] });
    },
    onError: (e: Error) => toast.error('Delete failed', e.message),
  });

  const stats = data?.stats;

  return (
    <div className="mx-auto max-w-[1400px] animate-fade-in px-6 py-6">
      <PageHeader
        title="Sessions"
        description="Every live detection run is recorded automatically with people counts, recognized identities, gestures and performance."
        actions={data?.sessions.length ? <Button variant="danger" icon={Trash2} onClick={() => setConfirm('all')}>Clear history</Button> : null}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sessions" icon={History} value={stats?.total_sessions ?? '—'} />
        <Stat label="Total time" icon={Clock} tone="success" value={stats ? formatDuration(stats.total_duration_s) : '—'} />
        <Stat label="Frames analyzed" icon={Zap} tone="info" value={stats?.total_frames.toLocaleString() ?? '—'} />
        <Stat label="Gestures" icon={Hand} tone="warning" value={stats?.total_gestures ?? '—'} />
      </div>

      <Card bodyClassName="p-0">
        {isPending ? (
          <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11" />)}</div>
        ) : isError ? (
          <div className="p-4"><Callout tone="danger" title="Couldn’t load sessions">{(error as Error).message}</Callout></div>
        ) : !data.sessions.length ? (
          <EmptyState icon={History} title="No sessions yet" description="Start the camera on the Live Detection page — a session is saved when you stop or leave." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {['', 'Started', 'Duration', 'Frames', 'People', 'Peak', 'Identities', 'Gestures', 'Latency', ''].map((h, i) => (
                    <th key={i} className="label px-4 py-3 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s) => {
                  const expanded = open === s.id;
                  return (
                    <Fragment key={s.id}>
                      <tr
                        onClick={() => setOpen(expanded ? null : s.id)}
                        className={cn('cursor-pointer border-b border-line transition-colors hover:bg-white/[0.02]', expanded && 'bg-white/[0.03]')}
                      >
                        <td className="w-8 pl-4"><ChevronRight className={cn('size-4 text-subtle transition-transform', expanded && 'rotate-90')} /></td>
                        <td className="px-4 py-3 whitespace-nowrap">{formatDateTime(s.start_time)}</td>
                        <td className="num px-4 py-3">{formatDuration(s.duration_s)}</td>
                        <td className="num px-4 py-3 text-muted">{s.frames_processed.toLocaleString()}</td>
                        <td className="num px-4 py-3"><span className="inline-flex items-center gap-1.5"><Users className="size-3.5 text-person" />{s.unique_persons}</span></td>
                        <td className="num px-4 py-3 text-muted">{s.max_persons}</td>
                        <td className="px-4 py-3">
                          {s.identities.length ? (
                            <span className="flex flex-wrap gap-1">{s.identities.slice(0, 3).map((n) => <Badge key={n} tone="warning">{n}</Badge>)}{s.identities.length > 3 && <Badge>+{s.identities.length - 3}</Badge>}</span>
                          ) : (
                            <span className="text-subtle">—</span>
                          )}
                        </td>
                        <td className="num px-4 py-3">{s.gestures_count}</td>
                        <td className="num px-4 py-3 text-muted">{s.avg_latency_ms ? `${s.avg_latency_ms} ms` : '—'}</td>
                        <td className="w-10 pr-3">
                          <Button size="sm" variant="ghost" icon={Trash2} aria-label="Delete session" onClick={(e) => { e.stopPropagation(); setConfirm(s); }} />
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-line bg-white/[0.015]">
                          <td />
                          <td colSpan={9} className="px-4 py-4">
                            <div className="grid gap-6 md:grid-cols-[1fr_auto]">
                              <div>
                                <div className="label mb-2">Gesture breakdown</div>
                                <GestureBars gestures={s.gestures} />
                              </div>
                              <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                                <dt className="text-subtle">Detector rate</dt><dd className="num">{s.avg_fps} fps</dd>
                                <dt className="text-subtle">Detections</dt><dd className="num">{s.detections_count.toLocaleString()}</dd>
                                <dt className="text-subtle">Session ID</dt><dd className="num">{s.id.slice(0, 8)}</dd>
                              </dl>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'all' ? 'Clear all sessions?' : 'Delete this session?'}
        description={confirm === 'all' ? 'The entire session history will be permanently deleted.' : 'This session record will be permanently deleted.'}
        loading={remove.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && remove.mutate(confirm)}
      />
    </div>
  );
}
