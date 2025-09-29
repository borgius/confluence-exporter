/**
 * Performance summary and metrics collection
 * Implements T066: Performance summary (timing, throughput, error rates)
 */

import { logger } from '../util/logger.js';

export interface PerformanceMetrics {
  timing: {
    startTime: number;
    endTime?: number;
    duration?: number; // in milliseconds
    phases: Map<string, PhaseMetrics>;
  };
  throughput: {
    pagesPerSecond: number;
    attachmentsPerSecond: number;
    bytesPerSecond: number;
  };
  counts: {
    totalPages: number;
    processedPages: number;
    totalAttachments: number;
    processedAttachments: number;
    totalBytes: number;
    processedBytes: number;
  };
  errors: {
    totalErrors: number;
    errorRate: number; // percentage
    pageErrors: number;
    attachmentErrors: number;
    errorsByType: Map<string, number>;
  };
  memory: {
    peakUsage: number; // in bytes
    currentUsage: number; // in bytes
    gcCount: number;
  };
  concurrency: {
    maxConcurrency: number;
    avgConcurrency: number;
    concurrencyHistory: number[];
  };
}

export interface PhaseMetrics {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  subPhases: Map<string, PhaseMetrics>;
}

export interface PerformanceSummary {
  metrics: PerformanceMetrics;
  recommendations: string[];
  bottlenecks: string[];
  efficiency: {
    score: number; // 0-100
    factors: string[];
  };
}

/**
 * Collects and analyzes performance metrics during export operations
 */
export class PerformanceCollector {
  private metrics: PerformanceMetrics;
  private activePhases: Map<string, number>; // phase name -> start time
  private concurrencyTracking: {
    currentCount: number;
    maxCount: number;
    samples: number[];
    sampleInterval?: NodeJS.Timeout;
  };

  constructor() {
    this.metrics = this.createEmptyMetrics();
    this.activePhases = new Map();
    this.concurrencyTracking = {
      currentCount: 0,
      maxCount: 0,
      samples: [],
    };
  }

  /**
   * Starts performance collection
   */
  start(): void {
    this.metrics.timing.startTime = Date.now();
    this.startMemoryTracking();
    this.startConcurrencyTracking();
    
    logger.debug('Performance collection started', {
      startTime: this.metrics.timing.startTime,
    });
  }

  /**
   * Ends performance collection and finalizes metrics
   */
  end(): PerformanceMetrics {
    this.metrics.timing.endTime = Date.now();
    this.metrics.timing.duration = this.metrics.timing.endTime - this.metrics.timing.startTime;
    
    this.stopConcurrencyTracking();
    this.finalizeMetrics();
    
    logger.debug('Performance collection completed', {
      duration: this.metrics.timing.duration,
      totalPages: this.metrics.counts.totalPages,
      totalErrors: this.metrics.errors.totalErrors,
    });

    return { ...this.metrics };
  }

  /**
   * Starts tracking a performance phase
   */
  startPhase(phaseName: string, parentPhase?: string): void {
    const startTime = Date.now();
    this.activePhases.set(phaseName, startTime);

    const targetMap = parentPhase 
      ? this.getOrCreatePhase(parentPhase).subPhases
      : this.metrics.timing.phases;

    targetMap.set(phaseName, {
      name: phaseName,
      startTime,
      subPhases: new Map(),
    });

    logger.debug('Performance phase started', {
      phase: phaseName,
      parentPhase,
      startTime,
    });
  }

  /**
   * Ends tracking a performance phase
   */
  endPhase(phaseName: string): void {
    const startTime = this.activePhases.get(phaseName);
    if (!startTime) {
      logger.warn('Attempted to end unknown phase', { phase: phaseName });
      return;
    }

    const endTime = Date.now();
    const duration = endTime - startTime;

    this.activePhases.delete(phaseName);

    // Find and update the phase in the metrics
    const phase = this.findPhase(phaseName);
    if (phase) {
      phase.endTime = endTime;
      phase.duration = duration;
    }

    logger.debug('Performance phase ended', {
      phase: phaseName,
      duration,
    });
  }

  /**
   * Records page processing metrics
   */
  recordPageProcessed(success: boolean, bytes?: number): void {
    this.metrics.counts.processedPages++;
    
    if (bytes) {
      this.metrics.counts.processedBytes += bytes;
    }

    if (!success) {
      this.metrics.errors.pageErrors++;
      this.metrics.errors.totalErrors++;
    }
  }

  /**
   * Records attachment processing metrics
   */
  recordAttachmentProcessed(success: boolean, bytes?: number): void {
    this.metrics.counts.processedAttachments++;
    
    if (bytes) {
      this.metrics.counts.processedBytes += bytes;
    }

    if (!success) {
      this.metrics.errors.attachmentErrors++;
      this.metrics.errors.totalErrors++;
    }
  }

  /**
   * Records an error by type
   */
  recordError(errorType: string): void {
    const currentCount = this.metrics.errors.errorsByType.get(errorType) || 0;
    this.metrics.errors.errorsByType.set(errorType, currentCount + 1);
    this.metrics.errors.totalErrors++;
  }

  /**
   * Updates total counts (for calculating rates)
   */
  setTotalCounts(pages: number, attachments: number, bytes: number): void {
    this.metrics.counts.totalPages = pages;
    this.metrics.counts.totalAttachments = attachments;
    this.metrics.counts.totalBytes = bytes;
  }

  /**
   * Records concurrency change
   */
  recordConcurrencyChange(delta: number): void {
    this.concurrencyTracking.currentCount += delta;
    this.concurrencyTracking.maxCount = Math.max(
      this.concurrencyTracking.maxCount,
      this.concurrencyTracking.currentCount
    );
  }

  /**
   * Generates performance summary with analysis
   */
  generateSummary(): PerformanceSummary {
    const recommendations: string[] = [];
    const bottlenecks: string[] = [];
    const factors: string[] = [];

    // Analyze throughput
    if (this.metrics.throughput.pagesPerSecond < 1) {
      recommendations.push('Consider increasing concurrency for page processing');
      factors.push('Low page processing throughput');
    }

    // Analyze error rates
    if (this.metrics.errors.errorRate > 10) {
      recommendations.push('High error rate detected - investigate common failure patterns');
      bottlenecks.push('Error handling overhead');
    }

    // Analyze memory usage
    if (this.metrics.memory.peakUsage > 1024 * 1024 * 1024) { // 1GB
      recommendations.push('High memory usage detected - consider processing in smaller batches');
      factors.push('Memory pressure');
    }

    // Analyze concurrency efficiency
    if (this.metrics.concurrency.avgConcurrency < this.metrics.concurrency.maxConcurrency * 0.7) {
      recommendations.push('Low average concurrency - check for blocking operations');
      bottlenecks.push('Underutilized concurrency');
    }

    // Calculate efficiency score
    const score = this.calculateEfficiencyScore();

    return {
      metrics: { ...this.metrics },
      recommendations,
      bottlenecks,
      efficiency: {
        score,
        factors,
      },
    };
  }

  /**
   * Logs performance summary
   */
  logSummary(): void {
    const summary = this.generateSummary();
    
    logger.info('Performance Summary', {
      duration: this.formatDuration(this.metrics.timing.duration || 0),
      throughput: {
        pagesPerSecond: this.metrics.throughput.pagesPerSecond.toFixed(2),
        attachmentsPerSecond: this.metrics.throughput.attachmentsPerSecond.toFixed(2),
        bytesPerSecond: this.formatBytes(this.metrics.throughput.bytesPerSecond),
      },
      counts: this.metrics.counts,
      errors: {
        totalErrors: this.metrics.errors.totalErrors,
        errorRate: `${this.metrics.errors.errorRate.toFixed(1)}%`,
      },
      memory: {
        peakUsage: this.formatBytes(this.metrics.memory.peakUsage),
        currentUsage: this.formatBytes(this.metrics.memory.currentUsage),
      },
      concurrency: {
        maxConcurrency: this.metrics.concurrency.maxConcurrency,
        avgConcurrency: this.metrics.concurrency.avgConcurrency.toFixed(1),
      },
      efficiency: {
        score: summary.efficiency.score,
        factors: summary.efficiency.factors,
      },
    });

    if (summary.recommendations.length > 0) {
      logger.info('Performance Recommendations', {
        recommendations: summary.recommendations,
      });
    }

    if (summary.bottlenecks.length > 0) {
      logger.warn('Performance Bottlenecks Detected', {
        bottlenecks: summary.bottlenecks,
      });
    }

    // Log phase breakdown
    this.logPhaseBreakdown();
  }

  /**
   * Creates empty metrics structure
   */
  private createEmptyMetrics(): PerformanceMetrics {
    return {
      timing: {
        startTime: 0,
        phases: new Map(),
      },
      throughput: {
        pagesPerSecond: 0,
        attachmentsPerSecond: 0,
        bytesPerSecond: 0,
      },
      counts: {
        totalPages: 0,
        processedPages: 0,
        totalAttachments: 0,
        processedAttachments: 0,
        totalBytes: 0,
        processedBytes: 0,
      },
      errors: {
        totalErrors: 0,
        errorRate: 0,
        pageErrors: 0,
        attachmentErrors: 0,
        errorsByType: new Map(),
      },
      memory: {
        peakUsage: 0,
        currentUsage: 0,
        gcCount: 0,
      },
      concurrency: {
        maxConcurrency: 0,
        avgConcurrency: 0,
        concurrencyHistory: [],
      },
    };
  }

  /**
   * Starts memory usage tracking
   */
  private startMemoryTracking(): void {
    this.updateMemoryMetrics();
  }

  /**
   * Starts concurrency tracking with periodic sampling
   */
  private startConcurrencyTracking(): void {
    this.concurrencyTracking.sampleInterval = setInterval(() => {
      this.concurrencyTracking.samples.push(this.concurrencyTracking.currentCount);
    }, 1000); // Sample every second
  }

  /**
   * Stops concurrency tracking
   */
  private stopConcurrencyTracking(): void {
    if (this.concurrencyTracking.sampleInterval) {
      clearInterval(this.concurrencyTracking.sampleInterval);
    }
  }

  /**
   * Updates memory metrics
   */
  private updateMemoryMetrics(): void {
    const usage = process.memoryUsage();
    this.metrics.memory.currentUsage = usage.heapUsed;
    this.metrics.memory.peakUsage = Math.max(
      this.metrics.memory.peakUsage,
      usage.heapUsed
    );
  }

  /**
   * Finalizes all metrics calculations
   */
  private finalizeMetrics(): void {
    this.calculateThroughput();
    this.calculateErrorRates();
    this.calculateConcurrencyMetrics();
    this.updateMemoryMetrics();
  }

  /**
   * Calculates throughput metrics
   */
  private calculateThroughput(): void {
    const durationSeconds = (this.metrics.timing.duration || 0) / 1000;
    
    if (durationSeconds > 0) {
      this.metrics.throughput.pagesPerSecond = this.metrics.counts.processedPages / durationSeconds;
      this.metrics.throughput.attachmentsPerSecond = this.metrics.counts.processedAttachments / durationSeconds;
      this.metrics.throughput.bytesPerSecond = this.metrics.counts.processedBytes / durationSeconds;
    }
  }

  /**
   * Calculates error rates
   */
  private calculateErrorRates(): void {
    const totalOperations = this.metrics.counts.processedPages + this.metrics.counts.processedAttachments;
    
    if (totalOperations > 0) {
      this.metrics.errors.errorRate = (this.metrics.errors.totalErrors / totalOperations) * 100;
    }
  }

  /**
   * Calculates concurrency metrics
   */
  private calculateConcurrencyMetrics(): void {
    this.metrics.concurrency.maxConcurrency = this.concurrencyTracking.maxCount;
    this.metrics.concurrency.concurrencyHistory = [...this.concurrencyTracking.samples];
    
    if (this.concurrencyTracking.samples.length > 0) {
      const sum = this.concurrencyTracking.samples.reduce((a, b) => a + b, 0);
      this.metrics.concurrency.avgConcurrency = sum / this.concurrencyTracking.samples.length;
    }
  }

  /**
   * Calculates efficiency score (0-100)
   */
  private calculateEfficiencyScore(): number {
    let score = 100;
    
    // Deduct for high error rate
    if (this.metrics.errors.errorRate > 5) {
      score -= Math.min(30, this.metrics.errors.errorRate * 2);
    }
    
    // Deduct for low throughput (subjective thresholds)
    if (this.metrics.throughput.pagesPerSecond < 2) {
      score -= 20;
    }
    
    // Deduct for low concurrency utilization
    const concurrencyUtilization = this.metrics.concurrency.avgConcurrency / Math.max(1, this.metrics.concurrency.maxConcurrency);
    if (concurrencyUtilization < 0.7) {
      score -= 15;
    }
    
    return Math.max(0, score);
  }

  /**
   * Gets or creates a phase in the metrics
   */
  private getOrCreatePhase(phaseName: string): PhaseMetrics {
    let phase = this.metrics.timing.phases.get(phaseName);
    if (!phase) {
      phase = {
        name: phaseName,
        startTime: Date.now(),
        subPhases: new Map(),
      };
      this.metrics.timing.phases.set(phaseName, phase);
    }
    return phase;
  }

  /**
   * Finds a phase by name in the metrics tree
   */
  private findPhase(phaseName: string): PhaseMetrics | null {
    // Search top-level phases
    const topLevel = this.metrics.timing.phases.get(phaseName);
    if (topLevel) return topLevel;

    // Search sub-phases recursively
    for (const phase of this.metrics.timing.phases.values()) {
      const found = this.findPhaseRecursive(phase.subPhases, phaseName);
      if (found) return found;
    }

    return null;
  }

  /**
   * Recursively searches for a phase in sub-phases
   */
  private findPhaseRecursive(phases: Map<string, PhaseMetrics>, phaseName: string): PhaseMetrics | null {
    const direct = phases.get(phaseName);
    if (direct) return direct;

    for (const phase of phases.values()) {
      const found = this.findPhaseRecursive(phase.subPhases, phaseName);
      if (found) return found;
    }

    return null;
  }

  /**
   * Logs detailed phase breakdown
   */
  private logPhaseBreakdown(): void {
    if (this.metrics.timing.phases.size === 0) return;

    logger.info('Phase Performance Breakdown');
    
    for (const [_name, phase] of this.metrics.timing.phases.entries()) {
      this.logPhase(phase, 0);
    }
  }

  /**
   * Logs a single phase with indentation
   */
  private logPhase(phase: PhaseMetrics, indent: number): void {
    const prefix = '  '.repeat(indent);
    const duration = phase.duration ? this.formatDuration(phase.duration) : 'ongoing';
    
    logger.info(`${prefix}${phase.name}: ${duration}`);
    
    for (const subPhase of phase.subPhases.values()) {
      this.logPhase(subPhase, indent + 1);
    }
  }

  /**
   * Formats duration in human-readable format
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      return `${(ms / 60000).toFixed(1)}m`;
    }
  }

  /**
   * Formats bytes in human-readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}

/**
 * Creates a performance collector
 */
export function createPerformanceCollector(): PerformanceCollector {
  return new PerformanceCollector();
}