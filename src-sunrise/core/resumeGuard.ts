/**
 * Resume mode guard service
 * Implements T063: Resume mode guard (require --resume / --fresh if sentinel present)
 */

import { existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import type { ExportConfig } from '../models/entities.js';
import { logger } from '../util/logger.js';

export interface ResumeState {
  isInterrupted: boolean;
  sentinelExists: boolean;
  canResume: boolean;
  mustChooseMode: boolean;
  lastModified?: Date;
  interruptReason?: string;
}

export interface ResumeModeValidation {
  isValid: boolean;
  mode: 'fresh' | 'resume' | 'normal';
  message: string;
  shouldAbort: boolean;
}

/**
 * Guards against ambiguous resume behavior by enforcing explicit mode selection
 */
export class ResumeModeGuard {
  private outputDir: string;
  private sentinelPath: string;
  private completedPath: string;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    this.sentinelPath = join(outputDir, '.export-in-progress');
    this.completedPath = join(outputDir, '.export-completed');
  }

  /**
   * Checks the current resume state based on sentinel files
   */
  checkResumeState(): ResumeState {
    const sentinelExists = existsSync(this.sentinelPath);
    const completedExists = existsSync(this.completedPath);
    
    let lastModified: Date | undefined;
    let interruptReason: string | undefined;

    if (sentinelExists) {
      try {
        const sentinelContent = readFileSync(this.sentinelPath, 'utf-8');
        const sentinelData = JSON.parse(sentinelContent);
        
        if (sentinelData.timestamp) {
          lastModified = new Date(sentinelData.timestamp);
        }
        
        interruptReason = sentinelData.signal || sentinelData.message || 'Unknown interruption';
        
      } catch (error) {
        logger.warn('Failed to read sentinel file', {
          sentinelPath: this.sentinelPath,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Set default interrupt reason for corrupted files
        interruptReason = 'Unknown interruption';
      }
    }

    const state: ResumeState = {
      isInterrupted: sentinelExists,
      sentinelExists,
      canResume: sentinelExists && !completedExists, // Can resume if interrupted but not completed
      mustChooseMode: sentinelExists, // Must choose if there's any previous state
      lastModified,
      interruptReason,
    };

    logger.debug('Resume state checked', {
      outputDir: this.outputDir,
      sentinelExists,
      completedExists,
      canResume: state.canResume,
      mustChooseMode: state.mustChooseMode,
      lastModified: lastModified?.toISOString(),
    });

    return state;
  }

  /**
   * Validates the export configuration against the current resume state
   */
  validateConfig(config: ExportConfig): ResumeModeValidation {
    const state = this.checkResumeState();
    
    // If no previous state, normal mode is fine
    if (!state.mustChooseMode) {
      return {
        isValid: true,
        mode: 'normal',
        message: 'No previous export state found, proceeding with normal export',
        shouldAbort: false,
      };
    }

    // If previous state exists, user must explicitly choose
    if (!config.resume && !config.fresh) {
      const ageInfo = state.lastModified 
        ? ` (last modified: ${state.lastModified.toLocaleString()})`
        : '';
      
      return {
        isValid: false,
        mode: 'normal',
        message: `Previous export state detected${ageInfo}. You must choose:\n` +
                 '  --resume: Continue from where it left off\n' +
                 '  --fresh:  Start completely fresh (removes previous state)\n' +
                 `Reason: ${state.interruptReason || 'Unknown interruption'}`,
        shouldAbort: true,
      };
    }

    // Validate resume mode
    if (config.resume) {
      if (!state.canResume) {
        return {
          isValid: false,
          mode: 'resume',
          message: 'Cannot resume: no valid resume state found or export already completed',
          shouldAbort: true,
        };
      }

      return {
        isValid: true,
        mode: 'resume',
        message: `Resuming export from previous state (${state.interruptReason || 'interrupted'})`,
        shouldAbort: false,
      };
    }

    // Validate fresh mode
    if (config.fresh) {
      return {
        isValid: true,
        mode: 'fresh',
        message: 'Starting fresh export (previous state will be cleared)',
        shouldAbort: false,
      };
    }

    // Should not reach here
    return {
      isValid: false,
      mode: 'normal',
      message: 'Invalid configuration state',
      shouldAbort: true,
    };
  }

  /**
   * Enforces resume mode guard - returns validation result
   */
  enforce(config: ExportConfig): ResumeModeValidation {
    const validation = this.validateConfig(config);
    
    if (validation.shouldAbort) {
      logger.error('Resume mode validation failed', {
        message: validation.message,
        outputDir: this.outputDir,
        configResume: config.resume,
        configFresh: config.fresh,
      });
    } else {
      logger.info('Resume mode validation passed', {
        mode: validation.mode,
        message: validation.message,
      });
    }

    return validation;
  }

  /**
   * Clears all resume state files (used in fresh mode)
   */
  clearResumeState(): void {
    const filesToClear = [this.sentinelPath, this.completedPath];
    
    for (const filePath of filesToClear) {
      if (existsSync(filePath)) {
        try {
          unlinkSync(filePath);
          logger.debug('Cleared resume state file', { filePath });
        } catch (error) {
          logger.warn('Failed to clear resume state file', {
            filePath,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    logger.info('Resume state cleared for fresh export');
  }

  /**
   * Gets human-readable resume state description
   */
  getStateDescription(): string {
    const state = this.checkResumeState();
    
    if (!state.sentinelExists) {
      return 'No previous export state';
    }

    if (state.canResume) {
      const ageInfo = state.lastModified 
        ? ` (${this.getRelativeTime(state.lastModified)})`
        : '';
      return `Export interrupted${ageInfo} - can resume or start fresh`;
    }

    return 'Previous export completed - can start fresh';
  }

  /**
   * Gets relative time description
   */
  private getRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    }
    if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    }
    if (diffMinutes > 0) {
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    }
    return 'just now';
  }
}

/**
 * Creates a resume mode guard for the given output directory
 */
export function createResumeModeGuard(outputDir: string): ResumeModeGuard {
  return new ResumeModeGuard(outputDir);
}
