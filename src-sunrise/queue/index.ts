/**
 * T090: Queue module index - public interface exports
 * Provides clean public API for queue functionality
 */

import { DownloadQueueOrchestrator } from './downloadQueue.js';
import { calculateQueuePerformanceScore, createMetricsSummary } from './queueMetrics.js';
import type { DownloadQueueConfig } from './downloadQueue.js';
import type { QueueState } from '../models/queueEntities.js';

// Main queue orchestrator
export { 
  DownloadQueueOrchestrator, 
  createDownloadQueue, 
  queueUtils,
  type DownloadQueueConfig, 
  type QueueStateInfo 
} from './downloadQueue.js';

// Queue persistence
export { 
  QueuePersistenceService, 
  DEFAULT_PERSISTENCE_OPTIONS,
  type PersistenceOptions 
} from './queuePersistence.js';

// Queue metrics
export { 
  QueueMetricsTracker, 
  createQueueMetrics, 
  mergeQueueMetrics, 
  calculateQueuePerformanceScore, 
  createMetricsSummary,
  type MetricsWindow 
} from './queueMetrics.js';

// Queue validation
export { 
  validateQueueItemQuick, 
  validateQueueState, 
  performIntegrityCheck, 
  generateQueueChecksum, 
  verifyQueueChecksum, 
  validatePersistedData, 
  sanitizeQueueItem,
  type ValidationResult, 
  type QueueIntegrityCheck 
} from './queueValidation.js';

// Queue discovery
export { 
  QueueDiscoveryService, 
  defaultDiscoveryHooks, 
  createDiscoveryService,
  type DiscoveryContext, 
  type DiscoveryResult, 
  type DiscoveryHookResult, 
  type DiscoveryHook 
} from './queueDiscovery.js';

// Queue recovery
export { 
  QueueRecoveryService, 
  createRecoveryService,
  type RecoveryOptions, 
  type RecoveryResult, 
  type BackupMetadata 
} from './queueRecovery.js';

// Re-export entity types for convenience
export type {
  QueueItem,
  DownloadQueue,
  QueueMetrics,
  QueuePersistence,
  QueueState,
  ProcessingResult,
  ProcessingSummary,
  ProcessingError,
  QueueConfig,
  IQueueItem,
  IDownloadQueue,
  IQueuePersistence,
  IQueueMetrics,
} from '../models/queueEntities.js';

/**
 * Create a fully configured download queue with sensible defaults.
 */
export function createStandardQueue(
  spaceKey: string,
  workspaceDir?: string
): DownloadQueueOrchestrator {
  return new DownloadQueueOrchestrator(
    spaceKey,
    {
      maxQueueSize: 10000,
      maxRetries: 3,
      persistenceThreshold: 50,
      metricsWindowSeconds: 300,
      enableCircularReferenceDetection: true,
      autoRecoveryEnabled: true,
    },
    workspaceDir
  );
}

/**
 * Create a lightweight queue for testing or small batches.
 */
export function createLightweightQueue(
  spaceKey: string,
  workspaceDir?: string
): DownloadQueueOrchestrator {
  return new DownloadQueueOrchestrator(
    spaceKey,
    {
      maxQueueSize: 100,
      maxRetries: 1,
      persistenceThreshold: 10,
      metricsWindowSeconds: 60,
      enableCircularReferenceDetection: false,
      autoRecoveryEnabled: false,
    },
    workspaceDir
  );
}

/**
 * Create a high-capacity queue for large exports.
 */
export function createHighCapacityQueue(
  spaceKey: string,
  workspaceDir?: string
): DownloadQueueOrchestrator {
  return new DownloadQueueOrchestrator(
    spaceKey,
    {
      maxQueueSize: 50000,
      maxRetries: 5,
      persistenceThreshold: 100,
      metricsWindowSeconds: 600,
      enableCircularReferenceDetection: true,
      autoRecoveryEnabled: true,
    },
    workspaceDir
  );
}

/**
 * Queue factory with preset configurations.
 */
export const queueFactory = {
  standard: createStandardQueue,
  lightweight: createLightweightQueue,
  highCapacity: createHighCapacityQueue,
  custom: (spaceKey: string, config?: Partial<DownloadQueueConfig>, workspaceDir?: string) => 
    new DownloadQueueOrchestrator(spaceKey, config, workspaceDir),
} as const;

/**
 * Queue status utilities.
 */
export const queueStatus = {
  /**
   * Check if queue is ready for processing.
   */
  isReady(queue: DownloadQueueOrchestrator): boolean {
    return !queue.isEmpty() && queue.getState() !== 'failed';
  },

  /**
   * Check if queue needs attention (failed or interrupted).
   */
  needsAttention(queue: DownloadQueueOrchestrator): boolean {
    const state = queue.getState();
    return state === 'failed' || state === 'interrupted';
  },

  /**
   * Check if queue is actively processing.
   */
  isActive(queue: DownloadQueueOrchestrator): boolean {
    return queue.getState() === 'processing';
  },

  /**
   * Check if queue has completed all work.
   */
  isComplete(queue: DownloadQueueOrchestrator): boolean {
    return queue.getState() === 'drained';
  },

  /**
   * Get human-readable status description.
   */
  getDescription(queue: DownloadQueueOrchestrator): string {
    const state = queue.getState();
    const detailedState = queue.getDetailedState();
    
    switch (state) {
      case 'empty':
        return 'Queue is empty';
      case 'populated':
        return `Queue has ${detailedState.pendingItems} items ready for processing`;
      case 'processing':
        return `Processing ${detailedState.processingItems} items, ${detailedState.pendingItems} pending`;
      case 'drained':
        return `Queue complete: ${detailedState.completedItems} processed, ${detailedState.failedItems} failed`;
      case 'failed':
        return `Queue failed: ${detailedState.failedItems} items failed`;
      case 'interrupted':
        return `Queue interrupted: ${detailedState.processingItems} items were being processed`;
      default:
        return `Queue state: ${state}`;
    }
  },
} as const;

/**
 * Queue monitoring utilities.
 */
export const queueMonitor = {
  /**
   * Get queue health score (0-100).
   */
  getHealthScore(queue: DownloadQueueOrchestrator): number {
    const metrics = queue.getMetrics();
    return calculateQueuePerformanceScore(metrics);
  },

  /**
   * Get progress percentage (0-100).
   */
  getProgress(queue: DownloadQueueOrchestrator): number {
    const detailedState = queue.getDetailedState();
    const total = detailedState.totalItems;
    if (total === 0) return 100;
    
    const completed = detailedState.completedItems + detailedState.failedItems;
    return Math.round((completed / total) * 100);
  },

  /**
   * Estimate completion time.
   */
  getEstimatedCompletion(queue: DownloadQueueOrchestrator): Date | null {
    const metrics = queue.getMetrics();
    const detailedState = queue.getDetailedState();
    const processingRate = metrics.processingRate;
    
    if (processingRate <= 0) return null;
    
    const remaining = detailedState.pendingItems + detailedState.processingItems;
    const remainingTimeMs = (remaining / processingRate) * 1000;
    return new Date(Date.now() + remainingTimeMs);
  },

  /**
   * Create monitoring summary.
   */
  getSummary(queue: DownloadQueueOrchestrator): {
    state: QueueState;
    description: string;
    progress: number;
    healthScore: number;
    estimatedCompletion: Date | null;
    metrics: ReturnType<typeof createMetricsSummary>;
  } {
    const state = queue.getState();
    const metrics = queue.getMetrics();
    
    return {
      state,
      description: queueStatus.getDescription(queue),
      progress: queueMonitor.getProgress(queue),
      healthScore: queueMonitor.getHealthScore(queue),
      estimatedCompletion: queueMonitor.getEstimatedCompletion(queue),
      metrics: createMetricsSummary(metrics),
    };
  },
} as const;
