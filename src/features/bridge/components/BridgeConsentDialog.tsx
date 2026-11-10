import { useTranslation } from 'react-i18next';
import { ShieldCheck, Bot, Check, X } from 'lucide-react';
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

export function BridgeConsentDialog() {
  const { t } = useTranslation();
  const { activeConsentPrompt, respondConsent } = useBridgeStore();

  if (!activeConsentPrompt) return null;

  return (
    <Dialog open={true} onOpenChange={(open) => !open && respondConsent(false)}>
      <DialogContent className="max-w-md bg-card border-border text-foreground p-6">
        <DialogHeader className="pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <DialogTitle className="text-base font-bold">
              {t('bridge.consentTitle', 'AI Agent Connection Request')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground text-start pt-1">
            {t(
              'bridge.consentDesc',
              'A local AI tool or MCP client is requesting access to your active database canvas.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          <div className="p-3 rounded-lg border border-border bg-muted/30 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs font-semibold text-foreground truncate">
                {activeConsentPrompt.clientName || 'Unknown Agent'}
              </h4>
              <p className="text-[11px] text-muted-foreground truncate">
                {t('bridge.clientVersion', 'Version')}: {activeConsentPrompt.clientVersion || '1.0.0'}
              </p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            {t(
              'bridge.consentPromptText',
              'Do you want to allow this agent to read and design tables directly on your active canvas for this session?'
            )}
          </p>
        </div>

        <DialogFooter className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => respondConsent(false)}
            className="text-xs h-8 px-3 gap-1"
          >
            <X className="w-3.5 h-3.5 text-rose-500" />
            <span>{t('bridge.deny', 'Deny')}</span>
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={() => respondConsent(true)}
            className="text-xs h-8 px-3 gap-1"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t('bridge.allowSession', 'Allow for this Session')}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
