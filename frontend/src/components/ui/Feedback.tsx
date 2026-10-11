import { AlertTriangle, CheckCircle2, Info, Loader2, X, type LucideIcon } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { cn } from '../../lib/format';
import { useToasts } from '../../store/toastStore';
import { Button } from './Button';

export function Stat({ label, value, unit, hint, tone, icon: Icon, className }: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'info';
  icon?: LucideIcon;
  className?: string;
}) {
  const toneClass = {
    accent: 'text-accent',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-info',
  }[tone ?? 'accent'];
  return (
    <div className={cn('panel flex flex-col gap-1 px-4 py-3.5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="label">{label}</span>
        {Icon && <Icon className={cn('size-4', toneClass, 'opacity-80')} />}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="num text-2xl font-semibold tracking-tight text-fg">{value}</span>
        {unit && <span className="text-xs text-muted">{unit}</span>}
      </div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-line bg-surface-2 text-muted">
        <Icon className="size-5" />
      </div>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-muted', className)} />;
}

export function ProgressBar({ value, className, tone = 'accent' }: { value: number; className?: string; tone?: 'accent' | 'success' | 'danger' }) {
  const color = { accent: 'bg-accent', success: 'bg-success', danger: 'bg-danger' }[tone];
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-300', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-white/[0.05]', className)} />;
}

export function Callout({ tone = 'info', title, children, action }: { tone?: 'info' | 'warning' | 'danger'; title: string; children?: ReactNode; action?: ReactNode }) {
  const styles = {
    info: 'border-info/20 bg-info/[0.06] text-info',
    warning: 'border-warning/25 bg-warning/[0.07] text-warning',
    danger: 'border-danger/25 bg-danger/[0.07] text-danger',
  }[tone];
  const Icon = tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', styles)}>
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {children && <div className="mt-0.5 text-sm text-muted">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function ConfirmDialog({ open, title, description, confirmLabel = 'Delete', onConfirm, onCancel, loading }: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid animate-fade-in place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        className="glass w-full max-w-sm animate-slide-up rounded-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 grid size-10 place-items-center rounded-xl bg-danger/10 text-danger">
          <AlertTriangle className="size-5" />
        </div>
        <h2 className="text-base font-semibold text-fg">{title}</h2>
        {description && <p className="mt-1.5 text-sm text-muted">{description}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed right-4 bottom-12 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? AlertTriangle : Info;
        const color = t.tone === 'success' ? 'text-success' : t.tone === 'error' ? 'text-danger' : 'text-info';
        return (
          <div key={t.id} role="status" className="glass pointer-events-auto flex animate-slide-up items-start gap-3 rounded-xl px-4 py-3">
            <Icon className={cn('mt-0.5 size-4 shrink-0', color)} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-fg">{t.title}</div>
              {t.description && <div className="mt-0.5 text-xs text-muted">{t.description}</div>}
            </div>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(t.id)} className="cursor-pointer text-subtle hover:text-fg">
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
