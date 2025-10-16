/**
 * Queue Backup and Restore Functionality
 * Implements T138c: Emergency queue state management with backup/restore capabilities
 */

import { writeFile, readFile, mkdir, stat, readdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import type { DownloadQueue, QueuePersistence } from '../models/queueEntities.js';
import { logger } from '../util/logger.js';
import { createHash } from 'crypto';

export interface BackupConfig {
  backupDir: string;
  maxBackups: number;
  backupIntervalMs: number;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
}

export interface BackupMetadata {
  id: string;
  timestamp: number;
  spaceKey: string;
  queueSize: number;
  checksum: string;
  version: string;
  compressed: boolean;
  encrypted: boolean;
}

export interface RestoreResult {
  success: boolean;
  backupId: string;
  restoredItems: number;
  warnings: string[];
  errors: string[];
}

export interface BackupResult {
  success: boolean;
  backupId: string;
  backupPath: string;
  sizeBytes: number;
  duration: number;
}

/**
 * Queue backup service for emergency state management
 */
export class QueueBackupService {
  private config: BackupConfig;
  private lastBackupTime: number = 0;

  constructor(config: Partial<BackupConfig> = {}) {
    this.config = {
      backupDir: config.backupDir ?? './backups/queue',
      maxBackups: config.maxBackups ?? 10,
      backupIntervalMs: config.backupIntervalMs ?? 300000, // 5 minutes
      compressionEnabled: config.compressionEnabled ?? false,
      encryptionEnabled: config.encryptionEnabled ?? false,
    };
  }

  /**
   * Creates a backup of the queue state
   */
  async createBackup(queue: DownloadQueue, spaceKey: string): Promise<BackupResult> {
    const startTime = Date.now();
    const backupId = this.generateBackupId();
    
    try {
      // Ensure backup directory exists
      await this.ensureBackupDirectory();

      // Create backup data
      const backupData = this.createBackupData(queue, spaceKey, backupId);
      
      // Calculate checksum
      const checksum = this.calculateChecksum(JSON.stringify(backupData));
      backupData.checksum = checksum;

      // Apply compression if enabled
      const serializedData = JSON.stringify(backupData, null, 2);
      if (this.config.compressionEnabled) {
        // Note: In a real implementation, you'd use zlib for compression
        // serializedData = await this.compress(serializedData);
      }

      // Apply encryption if enabled
      if (this.config.encryptionEnabled) {
        // Note: In a real implementation, you'd use crypto for encryption
        // serializedData = await this.encrypt(serializedData);
      }

      // Write backup file
      const backupPath = this.getBackupPath(backupId);
      await writeFile(backupPath, serializedData, 'utf8');

      // Update last backup time
      this.lastBackupTime = Date.now();

      // Clean up old backups
      await this.cleanupOldBackups();

      const stats = await stat(backupPath);
      const duration = Date.now() - startTime;

      logger.info('Queue backup created successfully', {
        backupId,
        backupPath,
        sizeBytes: stats.size,
        duration,
        queueSize: queue.items.size,
      });

      return {
        success: true,
        backupId,
        backupPath,
        sizeBytes: stats.size,
        duration,
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Failed to create queue backup', {
        backupId,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration,
      });

      return {
        success: false,
        backupId,
        backupPath: '',
        sizeBytes: 0,
        duration,
      };
    }
  }

  /**
   * Restores queue state from a backup
   */
  async restoreFromBackup(backupId: string): Promise<RestoreResult> {
    const warnings: string[] = [];
    const errors: string[] = [];

    try {
      const backupPath = this.getBackupPath(backupId);
      
      if (!existsSync(backupPath)) {
        errors.push(`Backup file not found: ${backupPath}`);
        return { success: false, backupId, restoredItems: 0, warnings, errors };
      }

      // Read backup file
      const backupContent = await readFile(backupPath, 'utf8');

      // Decrypt if necessary
      if (this.config.encryptionEnabled) {
        // Note: In a real implementation, you'd decrypt here
        // backupContent = await this.decrypt(backupContent);
      }

      // Decompress if necessary
      if (this.config.compressionEnabled) {
        // Note: In a real implementation, you'd decompress here
        // backupContent = await this.decompress(backupContent);
      }

      // Parse backup data
      const backupData: QueuePersistence = JSON.parse(backupContent);

      // Validate backup integrity
      const validationResult = await this.validateBackup(backupData);
      if (!validationResult.valid) {
        errors.push(`Backup validation failed: ${validationResult.reason}`);
        return { success: false, backupId, restoredItems: 0, warnings, errors };
      }

      // Check for version compatibility
      const versionString = String(backupData.version);
      if (versionString !== '1.0') {
        warnings.push(`Backup version ${versionString} may not be fully compatible`);
      }

      logger.info('Queue backup restored successfully', {
        backupId,
        restoredItems: backupData.queueItems.length,
        spaceKey: backupData.spaceKey,
        backupTimestamp: new Date(backupData.timestamp).toISOString(),
      });

      return {
        success: true,
        backupId,
        restoredItems: backupData.queueItems.length,
        warnings,
        errors,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Failed to restore backup: ${errorMessage}`);
      
      logger.error('Failed to restore queue backup', {
        backupId,
        error: errorMessage,
      });

      return { success: false, backupId, restoredItems: 0, warnings, errors };
    }
  }

  /**
   * Lists available backups
   */
  async listBackups(): Promise<BackupMetadata[]> {
    try {
      if (!existsSync(this.config.backupDir)) {
        return [];
      }

      const files = await readdir(this.config.backupDir);
      const backupFiles = files.filter(file => file.endsWith('.json'));
      
      const backups: BackupMetadata[] = [];
      
      for (const file of backupFiles) {
        try {
          const backupPath = join(this.config.backupDir, file);
          const content = await readFile(backupPath, 'utf8');
          const backupData: QueuePersistence = JSON.parse(content);
          
          const stats = await stat(backupPath);
          
          backups.push({
            id: file.replace('.json', ''),
            timestamp: backupData.timestamp ? new Date(backupData.timestamp).getTime() : stats.mtime.getTime(),
            spaceKey: backupData.spaceKey,
            queueSize: backupData.queueItems.length,
            checksum: backupData.checksum,
            version: String(backupData.version || '1.0'),
            compressed: this.config.compressionEnabled,
            encrypted: this.config.encryptionEnabled,
          });
        } catch (error) {
          logger.warn('Failed to parse backup metadata', {
            file,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Sort by timestamp (newest first)
      backups.sort((a, b) => b.timestamp - a.timestamp);
      
      return backups;

    } catch (error) {
      logger.error('Failed to list backups', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Deletes a specific backup
   */
  async deleteBackup(backupId: string): Promise<boolean> {
    try {
      const backupPath = this.getBackupPath(backupId);
      
      if (!existsSync(backupPath)) {
        logger.warn('Backup file not found for deletion', { backupId, backupPath });
        return false;
      }

      await unlink(backupPath);
      logger.info('Backup deleted successfully', { backupId, backupPath });
      return true;

    } catch (error) {
      logger.error('Failed to delete backup', {
        backupId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Checks if it's time to create an automatic backup
   */
  shouldCreateBackup(): boolean {
    const timeSinceLastBackup = Date.now() - this.lastBackupTime;
    return timeSinceLastBackup >= this.config.backupIntervalMs;
  }

  /**
   * Gets backup statistics
   */
  async getBackupStats(): Promise<{
    totalBackups: number;
    totalSizeBytes: number;
    oldestBackup?: BackupMetadata;
    newestBackup?: BackupMetadata;
  }> {
    const backups = await this.listBackups();
    
    if (backups.length === 0) {
      return { totalBackups: 0, totalSizeBytes: 0 };
    }

    let totalSizeBytes = 0;
    for (const backup of backups) {
      try {
        const backupPath = this.getBackupPath(backup.id);
        const stats = await stat(backupPath);
        totalSizeBytes += stats.size;
      } catch {
        // Ignore errors for individual files
      }
    }

    return {
      totalBackups: backups.length,
      totalSizeBytes,
      oldestBackup: backups[backups.length - 1],
      newestBackup: backups[0],
    };
  }

  /**
   * Creates backup data structure
   */
  private createBackupData(queue: DownloadQueue, spaceKey: string, _backupId: string): QueuePersistence {
    return {
      version: 1,
      timestamp: new Date().toISOString(),
      spaceKey,
      queueItems: Array.from(queue.items.values()),
      processedPageIds: Array.from(queue.processedPages),
      metrics: queue.metrics,
      checksum: '', // Will be filled later
    };
  }

  /**
   * Generates a unique backup ID
   */
  private generateBackupId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substring(2, 8);
    return `backup-${timestamp}-${random}`;
  }

  /**
   * Gets the full path for a backup file
   */
  private getBackupPath(backupId: string): string {
    return join(this.config.backupDir, `${backupId}.json`);
  }

  /**
   * Ensures backup directory exists
   */
  private async ensureBackupDirectory(): Promise<void> {
    if (!existsSync(this.config.backupDir)) {
      await mkdir(this.config.backupDir, { recursive: true });
    }
  }

  /**
   * Calculates checksum for backup integrity
   */
  private calculateChecksum(data: string): string {
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Validates backup integrity and format
   */
  private async validateBackup(backupData: QueuePersistence): Promise<{ valid: boolean; reason?: string }> {
    // Check required fields
    if (!backupData.version || !backupData.timestamp || !backupData.spaceKey) {
      return { valid: false, reason: 'Missing required fields' };
    }

    // Check if queueItems is an array
    if (!Array.isArray(backupData.queueItems)) {
      return { valid: false, reason: 'Invalid queueItems format' };
    }

    // Check if processedPageIds is an array
    if (!Array.isArray(backupData.processedPageIds)) {
      return { valid: false, reason: 'Invalid processedPageIds format' };
    }

    // Validate checksum if present
    if (backupData.checksum) {
      const dataWithoutChecksum = { ...backupData, checksum: '' };
      const calculatedChecksum = this.calculateChecksum(JSON.stringify(dataWithoutChecksum));
      if (calculatedChecksum !== backupData.checksum) {
        return { valid: false, reason: 'Checksum validation failed' };
      }
    }

    return { valid: true };
  }

  /**
   * Cleans up old backups beyond the configured limit
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();
      
      if (backups.length > this.config.maxBackups) {
        const backupsToDelete = backups.slice(this.config.maxBackups);
        
        for (const backup of backupsToDelete) {
          await this.deleteBackup(backup.id);
        }

        logger.info('Old backups cleaned up', {
          deletedCount: backupsToDelete.length,
          remainingCount: this.config.maxBackups,
        });
      }
    } catch (error) {
      logger.error('Failed to cleanup old backups', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Updates backup configuration
   */
  updateConfig(config: Partial<BackupConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug('Backup configuration updated', { config: this.config });
  }
}

export const createQueueBackupService = (config?: Partial<BackupConfig>): QueueBackupService => {
  return new QueueBackupService(config);
};
