import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Shield, Globe, Database, Type, Check, Info, RefreshCw, Folder, Sparkles, Bot, Copy } from 'lucide-react';
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
import { isDesktopApp } from '@/platform/fileService';
import type { UpdateStatus } from '@/platform/desktop';

export function SettingsDialog() {
  const { t } = useTranslation();
  const { settings, isSettingsOpen, closeSettings, updateSettings } = useSettingsStore();
  const { activeProject, updateProjectMeta } = useProjectStore();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [mcpServerPath, setMcpServerPath] = useState('');
  const [mcpInfo, setMcpInfo] = useState<{ bundlePath: string; execPath: string; isPackaged: boolean } | null>(null);
  const [snippetMode, setSnippetMode] = useState<'app' | 'node'>('app');
  const [isTestingMcp, setIsTestingMcp] = useState(false);
  const [mcpTestResult, setMcpTestResult] = useState<{ success: boolean; toolCount?: number; error?: string } | null>(null);
  const [copiedConfig, setCopiedConfig] = useState(false);

  useEffect(() => {
    if (window.mindgraphDesktop?.getMcpInfo) {
      window.mindgraphDesktop.getMcpInfo().then((info) => {
        if (info) {
          setMcpInfo(info);
          if (info.bundlePath) setMcpServerPath(info.bundlePath);
          setSnippetMode(info.isPackaged ? 'app' : 'node');
        }
      });
    } else if (window.mindgraphDesktop?.getMcpServerPath) {
      window.mindgraphDesktop.getMcpServerPath().then((p) => {
        if (p) setMcpServerPath(p);
      });
    }
  }, []);

  useEffect(() => {
    if (!isDesktopApp() || !window.mindgraphDesktop?.onUpdateStatus) return;
    const unsub = window.mindgraphDesktop.onUpdateStatus((status) => {
      setUpdateStatus(status);
      if (status.status !== 'checking') {
        setIsCheckingUpdate(false);
      }
    });
    return unsub;
  }, []);

  const handleCheckForUpdates = async () => {
    if (!window.mindgraphDesktop?.checkForUpdates) return;
    setIsCheckingUpdate(true);
    setUpdateStatus({ status: 'checking' });
    try {
      await window.mindgraphDesktop.checkForUpdates();
    } catch (e) {
      setIsCheckingUpdate(false);
      setUpdateStatus({ status: 'error', message: e instanceof Error ? e.message : 'Check failed' });
    }
  };

  const handleOpenBackupFolder = async () => {
    if (!window.mindgraphDesktop?.openBackupFolder) return;
    await window.mindgraphDesktop.openBackupFolder();
  };

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

  const defaultWorkspace = 'C:\\Users\\user\\Documents\\Mindgraph';
  const workspaceDir = settings.mcpWorkspaceFolder || defaultWorkspace;
  const serverPath = mcpServerPath || mcpInfo?.bundlePath || 'C:\\path\\to\\mcp\\dist\\mindgraph-mcp.mjs';
  const execCommand = mcpInfo?.execPath && snippetMode === 'app' ? mcpInfo.execPath : 'node';
  const snippetEnv: Record<string, string> =
    snippetMode === 'app' && mcpInfo?.isPackaged
      ? { ELECTRON_RUN_AS_NODE: '1', MINDGRAPH_WORKSPACE: workspaceDir }
      : { MINDGRAPH_WORKSPACE: workspaceDir };

  const mcpConfigSnippet = JSON.stringify(
    {
      mcpServers: {
        mindgraph: {
          command: execCommand,
          args: [serverPath],
          env: snippetEnv,
        },
      },
    },
    null,
    2
  );

  const handleTestMcpConnection = async () => {
    if (!window.mindgraphDesktop?.testMcpConnection) return;
    setIsTestingMcp(true);
    setMcpTestResult(null);
    try {
      const res = await window.mindgraphDesktop.testMcpConnection(workspaceDir);
      setIsTestingMcp(false);
      setMcpTestResult(res);
    } catch (err) {
      setIsTestingMcp(false);
      setMcpTestResult({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  };

  const handleCopyMcpConfig = async () => {
    try {
      await navigator.clipboard.writeText(mcpConfigSnippet);
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    } catch {}
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

            {activeProject && (
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    closeSettings();
                    useSettingsStore.getState().openDesignGuidelines();
                  }}
                  className="w-full text-xs h-8 gap-2 border-primary/30 text-primary hover:bg-primary/10"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{t('guidelines.openGuidelines', 'Edit AI Design Guidelines')}</span>
                </Button>
              </div>
            )}
          </div>

          {/* Section 3: Connect an AI Agent (MCP) */}
          <div className="space-y-3 pt-2 border-t border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-primary" />
              <span>{t('settings.connectAgent', 'Connect an AI Agent (MCP)')}</span>
            </h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t(
                'settings.connectAgentDesc',
                'Configure Claude Desktop, Cursor, or Antigravity to design schemas directly via MCP.'
              )}
            </p>

            <div className="space-y-3 p-3 rounded-lg border border-border/80 bg-muted/20 text-xs">
              {/* Workspace folder input */}
              <div className="space-y-1">
                <label className="font-semibold text-foreground block">
                  {t('settings.mcpWorkspace', 'Workspace Directory (MINDGRAPH_WORKSPACE)')}
                </label>
                <input
                  type="text"
                  value={settings.mcpWorkspaceFolder || ''}
                  onChange={(e) => updateSettings({ mcpWorkspaceFolder: e.target.value })}
                  placeholder={defaultWorkspace}
                  className="w-full text-xs px-2.5 py-1.5 rounded-md border border-border bg-background focus:ring-2 focus:ring-primary font-mono"
                />
              </div>

              {/* MCP Server Path */}
              <div className="space-y-1">
                <label className="font-semibold text-foreground block">
                  {t('settings.mcpServerPath', 'MCP Server Bundle Path')}
                </label>
                <div className="px-2.5 py-1.5 rounded-md border border-border bg-background font-mono text-[11px] text-muted-foreground select-all truncate">
                  {mcpServerPath || 'mcp/dist/mindgraph-mcp.mjs'}
                </div>
              </div>

              {/* Launch Mode Toggle */}
              <div className="flex items-center justify-between text-xs pt-0.5">
                <span className="font-semibold text-foreground text-xs">
                  {t('settings.mcpModeLabel', 'Launch Mode')}
                </span>
                <div className="flex rounded-md bg-muted/50 p-0.5 border border-border text-[11px]">
                  <button
                    type="button"
                    onClick={() => setSnippetMode('app')}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${
                      snippetMode === 'app'
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('settings.mcpModeApp', 'Mindgraph.exe (Zero Setup)')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setSnippetMode('node')}
                    className={`px-2 py-0.5 rounded font-medium transition-colors ${
                      snippetMode === 'node'
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t('settings.mcpModeNode', 'Node.js (node >= 20)')}
                  </button>
                </div>
              </div>

              {/* Ready to copy client config */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">
                    {t('settings.configSnippet', 'Client Configuration Snippet (JSON)')}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCopyMcpConfig}
                    className="h-6 px-2 text-[10px] gap-1"
                  >
                    {copiedConfig ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    <span>{t('settings.copyConfig', 'Copy Configuration')}</span>
                  </Button>
                </div>
                <pre className="p-2.5 rounded bg-background border border-border text-[11px] font-mono overflow-x-auto text-foreground select-all leading-relaxed">
                  {mcpConfigSnippet}
                </pre>
              </div>

              {/* Test Connection Button */}
              {isDesktopApp() && (
                <div className="flex items-center justify-between pt-1">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleTestMcpConnection}
                    disabled={isTestingMcp}
                    className="text-xs h-7 px-3 gap-1.5"
                  >
                    <RefreshCw className={`w-3 h-3 ${isTestingMcp ? 'animate-spin' : ''}`} />
                    <span>
                      {isTestingMcp
                        ? t('settings.testingConnection', 'Testing...')
                        : t('settings.testConnection', 'Test Connection')}
                    </span>
                  </Button>

                  {mcpTestResult && (
                    <div className="text-[11px]">
                      {mcpTestResult.success ? (
                        <span className="text-emerald-500 font-semibold flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" />
                          <span>
                            {t('settings.testSuccess', {
                              count: mcpTestResult.toolCount,
                              defaultValue: `Connected! (${mcpTestResult.toolCount} tools available)`,
                            })}
                          </span>
                        </span>
                      ) : (
                        <span className="text-rose-500 font-semibold truncate max-w-xs block">
                          {t('settings.testFailed', {
                            error: mcpTestResult.error,
                            defaultValue: `Failed: ${mcpTestResult.error}`,
                          })}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Section 3: About Application & Desktop Controls */}
          <div className="space-y-3 pt-2 border-t border-border">
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              <span>{t('settings.about', 'About Mindgraph')}</span>
            </h4>
            <div className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-muted/20 text-xs">
              <span className="text-muted-foreground">{t('settings.version', 'Version')}</span>
              <span className="font-mono font-semibold text-foreground">
                v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0'}
              </span>
            </div>

            {isDesktopApp() && (
              <div className="space-y-2 pt-1">
                {/* Auto Updater Actions */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-muted/20 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-medium text-foreground block">
                      {t('settings.checkForUpdates', 'Check for Updates')}
                    </span>
                    {updateStatus && (
                      <span className="text-[11px] text-muted-foreground block">
                        {updateStatus.status === 'checking' && t('settings.checkingForUpdates', 'Checking for updates...')}
                        {updateStatus.status === 'not-available' && t('settings.upToDate', 'Mindgraph is up to date.')}
                        {updateStatus.status === 'available' && t('settings.updateAvailable', { version: updateStatus.version, defaultValue: `Update v${updateStatus.version} available...` })}
                        {updateStatus.status === 'downloading' && t('settings.updateDownloading', { percent: updateStatus.percent, defaultValue: `Downloading (${updateStatus.percent}%)...` })}
                        {updateStatus.status === 'downloaded' && t('settings.updateDownloaded', { version: updateStatus.version, defaultValue: `Update v${updateStatus.version} downloaded.` })}
                        {updateStatus.status === 'error' && t('settings.updateError', { message: updateStatus.message, defaultValue: `Error: ${updateStatus.message}` })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {updateStatus?.status === 'downloaded' ? (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => window.mindgraphDesktop?.quitAndInstall()}
                        className="text-xs h-7 px-2.5"
                      >
                        {t('settings.restartNow', 'Restart Now')}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCheckForUpdates}
                        disabled={isCheckingUpdate}
                        className="text-xs h-7 px-2.5 gap-1.5"
                      >
                        <RefreshCw className={`w-3 h-3 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                        <span>{t('settings.checkForUpdates', 'Check')}</span>
                      </Button>
                    )}
                  </div>
                </div>

                {/* Local Backups Folder */}
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/80 bg-muted/20 text-xs">
                  <div>
                    <span className="font-medium text-foreground block">
                      {t('settings.localBackups', 'Local Backups')}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      %APPDATA%\Mindgraph\backups
                    </span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleOpenBackupFolder}
                    className="text-xs h-7 px-2.5 gap-1.5"
                  >
                    <Folder className="w-3.5 h-3.5" />
                    <span>{t('settings.openBackupFolder', 'Open Folder')}</span>
                  </Button>
                </div>
              </div>
            )}
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
