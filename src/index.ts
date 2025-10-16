#!/usr/bin/env node
/**
 * Minimal Confluence to Markdown Exporter - CLI Entry Point
 */

import { config as loadEnv } from 'dotenv';
import { ExportRunner } from './runner.js';
import type { ConfluenceConfig } from './types.js';

async function main() {
  // Load .env file if it exists
  loadEnv();

  // Parse command line arguments or environment variables
  const config: ConfluenceConfig = {
    baseUrl: process.env.CONFLUENCE_BASE_URL || process.argv[2] || '',
    username: process.env.CONFLUENCE_USERNAME || process.argv[3] || '',
    password: process.env.CONFLUENCE_PASSWORD || process.argv[4] || '',
    spaceKey: process.env.CONFLUENCE_SPACE_KEY || process.argv[5] || '',
    outputDir: process.env.OUTPUT_DIR || process.argv[6] || './output'
  };

  // Validate config
  if (!config.baseUrl || !config.username || !config.password || !config.spaceKey) {
    console.error('Usage: node index.js <baseUrl> <username> <password> <spaceKey> [outputDir]');
    console.error('\nOr set environment variables:');
    console.error('  CONFLUENCE_BASE_URL');
    console.error('  CONFLUENCE_USERNAME');
    console.error('  CONFLUENCE_PASSWORD');
    console.error('  CONFLUENCE_SPACE_KEY');
    console.error('  OUTPUT_DIR (optional, defaults to ./output)');
    console.error('\nExample:');
    console.error('  node index.js https://mysite.atlassian.net user@example.com mypass MYSPACE ./output');
    process.exit(1);
  }

  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   Minimal Confluence to Markdown Exporter         ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  try {
    const runner = new ExportRunner(config);
    await runner.run();
    
    console.log('\n✓ Export completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Export failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
