import { useTranslation } from 'react-i18next';
import { Settings, Shield, Globe, Database, Type, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { useProjectStore } from '@/features/projects/projectStore';
import type { SQLDialect, NamingConvention } from '@/features/projects/types';

export function SettingsDialog() {
  const { t } = useTranslation();
  const { settings, isSettingsOpen, closeSettings, updateSettings } = useSettingsStore();
  const { activeProject, updateProjectMeta } = useProjectStore();

  if (!isSettingsOpen) return null;

  const handleDialectChange = (dialect: SQLDialect) => {
    updateSettings({ defaultDialect: dialect });
    if (activeProject) {
      updateProjectMeta({
        settings: {
          ...activeProject.settings,
          defaultDialect: dialect,
        },
      });
    }
  };

  const handleNamingConventionChange = (convention: NamingConvention) => {
    updateSettings({ namingConvention: convention });
    if (activeProject) {
      updateProjectMeta({
        settings: {
          ...activeProject.settings,
          namingConvention: convention,
        },
      });
    }
  };

  return (
    <Dialog open={isSettingsOpen} onOpenChange={(open) => !open && closeSettings()}>
      <DialogContent className="max-w-lg bg-card border-border text-foreground p-6">
        <DialogHeader className="pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            <DialogTitle className="text-lg font-bold">
              {t('settings.title', 'Application Settings')}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-muted-foreground text-start">
            {t('settings.description', 'Configure global preferences, link preview integrations, and database defaults.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Section 1: Link Previews & Privacy */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5" />
              <span>{t('settings.linkPreviews', 'Link Previews & Privacy')}</span>
            </h4>

            {/* Privacy Toggle: Disable all third-party previews */}
            <div className="flex items-start justify-between gap-4 p-3 rounded-lg border border-border/80 bg-muted/20">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Shield className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{t('settings.disablePreviews', 'Disable Third-Party Link Previews')}</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {t(
                    'settings.privacyNote',
                    'Privacy Note: Disables all external network requests to third-party preview services (Microlink, YouTube, Google Favicons). Only local domain names will be shown to ensure strict offline privacy.'
                  )}
                </p>
              </div>
              <input
                type="checkbox"
                id="toggle-third-party"
                checked={settings.disableThirdPartyPreviews}
                onChange={(e) => updateSettings({ disableThirdPartyPreviews: e.target.checked })}
                className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
              />
            </div>

            {/* Link Preview Provider URL */}
            <div className="space-y-1.5">
              <label htmlFor="provider-url-input" className="text-xs font-medium text-foreground flex items-center justify-between">
                <span>{t('settings.providerUrl', 'Link Preview Provider URL')}</span>
                <span className="text-[10px] text-muted-foreground">e.g. Microlink or custom proxy</span>
              </label>
              <input
                id="provider-url-input"
                type="text"
                disabled={settings.disableThirdPartyPreviews}
                value={settings.linkPreviewProviderUrl}
                onChange={(e) => updateSettings({ linkPreviewProviderUrl: e.target.value })}
                placeholder="https://api.microlink.io/?url="
                className="w-full text-xs px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Section 2: Database Designer Defaults */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              <span>{t('settings.databaseDefaults', 'Database Schema Defaults')}</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Default Dialect */}
              <div className="space-y-1.5">
                <label htmlFor="default-dialect-select" className="text-xs font-medium text-foreground">
                  {t('settings.defaultDialect', 'Default SQL Dialect')}
                </label>
                <select
                  id="default-dialect-select"
                  value={settings.defaultDialect}
                  onChange={(e) => handleDialectChange(e.target.value as SQLDialect)}
                  className="w-full text-xs px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="postgresql">PostgreSQL</option>
                  <option value="mysql">MySQL</option>
                  <option value="mariadb">MariaDB</option>
                  <option value="sqlite">SQLite</option>
                  <option value="sqlserver">SQL Server</option>
                  <option value="oracle">Oracle</option>
                </select>
              </div>

              {/* Naming Convention */}
              <div className="space-y-1.5">
                <label htmlFor="naming-convention-select" className="text-xs font-medium text-foreground flex items-center gap-1">
                  <Type className="w-3.5 h-3.5" />
                  <span>{t('settings.namingConvention', 'Naming Convention')}</span>
                </label>
                <select
                  id="naming-convention-select"
                  value={settings.namingConvention}
                  onChange={(e) => handleNamingConventionChange(e.target.value as NamingConvention)}
                  className="w-full text-xs px-3 py-2 rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="snake_case">snake_case (e.g. user_id)</option>
                  <option value="camelCase">camelCase (e.g. userId)</option>
                  <option value="PascalCase">PascalCase (e.g. UserId)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-3 border-t border-border">
          <Button
            size="sm"
            onClick={closeSettings}
            className="gap-1.5 text-xs"
          >
            <Check className="w-3.5 h-3.5" />
            <span>{t('common.done', 'Done')}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
