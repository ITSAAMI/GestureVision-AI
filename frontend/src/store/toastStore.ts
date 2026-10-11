import { create } from 'zustand';

export type ToastTone = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastStore {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  push(toast) {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-3), { ...toast, id }] });
    window.setTimeout(() => get().dismiss(id), toast.tone === 'error' ? 6000 : 3500);
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = {
  success: (title: string, description?: string) => useToasts.getState().push({ tone: 'success', title, description }),
  error: (title: string, description?: string) => useToasts.getState().push({ tone: 'error', title, description }),
  info: (title: string, description?: string) => useToasts.getState().push({ tone: 'info', title, description }),
};
