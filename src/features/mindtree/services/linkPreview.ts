import { db, type LinkPreviewRecord } from '@/shared/db';
import { getAppSettings } from '@/shared/stores/settingsStore';

export const FAILED_PREVIEW_TTL_MS = 60 * 1000; // 1 minute TTL for failed/fallback previews
export const SUCCESS_PREVIEW_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days TTL for successful previews

export interface LinkMetadata {
  url: string;
  title: string;
  description?: string;
  image?: string;
  favicon?: string;
  domain: string;
  provider?: string;
  youtubeId?: string;
  isFailed?: boolean;
}

export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return 'link';
  }
}

export function extractYouTubeId(url: string): string | null {
  try {
    const parsed = new URL(url.startsWith('http') ? url : `https://${url}`);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.slice(1);
    }
    if (parsed.hostname.includes('youtube.com')) {
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/shorts/')[1]?.split(/[?#]/)[0] || null;
      }
      return parsed.searchParams.get('v');
    }
  } catch {
    return null;
  }
  return null;
}

export async function fetchYouTubePreview(url: string, ytId: string): Promise<LinkMetadata> {
  const domain = 'youtube.com';
  const defaultImage = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
  const defaultFavicon = 'https://www.youtube.com/s/desktop/favicon.ico';

  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (res.ok) {
      const data = await res.json();
      return {
        url,
        title: data.title || 'YouTube Video',
        description: data.author_name ? `By ${data.author_name}` : undefined,
        image: data.thumbnail_url || defaultImage,
        favicon: defaultFavicon,
        domain,
        provider: 'YouTube',
        youtubeId: ytId,
      };
    }
  } catch (err) {
    console.warn('YouTube oEmbed error, falling back to static metadata:', err);
  }

  return {
    url,
    title: 'YouTube Video',
    image: defaultImage,
    favicon: defaultFavicon,
    domain,
    provider: 'YouTube',
    youtubeId: ytId,
  };
}

export async function fetchProxyPreview(url: string, proxyUrl?: string): Promise<LinkMetadata | null> {
  const domain = extractDomain(url);
  const base = proxyUrl || 'https://api.microlink.io/?url=';
  const endpoint = base.includes('{url}')
    ? base.replace('{url}', encodeURIComponent(url))
    : `${base}${encodeURIComponent(url)}`;

  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const json = await res.json();
      const data = json.data || json;
      return {
        url,
        title: data.title || domain,
        description: data.description,
        image: data.image?.url || data.image,
        favicon: data.logo?.url || `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
        domain,
        provider: data.publisher || domain,
      };
    }
  } catch {
    // Proxy not available or network error
  }
  return null;
}

export function generateFallbackPreview(url: string, allowExternalFavicon = true): LinkMetadata {
  const domain = extractDomain(url);
  return {
    url,
    title: domain,
    domain,
    favicon: allowExternalFavicon ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64` : undefined,
    provider: domain,
    isFailed: true,
  };
}

/**
 * Main Link Preview Resolver executing the fallback chain with IndexedDB cache.
 * Respects user privacy settings, custom proxy URL, and short TTL for failures.
 */
export async function getLinkPreview(url: string, forceRefresh = false): Promise<LinkMetadata> {
  const settings = getAppSettings();

  // If user disabled all third-party previews for privacy, return local fallback without network requests
  if (settings.disableThirdPartyPreviews) {
    return generateFallbackPreview(url, false);
  }

  // 1. Check IndexedDB cache first
  if (!forceRefresh) {
    try {
      const cached = await db.linkPreviews.get(url);
      if (cached) {
        const isExpired = cached.isFailed
          ? (cached.expiresAt ? Date.now() > cached.expiresAt : true)
          : (cached.expiresAt ? Date.now() > cached.expiresAt : false);

        if (!isExpired) {
          return {
            ...cached,
            youtubeId: extractYouTubeId(url) || undefined,
          };
        }
      }
    } catch (err) {
      console.warn('Dexie link preview read error:', err);
    }
  }

  let metadata: LinkMetadata | null = null;

  // 2. Step 1: YouTube oEmbed
  const ytId = extractYouTubeId(url);
  if (ytId) {
    metadata = await fetchYouTubePreview(url, ytId);
  }

  // 3. Step 2: Proxy metadata / OpenGraph using configured provider URL
  if (!metadata) {
    const providerUrl = settings.linkPreviewProviderUrl || 'https://api.microlink.io/?url=';
    metadata = await fetchProxyPreview(url, providerUrl);
  }

  // 4. Step 3: Fallback metadata if failed
  let isFailed = false;
  if (!metadata) {
    metadata = generateFallbackPreview(url, true);
    isFailed = true;
  }

  // Save to IndexedDB cache with short TTL if failed
  const ttlMs = isFailed ? FAILED_PREVIEW_TTL_MS : SUCCESS_PREVIEW_TTL_MS;

  try {
    const record: LinkPreviewRecord = {
      url: metadata.url,
      title: metadata.title,
      description: metadata.description,
      image: metadata.image,
      favicon: metadata.favicon,
      domain: metadata.domain,
      provider: metadata.provider,
      updatedAt: new Date().toISOString(),
      isFailed,
      expiresAt: Date.now() + ttlMs,
    };
    await db.linkPreviews.put(record);
  } catch (err) {
    console.warn('Dexie link preview write error:', err);
  }

  return metadata;
}
