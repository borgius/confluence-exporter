/**
 * T087: Main download queue orchestrator
 * Implements FR-033, FR-036, FR-037 for FIFO processing and deduplication
 */

import type { 
  QueueItem, 
  DownloadQueue, 
  QueueMetrics, 
  IDownloadQueue,
  QueueState,
  ProcessingResult 
} from '../models/queueEntities.js';
import { QueuePersistenceService } from './queuePersistence.js';
import { QueueMetricsTracker } from './queueMetrics.js';
import { QueueDiscoveryService } from './queueDiscovery.js';
import { QueueRecoveryService } from './queueRecovery.js';
import { validateQueueItemQuick } from './queueValidation.js';

export interface DownloadQueueConfig {
  maxQueueSize: number;
  maxRetries: number;
  persistenceThreshold: number;
  persistencePath: string;
  metricsWindowSeconds: number;
  enableCircularReferenceDetection: boolean;
  autoRecoveryEnabled: boolean;
}

export interface QueueStateInfo {
  totalItems: number;
  pendingItems: number;
  processingItems: number;
  completedItems: number;
  failedItems: number;
  processingOrder: string[];
  processedPages: string[];
  lastPersistenceTime?: string;
}

export class DownloadQueueOrchestrator implements IDownloadQueue {
  private queue: DownloadQueue;
  private readonly persistence: QueuePersistenceService;
  private readonly metrics: QueueMetricsTracker;
  private readonly discovery: QueueDiscoveryService;
  private readonly recovery: QueueRecoveryService;
  private readonly config: DownloadQueueConfig;
  private readonly spaceKey: string;

  constructor(
    spaceKey: string,
    config: Partial<DownloadQueueConfig> = {},
    workspaceDir = process.cwd()
  ) {
    this.spaceKey = spaceKey;
    this.config = {
      maxQueueSize: 1000,
      maxRetries: 3,
      persistenceThreshold: 10,
      persistencePath: `${workspaceDir}/.confluence-queue-${spaceKey}.json`,
      metricsWindowSeconds: 300, // 5 minutes
      enableCircularReferenceDetection: true,
      autoRecoveryEnabled: true,
      ...config,
    };

    this.queue = this.initializeQueue();
    this.persistence = new QueuePersistenceService({ 
      filePath: this.config.persistencePath 
    });
    this.metrics = new QueueMetricsTracker();
    this.discovery = new QueueDiscoveryService();
    this.recovery = new QueueRecoveryService(workspaceDir);
  }

  /**
   * Add items to the queue with deduplication.
   */
  async add(items: QueueItem | QueueItem[]): Promise<void> {
    const itemArray = Array.isArray(items) ? items : [items];
    const addedItems: QueueItem[] = [];

    for (const item of itemArray) {
      // Validate item
      const validation = validateQueueItemQuick(item);
      if (!validation.valid) {
        throw new Error(`Invalid queue item: ${validation.error}`);
      }

      // Check for duplicates (deduplication)
      if (this.queue.items.has(item.pageId)) {
        continue; // Skip duplicate
      }

      // Check queue capacity
      if (this.queue.items.size >= this.queue.maxQueueSize) {
        throw new Error(`Queue size limit exceeded: ${this.queue.maxQueueSize}`);
      }

      // Add to queue
      this.queue.items.set(item.pageId, item);
      
      // Add to processing order if pending
      if (item.status === 'pending') {
        this.queue.processingOrder.push(item.pageId);
      }

      addedItems.push(item);
    }

    // Update metrics
    this.metrics.recordQueued(addedItems.length);

    // Check if we need to persist
    await this.checkPersistenceThreshold();
  }

  /**
   * Get the next item to process (FIFO).
   */
  async next(): Promise<QueueItem | null> {
    // Find next pending item in processing order
    while (this.queue.processingOrder.length > 0) {
      const pageId = this.queue.processingOrder[0];
      const item = this.queue.items.get(pageId);

      if (!item) {
        // Remove orphaned entry
        this.queue.processingOrder.shift();
        continue;
      }

      if (item.status === 'pending') {
        // Mark as processing
        item.status = 'processing';
        // Update queue size in metrics
        this.metrics.updateCurrentQueueSize(this.queue.items.size);
        return item;
      }

      if (item.status === 'processing') {
        // Already processing, move to next
        this.queue.processingOrder.shift();
        this.queue.processingOrder.push(pageId); // Move to end
        continue;
      }

      // Remove completed/failed items from processing order
      this.queue.processingOrder.shift();
    }

    return null; // No pending items
  }

  /**
   * Mark an item as successfully processed.
   */
  async markProcessed(pageId: string): Promise<void> {
    const item = this.queue.items.get(pageId);
    if (!item) {
      throw new Error(`Item not found in queue: ${pageId}`);
    }

    // Update item status
    item.status = 'completed';
    this.queue.processedPages.add(pageId);

    // Remove from processing order
    this.removeFromProcessingOrder(pageId);

    // Update metrics
    this.metrics.recordProcessed(1);

    // Check persistence
    await this.checkPersistenceThreshold();
  }

  /**
   * Mark an item as failed with optional retry.
   */
  async markFailed(pageId: string, _error: Error, retryCount?: number): Promise<void> {
    const item = this.queue.items.get(pageId);
    if (!item) {
      throw new Error(`Item not found in queue: ${pageId}`);
    }

    // Update retry count
    item.retryCount = retryCount ?? item.retryCount + 1;

    // Check if we should retry
    if (item.retryCount < this.config.maxRetries) {
      // Reset to pending for retry
      item.status = 'pending';
      // Add back to processing order if not already there
      if (!this.queue.processingOrder.includes(pageId)) {
        this.queue.processingOrder.push(pageId);
      }
    } else {
      // Mark as permanently failed
      item.status = 'failed';
      this.removeFromProcessingOrder(pageId);
    }

    // Update metrics
    this.metrics.recordFailed(1, item.retryCount);

    // Check persistence
    await this.checkPersistenceThreshold();
  }

  /**
   * Get current queue metrics.
   */
  getMetrics(): QueueMetrics {
    const currentMetrics = this.metrics.getMetrics();
    
    // Update current queue size
    const pendingCount = Array.from(this.queue.items.values())
      .filter(item => item.status === 'pending' || item.status === 'processing').length;

    return {
      ...currentMetrics,
      currentQueueSize: pendingCount,
    };
  }

  /**
   * Persist queue state.
   */
  async persist(): Promise<void> {
    await this.persistence.save(this.queue);
  }

  /**
   * Restore queue state from persistence.
   */
  async restore(): Promise<void> {
    try {
      const restoredQueue = await this.persistence.load();
      if (restoredQueue) {
        this.queue = restoredQueue;
        
        // Sync metrics with queue state
        this.metrics.updateCurrentQueueSize(this.queue.items.size);
      }
    } catch (error) {
      if (this.config.autoRecoveryEnabled) {
        // Attempt recovery
        const recoveryResult = await this.recovery.recoverQueue(this.queue, this.spaceKey);
        if (!recoveryResult.success) {
          throw new Error(`Queue restoration failed and recovery failed: ${recoveryResult.errors.join(', ')}`);
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * Check if queue is empty.
   */
  isEmpty(): boolean {
    return this.queue.processingOrder.length === 0 && 
           Array.from(this.queue.items.values()).every(item => 
             item.status === 'completed' || item.status === 'failed'
           );
  }

  /**
   * Get current queue size.
   */
  size(): number {
    return this.queue.items.size;
  }

  /**
   * Get current queue state.
   */
  getState(): QueueState {
    const items = Array.from(this.queue.items.values());
    const pending = items.filter(item => item.status === 'pending').length;
    const processing = items.filter(item => item.status === 'processing').length;
    const completed = items.filter(item => item.status === 'completed').length;
    const failed = items.filter(item => item.status === 'failed').length;

    // Determine state based on queue contents
    if (items.length === 0) {
      return 'empty';
    }

    if (processing > 0) {
      return 'processing';
    }

    if (pending > 0) {
      return 'populated';
    }

    if (failed > 0 && completed === 0) {
      return 'failed';
    }

    if (completed > 0 && pending === 0 && processing === 0) {
      return 'drained';
    }

    return 'populated';
  }

  /**
   * Get detailed queue state information.
   */
  getDetailedState(): QueueStateInfo {
    const items = Array.from(this.queue.items.values());
    const pending = items.filter(item => item.status === 'pending').length;
    const processing = items.filter(item => item.status === 'processing').length;
    const completed = items.filter(item => item.status === 'completed').length;
    const failed = items.filter(item => item.status === 'failed').length;

    return {
      totalItems: items.length,
      pendingItems: pending,
      processingItems: processing,
      completedItems: completed,
      failedItems: failed,
      processingOrder: [...this.queue.processingOrder],
      processedPages: Array.from(this.queue.processedPages),
      lastPersistenceTime: this.queue.metrics.lastPersistenceTime,
    };
  }

  /**
   * Clear all items from queue.
   */
  async clear(): Promise<void> {
    this.queue.items.clear();
    this.queue.processingOrder = [];
    this.queue.processedPages.clear();
    this.metrics.reset();
    
    // Persist cleared state
    await this.persist();
  }

  /**
   * Process all items in the queue.
   */
  async processAll(
    processor: (item: QueueItem) => Promise<ProcessingResult>
  ): Promise<{ processed: number; failed: number; errors: Error[] }> {
    const results = { processed: 0, failed: 0, errors: [] as Error[] };

    while (!this.isEmpty()) {
      const item = await this.next();
      if (!item) break;

      try {
        const result = await processor(item);
        
        if (result.status === 'success') {
          await this.markProcessed(item.pageId);
          results.processed++;
          
          // Add any newly discovered items
          if (result.newDiscoveries && result.newDiscoveries.length > 0) {
            await this.add(result.newDiscoveries);
          }
        } else {
          await this.markFailed(item.pageId, result.error || new Error('Processing failed'));
          results.failed++;
          if (result.error) {
            results.errors.push(result.error);
          }
        }
      } catch (error) {
        await this.markFailed(item.pageId, error as Error);
        results.failed++;
        results.errors.push(error as Error);
      }
    }

    return results;
  }

  /**
   * Get discovery service for queue population.
   */
  getDiscoveryService(): QueueDiscoveryService {
    return this.discovery;
  }

  /**
   * Get recovery service for error handling.
   */
  getRecoveryService(): QueueRecoveryService {
    return this.recovery;
  }

  private initializeQueue(): DownloadQueue {
    return {
      items: new Map(),
      processingOrder: [],
      processedPages: new Set(),
      maxQueueSize: this.config.maxQueueSize,
      persistencePath: this.config.persistencePath,
      persistenceThreshold: this.config.persistenceThreshold,
      metrics: {
        totalQueued: 0,
        totalProcessed: 0,
        totalFailed: 0,
        currentQueueSize: 0,
        discoveryRate: 0,
        processingRate: 0,
        averageRetryCount: 0,
        persistenceOperations: 0,
      },
    };
  }

  private removeFromProcessingOrder(pageId: string): void {
    const index = this.queue.processingOrder.indexOf(pageId);
    if (index !== -1) {
      this.queue.processingOrder.splice(index, 1);
    }
  }

  private async checkPersistenceThreshold(): Promise<void> {
    const currentSize = this.queue.items.size;
    const lastPersistenceSize = this.queue.metrics.persistenceOperations * this.config.persistenceThreshold;
    
    if (currentSize - lastPersistenceSize >= this.config.persistenceThreshold) {
      await this.persist();
      this.queue.metrics.persistenceOperations++;
      this.queue.metrics.lastPersistenceTime = new Date().toISOString();
    }
  }
}

/**
 * Create a download queue with default configuration.
 */
export function createDownloadQueue(
  spaceKey: string,
  config?: Partial<DownloadQueueConfig>,
  workspaceDir?: string
): DownloadQueueOrchestrator {
  return new DownloadQueueOrchestrator(spaceKey, config, workspaceDir);
}

/**
 * Queue processing utilities.
 */
export const queueUtils = {
  /**
   * Count items by status.
   */
  countByStatus(queue: DownloadQueue): Record<string, number> {
    const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
    
    for (const item of queue.items.values()) {
      counts[item.status]++;
    }
    
    return counts;
  },

  /**
   * Get processing progress percentage.
   */
  getProgress(queue: DownloadQueue): number {
    const total = queue.items.size;
    if (total === 0) return 100;
    
    const completed = Array.from(queue.items.values())
      .filter(item => item.status === 'completed' || item.status === 'failed').length;
    
    return Math.round((completed / total) * 100);
  },

  /**
   * Get estimated completion time based on processing rate.
   */
  getEstimatedCompletion(queue: DownloadQueue, processingRate: number): Date | null {
    if (processingRate <= 0) return null;
    
    const remaining = Array.from(queue.items.values())
      .filter(item => item.status === 'pending' || item.status === 'processing').length;
    
    const remainingTimeMs = (remaining / processingRate) * 1000;
    return new Date(Date.now() + remainingTimeMs);
  },
};
