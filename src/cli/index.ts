#!/usr/bin/env node

/**
 * CLI entry point for Confluence Space to Markdown Exporter
 * Implements commander.js interface with all required flags per T055
 */

import { Command } from 'commander';
import { loadConfig, type CLIOptions } from './configLoader.js';
import { createProgressLogger, type ProgressLogger } from './progress.js';
import { setupInterruptHandler } from './interrupt.js';
import { ExportRunner, type ExportProgress } from '../core/exportRunner.js';
import { logger } from '../util/logger.js';

/**
 * Handles the main export action
 */
async function handleExportAction(options: CLIOptions): Promise<void> {
  // Validate exclusive flags
  if (options.resume && options.fresh) {
    logger.error('Cannot specify both --resume and --fresh flags');
    process.exit(1);
  }

  // Load and validate configuration
  const config = await loadConfig(options);
  
  // Set up progress logging
  const progressLogger: ProgressLogger = createProgressLogger(config.logLevel);
  
  // Set up interrupt handler for graceful shutdown
  const cleanup = setupInterruptHandler(config.outputDir);
  
  try {
    // Create and run export
    const runner = new ExportRunner(config);
    
    logger.info('Starting Confluence export', {
      space: config.spaceKey,
      outputDir: config.outputDir,
      dryRun: config.dryRun,
      concurrency: config.concurrency,
    });

    const result: ExportProgress = await runner.run();
    
    // Log final results using actual ExportProgress properties
    progressLogger.logSummary({
      pagesProcessed: result.processedPages,
      pagesTotal: result.totalPages,
      pagesRemaining: 0,
      attachmentsProcessed: result.processedAttachments,
      attachmentsTotal: result.totalAttachments,
      warnings: 0, // TODO: Add warnings tracking to ExportProgress
      errors: result.errors.length,
      startTime: result.startTime.getTime(),
      elapsedSeconds: (Date.now() - result.startTime.getTime()) / 1000,
    });
    
    // Exit with appropriate code
    process.exit(result.errors.length > 0 ? 1 : 0);
    
  } finally {
    // Clean up interrupt handler
    cleanup();
  }
}

const program = new Command();

program
  .name('confluence-exporter')
  .description('Export Confluence space to Markdown files with hierarchy preservation')
  .version('0.1.0');

program
  .requiredOption('--space <space>', 'Confluence space key or name to export')
  .option('--out <directory>', 'Output directory (default: ./spaces/<space_key>)', undefined)
  .option('--dry-run', 'Show what would be exported without writing files', false)
  .option('--concurrency <number>', 'Number of concurrent API requests', '5')
  .option('--resume', 'Resume interrupted export (requires previous export state)')
  .option('--fresh', 'Start fresh export (remove any previous state)')
  .option('--root <pageId>', 'Root page ID to limit export scope (optional)')
  .option('--log-level <level>', 'Log level: error, warn, info, debug', 'info')
  .option('--config <file>', 'Configuration file path (optional)')
  .option('--attachment-threshold <percent>', 'Attachment failure threshold percentage', '20')
  .action(handleExportAction);

// Handle unknown commands
program.on('command:*', () => {
  logger.error('Invalid command. See --help for available commands.');
  process.exit(1);
});

// Parse arguments
program.parse();

// If no command provided, show help
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}
