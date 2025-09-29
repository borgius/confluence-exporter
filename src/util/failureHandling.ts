/**
 * Utility for processing allow-failures flag and managing export failure thresholds.
 * Handles page failures, attachment failures, and restricted page access.
 */

import type { 
  AllowFailuresConfig, 
  FailureThresholds, 
  ExportFailureStats 
} from '../models/optionalFeatures.js';

export type FailureType = 'page' | 'attachment' | 'restricted';

export interface FailureContext {
  pageId?: string;
  attachmentId?: string;
  filePath?: string;
  reason: string;
  timestamp: string;
  retryCount?: number;
}

export interface FailureDecision {
  shouldContinue: boolean;
  shouldRetry: boolean;
  exitCode: number;
  message: string;
}

export const DEFAULT_FAILURE_CONFIG: Required<AllowFailuresConfig> = {
  enabled: false,
  pageFailureThreshold: 0,
  attachmentFailureThreshold: 25,
  restrictedPagesAllowed: true,
  continueOnError: false,
};

/**
 * Determines whether to continue export based on failure statistics and configuration.
 */
export function shouldContinueExport(
  stats: ExportFailureStats,
  config: AllowFailuresConfig,
  thresholds: FailureThresholds
): FailureDecision {
  // Check individual failure conditions
  const pageFailureCheck = checkPageFailures(stats, config, thresholds);
  if (!pageFailureCheck.shouldContinue) {
    return pageFailureCheck;
  }

  const attachmentFailureCheck = checkAttachmentFailures(stats, config, thresholds);
  if (!attachmentFailureCheck.shouldContinue) {
    return attachmentFailureCheck;
  }

  const restrictedPageCheck = checkRestrictedPages(stats, config);
  if (!restrictedPageCheck.shouldContinue) {
    return restrictedPageCheck;
  }

  return {
    shouldContinue: true,
    shouldRetry: false,
    exitCode: 0,
    message: 'Export can continue',
  };
}

function checkPageFailures(
  stats: ExportFailureStats,
  config: AllowFailuresConfig,
  thresholds: FailureThresholds
): FailureDecision {
  // If allow-failures is disabled, fail on any page failure
  if (!config.enabled && stats.pageFailures > 0) {
    return {
      shouldContinue: false,
      shouldRetry: false,
      exitCode: 1,
      message: `Export failed: ${stats.pageFailures} page(s) failed and allow-failures is disabled`,
    };
  }

  // Check page failure threshold
  const pageThreshold = config.pageFailureThreshold ?? thresholds.maxPageFailures;
  if (stats.pageFailures > pageThreshold) {
    return {
      shouldContinue: false,
      shouldRetry: false,
      exitCode: 1,
      message: `Export failed: ${stats.pageFailures} page failures exceeded threshold of ${pageThreshold}`,
    };
  }

  return { shouldContinue: true, shouldRetry: false, exitCode: 0, message: '' };
}

function checkAttachmentFailures(
  stats: ExportFailureStats,
  config: AllowFailuresConfig,
  thresholds: FailureThresholds
): FailureDecision {
  // Check attachment failure thresholds
  const attachmentThreshold = config.attachmentFailureThreshold ?? thresholds.maxAttachmentFailures;
  if (stats.attachmentFailures > attachmentThreshold) {
    return {
      shouldContinue: false,
      shouldRetry: false,
      exitCode: 1,
      message: `Export failed: ${stats.attachmentFailures} attachment failures exceeded threshold of ${attachmentThreshold}`,
    };
  }

  // Check attachment failure percentage
  if (stats.totalAttachments > 0) {
    const failurePercentage = (stats.attachmentFailures / stats.totalAttachments) * 100;
    if (failurePercentage > thresholds.maxAttachmentFailurePercentage) {
      return {
        shouldContinue: false,
        shouldRetry: false,
        exitCode: 1,
        message: `Export failed: ${failurePercentage.toFixed(1)}% attachment failure rate exceeded threshold of ${thresholds.maxAttachmentFailurePercentage}%`,
      };
    }
  }

  return { shouldContinue: true, shouldRetry: false, exitCode: 0, message: '' };
}

function checkRestrictedPages(
  stats: ExportFailureStats,
  config: AllowFailuresConfig
): FailureDecision {
  // Check restricted pages if not allowed
  if (!config.restrictedPagesAllowed && stats.restrictedPages > 0) {
    return {
      shouldContinue: false,
      shouldRetry: false,
      exitCode: 1,
      message: `Export failed: ${stats.restrictedPages} restricted pages encountered and not allowed`,
    };
  }

  return { shouldContinue: true, shouldRetry: false, exitCode: 0, message: '' };
}

/**
 * Records a failure and updates statistics.
 */
export function recordFailure(
  stats: ExportFailureStats,
  type: FailureType,
  context: FailureContext
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

  // Record failure reason
  const reason = context.reason;
  updated.failureReasons[reason] = (updated.failureReasons[reason] || 0) + 1;

  return updated;
}

/**
 * Determines if a specific error should trigger a retry.
 */
export function shouldRetryFailure(
  _type: FailureType,
  context: FailureContext,
  config: AllowFailuresConfig
): boolean {
  // Don't retry if continue on error is disabled
  if (!config.continueOnError) {
    return false;
  }

  // Retry logic based on failure type and reason
  const retryableReasons = [
    'network_timeout',
    'rate_limited',
    'server_error',
    'temporary_unavailable',
  ];

  const isRetryable = retryableReasons.some(reason => 
    context.reason.toLowerCase().includes(reason)
  );

  // Limit retry attempts
  const maxRetries = 3;
  const currentRetries = context.retryCount || 0;

  return isRetryable && currentRetries < maxRetries;
}

/**
 * Creates a failure context object.
 */
export function createFailureContext(
  reason: string,
  options: Partial<Omit<FailureContext, 'reason' | 'timestamp'>> = {}
): FailureContext {
  return {
    reason,
    timestamp: new Date().toISOString(),
    retryCount: 0,
    ...options,
  };
}

/**
 * Evaluates exit code based on failure statistics and configuration.
 */
export function determineExitCode(
  stats: ExportFailureStats,
  config: AllowFailuresConfig,
  thresholds: FailureThresholds
): number {
  const decision = shouldContinueExport(stats, config, thresholds);
  return decision.exitCode;
}

/**
 * Generates a summary message for export completion.
 */
export function generateFailureSummary(
  stats: ExportFailureStats,
  config: AllowFailuresConfig
): string {
  const messages: string[] = [];

  if (stats.pageFailures > 0) {
    messages.push(`${stats.pageFailures} page(s) failed`);
  }

  if (stats.attachmentFailures > 0) {
    const percentage = stats.totalAttachments > 0 
      ? ((stats.attachmentFailures / stats.totalAttachments) * 100).toFixed(1)
      : '0.0';
    messages.push(`${stats.attachmentFailures} attachment(s) failed (${percentage}%)`);
  }

  if (stats.restrictedPages > 0) {
    messages.push(`${stats.restrictedPages} page(s) restricted`);
  }

  if (messages.length === 0) {
    return 'Export completed successfully with no failures';
  }

  const prefix = config.enabled ? 'Export completed with failures allowed:' : 'Export failed:';
  return `${prefix} ${messages.join(', ')}`;
}

/**
 * Validates allow-failures configuration.
 */
export function validateFailureConfig(config: AllowFailuresConfig): string[] {
  const errors: string[] = [];

  if (config.pageFailureThreshold !== undefined && config.pageFailureThreshold < 0) {
    errors.push('Page failure threshold must be non-negative');
  }

  if (config.attachmentFailureThreshold !== undefined && config.attachmentFailureThreshold < 0) {
    errors.push('Attachment failure threshold must be non-negative');
  }

  return errors;
}

/**
 * Creates a default failure statistics object.
 */
export function createEmptyFailureStats(): ExportFailureStats {
  return {
    pageFailures: 0,
    attachmentFailures: 0,
    restrictedPages: 0,
    totalPages: 0,
    totalAttachments: 0,
    failureReasons: {},
  };
}

/**
 * Merges multiple failure statistics objects.
 */
export function mergeFailureStats(...statsArray: ExportFailureStats[]): ExportFailureStats {
  const merged = createEmptyFailureStats();

  for (const stats of statsArray) {
    merged.pageFailures += stats.pageFailures;
    merged.attachmentFailures += stats.attachmentFailures;
    merged.restrictedPages += stats.restrictedPages;
    merged.totalPages += stats.totalPages;
    merged.totalAttachments += stats.totalAttachments;

    // Merge failure reasons
    for (const [reason, count] of Object.entries(stats.failureReasons)) {
      merged.failureReasons[reason] = (merged.failureReasons[reason] || 0) + count;
    }
  }

  return merged;
}

/**
 * Gets the most common failure reasons.
 */
export function getTopFailureReasons(
  stats: ExportFailureStats,
  limit: number = 5
): Array<{ reason: string; count: number }> {
  return Object.entries(stats.failureReasons)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
