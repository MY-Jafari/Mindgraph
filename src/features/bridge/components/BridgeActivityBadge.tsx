import { useTranslation } from 'react-i18next';
import { Bot, Radio } from 'lucide-react';
import { useBridgeStore } from '../bridgeStore';
import { isDesktopApp } from '@/platform/fileService';

export function BridgeActivityBadge() {
  const { t } = useTranslation();
  const { enabled, connectedClients, setActivityDialogOpen } = useBridgeStore();

  if (!isDesktopApp() || !enabled) {
    return null;
  }

  const hasClients = connectedClients > 0;

  return (
    <button
      type="button"
      onClick={() => setActivityDialogOpen(true)}
      title={
        hasClients
          ? t('bridge.connectedTooltip', {
              count: connectedClients,
              defaultValue: `${connectedClients} AI Agent(s) connected`,
            })
          : t('bridge.listeningTooltip', 'AI Bridge listening for local connections')
      }
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all ${
        hasClients
          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-xs'
          : 'bg-muted/60 text-muted-foreground border border-border hover:text-foreground'
      }`}
    >
      {hasClients ? (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
      ) : (
        <Radio className="w-3.5 h-3.5 text-muted-foreground" />
      )}
      <Bot className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">
        {hasClients
          ? t('bridge.badgeActive', { count: connectedClients, defaultValue: `AI Bridge (${connectedClients})` })
          : t('bridge.badgeStandby', 'AI Bridge')}
      </span>
    </button>
  );
}
