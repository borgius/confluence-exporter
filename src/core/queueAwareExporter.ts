/**
 * T131a: Queue-aware export orchestration
 * Manages discovery and processing cycles for queue-based exports
 */

import type { Page, ExportConfig } from '../models/entities.js';
import type { DownloadQueueOrchestrator } from '../queue/index.js';
import type { MarkdownTransformResult, TransformContext } from '../transform/index.js';
import type { EnhancedTransformResult } from '../transform/enhancedMarkdownTransformer.js';
import type { ConfluenceApi } from '../confluence/index.js';
import { logger } from '../util/logger.js';

// Type for enhanced transformer that can produce discovery results
interface EnhancedTransformer {
  transform(page: Page, context: TransformContext): Promise<MarkdownTransformResult | EnhancedTransformResult>;
}

export interface QueueExportResult {
  processedPages: Map<string, MarkdownTransformResult>;
  discoveryPhases: number;
  totalProcessingTime: number;
  queueMetrics: {
    totalQueued: number;
    totalProcessed: number;
    totalFailed: number;
    discoveryRate: number;
    processingRate: number;
  };
  errors: QueueExportError[];
}

export interface QueueExportError {
  pageId: string;
  phase: 'fetch' | 'transform' | 'discovery' | 'queue';
  message: string;
  retryable: boolean;
  timestamp: Date;
}

export interface QueueExportOptions {
  maxDiscoveryPhases: number;
  batchSize: number;
  concurrencyLimit: number;
  enableProgressReporting: boolean;
  pauseBetweenPhases: number; // milliseconds
}

export interface ExportOrchestrator {
  process(
    transformer: EnhancedTransformer,
    api: ConfluenceApi,
    config: ExportConfig,
    context: TransformContext
  ): Promise<QueueExportResult>;
}

/**
 * Orchestrates queue-based export with discovery cycles
 */
export class QueueAwareExporter implements ExportOrchestrator {
  private readonly queue: DownloadQueueOrchestrator;
  private readonly options: QueueExportOptions;
  private readonly results: Map<string, MarkdownTransformResult> = new Map();
  private readonly errors: QueueExportError[] = [];
  private startTime: number = 0;

  constructor(
    queue: DownloadQueueOrchestrator,
    options: Partial<QueueExportOptions> = {}
  ) {
    this.queue = queue;
    this.options = {
      maxDiscoveryPhases: 15,
      batchSize: 20,
      concurrencyLimit: 5,
      enableProgressReporting: true,
      pauseBetweenPhases: 1000,
      ...options,
    };
  }

  /**
   * Process all pages in the queue with discovery cycles
   */
  async process(
    transformer: EnhancedTransformer,
    api: ConfluenceApi,
    config: ExportConfig,
    context: TransformContext
  ): Promise<QueueExportResult> {
    this.startTime = Date.now();
    this.results.clear();
    this.errors.length = 0;

    logger.info('Starting queue-aware export orchestration', {
      initialQueueSize: this.queue.size(),
      maxPhases: this.options.maxDiscoveryPhases,
      batchSize: this.options.batchSize,
      concurrency: this.options.concurrencyLimit
    });

    let discoveryPhase = 1;
    let consecutiveEmptyPhases = 0;
    const maxEmptyPhases = 3;

    // Main discovery and processing loop
    while (discoveryPhase <= this.options.maxDiscoveryPhases) {
      const phaseStartTime = Date.now();
      const initialQueueSize = this.queue.size();

      if (initialQueueSize === 0) {
        consecutiveEmptyPhases++;
        if (consecutiveEmptyPhases >= maxEmptyPhases) {
          logger.info('Queue consistently empty, export complete', {
            phase: discoveryPhase,
            emptyPhases: consecutiveEmptyPhases
          });
          break;
        }
        
        // Short pause before checking again
        await this.pause(500);
        discoveryPhase++;
        continue;
      }

      consecutiveEmptyPhases = 0;

      logger.info(`Starting discovery phase ${discoveryPhase}`, {
        queueSize: initialQueueSize,
        processedSoFar: this.results.size
      });

      // Process current batch
      const phaseResults = await this.processDiscoveryPhase(
        transformer,
        api,
        config,
        context,
        discoveryPhase
      );

      // Merge results
      for (const [pageId, result] of phaseResults) {
        this.results.set(pageId, result);
      }

      const phaseTime = Date.now() - phaseStartTime;
      const newQueueSize = this.queue.size();
      const newItemsDiscovered = Math.max(0, newQueueSize - (initialQueueSize - phaseResults.size));

      logger.info(`Discovery phase ${discoveryPhase} completed`, {
        processedInPhase: phaseResults.size,
        newItemsDiscovered,
        queueSizeBefore: initialQueueSize,
        queueSizeAfter: newQueueSize,
        phaseTimeMs: phaseTime,
        totalProcessed: this.results.size
      });

      // Progress reporting
      if (this.options.enableProgressReporting) {
        await this.reportProgress(discoveryPhase, phaseResults.size, newItemsDiscovered);
      }

      // Pause between phases if configured
      if (this.options.pauseBetweenPhases > 0) {
        await this.pause(this.options.pauseBetweenPhases);
      }

      discoveryPhase++;
    }

    if (discoveryPhase > this.options.maxDiscoveryPhases) {
      logger.warn('Maximum discovery phases reached', {
        maxPhases: this.options.maxDiscoveryPhases,
        remainingInQueue: this.queue.size()
      });
    }

    // Final result compilation
    const totalTime = Date.now() - this.startTime;
    const queueMetrics = this.queue.getMetrics();

    const result: QueueExportResult = {
      processedPages: new Map(this.results),
      discoveryPhases: discoveryPhase - 1,
      totalProcessingTime: totalTime,
      queueMetrics: {
        totalQueued: queueMetrics.totalQueued,
        totalProcessed: queueMetrics.totalProcessed,
        totalFailed: queueMetrics.totalFailed,
        discoveryRate: queueMetrics.discoveryRate,
        processingRate: queueMetrics.processingRate,
      },
      errors: [...this.errors]
    };

    logger.info('Queue-aware export orchestration completed', {
      totalPages: result.processedPages.size,
      discoveryPhases: result.discoveryPhases,
      totalTimeMs: result.totalProcessingTime,
      totalErrors: result.errors.length,
      queueMetrics: result.queueMetrics
    });

    return result;
  }

  /**
   * Process a single discovery phase
   */
  private async processDiscoveryPhase(
    transformer: EnhancedTransformer,
    api: ConfluenceApi,
    config: ExportConfig,
    context: TransformContext,
    phase: number
  ): Promise<Map<string, MarkdownTransformResult>> {
    const phaseResults = new Map<string, MarkdownTransformResult>();
    const processingTasks: Promise<void>[] = [];
    const batchStartTime = Date.now();

    // Process items in batches to control concurrency
    let processed = 0;
    while (!this.queue.isEmpty() && processed < this.options.batchSize) {
      const queueItem = await this.queue.next();
      if (!queueItem) break;

      const task = this.processQueueItem(
        queueItem.pageId,
        queueItem.sourceType,
        transformer,
        api,
        config,
        context,
        phase
      ).then(result => {
        if (result) {
          phaseResults.set(queueItem.pageId, result);
        }
        processed++;
      });

      processingTasks.push(task);

      // Control concurrency
      if (processingTasks.length >= this.options.concurrencyLimit) {
        await Promise.race(processingTasks);
        // Remove completed tasks
        for (let i = processingTasks.length - 1; i >= 0; i--) {
          const task = processingTasks[i];
          if (await this.isPromiseResolved(task)) {
            processingTasks.splice(i, 1);
          }
        }
      }
    }

    // Wait for all remaining tasks
    await Promise.all(processingTasks);

    const batchTime = Date.now() - batchStartTime;
    logger.debug('Discovery phase batch completed', {
      phase,
      processed: phaseResults.size,
      batchTimeMs: batchTime,
      avgTimePerPage: phaseResults.size > 0 ? batchTime / phaseResults.size : 0
    });

    return phaseResults;
  }

  /**
   * Process a single queue item
   */
  private async processQueueItem(
    pageId: string,
    sourceType: string,
    transformer: EnhancedTransformer,
    api: ConfluenceApi,
    _config: ExportConfig, // Marked as unused
    context: TransformContext,
    phase: number
  ): Promise<MarkdownTransformResult | null> {
    try {
      // Fetch page
      const page = await this.fetchPageWithRetry(pageId, api);
      if (!page) {
        await this.queue.markFailed(pageId, new Error('Failed to fetch page after retries'));
        return null;
      }

      // Transform page with discovery
      const transformResult = await transformer.transform(page, {
        ...context,
        currentPageId: pageId,
      });

      // Handle discovery results if available
      if (this.isEnhancedTransformResult(transformResult)) {
        await this.handleDiscoveryResults(transformResult, phase);
      }

      // Mark as processed
      await this.queue.markProcessed(pageId);

      logger.debug('Queue item processed successfully', {
        pageId,
        title: page.title,
        sourceType,
        phase,
        discoveredItems: this.isEnhancedTransformResult(transformResult) ? 
          transformResult.discoveryResult.queueItems.length : 0
      });

      return transformResult;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.errors.push({
        pageId,
        phase: 'transform',
        message: errorMessage,
        retryable: this.isRetryableError(error),
        timestamp: new Date()
      });

      await this.queue.markFailed(pageId, error as Error);
      
      logger.error('Failed to process queue item', {
        pageId,
        sourceType,
        phase,
        error: errorMessage
      });

      return null;
    }
  }

  /**
   * Fetch page with retry logic
   */
  private async fetchPageWithRetry(pageId: string, api: ConfluenceApi, maxRetries = 3): Promise<Page | null> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await api.getPageWithBody(pageId);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (attempt === maxRetries) {
          this.errors.push({
            pageId,
            phase: 'fetch',
            message: `Failed to fetch after ${maxRetries} attempts: ${errorMessage}`,
            retryable: false,
            timestamp: new Date()
          });
          
          logger.error('Failed to fetch page after retries', {
            pageId,
            attempts: maxRetries,
            error: errorMessage
          });
          
          return null;
        }

        // Wait before retry
        await this.pause(Math.pow(2, attempt) * 1000);
        
        logger.debug('Retrying page fetch', {
          pageId,
          attempt,
          error: errorMessage
        });
      }
    }
    
    return null;
  }

  /**
   * Handle discovery results from enhanced transformer
   */
  private async handleDiscoveryResults(result: EnhancedTransformResult, phase: number): Promise<void> {
    const discoveredItems = result.discoveryResult.queueItems;
    
    if (discoveredItems.length > 0) {
      logger.debug('Adding discovered items to queue', {
        phase,
        discoveredCount: discoveredItems.length,
        sourceTypes: this.countSourceTypes(discoveredItems)
      });

      // Add discovered items to queue
      for (const item of discoveredItems) {
        try {
          await this.queue.add(item);
        } catch (error) {
          logger.warn('Failed to add discovered item to queue', {
            pageId: item.pageId,
            sourceType: item.sourceType,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }

  /**
   * Count source types in discovered items
   */
  private countSourceTypes(items: Array<{ sourceType: string }>): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const item of items) {
      counts[item.sourceType] = (counts[item.sourceType] || 0) + 1;
    }
    return counts;
  }

  /**
   * Check if result is enhanced transform result
   */
  private isEnhancedTransformResult(result: MarkdownTransformResult | EnhancedTransformResult): result is EnhancedTransformResult {
    return result && 'discoveryResult' in result && !!result.discoveryResult;
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('network') || 
             message.includes('timeout') ||
             message.includes('connection') ||
             message.includes('rate limit');
    }
    return false;
  }

  /**
   * Check if promise is resolved
   */
  private async isPromiseResolved(promise: Promise<void>): Promise<boolean> {
    const timeout = Promise.race([
      promise.then(() => true, () => true),
      new Promise(resolve => setTimeout(() => resolve(false), 0))
    ]);
    return await timeout as boolean;
  }

  /**
   * Pause execution for specified milliseconds
   */
  private async pause(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Report progress (can be extended for UI integration)
   */
  private async reportProgress(phase: number, processed: number, discovered: number): Promise<void> {
    const queueState = this.queue.getDetailedState();
    const progress = {
      phase,
      processedInPhase: processed,
      discoveredInPhase: discovered,
      totalProcessed: this.results.size,
      queueSize: this.queue.size(),
      queueState: queueState,
      errors: this.errors.length,
      elapsedTimeMs: Date.now() - this.startTime
    };

    logger.info('Export progress update', progress);
    
    // Future: Emit progress events for UI or monitoring
    // this.emit('progress', progress);
  }
}

/**
 * Create a queue-aware exporter with standard configuration
 */
export function createQueueAwareExporter(
  queue: DownloadQueueOrchestrator,
  options?: Partial<QueueExportOptions>
): QueueAwareExporter {
  return new QueueAwareExporter(queue, options);
}

/**
 * Create a high-performance queue-aware exporter
 */
export function createHighPerformanceExporter(
  queue: DownloadQueueOrchestrator
): QueueAwareExporter {
  return new QueueAwareExporter(queue, {
    maxDiscoveryPhases: 20,
    batchSize: 50,
    concurrencyLimit: 10,
    enableProgressReporting: true,
    pauseBetweenPhases: 500,
  });
}

/**
 * Create a conservative queue-aware exporter for large exports
 */
export function createConservativeExporter(
  queue: DownloadQueueOrchestrator
): QueueAwareExporter {
  return new QueueAwareExporter(queue, {
    maxDiscoveryPhases: 10,
    batchSize: 10,
    concurrencyLimit: 3,
    enableProgressReporting: true,
    pauseBetweenPhases: 2000,
  });
}
