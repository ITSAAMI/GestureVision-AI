import type { ReactNode } from 'react';
import { cn } from '../../lib/format';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent' | 'info';

const TONES: Record<Tone, string> = {
  neutral: 'bg-white/[0.06] text-muted border-white/[0.08]',
  success: 'bg-success/10 text-success border-success/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  danger: 'bg-danger/10 text-danger border-danger/20',
  accent: 'bg-accent-soft text-accent border-accent/25',
  info: 'bg-info/10 text-info border-info/20',
};

const DOTS: Record<Tone, string> = {
  neutral: 'bg-subtle',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  accent: 'bg-accent',
  info: 'bg-info',
};

export function Badge({ tone = 'neutral', dot, pulse, children, className }: { tone?: Tone; dot?: boolean; pulse?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-medium whitespace-nowrap', TONES[tone], className)}>
      {dot && <StatusDot tone={tone} pulse={pulse} />}
      {children}
    </span>
  );
}

export function StatusDot({ tone = 'neutral', pulse, className }: { tone?: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex size-1.5 shrink-0', className)}>
      {pulse && <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-60', DOTS[tone])} />}
      <span className={cn('relative inline-flex size-1.5 rounded-full', DOTS[tone])} />
    </span>
  );
}
