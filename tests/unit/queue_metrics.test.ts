/**
 * T067 Unit: Queue metrics calculation
 */

import { describe, test, expect } from '@jest/globals';

interface QueueMetrics {
  totalQueued: number;
  totalProcessed: number;
  totalFailed: number;
  currentQueueSize: number;
  discoveryRate: number;
  processingRate: number;
  averageRetryCount: number;
  persistenceOperations: number;
  lastPersistenceTime?: string;
}

interface MetricsSnapshot {
  timestamp: number;
  queued: number;
  processed: number;
  failed: number;
  queueSize: number;
}

// Queue metrics calculator for testing
class QueueMetricsCalculator {
  private metrics: QueueMetrics = {
    totalQueued: 0,
    totalProcessed: 0,
    totalFailed: 0,
    currentQueueSize: 0,
    discoveryRate: 0,
    processingRate: 0,
    averageRetryCount: 0,
    persistenceOperations: 0
  };

  private snapshots: MetricsSnapshot[] = [];
  private retryCountSum = 0;
  private retryCountTotal = 0;

  recordQueued(count: number = 1): void {
    this.metrics.totalQueued += count;
    this.metrics.currentQueueSize += count;
    this.recordSnapshot();
  }

  recordProcessed(count: number = 1): void {
    this.metrics.totalProcessed += count;
    this.metrics.currentQueueSize = Math.max(0, this.metrics.currentQueueSize - count);
    this.recordSnapshot();
  }

  recordFailed(count: number = 1, retryCount: number = 0): void {
    this.metrics.totalFailed += count;
    this.metrics.currentQueueSize = Math.max(0, this.metrics.currentQueueSize - count);
    
    // Update retry count average
    this.retryCountSum += retryCount;
    this.retryCountTotal += 1;
    this.metrics.averageRetryCount = this.retryCountTotal > 0 ? 
      this.retryCountSum / this.retryCountTotal : 0;
    
    this.recordSnapshot();
  }

  recordPersistence(): void {
    this.metrics.persistenceOperations += 1;
    this.metrics.lastPersistenceTime = new Date().toISOString();
  }

  calculateRates(windowSeconds: number = 60): void {
    const now = Date.now();
    const windowStart = now - (windowSeconds * 1000);
    
    // Filter snapshots within the time window
    const recentSnapshots = this.snapshots.filter(s => s.timestamp >= windowStart);
    
    if (recentSnapshots.length < 2) {
      this.metrics.discoveryRate = 0;
      this.metrics.processingRate = 0;
      return;
    }

    const first = recentSnapshots[0];
    const last = recentSnapshots[recentSnapshots.length - 1];
    const timeElapsed = (last.timestamp - first.timestamp) / 1000; // seconds

    if (timeElapsed > 0) {
      this.metrics.discoveryRate = (last.queued - first.queued) / timeElapsed;
      this.metrics.processingRate = (last.processed - first.processed) / timeElapsed;
    }
  }

  getMetrics(): QueueMetrics {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      totalQueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      currentQueueSize: 0,
      discoveryRate: 0,
      processingRate: 0,
      averageRetryCount: 0,
      persistenceOperations: 0
    };
    this.snapshots = [];
    this.retryCountSum = 0;
    this.retryCountTotal = 0;
  }

  private recordSnapshot(): void {
    this.snapshots.push({
      timestamp: Date.now(),
      queued: this.metrics.totalQueued,
      processed: this.metrics.totalProcessed,
      failed: this.metrics.totalFailed,
      queueSize: this.metrics.currentQueueSize
    });

    // Keep only recent snapshots (last 100)
    if (this.snapshots.length > 100) {
      this.snapshots = this.snapshots.slice(-100);
    }
  }
}

describe('Queue Metrics Calculation', () => {
  let calculator: QueueMetricsCalculator;

  beforeEach(() => {
    calculator = new QueueMetricsCalculator();
  });

  test('tracks basic queue operations', () => {
    // Initial state
    let metrics = calculator.getMetrics();
    expect(metrics.totalQueued).toBe(0);
    expect(metrics.totalProcessed).toBe(0);
    expect(metrics.totalFailed).toBe(0);
    expect(metrics.currentQueueSize).toBe(0);

    // Add items to queue
    calculator.recordQueued(5);
    metrics = calculator.getMetrics();
    expect(metrics.totalQueued).toBe(5);
    expect(metrics.currentQueueSize).toBe(5);

    // Process some items
    calculator.recordProcessed(3);
    metrics = calculator.getMetrics();
    expect(metrics.totalProcessed).toBe(3);
    expect(metrics.currentQueueSize).toBe(2);

    // Fail one item
    calculator.recordFailed(1, 2); // Failed after 2 retries
    metrics = calculator.getMetrics();
    expect(metrics.totalFailed).toBe(1);
    expect(metrics.currentQueueSize).toBe(1);
  });

  test('calculates retry count average correctly', () => {
    // No failures yet
    let metrics = calculator.getMetrics();
    expect(metrics.averageRetryCount).toBe(0);

    // Record failures with different retry counts
    calculator.recordFailed(1, 0); // Failed immediately
    metrics = calculator.getMetrics();
    expect(metrics.averageRetryCount).toBe(0);

    calculator.recordFailed(1, 3); // Failed after 3 retries
    metrics = calculator.getMetrics();
    expect(metrics.averageRetryCount).toBe(1.5); // (0 + 3) / 2

    calculator.recordFailed(1, 2); // Failed after 2 retries
    metrics = calculator.getMetrics();
    expect(Math.round(metrics.averageRetryCount * 100) / 100).toBe(1.67); // (0 + 3 + 2) / 3 ≈ 1.67
  });

  test('tracks persistence operations', async () => {
    let metrics = calculator.getMetrics();
    expect(metrics.persistenceOperations).toBe(0);
    expect(metrics.lastPersistenceTime).toBeUndefined();

    // Record persistence
    calculator.recordPersistence();
    metrics = calculator.getMetrics();
    expect(metrics.persistenceOperations).toBe(1);
    expect(metrics.lastPersistenceTime).toBeTruthy();

    const firstTime = metrics.lastPersistenceTime;

    // Wait a bit to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 10));

    // Record another persistence
    calculator.recordPersistence();
    metrics = calculator.getMetrics();
    expect(metrics.persistenceOperations).toBe(2);
    expect(metrics.lastPersistenceTime).not.toBe(firstTime);
  });

  test('calculates discovery and processing rates', async () => {
    // Record initial state
    calculator.recordQueued(10);
    
    // Wait a bit and record more activity
    await new Promise(resolve => setTimeout(resolve, 100));
    
    calculator.recordQueued(5); // 5 more discovered
    calculator.recordProcessed(8); // 8 processed
    
    // Calculate rates
    calculator.calculateRates(1); // 1 second window
    
    const metrics = calculator.getMetrics();
    
    // Discovery rate should be positive (items added)
    expect(metrics.discoveryRate).toBeGreaterThan(0);
    
    // Processing rate should be positive (items processed)
    expect(metrics.processingRate).toBeGreaterThan(0);
  });

  test('handles zero rates when no activity in window', () => {
    // Record some activity
    calculator.recordQueued(5);
    calculator.recordProcessed(3);
    
    // Calculate rates with no recent activity
    calculator.calculateRates(60);
    
    const metrics = calculator.getMetrics();
    
    // Rates should be zero with insufficient data points
    expect(metrics.discoveryRate).toBe(0);
    expect(metrics.processingRate).toBe(0);
  });

  test('maintains current queue size correctly with mixed operations', () => {
    let metrics = calculator.getMetrics();
    expect(metrics.currentQueueSize).toBe(0);

    // Add items
    calculator.recordQueued(10);
    metrics = calculator.getMetrics();
    expect(metrics.currentQueueSize).toBe(10);

    // Process some
    calculator.recordProcessed(4);
    metrics = calculator.getMetrics();
    expect(metrics.currentQueueSize).toBe(6);

    // Fail some
    calculator.recordFailed(2);
    metrics = calculator.getMetrics();
    expect(metrics.currentQueueSize).toBe(4);

    // Add more
    calculator.recordQueued(3);
    metrics = calculator.getMetrics();
    expect(metrics.currentQueueSize).toBe(7);

    // Process all remaining
    calculator.recordProcessed(7);
    metrics = calculator.getMetrics();
    expect(metrics.currentQueueSize).toBe(0);
  });

  test('prevents negative queue sizes', () => {
    // Start with some items
    calculator.recordQueued(5);
    
    // Try to process more than queued (edge case)
    calculator.recordProcessed(10);
    
    const metrics = calculator.getMetrics();
    expect(metrics.currentQueueSize).toBe(0); // Should not go negative
    expect(metrics.totalProcessed).toBe(10); // But total should still be recorded
  });

  test('resets all metrics correctly', () => {
    // Record various activities
    calculator.recordQueued(10);
    calculator.recordProcessed(5);
    calculator.recordFailed(2, 3);
    calculator.recordPersistence();

    // Verify metrics have values
    let metrics = calculator.getMetrics();
    expect(metrics.totalQueued).toBeGreaterThan(0);
    expect(metrics.totalProcessed).toBeGreaterThan(0);
    expect(metrics.totalFailed).toBeGreaterThan(0);
    expect(metrics.persistenceOperations).toBeGreaterThan(0);

    // Reset
    calculator.reset();

    // Verify all metrics are reset
    metrics = calculator.getMetrics();
    expect(metrics.totalQueued).toBe(0);
    expect(metrics.totalProcessed).toBe(0);
    expect(metrics.totalFailed).toBe(0);
    expect(metrics.currentQueueSize).toBe(0);
    expect(metrics.discoveryRate).toBe(0);
    expect(metrics.processingRate).toBe(0);
    expect(metrics.averageRetryCount).toBe(0);
    expect(metrics.persistenceOperations).toBe(0);
    expect(metrics.lastPersistenceTime).toBeUndefined();
  });

  test('calculates success and failure rates', () => {
    calculator.recordQueued(100);
    calculator.recordProcessed(85);
    calculator.recordFailed(10);
    
    const metrics = calculator.getMetrics();
    
    // Calculate derived metrics
    const totalCompleted = metrics.totalProcessed + metrics.totalFailed;
    const successRate = totalCompleted > 0 ? metrics.totalProcessed / totalCompleted : 0;
    const failureRate = totalCompleted > 0 ? metrics.totalFailed / totalCompleted : 0;
    
    expect(totalCompleted).toBe(95);
    expect(successRate).toBeCloseTo(0.895, 3); // 85/95 ≈ 0.895
    expect(failureRate).toBeCloseTo(0.105, 3); // 10/95 ≈ 0.105
    expect(successRate + failureRate).toBeCloseTo(1.0, 10);
  });

  test('handles bulk operations efficiently', () => {
    // Record bulk operations
    calculator.recordQueued(1000);
    calculator.recordProcessed(800);
    calculator.recordFailed(150, 2);
    
    const metrics = calculator.getMetrics();
    
    expect(metrics.totalQueued).toBe(1000);
    expect(metrics.totalProcessed).toBe(800);
    expect(metrics.totalFailed).toBe(150);
    expect(metrics.currentQueueSize).toBe(50); // 1000 - 800 - 150
    expect(metrics.averageRetryCount).toBe(2); // All failed items had 2 retries
  });

  test('provides immutable metrics snapshots', () => {
    calculator.recordQueued(5);
    
    const metrics1 = calculator.getMetrics();
    const metrics2 = calculator.getMetrics();
    
    // Should be different object instances
    expect(metrics1).not.toBe(metrics2);
    
    // But should have same values
    expect(metrics1).toEqual(metrics2);
    
    // Modifying returned object should not affect internal state
    metrics1.totalQueued = 999;
    const metrics3 = calculator.getMetrics();
    expect(metrics3.totalQueued).toBe(5); // Original value preserved
  });
});
