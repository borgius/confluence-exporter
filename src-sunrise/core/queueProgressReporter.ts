/**
 * T131c: Queue progress reporting integration
 * Reports queue status in export progress
 */

import type { QueueMetrics, DownloadQueue } from '../models/queueEntities.js';
import { logger } from '../util/logger.js';

export interface QueueProgressSnapshot {
  timestamp: number;
  queueSize: number;
  processedCount: number;
  totalQueued: number;
  failedCount: number;
  discoveryRate: number;
  processingRate: number;
  averageRetryCount: number;
  estimatedTimeRemaining?: number;
  currentPhase: QueuePhase;
  discoveryComplete: boolean;
}

export type QueuePhase = 
  | 'initialization'
  | 'discovery'
  | 'processing'
  | 'finalizing'
  | 'completed'
  | 'failed';

export interface ProgressReportConfig {
  reportIntervalMs: number;
  includeDetailedMetrics: boolean;
  includeEstimates: boolean;
  logLevel: 'debug' | 'info' | 'warn';
  onProgress?: (snapshot: QueueProgressSnapshot) => void;
}

export interface QueueProgressTrend {
  direction: 'increasing' | 'decreasing' | 'stable';
  rate: number; // items per second
  confidence: number; // 0-1
}

export class QueueProgressReporter {
  private readonly config: ProgressReportConfig;
  private progressHistory: QueueProgressSnapshot[] = [];
  private lastReportTime = 0;
  private currentPhase: QueuePhase = 'initialization';
  private discoveryComplete = false;
  private readonly maxHistorySize = 100;

  constructor(config: Partial<ProgressReportConfig> = {}) {
    this.config = {
      reportIntervalMs: 5000, // 5 seconds
      includeDetailedMetrics: true,
      includeEstimates: true,
      logLevel: 'info',
      ...config,
    };
  }

  /**
   * Update progress with current queue state
   */
  updateProgress(queue: DownloadQueue, phase?: QueuePhase): QueueProgressSnapshot {
    if (phase) {
      this.currentPhase = phase;
    }

    const snapshot = this.createProgressSnapshot(queue);
    this.addToHistory(snapshot);

    // Report if enough time has passed
    if (this.shouldReport(snapshot)) {
      this.reportProgress(snapshot);
      this.lastReportTime = snapshot.timestamp;
    }

    return snapshot;
  }

  /**
   * Mark discovery as complete
   */
  markDiscoveryComplete(): void {
    this.discoveryComplete = true;
    if (this.currentPhase === 'discovery') {
      this.currentPhase = 'processing';
    }
    logger.info('Queue discovery phase completed');
  }

  /**
   * Set current processing phase
   */
  setPhase(phase: QueuePhase): void {
    if (this.currentPhase !== phase) {
      logger.debug('Queue phase transition', {
        from: this.currentPhase,
        to: phase,
      });
      this.currentPhase = phase;
    }
  }

  /**
   * Generate final progress report
   */
  generateFinalReport(queue: DownloadQueue): QueueProgressSummary {
    const finalSnapshot = this.createProgressSnapshot(queue);
    const summary = this.createProgressSummary(finalSnapshot);
    
    logger.info('Final queue progress report', {
      phase: summary.final.currentPhase,
      processed: summary.final.processedCount,
      failed: summary.final.failedCount,
      efficiency: summary.performance.efficiency,
      totalDuration: summary.performance.totalTimeElapsed,
    });
    return summary;
  }

  /**
   * Get current progress trends
   */
  getProgressTrends(): {
    processing: QueueProgressTrend;
    discovery: QueueProgressTrend;
    overall: QueueProgressTrend;
  } {
    const recentSnapshots = this.getRecentSnapshots(10);
    
    return {
      processing: this.calculateTrend(recentSnapshots, 'processing'),
      discovery: this.calculateTrend(recentSnapshots, 'discovery'),
      overall: this.calculateTrend(recentSnapshots, 'overall'),
    };
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(): QueuePerformanceStats {
    if (this.progressHistory.length < 2) {
      return {
        averageProcessingRate: 0,
        peakProcessingRate: 0,
        averageDiscoveryRate: 0,
        peakDiscoveryRate: 0,
        totalTimeElapsed: 0,
        efficiency: 0,
      };
    }

    const first = this.progressHistory[0];
    const latest = this.progressHistory[this.progressHistory.length - 1];
    const totalTime = (latest.timestamp - first.timestamp) / 1000; // seconds

    const processingRates = this.progressHistory.map(s => s.processingRate);
    const discoveryRates = this.progressHistory.map(s => s.discoveryRate);

    return {
      averageProcessingRate: this.calculateAverage(processingRates),
      peakProcessingRate: Math.max(...processingRates),
      averageDiscoveryRate: this.calculateAverage(discoveryRates),
      peakDiscoveryRate: Math.max(...discoveryRates),
      totalTimeElapsed: totalTime,
      efficiency: this.calculateEfficiency(latest),
    };
  }

  /**
   * Reset progress tracking
   */
  reset(): void {
    this.progressHistory = [];
    this.lastReportTime = 0;
    this.currentPhase = 'initialization';
    this.discoveryComplete = false;
    logger.debug('Queue progress reporter reset');
  }

  private createProgressSnapshot(queue: DownloadQueue): QueueProgressSnapshot {
    const metrics = queue.metrics || this.createEmptyMetrics();
    const estimatedTimeRemaining = this.calculateEstimatedTime(metrics);

    return {
      timestamp: Date.now(),
      queueSize: metrics.currentQueueSize,
      processedCount: metrics.totalProcessed,
      totalQueued: metrics.totalQueued,
      failedCount: metrics.totalFailed,
      discoveryRate: metrics.discoveryRate,
      processingRate: metrics.processingRate,
      averageRetryCount: metrics.averageRetryCount,
      estimatedTimeRemaining,
      currentPhase: this.currentPhase,
      discoveryComplete: this.discoveryComplete,
    };
  }

  private addToHistory(snapshot: QueueProgressSnapshot): void {
    this.progressHistory.push(snapshot);
    
    // Maintain history size limit
    if (this.progressHistory.length > this.maxHistorySize) {
      this.progressHistory = this.progressHistory.slice(-this.maxHistorySize);
    }
  }

  private shouldReport(snapshot: QueueProgressSnapshot): boolean {
    return (snapshot.timestamp - this.lastReportTime) >= this.config.reportIntervalMs;
  }

  private reportProgress(snapshot: QueueProgressSnapshot): void {
    const progressInfo = this.createProgressInfo(snapshot);
    
    // Log based on configured level
    const logMethod = logger[this.config.logLevel];
    logMethod('Queue progress update', progressInfo);

    // Call custom progress handler if provided
    if (this.config.onProgress) {
      this.config.onProgress(snapshot);
    }
  }

  private createProgressInfo(snapshot: QueueProgressSnapshot): Record<string, unknown> {
    const baseInfo = {
      phase: snapshot.currentPhase,
      queueSize: snapshot.queueSize,
      processed: snapshot.processedCount,
      failed: snapshot.failedCount,
      processingRate: `${snapshot.processingRate.toFixed(2)}/sec`,
    };

    if (this.config.includeDetailedMetrics) {
      Object.assign(baseInfo, {
        discoveryRate: `${snapshot.discoveryRate.toFixed(2)}/sec`,
        avgRetries: snapshot.averageRetryCount.toFixed(2),
        discoveryComplete: snapshot.discoveryComplete,
      });
    }

    if (this.config.includeEstimates && snapshot.estimatedTimeRemaining) {
      Object.assign(baseInfo, {
        estimatedTimeRemaining: this.formatDuration(snapshot.estimatedTimeRemaining),
      });
    }

    return baseInfo;
  }

  private calculateEstimatedTime(metrics: QueueMetrics): number | undefined {
    if (!this.config.includeEstimates || metrics.processingRate <= 0 || metrics.currentQueueSize === 0) {
      return undefined;
    }

    // Simple estimation based on current processing rate
    const remainingItems = metrics.currentQueueSize;
    const currentRate = metrics.processingRate;
    
    return Math.ceil(remainingItems / currentRate); // seconds
  }

  private createProgressSummary(snapshot: QueueProgressSnapshot): QueueProgressSummary {
    const performance = this.getPerformanceStats();
    const trends = this.getProgressTrends();

    return {
      final: snapshot,
      performance,
      trends,
      totalReports: this.progressHistory.length,
      reportDuration: performance.totalTimeElapsed,
    };
  }

  private getRecentSnapshots(count: number): QueueProgressSnapshot[] {
    return this.progressHistory.slice(-count);
  }

  private calculateTrend(snapshots: QueueProgressSnapshot[], type: 'processing' | 'discovery' | 'overall'): QueueProgressTrend {
    if (snapshots.length < 2) {
      return { direction: 'stable', rate: 0, confidence: 0 };
    }

    const rates = snapshots.map(s => {
      switch (type) {
        case 'processing': return s.processingRate;
        case 'discovery': return s.discoveryRate;
        case 'overall': return s.processingRate + s.discoveryRate;
      }
    });

    const first = rates[0];
    const last = rates[rates.length - 1];
    const change = last - first;
    const avgRate = this.calculateAverage(rates);

    const direction: QueueProgressTrend['direction'] = 
      Math.abs(change) < 0.01 ? 'stable' :
      change > 0 ? 'increasing' : 'decreasing';

    const confidence = Math.min(1, rates.length / 10); // More confidence with more data points

    return {
      direction,
      rate: avgRate,
      confidence,
    };
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  }

  private calculateEfficiency(snapshot: QueueProgressSnapshot): number {
    const totalAttempts = snapshot.processedCount + snapshot.failedCount;
    if (totalAttempts === 0) return 1;
    
    return snapshot.processedCount / totalAttempts;
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  private createEmptyMetrics(): QueueMetrics {
    return {
      totalQueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      currentQueueSize: 0,
      discoveryRate: 0,
      processingRate: 0,
      averageRetryCount: 0,
      persistenceOperations: 0,
    };
  }
}

export interface QueueProgressSummary {
  final: QueueProgressSnapshot;
  performance: QueuePerformanceStats;
  trends: {
    processing: QueueProgressTrend;
    discovery: QueueProgressTrend;
    overall: QueueProgressTrend;
  };
  totalReports: number;
  reportDuration: number;
}

export interface QueuePerformanceStats {
  averageProcessingRate: number;
  peakProcessingRate: number;
  averageDiscoveryRate: number;
  peakDiscoveryRate: number;
  totalTimeElapsed: number;
  efficiency: number; // 0-1
}

/**
 * Create a queue progress reporter with default configuration
 */
export function createQueueProgressReporter(config?: Partial<ProgressReportConfig>): QueueProgressReporter {
  return new QueueProgressReporter(config);
}

/**
 * Create a console-oriented progress reporter for CLI usage
 */
export function createConsoleProgressReporter(): QueueProgressReporter {
  return new QueueProgressReporter({
    reportIntervalMs: 10000, // 10 seconds for CLI
    includeDetailedMetrics: false, // Simpler output
    includeEstimates: true,
    logLevel: 'info',
    onProgress: (snapshot) => {
      const percentage = snapshot.totalQueued > 0 
        ? Math.round((snapshot.processedCount / snapshot.totalQueued) * 100)
        : 0;
      
      console.log(
        `[${snapshot.currentPhase.toUpperCase()}] ` +
        `Queue: ${snapshot.queueSize} | ` +
        `Processed: ${snapshot.processedCount} (${percentage}%) | ` +
        `Rate: ${snapshot.processingRate.toFixed(1)}/sec` +
        (snapshot.estimatedTimeRemaining ? ` | ETA: ${formatDuration(snapshot.estimatedTimeRemaining)}` : '')
      );
    },
  });
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
}
