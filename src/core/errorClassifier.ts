/**
 * Structured error classification and reporting
 * Implements T067: Structured error classification (network, auth, content, filesystem)
 */

import { logger } from '../util/logger.js';

export enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  CONTENT = 'content',
  FILESYSTEM = 'filesystem',
  CONFIGURATION = 'configuration',
  RATE_LIMIT = 'rate_limit',
  VALIDATION = 'validation',
  UNKNOWN = 'unknown',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface ClassifiedError {
  id: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  originalError: Error;
  context: Record<string, unknown>;
  timestamp: number;
  retryable: boolean;
  suggestions: string[];
}

export interface ErrorStats {
  totalErrors: number;
  byCategory: Map<ErrorCategory, number>;
  bySeverity: Map<ErrorSeverity, number>;
  retryableErrors: number;
  nonRetryableErrors: number;
  recentErrors: ClassifiedError[];
}

export interface ErrorPattern {
  pattern: RegExp;
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  suggestions: string[];
}

/**
 * Classifies and manages errors during export operations
 */
export class ErrorClassifier {
  private errors: ClassifiedError[] = [];
  private errorPatterns: ErrorPattern[] = [];
  private errorCounter = 0;

  constructor() {
    this.initializePatterns();
  }

  /**
   * Classifies an error and adds it to the collection
   */
  classifyError(error: Error, context?: Record<string, unknown>): ClassifiedError {
    const classified = this.performClassification(error, context || {});
    this.errors.push(classified);
    
    this.logClassifiedError(classified);
    
    return classified;
  }

  /**
   * Gets error statistics
   */
  getStats(): ErrorStats {
    const stats: ErrorStats = {
      totalErrors: this.errors.length,
      byCategory: new Map(),
      bySeverity: new Map(),
      retryableErrors: 0,
      nonRetryableErrors: 0,
      recentErrors: this.errors.slice(-10), // Last 10 errors
    };

    for (const error of this.errors) {
      // Count by category
      const categoryCount = stats.byCategory.get(error.category) || 0;
      stats.byCategory.set(error.category, categoryCount + 1);

      // Count by severity
      const severityCount = stats.bySeverity.get(error.severity) || 0;
      stats.bySeverity.set(error.severity, severityCount + 1);

      // Count retryable/non-retryable
      if (error.retryable) {
        stats.retryableErrors++;
      } else {
        stats.nonRetryableErrors++;
      }
    }

    return stats;
  }

  /**
   * Gets errors by category
   */
  getErrorsByCategory(category: ErrorCategory): ClassifiedError[] {
    return this.errors.filter(error => error.category === category);
  }

  /**
   * Gets errors by severity
   */
  getErrorsBySeverity(severity: ErrorSeverity): ClassifiedError[] {
    return this.errors.filter(error => error.severity === severity);
  }

  /**
   * Gets retryable errors
   */
  getRetryableErrors(): ClassifiedError[] {
    return this.errors.filter(error => error.retryable);
  }

  /**
   * Clears all collected errors
   */
  clearErrors(): void {
    this.errors = [];
    this.errorCounter = 0;
  }

  /**
   * Generates error summary report
   */
  generateReport(): string {
    const stats = this.getStats();
    const lines: string[] = [];

    lines.push('Error Classification Report');
    lines.push('='.repeat(40));
    lines.push(`Total Errors: ${stats.totalErrors}`);
    lines.push(`Retryable: ${stats.retryableErrors}`);
    lines.push(`Non-retryable: ${stats.nonRetryableErrors}`);
    lines.push('');

    // Category breakdown
    lines.push('Errors by Category:');
    for (const category of Object.values(ErrorCategory)) {
      const count = stats.byCategory.get(category) || 0;
      if (count > 0) {
        const percentage = ((count / stats.totalErrors) * 100).toFixed(1);
        lines.push(`  ${category}: ${count} (${percentage}%)`);
      }
    }
    lines.push('');

    // Severity breakdown
    lines.push('Errors by Severity:');
    for (const severity of Object.values(ErrorSeverity)) {
      const count = stats.bySeverity.get(severity) || 0;
      if (count > 0) {
        const percentage = ((count / stats.totalErrors) * 100).toFixed(1);
        lines.push(`  ${severity}: ${count} (${percentage}%)`);
      }
    }
    lines.push('');

    // Recent errors
    if (stats.recentErrors.length > 0) {
      lines.push('Recent Errors:');
      for (const error of stats.recentErrors.slice(-5)) {
        lines.push(`  [${error.category}/${error.severity}] ${error.message}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Logs error summary
   */
  logSummary(): void {
    const stats = this.getStats();
    
    logger.info('Error Classification Summary', {
      totalErrors: stats.totalErrors,
      retryableErrors: stats.retryableErrors,
      nonRetryableErrors: stats.nonRetryableErrors,
      categoryBreakdown: Object.fromEntries(stats.byCategory),
      severityBreakdown: Object.fromEntries(stats.bySeverity),
    });

    // Log critical errors separately
    const criticalErrors = this.getErrorsBySeverity(ErrorSeverity.CRITICAL);
    if (criticalErrors.length > 0) {
      logger.error('Critical errors detected', {
        count: criticalErrors.length,
        errors: criticalErrors.map(e => ({
          category: e.category,
          message: e.message,
          context: e.context,
        })),
      });
    }

    // Log error patterns
    this.logErrorPatterns();
  }

  /**
   * Performs the actual error classification
   */
  private performClassification(error: Error, context: Record<string, unknown>): ClassifiedError {
    const id = `error_${++this.errorCounter}`;
    const timestamp = Date.now();

    // Try to match against known patterns
    for (const pattern of this.errorPatterns) {
      if (pattern.pattern.test(error.message)) {
        return {
          id,
          category: pattern.category,
          severity: pattern.severity,
          message: error.message,
          originalError: error,
          context,
          timestamp,
          retryable: pattern.retryable,
          suggestions: [...pattern.suggestions],
        };
      }
    }

    // Fallback classification based on error properties
    return this.performFallbackClassification(error, context, id, timestamp);
  }

  /**
   * Performs fallback classification when no pattern matches
   */
  private performFallbackClassification(
    error: Error,
    context: Record<string, unknown>,
    id: string,
    timestamp: number
  ): ClassifiedError {
    let category = ErrorCategory.UNKNOWN;
    let severity = ErrorSeverity.MEDIUM;
    let retryable = false;
    const suggestions: string[] = [];

    // Check error name/type for clues
    if (error.name === 'TypeError' || error.name === 'ReferenceError') {
      category = ErrorCategory.VALIDATION;
      severity = ErrorSeverity.HIGH;
      retryable = false;
      suggestions.push('Check input validation and data types');
    } else if (error.name === 'SyntaxError') {
      category = ErrorCategory.CONTENT;
      severity = ErrorSeverity.HIGH;
      retryable = false;
      suggestions.push('Verify content format and encoding');
    }

    // Check context for additional clues
    if (context.operation === 'file_write' || context.operation === 'file_read') {
      category = ErrorCategory.FILESYSTEM;
      retryable = true;
      suggestions.push('Check file permissions and disk space');
    } else if (context.operation === 'api_call') {
      category = ErrorCategory.NETWORK;
      retryable = true;
      suggestions.push('Check network connectivity and retry');
    }

    return {
      id,
      category,
      severity,
      message: error.message,
      originalError: error,
      context,
      timestamp,
      retryable,
      suggestions,
    };
  }

  /**
   * Initializes known error patterns
   */
  private initializePatterns(): void {
    this.errorPatterns = [
      // Network errors
      {
        pattern: /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/i,
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        suggestions: ['Check network connectivity', 'Verify server URL', 'Retry with exponential backoff'],
      },
      {
        pattern: /fetch failed|network error|connection failed/i,
        category: ErrorCategory.NETWORK,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        suggestions: ['Check internet connection', 'Verify firewall settings', 'Try again later'],
      },

      // Authentication errors
      {
        pattern: /unauthorized|authentication failed|invalid credentials/i,
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        suggestions: ['Verify username and password', 'Check API token validity', 'Refresh authentication'],
      },
      {
        pattern: /401|403/,
        category: ErrorCategory.AUTHENTICATION,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        suggestions: ['Check credentials', 'Verify account permissions'],
      },

      // Authorization errors
      {
        pattern: /forbidden|access denied|insufficient permissions/i,
        category: ErrorCategory.AUTHORIZATION,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        suggestions: ['Check user permissions', 'Request access from administrator', 'Verify space permissions'],
      },

      // Rate limiting
      {
        pattern: /rate limit|too many requests|429/i,
        category: ErrorCategory.RATE_LIMIT,
        severity: ErrorSeverity.MEDIUM,
        retryable: true,
        suggestions: ['Reduce request frequency', 'Implement exponential backoff', 'Contact administrator for rate limit increase'],
      },

      // Content errors
      {
        pattern: /invalid markup|malformed content|content error/i,
        category: ErrorCategory.CONTENT,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        suggestions: ['Check page content format', 'Verify markup syntax', 'Review content encoding'],
      },
      {
        pattern: /attachment not found|missing attachment/i,
        category: ErrorCategory.CONTENT,
        severity: ErrorSeverity.LOW,
        retryable: true,
        suggestions: ['Verify attachment exists', 'Check attachment permissions', 'Skip missing attachments'],
      },

      // Filesystem errors
      {
        pattern: /ENOENT|EACCES|EMFILE|ENOSPC/i,
        category: ErrorCategory.FILESYSTEM,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        suggestions: ['Check file permissions', 'Verify disk space', 'Check file path validity'],
      },
      {
        pattern: /permission denied|cannot create file|directory not found/i,
        category: ErrorCategory.FILESYSTEM,
        severity: ErrorSeverity.HIGH,
        retryable: true,
        suggestions: ['Check directory permissions', 'Verify output path exists', 'Run with appropriate permissions'],
      },

      // Configuration errors
      {
        pattern: /configuration error|invalid config|missing required/i,
        category: ErrorCategory.CONFIGURATION,
        severity: ErrorSeverity.HIGH,
        retryable: false,
        suggestions: ['Review configuration file', 'Check required environment variables', 'Validate configuration schema'],
      },

      // Validation errors
      {
        pattern: /validation failed|invalid input|schema error/i,
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        retryable: false,
        suggestions: ['Check input format', 'Verify data types', 'Review validation rules'],
      },
    ];
  }

  /**
   * Logs a classified error
   */
  private logClassifiedError(error: ClassifiedError): void {
    const logLevel = this.getLogLevelForSeverity(error.severity);
    
    logger[logLevel]('Classified error', {
      errorId: error.id,
      category: error.category,
      severity: error.severity,
      message: error.message,
      retryable: error.retryable,
      context: error.context,
      suggestions: error.suggestions,
    });
  }

  /**
   * Gets appropriate log level for error severity
   */
  private getLogLevelForSeverity(severity: ErrorSeverity): 'debug' | 'info' | 'warn' | 'error' {
    switch (severity) {
      case ErrorSeverity.LOW:
        return 'debug';
      case ErrorSeverity.MEDIUM:
        return 'info';
      case ErrorSeverity.HIGH:
        return 'warn';
      case ErrorSeverity.CRITICAL:
        return 'error';
      default:
        return 'info';
    }
  }

  /**
   * Logs common error patterns found
   */
  private logErrorPatterns(): void {
    if (this.errors.length === 0) return;

    const patternCounts = new Map<string, number>();
    
    for (const error of this.errors) {
      const key = `${error.category}:${error.severity}`;
      patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
    }

    const sortedPatterns = Array.from(patternCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5); // Top 5 patterns

    if (sortedPatterns.length > 0) {
      logger.info('Most common error patterns', {
        patterns: sortedPatterns.map(([pattern, count]) => ({
          pattern,
          count,
          percentage: ((count / this.errors.length) * 100).toFixed(1),
        })),
      });
    }
  }
}

/**
 * Creates an error classifier
 */
export function createErrorClassifier(): ErrorClassifier {
  return new ErrorClassifier();
}
