import crypto from 'crypto';

/**
 * Compute SHA-256 hex digest truncated to 12 chars for manifest hash.
 */
export function contentHash(input: string | Buffer): string {
  const h = crypto.createHash('sha256').update(input).digest('hex');
  return h.slice(0, 12);
}
