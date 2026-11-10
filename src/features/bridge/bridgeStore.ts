import { create } from 'zustand';
import type { BridgeActivityEntry, BridgeStatus } from '@/platform/desktop';

interface BridgeState {
  enabled: boolean;
  accessLevel: 'read-only' | 'read-and-edit';
  connectedClients: number;
  activityLog: BridgeActivityEntry[];
  activeConsentPrompt: { clientName: string; clientVersion: string; consentKey: string } | null;
  isActivityDialogOpen: boolean;

  setBridgeStatus: (status: Partial<BridgeStatus>) => void;
  addActivityEntry: (entry: BridgeActivityEntry) => void;
  clearActivityLog: () => void;
  setConsentPrompt: (prompt: { clientName: string; clientVersion: string; consentKey: string } | null) => void;
  respondConsent: (allowed: boolean) => void;
  disconnectAll: () => Promise<void>;
  setActivityDialogOpen: (open: boolean) => void;
  initBridgeListeners: () => () => void;
}

export const useBridgeStore = create<BridgeState>((set, get) => ({
  enabled: false,
  accessLevel: 'read-and-edit',
  connectedClients: 0,
  activityLog: [],
  activeConsentPrompt: null,
  isActivityDialogOpen: false,

  setBridgeStatus: (status) =>
    set((state) => ({
      ...state,
      ...status,
    })),

  addActivityEntry: (entry) =>
    set((state) => ({
      activityLog: [entry, ...state.activityLog].slice(0, 50),
    })),

  clearActivityLog: () => set({ activityLog: [] }),

  setConsentPrompt: (activeConsentPrompt) => set({ activeConsentPrompt }),

  respondConsent: (allowed: boolean) => {
    const prompt = get().activeConsentPrompt;
    if (prompt && window.mindgraphDesktop?.respondBridgeConsent) {
      window.mindgraphDesktop.respondBridgeConsent(prompt.consentKey, allowed);
    }
    set({ activeConsentPrompt: null });
  },

  disconnectAll: async () => {
    if (window.mindgraphDesktop?.disconnectAllBridgeClients) {
      await window.mindgraphDesktop.disconnectAllBridgeClients();
    }
    set({ connectedClients: 0 });
  },

  setActivityDialogOpen: (isActivityDialogOpen) => set({ isActivityDialogOpen }),

  initBridgeListeners: () => {
    if (typeof window === 'undefined' || !window.mindgraphDesktop) {
      return () => {};
    }

    // Load initial status
    if (window.mindgraphDesktop.getBridgeStatus) {
      window.mindgraphDesktop.getBridgeStatus().then((status) => {
        if (status) {
          set({
            enabled: status.enabled,
            accessLevel: status.accessLevel,
            connectedClients: status.connectedClients,
            activityLog: status.activityLog || [],
          });
        }
      }).catch(() => {});
    }

    const unsubs: Array<() => void> = [];

    if (window.mindgraphDesktop.onBridgeActivity) {
      unsubs.push(
        window.mindgraphDesktop.onBridgeActivity((entry) => {
          get().addActivityEntry(entry);
        })
      );
    }

    if (window.mindgraphDesktop.onBridgeStatusChange) {
      unsubs.push(
        window.mindgraphDesktop.onBridgeStatusChange((status) => {
          set({
            connectedClients: status.connectedClients,
            enabled: status.enabled,
          });
        })
      );
    }

    if (window.mindgraphDesktop.onBridgeConsentPrompt) {
      unsubs.push(
        window.mindgraphDesktop.onBridgeConsentPrompt((prompt) => {
          get().setConsentPrompt(prompt);
        })
      );
    }

    return () => {
      unsubs.forEach((unsub) => unsub());
    };
  },
}));
