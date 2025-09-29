/**
 * Unit tests for error utilities
 * Implements T068: Add additional unit tests for error utilities
 */

import { ErrorClassifier, ErrorCategory, ErrorSeverity } from '../../src/core/errorClassifier.js';

describe('ErrorClassifier', () => {
  let classifier: ErrorClassifier;

  beforeEach(() => {
    classifier = new ErrorClassifier();
  });

  describe('Network Error Classification', () => {
    it('should classify ECONNRESET as retryable network error', () => {
      const error = new Error('ECONNRESET: Connection reset by peer');
      const classified = classifier.classifyError(error, { operation: 'api_call' });

      expect(classified.category).toBe(ErrorCategory.NETWORK);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.retryable).toBe(true);
      expect(classified.suggestions).toContain('Check network connectivity');
    });

    it('should classify timeout errors as retryable', () => {
      const error = new Error('ETIMEDOUT: Request timeout');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.NETWORK);
      expect(classified.retryable).toBe(true);
      expect(classified.suggestions).toContain('Retry with exponential backoff');
    });

    it('should classify fetch failed as network error', () => {
      const error = new Error('fetch failed: network error');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.NETWORK);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.retryable).toBe(true);
    });
  });

  describe('Authentication Error Classification', () => {
    it('should classify 401 errors as authentication', () => {
      const error = new Error('HTTP 401: Unauthorized access');
      const classified = classifier.classifyError(error);
      
      expect(classified.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(classified.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.retryable).toBe(false);
      expect(classified.suggestions).toContain('Verify username and password');
    });    it('should classify authentication failed as non-retryable', () => {
      const error = new Error('Authentication failed: Invalid credentials');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.AUTHENTICATION);
      expect(classified.retryable).toBe(false);
      expect(classified.suggestions).toContain('Verify username and password');
    });
  });

  describe('Authorization Error Classification', () => {
    it('should classify forbidden access as authorization error', () => {
      const error = new Error('Forbidden: Access denied to resource');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.AUTHORIZATION);
      expect(classified.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.retryable).toBe(false);
      expect(classified.suggestions).toContain('Check user permissions');
    });

    it('should classify insufficient permissions correctly', () => {
      const error = new Error('Insufficient permissions to access page');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.AUTHORIZATION);
      expect(classified.retryable).toBe(false);
    });
  });

  describe('Rate Limit Error Classification', () => {
    it('should classify rate limit errors as retryable', () => {
      const error = new Error('Rate limit exceeded: Too many requests');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.retryable).toBe(true);
      expect(classified.suggestions).toContain('Reduce request frequency');
    });

    it('should classify 429 status as rate limit', () => {
      const error = new Error('HTTP 429: Too Many Requests');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.RATE_LIMIT);
      expect(classified.retryable).toBe(true);
    });
  });

  describe('Content Error Classification', () => {
    it('should classify invalid markup as content error', () => {
      const error = new Error('Invalid markup detected in page content');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.CONTENT);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.retryable).toBe(false);
      expect(classified.suggestions).toContain('Check page content format');
    });

    it('should classify missing attachments as low severity', () => {
      const error = new Error('Attachment not found: missing file');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.CONTENT);
      expect(classified.severity).toBe(ErrorSeverity.LOW);
      expect(classified.retryable).toBe(true);
    });
  });

  describe('Filesystem Error Classification', () => {
    it('should classify ENOENT as filesystem error', () => {
      const error = new Error('ENOENT: No such file or directory');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.FILESYSTEM);
      expect(classified.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.retryable).toBe(true);
      expect(classified.suggestions).toContain('Check file permissions');
    });

    it('should classify permission denied errors', () => {
      const error = new Error('Permission denied: Cannot create file');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.FILESYSTEM);
      expect(classified.retryable).toBe(true);
    });

    it('should classify ENOSPC as disk space issue', () => {
      const error = new Error('ENOSPC: No space left on device');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.FILESYSTEM);
      expect(classified.suggestions).toContain('Verify disk space');
    });
  });

  describe('Configuration Error Classification', () => {
    it('should classify config errors as non-retryable', () => {
      const error = new Error('Configuration error: Missing required field');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.CONFIGURATION);
      expect(classified.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.retryable).toBe(false);
      expect(classified.suggestions).toContain('Review configuration file');
    });
  });

  describe('Validation Error Classification', () => {
    it('should classify validation errors correctly', () => {
      const error = new Error('Validation failed: Invalid input format');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.VALIDATION);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
      expect(classified.retryable).toBe(false);
      expect(classified.suggestions).toContain('Check input format');
    });
  });

  describe('Fallback Classification', () => {
    it('should classify TypeError as validation error', () => {
      const error = new TypeError('Cannot read property of undefined');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.VALIDATION);
      expect(classified.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.retryable).toBe(false);
    });

    it('should classify SyntaxError as content error', () => {
      const error = new SyntaxError('Unexpected token in JSON');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.CONTENT);
      expect(classified.severity).toBe(ErrorSeverity.HIGH);
      expect(classified.retryable).toBe(false);
    });

    it('should use context for operation classification', () => {
      const error = new Error('Generic error message');
      const classified = classifier.classifyError(error, { operation: 'file_write' });

      expect(classified.category).toBe(ErrorCategory.FILESYSTEM);
      expect(classified.retryable).toBe(true);
    });

    it('should fall back to unknown category for unrecognized errors', () => {
      const error = new Error('Completely unknown error type');
      const classified = classifier.classifyError(error);

      expect(classified.category).toBe(ErrorCategory.UNKNOWN);
      expect(classified.severity).toBe(ErrorSeverity.MEDIUM);
    });
  });

  describe('Error Statistics', () => {
    beforeEach(() => {
      // Add some test errors
      classifier.classifyError(new Error('ECONNRESET'));
      classifier.classifyError(new Error('Authentication failed'));
      classifier.classifyError(new Error('Rate limit exceeded'));
      classifier.classifyError(new Error('ENOENT'));
      classifier.classifyError(new Error('Authentication failed'));
    });

    it('should track total error count', () => {
      const stats = classifier.getStats();
      expect(stats.totalErrors).toBe(5);
    });

    it('should group errors by category', () => {
      const stats = classifier.getStats();
      expect(stats.byCategory.get(ErrorCategory.NETWORK)).toBe(1);
      expect(stats.byCategory.get(ErrorCategory.AUTHENTICATION)).toBe(2);
      expect(stats.byCategory.get(ErrorCategory.RATE_LIMIT)).toBe(1);
      expect(stats.byCategory.get(ErrorCategory.FILESYSTEM)).toBe(1);
    });

    it('should count retryable vs non-retryable errors', () => {
      const stats = classifier.getStats();
      expect(stats.retryableErrors).toBe(3); // network, rate_limit, filesystem
      expect(stats.nonRetryableErrors).toBe(2); // authentication x2
    });

    it('should track recent errors', () => {
      const stats = classifier.getStats();
      expect(stats.recentErrors).toHaveLength(5);
    });
  });

  describe('Error Filtering', () => {
    beforeEach(() => {
      classifier.classifyError(new Error('ECONNRESET'));
      classifier.classifyError(new Error('Authentication failed'));
      classifier.classifyError(new Error('Rate limit exceeded'));
    });

    it('should filter errors by category', () => {
      const networkErrors = classifier.getErrorsByCategory(ErrorCategory.NETWORK);
      expect(networkErrors).toHaveLength(1);
      expect(networkErrors[0].message).toContain('ECONNRESET');
    });

    it('should filter errors by severity', () => {
      const highSeverityErrors = classifier.getErrorsBySeverity(ErrorSeverity.HIGH);
      expect(highSeverityErrors).toHaveLength(1);
      expect(highSeverityErrors[0].message).toContain('Authentication failed');
    });

    it('should filter retryable errors', () => {
      const retryableErrors = classifier.getRetryableErrors();
      expect(retryableErrors).toHaveLength(2);
    });
  });

  describe('Error Reporting', () => {
    beforeEach(() => {
      classifier.classifyError(new Error('ECONNRESET'));
      classifier.classifyError(new Error('Authentication failed'));
      classifier.classifyError(new Error('Rate limit exceeded'));
    });

    it('should generate error report', () => {
      const report = classifier.generateReport();
      expect(report).toContain('Error Classification Report');
      expect(report).toContain('Total Errors: 3');
      expect(report).toContain('Retryable: 2');
      expect(report).toContain('Non-retryable: 1');
    });

    it('should include category breakdown in report', () => {
      const report = classifier.generateReport();
      expect(report).toContain('Errors by Category:');
      expect(report).toContain('network: 1');
      expect(report).toContain('authentication: 1');
      expect(report).toContain('rate_limit: 1');
    });

    it('should include severity breakdown in report', () => {
      const report = classifier.generateReport();
      expect(report).toContain('Errors by Severity:');
    });
  });

  describe('Error Clearing', () => {
    it('should clear all errors', () => {
      classifier.classifyError(new Error('Test error'));
      expect(classifier.getStats().totalErrors).toBe(1);

      classifier.clearErrors();
      expect(classifier.getStats().totalErrors).toBe(0);
    });
  });

  describe('Error Context Handling', () => {
    it('should preserve error context', () => {
      const context = { pageId: '12345', operation: 'export' };
      const error = new Error('Test error');
      const classified = classifier.classifyError(error, context);

      expect(classified.context).toEqual(context);
    });

    it('should handle missing context gracefully', () => {
      const error = new Error('Test error');
      const classified = classifier.classifyError(error);

      expect(classified.context).toEqual({});
    });
  });

  describe('Error ID Generation', () => {
    it('should generate unique error IDs', () => {
      const error1 = classifier.classifyError(new Error('Error 1'));
      const error2 = classifier.classifyError(new Error('Error 2'));

      expect(error1.id).not.toBe(error2.id);
      expect(error1.id).toMatch(/^error_\d+$/);
      expect(error2.id).toMatch(/^error_\d+$/);
    });
  });
});
