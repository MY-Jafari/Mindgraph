import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useSettingsStore,
  DEFAULT_SETTINGS,
  getAppSettings,
} from '../src/shared/stores/settingsStore';
import {
  getLinkPreview,
  FAILED_PREVIEW_TTL_MS,
} from '../src/features/mindtree/services/linkPreview';
import { db } from '../src/shared/db';

describe('Item 7: Settings Dialog & Link Preview Provider, Privacy Toggle & Failure TTL', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSettingsStore.setState({
      settings: { ...DEFAULT_SETTINGS },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with expected default settings (privacy toggle OFF by default)', () => {
    const settings = getAppSettings();
    expect(settings.linkPreviewProviderUrl).toBe('https://api.microlink.io/?url=');
    expect(settings.disableThirdPartyPreviews).toBe(false); // Default OFF
    expect(settings.defaultDialect).toBe('postgresql');
    expect(settings.namingConvention).toBe('snake_case');
  });

  it('updates settings and persists to database', async () => {
    const putSpy = vi.spyOn(db.settings, 'put').mockResolvedValue('app_settings' as any);

    await useSettingsStore.getState().updateSettings({
      defaultDialect: 'sqlite',
      namingConvention: 'camelCase',
      linkPreviewProviderUrl: 'https://proxy.example.org/api?target=',
      disableThirdPartyPreviews: true,
    });

    const updated = getAppSettings();
    expect(updated.defaultDialect).toBe('sqlite');
    expect(updated.namingConvention).toBe('camelCase');
    expect(updated.linkPreviewProviderUrl).toBe('https://proxy.example.org/api?target=');
    expect(updated.disableThirdPartyPreviews).toBe(true);
    expect(putSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'app_settings',
        value: expect.objectContaining({ defaultDialect: 'sqlite' }),
      })
    );
  });

  it('reads configured linkPreviewProviderUrl in getLinkPreview', async () => {
    const customProxy = 'https://custom-preview.local/scrape?url=';
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        linkPreviewProviderUrl: customProxy,
      },
    });

    vi.spyOn(db.linkPreviews, 'get').mockResolvedValue(undefined);
    vi.spyOn(db.linkPreviews, 'put').mockResolvedValue('ok' as any);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.startsWith(customProxy)) {
        return {
          ok: true,
          json: async () => ({
            title: 'Custom Scraped Title',
            description: 'Scraped from custom provider',
          }),
        } as any;
      }
      return { ok: false } as any;
    });

    const preview = await getLinkPreview('https://cool-site.io/article', true);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://custom-preview.local/scrape?url=https%3A%2F%2Fcool-site.io%2Farticle'),
      expect.any(Object)
    );
    expect(preview.title).toBe('Custom Scraped Title');
  });

  it('disables all third-party network requests when disableThirdPartyPreviews toggle is ON', async () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_SETTINGS,
        disableThirdPartyPreviews: true,
      },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const preview = await getLinkPreview('https://github.com/my-org/my-repo', true);

    // ZERO network calls made
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(preview.domain).toBe('github.com');
    expect(preview.title).toBe('github.com');
    expect(preview.favicon).toBeUndefined(); // Google favicon not called for privacy
  });

  it('flags failed/fallback previews with isFailed and short TTL; does not cache permanently', async () => {
    vi.spyOn(db.linkPreviews, 'get').mockResolvedValue(undefined);
    const putSpy = vi.spyOn(db.linkPreviews, 'put').mockResolvedValue('ok' as any);

    // Simulate network error/proxy failure
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network offline'));

    const before = Date.now();
    const preview = await getLinkPreview('https://unknown-domain-404.xyz', true);

    expect(preview.title).toBe('unknown-domain-404.xyz');
    expect(putSpy).toHaveBeenCalledTimes(1);

    const cachedRecord = putSpy.mock.calls[0][0];
    expect(cachedRecord.isFailed).toBe(true);
    // Expires within ~60 seconds (short TTL)
    expect(cachedRecord.expiresAt).toBeGreaterThanOrEqual(before + FAILED_PREVIEW_TTL_MS);
    expect(cachedRecord.expiresAt).toBeLessThan(before + FAILED_PREVIEW_TTL_MS + 5000);
  });

  it('re-attempts fetch when cached fallback preview has expired past its short TTL', async () => {
    const expiredRecord = {
      url: 'https://transient-failure.com',
      title: 'transient-failure.com',
      domain: 'transient-failure.com',
      updatedAt: new Date(Date.now() - 120000).toISOString(),
      isFailed: true,
      expiresAt: Date.now() - 60000, // Expired 1 min ago
    };

    vi.spyOn(db.linkPreviews, 'get').mockResolvedValue(expiredRecord);
    vi.spyOn(db.linkPreviews, 'put').mockResolvedValue('ok' as any);

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        title: 'Recovered Website Title',
        description: 'Successfully fetched after expiry',
      }),
    } as any);

    const result = await getLinkPreview('https://transient-failure.com');

    // Should NOT have returned expired fallback; re-fetched fresh metadata
    expect(fetchSpy).toHaveBeenCalled();
    expect(result.title).toBe('Recovered Website Title');
  });
});
