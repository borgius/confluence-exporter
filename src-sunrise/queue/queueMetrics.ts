/**
 * T086: Queue metrics calculation and tracking
 * Implements FR-040 for queue performance monitoring
 */

import type { QueueMetrics, IQueueMetrics } from '../models/queueEntities.js';

export interface MetricsWindow {
  startTime: number;
  endTime: number;
  operations: Array<{
    timestamp: number;
    type: 'queued' | 'processed' | 'failed' | 'persistence';
    count: number;
    retryCount?: number;
  }>;
}

export class QueueMetricsTracker implements IQueueMetrics {
  private metrics: QueueMetrics;
  private windows: MetricsWindow[] = [];
  private readonly maxWindows = 10;
  private readonly windowDurationMs = 60000; // 1 minute windows

  constructor(initialMetrics?: Partial<QueueMetrics>) {
    this.metrics = {
      totalQueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      currentQueueSize: 0,
      discoveryRate: 0,
      processingRate: 0,
      averageRetryCount: 0,
      persistenceOperations: 0,
      lastPersistenceTime: new Date().toISOString(),
      ...initialMetrics,
    };
    
    this.startNewWindow();
  }

  recordQueued(count: number = 1): void {
    this.metrics.totalQueued += count;
    this.metrics.currentQueueSize += count;
    this.addOperation('queued', count);
    this.updateRates();
  }

  recordProcessed(count: number = 1): void {
    this.metrics.totalProcessed += count;
    this.metrics.currentQueueSize = Math.max(0, this.metrics.currentQueueSize - count);
    this.addOperation('processed', count);
    this.updateRates();
  }

  recordFailed(count: number = 1, retryCount: number = 0): void {
    this.metrics.totalFailed += count;
    this.addOperation('failed', count, retryCount);
    this.updateAverageRetryCount(retryCount);
    this.updateRates();
  }

  recordPersistence(): void {
    this.metrics.persistenceOperations += 1;
    this.metrics.lastPersistenceTime = new Date().toISOString();
    this.addOperation('persistence', 1);
  }

  calculateRates(windowSeconds: number = 60): void {
    const windowMs = windowSeconds * 1000;
    const now = Date.now();
    const cutoff = now - windowMs;

    // Get operations within the time window
    const recentOps = this.getCurrentWindow().operations.filter(
      op => op.timestamp >= cutoff
    );

    // Calculate rates
    const processedOps = recentOps.filter(op => op.type === 'processed');
    const queuedOps = recentOps.filter(op => op.type === 'queued');

    const totalProcessed = processedOps.reduce((sum, op) => sum + op.count, 0);
    const totalQueued = queuedOps.reduce((sum, op) => sum + op.count, 0);

    // Rates per second
    this.metrics.processingRate = totalProcessed / windowSeconds;
    this.metrics.discoveryRate = totalQueued / windowSeconds;
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
      persistenceOperations: 0,
      lastPersistenceTime: new Date().toISOString(),
    };
    this.windows = [];
    this.startNewWindow();
  }

  updateCurrentQueueSize(size: number): void {
    this.metrics.currentQueueSize = size;
  }

  getProcessingTrend(windowCount: number = 5): number {
    if (this.windows.length < 2) {
      return 0;
    }

    const recentWindows = this.windows.slice(-Math.min(windowCount, this.windows.length));
    
    if (recentWindows.length < 2) {
      return 0;
    }

    const rates = recentWindows.map(window => {
      const processed = window.operations
        .filter(op => op.type === 'processed')
        .reduce((sum, op) => sum + op.count, 0);
      const duration = (window.endTime - window.startTime) / 1000;
      return duration > 0 ? processed / duration : 0;
    });

    // Simple linear trend (positive = improving rate, negative = declining rate)
    const firstRate = rates[0];
    const lastRate = rates[rates.length - 1];
    
    return lastRate - firstRate;
  }

  getQueueEfficiency(): number {
    if (this.metrics.totalQueued === 0) {
      return 1; // Perfect efficiency if nothing queued
    }

    const successRate = this.metrics.totalProcessed / this.metrics.totalQueued;
    return Math.min(1, Math.max(0, successRate));
  }

  getPersistenceHealth(): {
    healthy: boolean;
    lastPersistenceAgeMs: number;
    persistenceRate: number;
  } {
    const lastPersistenceTime = this.metrics.lastPersistenceTime 
      ? new Date(this.metrics.lastPersistenceTime).getTime()
      : 0;
    
    const now = Date.now();
    const ageMs = now - lastPersistenceTime;
    
    // Calculate persistence rate over recent windows
    const recentOps = this.getCurrentWindow().operations.filter(
      op => op.type === 'persistence'
    );
    const persistenceRate = recentOps.length / (this.windowDurationMs / 1000 / 60); // per minute

    // Healthy if persisted within last 5 minutes
    const healthy = ageMs < 5 * 60 * 1000;

    return {
      healthy,
      lastPersistenceAgeMs: ageMs,
      persistenceRate,
    };
  }

  getFailureAnalysis(): {
    failureRate: number;
    averageRetryCount: number;
    recentFailures: number;
    failureTrend: 'improving' | 'stable' | 'worsening';
  } {
    const failureRate = this.metrics.totalQueued > 0 
      ? this.metrics.totalFailed / this.metrics.totalQueued 
      : 0;

    // Count recent failures (last window)
    const currentWindow = this.getCurrentWindow();
    const recentFailures = currentWindow.operations
      .filter(op => op.type === 'failed')
      .reduce((sum, op) => sum + op.count, 0);

    // Determine trend by comparing recent vs historical failure rates
    let failureTrend: 'improving' | 'stable' | 'worsening' = 'stable';
    
    if (this.windows.length >= 2) {
      const currentWindowRate = this.calculateWindowFailureRate(currentWindow);
      const previousWindow = this.windows[this.windows.length - 2];
      const previousWindowRate = this.calculateWindowFailureRate(previousWindow);

      const difference = currentWindowRate - previousWindowRate;
      if (difference > 0.1) {
        failureTrend = 'worsening';
      } else if (difference < -0.1) {
        failureTrend = 'improving';
      }
    }

    return {
      failureRate,
      averageRetryCount: this.metrics.averageRetryCount,
      recentFailures,
      failureTrend,
    };
  }

  private calculateWindowFailureRate(window: MetricsWindow): number {
    const totalOps = window.operations.reduce((sum, op) => sum + op.count, 0);
    const failedOps = window.operations
      .filter(op => op.type === 'failed')
      .reduce((sum, op) => sum + op.count, 0);
    
    return totalOps > 0 ? failedOps / totalOps : 0;
  }

  private addOperation(
    type: 'queued' | 'processed' | 'failed' | 'persistence',
    count: number,
    retryCount?: number
  ): void {
    const currentWindow = this.getCurrentWindow();
    currentWindow.operations.push({
      timestamp: Date.now(),
      type,
      count,
      retryCount,
    });

    // Start new window if current one is full
    if (Date.now() - currentWindow.startTime >= this.windowDurationMs) {
      this.startNewWindow();
    }
  }

  private updateRates(): void {
    this.calculateRates();
  }

  private updateAverageRetryCount(newRetryCount: number): void {
    const totalFailures = this.metrics.totalFailed;
    if (totalFailures === 1) {
      this.metrics.averageRetryCount = newRetryCount;
    } else {
      // Running average
      const currentAverage = this.metrics.averageRetryCount;
      this.metrics.averageRetryCount = 
        (currentAverage * (totalFailures - 1) + newRetryCount) / totalFailures;
    }
  }

  private startNewWindow(): void {
    const now = Date.now();
    const newWindow: MetricsWindow = {
      startTime: now,
      endTime: now + this.windowDurationMs,
      operations: [],
    };

    this.windows.push(newWindow);

    // Remove old windows to prevent memory growth
    if (this.windows.length > this.maxWindows) {
      this.windows.shift();
    }
  }

  private getCurrentWindow(): MetricsWindow {
    if (this.windows.length === 0) {
      this.startNewWindow();
    }
    return this.windows[this.windows.length - 1];
  }
}

/**
 * Factory function for creating queue metrics tracker.
 */
export function createQueueMetrics(initialMetrics?: Partial<QueueMetrics>): QueueMetricsTracker {
  return new QueueMetricsTracker(initialMetrics);
}

/**
 * Utility for merging multiple metrics objects.
 */
export function mergeQueueMetrics(...metricsArray: QueueMetrics[]): QueueMetrics {
  if (metricsArray.length === 0) {
    return createQueueMetrics().getMetrics();
  }

  if (metricsArray.length === 1) {
    return { ...metricsArray[0] };
  }

  const merged: QueueMetrics = {
    totalQueued: 0,
    totalProcessed: 0,
    totalFailed: 0,
    currentQueueSize: 0,
    discoveryRate: 0,
    processingRate: 0,
    averageRetryCount: 0,
    persistenceOperations: 0,
  };

  let totalRetrySum = 0;
  let discoveryRateSum = 0;
  let processingRateSum = 0;
  let latestPersistenceTime = '';

  for (const metrics of metricsArray) {
    merged.totalQueued += metrics.totalQueued;
    merged.totalProcessed += metrics.totalProcessed;
    merged.totalFailed += metrics.totalFailed;
    merged.currentQueueSize += metrics.currentQueueSize;
    merged.persistenceOperations += metrics.persistenceOperations;

    totalRetrySum += metrics.averageRetryCount * metrics.totalFailed;
    discoveryRateSum += metrics.discoveryRate;
    processingRateSum += metrics.processingRate;

    if (metrics.lastPersistenceTime && 
        (!latestPersistenceTime || metrics.lastPersistenceTime > latestPersistenceTime)) {
      latestPersistenceTime = metrics.lastPersistenceTime;
    }
  }

  // Calculate averages
  merged.averageRetryCount = merged.totalFailed > 0 ? totalRetrySum / merged.totalFailed : 0;
  merged.discoveryRate = discoveryRateSum / metricsArray.length;
  merged.processingRate = processingRateSum / metricsArray.length;
  merged.lastPersistenceTime = latestPersistenceTime || new Date().toISOString();

  return merged;
}

/**
 * Calculate queue performance score (0-100).
 */
export function calculateQueuePerformanceScore(metrics: QueueMetrics): number {
  const efficiency = metrics.totalQueued > 0 
    ? metrics.totalProcessed / metrics.totalQueued 
    : 1;

  const failureRate = metrics.totalQueued > 0 
    ? metrics.totalFailed / metrics.totalQueued 
    : 0;

  const retryPenalty = Math.min(0.5, metrics.averageRetryCount / 10);
  
  // Base score from efficiency (0-70 points)
  const efficiencyScore = efficiency * 70;
  
  // Penalty for failures (0-20 points deducted)
  const failurePenalty = failureRate * 20;
  
  // Penalty for retries (0-10 points deducted)
  const retryPenaltyScore = retryPenalty * 10;

  const score = Math.max(0, efficiencyScore - failurePenalty - retryPenaltyScore);
  return Math.min(100, score);
}

/**
 * Create metrics summary for reporting.
 */
export function createMetricsSummary(metrics: QueueMetrics): {
  totalItems: number;
  successRate: number;
  failureRate: number;
  averageRetryCount: number;
  currentLoad: number;
  processingRate: number;
  discoveryRate: number;
  performanceScore: number;
} {
  const totalItems = metrics.totalQueued;
  const successRate = totalItems > 0 ? metrics.totalProcessed / totalItems : 0;
  const failureRate = totalItems > 0 ? metrics.totalFailed / totalItems : 0;
  const currentLoad = metrics.currentQueueSize;
  
  return {
    totalItems,
    successRate: Math.round(successRate * 100) / 100,
    failureRate: Math.round(failureRate * 100) / 100,
    averageRetryCount: Math.round(metrics.averageRetryCount * 100) / 100,
    currentLoad,
    processingRate: Math.round(metrics.processingRate * 100) / 100,
    discoveryRate: Math.round(metrics.discoveryRate * 100) / 100,
    performanceScore: Math.round(calculateQueuePerformanceScore(metrics)),
  };
}
