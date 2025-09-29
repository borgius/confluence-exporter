/**
 * Checksum utility for content hashing and change detection.
 * Supports multiple algorithms and provides utilities for checksum generation.
 */

import * as crypto from 'crypto';
import type { PageChecksum, ChecksumConfig } from '../models/optionalFeatures.js';

export type SupportedAlgorithm = 'sha256' | 'sha1' | 'md5';

export interface HashedContent {
  content: string;
  hash: string;
  algorithm: string;
  contentLength: number;
  timestamp: string;
}

export const DEFAULT_CHECKSUM_OPTIONS: Required<ChecksumConfig> = {
  enabled: true,
  algorithm: 'sha256',
  truncateLength: 12,
  includeMetadata: true,
};

/**
 * Generate hash for given content using specified algorithm.
 */
export function generateHash(
  content: string,
  algorithm: SupportedAlgorithm = 'sha256',
  truncateLength?: number
): string {
  if (!content) {
    throw new Error('Content cannot be empty for hash generation');
  }

  if (!['sha256', 'sha1', 'md5'].includes(algorithm)) {
    throw new Error(`Unsupported hash algorithm: ${algorithm}`);
  }

  const hash = crypto.createHash(algorithm).update(content, 'utf8').digest('hex');
  
  if (truncateLength && truncateLength > 0) {
    return hash.substring(0, truncateLength);
  }
  
  return hash;
}

/**
 * Generate checksum for page content with metadata.
 */
export function generatePageChecksum(
  pageId: string,
  content: string,
  config: Partial<ChecksumConfig> = {}
): PageChecksum {
  const opts = { ...DEFAULT_CHECKSUM_OPTIONS, ...config };
  
  if (!pageId) {
    throw new Error('Page ID is required for checksum generation');
  }

  // Prepare content for hashing
  let hashableContent = content;
  if (opts.includeMetadata) {
    // Include page ID in hash to ensure uniqueness
    hashableContent = `${pageId}:${content}`;
  }

  const checksum = generateHash(hashableContent, opts.algorithm, opts.truncateLength);

  return {
    pageId,
    checksum,
    algorithm: opts.algorithm,
    createdAt: new Date().toISOString(),
    contentLength: content.length,
    includesMetadata: opts.includeMetadata,
  };
}

/**
 * Verify if content matches the provided checksum.
 */
export function verifyChecksum(
  content: string,
  expectedChecksum: PageChecksum,
  pageId?: string
): boolean {
  try {
    let hashableContent = content;
    if (expectedChecksum.includesMetadata && pageId) {
      hashableContent = `${pageId}:${content}`;
    }

    const algorithm = expectedChecksum.algorithm as SupportedAlgorithm;
    const truncateLength = expectedChecksum.checksum.length;
    const actualChecksum = generateHash(hashableContent, algorithm, truncateLength);

    return actualChecksum === expectedChecksum.checksum;
  } catch {
    return false;
  }
}

/**
 * Generate hash for content with options.
 */
export function hashContent(
  content: string,
  options: Partial<ChecksumConfig> = {}
): HashedContent {
  const opts = { ...DEFAULT_CHECKSUM_OPTIONS, ...options };
  
  const hash = generateHash(content, opts.algorithm, opts.truncateLength);

  return {
    content,
    hash,
    algorithm: opts.algorithm,
    contentLength: content.length,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Compare two checksums for equality.
 */
export function compareChecksums(checksum1: PageChecksum, checksum2: PageChecksum): boolean {
  return (
    checksum1.pageId === checksum2.pageId &&
    checksum1.checksum === checksum2.checksum &&
    checksum1.algorithm === checksum2.algorithm
  );
}

/**
 * Validate checksum format and algorithm.
 */
export function validateChecksum(checksum: PageChecksum): boolean {
  if (!checksum.pageId || !checksum.checksum || !checksum.algorithm) {
    return false;
  }

  if (!['sha256', 'sha1', 'md5'].includes(checksum.algorithm)) {
    return false;
  }

  // Basic length validation based on algorithm
  const expectedLengths = {
    sha256: 64,
    sha1: 40,
    md5: 32,
  };

  const algorithm = checksum.algorithm as SupportedAlgorithm;
  const maxLength = expectedLengths[algorithm];
  
  // Allow truncated checksums (must be shorter than full length)
  if (checksum.checksum.length > maxLength || checksum.checksum.length < 8) {
    return false;
  }

  // Validate hex format
  const hexRegex = /^[a-f0-9]+$/i;
  return hexRegex.test(checksum.checksum);
}

/**
 * Create a stable content hash that doesn't change between runs.
 */
export function createStableHash(
  content: string,
  algorithm: SupportedAlgorithm = 'sha256'
): string {
  // Normalize content to ensure stable hashing
  const normalized = content
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\s+$/gm, '') // Remove trailing whitespace
    .trim(); // Remove leading/trailing whitespace

  return generateHash(normalized, algorithm);
}

/**
 * Batch generate checksums for multiple contents.
 */
export function generateBatchChecksums(
  contents: Array<{ pageId: string; content: string }>,
  config: Partial<ChecksumConfig> = {}
): PageChecksum[] {
  return contents.map(({ pageId, content }) =>
    generatePageChecksum(pageId, content, config)
  );
}

/**
 * Calculate checksum statistics.
 */
export function calculateChecksumStats(checksums: PageChecksum[]) {
  const algorithms = new Set(checksums.map(c => c.algorithm));
  const totalContentLength = checksums.reduce((sum, c) => sum + c.contentLength, 0);
  const averageContentLength = checksums.length > 0 ? totalContentLength / checksums.length : 0;
  
  return {
    totalChecksums: checksums.length,
    algorithms: Array.from(algorithms),
    totalContentLength,
    averageContentLength,
    oldestChecksum: checksums.length > 0 ? 
      checksums.reduce((oldest, current) => 
        current.createdAt < oldest.createdAt ? current : oldest
      ).createdAt : null,
    newestChecksum: checksums.length > 0 ?
      checksums.reduce((newest, current) => 
        current.createdAt > newest.createdAt ? current : newest
      ).createdAt : null,
  };
}
