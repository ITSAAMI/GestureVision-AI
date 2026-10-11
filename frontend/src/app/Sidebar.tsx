import { PanelLeftClose, PanelLeftOpen, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/format';
import { NAV } from './nav';

const KEY = 'gv-sidebar-collapsed';

export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="gv-logo" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9d8cff" />
          <stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="#151821" />
      <path d="M6 16c2.6-4.8 6.1-7.2 10-7.2s7.4 2.4 10 7.2c-2.6 4.8-6.1 7.2-10 7.2S8.6 20.8 6 16Z" stroke="url(#gv-logo)" strokeWidth="2" />
      <circle cx="16" cy="16" r="3.4" fill="url(#gv-logo)" />
    </svg>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1' || window.innerWidth < 1100;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, collapsed ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  }, [collapsed]);

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-line bg-surface/60 backdrop-blur-xl transition-[width] duration-200',
        collapsed ? 'w-[64px]' : 'w-[232px]',
      )}
    >
      <div className={cn('flex h-14 items-center gap-2.5 border-b border-line', collapsed ? 'justify-center px-0' : 'px-4')}>
        <Logo className="size-7 shrink-0" />
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold tracking-tight">GestureVision</div>
            <div className="text-[10px] font-medium tracking-[0.14em] text-accent uppercase">AI Workstation</div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-4">
        {NAV.map(({ group, items }) => (
          <div key={group} className="mb-5">
            {!collapsed && <div className="label mb-1.5 px-2.5">{group}</div>}
            <ul className="space-y-0.5">
              {items.map(({ path, label, icon: Icon }) => (
                <li key={path}>
                  <NavLink
                    to={path}
                    end={path === '/'}
                    title={collapsed ? label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex h-9 items-center gap-3 rounded-lg text-sm transition-colors',
                        collapsed ? 'justify-center' : 'px-2.5',
                        isActive ? 'bg-white/[0.07] text-fg' : 'text-muted hover:bg-white/[0.04] hover:text-fg',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-accent" />}
                        <Icon className={cn('size-[18px] shrink-0', isActive ? 'text-accent' : '')} />
                        {!collapsed && <span className="truncate">{label}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-line p-2.5">
        {!collapsed && (
          <div className="mb-2 flex items-start gap-2 rounded-lg bg-success/[0.06] px-2.5 py-2 text-[11px] text-muted">
            <ShieldCheck className="mt-px size-3.5 shrink-0 text-success" />
            <span>All inference runs locally on open-weight models.</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className={cn(
            'flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg text-xs text-subtle transition-colors hover:bg-white/[0.04] hover:text-fg',
            collapsed ? 'justify-center' : 'px-2.5',
          )}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}
