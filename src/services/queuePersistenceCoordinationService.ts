/**
 * T114c: Queue persistence coordination service
 * Manages atomic persistence operations, recovery scenarios, and data consistency
 */

import type { QueuePersistence } from '../models/queueEntities.js';
import type { DownloadQueueOrchestrator } from '../queue/downloadQueue.js';
import type { QueuePersistenceService } from '../queue/queuePersistence.js';
import { logger } from '../util/logger.js';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { dirname } from 'path';

export interface PersistenceCoordinationConfig {
  autoPersistence: boolean;
  persistenceInterval: number; // milliseconds
  backupRetention: number; // number of backup files to keep
  atomicWrites: boolean;
  checksumValidation: boolean;
  recoveryEnabled: boolean;
}

export interface PersistenceOperation {
  id: string;
  type: 'save' | 'load' | 'backup' | 'recovery';
  timestamp: number;
  filePath: string;
  status: 'pending' | 'success' | 'failed';
  duration?: number;
  error?: string;
  checksum?: string;
  itemCount?: number;
}

export interface BackupInfo {
  timestamp: number;
  filePath: string;
  checksum: string;
  itemCount: number;
  originalFilePath: string;
}

export interface RecoveryResult {
  success: boolean;
  recoveredItems: number;
  backupUsed?: BackupInfo;
  errors: string[];
}

export interface PersistenceCoordinationSummary {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  lastPersistenceTime?: number;
  lastBackupTime?: number;
  availableBackups: number;
  isHealthy: boolean;
  uptime: number;
}

/**
 * Simplified coordination service that manages persistence operations with backup and recovery.
 */
export class QueuePersistenceCoordinationService {
  private readonly queueOrchestrator: DownloadQueueOrchestrator;
  private readonly persistenceService: QueuePersistenceService;
  private readonly config: PersistenceCoordinationConfig;
  private readonly filePath: string;
  private readonly spaceKey: string;
  
  private isRunning = false;
  private persistenceInterval?: NodeJS.Timeout;
  private startTime: number = Date.now();
  private operations: PersistenceOperation[] = [];
  private backups: BackupInfo[] = [];
  private operationIdCounter = 0;

  constructor(
    queueOrchestrator: DownloadQueueOrchestrator,
    persistenceService: QueuePersistenceService,
    filePath: string,
    spaceKey: string,
    config: Partial<PersistenceCoordinationConfig> = {}
  ) {
    this.queueOrchestrator = queueOrchestrator;
    this.persistenceService = persistenceService;
    this.filePath = filePath;
    this.spaceKey = spaceKey;
    this.config = {
      autoPersistence: true,
      persistenceInterval: 60000, // 1 minute
      backupRetention: 5,
      atomicWrites: true,
      checksumValidation: true,
      recoveryEnabled: true,
      ...config,
    };
  }

  /**
   * Start persistence coordination service.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Persistence coordination service is already running');
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();

    logger.info('Starting persistence coordination service', {
      autoPersistence: this.config.autoPersistence,
      interval: this.config.persistenceInterval,
      backupRetention: this.config.backupRetention,
    });

    // Load existing backups
    await this.loadBackupIndex();

    // Start auto-persistence if enabled
    if (this.config.autoPersistence) {
      this.persistenceInterval = setInterval(
        () => this.performScheduledPersistence(),
        this.config.persistenceInterval
      );
    }

    // Perform initial persistence
    await this.performScheduledPersistence();
  }

  /**
   * Stop persistence coordination service.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
      this.persistenceInterval = undefined;
    }

    // Final persistence save
    try {
      await this.forcePersistence();
      logger.info('Final persistence completed');
    } catch (error) {
      logger.error('Failed to perform final persistence:', error);
    }

    logger.info('Stopped persistence coordination service');
  }

  /**
   * Force immediate persistence with backup.
   */
  async forcePersistence(): Promise<PersistenceOperation> {
    const operation = this.createOperation('save', this.filePath);
    
    try {
      logger.debug('Starting forced persistence operation', { operationId: operation.id });

      // Create backup before save
      if (this.config.backupRetention > 0) {
        await this.createBackup();
      }

      // Perform persistence using the orchestrator's persist method
      await this.queueOrchestrator.persist();

      // Count items for tracking from queue metrics
      const metrics = this.queueOrchestrator.getMetrics();
      operation.itemCount = metrics.totalQueued;

      // Validate saved data
      if (this.config.checksumValidation) {
        await this.validatePersistenceChecksum(operation);
      }

      operation.status = 'success';
      operation.duration = Date.now() - operation.timestamp;

      logger.info('Forced persistence completed successfully', {
        operationId: operation.id,
        duration: operation.duration,
        itemCount: operation.itemCount,
      });

    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      operation.duration = Date.now() - operation.timestamp;

      logger.error('Forced persistence failed', {
        operationId: operation.id,
        error: operation.error,
      });

      throw error;
    } finally {
      this.operations.push(operation);
    }

    return operation;
  }

  /**
   * Load queue state with recovery capabilities.
   */
  async loadWithRecovery(): Promise<RecoveryResult> {
    const operation = this.createOperation('recovery', this.filePath);
    const result: RecoveryResult = {
      success: false,
      recoveredItems: 0,
      errors: [],
    };

    try {
      logger.info('Starting queue recovery operation', { operationId: operation.id });

      // Try to load from main file
      const queueData = await this.persistenceService.load();
      
      if (queueData) {
        result.recoveredItems = queueData.items.size;
        result.success = true;
        
        logger.info('Successfully loaded from main persistence file', {
          itemsLoaded: result.recoveredItems,
        });
      } else {
        // Try recovery from backups
        if (this.config.recoveryEnabled && this.backups.length > 0) {
          const recoveryResult = await this.attemptBackupRecovery();
          Object.assign(result, recoveryResult);
        } else {
          result.errors.push('No queue data and no backups available for recovery');
        }
      }

      operation.status = result.success ? 'success' : 'failed';
      operation.duration = Date.now() - operation.timestamp;
      operation.itemCount = result.recoveredItems;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Recovery operation failed: ${errorMessage}`);
      operation.status = 'failed';
      operation.error = errorMessage;
    } finally {
      this.operations.push(operation);
    }

    return result;
  }

  /**
   * Create a backup of current queue state.
   */
  async createBackup(): Promise<BackupInfo> {
    const timestamp = Date.now();
    const backupFilePath = `${this.filePath}.backup.${timestamp}`;
    const operation = this.createOperation('backup', backupFilePath);

    try {
      // Check if main file exists
      try {
        await fs.access(this.filePath);
      } catch {
        throw new Error('Main persistence file does not exist');
      }

      // Read main file
      const data = await fs.readFile(this.filePath, 'utf8');
      const parsedData: QueuePersistence = JSON.parse(data);

      // Calculate checksum
      const checksum = this.calculateChecksum(data);

      // Write backup file atomically
      if (this.config.atomicWrites) {
        const tempPath = `${backupFilePath}.tmp`;
        await fs.writeFile(tempPath, data, 'utf8');
        await fs.rename(tempPath, backupFilePath);
      } else {
        await fs.writeFile(backupFilePath, data, 'utf8');
      }

      const backup: BackupInfo = {
        timestamp,
        filePath: backupFilePath,
        checksum,
        itemCount: parsedData.queueItems.length,
        originalFilePath: this.filePath,
      };

      this.backups.push(backup);
      this.cleanupOldBackups();

      operation.status = 'success';
      operation.duration = Date.now() - operation.timestamp;
      operation.checksum = checksum;
      operation.itemCount = backup.itemCount;

      logger.debug('Backup created successfully', {
        operationId: operation.id,
        backupPath: backupFilePath,
        itemCount: backup.itemCount,
        checksum,
      });

      return backup;

    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : 'Unknown error';
      operation.duration = Date.now() - operation.timestamp;

      logger.error('Failed to create backup', {
        operationId: operation.id,
        error: operation.error,
      });

      throw error;
    } finally {
      this.operations.push(operation);
    }
  }

  /**
   * Attempt recovery from backup files.
   */
  private async attemptBackupRecovery(): Promise<Partial<RecoveryResult>> {
    const result: Partial<RecoveryResult> = {
      recoveredItems: 0,
      errors: [],
      success: false,
    };

    // Sort backups by timestamp (newest first)
    const sortedBackups = [...this.backups].sort((a, b) => b.timestamp - a.timestamp);

    for (const backup of sortedBackups) {
      const backupResult = await this.tryRecoverFromBackup(backup);
      
      if (backupResult.success) {
        Object.assign(result, backupResult);
        break;
      } else {
        result.errors?.push(...(backupResult.errors || []));
      }
    }

    if (!result.success) {
      result.errors?.push('All backup recovery attempts failed');
    }

    return result;
  }

  /**
   * Try to recover from a single backup file.
   */
  private async tryRecoverFromBackup(backup: BackupInfo): Promise<Partial<RecoveryResult>> {
    const result: Partial<RecoveryResult> = {
      recoveredItems: 0,
      errors: [],
      success: false,
    };

    try {
      logger.info(`Attempting recovery from backup: ${backup.filePath}`);

      // Verify backup file exists
      await fs.access(backup.filePath);

      // Read and validate backup
      const data = await fs.readFile(backup.filePath, 'utf8');
      
      // Validate backup data
      const validationResult = await this.validateBackupData(data, backup);
      if (!validationResult.valid) {
        result.errors?.push(...validationResult.errors);
        return result;
      }

      // Restore to main file
      await this.ensureDirectoryExists(this.filePath);
      await this.writeFileAtomically(this.filePath, data);

      const parsedData = validationResult.parsedData;
      if (!parsedData) {
        result.errors?.push('Parsed data is missing after validation');
        return result;
      }

      result.success = true;
      result.recoveredItems = parsedData.queueItems.length;
      result.backupUsed = backup;

      logger.info(`Successfully recovered from backup: ${backup.filePath}`, {
        itemsRecovered: result.recoveredItems,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors?.push(`Backup recovery failed ${backup.filePath}: ${errorMessage}`);
      logger.warn(`Backup recovery failed: ${backup.filePath}`, { error: errorMessage });
    }

    return result;
  }

  /**
   * Validate backup data integrity.
   */
  private async validateBackupData(
    data: string,
    backup: BackupInfo
  ): Promise<{ valid: boolean; errors: string[]; parsedData?: QueuePersistence }> {
    const errors: string[] = [];

    try {
      // Validate checksum if available
      if (this.config.checksumValidation && backup.checksum) {
        const actualChecksum = this.calculateChecksum(data);
        if (actualChecksum !== backup.checksum) {
          errors.push(`Backup checksum mismatch: ${backup.filePath}`);
          return { valid: false, errors };
        }
      }

      // Parse and validate structure
      const parsedData: QueuePersistence = JSON.parse(data);
      if (!parsedData.queueItems || !Array.isArray(parsedData.queueItems)) {
        errors.push(`Invalid backup data structure: ${backup.filePath}`);
        return { valid: false, errors };
      }

      return { valid: true, errors: [], parsedData };

    } catch (error) {
      errors.push(`Backup data parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { valid: false, errors };
    }
  }

  /**
   * Write file atomically if configured.
   */
  private async writeFileAtomically(filePath: string, data: string): Promise<void> {
    if (this.config.atomicWrites) {
      const tempPath = `${filePath}.tmp`;
      await fs.writeFile(tempPath, data, 'utf8');
      await fs.rename(tempPath, filePath);
    } else {
      await fs.writeFile(filePath, data, 'utf8');
    }
  }

  /**
   * Perform scheduled persistence operation.
   */
  private async performScheduledPersistence(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      await this.forcePersistence();
    } catch (error) {
      logger.error('Scheduled persistence failed:', error);
    }
  }

  /**
   * Validate persistence checksum.
   */
  private async validatePersistenceChecksum(operation: PersistenceOperation): Promise<void> {
    const data = await fs.readFile(operation.filePath, 'utf8');
    const checksum = this.calculateChecksum(data);
    operation.checksum = checksum;
    
    // Additional validation could include structure checks
    const parsedData: QueuePersistence = JSON.parse(data);
    if (!parsedData.queueItems || !Array.isArray(parsedData.queueItems)) {
      throw new Error('Invalid persistence data structure');
    }
  }

  /**
   * Load backup index from file system.
   */
  private async loadBackupIndex(): Promise<void> {
    try {
      const backupPattern = `${this.filePath}.backup.`;
      const dir = dirname(this.filePath);
      
      const files = await fs.readdir(dir);
      const backupFiles = files.filter(f => f.includes(backupPattern));
      
      for (const file of backupFiles) {
        const filePath = `${dir}/${file}`;
        const timestampMatch = file.match(/\.backup\.(\d+)$/);
        
        if (timestampMatch) {
          const timestamp = parseInt(timestampMatch[1], 10);
          
          try {
            const data = await fs.readFile(filePath, 'utf8');
            const parsedData: QueuePersistence = JSON.parse(data);
            const checksum = this.calculateChecksum(data);
            
            const backup: BackupInfo = {
              timestamp,
              filePath,
              checksum,
              itemCount: parsedData.queueItems.length,
              originalFilePath: this.filePath,
            };
            
            this.backups.push(backup);
          } catch (error) {
            logger.warn(`Failed to load backup index for ${file}:`, error);
          }
        }
      }
      
      // Sort backups by timestamp
      this.backups.sort((a, b) => b.timestamp - a.timestamp);
      
      logger.debug(`Loaded ${this.backups.length} backup files`);
      
    } catch (error) {
      logger.error('Failed to load backup index:', error);
    }
  }

  /**
   * Clean up old backup files.
   */
  private cleanupOldBackups(): void {
    if (this.backups.length <= this.config.backupRetention) {
      return;
    }

    // Sort by timestamp (newest first)
    this.backups.sort((a, b) => b.timestamp - a.timestamp);
    
    // Remove excess backups
    const toRemove = this.backups.splice(this.config.backupRetention);
    
    // Delete files asynchronously
    for (const backup of toRemove) {
      fs.unlink(backup.filePath).catch(error => {
        logger.warn(`Failed to delete old backup: ${backup.filePath}`, error);
      });
    }
    
    if (toRemove.length > 0) {
      logger.debug(`Cleaned up ${toRemove.length} old backup files`);
    }
  }

  /**
   * Create operation record.
   */
  private createOperation(type: PersistenceOperation['type'], filePath: string): PersistenceOperation {
    return {
      id: `op_${++this.operationIdCounter}`,
      type,
      timestamp: Date.now(),
      filePath,
      status: 'pending',
    };
  }

  /**
   * Calculate SHA-256 checksum.
   */
  private calculateChecksum(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }

  /**
   * Ensure directory exists for file path.
   */
  private async ensureDirectoryExists(filePath: string): Promise<void> {
    const dir = dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * Get persistence coordination summary.
   */
  getSummary(): PersistenceCoordinationSummary {
    const operations = this.operations;
    const successful = operations.filter(op => op.status === 'success').length;
    const failed = operations.filter(op => op.status === 'failed').length;
    const lastPersistence = operations.filter(op => op.type === 'save' && op.status === 'success')
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    const lastBackup = this.backups.sort((a, b) => b.timestamp - a.timestamp)[0];

    return {
      totalOperations: operations.length,
      successfulOperations: successful,
      failedOperations: failed,
      lastPersistenceTime: lastPersistence?.timestamp,
      lastBackupTime: lastBackup?.timestamp,
      availableBackups: this.backups.length,
      isHealthy: failed === 0 || (failed / operations.length) < 0.1,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Get recent operations.
   */
  getRecentOperations(count = 10): PersistenceOperation[] {
    return this.operations.slice(-count);
  }

  /**
   * Get available backups.
   */
  getBackups(): BackupInfo[] {
    return [...this.backups];
  }

  /**
   * Update configuration.
   */
  updateConfig(config: Partial<PersistenceCoordinationConfig>): void {
    Object.assign(this.config, config);
    
    // Restart auto-persistence if interval changed
    if (config.persistenceInterval && this.persistenceInterval) {
      clearInterval(this.persistenceInterval);
      this.persistenceInterval = setInterval(
        () => this.performScheduledPersistence(),
        this.config.persistenceInterval
      );
    }
    
    logger.info('Updated persistence coordination configuration', config);
  }

  /**
   * Check if service is running.
   */
  isActive(): boolean {
    return this.isRunning;
  }
}
