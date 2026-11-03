const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'hr',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  's',
  'span',
  'strong',
  'u',
  'ul',
]);

const DROP_ENTIRELY = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'svg',
  'math',
  'template',
  'noscript',
  'video',
  'audio',
  'source',
  'track',
  'canvas',
]);

/** Escapes text for safe insertion into HTML text/attribute contexts. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Serializes a value so it can be safely embedded inside a <script> element. */
export function serializeForInlineScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function sanitizeUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const base = typeof window !== 'undefined' ? window.location.origin : 'https://localhost';
    const url = new URL(value, base);
    if (['http:', 'https:', 'mailto:'].includes(url.protocol)) return value;
    if (value.startsWith('#')) return value;
    return null;
  } catch {
    return null;
  }
}

function cleanElement(element: Element): void {
  const tag = element.tagName.toLowerCase();

  if (DROP_ENTIRELY.has(tag)) {
    element.remove();
    return;
  }

  for (const child of Array.from(element.children)) {
    cleanElement(child);
  }

  if (!ALLOWED_TAGS.has(tag)) {
    const parent = element.parentNode;
    if (!parent) return;
    while (element.firstChild) parent.insertBefore(element.firstChild, element);
    element.remove();
    return;
  }

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const allowed =
      tag === 'a' && (name === 'href' || name === 'title');
    if (!allowed) {
      element.removeAttribute(attribute.name);
    }
  }

  if (tag === 'a') {
    const href = element.getAttribute('href');
    const safeHref = href ? sanitizeUrl(href) : null;
    if (!safeHref) {
      element.removeAttribute('href');
    } else {
      element.setAttribute('href', safeHref);
      element.setAttribute('rel', 'noopener noreferrer nofollow');
      element.setAttribute('target', '_blank');
    }
  }
}

/**
 * Sanitizes user/imported rich text with an allowlist. Event handlers, styles,
 * scripts, iframes and non-http(s) links are removed. In environments without
 * a DOM parser (tests/SSR) it degrades to escaped plain text, which is safe.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  if (typeof DOMParser === 'undefined') return escapeHtml(html);

  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const body = parsed.body;
  for (const child of Array.from(body.children)) {
    cleanElement(child);
  }
  return body.innerHTML;
}
