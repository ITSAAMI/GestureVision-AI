import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Aperture, ImageUp, Lightbulb, ScanFace, ShieldCheck, Trash2, UserPlus, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useSystemStatus } from '../app/useBackend';
import { CameraStage } from '../components/camera/CameraStage';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, PageHeader } from '../components/ui/Card';
import { TextInput } from '../components/ui/Controls';
import { Callout, ConfirmDialog, EmptyState, Skeleton } from '../components/ui/Feedback';
import { useVisionDemand, visionEngine } from '../features/vision/engine';
import { api, type FaceSample } from '../lib/api';
import { formatRelative } from '../lib/format';
import { useCamera } from '../store/cameraStore';
import { toast } from '../store/toastStore';

const FACES_ONLY = { persons: false, hands: false, pose: false, trails: false };

interface Identity {
  name: string;
  samples: FaceSample[];
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function FaceRegistry() {
  useVisionDemand({ backend: true });
  const qc = useQueryClient();
  const cameraOn = useCamera((s) => s.status === 'on');
  const status = useSystemStatus(false);
  const faces = useQuery({ queryKey: ['faces'], queryFn: api.faces });
  const [name, setName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const modelsMissing = status.data && (!status.data.models.face_detection.available || !status.data.models.face_recognition.available);

  const identities = useMemo<Identity[]>(() => {
    const map = new Map<string, FaceSample[]>();
    for (const f of faces.data?.faces ?? []) map.set(f.name, [...(map.get(f.name) ?? []), f]);
    return [...map.entries()].map(([n, samples]) => ({ name: n, samples })).sort((a, b) => a.name.localeCompare(b.name));
  }, [faces.data]);

  const register = useMutation({
    mutationFn: ({ n, image }: { n: string; image: string }) => api.registerFace(n, image),
    onSuccess: (res) => {
      toast.success(`Sample added for ${res.face.name}`, `Face detected with ${Math.round(res.detection_confidence * 100)}% confidence`);
      void qc.invalidateQueries({ queryKey: ['faces'] });
      void qc.invalidateQueries({ queryKey: ['system-status'] });
    },
    onError: (err: Error) => toast.error('Could not register face', err.message),
  });

  const deleteIdentity = useMutation({
    mutationFn: api.deleteIdentity,
    onSuccess: (_, n) => {
      toast.success(`Removed ${n}`);
      setPendingDelete(null);
      void qc.invalidateQueries({ queryKey: ['faces'] });
    },
    onError: (err: Error) => toast.error('Delete failed', err.message),
  });

  const deleteSample = useMutation({
    mutationFn: api.deleteFace,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['faces'] }),
    onError: (err: Error) => toast.error('Delete failed', err.message),
  });

  const trimmed = name.trim();

  const capture = () => {
    const image = visionEngine.snapshot();
    if (!image) return toast.error('Camera frame not available yet');
    register.mutate({ n: trimmed, image });
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!trimmed) return toast.error('Enter a name first');
    register.mutate({ n: trimmed, image: await readFile(file) });
    if (fileRef.current) fileRef.current.value = '';
  };

  const existing = identities.find((i) => i.name.toLowerCase() === trimmed.toLowerCase());

  return (
    <div className="mx-auto max-w-[1400px] animate-fade-in px-6 py-6">
      <PageHeader
        title="Face Registry"
        description="Enroll people so they’re recognized by name in live detection and video analysis. Faces are aligned to a canonical template and stored as 512-d ArcFace embeddings — locally, never uploaded."
      />

      {modelsMissing && (
        <div className="mb-4">
          <Callout tone="warning" title="Face models are not installed">
            Run <code className="num rounded bg-white/10 px-1.5 py-0.5 text-xs text-fg">python scripts/download_models.py</code>, then restart the backend.
          </Callout>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card title="Enroll a face" icon={UserPlus} description="Capture 3–5 samples with slight head turns for best accuracy">
          <CameraStage layers={FACES_ONLY} />
          <div className="mt-4 flex flex-wrap gap-2">
            <TextInput
              placeholder="Person’s name"
              value={name}
              maxLength={64}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && trimmed && cameraOn && capture()}
              className="min-w-48 flex-1"
              aria-label="Name"
            />
            <Button variant="primary" icon={Aperture} disabled={!trimmed || !cameraOn} loading={register.isPending} onClick={capture}>
              Capture sample
            </Button>
            <Button icon={ImageUp} disabled={!trimmed || register.isPending} onClick={() => fileRef.current?.click()}>
              Upload photo
            </Button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => void upload(e.target.files?.[0])} />
          </div>
          {existing && (
            <p className="mt-2 text-xs text-muted">
              Adding to <span className="text-fg">{existing.name}</span> · {existing.samples.length} sample{existing.samples.length === 1 ? '' : 's'} so far
            </p>
          )}
          <div className="mt-4 grid gap-2 text-xs text-muted sm:grid-cols-2">
            <div className="flex gap-2 rounded-lg bg-white/[0.03] p-3">
              <Lightbulb className="size-4 shrink-0 text-warning" />
              Face the camera in even lighting; avoid strong backlight. Only one face should be in frame.
            </div>
            <div className="flex gap-2 rounded-lg bg-white/[0.03] p-3">
              <ShieldCheck className="size-4 shrink-0 text-success" />
              Only enroll people who have given consent. Remove anyone at any time.
            </div>
          </div>
        </Card>

        <Card title="Identities" icon={ScanFace} actions={<Badge>{identities.length}</Badge>} bodyClassName="p-3">
          {faces.isPending ? (
            <div className="grid gap-2 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-28" />)}</div>
          ) : faces.isError ? (
            <Callout tone="danger" title="Couldn’t load identities">{(faces.error as Error).message}</Callout>
          ) : identities.length === 0 ? (
            <EmptyState icon={ScanFace} title="No one enrolled yet" description="Type a name and capture a sample to create the first identity." />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {identities.map((identity) => (
                <li key={identity.name} className="group rounded-xl border border-line bg-surface-2/60 p-3">
                  <div className="flex items-center gap-3">
                    {identity.samples[0].thumbnail ? (
                      <img src={identity.samples[0].thumbnail} alt="" className="size-12 rounded-lg object-cover ring-1 ring-line-strong" />
                    ) : (
                      <span className="grid size-12 place-items-center rounded-lg bg-white/[0.05] text-muted"><ScanFace className="size-5" /></span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{identity.name}</div>
                      <div className="text-xs text-muted">
                        {identity.samples.length} sample{identity.samples.length === 1 ? '' : 's'} · {formatRelative(identity.samples[0].created_at)}
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" icon={Trash2} aria-label={`Delete ${identity.name}`} onClick={() => setPendingDelete(identity.name)} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {identity.samples.map((s) => (
                      <div key={s.id} className="relative">
                        {s.thumbnail && <img src={s.thumbnail} alt="" className="size-9 rounded-md object-cover opacity-80" />}
                        <button
                          type="button"
                          aria-label="Remove sample"
                          onClick={() => deleteSample.mutate(s.id)}
                          className="absolute -top-1 -right-1 hidden size-4 cursor-pointer place-items-center rounded-full bg-danger text-white group-hover:grid"
                        >
                          <X className="size-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Delete ${pendingDelete}?`}
        description="All face samples for this person will be permanently removed. They will no longer be recognized."
        loading={deleteIdentity.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteIdentity.mutate(pendingDelete)}
      />
    </div>
  );
}
