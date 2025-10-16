/**
 * Queue Analytics and Reporting
 * Implements T138b: Detailed queue statistics and trends analysis
 */

import type { DownloadQueue, QueueMetrics } from '../models/queueEntities.js';

export interface QueueAnalytics {
  // Performance metrics
  throughputStats: ThroughputStats;
  latencyStats: LatencyStats;
  errorStats: ErrorStats;
  
  // Queue behavior analytics
  queueGrowthTrend: GrowthTrend;
  discoveryPatterns: DiscoveryPattern[];
  retryAnalysis: RetryAnalysis;
  
  // Resource utilization
  memoryUsageTrend: MemoryTrend;
  processingDistribution: ProcessingDistribution;
  
  // Time-based analysis
  peakUsageHours: number[];
  averageProcessingTime: number;
  predictedCompletionTime?: number;
}

export interface ThroughputStats {
  currentThroughput: number; // items/second
  peakThroughput: number;
  averageThroughput: number;
  throughputHistory: Array<{ timestamp: number; value: number }>;
}

export interface LatencyStats {
  averageLatency: number; // ms
  p50Latency: number;
  p90Latency: number;
  p99Latency: number;
  latencyHistory: Array<{ timestamp: number; value: number }>;
}

export interface ErrorStats {
  totalErrors: number;
  errorRate: number; // percentage
  errorsByType: Record<string, number>;
  recentErrors: Array<{ timestamp: number; type: string; message: string }>;
}

export interface GrowthTrend {
  direction: 'growing' | 'shrinking' | 'stable';
  rate: number; // items per minute
  projectedSize: number;
  trendHistory: Array<{ timestamp: number; size: number }>;
}

export interface DiscoveryPattern {
  sourceType: string;
  percentage: number;
  averageDiscoveryDepth: number;
  mostCommonParents: string[];
}

export interface RetryAnalysis {
  averageRetries: number;
  retrySuccessRate: number;
  itemsRequiringRetries: number;
  retryReasons: Record<string, number>;
}

export interface MemoryTrend {
  currentUsage: number; // MB
  peakUsage: number;
  averageUsage: number;
  projectedUsage: number;
  usageHistory: Array<{ timestamp: number; value: number }>;
}

export interface ProcessingDistribution {
  bySourceType: Record<string, number>;
  byHour: Record<number, number>;
  byRetryCount: Record<number, number>;
}

/**
 * Queue analytics service that tracks and analyzes queue performance
 */
export class QueueAnalyticsService {
  private metricsHistory: QueueMetrics[] = [];
  private latencyMeasurements: number[] = [];
  private errorHistory: Array<{ timestamp: number; type: string; message: string }> = [];
  private throughputMeasurements: Array<{ timestamp: number; value: number }> = [];
  private memoryMeasurements: Array<{ timestamp: number; value: number }> = [];
  
  constructor(private maxHistorySize = 1000) {}

  /**
   * Records queue metrics for analytics
   */
  recordMetrics(metrics: QueueMetrics): void {
    this.metricsHistory.push({ ...metrics });
    
    // Keep history within limits
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }

    // Record throughput
    this.throughputMeasurements.push({
      timestamp: Date.now(),
      value: metrics.processingRate,
    });

    // Record memory usage
    const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // MB
    this.memoryMeasurements.push({
      timestamp: Date.now(),
      value: memoryUsage,
    });

    // Cleanup old measurements
    this.cleanupOldMeasurements();
  }

  /**
   * Records latency measurement
   */
  recordLatency(latencyMs: number): void {
    this.latencyMeasurements.push(latencyMs);
    
    // Keep only recent measurements
    if (this.latencyMeasurements.length > this.maxHistorySize) {
      this.latencyMeasurements.shift();
    }
  }

  /**
   * Records error for analytics
   */
  recordError(type: string, message: string): void {
    this.errorHistory.push({
      timestamp: Date.now(),
      type,
      message,
    });

    // Keep error history within limits
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
  }

  /**
   * Generates comprehensive analytics report
   */
  generateAnalytics(queue: DownloadQueue): QueueAnalytics {
    return {
      throughputStats: this.calculateThroughputStats(),
      latencyStats: this.calculateLatencyStats(),
      errorStats: this.calculateErrorStats(),
      queueGrowthTrend: this.calculateGrowthTrend(),
      discoveryPatterns: this.analyzeDiscoveryPatterns(queue),
      retryAnalysis: this.analyzeRetries(queue),
      memoryUsageTrend: this.calculateMemoryTrend(),
      processingDistribution: this.calculateProcessingDistribution(queue),
      peakUsageHours: this.calculatePeakUsageHours(),
      averageProcessingTime: this.calculateAverageProcessingTime(),
      predictedCompletionTime: this.predictCompletionTime(queue),
    };
  }

  /**
   * Calculates throughput statistics
   */
  private calculateThroughputStats(): ThroughputStats {
    const recentMeasurements = this.throughputMeasurements.slice(-100);
    const currentThroughput = recentMeasurements.length > 0 
      ? recentMeasurements[recentMeasurements.length - 1].value 
      : 0;

    const values = recentMeasurements.map(m => m.value);
    const peakThroughput = Math.max(...values, 0);
    const averageThroughput = values.length > 0 
      ? values.reduce((sum, val) => sum + val, 0) / values.length 
      : 0;

    return {
      currentThroughput,
      peakThroughput,
      averageThroughput,
      throughputHistory: recentMeasurements,
    };
  }

  /**
   * Calculates latency statistics
   */
  private calculateLatencyStats(): LatencyStats {
    if (this.latencyMeasurements.length === 0) {
      return {
        averageLatency: 0,
        p50Latency: 0,
        p90Latency: 0,
        p99Latency: 0,
        latencyHistory: [],
      };
    }

    const sorted = [...this.latencyMeasurements].sort((a, b) => a - b);
    const averageLatency = sorted.reduce((sum, val) => sum + val, 0) / sorted.length;
    
    return {
      averageLatency,
      p50Latency: sorted[Math.floor(sorted.length * 0.5)],
      p90Latency: sorted[Math.floor(sorted.length * 0.9)],
      p99Latency: sorted[Math.floor(sorted.length * 0.99)],
      latencyHistory: this.latencyMeasurements.slice(-100).map((value, index) => ({
        timestamp: Date.now() - (this.latencyMeasurements.length - index) * 1000,
        value,
      })),
    };
  }

  /**
   * Calculates error statistics
   */
  private calculateErrorStats(): ErrorStats {
    const recentErrors = this.errorHistory.slice(-100);
    const totalErrors = recentErrors.length;
    
    const errorsByType: Record<string, number> = {};
    for (const error of recentErrors) {
      errorsByType[error.type] = (errorsByType[error.type] || 0) + 1;
    }

    const totalOperations = this.metricsHistory.length > 0 
      ? this.metricsHistory[this.metricsHistory.length - 1].totalProcessed 
      : 1;
    const errorRate = (totalErrors / totalOperations) * 100;

    return {
      totalErrors,
      errorRate,
      errorsByType,
      recentErrors,
    };
  }

  /**
   * Calculates queue growth trend
   */
  private calculateGrowthTrend(): GrowthTrend {
    if (this.metricsHistory.length < 2) {
      return {
        direction: 'stable',
        rate: 0,
        projectedSize: 0,
        trendHistory: [],
      };
    }

    const recent = this.metricsHistory.slice(-10);
    const sizes = recent.map(m => m.currentQueueSize);
    const trendHistory = recent.map((m, index) => ({
      timestamp: Date.now() - (recent.length - index) * 60000, // 1 minute intervals
      size: m.currentQueueSize,
    }));

    // Calculate linear trend
    const n = sizes.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = sizes.reduce((sum, val) => sum + val, 0);
    const sumXY = sizes.reduce((sum, val, index) => sum + val * index, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const rate = slope * 60; // Convert to items per minute

    let direction: GrowthTrend['direction'] = 'stable';
    if (Math.abs(rate) > 1) {
      direction = rate > 0 ? 'growing' : 'shrinking';
    }

    const currentSize = sizes[sizes.length - 1];
    const projectedSize = Math.max(0, currentSize + rate * 10); // 10 minutes projection

    return {
      direction,
      rate,
      projectedSize,
      trendHistory,
    };
  }

  /**
   * Analyzes discovery patterns
   */
  private analyzeDiscoveryPatterns(queue: DownloadQueue): DiscoveryPattern[] {
    const patterns: Record<string, { count: number; depths: number[]; parents: string[] }> = {};

    for (const item of queue.items.values()) {
      if (!patterns[item.sourceType]) {
        patterns[item.sourceType] = { count: 0, depths: [], parents: [] };
      }
      
      patterns[item.sourceType].count++;
      if (item.parentPageId) {
        patterns[item.sourceType].parents.push(item.parentPageId);
      }
    }

    const totalItems = queue.items.size;
    
    return Object.entries(patterns).map(([sourceType, data]) => ({
      sourceType,
      percentage: (data.count / totalItems) * 100,
      averageDiscoveryDepth: data.depths.length > 0 
        ? data.depths.reduce((sum, d) => sum + d, 0) / data.depths.length 
        : 1,
      mostCommonParents: this.getMostCommon(data.parents, 5),
    }));
  }

  /**
   * Analyzes retry patterns
   */
  private analyzeRetries(queue: DownloadQueue): RetryAnalysis {
    const items = Array.from(queue.items.values());
    const itemsWithRetries = items.filter(item => item.retryCount > 0);
    
    const totalRetries = items.reduce((sum, item) => sum + item.retryCount, 0);
    const averageRetries = items.length > 0 ? totalRetries / items.length : 0;
    const retrySuccessRate = itemsWithRetries.length > 0 
      ? (itemsWithRetries.filter(item => item.status === 'completed').length / itemsWithRetries.length) * 100
      : 100;

    return {
      averageRetries,
      retrySuccessRate,
      itemsRequiringRetries: itemsWithRetries.length,
      retryReasons: {}, // Would need to track reasons in real implementation
    };
  }

  /**
   * Calculates memory usage trend
   */
  private calculateMemoryTrend(): MemoryTrend {
    const recentMeasurements = this.memoryMeasurements.slice(-100);
    const values = recentMeasurements.map(m => m.value);
    
    const currentUsage = values.length > 0 ? values[values.length - 1] : 0;
    const peakUsage = Math.max(...values, 0);
    const averageUsage = values.length > 0 
      ? values.reduce((sum, val) => sum + val, 0) / values.length 
      : 0;

    // Simple linear projection
    const projectedUsage = values.length >= 2 
      ? currentUsage + (values[values.length - 1] - values[values.length - 2]) * 10
      : currentUsage;

    return {
      currentUsage,
      peakUsage,
      averageUsage,
      projectedUsage: Math.max(0, projectedUsage),
      usageHistory: recentMeasurements,
    };
  }

  /**
   * Calculates processing distribution
   */
  private calculateProcessingDistribution(queue: DownloadQueue): ProcessingDistribution {
    const bySourceType: Record<string, number> = {};
    const byHour: Record<number, number> = {};
    const byRetryCount: Record<number, number> = {};

    for (const item of queue.items.values()) {
      // By source type
      bySourceType[item.sourceType] = (bySourceType[item.sourceType] || 0) + 1;

      // By hour (based on discovery timestamp)
      const hour = new Date(item.discoveryTimestamp).getHours();
      byHour[hour] = (byHour[hour] || 0) + 1;

      // By retry count
      byRetryCount[item.retryCount] = (byRetryCount[item.retryCount] || 0) + 1;
    }

    return { bySourceType, byHour, byRetryCount };
  }

  /**
   * Calculates peak usage hours
   */
  private calculatePeakUsageHours(): number[] {
    const hourCounts: Record<number, number> = {};
    
    for (const _metrics of this.metricsHistory) {
      const hour = new Date().getHours(); // Simplified - would use metrics timestamp
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }

    return Object.entries(hourCounts)
      .sort(([_a, countA], [_b, countB]) => countB - countA)
      .slice(0, 3)
      .map(([hour]) => parseInt(hour, 10));
  }

  /**
   * Calculates average processing time
   */
  private calculateAverageProcessingTime(): number {
    return this.latencyMeasurements.length > 0
      ? this.latencyMeasurements.reduce((sum, val) => sum + val, 0) / this.latencyMeasurements.length
      : 0;
  }

  /**
   * Predicts completion time based on current trends
   */
  private predictCompletionTime(queue: DownloadQueue): number | undefined {
    const currentThroughput = this.throughputMeasurements.length > 0
      ? this.throughputMeasurements[this.throughputMeasurements.length - 1].value
      : 0;

    if (currentThroughput <= 0 || queue.items.size === 0) {
      return undefined;
    }

    const remainingItems = Array.from(queue.items.values())
      .filter(item => item.status === 'pending').length;

    return Date.now() + (remainingItems / currentThroughput) * 1000;
  }

  /**
   * Gets most common items from array
   */
  private getMostCommon<T>(items: T[], limit: number): T[] {
    const counts: Record<string, number> = {};
    
    for (const item of items) {
      const key = String(item);
      counts[key] = (counts[key] || 0) + 1;
    }

    return Object.entries(counts)
      .sort(([_a, countA], [_b, countB]) => countB - countA)
      .slice(0, limit)
      .map(([key]) => key as T);
  }

  /**
   * Cleans up old measurements to prevent memory leaks
   */
  private cleanupOldMeasurements(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours

    this.throughputMeasurements = this.throughputMeasurements.filter(
      m => m.timestamp > cutoffTime
    );

    this.memoryMeasurements = this.memoryMeasurements.filter(
      m => m.timestamp > cutoffTime
    );

    this.errorHistory = this.errorHistory.filter(
      e => e.timestamp > cutoffTime
    );
  }

  /**
   * Exports analytics data for external analysis
   */
  exportAnalyticsData(): {
    metricsHistory: QueueMetrics[];
    latencyMeasurements: number[];
    errorHistory: Array<{ timestamp: number; type: string; message: string }>;
    throughputHistory: Array<{ timestamp: number; value: number }>;
    memoryHistory: Array<{ timestamp: number; value: number }>;
  } {
    return {
      metricsHistory: this.metricsHistory,
      latencyMeasurements: this.latencyMeasurements,
      errorHistory: this.errorHistory,
      throughputHistory: this.throughputMeasurements,
      memoryHistory: this.memoryMeasurements,
    };
  }
}

export const createQueueAnalyticsService = (maxHistorySize?: number): QueueAnalyticsService => {
  return new QueueAnalyticsService(maxHistorySize);
};
