/**
 * Models for optional features like allow-failures flag and checksum utilities.
 * These extend the core export functionality with additional capabilities.
 */

export interface AllowFailuresConfig {
  enabled: boolean;
  pageFailureThreshold?: number;
  attachmentFailureThreshold?: number;
  restrictedPagesAllowed: boolean;
  continueOnError: boolean;
}

export interface ChecksumConfig {
  enabled: boolean;
  algorithm: 'sha256' | 'sha1' | 'md5';
  truncateLength?: number;
  includeMetadata: boolean;
}

export interface PageChecksum {
  pageId: string;
  checksum: string;
  algorithm: string;
  createdAt: string;
  contentLength: number;
  includesMetadata: boolean;
}

export interface ChecksumManifest {
  version: string;
  createdAt: string;
  algorithm: string;
  pageChecksums: PageChecksum[];
  totalPages: number;
  totalContentLength: number;
}

export interface FailureThresholds {
  maxPageFailures: number;
  maxAttachmentFailures: number;
  maxAttachmentFailurePercentage: number;
  allowRestrictedPages: boolean;
}

export interface ExportFailureStats {
  pageFailures: number;
  attachmentFailures: number;
  restrictedPages: number;
  totalPages: number;
  totalAttachments: number;
  failureReasons: Record<string, number>;
}

export interface OptionalFeatures {
  allowFailures: AllowFailuresConfig;
  checksums: ChecksumConfig;
  thresholds: FailureThresholds;
}

// Default configurations
export const DEFAULT_ALLOW_FAILURES_CONFIG: AllowFailuresConfig = {
  enabled: false,
  pageFailureThreshold: 0,
  attachmentFailureThreshold: 25,
  restrictedPagesAllowed: true,
  continueOnError: false,
};

export const DEFAULT_CHECKSUM_CONFIG: ChecksumConfig = {
  enabled: false,
  algorithm: 'sha256',
  truncateLength: 12,
  includeMetadata: true,
};

export const DEFAULT_FAILURE_THRESHOLDS: FailureThresholds = {
  maxPageFailures: 0,
  maxAttachmentFailures: 25,
  maxAttachmentFailurePercentage: 20,
  allowRestrictedPages: true,
};

export const DEFAULT_OPTIONAL_FEATURES: OptionalFeatures = {
  allowFailures: DEFAULT_ALLOW_FAILURES_CONFIG,
  checksums: DEFAULT_CHECKSUM_CONFIG,
  thresholds: DEFAULT_FAILURE_THRESHOLDS,
};

// Utility functions
export function createPageChecksum(
  pageId: string,
  content: string,
  algorithm: string = 'sha256',
  includeMetadata: boolean = true
): Omit<PageChecksum, 'checksum'> {
  return {
    pageId,
    algorithm,
    createdAt: new Date().toISOString(),
    contentLength: content.length,
    includesMetadata: includeMetadata,
  };
}

export function createChecksumManifest(
  pageChecksums: PageChecksum[],
  algorithm: string = 'sha256'
): ChecksumManifest {
  return {
    version: '1.0',
    createdAt: new Date().toISOString(),
    algorithm,
    pageChecksums,
    totalPages: pageChecksums.length,
    totalContentLength: pageChecksums.reduce((sum, p) => sum + p.contentLength, 0),
  };
}

export function shouldAllowFailure(
  stats: ExportFailureStats,
  thresholds: FailureThresholds
): boolean {
  // Check page failure threshold
  if (stats.pageFailures > thresholds.maxPageFailures) {
    return false;
  }

  // Check attachment failure thresholds
  if (stats.attachmentFailures > thresholds.maxAttachmentFailures) {
    return false;
  }

  // Check attachment failure percentage
  if (stats.totalAttachments > 0) {
    const failurePercentage = (stats.attachmentFailures / stats.totalAttachments) * 100;
    if (failurePercentage > thresholds.maxAttachmentFailurePercentage) {
      return false;
    }
  }

  return true;
}

export function createFailureStats(): ExportFailureStats {
  return {
    pageFailures: 0,
    attachmentFailures: 0,
    restrictedPages: 0,
    totalPages: 0,
    totalAttachments: 0,
    failureReasons: {},
  };
}

export function updateFailureStats(
  stats: ExportFailureStats,
  type: 'page' | 'attachment' | 'restricted',
  reason?: string
): ExportFailureStats {
  const updated = { ...stats };

  switch (type) {
    case 'page':
      updated.pageFailures++;
      break;
    case 'attachment':
      updated.attachmentFailures++;
      break;
    case 'restricted':
      updated.restrictedPages++;
      break;
  }

  if (reason) {
    updated.failureReasons[reason] = (updated.failureReasons[reason] || 0) + 1;
  }

  return updated;
}
