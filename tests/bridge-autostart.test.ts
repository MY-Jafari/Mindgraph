import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import {
  autoStartBridgeIfEnabled,
  useBridgeAutoStart,
} from '../src/features/bridge/useBridgeAutoStart';
import { useSettingsStore, DEFAULT_SETTINGS } from '../src/shared/stores/settingsStore';
import { useBridgeStore } from '../src/features/bridge/bridgeStore';
import { useToastStore } from '../src/shared/stores/toastStore';
import { db } from '../src/shared/db';
import fs from 'node:fs';
import path from 'node:path';

describe('AI Live Bridge Auto-Start on Desktop Startup', () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const originalIS_REACT_ACT_ENVIRONMENT = (globalThis as any).IS_REACT_ACT_ENVIRONMENT;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(db.settings, 'put').mockResolvedValue('app_settings' as any);
    useToastStore.getState().clear();

    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        bridgeEnabled: true,
        bridgeAccessLevel: 'read-and-edit',
      },
      isLoading: false,
    });

    useBridgeStore.setState({
      enabled: false,
      accessLevel: 'read-and-edit',
      connectedClients: 0,
      activityLog: [],
      activeConsentPrompt: null,
      isActivityDialogOpen: false,
    });
  });

  afterEach(() => {
    globalThis.window = originalWindow;
    globalThis.document = originalDocument;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = originalIS_REACT_ACT_ENVIRONMENT;
  });

  it('calls setBridgeConfig with enabled: true and accessLevel when desktop and bridgeEnabled is true', async () => {
    const setBridgeConfigSpy = vi.fn().mockResolvedValue({
      enabled: true,
      accessLevel: 'read-and-edit',
      connectedClients: 0,
    });

    (globalThis as any).window = {
      mindgraphDesktop: {
        isDesktop: true,
        setBridgeConfig: setBridgeConfigSpy,
      },
    };

    const success = await autoStartBridgeIfEnabled();

    expect(success).toBe(true);
    expect(setBridgeConfigSpy).toHaveBeenCalledTimes(1);
    expect(setBridgeConfigSpy).toHaveBeenCalledWith({
      enabled: true,
      accessLevel: 'read-and-edit',
    });
    expect(useBridgeStore.getState().enabled).toBe(true);
    expect(useSettingsStore.getState().settings.bridgeEnabled).toBe(true);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('notifies error toast and reverts settings.bridgeEnabled to false if setBridgeConfig fails', async () => {
    const setBridgeConfigSpy = vi.fn().mockResolvedValue({
      enabled: false,
      accessLevel: 'read-and-edit',
      connectedClients: 0,
      error: 'Listen EADDRINUSE: pipe already in use',
    });

    (globalThis as any).window = {
      mindgraphDesktop: {
        isDesktop: true,
        setBridgeConfig: setBridgeConfigSpy,
      },
    };

    const success = await autoStartBridgeIfEnabled();

    expect(success).toBe(false);
    expect(setBridgeConfigSpy).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().settings.bridgeEnabled).toBe(false);

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].kind).toBe('error');
    expect(toasts[0].messageKey).toBe('bridge.startFailed');
    expect(toasts[0].params?.error).toBe('Listen EADDRINUSE: pipe already in use');
  });

  it('notifies error toast and reverts settings.bridgeEnabled to false if setBridgeConfig throws', async () => {
    const setBridgeConfigSpy = vi.fn().mockRejectedValue(new Error('IPC channel crashed'));

    (globalThis as any).window = {
      mindgraphDesktop: {
        isDesktop: true,
        setBridgeConfig: setBridgeConfigSpy,
      },
    };

    const success = await autoStartBridgeIfEnabled();

    expect(success).toBe(false);
    expect(setBridgeConfigSpy).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().settings.bridgeEnabled).toBe(false);

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].kind).toBe('error');
    expect(toasts[0].messageKey).toBe('bridge.startFailed');
    expect(toasts[0].params?.error).toBe('IPC channel crashed');
  });

  it('does NOT call setBridgeConfig when bridgeEnabled is false', async () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        bridgeEnabled: false,
      },
      isLoading: false,
    });

    const setBridgeConfigSpy = vi.fn();
    (globalThis as any).window = {
      mindgraphDesktop: {
        isDesktop: true,
        setBridgeConfig: setBridgeConfigSpy,
      },
    };

    const success = await autoStartBridgeIfEnabled();

    expect(success).toBe(false);
    expect(setBridgeConfigSpy).not.toHaveBeenCalled();
  });

  it('does NOT call setBridgeConfig in web browser mode (isDesktopApp() is false)', async () => {
    const setBridgeConfigSpy = vi.fn();
    (globalThis as any).window = {
      // isDesktop missing or false
      mindgraphDesktop: undefined,
    };

    const success = await autoStartBridgeIfEnabled();

    expect(success).toBe(false);
    expect(setBridgeConfigSpy).not.toHaveBeenCalled();
  });

  it('invokes setBridgeConfig after React component mounts with bridgeEnabled=true', async () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

    const setBridgeConfigSpy = vi.fn().mockResolvedValue({
      enabled: true,
      accessLevel: 'read-and-edit',
      connectedClients: 0,
    });

    // Setup minimal DOM mocks required by React 18 createRoot in Node test runner
    class MockElement {
      nodeType = 1;
      tagName = 'DIV';
      childNodes: any[] = [];
      style = {};
      ownerDocument: any;
      constructor() {
        this.ownerDocument = (globalThis as any).document;
      }
      appendChild(child: any) {
        this.childNodes.push(child);
        return child;
      }
      removeChild(child: any) {
        this.childNodes = this.childNodes.filter((c) => c !== child);
        return child;
      }
      insertBefore(child: any) {
        this.childNodes.push(child);
        return child;
      }
      addEventListener() {}
      removeEventListener() {}
      setAttribute() {}
      removeAttribute() {}
      getAttribute() { return null; }
    }

    const mockDoc: any = {
      nodeType: 9,
      createElement: () => new MockElement(),
      createTextNode: (text: string) => ({ nodeType: 3, nodeValue: text }),
      createComment: () => ({ nodeType: 8 }),
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const mockWin: any = {
      document: mockDoc,
      HTMLElement: MockElement,
      HTMLIFrameElement: class {},
      addEventListener: () => {},
      removeEventListener: () => {},
      mindgraphDesktop: {
        isDesktop: true,
        setBridgeConfig: setBridgeConfigSpy,
      },
    };

    mockDoc.defaultView = mockWin;
    (globalThis as any).window = mockWin;
    (globalThis as any).document = mockDoc;

    function TestAutoStartConsumer() {
      useBridgeAutoStart();
      return null;
    }

    const container = new MockElement();
    const root = createRoot(container as any);

    await (React as any).act(async () => {
      root.render(React.createElement(TestAutoStartConsumer));
    });

    // Allow promise tick in autoStartBridgeIfEnabled
    await new Promise((r) => setTimeout(r, 10));

    expect(setBridgeConfigSpy).toHaveBeenCalledTimes(1);
    expect(setBridgeConfigSpy).toHaveBeenCalledWith({
      enabled: true,
      accessLevel: 'read-and-edit',
    });

    await (React as any).act(async () => {
      root.unmount();
    });
  });

  it('verifies electron/main.cjs defaults consent prompt timeout to DENY (false)', () => {
    const mainCjsPath = path.resolve(__dirname, '../electron/main.cjs');
    const content = fs.readFileSync(mainCjsPath, 'utf-8');

    // Make sure setTimeout resolve(false) is present for the consent fallback
    expect(content).toContain('setTimeout(() => resolve(false), 15000)');
    // Make sure setTimeout resolve(true) is NOT present
    expect(content).not.toContain('setTimeout(() => resolve(true), 15000)');
  });
});
