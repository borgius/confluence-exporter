/**
 * Graceful interrupt handler for CLI operations
 * Implements T058: Graceful interrupt handler (SIGINT) writing sentinel
 */

import { writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { logger } from '../util/logger.js';

let interruptHandlerInstalled = false;
let cleanup: (() => void) | null = null;

/**
 * Sets up graceful interrupt handling for export operations
 */
export function setupInterruptHandler(outputDir: string): () => void {
  if (interruptHandlerInstalled) {
    logger.warn('Interrupt handler already installed');
    return cleanup || (() => {});
  }

  const sentinelPath = join(outputDir, '.export-in-progress');
  let shutdownInitiated = false;

  const handleInterrupt = (signal: string): void => {
    if (shutdownInitiated) {
      logger.warn('Force exit requested');
      process.exit(1);
    }

    shutdownInitiated = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);
    logger.info('Press Ctrl+C again to force exit');

    try {
      // Ensure output directory exists
      const outputDirPath = dirname(sentinelPath);
      if (!existsSync(outputDirPath)) {
        mkdirSync(outputDirPath, { recursive: true });
      }

      // Write interrupt sentinel with timestamp
      const sentinelData = {
        interrupted: true,
        timestamp: new Date().toISOString(),
        signal,
        message: 'Export was interrupted and can be resumed with --resume flag',
      };

      writeFileSync(sentinelPath, JSON.stringify(sentinelData, null, 2));
      logger.info('Saved export state for resume capability');
      
      // Give the export runner a chance to clean up
      setTimeout(() => {
        logger.info('Graceful shutdown complete');
        process.exit(130); // Standard exit code for SIGINT
      }, 1000);

    } catch (error) {
      logger.error('Failed to save export state', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      process.exit(1);
    }
  };

  // Install signal handlers
  process.on('SIGINT', () => handleInterrupt('SIGINT'));
  process.on('SIGTERM', () => handleInterrupt('SIGTERM'));

  // Handle uncaught exceptions and unhandled rejections
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    handleInterrupt('UNCAUGHT_EXCEPTION');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', {
      reason: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    handleInterrupt('UNHANDLED_REJECTION');
  });

  interruptHandlerInstalled = true;

  // Return cleanup function
  cleanup = (): void => {
    if (!interruptHandlerInstalled) {
      return;
    }

    // Remove signal handlers
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');

    interruptHandlerInstalled = false;
    cleanup = null;

    logger.debug('Interrupt handlers cleaned up');
  };

  return cleanup;
}

/**
 * Checks if an export was previously interrupted
 */
export function checkInterruptedExport(outputDir: string): boolean {
  const sentinelPath = join(outputDir, '.export-in-progress');
  return existsSync(sentinelPath);
}

/**
 * Clears the interrupt sentinel (called on successful completion)
 */
export function clearInterruptSentinel(outputDir: string): void {
  const sentinelPath = join(outputDir, '.export-in-progress');
  
  if (existsSync(sentinelPath)) {
    try {
      // Instead of deleting, we'll rename to indicate completion
      const completedPath = join(outputDir, '.export-completed');
      renameSync(sentinelPath, completedPath);
      
      logger.debug('Cleared interrupt sentinel', { sentinelPath, completedPath });
    } catch (error) {
      logger.warn('Failed to clear interrupt sentinel', {
        error: error instanceof Error ? error.message : 'Unknown error',
        sentinelPath,
      });
    }
  }
}

/**
 * Creates an interrupt sentinel at the start of export
 */
export function createInterruptSentinel(outputDir: string): void {
  const sentinelPath = join(outputDir, '.export-in-progress');
  
  try {
    // Ensure output directory exists
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const sentinelData = {
      started: true,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      message: 'Export is in progress. Use --resume to continue if interrupted.',
    };

    writeFileSync(sentinelPath, JSON.stringify(sentinelData, null, 2));
    logger.debug('Created interrupt sentinel', { sentinelPath });

  } catch (error) {
    logger.warn('Failed to create interrupt sentinel', {
      error: error instanceof Error ? error.message : 'Unknown error',
      sentinelPath,
    });
  }
}
