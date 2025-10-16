/**
 * T075: Download queue entities
 * Defines types for queue items, queue state, metrics, and persistence
 */

export interface QueueItem {
  pageId: string;
  sourceType: 'initial' | 'macro' | 'reference' | 'user';
  discoveryTimestamp: number;
  retryCount: number;
  parentPageId?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface DownloadQueue {
  items: Map<string, QueueItem>;
  processingOrder: string[];
  processedPages: Set<string>;
  metrics: QueueMetrics;
  persistencePath: string;
  maxQueueSize: number;
  persistenceThreshold: number;
}

export interface QueueMetrics {
  totalQueued: number;
  totalProcessed: number;
  totalFailed: number;
  currentQueueSize: number;
  discoveryRate: number;
  processingRate: number;
  averageRetryCount: number;
  persistenceOperations: number;
  lastPersistenceTime?: string;
}

export interface QueuePersistence {
  version: number;
  timestamp: string;
  spaceKey: string;
  queueItems: QueueItem[];
  processedPageIds: string[];
  metrics: QueueMetrics;
  checksum: string;
}

export type QueueState = 'empty' | 'populated' | 'processing' | 'drained' | 'failed' | 'interrupted';

// Queue operation interfaces
export interface IQueueItem {
  readonly pageId: string;
  readonly sourceType: QueueItem['sourceType'];
  readonly discoveryTimestamp: number;
  readonly parentPageId?: string;
  retryCount: number;
  status: QueueItem['status'];
  
  markProcessing(): void;
  markCompleted(): void;
  markFailed(): void;
  incrementRetry(): void;
  canRetry(maxRetries: number): boolean;
}

export interface IDownloadQueue {
  add(items: QueueItem | QueueItem[]): Promise<void>;
  next(): Promise<QueueItem | null>;
  markProcessed(pageId: string): Promise<void>;
  markFailed(pageId: string, error: Error, retryCount?: number): Promise<void>;
  getMetrics(): QueueMetrics;
  persist(): Promise<void>;
  restore(): Promise<void>;
  isEmpty(): boolean;
  size(): number;
  getState(): QueueState;
  clear(): Promise<void>;
}

export interface IQueuePersistence {
  save(queue: DownloadQueue): Promise<void>;
  load(): Promise<DownloadQueue | null>;
  exists(): Promise<boolean>;
  clear(): Promise<void>;
  validate(data: unknown): boolean;
  calculateChecksum(data: Omit<QueuePersistence, 'checksum'>): string;
}

export interface IQueueMetrics {
  recordQueued(count?: number): void;
  recordProcessed(count?: number): void;
  recordFailed(count?: number, retryCount?: number): void;
  recordPersistence(): void;
  calculateRates(windowSeconds?: number): void;
  getMetrics(): QueueMetrics;
  reset(): void;
}

// Processing interfaces
export interface ProcessingResult {
  item: QueueItem;
  status: 'success' | 'failed' | 'skipped';
  newDiscoveries: QueueItem[];
  error?: Error;
  processingTime: number;
}

export interface ProcessingSummary {
  totalProcessed: number;
  totalFailed: number;
  totalDiscovered: number;
  processingTime: number;
  errors: ProcessingError[];
}

export interface ProcessingError extends Error {
  code: 'QUEUE_FULL' | 'PERSISTENCE_FAILED' | 'CORRUPTION_DETECTED' | 'CIRCULAR_REFERENCE' |
        'PAGE_NOT_FOUND' | 'ACCESS_DENIED' | 'TRANSFORM_FAILED' | 'DISCOVERY_FAILED';
  pageId?: string;
  queueSize?: number;
  retryCount?: number;
  retryable: boolean;
}

// Configuration
export interface QueueConfig {
  maxQueueSize: number;
  maxRetries: number;
  persistenceThreshold: number;
  persistencePath: string;
  metricsWindowSeconds: number;
  enableCircularReferenceDetection: boolean;
}

// Discovery interfaces
export interface DiscoveryContext {
  spaceKey: string;
  currentPageId?: string;
  discoveryDepth: number;
  maxDepth: number;
  sourceType: QueueItem['sourceType'];
}

export interface DiscoveryResult {
  newItems: QueueItem[];
  skippedItems: string[];
  reason?: string;
}

export interface DiscoveryHookResult {
  shouldAdd: boolean;
  reason?: string;
  modifiedItem?: Partial<QueueItem>;
}

export type DiscoveryHook = (
  pageId: string,
  context: DiscoveryContext,
  queue: DownloadQueue
) => DiscoveryHookResult | Promise<DiscoveryHookResult>;

export interface IQueueDiscovery {
  addHook(hook: DiscoveryHook): void;
  removeHook(hook: DiscoveryHook): void;
  clearHooks(): void;
  discoverPageDependencies(pageId: string, context: DiscoveryContext, queue: DownloadQueue): Promise<DiscoveryResult>;
  discoverFromContent(content: string, context: DiscoveryContext, queue: DownloadQueue): Promise<DiscoveryResult>;
  discoverMacroDependencies(macroContent: string, context: DiscoveryContext, queue: DownloadQueue): Promise<DiscoveryResult>;
  checkDiscoveryCapacity(queue: DownloadQueue, additionalItems: number): boolean;
  getDiscoveryStats(queue: DownloadQueue): {
    totalDiscovered: number;
    bySourceType: Record<string, number>;
    circularReferencesDetected: number;
    averageDiscoveryDepth: number;
  };
}

// Default configurations
export const DEFAULT_QUEUE_CONFIG = {
  maxQueueSize: 50000,
  maxRetries: 3,
  persistenceThreshold: 10,
  persistencePath: '.queue-state.json',
  metricsWindowSeconds: 60,
  enableCircularReferenceDetection: true,
};

export const SOFT_QUEUE_LIMIT = 10000;

// Utility functions
export function createQueueItem(
  pageId: string,
  sourceType: QueueItem['sourceType'],
  parentPageId?: string
): QueueItem {
  return {
    pageId,
    sourceType,
    discoveryTimestamp: Date.now(),
    retryCount: 0,
    parentPageId,
    status: 'pending',
  };
}

export function createEmptyMetrics(): QueueMetrics {
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

export function createQueueError(
  code: ProcessingError['code'],
  message: string,
  retryable: boolean = false,
  pageId?: string
): ProcessingError {
  const error = new Error(message) as ProcessingError;
  error.code = code;
  error.retryable = retryable;
  error.pageId = pageId;
  return error;
}

export function isQueueItem(obj: unknown): obj is QueueItem {
  if (!obj || typeof obj !== 'object') return false;
  
  const item = obj as Record<string, unknown>;
  return typeof item.pageId === 'string' &&
    ['initial', 'macro', 'reference', 'user'].includes(item.sourceType as string) &&
    typeof item.discoveryTimestamp === 'number' &&
    typeof item.retryCount === 'number' &&
    ['pending', 'processing', 'completed', 'failed'].includes(item.status as string);
}
