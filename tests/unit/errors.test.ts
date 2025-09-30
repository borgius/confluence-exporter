/**
 * Unit tests for error utilities
 * Implements T068: Add additional unit tests for error utilities
 */

import { ErrorClassifier } from '../../src/core/errorClassifier.js';

describe('ErrorClassifier', () => {
  let classifier: ErrorClassifier;

  beforeEach(() => {
    classifier = new ErrorClassifier();
  });

  describe('Network Error Classification', () => {
    it('should classify ECONNRESET as retryable network error', () => {
      const error = new Error('ECONNRESET: Connection reset by peer');
      const classified = classifier.classifyError(error, { operation: 'api_call', timestamp: Date.now() });

      expect(classified.category).toBe('network');
      expect(classified.severity).toBe('medium');
      expect(classified.retryable).toBe(true);
    });

    it('should classify timeout errors as retryable', () => {
      const error = new Error('ETIMEDOUT: Request timeout');
      const classified = classifier.classifyError(error, { operation: 'api_call', timestamp: Date.now() });

      expect(classified.category).toBe('network');
      expect(classified.retryable).toBe(true);
    });

    it('should classify fetch failed as network error', () => {
      const error = new Error('fetch failed: network error');
      const classified = classifier.classifyError(error, { operation: 'api_call', timestamp: Date.now() });

      expect(classified.category).toBe('network');
      expect(classified.severity).toBe('medium');
      expect(classified.retryable).toBe(true);
    });
  });

  describe('Authentication Error Classification', () => {
    it('should classify 401 errors as authentication', () => {
      const error = new Error('HTTP 401: Unauthorized access');
      const classified = classifier.classifyError(error, { operation: 'api_call', timestamp: Date.now() });
      
      expect(classified.category).toBe('authentication');
      expect(classified.severity).toBe('high');
      expect(classified.retryable).toBe(false);
    });

    it('should classify authentication failed as non-retryable', () => {
      const error = new Error('Authentication failed: Invalid credentials');
      const classified = classifier.classifyError(error, { operation: 'api_call', timestamp: Date.now() });

      expect(classified.category).toBe('authentication');
      expect(classified.retryable).toBe(false);
    });
  });

  describe('Authorization Error Classification', () => {
    it('should classify forbidden access as authorization error', () => {
      const error = new Error('Forbidden: Access denied to resource');
      const classified = classifier.classifyError(error, { operation: 'api_call', timestamp: Date.now() });

      expect(classified.category).toBe('authorization');
      expect(classified.severity).toBe('high');
      expect(classified.retryable).toBe(false);
    });

    it('should classify insufficient permissions correctly', () => {
      const error = new Error('Insufficient permissions to access page');
      const classified = classifier.classifyError(error, { operation: 'api_call', timestamp: Date.now() });

      expect(classified.category).toBe('authorization');
      expect(classified.retryable).toBe(false);
    });
  });

  describe('Rate Limit Error Classification', () => {
    it('should classify rate limit errors as retryable', () => {
      const error = new Error('Rate limit exceeded: Too many requests');
      const classified = classifier.classifyError(error, { operation: 'api_call', timestamp: Date.now() });

      expect(classified.category).toBe('rateLimit');
      expect(classified.severity).toBe('medium');
      expect(classified.retryable).toBe(true);
    });

    it('should classify 429 status as rate limit', () => {
      const error = new Error('HTTP 429: Too Many Requests');
      const classified = classifier.classifyError(error, { operation: 'api_call', timestamp: Date.now() });

      expect(classified.category).toBe('rateLimit');
      expect(classified.retryable).toBe(true);
    });
  });

  describe('Fallback Classification', () => {
    it('should classify unknown errors correctly', () => {
      const error = new Error('Completely unknown error type');
      const classified = classifier.classifyError(error, { operation: 'api_call', timestamp: Date.now() });

      expect(classified.category).toBe('unknown');
      expect(classified.severity).toBe('medium');
    });
  });

  describe('Error Statistics', () => {
    beforeEach(() => {
      // Add some test errors
      classifier.classifyError(new Error('ECONNRESET'), { operation: 'api_call', timestamp: Date.now() });
      classifier.classifyError(new Error('Authentication failed'), { operation: 'api_call', timestamp: Date.now() });
      classifier.classifyError(new Error('Rate limit exceeded'), { operation: 'api_call', timestamp: Date.now() });
    });

    it('should track total error count', () => {
      const stats = classifier.getStats();
      expect(stats.totalErrors).toBe(3);
    });

    it('should group errors by category', () => {
      const stats = classifier.getStats();
      expect(stats.byCategory['network']).toBe(1);
      expect(stats.byCategory['authentication']).toBe(1);
      expect(stats.byCategory['rateLimit']).toBe(1);
    });

    it('should count retryable vs non-retryable errors', () => {
      const stats = classifier.getStats();
      expect(stats.retryableErrors).toBe(2); // network, rate_limit
      expect(stats.nonRetryableErrors).toBe(1); // authentication
    });
  });

  describe('Error Filtering', () => {
    beforeEach(() => {
      classifier.classifyError(new Error('ECONNRESET'), { operation: 'api_call', timestamp: Date.now() });
      classifier.classifyError(new Error('Authentication failed'), { operation: 'api_call', timestamp: Date.now() });
      classifier.classifyError(new Error('Rate limit exceeded'), { operation: 'api_call', timestamp: Date.now() });
    });

    it('should filter errors by category', () => {
      const networkErrors = classifier.getErrorsByCategory('network');
      expect(networkErrors).toHaveLength(1);
      expect(networkErrors[0].message).toContain('ECONNRESET');
    });

    it('should filter errors by severity', () => {
      const highSeverityErrors = classifier.getErrorsBySeverity('high');
      expect(highSeverityErrors).toHaveLength(1);
      expect(highSeverityErrors[0].message).toContain('Authentication failed');
    });

    it('should filter retryable errors', () => {
      const retryableErrors = classifier.getRetryableErrors();
      expect(retryableErrors).toHaveLength(2);
    });
  });

  describe('Error Clearing', () => {
    it('should clear all errors', () => {
      classifier.classifyError(new Error('Test error'), { operation: 'api_call', timestamp: Date.now() });
      expect(classifier.getStats().totalErrors).toBe(1);

      classifier.clearErrors();
      expect(classifier.getStats().totalErrors).toBe(0);
    });
  });

  describe('Error Context Handling', () => {
    it('should preserve error context', () => {
      const context = { pageId: '12345', operation: 'export', timestamp: Date.now() };
      const error = new Error('Test error');
      const classified = classifier.classifyError(error, context);

      expect(classified.context.pageId).toBe('12345');
      expect(classified.context.operation).toBe('export');
    });
  });

  describe('Error ID Generation', () => {
    it('should generate unique error IDs', () => {
      const error1 = classifier.classifyError(new Error('Error 1'), { operation: 'api_call', timestamp: Date.now() });
      const error2 = classifier.classifyError(new Error('Error 2'), { operation: 'api_call', timestamp: Date.now() });

      expect(error1.id).not.toBe(error2.id);
      expect(error1.id).toMatch(/^error_\d+$/);
      expect(error2.id).toMatch(/^error_\d+$/);
    });
  });
});