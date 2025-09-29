/**
 * Configuration loader and validation for CLI
 * Implements T056: Wire config/env resolution & validation in CLI
 */

import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, resolve } from 'path';
import type { ExportConfig } from '../models/entities.js';
import { logger } from '../util/logger.js';
import { buildConfig, type RawEnv, type CliFlags } from '../util/config.js';

export interface CLIOptions {
  space: string;
  out?: string;
  dryRun: boolean;
  concurrency: string;
  resume?: boolean;
  fresh?: boolean;
  root?: string;
  logLevel: string;
  config?: string;
  attachmentThreshold: string;
}

/**
 * Parses and validates CLI options
 */
function parseCliOptions(options: CLIOptions): CliFlags {
  const concurrency = parseInt(options.concurrency, 10);
  if (Number.isNaN(concurrency) || concurrency < 1 || concurrency > 20) {
    throw new Error('Concurrency must be a number between 1 and 20');
  }

  const outputDir = options.out 
    ? resolve(options.out)
    : resolve(process.cwd(), 'spaces', options.space.toLowerCase().replace(/[^a-z0-9]/g, '-'));

  return {
    spaceKey: options.space,
    outDir: outputDir,
    dryRun: options.dryRun,
    concurrency,
    resume: options.resume,
    fresh: options.fresh,
    rootPageId: options.root,
    logLevel: options.logLevel,
  };
}

/**
 * Loads environment variables
 */
function loadEnvironment(): RawEnv {
  return {
    CONFLUENCE_BASE_URL: process.env.CONFLUENCE_BASE_URL,
    CONFLUENCE_USERNAME: process.env.CONFLUENCE_USERNAME,
    CONFLUENCE_PASSWORD: process.env.CONFLUENCE_PASSWORD,
    LOG_LEVEL: process.env.LOG_LEVEL,
  };
}

/**
 * Validates attachment threshold option
 */
function validateAttachmentThreshold(threshold: string): void {
  const value = parseInt(threshold, 10);
  if (Number.isNaN(value) || value < 0 || value > 100) {
    throw new Error('Attachment threshold must be a percentage between 0 and 100');
  }
}

/**
 * Validates log level option
 */
function validateLogLevel(logLevel: string): void {
  const validLogLevels = ['error', 'warn', 'info', 'debug'];
  if (!validLogLevels.includes(logLevel)) {
    throw new Error(`Log level must be one of: ${validLogLevels.join(', ')}`);
  }
}

/**
 * Loads optional configuration file
 */
async function loadConfigFile(configPath?: string): Promise<Record<string, unknown>> {
  if (!configPath) {
    return {};
  }

  if (!existsSync(configPath)) {
    throw new Error(`Config file not found: ${configPath}`);
  }

  const configContent = await readFile(configPath, 'utf-8');
  return JSON.parse(configContent);
}

/**
 * Validates resume mode requirements
 */
function validateResumeMode(config: ExportConfig): void {
  if (config.resume) {
    const resumeMarker = join(config.outputDir, '.export-in-progress');
    if (!existsSync(resumeMarker)) {
      throw new Error('Cannot resume: no previous export state found. Use --fresh to start new export.');
    }
  }
}

/**
 * Loads and validates configuration from CLI options and environment
 */
export async function loadConfig(options: CLIOptions): Promise<ExportConfig> {
  try {
    // Validate individual options
    validateLogLevel(options.logLevel);
    validateAttachmentThreshold(options.attachmentThreshold);

    // Parse CLI options
    const cliFlags = parseCliOptions(options);
    
    // Load environment
    const env = loadEnvironment();
    
    // Load optional config file
    await loadConfigFile(options.config);
    
    // Build configuration using existing utility
    const config = buildConfig(env, cliFlags);
    
    // Additional validation
    validateResumeMode(config);

    logger.info('Configuration loaded successfully', {
      spaceKey: config.spaceKey,
      outputDir: config.outputDir,
      dryRun: config.dryRun,
      concurrency: config.concurrency,
      rootPageId: config.rootPageId,
    });

    return config;

  } catch (error) {
    logger.error('Configuration loading failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
