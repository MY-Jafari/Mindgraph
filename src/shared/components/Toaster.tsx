import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToastStore, type ToastKind } from '../stores/toastStore';
import { AlertTriangle, AlertCircle, CheckCircle, Info, X } from 'lucide-react';

const ICONS: Record<ToastKind, React.ComponentType<{ className?: string }>> = {
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle,
  info: Info,
};

const BORDER_COLORS: Record<ToastKind, string> = {
  warning: 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/80',
  error: 'border-destructive/50 text-destructive bg-destructive/10',
  success: 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80',
  info: 'border-border text-foreground bg-popover',
};

export const Toaster: React.FC = () => {
  const { t } = useTranslation();
  const { toasts, dismiss } = useToastStore();

  useEffect(() => {
    if (toasts.length === 0) return;

    // Auto-dismiss the oldest active toast after 4000ms
    const timer = setTimeout(() => {
      dismiss(toasts[0].id);
    }, 4000);

    return () => clearTimeout(timer);
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 end-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
    >
      {toasts.map((toast) => {
        const IconComponent = ICONS[toast.kind] || Info;
        const colorClasses = BORDER_COLORS[toast.kind] || BORDER_COLORS.info;
        const message = t(toast.messageKey, toast.params || {});

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-lg border shadow-lg backdrop-blur transition-all animate-in fade-in slide-in-from-bottom-2 duration-200 ${colorClasses}`}
          >
            <IconComponent className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm font-medium leading-snug">
              {message}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
