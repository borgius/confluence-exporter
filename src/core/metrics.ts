import { logger } from '../util/logger.js';
import type { QueueMetrics } from '../models/queueEntities.js';

export interface PerformanceMetrics {
  startTime: Date;
  endTime?: Date;
  totalDuration: number; // milliseconds
  phases: PhaseMetrics[];
  throughput: ThroughputMetrics;
  errors: ErrorMetrics;
  resources: ResourceMetrics;
  queue?: QueueStatistics; // Queue performance statistics
}

export interface PhaseMetrics {
  name: string;
  startTime: Date;
  endTime?: Date;
  duration: number; // milliseconds
  itemsProcessed: number;
  itemsPerSecond: number;
}

export interface ThroughputMetrics {
  pagesPerSecond: number;
  attachmentsPerSecond: number;
  bytesPerSecond: number;
  totalPages: number;
  totalAttachments: number;
  totalBytes: number;
}

export interface ErrorMetrics {
  totalErrors: number;
  pageErrors: number;
  attachmentErrors: number;
  transformErrors: number;
  filesystemErrors: number;
  retryableErrors: number;
  errorRate: number; // percentage
}

export interface ResourceMetrics {
  peakMemoryUsage: number; // bytes
  averageMemoryUsage: number; // bytes
  memorySnapshots: MemorySnapshot[];
}

export interface MemorySnapshot {
  timestamp: Date;
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export interface QueueStatistics {
  totalQueued: number;
  totalProcessed: number;
  totalFailed: number;
  currentQueueSize: number;
  discoveryRate: number; // pages discovered per second
  processingRate: number; // pages processed per second
  averageRetryCount: number;
  peakQueueSize: number;
  queueProcessingTime: number; // total time spent on queue operations
  discoveryPatterns: DiscoveryPatternSummary[];
}

export interface DiscoveryPatternSummary {
  sourceType: string;
  count: number;
  percentage: number;
}

export class MetricsCollector {
  private metrics: PerformanceMetrics;
  private currentPhase: PhaseMetrics | null = null;
  private memoryInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.metrics = {
      startTime: new Date(),
      totalDuration: 0,
      phases: [],
      throughput: {
        pagesPerSecond: 0,
        attachmentsPerSecond: 0,
        bytesPerSecond: 0,
        totalPages: 0,
        totalAttachments: 0,
        totalBytes: 0
      },
      errors: {
        totalErrors: 0,
        pageErrors: 0,
        attachmentErrors: 0,
        transformErrors: 0,
        filesystemErrors: 0,
        retryableErrors: 0,
        errorRate: 0
      },
      resources: {
        peakMemoryUsage: 0,
        averageMemoryUsage: 0,
        memorySnapshots: []
      }
    };

    this.startMemoryMonitoring();
  }

  /**
   * Start a new performance phase
   */
  startPhase(name: string): void {
    // End current phase if active
    if (this.currentPhase) {
      this.endPhase();
    }

    this.currentPhase = {
      name,
      startTime: new Date(),
      duration: 0,
      itemsProcessed: 0,
      itemsPerSecond: 0
    };

    logger.debug('Performance phase started', { phase: name });
  }

  /**
   * End the current performance phase
   */
  endPhase(): void {
    if (!this.currentPhase) {
      return;
    }

    const endTime = new Date();
    this.currentPhase.endTime = endTime;
    this.currentPhase.duration = endTime.getTime() - this.currentPhase.startTime.getTime();
    
    // Calculate throughput
    if (this.currentPhase.duration > 0) {
      this.currentPhase.itemsPerSecond = 
        (this.currentPhase.itemsProcessed * 1000) / this.currentPhase.duration;
    }

    this.metrics.phases.push({ ...this.currentPhase });
    
    logger.info('Performance phase completed', {
      phase: this.currentPhase.name,
      duration: this.currentPhase.duration,
      itemsProcessed: this.currentPhase.itemsProcessed,
      itemsPerSecond: this.currentPhase.itemsPerSecond.toFixed(2)
    });

    this.currentPhase = null;
  }

  /**
   * Record items processed in current phase
   */
  recordItems(count: number): void {
    if (this.currentPhase) {
      this.currentPhase.itemsProcessed += count;
    }
  }

  /**
   * Record throughput metrics
   */
  recordThroughput(pages: number, attachments: number, bytes: number): void {
    this.metrics.throughput.totalPages += pages;
    this.metrics.throughput.totalAttachments += attachments;
    this.metrics.throughput.totalBytes += bytes;
  }

  /**
   * Record queue metrics
   */
  recordQueueMetrics(queueMetrics: QueueMetrics): void {
    if (!this.metrics.queue) {
      this.metrics.queue = {
        totalQueued: 0,
        totalProcessed: 0,
        totalFailed: 0,
        currentQueueSize: 0,
        discoveryRate: 0,
        processingRate: 0,
        averageRetryCount: 0,
        peakQueueSize: 0,
        queueProcessingTime: 0,
        discoveryPatterns: [],
      };
    }

    // Update queue statistics
    this.metrics.queue.totalQueued = queueMetrics.totalQueued;
    this.metrics.queue.totalProcessed = queueMetrics.totalProcessed;
    this.metrics.queue.totalFailed = queueMetrics.totalFailed;
    this.metrics.queue.currentQueueSize = queueMetrics.currentQueueSize;
    this.metrics.queue.discoveryRate = queueMetrics.discoveryRate;
    this.metrics.queue.processingRate = queueMetrics.processingRate;
    this.metrics.queue.averageRetryCount = queueMetrics.averageRetryCount;

    // Track peak queue size
    if (queueMetrics.currentQueueSize > this.metrics.queue.peakQueueSize) {
      this.metrics.queue.peakQueueSize = queueMetrics.currentQueueSize;
    }
  }

  /**
   * Record queue discovery patterns
   */
  recordDiscoveryPatterns(patterns: DiscoveryPatternSummary[]): void {
    if (!this.metrics.queue) {
      this.recordQueueMetrics({
        totalQueued: 0,
        totalProcessed: 0,
        totalFailed: 0,
        currentQueueSize: 0,
        discoveryRate: 0,
        processingRate: 0,
        averageRetryCount: 0,
        persistenceOperations: 0,
      });
    }

    if (this.metrics.queue) {
      this.metrics.queue.discoveryPatterns = patterns;
    }
  }

  /**
   * Record queue processing time
   */
  recordQueueProcessingTime(timeMs: number): void {
    if (!this.metrics.queue) {
      this.recordQueueMetrics({
        totalQueued: 0,
        totalProcessed: 0,
        totalFailed: 0,
        currentQueueSize: 0,
        discoveryRate: 0,
        processingRate: 0,
        averageRetryCount: 0,
        persistenceOperations: 0,
      });
    }

    if (this.metrics.queue) {
      this.metrics.queue.queueProcessingTime += timeMs;
    }
  }

  /**
   * Record an error occurrence
   */
  recordError(type: 'page' | 'attachment' | 'transform' | 'filesystem', retryable = false): void {
    this.metrics.errors.totalErrors++;
    
    switch (type) {
      case 'page':
        this.metrics.errors.pageErrors++;
        break;
      case 'attachment':
        this.metrics.errors.attachmentErrors++;
        break;
      case 'transform':
        this.metrics.errors.transformErrors++;
        break;
      case 'filesystem':
        this.metrics.errors.filesystemErrors++;
        break;
    }

    if (retryable) {
      this.metrics.errors.retryableErrors++;
    }
  }

  /**
   * Complete metrics collection and compute final statistics
   */
  complete(): PerformanceMetrics {
    // End any active phase
    if (this.currentPhase) {
      this.endPhase();
    }

    // Stop memory monitoring
    this.stopMemoryMonitoring();

    // Compute final metrics
    this.metrics.endTime = new Date();
    this.metrics.totalDuration = this.metrics.endTime.getTime() - this.metrics.startTime.getTime();

    // Calculate overall throughput
    if (this.metrics.totalDuration > 0) {
      const durationSeconds = this.metrics.totalDuration / 1000;
      this.metrics.throughput.pagesPerSecond = this.metrics.throughput.totalPages / durationSeconds;
      this.metrics.throughput.attachmentsPerSecond = this.metrics.throughput.totalAttachments / durationSeconds;
      this.metrics.throughput.bytesPerSecond = this.metrics.throughput.totalBytes / durationSeconds;
    }

    // Calculate error rate
    const totalItems = this.metrics.throughput.totalPages + this.metrics.throughput.totalAttachments;
    if (totalItems > 0) {
      this.metrics.errors.errorRate = (this.metrics.errors.totalErrors / totalItems) * 100;
    }

    // Calculate resource metrics
    this.calculateResourceMetrics();

    logger.info('Performance metrics completed', {
      totalDuration: this.metrics.totalDuration,
      pagesPerSecond: this.metrics.throughput.pagesPerSecond.toFixed(2),
      attachmentsPerSecond: this.metrics.throughput.attachmentsPerSecond.toFixed(2),
      errorRate: this.metrics.errors.errorRate.toFixed(2)
    });

    return { ...this.metrics };
  }

  /**
   * Get current metrics snapshot
   */
  getSnapshot(): PerformanceMetrics {
    const snapshot = { ...this.metrics };
    
    if (!snapshot.endTime) {
      snapshot.endTime = new Date();
      snapshot.totalDuration = snapshot.endTime.getTime() - snapshot.startTime.getTime();
    }

    return snapshot;
  }

  /**
   * Start monitoring memory usage
   */
  private startMemoryMonitoring(): void {
    // Take initial snapshot
    this.takeMemorySnapshot();

    // Take snapshots every 5 seconds
    this.memoryInterval = setInterval(() => {
      this.takeMemorySnapshot();
    }, 5000);
  }

  /**
   * Stop monitoring memory usage
   */
  private stopMemoryMonitoring(): void {
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }

    // Take final snapshot
    this.takeMemorySnapshot();
  }

  /**
   * Take a memory usage snapshot
   */
  private takeMemorySnapshot(): void {
    const memUsage = process.memoryUsage();
    const snapshot: MemorySnapshot = {
      timestamp: new Date(),
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    };

    this.metrics.resources.memorySnapshots.push(snapshot);

    // Update peak memory usage
    if (memUsage.heapUsed > this.metrics.resources.peakMemoryUsage) {
      this.metrics.resources.peakMemoryUsage = memUsage.heapUsed;
    }
  }

  /**
   * Calculate final resource metrics
   */
  private calculateResourceMetrics(): void {
    const snapshots = this.metrics.resources.memorySnapshots;
    
    if (snapshots.length === 0) {
      return;
    }

    // Calculate average memory usage
    const totalMemory = snapshots.reduce((sum, snapshot) => sum + snapshot.heapUsed, 0);
    this.metrics.resources.averageMemoryUsage = totalMemory / snapshots.length;
  }
}

/**
 * Format metrics for human-readable output
 */
export function formatMetricsSummary(metrics: PerformanceMetrics): string {
  const lines: string[] = [];
  
  lines.push('=== Export Performance Summary ===');
  lines.push(`Total Duration: ${(metrics.totalDuration / 1000).toFixed(2)}s`);
  lines.push(`Pages Processed: ${metrics.throughput.totalPages} (${metrics.throughput.pagesPerSecond.toFixed(2)}/s)`);
  lines.push(`Attachments Processed: ${metrics.throughput.totalAttachments} (${metrics.throughput.attachmentsPerSecond.toFixed(2)}/s)`);
  lines.push(`Data Transfer: ${formatBytes(metrics.throughput.totalBytes)} (${formatBytes(metrics.throughput.bytesPerSecond)}/s)`);
  lines.push(`Error Rate: ${metrics.errors.errorRate.toFixed(2)}% (${metrics.errors.totalErrors} errors)`);
  lines.push(`Memory Usage: Peak ${formatBytes(metrics.resources.peakMemoryUsage)}, Avg ${formatBytes(metrics.resources.averageMemoryUsage)}`);
  
  // Queue statistics (if available)
  if (metrics.queue) {
    lines.push('\n=== Queue Performance ===');
    lines.push(`Total Queued: ${metrics.queue.totalQueued} pages`);
    lines.push(`Total Processed: ${metrics.queue.totalProcessed} pages`);
    lines.push(`Total Failed: ${metrics.queue.totalFailed} pages`);
    lines.push(`Peak Queue Size: ${metrics.queue.peakQueueSize} pages`);
    lines.push(`Discovery Rate: ${metrics.queue.discoveryRate.toFixed(2)} pages/s`);
    lines.push(`Processing Rate: ${metrics.queue.processingRate.toFixed(2)} pages/s`);
    lines.push(`Average Retries: ${metrics.queue.averageRetryCount.toFixed(2)}`);
    lines.push(`Queue Processing Time: ${(metrics.queue.queueProcessingTime / 1000).toFixed(2)}s`);
    
    if (metrics.queue.discoveryPatterns.length > 0) {
      lines.push('\n=== Discovery Patterns ===');
      for (const pattern of metrics.queue.discoveryPatterns) {
        lines.push(`${pattern.sourceType}: ${pattern.count} pages (${pattern.percentage.toFixed(1)}%)`);
      }
    }
  }
  
  lines.push('\n=== Phase Breakdown ===');
  for (const phase of metrics.phases) {
    lines.push(`${phase.name}: ${(phase.duration / 1000).toFixed(2)}s (${phase.itemsProcessed} items, ${phase.itemsPerSecond.toFixed(2)}/s)`);
  }

  if (metrics.errors.totalErrors > 0) {
    lines.push('\n=== Error Breakdown ===');
    lines.push(`Page Errors: ${metrics.errors.pageErrors}`);
    lines.push(`Attachment Errors: ${metrics.errors.attachmentErrors}`);
    lines.push(`Transform Errors: ${metrics.errors.transformErrors}`);
    lines.push(`Filesystem Errors: ${metrics.errors.filesystemErrors}`);
    lines.push(`Retryable Errors: ${metrics.errors.retryableErrors}`);
  }

  return lines.join('\n');
}

/**
 * Format bytes in human-readable format
 */
function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}
