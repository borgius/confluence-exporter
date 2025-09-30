import { describe, it, expect } from '@jest/globals';
import { createAttachmentThresholdEnforcer } from '../../src/core/thresholds';

describe('Integration: attachment failure threshold', () => {
  it('fails export when percentage threshold exceeded', async () => {
    // Create enforcer with 20% threshold (0.2) and fail on threshold
    const enforcer = createAttachmentThresholdEnforcer(0.2, undefined, true);

    // Record some successful downloads
    enforcer.recordSuccess('attachment-1');
    enforcer.recordSuccess('attachment-2');
    enforcer.recordSuccess('attachment-3');
    enforcer.recordSuccess('attachment-4');

    // Record a failure that exceeds 20% threshold (1 failure out of 5 = 20%, but next failure will exceed)
    enforcer.recordFailure('attachment-5', 'Network timeout');
    
    // Check thresholds at 20% exactly - should still pass
    let result = enforcer.checkThresholds();
    expect(result.passed).toBe(true);
    expect(result.exceedsThreshold).toBe(false);
    expect(result.shouldFailExport).toBe(false);

    // Add one more failure to exceed 20% threshold (2 failures out of 6 = 33.3%)
    enforcer.recordFailure('attachment-6', 'File not found');
    
    // Now should exceed threshold
    result = enforcer.checkThresholds();
    expect(result.passed).toBe(false);
    expect(result.exceedsThreshold).toBe(true);
    expect(result.shouldFailExport).toBe(true);
    expect(result.message).toContain('33.3%');
    expect(result.message).toContain('20.0%');

    // Verify stats
    const stats = enforcer.getStats();
    expect(stats.totalAttachments).toBe(6);
    expect(stats.failedAttachments).toBe(2);
    expect(stats.failureRate).toBeCloseTo(0.333, 3);
    expect(stats.failedIds).toEqual(['attachment-5', 'attachment-6']);
  });

  it('fails export when absolute threshold exceeded', async () => {
    // Create enforcer with 10% threshold and 25 absolute failure limit 
    // This way we can test absolute threshold with low percentage
    const enforcer = createAttachmentThresholdEnforcer(0.1, 25, true);

    // Record 25 failures and many successes to stay under percentage threshold
    for (let i = 1; i <= 250; i++) {
      enforcer.recordSuccess(`success-${i}`);
    }
    
    // Add 25 failures (25/275 = 9.1%, under 10% threshold)
    for (let i = 1; i <= 25; i++) {
      enforcer.recordFailure(`failure-${i}`, 'Download error');
    }

    // Should pass both thresholds (9.1% under percentage, 25 equals absolute limit)
    let result = enforcer.checkThresholds();
    expect(result.passed).toBe(true);
    expect(result.exceedsThreshold).toBe(false);
    expect(result.shouldFailExport).toBe(false);

    // Add 1 more success and 1 more failure to exceed absolute threshold (26 > 25)
    enforcer.recordSuccess('success-251');
    enforcer.recordFailure('failure-26', 'Permission denied');

    // Should exceed absolute threshold (26 > 25) but be under percentage (26/277 = 9.4%)
    result = enforcer.checkThresholds();
    expect(result.passed).toBe(false);
    expect(result.exceedsThreshold).toBe(true);
    expect(result.shouldFailExport).toBe(true);
    expect(result.message).toContain('26');
    expect(result.message).toContain('absolute threshold');

    // Verify stats
    const stats = enforcer.getStats();
    expect(stats.totalAttachments).toBe(277);
    expect(stats.failedAttachments).toBe(26);
    expect(stats.failureRate).toBeCloseTo(0.094, 3); // Under 10%
  });

  it('passes when thresholds not exceeded', async () => {
    // Create enforcer with 20% threshold and 25 absolute limit
    const enforcer = createAttachmentThresholdEnforcer(0.2, 25, true);

    // Record downloads staying under both thresholds
    for (let i = 1; i <= 50; i++) {
      enforcer.recordSuccess(`success-${i}`);
    }
    
    // Add 10 failures (10/60 = 16.7%, under both thresholds)
    for (let i = 1; i <= 10; i++) {
      enforcer.recordFailure(`failure-${i}`, 'Temporary error');
    }

    // Should pass all thresholds
    const result = enforcer.checkThresholds();
    expect(result.passed).toBe(true);
    expect(result.exceedsThreshold).toBe(false);
    expect(result.shouldFailExport).toBe(false);
    expect(result.message).toContain('16.7%');
    expect(result.message).toContain('within threshold');

    // Verify stats
    const stats = enforcer.getStats();
    expect(stats.totalAttachments).toBe(60);
    expect(stats.failedAttachments).toBe(10);
    expect(stats.failureRate).toBeCloseTo(0.167, 3);
  });

  it('handles zero attachments gracefully', async () => {
    // Create enforcer with standard thresholds
    const enforcer = createAttachmentThresholdEnforcer(0.2, 25, true);

    // Check thresholds with no attachments
    const result = enforcer.checkThresholds();
    expect(result.passed).toBe(true);
    expect(result.exceedsThreshold).toBe(false);
    expect(result.shouldFailExport).toBe(false);
    expect(result.failureRate).toBe(0);

    // Verify stats
    const stats = enforcer.getStats();
    expect(stats.totalAttachments).toBe(0);
    expect(stats.failedAttachments).toBe(0);
    expect(stats.failureRate).toBe(0);
    expect(stats.failedIds).toEqual([]);
  });

  it('validates configuration parameters', async () => {
    // Test invalid percentage threshold
    expect(() => createAttachmentThresholdEnforcer(-0.1)).toThrow('Percentage threshold must be between 0 and 1');
    expect(() => createAttachmentThresholdEnforcer(1.1)).toThrow('Percentage threshold must be between 0 and 1');

    // Test invalid absolute threshold
    expect(() => createAttachmentThresholdEnforcer(0.2, -1)).toThrow('Absolute threshold must be non-negative');

    // Test valid configurations
    expect(() => createAttachmentThresholdEnforcer(0.0)).not.toThrow();
    expect(() => createAttachmentThresholdEnforcer(1.0)).not.toThrow();
    expect(() => createAttachmentThresholdEnforcer(0.2, 0)).not.toThrow();
    expect(() => createAttachmentThresholdEnforcer(0.2, 100)).not.toThrow();
  });
});
