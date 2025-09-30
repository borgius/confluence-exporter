/**
 * T090: Queue recovery mechanisms
 * Supports FR-038 for queue resilience and error recovery
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import type { QueueItem, DownloadQueue } from '../models/queueEntities.js';
import { validateQueueState } from './queueValidation.js';

export interface RecoveryOptions {
  maxRetries: number;
  retryDelayMs: number;
  backupRetentionDays: number;
  corruptionThreshold: number;
  autoRepairEnabled: boolean;
}

export interface RecoveryResult {
  success: boolean;
  recoveredItems: number;
  repairedItems: number;
  droppedItems: number;
  errors: string[];
  backupUsed?: string;
}

export interface BackupMetadata {
  timestamp: number;
  version: string;
  itemCount: number;
  checksum: string;
  spaceKey: string;
}

export class QueueRecoveryService {
  private readonly backupDir: string;
  private readonly options: RecoveryOptions;

  constructor(
    workspaceDir: string,
    options: Partial<RecoveryOptions> = {}
  ) {
    this.backupDir = join(workspaceDir, '.confluence-queue-backups');
    this.options = {
      maxRetries: 3,
      retryDelayMs: 1000,
      backupRetentionDays: 7,
      corruptionThreshold: 0.1, // 10% corruption threshold
      autoRepairEnabled: true,
      ...options,
    };
  }

  /**
   * Recover queue from corruption or failure.
   */
  async recoverQueue(
    corruptedQueue: DownloadQueue,
    spaceKey: string
  ): Promise<RecoveryResult> {
    const result = this.createInitialRecoveryResult();

    try {
      // Step 1: Validate current queue state
      if (await this.tryDirectRecovery(corruptedQueue, result)) {
        return result;
      }

      // Step 2: Attempt auto-repair if enabled
      if (await this.tryAutoRepair(corruptedQueue, result)) {
        return result;
      }

      // Step 3: Try backup recovery
      if (await this.tryBackupRecovery(spaceKey, result)) {
        return result;
      }

      // Step 4: Create fresh queue
      await this.tryFreshQueueCreation(corruptedQueue, spaceKey, result);
      return result;

    } catch (error) {
      result.errors.push(`Recovery failed: ${error}`);
      return result;
    }
  }

  private createInitialRecoveryResult(): RecoveryResult {
    return {
      success: false,
      recoveredItems: 0,
      repairedItems: 0,
      droppedItems: 0,
      errors: [],
    };
  }

  private async tryDirectRecovery(corruptedQueue: DownloadQueue, result: RecoveryResult): Promise<boolean> {
    const validation = validateQueueState(corruptedQueue);
    if (validation.valid) {
      result.success = true;
      result.recoveredItems = corruptedQueue.items?.size || 0;
      return true;
    }
    return false;
  }

  private async tryAutoRepair(corruptedQueue: DownloadQueue, result: RecoveryResult): Promise<boolean> {
    if (this.options.autoRepairEnabled) {
      const repairResult = await this.attemptAutoRepair(corruptedQueue);
      result.repairedItems = repairResult.repairedItems;
      
      if (repairResult.success) {
        result.success = true;
        result.recoveredItems = corruptedQueue.items?.size || 0;
        return true;
      }
    }
    return false;
  }

  private async tryBackupRecovery(spaceKey: string, result: RecoveryResult): Promise<boolean> {
    const backupResult = await this.recoverFromBackup(spaceKey);
    if (backupResult.success && backupResult.queue) {
      result.success = true;
      result.recoveredItems = backupResult.queue.items?.size || 0;
      result.backupUsed = backupResult.backupFile;
      return true;
    }
    return false;
  }

  private async tryFreshQueueCreation(
    corruptedQueue: DownloadQueue, 
    spaceKey: string, 
    result: RecoveryResult
  ): Promise<void> {
    const salvageResult = await this.createFreshQueue(corruptedQueue, spaceKey);
    result.success = salvageResult.success;
    result.recoveredItems = salvageResult.recoveredItems;
    result.droppedItems = salvageResult.droppedItems;
  }

  /**
   * Create backup of queue state.
   */
  async createBackup(queue: DownloadQueue, spaceKey: string): Promise<string> {
    await this.ensureBackupDirectory();
    
    const timestamp = Date.now();
    const backupFile = join(this.backupDir, `queue-backup-${spaceKey}-${timestamp}.json`);
    
    const metadata: BackupMetadata = {
      timestamp,
      version: '1.0.0',
      itemCount: queue.items?.size || 0,
      checksum: this.calculateQueueChecksum(queue),
      spaceKey,
    };

    const backupData = {
      metadata,
      queue: this.serializeQueue(queue),
    };

    await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2), 'utf-8');
    await this.cleanupOldBackups();
    
    return backupFile;
  }

  /**
   * Restore queue from backup.
   */
  async restoreFromBackup(backupFile: string): Promise<DownloadQueue | null> {
    try {
      const backupContent = await fs.readFile(backupFile, 'utf-8');
      const backupData = JSON.parse(backupContent) as {
        metadata: BackupMetadata;
        queue: SerializedQueue;
      };
      
      // Validate backup structure
      if (!this.isValidBackup(backupData)) {
        throw new Error('Invalid backup format');
      }

      const queue = this.deserializeQueue(backupData.queue);
      return queue;

    } catch {
      return null;
    }
  }

  /**
   * List available backups for a space.
   */
  async listBackups(spaceKey?: string): Promise<BackupMetadata[]> {
    try {
      await this.ensureBackupDirectory();
      const files = await fs.readdir(this.backupDir);
      const backups: BackupMetadata[] = [];

      for (const file of files) {
        if (!file.startsWith('queue-backup-') || !file.endsWith('.json')) {
          continue;
        }

        if (spaceKey && !file.includes(`-${spaceKey}-`)) {
          continue;
        }

        try {
          const backupPath = join(this.backupDir, file);
          const content = await fs.readFile(backupPath, 'utf-8');
          const data = JSON.parse(content) as { metadata: BackupMetadata };
          
          if (this.isValidBackup(data)) {
            backups.push(data.metadata);
          }
        } catch {
          continue;
        }
      }

      return backups.sort((a, b) => b.timestamp - a.timestamp);

    } catch {
      return [];
    }
  }

  private async attemptAutoRepair(
    queue: DownloadQueue
  ): Promise<{ success: boolean; repairedItems: number }> {
    let repairedItems = 0;

    try {
      repairedItems += this.repairQueueStructure(queue);
      repairedItems += this.repairQueueItems(queue);
      repairedItems += this.repairQueueConsistency(queue);

      // Final validation
      const validation = validateQueueState(queue);
      return {
        success: validation.valid,
        repairedItems,
      };

    } catch {
      return { success: false, repairedItems };
    }
  }

  private repairQueueStructure(queue: DownloadQueue): number {
    let repairs = 0;

    if (!queue.items || !(queue.items instanceof Map)) {
      queue.items = new Map();
      repairs++;
    }

    if (!Array.isArray(queue.processingOrder)) {
      queue.processingOrder = [];
      repairs++;
    }

    if (!queue.processedPages || !(queue.processedPages instanceof Set)) {
      queue.processedPages = new Set();
      repairs++;
    }

    if (!queue.metrics || typeof queue.metrics !== 'object') {
      queue.metrics = {
        totalQueued: 0,
        totalProcessed: 0,
        totalFailed: 0,
        currentQueueSize: 0,
        discoveryRate: 0,
        processingRate: 0,
        averageRetryCount: 0,
        persistenceOperations: 0,
      };
      repairs++;
    }

    return repairs;
  }

  private repairQueueItems(queue: DownloadQueue): number {
    let repairs = 0;

    if (!queue.items) return repairs;

    const invalidItems: string[] = [];
    for (const [pageId, item] of queue.items) {
      if (!this.isValidQueueItem(item) || item.pageId !== pageId) {
        invalidItems.push(pageId);
      }
    }

    for (const pageId of invalidItems) {
      queue.items.delete(pageId);
      repairs++;
    }

    return repairs;
  }

  private repairQueueConsistency(queue: DownloadQueue): number {
    let repairs = 0;

    // Repair processing order consistency
    if (queue.processingOrder && queue.items) {
      const originalLength = queue.processingOrder.length;
      queue.processingOrder = queue.processingOrder.filter(pageId => 
        queue.items?.has(pageId)
      );
      if (queue.processingOrder.length !== originalLength) {
        repairs++;
      }
    }

    // Repair metrics consistency
    if (queue.items && queue.metrics) {
      const currentSize = Array.from(queue.items.values())
        .filter(item => item.status === 'pending' || item.status === 'processing')
        .length;
      
      if (queue.metrics.currentQueueSize !== currentSize) {
        queue.metrics.currentQueueSize = currentSize;
        repairs++;
      }
    }

    return repairs;
  }

  private async recoverFromBackup(spaceKey: string): Promise<{
    success: boolean;
    queue?: DownloadQueue;
    backupFile?: string;
  }> {
    try {
      const backups = await this.listBackups(spaceKey);
      
      for (const backup of backups) {
        const backupFile = join(
          this.backupDir,
          `queue-backup-${spaceKey}-${backup.timestamp}.json`
        );
        
        const queue = await this.restoreFromBackup(backupFile);
        if (queue) {
          return { success: true, queue, backupFile };
        }
      }

      return { success: false };

    } catch {
      return { success: false };
    }
  }

  private async createFreshQueue(
    corruptedQueue: DownloadQueue,
    _spaceKey: string
  ): Promise<{ success: boolean; recoveredItems: number; droppedItems: number }> {
    let recoveredItems = 0;
    let droppedItems = 0;

    try {
      // Create fresh queue structure
      const freshQueue = this.createEmptyQueue(corruptedQueue);

      // Salvage valid items
      const salvageResult = this.salvageValidItems(corruptedQueue, freshQueue);
      recoveredItems += salvageResult.recovered;
      droppedItems += salvageResult.dropped;

      // Salvage processed pages
      if (corruptedQueue.processedPages) {
        freshQueue.processedPages = new Set(corruptedQueue.processedPages);
      }

      // Update metrics
      freshQueue.metrics.currentQueueSize = freshQueue.processingOrder.length;
      freshQueue.metrics.totalQueued = recoveredItems;

      // Replace the corrupted queue data
      Object.assign(corruptedQueue, freshQueue);

      return { success: true, recoveredItems, droppedItems };

    } catch {
      return { success: false, recoveredItems, droppedItems };
    }
  }

  private createEmptyQueue(corruptedQueue: DownloadQueue): DownloadQueue {
    return {
      items: new Map(),
      processingOrder: [],
      processedPages: new Set(),
      maxQueueSize: corruptedQueue.maxQueueSize || 1000,
      persistencePath: corruptedQueue.persistencePath || '',
      persistenceThreshold: corruptedQueue.persistenceThreshold || 10,
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

  private salvageValidItems(
    corruptedQueue: DownloadQueue,
    freshQueue: DownloadQueue
  ): { recovered: number; dropped: number } {
    let recovered = 0;
    let dropped = 0;

    if (!corruptedQueue.items) {
      return { recovered, dropped };
    }

    for (const [pageId, item] of corruptedQueue.items) {
      if (this.isValidQueueItem(item)) {
        freshQueue.items.set(pageId, item);
        if (item.status === 'pending' || item.status === 'processing') {
          freshQueue.processingOrder.push(pageId);
        }
        recovered++;
      } else {
        dropped++;
      }
    }

    return { recovered, dropped };
  }

  private isValidQueueItem(item: unknown): item is QueueItem {
    if (!item || typeof item !== 'object') return false;

    const qi = item as Partial<QueueItem>;
    return !!(
      qi.pageId &&
      typeof qi.pageId === 'string' &&
      qi.sourceType &&
      ['initial', 'macro', 'reference', 'user'].includes(qi.sourceType) &&
      typeof qi.discoveryTimestamp === 'number' &&
      typeof qi.retryCount === 'number' &&
      qi.status &&
      ['pending', 'processing', 'completed', 'failed'].includes(qi.status)
    );
  }

  private isValidBackup(data: unknown): data is { metadata: BackupMetadata; queue: SerializedQueue } {
    if (!data || typeof data !== 'object') return false;

    const backup = data as { metadata?: unknown; queue?: unknown };
    return !!(
      backup.metadata &&
      typeof backup.metadata === 'object' &&
      backup.queue
    );
  }

  private serializeQueue(queue: DownloadQueue): SerializedQueue {
    return {
      items: Array.from(queue.items?.entries() || []),
      processingOrder: queue.processingOrder || [],
      processedPages: Array.from(queue.processedPages || []),
      maxQueueSize: queue.maxQueueSize,
      persistencePath: queue.persistencePath,
      persistenceThreshold: queue.persistenceThreshold,
      metrics: queue.metrics,
    };
  }

  private deserializeQueue(data: SerializedQueue): DownloadQueue {
    return {
      items: new Map(data.items || []),
      processingOrder: data.processingOrder || [],
      processedPages: new Set(data.processedPages || []),
      maxQueueSize: data.maxQueueSize || 1000,
      persistencePath: data.persistencePath || '',
      persistenceThreshold: data.persistenceThreshold || 10,
      metrics: data.metrics || {
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

  private calculateQueueChecksum(queue: DownloadQueue): string {
    const data = {
      items: Array.from(queue.items?.entries() || []).sort(([a], [b]) => a.localeCompare(b)),
      processingOrder: [...(queue.processingOrder || [])].sort(),
      processedPages: Array.from(queue.processedPages || []).sort(),
      maxQueueSize: queue.maxQueueSize,
    };

    const jsonString = JSON.stringify(data);
    // Simple checksum for backup validation
    let hash = 0;
    for (let i = 0; i < jsonString.length; i++) {
      const char = jsonString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  private async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.access(this.backupDir);
    } catch {
      await fs.mkdir(this.backupDir, { recursive: true });
    }
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      const files = await fs.readdir(this.backupDir);
      const cutoffTime = Date.now() - (this.options.backupRetentionDays * 24 * 60 * 60 * 1000);

      for (const file of files) {
        if (!file.startsWith('queue-backup-') || !file.endsWith('.json')) {
          continue;
        }

        const filePath = join(this.backupDir, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime.getTime() < cutoffTime) {
          await fs.unlink(filePath);
        }
      }

    } catch {
      // Ignore cleanup errors
    }
  }
}

interface SerializedQueue {
  items: Array<[string, QueueItem]>;
  processingOrder: string[];
  processedPages: string[];
  maxQueueSize: number;
  persistencePath: string;
  persistenceThreshold: number;
  metrics: {
    totalQueued: number;
    totalProcessed: number;
    totalFailed: number;
    currentQueueSize: number;
    discoveryRate: number;
    processingRate: number;
    averageRetryCount: number;
    persistenceOperations: number;
  };
}

/**
 * Create a recovery service with default configuration.
 */
export function createRecoveryService(
  workspaceDir: string,
  options?: Partial<RecoveryOptions>
): QueueRecoveryService {
  return new QueueRecoveryService(workspaceDir, options);
}
