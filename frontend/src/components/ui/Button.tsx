import { Loader2, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white shadow-[0_1px_0_rgb(255_255_255/0.2)_inset,0_8px_24px_-8px_rgb(139_123_255/0.7)] hover:bg-accent-strong',
  secondary: 'bg-surface-3 text-fg border border-line-strong hover:bg-white/[0.08]',
  ghost: 'text-muted hover:text-fg hover:bg-white/[0.06]',
  danger: 'bg-danger/12 text-danger border border-danger/25 hover:bg-danger/20',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

export function Button({ variant = 'secondary', size = 'md', icon: Icon, loading, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg font-medium whitespace-nowrap transition-colors duration-150 select-none disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        !children && (size === 'sm' ? 'w-8 px-0' : size === 'lg' ? 'w-11 px-0' : 'w-9 px-0'),
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className={size === 'sm' ? 'size-3.5' : 'size-4'} /> : null}
      {children}
    </button>
  );
}
