import { useTranslation } from 'react-i18next';
import { Bot, ShieldAlert, PowerOff, Trash2, Clock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { useBridgeStore } from '../bridgeStore';

export function BridgeActivityDialog() {
  const { t } = useTranslation();
  const {
    isActivityDialogOpen,
    setActivityDialogOpen,
    connectedClients,
    accessLevel,
    activityLog,
    clearActivityLog,
    disconnectAll,
  } = useBridgeStore();

  if (!isActivityDialogOpen) return null;

  const handleDisconnect = async () => {
    await disconnectAll();
  };

  return (
    <Dialog open={isActivityDialogOpen} onOpenChange={setActivityDialogOpen}>
      <DialogContent className="max-w-2xl bg-card border-border text-foreground p-6">
        <DialogHeader className="pb-3 border-b border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              <DialogTitle className="text-lg font-bold">
                {t('bridge.activityTitle', 'AI Live Bridge Activity')}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] px-2 py-0.5 rounded font-medium border ${
                  connectedClients > 0
                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    : 'bg-muted text-muted-foreground border-border'
                }`}
              >
                {connectedClients > 0
                  ? t('bridge.statusConnected', { count: connectedClients, defaultValue: `${connectedClients} Connected` })
                  : t('bridge.statusIdle', 'Idle / Listening')}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded font-medium bg-muted text-foreground border border-border">
                {accessLevel === 'read-only'
                  ? t('bridge.accessReadOnly', 'Read-Only')
                  : t('bridge.accessReadWrite', 'Read & Edit')}
              </span>
            </div>
          </div>
          <DialogDescription className="text-xs text-muted-foreground text-start pt-1">
            {t(
              'bridge.activityDesc',
              'Real-time audit log of tool calls and schema modifications received over the local named pipe.'
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Security / Prompt Injection Banner */}
        <div className="flex items-start gap-2.5 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="leading-relaxed text-[11px]">
            {t(
              'bridge.securityNotice',
              'Prompt Injection Defense: User-authored text (table names, column comments, notes) is passed to AI agents strictly as raw data. Never store sensitive credentials or confidential API keys in schema comments.'
            )}
          </p>
        </div>

        {/* Activity Log List */}
        <div className="space-y-2 py-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>{t('bridge.recentActions', 'Recent Actions (Last 50)')}</span>
            {activityLog.length > 0 && (
              <button
                type="button"
                onClick={clearActivityLog}
                className="hover:text-foreground text-[11px] flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>{t('bridge.clearLog', 'Clear Log')}</span>
              </button>
            )}
          </div>

          <div className="h-64 overflow-y-auto rounded-lg border border-border bg-muted/20 p-2 space-y-2 font-mono text-xs">
            {activityLog.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                <Clock className="w-6 h-6 opacity-40" />
                <p className="text-xs">{t('bridge.noActivityYet', 'No bridge activity recorded in this session.')}</p>
              </div>
            ) : (
              activityLog.map((entry) => (
                <div
                  key={entry.id}
                  className="p-2.5 rounded bg-background border border-border/80 flex items-start justify-between gap-3 text-[11px]"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-xs">{entry.tool}</span>
                      <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.2 rounded font-sans">
                        {entry.client}
                      </span>
                      {entry.isWrite ? (
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-primary/10 text-primary">
                          WRITE
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-muted text-muted-foreground">
                          READ
                        </span>
                      )}
                    </div>
                    <p className="text-muted-foreground truncate font-sans text-xs">{entry.summary}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer Controls: Emergency Disconnect + Close */}
        <DialogFooter className="flex items-center justify-between sm:justify-between pt-3 border-t border-border">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDisconnect}
            disabled={connectedClients === 0}
            className="text-xs h-8 gap-1.5"
          >
            <PowerOff className="w-3.5 h-3.5" />
            <span>{t('bridge.disconnectAll', 'Disconnect All / Stop AI')}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setActivityDialogOpen(false)}
            className="text-xs h-8 px-4"
          >
            {t('common.close', 'Close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
