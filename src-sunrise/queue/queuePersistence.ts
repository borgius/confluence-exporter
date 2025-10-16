/**
 * T085: Queue persistence with atomic operations
 * Implements FR-034, FR-038, FR-039 for queue state persistence
 */

import { writeFile, readFile, rename, unlink, access } from 'fs/promises';
import { resolve, dirname } from 'path';
import { createHash } from 'crypto';
import type { 
  QueuePersistence, 
  DownloadQueue, 
  QueueItem,
  QueueMetrics,
  IQueuePersistence 
} from '../models/queueEntities.js';
import { createQueueError } from '../models/queueEntities.js';

export interface PersistenceOptions {
  filePath: string;
  atomicWrites: boolean;
  compressionEnabled: boolean;
  backupOnCorruption: boolean;
  maxBackupFiles: number;
}

export const DEFAULT_PERSISTENCE_OPTIONS: PersistenceOptions = {
  filePath: '.queue-state.json',
  atomicWrites: true,
  compressionEnabled: false,
  backupOnCorruption: true,
  maxBackupFiles: 3,
};

export class QueuePersistenceService implements IQueuePersistence {
  private readonly options: PersistenceOptions;

  constructor(options: Partial<PersistenceOptions> = {}) {
    this.options = { ...DEFAULT_PERSISTENCE_OPTIONS, ...options };
  }

  async save(queue: DownloadQueue): Promise<void> {
    try {
      const queueState = this.serializeQueue(queue, 'unknown'); // Default space key
      
      if (this.options.atomicWrites) {
        await this.atomicWrite(queueState);
      } else {
        await writeFile(this.options.filePath, JSON.stringify(queueState, null, 2), 'utf-8');
      }
    } catch (error) {
      throw createQueueError(
        'PERSISTENCE_FAILED',
        `Failed to save queue state: ${error}`,
        true
      );
    }
  }

  async saveWithSpaceKey(queue: DownloadQueue, spaceKey: string): Promise<void> {
    try {
      const queueState = this.serializeQueue(queue, spaceKey);
      
      if (this.options.atomicWrites) {
        await this.atomicWrite(queueState);
      } else {
        await writeFile(this.options.filePath, JSON.stringify(queueState, null, 2), 'utf-8');
      }
    } catch (error) {
      throw createQueueError(
        'PERSISTENCE_FAILED',
        `Failed to save queue state: ${error}`,
        true
      );
    }
  }

  async load(): Promise<DownloadQueue | null> {
    try {
      if (!(await this.exists())) {
        return null;
      }

      const data = await readFile(this.options.filePath, 'utf-8');
      const queueState: QueuePersistence = JSON.parse(data);

      if (!this.validate(queueState)) {
        if (this.options.backupOnCorruption) {
          await this.createCorruptionBackup();
        }
        throw createQueueError(
          'CORRUPTION_DETECTED',
          'Queue state validation failed',
          false
        );
      }

      return this.deserializeQueue(queueState);
    } catch (error) {
      if (error instanceof Error && error.message.includes('CORRUPTION_DETECTED')) {
        throw error;
      }
      
      throw createQueueError(
        'PERSISTENCE_FAILED',
        `Failed to load queue state: ${error}`,
        true
      );
    }
  }

  async exists(): Promise<boolean> {
    try {
      await access(this.options.filePath);
      return true;
    } catch {
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      if (await this.exists()) {
        await unlink(this.options.filePath);
      }
    } catch (error) {
      throw createQueueError(
        'PERSISTENCE_FAILED',
        `Failed to clear queue state: ${error}`,
        true
      );
    }
  }

  validate(data: unknown): data is QueuePersistence {
    return this.validateInternal(data).valid;
  }

  private validateInternal(data: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!data || typeof data !== 'object') {
      errors.push('Data must be an object');
      return { valid: false, errors };
    }

    const state = data as Record<string, unknown>;

    // Validate basic fields
    this.validateBasicFields(state, errors);
    this.validateArrayFields(state, errors);
    
    if (errors.length > 0) {
      return { valid: false, errors };
    }

    // Validate queue items if array is valid
    if (Array.isArray(state.queueItems)) {
      this.validateQueueItems(state.queueItems, errors);
    }

    // Validate checksum if structure is valid
    if (errors.length === 0) {
      this.validateChecksum(state, errors);
    }

    return { valid: errors.length === 0, errors };
  }

  private validateBasicFields(state: Record<string, unknown>, errors: string[]): void {
    if (typeof state.version !== 'number' || state.version < 1) {
      errors.push('Invalid version');
    }
    if (typeof state.timestamp !== 'string') {
      errors.push('Invalid timestamp');
    }
    if (typeof state.spaceKey !== 'string') {
      errors.push('Invalid spaceKey');
    }
    if (!state.metrics || typeof state.metrics !== 'object') {
      errors.push('Invalid metrics');
    }
    if (typeof state.checksum !== 'string') {
      errors.push('Invalid checksum');
    }
  }

  private validateArrayFields(state: Record<string, unknown>, errors: string[]): void {
    if (!Array.isArray(state.queueItems)) {
      errors.push('Invalid queueItems');
    }
    if (!Array.isArray(state.processedPageIds)) {
      errors.push('Invalid processedPageIds');
    }
  }

  private validateQueueItems(queueItems: unknown[], errors: string[]): void {
    for (const item of queueItems) {
      if (!this.isValidQueueItem(item)) {
        errors.push('Invalid queue item structure');
        break;
      }
    }
  }

  private validateChecksum(state: Record<string, unknown>, errors: string[]): void {
    try {
      const { checksum, ...dataWithoutChecksum } = state;
      const calculatedChecksum = this.calculateChecksum(dataWithoutChecksum as Omit<QueuePersistence, 'checksum'>);
      
      if (checksum !== calculatedChecksum) {
        errors.push('Checksum mismatch');
      }
    } catch {
      errors.push('Checksum validation failed');
    }
  }

  private async atomicWrite(queueState: QueuePersistence): Promise<void> {
    const tempFilePath = `${this.options.filePath}.tmp.${Date.now()}`;
    
    try {
      // Ensure directory exists
      const dir = dirname(this.options.filePath);
      if (dir !== '.') {
        const { mkdir } = await import('fs/promises');
        await mkdir(dir, { recursive: true });
      }

      // Write to temporary file
      await writeFile(tempFilePath, JSON.stringify(queueState, null, 2), 'utf-8');
      
      // Atomic rename
      await rename(tempFilePath, this.options.filePath);
    } catch (error) {
      // Clean up temp file on error
      try {
        await unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
      throw error;
    }
  }

  private serializeQueue(queue: DownloadQueue, spaceKey: string): QueuePersistence {
    const queueItems = queue.items ? Array.from(queue.items.values()) : [];
    const processedPageIds = queue.processedPages ? Array.from(queue.processedPages) : [];

    const stateData = {
      version: 1,
      timestamp: new Date().toISOString(),
      spaceKey,
      queueItems,
      processedPageIds,
      metrics: queue.metrics || this.createDefaultMetrics(),
    };

    const checksum = this.calculateChecksum(stateData);

    return {
      ...stateData,
      checksum,
    };
  }

  private deserializeQueue(state: QueuePersistence): DownloadQueue {
    const itemsMap = new Map<string, QueueItem>();
    for (const item of state.queueItems) {
      itemsMap.set(item.pageId, item);
    }

    const processingOrder = state.queueItems
      .filter(item => item.status === 'pending' || item.status === 'processing')
      .sort((a, b) => a.discoveryTimestamp - b.discoveryTimestamp)
      .map(item => item.pageId);

    return {
      items: itemsMap,
      processingOrder,
      processedPages: new Set(state.processedPageIds),
      metrics: state.metrics,
      persistencePath: this.options.filePath,
      maxQueueSize: 50000, // Default limit
      persistenceThreshold: 10,
    };
  }

  calculateChecksum(data: Omit<QueuePersistence, 'checksum'>): string {
    const jsonString = JSON.stringify(data, Object.keys(data as object).sort());
    return createHash('sha256').update(jsonString, 'utf-8').digest('hex').substring(0, 16);
  }

  private isValidQueueItem(item: unknown): item is QueueItem {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const qi = item as Record<string, unknown>;

    return (
      typeof qi.pageId === 'string' &&
      ['initial', 'macro', 'reference', 'user'].includes(qi.sourceType as string) &&
      typeof qi.discoveryTimestamp === 'number' &&
      typeof qi.retryCount === 'number' &&
      ['pending', 'processing', 'completed', 'failed'].includes(qi.status as string)
    );
  }

  private createDefaultMetrics(): QueueMetrics {
    return {
      totalQueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      currentQueueSize: 0,
      discoveryRate: 0,
      processingRate: 0,
      averageRetryCount: 0,
      persistenceOperations: 0,
      lastPersistenceTime: new Date().toISOString(),
    };
  }

  private async createCorruptionBackup(): Promise<void> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${this.options.filePath}.corrupted.${timestamp}`;
      
      const originalData = await readFile(this.options.filePath, 'utf-8');
      await writeFile(backupPath, originalData, 'utf-8');

      // Clean up old backup files if needed
      await this.cleanupOldBackups();
    } catch {
      // Ignore backup errors - corruption is the primary concern
    }
  }

  private async cleanupOldBackups(): Promise<void> {
    try {
      const { readdir } = await import('fs/promises');
      const dir = dirname(this.options.filePath);
      const basename = resolve(this.options.filePath).split('/').pop() || '';
      
      const files = await readdir(dir);
      const backupFiles = files
        .filter(file => file.startsWith(`${basename}.corrupted.`))
        .sort()
        .reverse(); // Newest first

      // Remove excess backups
      if (backupFiles.length > this.options.maxBackupFiles) {
        const filesToDelete = backupFiles.slice(this.options.maxBackupFiles);
        for (const file of filesToDelete) {
          try {
            await unlink(resolve(dir, file));
          } catch {
            // Ignore individual cleanup errors
          }
        }
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Factory function for creating queue persistence service.
 */
export function createQueuePersistence(
  filePath: string,
  options: Partial<Omit<PersistenceOptions, 'filePath'>> = {}
): QueuePersistenceService {
  return new QueuePersistenceService({
    ...options,
    filePath,
  });
}

/**
 * Utility for creating queue state snapshots.
 */
export function createQueueSnapshot(
  queue: DownloadQueue,
  spaceKey: string
): Omit<QueuePersistence, 'checksum'> {
  const queueItems = queue.items ? Array.from(queue.items.values()) : [];
  const processedPageIds = queue.processedPages ? Array.from(queue.processedPages) : [];

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    spaceKey,
    queueItems,
    processedPageIds,
    metrics: queue.metrics || {
      totalQueued: queueItems.length,
      totalProcessed: processedPageIds.length,
      totalFailed: 0,
      currentQueueSize: queueItems.filter(item => item.status === 'pending').length,
      discoveryRate: 0,
      processingRate: 0,
      averageRetryCount: 0,
      persistenceOperations: 0,
      lastPersistenceTime: new Date().toISOString(),
    },
  };
}

/**
 * Validates queue persistence format compatibility.
 */
export function validatePersistenceFormat(data: unknown): {
  valid: boolean;
  version: number | null;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (!data || typeof data !== 'object') {
    errors.push('Data must be an object');
    return { valid: false, version: null, errors };
  }

  const state = data as Record<string, unknown>;
  
  const version = state.version;
  const versionValid = typeof version === 'number' && version >= 1;
  
  if (!versionValid) {
    errors.push('Invalid or missing version number');
  }

  // Check other required fields
  const requiredFields = [
    { key: 'timestamp', type: 'string' },
    { key: 'spaceKey', type: 'string' },
    { key: 'checksum', type: 'string' },
  ];

  for (const field of requiredFields) {
    if (typeof state[field.key] !== field.type) {
      errors.push(`Invalid or missing ${field.key}`);
    }
  }

  // Check array fields
  if (!Array.isArray(state.queueItems)) {
    errors.push('Queue items must be an array');
  }

  if (!Array.isArray(state.processedPageIds)) {
    errors.push('Processed page IDs must be an array');
  }

  return {
    valid: errors.length === 0,
    version: versionValid ? version as number : null,
    errors,
  };
}
