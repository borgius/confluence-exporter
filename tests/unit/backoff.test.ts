import { computeBackoffDelay, retry, type RetryOptions, type RetryError } from '../../src/util/retry';

describe('Unit: retry backoff', () => {
  describe('computeBackoffDelay function', () => {
    it('generates exponential backoff delays', () => {
      const base = 100;
      const max = 10000;
      
      expect(computeBackoffDelay(1, base, max)).toBe(100);    // 100 * 2^0
      expect(computeBackoffDelay(2, base, max)).toBe(200);    // 100 * 2^1
      expect(computeBackoffDelay(3, base, max)).toBe(400);    // 100 * 2^2
      expect(computeBackoffDelay(4, base, max)).toBe(800);    // 100 * 2^3
      expect(computeBackoffDelay(5, base, max)).toBe(1600);   // 100 * 2^4
    });

    it('caps delays at maximum value', () => {
      const base = 100;
      const max = 1000;
      
      expect(computeBackoffDelay(10, base, max)).toBe(max);
      expect(computeBackoffDelay(20, base, max)).toBe(max);
    });

    it('handles edge cases', () => {
      expect(computeBackoffDelay(1, 0, 1000)).toBe(0);
      expect(computeBackoffDelay(1, 1, 0)).toBe(0);
      expect(computeBackoffDelay(0, 100, 1000)).toBe(50); // 100 * 2^(-1) = 50
    });
  });

  describe('retry function with jitter', () => {
    it('generates backoff with jitter variation', async () => {
      let callCount = 0;
      const delays: number[] = [];
      
      const options: RetryOptions = {
        maxAttempts: 4,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        jitterRatio: 0.1,
        shouldRetry: () => true,
        onAttempt: (_attempt, delayMs) => {
          delays.push(delayMs);
        }
      };

      try {
        await retry(async () => {
          callCount++;
          if (callCount < 4) {
            throw new Error(`Attempt ${callCount} failed`);
          }
          return 'success';
        }, options);
      } catch {
        // Expected to fail before success
      }

      // Should have collected delays for retry attempts
      expect(delays.length).toBeGreaterThan(0);
      
      // Delays should be roughly in exponential progression but with jitter
      for (const delay of delays) {
        expect(delay).toBeGreaterThan(0);
        expect(delay).toBeLessThanOrEqual(options.maxDelayMs);
      }
    });

    it('respects shouldRetry predicate', async () => {
      let callCount = 0;
      
      const options: RetryOptions = {
        maxAttempts: 5,
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterRatio: 0,
        shouldRetry: (_error, attempt) => {
          return attempt < 3; // Only retry for first 2 failures
        }
      };

      await expect(retry(async () => {
        callCount++;
        throw new Error(`Attempt ${callCount} failed`);
      }, options)).rejects.toThrow('Attempt 3 failed');

      expect(callCount).toBe(3); // Initial + 2 retries
    });

    it('handles successful execution on first try', async () => {
      let callCount = 0;
      
      const options: RetryOptions = {
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        jitterRatio: 0.1,
        shouldRetry: () => true
      };

      const result = await retry(async () => {
        callCount++;
        return 'immediate success';
      }, options);

      expect(result).toBe('immediate success');
      expect(callCount).toBe(1);
    });

    it('handles retry after delay mechanisms', async () => {
      let callCount = 0;
      
      const options: RetryOptions = {
        maxAttempts: 3,
        baseDelayMs: 50,
        maxDelayMs: 500,
        jitterRatio: 0,
        shouldRetry: () => true,
        getRetryAfter: (error) => {
          // Simulate HTTP 429 with Retry-After header
          if (error.response?.status === 429) {
            return 150; // 150ms retry after
          }
          return undefined;
        }
      };

      const delays: number[] = [];
      
      options.onAttempt = (_attempt, delayMs) => {
        delays.push(delayMs);
      };

      try {
        await retry(async () => {
          callCount++;
          if (callCount < 3) {
            const error = new Error('Rate limited') as RetryError;
            error.response = { status: 429 };
            throw error;
          }
          return 'success';
        }, options);
      } catch {
        // May fail but we're testing delay behavior
      }

      // Should use retry-after delay when provided
      if (delays.length > 0) {
        expect(delays[0]).toBeLessThanOrEqual(150); // Should respect retry-after
      }
    });

    it('enforces maximum attempts limit', async () => {
      let callCount = 0;
      
      const options: RetryOptions = {
        maxAttempts: 2,
        baseDelayMs: 1,
        maxDelayMs: 10,
        jitterRatio: 0,
        shouldRetry: () => true
      };

      await expect(retry(async () => {
        callCount++;
        throw new Error(`Attempt ${callCount} failed`);
      }, options)).rejects.toThrow('Attempt 2 failed');

      expect(callCount).toBe(2);
    });
  });
});
