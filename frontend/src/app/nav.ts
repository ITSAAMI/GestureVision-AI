import {
  Activity,
  Film,
  Hand,
  History,
  LayoutDashboard,
  ScanEye,
  ScanFace,
  Settings2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  description: string;
}

export const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: 'Workspace',
    items: [
      { path: '/', label: 'Overview', icon: LayoutDashboard, description: 'System readiness and recent activity' },
      { path: '/live', label: 'Live Detection', icon: ScanEye, description: 'Real-time people, faces, hands and pose' },
      { path: '/particles', label: 'Particle Studio', icon: Sparkles, description: 'Gesture-controlled 3D particle field' },
      { path: '/gestures', label: 'Gesture Lab', icon: Hand, description: 'Test and tune hand gesture recognition' },
    ],
  },
  {
    group: 'Data',
    items: [
      { path: '/faces', label: 'Face Registry', icon: ScanFace, description: 'Enroll identities for recognition' },
      { path: '/video', label: 'Video Analysis', icon: Film, description: 'Analyze recorded footage offline' },
      { path: '/sessions', label: 'Sessions', icon: History, description: 'History of live detection sessions' },
    ],
  },
  {
    group: 'System',
    items: [
      { path: '/system', label: 'System Health', icon: Activity, description: 'Models, resources and diagnostics' },
      { path: '/settings', label: 'Settings', icon: Settings2, description: 'Detection, camera and gesture preferences' },
    ],
  },
];

export const NAV_ITEMS = NAV.flatMap((g) => g.items);

export function findNavItem(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find((i) => (i.path === '/' ? pathname === '/' : pathname.startsWith(i.path)));
}
