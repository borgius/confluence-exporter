/**
 * T140: Error classification with structured error categories
 * Supports FR-041 for systematic error handling and recovery
 */

import { logger } from '../util/logger.js';
import type { QueueItem } from '../models/queueEntities.js';

export type ErrorCategory = 
  | 'network'        // Network connectivity issues
  | 'authentication' // Auth failures, token expiry
  | 'authorization'  // Permission denied, access control
  | 'rateLimit'      // API rate limiting
  | 'confluence'     // Confluence-specific errors
  | 'validation'     // Data validation failures
  | 'transformation' // Markdown transformation errors
  | 'filesystem'     // File system errors
  | 'queue'          // Queue management errors
  | 'configuration'  // Configuration/setup errors
  | 'unknown';       // Unclassified errors

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface RetryStrategy {
  maxRetries: number;
  baseDelayMs: number;
  backoffMultiplier: number;
  maxDelayMs: number;
  jitterMs: number;
}

export interface ErrorContext {
  operation: string;
  pageId?: string;
  spaceKey?: string;
  url?: string;
  queueItem?: QueueItem;
  timestamp: number;
  userAgent?: string;
  requestId?: string;
}

export interface ErrorClassification {
  category: ErrorCategory;
  severity: ErrorSeverity;
  recoverable: boolean;
  retryable: boolean;
  userActionRequired: boolean;
  description: string;
  suggestedAction: string;
  retryStrategy?: RetryStrategy;
}

export interface ErrorPattern {
  pattern: RegExp | string;
  classification: ErrorClassification;
  matches: (error: Error, context?: ErrorContext) => boolean;
}

export interface ClassifiedError {
  id: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  originalError: Error;
  context: ErrorContext;
  timestamp: number;
  retryable: boolean;
  recoverable: boolean;
  userActionRequired: boolean;
  suggestions: string[];
  retryStrategy?: RetryStrategy;
}

export interface ErrorStats {
  totalErrors: number;
  byCategory: Record<ErrorCategory, number>;
  bySeverity: Record<ErrorSeverity, number>;
  retryableErrors: number;
  nonRetryableErrors: number;
  recentErrors: ClassifiedError[];
}

export class ErrorClassifier {
  private readonly patterns: ErrorPattern[] = [];
  private errors: ClassifiedError[] = [];
  private errorCounter = 0;

  constructor() {
    this.initializeDefaultPatterns();
  }

  /**
   * Classify an error and provide handling recommendations
   */
  classify(error: Error, context?: ErrorContext): ErrorClassification {
    // Try pattern matching first
    for (const pattern of this.patterns) {
      if (pattern.matches(error, context)) {
        return {
          ...pattern.classification,
          description: this.enhanceDescription(pattern.classification.description, error, context),
        };
      }
    }

    // Fallback classification
    return this.classifyByProperties(error, context);
  }

  /**
   * Classifies an error and adds it to the collection
   */
  classifyError(error: Error, context?: ErrorContext): ClassifiedError {
    const classification = this.classify(error, context);
    const id = `error_${++this.errorCounter}`;
    
    const classified: ClassifiedError = {
      id,
      category: classification.category,
      severity: classification.severity,
      message: error.message,
      originalError: error,
      context: context || { operation: 'unknown', timestamp: Date.now() },
      timestamp: Date.now(),
      retryable: classification.retryable,
      recoverable: classification.recoverable,
      userActionRequired: classification.userActionRequired,
      suggestions: [classification.suggestedAction],
      retryStrategy: classification.retryStrategy,
    };
    
    this.errors.push(classified);
    this.logClassifiedError(classified);
    
    return classified;
  }

  /**
   * Get retry strategy for a classified error
   */
  getRetryStrategy(classification: ErrorClassification): RetryStrategy | null {
    if (!classification.retryable) {
      return null;
    }

    return classification.retryStrategy || this.getDefaultRetryStrategy(classification.category);
  }

  /**
   * Check if error should trigger immediate failure
   */
  shouldFailImmediately(classification: ErrorClassification): boolean {
    return classification.severity === 'critical' && !classification.recoverable;
  }

  /**
   * Get user-friendly error message
   */
  getUserMessage(classification: ErrorClassification): string {
    const baseMessage = classification.description;
    const action = classification.userActionRequired 
      ? ` ${classification.suggestedAction}`
      : '';
    
    return `${baseMessage}${action}`;
  }

  /**
   * Register custom error pattern
   */
  addPattern(pattern: ErrorPattern): void {
    this.patterns.unshift(pattern); // Add to front for priority
  }

  /**
   * Get error statistics by category
   */
  getErrorStatistics(errors: Array<{ error: Error; context?: ErrorContext }>): {
    byCategory: Record<ErrorCategory, number>;
    bySeverity: Record<ErrorSeverity, number>;
    retryableCount: number;
    recoverableCount: number;
    totalErrors: number;
  } {
    const stats = {
      byCategory: {} as Record<ErrorCategory, number>,
      bySeverity: {} as Record<ErrorSeverity, number>,
      retryableCount: 0,
      recoverableCount: 0,
      totalErrors: errors.length,
    };

    // Initialize counters
    const categories: ErrorCategory[] = [
      'network', 'authentication', 'authorization', 'rateLimit', 'confluence',
      'validation', 'transformation', 'filesystem', 'queue', 'configuration', 'unknown'
    ];
    const severities: ErrorSeverity[] = ['low', 'medium', 'high', 'critical'];

    for (const category of categories) {
      stats.byCategory[category] = 0;
    }
    for (const severity of severities) {
      stats.bySeverity[severity] = 0;
    }

    // Count errors
    for (const { error, context } of errors) {
      const classification = this.classify(error, context);
      stats.byCategory[classification.category]++;
      stats.bySeverity[classification.severity]++;
      
      if (classification.retryable) stats.retryableCount++;
      if (classification.recoverable) stats.recoverableCount++;
    }

    return stats;
  }

  /**
   * Gets error statistics
   */
  getStats(): ErrorStats {
    const stats: ErrorStats = {
      totalErrors: this.errors.length,
      byCategory: {} as Record<ErrorCategory, number>,
      bySeverity: {} as Record<ErrorSeverity, number>,
      retryableErrors: 0,
      nonRetryableErrors: 0,
      recentErrors: this.errors.slice(-10), // Last 10 errors
    };

    // Initialize counters
    const categories: ErrorCategory[] = [
      'network', 'authentication', 'authorization', 'rateLimit', 'confluence',
      'validation', 'transformation', 'filesystem', 'queue', 'configuration', 'unknown'
    ];
    const severities: ErrorSeverity[] = ['low', 'medium', 'high', 'critical'];

    for (const category of categories) {
      stats.byCategory[category] = 0;
    }
    for (const severity of severities) {
      stats.bySeverity[severity] = 0;
    }

    for (const error of this.errors) {
      // Count by category
      stats.byCategory[error.category]++;

      // Count by severity
      stats.bySeverity[error.severity]++;

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

  private initializeDefaultPatterns(): void {
    // Network errors
    this.addPattern({
      pattern: /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up/i,
      classification: {
        category: 'network',
        severity: 'medium',
        recoverable: true,
        retryable: true,
        userActionRequired: false,
        description: 'Network connectivity issue',
        suggestedAction: 'Check network connection and try again',
        retryStrategy: {
          maxRetries: 5,
          baseDelayMs: 2000,
          backoffMultiplier: 2,
          maxDelayMs: 30000,
          jitterMs: 1000,
        },
      },
      matches: (error) => /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|socket hang up/i.test(error.message),
    });

    // Authentication errors
    this.addPattern({
      pattern: /401|unauthorized|authentication|invalid.+token/i,
      classification: {
        category: 'authentication',
        severity: 'high',
        recoverable: false,
        retryable: false,
        userActionRequired: true,
        description: 'Authentication failed',
        suggestedAction: 'Check credentials and token validity',
      },
      matches: (error) => {
        const message = error.message.toLowerCase();
        return message.includes('401') || 
               message.includes('unauthorized') ||
               message.includes('authentication') ||
               /invalid.+token/.test(message);
      },
    });

    // Rate limiting
    this.addPattern({
      pattern: /429|rate.+limit|too.+many.+requests/i,
      classification: {
        category: 'rateLimit',
        severity: 'medium',
        recoverable: true,
        retryable: true,
        userActionRequired: false,
        description: 'API rate limit exceeded',
        suggestedAction: 'Will retry with exponential backoff',
        retryStrategy: {
          maxRetries: 10,
          baseDelayMs: 60000, // Start with 1 minute
          backoffMultiplier: 2,
          maxDelayMs: 600000, // Max 10 minutes
          jitterMs: 5000,
        },
      },
      matches: (error) => {
        const message = error.message.toLowerCase();
        return message.includes('429') ||
               /rate.+limit/.test(message) ||
               /too.+many.+requests/.test(message);
      },
    });

    // Additional network errors
    this.addPattern({
      pattern: /fetch failed/i,
      classification: {
        category: 'network',
        severity: 'medium',
        recoverable: true,
        retryable: true,
        userActionRequired: false,
        description: 'Network request failed',
        suggestedAction: 'Check network connection and try again',
        retryStrategy: {
          maxRetries: 5,
          baseDelayMs: 2000,
          backoffMultiplier: 2,
          maxDelayMs: 30000,
          jitterMs: 1000,
        },
      },
      matches: (error) => /fetch failed/i.test(error.message),
    });

    // Authorization errors
    this.addPattern({
      pattern: /forbidden|access denied|insufficient permissions/i,
      classification: {
        category: 'authorization',
        severity: 'high',
        recoverable: false,
        retryable: false,
        userActionRequired: true,
        description: 'Access denied or insufficient permissions',
        suggestedAction: 'Check user permissions and access rights',
      },
      matches: (error) => {
        const message = error.message.toLowerCase();
        return message.includes('forbidden') ||
               message.includes('access denied') ||
               message.includes('insufficient permissions');
      },
    });
  }

  private classifyByProperties(error: Error, context?: ErrorContext): ErrorClassification {
    // Analyze error type and properties
    const errorName = error.name?.toLowerCase() || '';
    const errorMessage = error.message?.toLowerCase() || '';

    // Check for common error types
    const syntaxErrorClassification = this.checkSyntaxError(errorName, errorMessage);
    if (syntaxErrorClassification) return syntaxErrorClassification;

    const timeoutErrorClassification = this.checkTimeoutError(errorName, errorMessage);
    if (timeoutErrorClassification) return timeoutErrorClassification;

    // Context-based classification
    const contextBasedClassification = this.getContextBasedClassification(context);
    if (contextBasedClassification) return contextBasedClassification;

    // Default classification for unknown errors
    return this.getDefaultClassification();
  }

  private checkSyntaxError(errorName: string, errorMessage: string): ErrorClassification | null {
    if (errorName.includes('syntax') || errorMessage.includes('syntax')) {
      return {
        category: 'validation',
        severity: 'medium',
        recoverable: false,
        retryable: false,
        userActionRequired: true,
        description: 'Syntax error in data',
        suggestedAction: 'Check data format and syntax',
      };
    }
    return null;
  }

  private checkTimeoutError(errorName: string, errorMessage: string): ErrorClassification | null {
    if (errorName.includes('timeout') || errorMessage.includes('timeout')) {
      return {
        category: 'network',
        severity: 'medium',
        recoverable: true,
        retryable: true,
        userActionRequired: false,
        description: 'Operation timed out',
        suggestedAction: 'Will retry automatically',
      };
    }
    return null;
  }

  private getContextBasedClassification(context?: ErrorContext): ErrorClassification | null {
    if (!context?.operation) return null;

    const operation = context.operation.toLowerCase();
    
    if (operation.includes('queue')) {
      return {
        category: 'queue',
        severity: 'medium',
        recoverable: true,
        retryable: true,
        userActionRequired: false,
        description: 'Queue operation failed',
        suggestedAction: 'Queue will attempt recovery',
      };
    }

    if (operation.includes('transform') || operation.includes('markdown')) {
      return {
        category: 'transformation',
        severity: 'medium',
        recoverable: true,
        retryable: true,
        userActionRequired: false,
        description: 'Content transformation failed',
        suggestedAction: 'Will retry with alternative transformation',
      };
    }

    return null;
  }

  private getDefaultClassification(): ErrorClassification {
    return {
      category: 'unknown',
      severity: 'medium',
      recoverable: true,
      retryable: true,
      userActionRequired: false,
      description: 'Unknown error occurred',
      suggestedAction: 'Will attempt automatic retry',
    };
  }

  private getDefaultRetryStrategy(category: ErrorCategory): RetryStrategy {
    const strategies: Record<ErrorCategory, RetryStrategy> = {
      network: {
        maxRetries: 5,
        baseDelayMs: 2000,
        backoffMultiplier: 2,
        maxDelayMs: 30000,
        jitterMs: 1000,
      },
      rateLimit: {
        maxRetries: 10,
        baseDelayMs: 60000,
        backoffMultiplier: 2,
        maxDelayMs: 600000,
        jitterMs: 5000,
      },
      confluence: {
        maxRetries: 3,
        baseDelayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 10000,
        jitterMs: 500,
      },
      transformation: {
        maxRetries: 2,
        baseDelayMs: 500,
        backoffMultiplier: 2,
        maxDelayMs: 5000,
        jitterMs: 200,
      },
      filesystem: {
        maxRetries: 3,
        baseDelayMs: 1000,
        backoffMultiplier: 2,
        maxDelayMs: 10000,
        jitterMs: 500,
      },
      queue: {
        maxRetries: 5,
        baseDelayMs: 5000,
        backoffMultiplier: 1.5,
        maxDelayMs: 30000,
        jitterMs: 2000,
      },
      // Non-retryable categories get minimal retry
      authentication: {
        maxRetries: 1,
        baseDelayMs: 1000,
        backoffMultiplier: 1,
        maxDelayMs: 1000,
        jitterMs: 0,
      },
      authorization: {
        maxRetries: 1,
        baseDelayMs: 1000,
        backoffMultiplier: 1,
        maxDelayMs: 1000,
        jitterMs: 0,
      },
      validation: {
        maxRetries: 1,
        baseDelayMs: 1000,
        backoffMultiplier: 1,
        maxDelayMs: 1000,
        jitterMs: 0,
      },
      configuration: {
        maxRetries: 1,
        baseDelayMs: 1000,
        backoffMultiplier: 1,
        maxDelayMs: 1000,
        jitterMs: 0,
      },
      unknown: {
        maxRetries: 3,
        baseDelayMs: 2000,
        backoffMultiplier: 2,
        maxDelayMs: 15000,
        jitterMs: 1000,
      },
    };

    return strategies[category];
  }

  private enhanceDescription(
    baseDescription: string,
    _error: Error,
    context?: ErrorContext
  ): string {
    let enhanced = baseDescription;

    if (context?.pageId) {
      enhanced += ` (Page: ${context.pageId})`;
    }

    if (context?.operation) {
      enhanced += ` (Operation: ${context.operation})`;
    }

    return enhanced;
  }

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

  private getLogLevelForSeverity(severity: ErrorSeverity): 'debug' | 'info' | 'warn' | 'error' {
    switch (severity) {
      case 'low':
        return 'debug';
      case 'medium':
        return 'info';
      case 'high':
        return 'warn';
      case 'critical':
        return 'error';
      default:
        return 'info';
    }
  }
}

/**
 * Global error classifier instance
 */
export const errorClassifier = new ErrorClassifier();

/**
 * Convenience function to classify an error
 */
export function classifyError(error: Error, context?: ErrorContext): ErrorClassification {
  return errorClassifier.classify(error, context);
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: Error, context?: ErrorContext): boolean {
  const classification = classifyError(error, context);
  return classification.retryable;
}

/**
 * Get retry strategy for an error
 */
export function getErrorRetryStrategy(error: Error, context?: ErrorContext): RetryStrategy | null {
  const classification = classifyError(error, context);
  return errorClassifier.getRetryStrategy(classification);
}

/**
 * Create error context for better classification
 */
export function createErrorContext(
  operation: string,
  options: Partial<Omit<ErrorContext, 'operation' | 'timestamp'>> = {}
): ErrorContext {
  return {
    operation,
    timestamp: Date.now(),
    ...options,
  };
}

/**
 * Creates an error classifier
 */
export function createErrorClassifier(): ErrorClassifier {
  return new ErrorClassifier();
}
