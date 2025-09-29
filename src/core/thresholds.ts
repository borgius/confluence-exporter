/**
 * Attachment failure threshold enforcement
 * Implements T060: Attachment failure threshold enforcement (percent & absolute logic)
 */

import { logger } from '../util/logger.js';

export interface AttachmentThresholdConfig {
  percentageThreshold: number; // 0-1 decimal (e.g., 0.2 for 20%)
  absoluteThreshold?: number; // Optional absolute count limit
  failOnThreshold: boolean; // Whether to fail the entire export
}

export interface AttachmentFailureStats {
  totalAttachments: number;
  failedAttachments: number;
  failureRate: number; // 0-1 decimal
  failedIds: string[];
  failureReasons: Map<string, string>; // attachmentId -> reason
}

export interface ThresholdCheckResult {
  passed: boolean;
  exceedsThreshold: boolean;
  failureRate: number;
  message: string;
  shouldFailExport: boolean;
}

/**
 * Tracks attachment failures and enforces thresholds
 */
export class AttachmentThresholdEnforcer {
  private config: AttachmentThresholdConfig;
  private stats: AttachmentFailureStats;

  constructor(config: AttachmentThresholdConfig) {
    this.config = config;
    this.stats = {
      totalAttachments: 0,
      failedAttachments: 0,
      failureRate: 0,
      failedIds: [],
      failureReasons: new Map(),
    };
  }

  /**
   * Records a successful attachment download
   */
  recordSuccess(attachmentId: string): void {
    this.stats.totalAttachments++;
    this.updateFailureRate();
    
    logger.debug('Attachment download succeeded', { attachmentId });
  }

  /**
   * Records a failed attachment download
   */
  recordFailure(attachmentId: string, reason: string): void {
    this.stats.totalAttachments++;
    this.stats.failedAttachments++;
    this.stats.failedIds.push(attachmentId);
    this.stats.failureReasons.set(attachmentId, reason);
    this.updateFailureRate();
    
    logger.warn('Attachment download failed', { 
      attachmentId, 
      reason,
      currentFailureRate: this.stats.failureRate,
      threshold: this.config.percentageThreshold,
    });
  }

  /**
   * Checks if failure rate exceeds configured thresholds
   */
  checkThresholds(): ThresholdCheckResult {
    const exceedsPercentage = this.stats.failureRate > this.config.percentageThreshold;
    const exceedsAbsolute = this.config.absoluteThreshold 
      ? this.stats.failedAttachments > this.config.absoluteThreshold
      : false;
    
    const exceedsThreshold = exceedsPercentage || exceedsAbsolute;
    
    let message = '';
    if (exceedsPercentage) {
      message = `Attachment failure rate ${(this.stats.failureRate * 100).toFixed(1)}% exceeds threshold ${(this.config.percentageThreshold * 100).toFixed(1)}%`;
    } else if (exceedsAbsolute) {
      message = `Attachment failure count ${this.stats.failedAttachments} exceeds absolute threshold ${this.config.absoluteThreshold}`;
    } else {
      message = `Attachment failure rate ${(this.stats.failureRate * 100).toFixed(1)}% within threshold ${(this.config.percentageThreshold * 100).toFixed(1)}%`;
    }

    return {
      passed: !exceedsThreshold,
      exceedsThreshold,
      failureRate: this.stats.failureRate,
      message,
      shouldFailExport: exceedsThreshold && this.config.failOnThreshold,
    };
  }

  /**
   * Gets current failure statistics
   */
  getStats(): AttachmentFailureStats {
    return { ...this.stats };
  }

  /**
   * Logs a summary of attachment failures
   */
  logSummary(): void {
    const result = this.checkThresholds();
    
    if (this.stats.failedAttachments === 0) {
      logger.info('All attachments downloaded successfully', {
        totalAttachments: this.stats.totalAttachments,
      });
    } else {
      const logLevel = result.exceedsThreshold ? 'error' : 'warn';
      logger[logLevel]('Attachment download summary', {
        totalAttachments: this.stats.totalAttachments,
        failedAttachments: this.stats.failedAttachments,
        failureRate: `${(this.stats.failureRate * 100).toFixed(1)}%`,
        threshold: `${(this.config.percentageThreshold * 100).toFixed(1)}%`,
        exceedsThreshold: result.exceedsThreshold,
        shouldFailExport: result.shouldFailExport,
      });

      // Log first few failure details
      const maxDetailedLogs = 5;
      const failureEntries = Array.from(this.stats.failureReasons.entries()).slice(0, maxDetailedLogs);
      
      for (const [attachmentId, reason] of failureEntries) {
        logger.warn('Attachment failure detail', { attachmentId, reason });
      }

      if (this.stats.failedAttachments > maxDetailedLogs) {
        logger.warn(`... and ${this.stats.failedAttachments - maxDetailedLogs} more attachment failures`);
      }
    }
  }

  /**
   * Updates the failure rate calculation
   */
  private updateFailureRate(): void {
    this.stats.failureRate = this.stats.totalAttachments > 0 
      ? this.stats.failedAttachments / this.stats.totalAttachments 
      : 0;
  }
}

/**
 * Creates an attachment threshold enforcer from configuration
 */
export function createAttachmentThresholdEnforcer(
  percentageThreshold: number,
  absoluteThreshold?: number,
  failOnThreshold = true
): AttachmentThresholdEnforcer {
  if (percentageThreshold < 0 || percentageThreshold > 1) {
    throw new Error('Percentage threshold must be between 0 and 1');
  }

  if (absoluteThreshold !== undefined && absoluteThreshold < 0) {
    throw new Error('Absolute threshold must be non-negative');
  }

  const config: AttachmentThresholdConfig = {
    percentageThreshold,
    absoluteThreshold,
    failOnThreshold,
  };

  return new AttachmentThresholdEnforcer(config);
}
