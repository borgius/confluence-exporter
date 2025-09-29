import type { ExportProgress } from './exportRunner.js';
import type { PerformanceMetrics } from './metrics.js';
import { logger } from '../util/logger.js';

export interface ExitStatusConfig {
  // Error thresholds
  maxPageErrorRate: number; // percentage (0-100)
  maxAttachmentErrorRate: number; // percentage (0-100)
  maxTotalErrors: number; // absolute count
  
  // Performance thresholds
  minPagesPerSecond?: number;
  maxDurationMinutes?: number;
  
  // Quality thresholds
  maxMemoryUsageMB?: number;
}

export interface ExitStatusResult {
  code: number;
  message: string;
  category: 'success' | 'warning' | 'error' | 'failure';
  details: ExitStatusDetail[];
  recommendations: string[];
}

export interface ExitStatusDetail {
  type: 'threshold' | 'error' | 'performance' | 'quality';
  severity: 'info' | 'warning' | 'error';
  message: string;
  actual: number;
  threshold?: number;
}

/**
 * Standard exit codes following Unix conventions and quickstart.md
 */
export const EXIT_CODES = {
  SUCCESS: 0,           // Success within thresholds
  OPERATIONAL_ERRORS: 1, // Page export failures or attachment thresholds exceeded
  CONFIGURATION_ERROR: 2 // Misconfiguration or validation error
} as const;

/**
 * Default configuration based on typical export requirements
 */
export const DEFAULT_EXIT_CONFIG: ExitStatusConfig = {
  maxPageErrorRate: 5.0,        // 5% page error rate
  maxAttachmentErrorRate: 10.0, // 10% attachment error rate  
  maxTotalErrors: 50,           // Max 50 total errors
  minPagesPerSecond: 0.5,       // At least 0.5 pages/second
  maxDurationMinutes: 120,      // Max 2 hours
  maxMemoryUsageMB: 1024        // Max 1GB memory usage
};

/**
 * Evaluate export results and determine appropriate exit status
 */
export function evaluateExitStatus(
  progress: ExportProgress,
  metrics: PerformanceMetrics,
  config: ExitStatusConfig = DEFAULT_EXIT_CONFIG
): ExitStatusResult {
  const details: ExitStatusDetail[] = [];
  const recommendations: string[] = [];
  let worstSeverity: 'info' | 'warning' | 'error' = 'info';

  // Check error thresholds
  const errorResults = evaluateErrorThresholds(progress, config);
  details.push(...errorResults.details);
  recommendations.push(...errorResults.recommendations);
  worstSeverity = updateSeverity(worstSeverity, errorResults.severity);

  // Check performance thresholds
  const performanceResults = evaluatePerformanceThresholds(metrics, config);
  details.push(...performanceResults.details);
  recommendations.push(...performanceResults.recommendations);
  worstSeverity = updateSeverity(worstSeverity, performanceResults.severity);

  // Check quality thresholds
  const qualityResults = evaluateQualityThresholds(metrics, config);
  details.push(...qualityResults.details);
  recommendations.push(...qualityResults.recommendations);
  worstSeverity = updateSeverity(worstSeverity, qualityResults.severity);

  // Determine exit code and category
  let exitCode: number;
  let category: ExitStatusResult['category'];
  let message: string;

  if (worstSeverity === 'error') {
    exitCode = EXIT_CODES.OPERATIONAL_ERRORS;
    category = 'error';
    message = 'Export completed with errors that exceeded acceptable thresholds';
  } else if (worstSeverity === 'warning') {
    exitCode = EXIT_CODES.SUCCESS;
    category = 'warning';
    message = 'Export completed successfully with warnings';
  } else {
    exitCode = EXIT_CODES.SUCCESS;
    category = 'success';
    message = 'Export completed successfully within all thresholds';
  }

  const result: ExitStatusResult = {
    code: exitCode,
    message,
    category,
    details,
    recommendations: [...new Set(recommendations)] // Remove duplicates
  };

  logger.info('Exit status evaluation completed', {
    exitCode,
    category,
    errorCount: errorResults.details.length,
    warningCount: details.filter(d => d.severity === 'warning').length
  });

  return result;
}

/**
 * Helper function to update severity level
 */
function updateSeverity(
  current: 'info' | 'warning' | 'error',
  newSeverity: 'info' | 'warning' | 'error'
): 'info' | 'warning' | 'error' {
  if (newSeverity === 'error') {
    return 'error';
  }
  if (newSeverity === 'warning' && current !== 'error') {
    return 'warning';
  }
  return current;
}

/**
 * Evaluate error-related thresholds
 */
function evaluateErrorThresholds(
  progress: ExportProgress,
  config: ExitStatusConfig
): { severity: 'info' | 'warning' | 'error'; details: ExitStatusDetail[]; recommendations: string[] } {
  const details: ExitStatusDetail[] = [];
  const recommendations: string[] = [];
  let severity: 'info' | 'warning' | 'error' = 'info';

  const pageErrors = progress.errors.filter(e => e.type === 'page').length;
  const attachmentErrors = progress.errors.filter(e => e.type === 'attachment').length;
  const totalErrors = progress.errors.length;

  // Check page error rate
  const pageErrorRate = progress.totalPages > 0 ? (pageErrors / progress.totalPages) * 100 : 0;
  if (pageErrorRate > config.maxPageErrorRate) {
    severity = 'error';
    details.push({
      type: 'threshold',
      severity: 'error',
      message: `Page error rate exceeded threshold`,
      actual: pageErrorRate,
      threshold: config.maxPageErrorRate
    });
    recommendations.push('Review page access permissions and network connectivity');
  } else if (pageErrorRate > config.maxPageErrorRate * 0.7) {
    severity = updateSeverity(severity, 'warning');
    details.push({
      type: 'threshold',
      severity: 'warning',
      message: `Page error rate approaching threshold`,
      actual: pageErrorRate,
      threshold: config.maxPageErrorRate
    });
  }

  // Check attachment error rate
  const attachmentErrorRate = progress.totalAttachments > 0 ? (attachmentErrors / progress.totalAttachments) * 100 : 0;
  if (attachmentErrorRate > config.maxAttachmentErrorRate) {
    severity = 'error';
    details.push({
      type: 'threshold',
      severity: 'error',
      message: `Attachment error rate exceeded threshold`,
      actual: attachmentErrorRate,
      threshold: config.maxAttachmentErrorRate
    });
    recommendations.push('Check attachment storage permissions and disk space');
  } else if (attachmentErrorRate > config.maxAttachmentErrorRate * 0.7) {
    if (severity !== 'error') severity = 'warning';
    details.push({
      type: 'threshold',
      severity: 'warning',
      message: `Attachment error rate approaching threshold`,
      actual: attachmentErrorRate,
      threshold: config.maxAttachmentErrorRate
    });
  }

  // Check total error count
  if (totalErrors > config.maxTotalErrors) {
    severity = 'error';
    details.push({
      type: 'threshold',
      severity: 'error',
      message: `Total error count exceeded threshold`,
      actual: totalErrors,
      threshold: config.maxTotalErrors
    });
    recommendations.push('Consider increasing concurrency limits or implementing retry logic');
  }

  return { severity, details, recommendations };
}

/**
 * Evaluate performance-related thresholds
 */
function evaluatePerformanceThresholds(
  metrics: PerformanceMetrics,
  config: ExitStatusConfig
): { severity: 'info' | 'warning' | 'error'; details: ExitStatusDetail[]; recommendations: string[] } {
  const details: ExitStatusDetail[] = [];
  const recommendations: string[] = [];
  let severity: 'info' | 'warning' | 'error' = 'info';

  // Check pages per second
  if (config.minPagesPerSecond && metrics.throughput.pagesPerSecond < config.minPagesPerSecond) {
    severity = 'warning';
    details.push({
      type: 'performance',
      severity: 'warning',
      message: `Page processing rate below minimum`,
      actual: metrics.throughput.pagesPerSecond,
      threshold: config.minPagesPerSecond
    });
    recommendations.push('Consider increasing concurrency or optimizing network connectivity');
  }

  // Check total duration
  if (config.maxDurationMinutes) {
    const durationMinutes = metrics.totalDuration / (1000 * 60);
    if (durationMinutes > config.maxDurationMinutes) {
      severity = 'warning';
      details.push({
        type: 'performance',
        severity: 'warning',
        message: `Export duration exceeded maximum`,
        actual: durationMinutes,
        threshold: config.maxDurationMinutes
      });
      recommendations.push('Consider splitting export into smaller batches or increasing resources');
    }
  }

  return { severity, details, recommendations };
}

/**
 * Evaluate quality-related thresholds
 */
function evaluateQualityThresholds(
  metrics: PerformanceMetrics,
  config: ExitStatusConfig
): { severity: 'info' | 'warning' | 'error'; details: ExitStatusDetail[]; recommendations: string[] } {
  const details: ExitStatusDetail[] = [];
  const recommendations: string[] = [];
  let severity: 'info' | 'warning' | 'error' = 'info';

  // Check memory usage
  if (config.maxMemoryUsageMB) {
    const memoryUsageMB = metrics.resources.peakMemoryUsage / (1024 * 1024);
    if (memoryUsageMB > config.maxMemoryUsageMB) {
      severity = 'warning';
      details.push({
        type: 'quality',
        severity: 'warning',
        message: `Peak memory usage exceeded threshold`,
        actual: memoryUsageMB,
        threshold: config.maxMemoryUsageMB
      });
      recommendations.push('Consider reducing concurrency or increasing available memory');
    }
  }

  return { severity, details, recommendations };
}

/**
 * Format exit status result for logging and user display
 */
export function formatExitStatus(result: ExitStatusResult): string {
  const lines: string[] = [];
  
  lines.push(`=== Export Status: ${result.category.toUpperCase()} ===`);
  lines.push(`Exit Code: ${result.code}`);
  lines.push(`Message: ${result.message}`);
  
  if (result.details.length > 0) {
    lines.push('\n=== Details ===');
    for (const detail of result.details) {
      const prefix = detail.severity === 'error' ? '❌' : detail.severity === 'warning' ? '⚠️' : 'ℹ️';
      lines.push(`${prefix} ${detail.message}`);
      if (detail.threshold !== undefined) {
        lines.push(`   Actual: ${detail.actual.toFixed(2)}, Threshold: ${detail.threshold.toFixed(2)}`);
      } else {
        lines.push(`   Value: ${detail.actual.toFixed(2)}`);
      }
    }
  }
  
  if (result.recommendations.length > 0) {
    lines.push('\n=== Recommendations ===');
    for (const recommendation of result.recommendations) {
      lines.push(`• ${recommendation}`);
    }
  }
  
  return lines.join('\n');
}
