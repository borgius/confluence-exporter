/**
 * Progress logging for CLI operations
 * Implements T057: Progress logging (pages processed/remaining, warnings)
 */

import { logger } from '../util/logger.js';

export interface ProgressStats {
  pagesProcessed: number;
  pagesTotal: number;
  pagesRemaining: number;
  attachmentsProcessed: number;
  attachmentsTotal: number;
  warnings: number;
  errors: number;
  startTime: number;
  elapsedSeconds: number;
  estimatedRemainingSeconds?: number;
  pagesPerSecond?: number;
}

export interface ProgressLogger {
  updateProgress(stats: ProgressStats): void;
  logWarning(message: string, context?: Record<string, unknown>): void;
  logError(message: string, context?: Record<string, unknown>): void;
  logSummary(finalStats: ProgressStats): void;
}

/**
 * Creates a progress logger based on log level
 */
export function createProgressLogger(logLevel: string): ProgressLogger {
  const showProgress = ['info', 'debug'].includes(logLevel);
  let lastProgressUpdate = 0;
  const progressInterval = 1000; // Update every second

  return {
    updateProgress(stats: ProgressStats): void {
      const now = Date.now();
      
      // Throttle progress updates to avoid spam
      if (!showProgress || (now - lastProgressUpdate < progressInterval && stats.pagesRemaining > 0)) {
        return;
      }
      
      lastProgressUpdate = now;
      
      const progressPercentage = stats.pagesTotal > 0 
        ? Math.round((stats.pagesProcessed / stats.pagesTotal) * 100)
        : 0;
      
      const message = stats.pagesRemaining === 0 
        ? 'Export completed'
        : `Export progress: ${stats.pagesProcessed}/${stats.pagesTotal} pages (${progressPercentage}%)`;
      
      logger.info(message, {
        pagesProcessed: stats.pagesProcessed,
        pagesTotal: stats.pagesTotal,
        pagesRemaining: stats.pagesRemaining,
        attachmentsProcessed: stats.attachmentsProcessed,
        attachmentsTotal: stats.attachmentsTotal,
        progressPercentage,
        elapsedSeconds: stats.elapsedSeconds,
        pagesPerSecond: stats.pagesPerSecond,
        estimatedRemainingSeconds: stats.estimatedRemainingSeconds,
        warnings: stats.warnings,
        errors: stats.errors,
      });
      
      // Log performance info at debug level
      if (logLevel === 'debug' && stats.pagesPerSecond) {
        logger.debug('Performance metrics', {
          pagesPerSecond: stats.pagesPerSecond.toFixed(2),
          avgProcessingTime: stats.pagesPerSecond > 0 ? (1 / stats.pagesPerSecond * 1000).toFixed(0) + 'ms' : 'N/A',
          estimatedCompletion: stats.estimatedRemainingSeconds 
            ? new Date(Date.now() + stats.estimatedRemainingSeconds * 1000).toISOString()
            : 'Unknown',
        });
      }
    },

    logWarning(message: string, context?: Record<string, unknown>): void {
      logger.warn(`Export warning: ${message}`, context);
    },

    logError(message: string, context?: Record<string, unknown>): void {
      logger.error(`Export error: ${message}`, context);
    },

    logSummary(finalStats: ProgressStats): void {
      const duration = finalStats.elapsedSeconds;
      const minutes = Math.floor(duration / 60);
      const seconds = Math.round(duration % 60);
      const durationString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      
      logger.info('Export completed', {
        summary: {
          totalPages: finalStats.pagesTotal,
          processedPages: finalStats.pagesProcessed,
          totalAttachments: finalStats.attachmentsTotal,
          processedAttachments: finalStats.attachmentsProcessed,
          duration: durationString,
          averageSpeed: finalStats.pagesPerSecond ? `${finalStats.pagesPerSecond.toFixed(2)} pages/sec` : 'N/A',
          warnings: finalStats.warnings,
          errors: finalStats.errors,
        },
      });

      // Log detailed breakdown at info level
      if (finalStats.warnings > 0) {
        logger.warn('Export completed with warnings', { warningCount: finalStats.warnings });
      }
      
      if (finalStats.errors > 0) {
        logger.error('Export completed with errors', { errorCount: finalStats.errors });
      }
      
      // Success message
      if (finalStats.errors === 0) {
        logger.info('Export successful', {
          message: `Successfully exported ${finalStats.pagesProcessed} pages in ${durationString}`,
        });
      }
    },
  };
}

/**
 * Creates progress statistics from current state
 */
export function createProgressStats(
  pagesProcessed: number,
  pagesTotal: number,
  attachmentsProcessed: number,
  attachmentsTotal: number,
  warnings: number,
  errors: number,
  startTime: number
): ProgressStats {
  const now = Date.now();
  const elapsedSeconds = (now - startTime) / 1000;
  const pagesRemaining = pagesTotal - pagesProcessed;
  
  // Calculate performance metrics
  const pagesPerSecond = elapsedSeconds > 0 ? pagesProcessed / elapsedSeconds : 0;
  const estimatedRemainingSeconds = pagesPerSecond > 0 && pagesRemaining > 0 
    ? pagesRemaining / pagesPerSecond 
    : undefined;

  return {
    pagesProcessed,
    pagesTotal,
    pagesRemaining,
    attachmentsProcessed,
    attachmentsTotal,
    warnings,
    errors,
    startTime,
    elapsedSeconds,
    estimatedRemainingSeconds,
    pagesPerSecond,
  };
}
