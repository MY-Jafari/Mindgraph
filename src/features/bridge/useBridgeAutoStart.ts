import { useEffect, useRef } from 'react';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { useBridgeStore } from '@/features/bridge/bridgeStore';
import { isDesktopApp } from '@/platform/fileService';
import { notify } from '@/shared/stores/toastStore';

/**
 * Automatically initializes and starts the AI Live Bridge on desktop startup
 * if the user previously enabled it in settings.
 *
 * If starting fails, notifies the user via an error toast and reverts
 * `settings.bridgeEnabled` to false so the UI stays consistent with runtime reality.
 */
export async function autoStartBridgeIfEnabled(): Promise<boolean> {
  if (!isDesktopApp() || !window.mindgraphDesktop?.setBridgeConfig) {
    return false;
  }

  const { settings, updateSettings } = useSettingsStore.getState();
  if (!settings.bridgeEnabled) {
    return false;
  }

  try {
    const status = await window.mindgraphDesktop.setBridgeConfig({
      enabled: true,
      accessLevel: settings.bridgeAccessLevel || 'read-and-edit',
    });

    if (status) {
      useBridgeStore.getState().setBridgeStatus(status);
    }

    if (!status?.enabled || status?.error) {
      const errMsg = status?.error || 'Unknown error starting bridge';
      notify({
        kind: 'error',
        messageKey: 'bridge.startFailed',
        params: { error: errMsg },
      });
      await updateSettings({ bridgeEnabled: false });
      return false;
    }

    return true;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    notify({
      kind: 'error',
      messageKey: 'bridge.startFailed',
      params: { error: errMsg },
    });
    await updateSettings({ bridgeEnabled: false });
    return false;
  }
}

/**
 * React hook that triggers auto-start once app settings have finished loading.
 */
export function useBridgeAutoStart(): void {
  const isLoading = useSettingsStore((s) => s.isLoading);
  const bridgeEnabled = useSettingsStore((s) => s.settings.bridgeEnabled);
  const bridgeAccessLevel = useSettingsStore((s) => s.settings.bridgeAccessLevel);
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (isLoading) return;
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;

    if (bridgeEnabled) {
      void autoStartBridgeIfEnabled();
    }
  }, [isLoading, bridgeEnabled, bridgeAccessLevel]);
}
