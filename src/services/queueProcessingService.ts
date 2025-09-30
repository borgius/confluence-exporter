/**
 * T114: Queue processing service with retry logic
 * Implements FR-036, FR-037 for queue processing coordination and retry management
 */

import type { QueueItem, QueueMetrics, QueueState } from '../models/queueEntities.js';
import type { Page } from '../models/entities.js';
import type { DownloadQueueOrchestrator } from '../queue/downloadQueue.js';
import { logger } from '../util/logger.js';

export interface QueueProcessingResult {
  processedItems: number;
  failedItems: number;
  skippedItems: number;
  remainingItems: number;
  totalProcessingTimeMs: number;
  metrics: QueueMetrics;
  state: QueueState;
}

export interface QueueProcessingConfig {
  concurrency: number;
  batchSize: number;
  maxRetries: number;
  retryDelayMs: number;
  timeoutMs: number;
  pauseBetweenBatches: number;
  enableProgressReporting: boolean;
}

export interface QueueProcessingContext {
  spaceKey: string;
  outputDir: string;
  dryRun: boolean;
  skipExisting: boolean;
  processor: (item: QueueItem) => Promise<Page | null>;
}

export interface BatchProcessingResult {
  processed: number;
  failed: number;
  skipped: number;
}

/**
 * Semaphore for controlling concurrency.
 */
class Semaphore {
  private permits: number;
  private waiting: (() => void)[] = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise<void>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (next) {
        this.permits--;
        next();
      }
    }
  }
}

export class QueueProcessingService {
  private readonly queueOrchestrator: DownloadQueueOrchestrator;
  private readonly config: QueueProcessingConfig;
  private isProcessing = false;
  private shouldStop = false;
  private currentBatch: QueueItem[] = [];

  constructor(
    queueOrchestrator: DownloadQueueOrchestrator,
    config: Partial<QueueProcessingConfig> = {}
  ) {
    this.queueOrchestrator = queueOrchestrator;
    this.config = {
      concurrency: 3,
      batchSize: 10,
      maxRetries: 3,
      retryDelayMs: 1000,
      timeoutMs: 30000,
      pauseBetweenBatches: 100,
      enableProgressReporting: true,
      ...config,
    };
  }

  /**
   * Process all items in the queue with retry logic and concurrency control.
   */
  async processQueue(context: QueueProcessingContext): Promise<QueueProcessingResult> {
    if (this.isProcessing) {
      throw new Error('Queue processing is already in progress');
    }

    this.isProcessing = true;
    this.shouldStop = false;
    
    const startTime = Date.now();
    let processedItems = 0;
    let failedItems = 0;
    let skippedItems = 0;

    try {
      logger.info(`Starting queue processing for space ${context.spaceKey}`);

      while (!this.shouldStop && !this.queueOrchestrator.isEmpty()) {
        const batch = await this.getNextBatch(this.config.batchSize);
        
        if (batch.length === 0) {
          break;
        }

        this.currentBatch = batch;
        const batchResult = await this.processBatch(batch, context);
        
        processedItems += batchResult.processed;
        failedItems += batchResult.failed;
        skippedItems += batchResult.skipped;

        // Pause between batches if configured
        if (this.config.pauseBetweenBatches > 0) {
          await this.sleep(this.config.pauseBetweenBatches);
        }

        // Report progress if enabled
        if (this.config.enableProgressReporting) {
          const queueSize = this.queueOrchestrator.size();
          logger.info(`Progress: ${processedItems} processed, ${failedItems} failed, ${queueSize} remaining in queue`);
        }
      }

      const totalProcessingTimeMs = Date.now() - startTime;
      const currentState = this.queueOrchestrator.getState();
      const finalMetrics = this.queueOrchestrator.getMetrics();
      const remainingItems = this.queueOrchestrator.size();

      logger.info(`Queue processing completed: ${processedItems} processed, ${failedItems} failed, ${skippedItems} skipped, ${remainingItems} remaining`);

      return {
        processedItems,
        failedItems,
        skippedItems,
        remainingItems,
        totalProcessingTimeMs,
        metrics: finalMetrics,
        state: currentState,
      };

    } catch (error) {
      logger.error('Queue processing failed:', error);
      throw error;
    } finally {
      this.isProcessing = false;
      this.currentBatch = [];
    }
  }

  /**
   * Get the next batch of items to process.
   */
  private async getNextBatch(batchSize: number): Promise<QueueItem[]> {
    const batch: QueueItem[] = [];
    
    for (let i = 0; i < batchSize; i++) {
      const item = await this.queueOrchestrator.next();
      if (!item) {
        break; // No more items
      }
      batch.push(item);
    }
    
    return batch;
  }

  /**
   * Process a batch of queue items with concurrency control.
   */
  private async processBatch(
    batch: QueueItem[],
    context: QueueProcessingContext
  ): Promise<BatchProcessingResult> {
    const semaphore = new Semaphore(this.config.concurrency);
    const results = await Promise.allSettled(
      batch.map(item => this.processItemWithRetry(item, context, semaphore))
    );

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    for (const result of results) {
      if (result.status === 'fulfilled') {
        switch (result.value) {
          case 'processed':
            processed++;
            break;
          case 'skipped':
            skipped++;
            break;
          case 'failed':
            failed++;
            break;
        }
      } else {
        failed++;
        logger.error('Batch item processing error:', result.reason);
      }
    }

    return { processed, failed, skipped };
  }

  /**
   * Process a single item with retry logic and timeout.
   */
  private async processItemWithRetry(
    item: QueueItem,
    context: QueueProcessingContext,
    semaphore: Semaphore,
    retryCount = 0
  ): Promise<'processed' | 'failed' | 'skipped'> {
    await semaphore.acquire();

    try {
      // Check if we should skip this item
      if (context.skipExisting && await this.shouldSkipItem(item, context)) {
        logger.debug(`Skipping existing item: ${item.pageId}`);
        await this.queueOrchestrator.markProcessed(item.pageId);
        return 'skipped';
      }

      // Process with timeout
      const result = await Promise.race([
        this.processItem(item, context),
        this.createTimeout(this.config.timeoutMs)
      ]);

      if (result) {
        await this.queueOrchestrator.markProcessed(item.pageId);
        logger.debug(`Successfully processed item: ${item.pageId}`);
        return 'processed';
      } else {
        throw new Error('Processing returned null result');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Processing failed for item ${item.pageId} (attempt ${retryCount + 1}): ${errorMessage}`);

      // Retry logic
      if (retryCount < this.config.maxRetries) {
        const delay = this.config.retryDelayMs * Math.pow(2, retryCount); // Exponential backoff
        await this.sleep(delay);
        
        // Release semaphore before recursing
        semaphore.release();
        return this.processItemWithRetry(item, context, semaphore, retryCount + 1);
      }

      // Max retries exceeded
      await this.queueOrchestrator.markFailed(item.pageId, error as Error);
      logger.error(`Failed to process item ${item.pageId} after ${this.config.maxRetries} retries: ${errorMessage}`);
      return 'failed';

    } finally {
      semaphore.release();
    }
  }

  /**
   * Process a single queue item.
   */
  private async processItem(
    item: QueueItem,
    context: QueueProcessingContext
  ): Promise<Page | null> {
    try {
      return await context.processor(item);
    } catch (error) {
      logger.error(`Item processing error for ${item.pageId}:`, error);
      throw error;
    }
  }

  /**
   * Check if an item should be skipped (e.g., already exists).
   */
  private async shouldSkipItem(
    _item: QueueItem,
    _context: QueueProcessingContext
  ): Promise<boolean> {
    // This is a placeholder - implement actual logic based on context
    // For example, check if the output file already exists
    return false;
  }

  /**
   * Create a timeout promise.
   */
  private createTimeout(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Processing timeout after ${timeoutMs}ms`)), timeoutMs);
    });
  }

  /**
   * Sleep for the specified number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Stop queue processing gracefully.
   */
  async stop(): Promise<void> {
    if (!this.isProcessing) {
      return;
    }

    logger.info('Stopping queue processing...');
    this.shouldStop = true;

    // Wait for current batch to complete
    while (this.isProcessing) {
      await this.sleep(100);
    }

    logger.info('Queue processing stopped');
  }

  /**
   * Get current processing status.
   */
  getStatus(): {
    isProcessing: boolean;
    currentBatch: QueueItem[];
    shouldStop: boolean;
  } {
    return {
      isProcessing: this.isProcessing,
      currentBatch: [...this.currentBatch],
      shouldStop: this.shouldStop,
    };
  }
}
