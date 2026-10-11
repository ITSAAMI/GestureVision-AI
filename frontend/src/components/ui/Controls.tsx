import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/format';

export function Switch({ checked, onChange, label, description, disabled }: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const toggle = (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40',
        checked ? 'border-accent/60 bg-accent' : 'border-line-strong bg-white/[0.08]',
      )}
    >
      <span className={cn('inline-block size-3.5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-[3px]')} />
    </button>
  );
  if (!label) return toggle;
  return (
    <label className={cn('flex items-center justify-between gap-4 py-1', disabled ? 'opacity-50' : 'cursor-pointer')}>
      <span className="min-w-0">
        <span className="block text-sm text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </span>
      {toggle}
    </label>
  );
}

export function Slider({ label, value, min, max, step = 0.01, onChange, format = (v) => String(v), description }: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
  description?: ReactNode;
}) {
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <label className="block py-1">
      <span className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm text-fg">{label}</span>
        <span className="num rounded-md bg-white/[0.06] px-1.5 py-0.5 text-xs text-fg">{format(value)}</span>
      </span>
      <input
        type="range"
        className="range w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ ['--fill' as string]: `${fill}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {description && <span className="mt-1.5 block text-xs text-muted">{description}</span>}
    </label>
  );
}

export function Select<T extends string>({ value, onChange, options, className, ariaLabel }: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={cn(
        'h-9 cursor-pointer rounded-lg border border-line-strong bg-surface-3 px-3 pr-8 text-sm text-fg outline-none hover:bg-white/[0.08]',
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} className="bg-surface-2">
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md' }: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode }>;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'cursor-pointer rounded-md font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
            value === o.value ? 'bg-surface-3 text-fg shadow-sm' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'h-9 w-full rounded-lg border border-line-strong bg-surface-2 px-3 text-sm text-fg outline-none placeholder:text-subtle focus:border-accent/60 focus:ring-2 focus:ring-accent/20',
        props.className,
      )}
    />
  );
}
