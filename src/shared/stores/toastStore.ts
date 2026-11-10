import { create } from 'zustand';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  kind: ToastKind;
  messageKey: string;
  params?: Record<string, string | number>;
  createdAt: number;
}

export interface ToastState {
  toasts: ToastItem[];
  notify: (toast: { kind?: ToastKind; messageKey: string; params?: Record<string, string | number> }) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  notify: ({ kind = 'info', messageKey, params }) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newToast: ToastItem = {
      id,
      kind,
      messageKey,
      params,
      createdAt: Date.now(),
    };
    set((state) => ({
      toasts: [...state.toasts, newToast],
    }));
    return id;
  },
  dismiss: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
  clear: () => set({ toasts: [] }),
}));

/**
 * Convenience helper callable from stores, services, or outside React.
 */
export const notify = (options: {
  kind?: ToastKind;
  messageKey: string;
  params?: Record<string, string | number>;
}): string => {
  return useToastStore.getState().notify(options);
};
