// Escape only necessary characters; avoid unnecessary escapes flagged by ESLint
const PUNCTUATION_REGEX = /["'`’“”‘.,!?;:()[\]{}<>]/g; // punctuation chars including brackets
const WHITESPACE_REGEX = /\s+/g;

export interface SlugifyOptions {
  maxLength?: number;
}

/**
 * Generate a filesystem-friendly slug from a Confluence page title.
 * Rules (from spec & tasks):
 * - Lowercase
 * - Trim outer whitespace
 * - Replace internal whitespace runs with single '-'
 * - Remove punctuation characters
 * - Collapse multiple '-' to single '-'
 * - Trim leading/trailing '-'
 * - Optionally truncate to maxLength preserving word boundary when possible
 */
export function slugify(title: string, opts: SlugifyOptions = {}): string {
  const maxLength = opts.maxLength ?? 80;
  let s = title.normalize('NFKD').toLowerCase().trim();
  s = s.replace(PUNCTUATION_REGEX, '');
  s = s.replace(WHITESPACE_REGEX, '-');
  s = s.replace(/-+/g, '-');
  s = s.replace(/^-+|-+$/g, '');
  if (s.length > maxLength) {
    // attempt to cut at last '-' before maxLength - 10% buffer
    const hardLimit = maxLength;
    const softLimit = Math.floor(hardLimit * 0.95);
    const cutIndex = s.lastIndexOf('-', softLimit);
    if (cutIndex > 20) {
      s = s.slice(0, cutIndex);
    } else {
      s = s.slice(0, hardLimit);
    }
  }
  return s || 'untitled';
}

/**
 * Resolve collisions by appending short id fragment; ensure uniqueness within provided set.
 * Example: given base slug 'introduction' and id '123456', produces 'introduction-123456' if collision.
 */
export function resolveSlugCollision(base: string, id: string, existing: Set<string>): string {
  if (!existing.has(base)) {
    existing.add(base);
    return base;
  }
  const frag = id.slice(-4);
  let candidate = `${base}-${frag}`;
  let counter = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${frag}-${counter++}`;
  }
  existing.add(candidate);
  return candidate;
}
