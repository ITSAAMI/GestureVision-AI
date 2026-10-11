import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Cpu, Database, Hand, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/ui/Button';
import { Card, PageHeader } from '../components/ui/Card';
import { Segmented, Slider, Switch } from '../components/ui/Controls';
import { Callout, ConfirmDialog, Skeleton } from '../components/ui/Feedback';
import { api, type RuntimeSettings } from '../lib/api';
import { useCamera } from '../store/cameraStore';
import { useSettings, type Resolution } from '../store/settingsStore';
import { toast } from '../store/toastStore';

function BackendSettings() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const [draft, setDraft] = useState<RuntimeSettings | null>(null);

  useEffect(() => {
    if (query.data) setDraft(query.data.settings);
  }, [query.data]);

  const save = useMutation({
    mutationFn: (patch: Partial<RuntimeSettings>) => api.updateSettings(patch),
    onSuccess: (res) => {
      qc.setQueryData(['settings'], res);
      toast.success('Detection settings saved', 'Applied immediately to the running detector');
    },
    onError: (e: Error) => toast.error('Could not save', e.message),
  });
  const reset = useMutation({
    mutationFn: api.resetSettings,
    onSuccess: (res) => {
      qc.setQueryData(['settings'], res);
      toast.success('Restored defaults');
    },
  });

  if (query.isError) return <Callout tone="danger" title="Backend unreachable">Detection settings live on the backend.</Callout>;
  if (!draft || !query.data) return <Skeleton className="h-72" />;

  const set = <K extends keyof RuntimeSettings>(key: K, value: RuntimeSettings[K]) => setDraft({ ...draft, [key]: value });
  const dirty = JSON.stringify(draft) !== JSON.stringify(query.data.settings);

  return (
    <Card
      title="Detection backend"
      icon={Cpu}
      description="Applied live to person detection, tracking and face recognition"
      actions={
        <>
          <Button size="sm" variant="ghost" icon={RotateCcw} loading={reset.isPending} onClick={() => reset.mutate()}>Defaults</Button>
          <Button size="sm" variant="primary" icon={Save} disabled={!dirty} loading={save.isPending} onClick={() => save.mutate(draft)}>Save</Button>
        </>
      }
      bodyClassName="grid gap-x-8 gap-y-3 md:grid-cols-2"
    >
      <Slider label="Person confidence" value={draft.detection_confidence} min={0.05} max={0.95} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set('detection_confidence', v)} description="Lower finds more people but adds false positives." />
      <Slider label="Duplicate box overlap (NMS)" value={draft.nms_iou_threshold} min={0.1} max={0.9} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set('nms_iou_threshold', v)} />
      <Slider label="Face detection confidence" value={draft.face_detection_confidence} min={0.1} max={0.95} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => set('face_detection_confidence', v)} />
      <Slider label="Face match threshold" value={draft.face_recognition_threshold} min={0.2} max={0.9} step={0.01} format={(v) => v.toFixed(2)} onChange={(v) => set('face_recognition_threshold', v)} description="Cosine similarity needed to name someone. Higher = stricter." />
      <Slider label="Max detector rate" value={draft.max_detection_fps} min={1} max={30} step={1} format={(v) => `${v} fps`} onChange={(v) => set('max_detection_fps', v)} />
      <Slider label="Track memory" value={draft.tracker_max_missed} min={1} max={120} step={1} format={(v) => `${v} frames`} onChange={(v) => set('tracker_max_missed', v)} description="How long a person who leaves view keeps their ID." />
      <div className="space-y-1 md:col-span-2">
        <Switch label="Person detection" checked={draft.enable_person_detection} onChange={(v) => set('enable_person_detection', v)} />
        <Switch label="Face detection" checked={draft.enable_face_detection} onChange={(v) => set('enable_face_detection', v)} />
        <Switch label="Face recognition" description="Match detected faces against the Face Registry" checked={draft.enable_face_recognition} disabled={!draft.enable_face_detection} onChange={(v) => set('enable_face_recognition', v)} />
      </div>
    </Card>
  );
}

function DataManagement() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<'faces' | 'sessions' | null>(null);
  const wipe = useMutation({
    mutationFn: (what: 'faces' | 'sessions') => (what === 'faces' ? api.deleteAllFaces() : api.deleteAllSessions()),
    onSuccess: (res, what) => {
      toast.success(`Deleted ${res.deleted} ${what === 'faces' ? 'face samples' : 'sessions'}`);
      setConfirm(null);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error('Delete failed', e.message),
  });
  return (
    <Card title="Data & privacy" icon={Database} description="Everything is stored locally in backend/data">
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" icon={Trash2} onClick={() => setConfirm('faces')}>Delete all faces</Button>
        <Button variant="danger" icon={Trash2} onClick={() => setConfirm('sessions')}>Delete session history</Button>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === 'faces' ? 'Delete every registered face?' : 'Delete all session history?'}
        description="This cannot be undone."
        confirmLabel="Delete everything"
        loading={wipe.isPending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && wipe.mutate(confirm)}
      />
    </Card>
  );
}

export default function Settings() {
  const s = useSettings();
  const cameraOn = useCamera((c) => c.status === 'on');
  const restart = useCamera((c) => c.start);

  return (
    <div className="mx-auto max-w-[1100px] animate-fade-in px-6 py-6">
      <PageHeader
        title="Settings"
        description="Detection settings are stored on the backend; camera and gesture preferences are saved in this browser."
        actions={<Button icon={RotateCcw} variant="ghost" onClick={() => { s.reset(); toast.info('Browser preferences reset'); }}>Reset preferences</Button>}
      />
      <div className="space-y-4">
        <BackendSettings />

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Camera & streaming" icon={Camera} bodyClassName="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm">Capture resolution</span>
              <Segmented<Resolution>
                size="sm"
                value={s.resolution}
                onChange={(v) => {
                  s.update({ resolution: v });
                  if (cameraOn) void restart();
                }}
                options={[
                  { value: '640x480', label: '480p' },
                  { value: '1280x720', label: '720p' },
                  { value: '1920x1080', label: '1080p' },
                ]}
              />
            </div>
            <Switch label="Mirror preview" description="Show the camera like a mirror" checked={s.mirror} onChange={(v) => s.update({ mirror: v })} />
            <Switch label="Stream to detection backend" description="Needed for people & face detection" checked={s.streamToBackend} onChange={(v) => s.update({ streamToBackend: v })} />
            <Slider label="Streaming rate" value={s.streamFps} min={1} max={30} step={1} format={(v) => `${v} fps`} onChange={(v) => s.update({ streamFps: v })} />
            <Slider label="Frame width sent" value={s.streamWidth} min={320} max={1280} step={160} format={(v) => `${v}px`} onChange={(v) => s.update({ streamWidth: v })} description="Smaller is faster; larger finds distant people." />
            <Slider label="JPEG quality" value={s.streamQuality} min={0.4} max={0.95} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => s.update({ streamQuality: v })} />
          </Card>

          <Card title="Hands, gestures & pose" icon={Hand} bodyClassName="space-y-3">
            <Switch label="Hand tracking" checked={s.enableHands} onChange={(v) => s.update({ enableHands: v })} />
            <Switch label="Body pose" description="Runs on alternate frames" checked={s.enablePose} onChange={(v) => s.update({ enablePose: v })} />
            <Slider label="Hand detection confidence" value={s.handConfidence} min={0.3} max={0.9} step={0.05} format={(v) => v.toFixed(2)} onChange={(v) => s.update({ handConfidence: v })} />
            <Slider label="Gesture stability window" value={s.gestureWindow} min={3} max={12} step={1} format={(v) => `${v} frames`} onChange={(v) => s.update({ gestureWindow: v })} />
            <Slider label="Gesture cooldown" value={s.gestureCooldownMs} min={200} max={2000} step={50} format={(v) => `${v} ms`} onChange={(v) => s.update({ gestureCooldownMs: v })} />
          </Card>
        </div>

        <DataManagement />
      </div>
    </div>
  );
}
