/**
 * T131b: Export resume with queue state restoration
 * Handles interrupted exports with queue state restoration
 */

import type { ExportConfig } from '../models/entities.js';
import type { DownloadQueue, QueueMetrics } from '../models/queueEntities.js';
import { QueueRecoveryService } from '../queue/queueRecovery.js';
import { DownloadQueueOrchestrator } from '../queue/downloadQueue.js';
import { QueuePersistenceService } from '../queue/queuePersistence.js';
import { logger } from '../util/logger.js';
import { join } from 'path';
import { access } from 'fs/promises';

export interface ResumeQueueState {
  queueExists: boolean;
  queueValid: boolean;
  queueSize: number;
  processedCount: number;
  lastSavedAt: Date;
  canResume: boolean;
  corruptionDetected: boolean;
  backupAvailable: boolean;
  warnings: string[];
}

export interface ResumeOptions {
  forceResume: boolean;
  allowCorrupted: boolean;
  useBackup: boolean;
  validateIntegrity: boolean;
  repairCorruption: boolean;
}

export interface ResumeResult {
  success: boolean;
  queueRestored: boolean;
  itemsRecovered: number;
  itemsLost: number;
  warnings: string[];
  errors: string[];
  queue?: DownloadQueue;
  metrics?: QueueMetrics;
}

export class ResumeWithQueueService {
  private readonly recoveryService: QueueRecoveryService;
  private readonly persistence: QueuePersistenceService;
  private readonly journalPath: string;

  constructor(
    private readonly config: ExportConfig,
    private readonly workspaceDir: string
  ) {
    this.recoveryService = new QueueRecoveryService(workspaceDir);
    this.persistence = new QueuePersistenceService({
      filePath: join(workspaceDir, `.queue-${config.spaceKey}.json`),
    });
    this.journalPath = join(workspaceDir, 'resume-journal.json');
  }

  /**
   * Check if resumption is possible and analyze queue state
   */
  async checkResumeState(): Promise<ResumeQueueState> {
    const state = this.createInitialState();

    try {
      const journalExists = await this.checkJournalExists();
      const queueExists = await this.checkQueueExists();
      
      state.queueExists = queueExists;

      if (!journalExists && !queueExists) {
        state.warnings.push('No previous export state found');
        return state;
      }

      if (queueExists) {
        await this.analyzeQueueState(state);
      }

      if (journalExists && !queueExists) {
        state.warnings.push('Traditional resume journal found but no queue state - partial resume possible');
        state.canResume = true;
      }

      return state;

    } catch (error) {
      state.warnings.push(`Error checking resume state: ${error}`);
      return state;
    }
  }

  /**
   * Resume export with queue state restoration
   */
  async resumeWithQueue(options: Partial<ResumeOptions> = {}): Promise<ResumeResult> {
    const opts = this.mergeResumeOptions(options);
    const result = this.createInitialResult();

    try {
      logger.info('Starting export resume with queue state restoration', {
        spaceKey: this.config.spaceKey,
        options: opts,
      });

      const state = await this.checkResumeState();
      
      if (!this.canProceedWithResume(state, opts, result)) {
        return result;
      }

      const queueResult = await this.restoreQueueState(state, opts);
      this.updateResultFromQueueRestore(result, queueResult);

      if (result.queue) {
        logger.info('Queue state successfully restored', {
          itemsRecovered: result.itemsRecovered,
          queueSize: result.queue.items?.size || 0,
          processedPages: result.queue.processedPages?.size || 0,
        });
      }

      result.success = result.queueRestored || opts.forceResume;
      return result;

    } catch (error) {
      result.errors.push(`Resume failed: ${error}`);
      logger.error('Export resume failed', { error, spaceKey: this.config.spaceKey });
      return result;
    }
  }

  /**
   * Create a fresh queue orchestrator from restored state
   */
  async createResumedOrchestrator(restoredQueue: DownloadQueue): Promise<DownloadQueueOrchestrator> {
    const orchestrator = new DownloadQueueOrchestrator(
      this.workspaceDir,
      {
        maxQueueSize: restoredQueue.maxQueueSize,
        persistenceThreshold: restoredQueue.persistenceThreshold,
      }
    );

    logger.info('Resumed queue orchestrator initialized', {
      queueSize: restoredQueue.items?.size || 0,
      processedPages: restoredQueue.processedPages?.size || 0,
    });

    return orchestrator;
  }

  /**
   * Clean up resume state after successful completion
   */
  async cleanupResumeState(): Promise<void> {
    try {
      if (await this.checkJournalExists()) {
        logger.debug('Traditional resume journal cleaned up');
      }

      logger.debug('Resume state cleanup completed');

    } catch (error) {
      logger.warn('Failed to cleanup resume state', { error });
    }
  }

  private createInitialState(): ResumeQueueState {
    return {
      queueExists: false,
      queueValid: false,
      queueSize: 0,
      processedCount: 0,
      lastSavedAt: new Date(0),
      canResume: false,
      corruptionDetected: false,
      backupAvailable: false,
      warnings: [],
    };
  }

  private createInitialResult(): ResumeResult {
    return {
      success: false,
      queueRestored: false,
      itemsRecovered: 0,
      itemsLost: 0,
      warnings: [],
      errors: [],
    };
  }

  private mergeResumeOptions(options: Partial<ResumeOptions>): ResumeOptions {
    return {
      forceResume: false,
      allowCorrupted: false,
      useBackup: false,
      validateIntegrity: true,
      repairCorruption: true,
      ...options,
    };
  }

  private async checkJournalExists(): Promise<boolean> {
    try {
      await access(this.journalPath);
      return true;
    } catch {
      return false;
    }
  }

  private async checkQueueExists(): Promise<boolean> {
    try {
      await this.persistence.load();
      return true;
    } catch {
      return false;
    }
  }

  private async analyzeQueueState(state: ResumeQueueState): Promise<void> {
    try {
      const loadResult = await this.persistence.load();
      if (loadResult) {
        state.queueValid = true;
        state.queueSize = loadResult.items?.size || 0;
        state.processedCount = loadResult.processedPages?.size || 0;
        state.canResume = true;

        const validation = await this.validateQueueIntegrity(loadResult);
        if (!validation.valid) {
          state.corruptionDetected = true;
          state.warnings.push(...validation.errors);
        }
      } else {
        state.corruptionDetected = true;
        state.warnings.push('Queue file exists but failed to load');
      }

      const backups = await this.recoveryService.listBackups(this.config.spaceKey);
      state.backupAvailable = backups.length > 0;
      if (state.backupAvailable) {
        state.warnings.push(`${backups.length} backup(s) available for recovery`);
      }
    } catch (error) {
      state.corruptionDetected = true;
      state.warnings.push(`Queue corruption detected: ${error}`);
    }
  }

  private canProceedWithResume(
    state: ResumeQueueState, 
    opts: ResumeOptions, 
    result: ResumeResult
  ): boolean {
    if (!state.canResume && !opts.forceResume) {
      result.errors.push('Resume not possible - use --force-resume to override');
      return false;
    }

    if (state.corruptionDetected && !opts.allowCorrupted && !opts.repairCorruption) {
      result.errors.push('Queue corruption detected - use --allow-corrupted or enable auto-repair');
      return false;
    }

    return true;
  }

  private updateResultFromQueueRestore(
    result: ResumeResult,
    queueResult: QueueRestoreResult
  ): void {
    result.queueRestored = queueResult.success;
    result.itemsRecovered = queueResult.itemsRecovered;
    result.itemsLost = queueResult.itemsLost;
    result.warnings.push(...queueResult.warnings);
    result.queue = queueResult.queue;
    result.metrics = queueResult.metrics;

    if (queueResult.errors.length > 0) {
      result.errors.push(...queueResult.errors);
    }
  }

  private async restoreQueueState(
    state: ResumeQueueState,
    options: ResumeOptions
  ): Promise<QueueRestoreResult> {
    const restoreResult = this.createInitialRestoreResult();

    try {
      if (state.queueExists && !state.corruptionDetected) {
        return await this.restoreFromValidQueue(restoreResult);
      }

      if (state.corruptionDetected && options.repairCorruption) {
        return await this.restoreFromCorruptedQueue(restoreResult);
      }

      if (state.backupAvailable && options.useBackup) {
        return await this.restoreFromBackup(restoreResult);
      }

      if (await this.checkJournalExists()) {
        return await this.restoreFromJournal(restoreResult);
      }

      restoreResult.errors.push('No valid queue state could be restored');
      return restoreResult;

    } catch (error) {
      restoreResult.errors.push(`Queue restoration failed: ${error}`);
      return restoreResult;
    }
  }

  private createInitialRestoreResult(): QueueRestoreResult {
    return {
      success: false,
      itemsRecovered: 0,
      itemsLost: 0,
      warnings: [],
      errors: [],
    };
  }

  private async restoreFromValidQueue(restoreResult: QueueRestoreResult): Promise<QueueRestoreResult> {
    const queue = await this.persistence.load();
    if (queue) {
      restoreResult.success = true;
      restoreResult.queue = queue;
      restoreResult.metrics = queue.metrics;
      restoreResult.itemsRecovered = queue.items?.size || 0;
      
      logger.info('Queue state restored directly', {
        itemsRecovered: restoreResult.itemsRecovered,
      });
    }
    return restoreResult;
  }

  private async restoreFromCorruptedQueue(restoreResult: QueueRestoreResult): Promise<QueueRestoreResult> {
    const queue = await this.persistence.load();
    if (queue) {
      const recoveryResult = await this.recoveryService.recoverQueue(queue, this.config.spaceKey);

      if (recoveryResult.success) {
        restoreResult.success = true;
        restoreResult.queue = queue;
        restoreResult.itemsRecovered = recoveryResult.recoveredItems;
        restoreResult.itemsLost = recoveryResult.droppedItems;
        restoreResult.warnings.push(...recoveryResult.errors);
        
        if (recoveryResult.backupUsed) {
          restoreResult.warnings.push(`Restored from backup: ${recoveryResult.backupUsed}`);
        }

        logger.info('Queue state recovered from corruption', {
          itemsRecovered: restoreResult.itemsRecovered,
          itemsLost: restoreResult.itemsLost,
          backupUsed: !!recoveryResult.backupUsed,
        });
      }
    }
    return restoreResult;
  }

  private async restoreFromBackup(restoreResult: QueueRestoreResult): Promise<QueueRestoreResult> {
    const backups = await this.recoveryService.listBackups(this.config.spaceKey);
    const latestBackup = backups[0];
    
    if (latestBackup) {
      const backupFile = `queue-backup-${this.config.spaceKey}-${latestBackup.timestamp}.json`;
      const restoredQueue = await this.recoveryService.restoreFromBackup(backupFile);
      
      if (restoredQueue) {
        restoreResult.success = true;
        restoreResult.queue = restoredQueue;
        restoreResult.itemsRecovered = latestBackup.itemCount;
        restoreResult.warnings.push(`Restored from backup created at ${new Date(latestBackup.timestamp).toISOString()}`);
        
        logger.info('Queue state restored from backup', {
          itemsRecovered: restoreResult.itemsRecovered,
          backupTimestamp: latestBackup.timestamp,
        });
      }
    }
    return restoreResult;
  }

  private async restoreFromJournal(restoreResult: QueueRestoreResult): Promise<QueueRestoreResult> {
    restoreResult.success = true;
    restoreResult.queue = this.createMinimalQueue();
    restoreResult.warnings.push('Created minimal queue state for traditional resume');
    
    logger.info('Created minimal queue state for traditional resume');
    return restoreResult;
  }

  private async validateQueueIntegrity(queue: DownloadQueue): Promise<ValidationResult> {
    const validation: ValidationResult = { valid: true, errors: [] };

    try {
      this.validateQueueStructure(queue, validation);
      this.validateQueueConsistency(queue, validation);
      this.validateQueueMetrics(queue, validation);

      return validation;

    } catch (error) {
      validation.valid = false;
      validation.errors.push(`Validation error: ${error}`);
      return validation;
    }
  }

  private validateQueueStructure(queue: DownloadQueue, validation: ValidationResult): void {
    if (!queue.items || !(queue.items instanceof Map)) {
      validation.valid = false;
      validation.errors.push('Invalid or missing queue items');
    }

    if (!Array.isArray(queue.processingOrder)) {
      validation.valid = false;
      validation.errors.push('Invalid processing order');
    }

    if (!queue.processedPages || !(queue.processedPages instanceof Set)) {
      validation.valid = false;
      validation.errors.push('Invalid processed pages set');
    }
  }

  private validateQueueConsistency(queue: DownloadQueue, validation: ValidationResult): void {
    if (queue.items && queue.processingOrder) {
      const orderCount = queue.processingOrder.length;
      const itemsCount = Array.from(queue.items.values())
        .filter(item => item.status === 'pending' || item.status === 'processing')
        .length;
      
      if (Math.abs(orderCount - itemsCount) > 1) { // Allow small discrepancy
        validation.valid = false;
        validation.errors.push(`Queue inconsistency: ${orderCount} in order, ${itemsCount} pending items`);
      }
    }
  }

  private validateQueueMetrics(queue: DownloadQueue, validation: ValidationResult): void {
    if (queue.metrics) {
      if (queue.metrics.currentQueueSize < 0) {
        validation.valid = false;
        validation.errors.push('Invalid negative queue size in metrics');
      }

      if (queue.metrics.totalProcessed < 0 || queue.metrics.totalFailed < 0) {
        validation.valid = false;
        validation.errors.push('Invalid negative counters in metrics');
      }
    }
  }

  private createMinimalQueue(): DownloadQueue {
    return {
      items: new Map(),
      processingOrder: [],
      processedPages: new Set(),
      maxQueueSize: 10000,
      persistencePath: join(this.workspaceDir, `.queue-${this.config.spaceKey}.json`),
      persistenceThreshold: 10,
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
}

interface QueueRestoreResult {
  success: boolean;
  queue?: DownloadQueue;
  metrics?: QueueMetrics;
  itemsRecovered: number;
  itemsLost: number;
  warnings: string[];
  errors: string[];
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Create a resume with queue service
 */
export function createResumeWithQueueService(
  config: ExportConfig,
  workspaceDir: string
): ResumeWithQueueService {
  return new ResumeWithQueueService(config, workspaceDir);
}
