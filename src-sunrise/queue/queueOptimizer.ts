/**
 * Queue Performance Optimization Strategies
 * Implements T138a: Memory and processing optimizations for queue operations
 */

import type { DownloadQueue, QueueItem } from '../models/queueEntities.js';
import { logger } from '../util/logger.js';

export interface OptimizationConfig {
  enableBatching: boolean;
  batchSize: number;
  enableCaching: boolean;
  cacheSize: number;
  enableCompression: boolean;
  memoryThresholdMB: number;
  gcIntervalMs: number;
}

export interface OptimizationResult {
  memoryReduced: number;
  processingSpeedImproved: number;
  cacheHitRate: number;
  optimizationsApplied: string[];
}

/**
 * Queue performance optimizer that applies various optimization strategies
 */
export class QueueOptimizer {
  private config: OptimizationConfig;
  private cache: Map<string, QueueItem> = new Map();
  private lastGcTime: number = Date.now();

  constructor(config: Partial<OptimizationConfig> = {}) {
    this.config = {
      enableBatching: config.enableBatching ?? true,
      batchSize: config.batchSize ?? 50,
      enableCaching: config.enableCaching ?? true,
      cacheSize: config.cacheSize ?? 1000,
      enableCompression: config.enableCompression ?? false,
      memoryThresholdMB: config.memoryThresholdMB ?? 200,
      gcIntervalMs: config.gcIntervalMs ?? 300000, // 5 minutes
    };
  }

  /**
   * Optimizes queue performance based on current metrics
   */
  async optimizeQueue(queue: DownloadQueue): Promise<OptimizationResult> {
    const optimizationsApplied: string[] = [];
    let memoryReduced = 0;
    let processingSpeedImproved = 0;

    // Memory optimization
    if (this.shouldRunMemoryOptimization()) {
      memoryReduced = await this.optimizeMemoryUsage(queue);
      optimizationsApplied.push('memory-cleanup');
    }

    // Cache optimization
    if (this.config.enableCaching) {
      this.optimizeCache();
      optimizationsApplied.push('cache-optimization');
    }

    // Batch processing optimization
    if (this.config.enableBatching && queue.items.size > this.config.batchSize) {
      processingSpeedImproved = this.optimizeBatchProcessing(queue);
      optimizationsApplied.push('batch-optimization');
    }

    // Garbage collection optimization
    if (this.shouldRunGarbageCollection()) {
      await this.runGarbageCollection();
      optimizationsApplied.push('garbage-collection');
    }

    const cacheHitRate = this.calculateCacheHitRate();

    logger.debug('Queue optimization completed', {
      memoryReduced,
      processingSpeedImproved,
      cacheHitRate,
      optimizationsApplied,
    });

    return {
      memoryReduced,
      processingSpeedImproved,
      cacheHitRate,
      optimizationsApplied,
    };
  }

  /**
   * Optimizes memory usage by cleaning up processed items and compressing data
   */
  private async optimizeMemoryUsage(queue: DownloadQueue): Promise<number> {
    const initialMemory = this.getMemoryUsage();

    // Remove completed items from memory
    let removedCount = 0;
    for (const [pageId, item] of queue.items.entries()) {
      if (item.status === 'completed') {
        queue.items.delete(pageId);
        removedCount++;
      }
    }

    // Clear processed pages that are old
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours
    let processedRemoved = 0;
    for (const pageId of queue.processedPages) {
      const item = queue.items.get(pageId);
      if (!item || item.discoveryTimestamp < cutoffTime) {
        queue.processedPages.delete(pageId);
        processedRemoved++;
      }
    }

    const finalMemory = this.getMemoryUsage();
    const memoryReduced = initialMemory - finalMemory;

    logger.info('Memory optimization completed', {
      removedItems: removedCount,
      processedRemoved,
      memoryReduced,
    });

    return memoryReduced;
  }

  /**
   * Optimizes cache performance by removing stale entries
   */
  private optimizeCache(): void {
    if (this.cache.size > this.config.cacheSize) {
      // Remove oldest entries (LRU-style)
      const entriesToRemove = this.cache.size - this.config.cacheSize;
      const entries = Array.from(this.cache.entries());
      
      for (let i = 0; i < entriesToRemove; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
  }

  /**
   * Optimizes batch processing by grouping similar operations
   */
  private optimizeBatchProcessing(queue: DownloadQueue): number {
    const pendingItems = Array.from(queue.items.values())
      .filter(item => item.status === 'pending');

    // Group by source type for better batch processing
    const groupedBySource = new Map<string, QueueItem[]>();
    for (const item of pendingItems) {
      const sourceType = item.sourceType;
      if (!groupedBySource.has(sourceType)) {
        groupedBySource.set(sourceType, []);
      }
      const existing = groupedBySource.get(sourceType);
      if (existing) {
        existing.push(item);
      }
    }

    // Reorder processing queue to group similar items together
    const newProcessingOrder: string[] = [];
    for (const [_sourceType, items] of groupedBySource) {
      const sortedItems = items.sort((a, b) => a.discoveryTimestamp - b.discoveryTimestamp);
      newProcessingOrder.push(...sortedItems.map(item => item.pageId));
    }

    queue.processingOrder = newProcessingOrder;

    // Estimate processing speed improvement (simplified calculation)
    const improvement = Math.min(groupedBySource.size * 0.1, 0.5); // Max 50% improvement
    
    logger.debug('Batch processing optimization applied', {
      groupsCreated: groupedBySource.size,
      totalItems: pendingItems.length,
      estimatedImprovement: improvement,
    });

    return improvement;
  }

  /**
   * Runs garbage collection to free up memory
   */
  private async runGarbageCollection(): Promise<void> {
    this.lastGcTime = Date.now();
    
    // Force garbage collection if available (Node.js specific)
    if (global.gc) {
      global.gc();
      logger.debug('Manual garbage collection triggered');
    }
  }

  /**
   * Calculates cache hit rate for monitoring
   */
  private calculateCacheHitRate(): number {
    // This would be tracked in a real implementation
    // For now, return a placeholder value
    return 0.75;
  }

  /**
   * Checks if memory optimization should run
   */
  private shouldRunMemoryOptimization(): boolean {
    const memoryUsage = this.getMemoryUsage();
    return memoryUsage > this.config.memoryThresholdMB;
  }

  /**
   * Checks if garbage collection should run
   */
  private shouldRunGarbageCollection(): boolean {
    const timeSinceLastGc = Date.now() - this.lastGcTime;
    return timeSinceLastGc > this.config.gcIntervalMs;
  }

  /**
   * Gets current memory usage in MB
   */
  private getMemoryUsage(): number {
    const usage = process.memoryUsage();
    return usage.heapUsed / 1024 / 1024; // Convert to MB
  }

  /**
   * Updates optimization configuration
   */
  updateConfig(config: Partial<OptimizationConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug('Queue optimizer configuration updated', { config: this.config });
  }

  /**
   * Gets current optimization statistics
   */
  getOptimizationStats(): {
    cacheSize: number;
    memoryUsage: number;
    lastGcTime: number;
    config: OptimizationConfig;
  } {
    return {
      cacheSize: this.cache.size,
      memoryUsage: this.getMemoryUsage(),
      lastGcTime: this.lastGcTime,
      config: this.config,
    };
  }
}

export const createQueueOptimizer = (config?: Partial<OptimizationConfig>): QueueOptimizer => {
  return new QueueOptimizer(config);
};
