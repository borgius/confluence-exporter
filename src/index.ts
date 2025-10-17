#!/usr/bin/env node
/**
 * Minimal Confluence to Markdown Exporter - CLI Entry Point
 */

import minimist from 'minimist';
import { config as loadEnv } from 'dotenv';
import { ExportRunner } from './runner.js';
import type { ConfluenceConfig } from './types.js';

async function main() {
  // Load .env file if it exists
  loadEnv();

  // Parse command line arguments
  const args = minimist(process.argv.slice(2), {
    string: ['url', 'username', 'password', 'space', 'output', 'pageId'],
    alias: {
      u: 'url',
      n: 'username',
      p: 'password',
      s: 'space',
      o: 'output',
      i: 'pageId',
      h: 'help'
    }
  });

  // Show help
  if (args.help) {
    console.log('Minimal Confluence to Markdown Exporter\n');
    console.log('Usage: node index.js [options]\n');
    console.log('Options:');
    console.log('  -u, --url <url>          Confluence base URL');
    console.log('  -n, --username <email>   Confluence username/email');
    console.log('  -p, --password <token>   Confluence API token');
    console.log('  -s, --space <key>        Confluence space key');
    console.log('  -i, --pageId <id>        Download specific page ID only (optional)');
    console.log('  -o, --output <dir>       Output directory (default: ./output)');
    console.log('  -h, --help               Show this help message\n');
    console.log('Environment Variables:');
    console.log('  CONFLUENCE_BASE_URL');
    console.log('  CONFLUENCE_USERNAME');
    console.log('  CONFLUENCE_PASSWORD');
    console.log('  CONFLUENCE_SPACE_KEY');
    console.log('  OUTPUT_DIR\n');
    console.log('Examples:');
    console.log('  # Export entire space');
    console.log('  node index.js --url https://mysite.atlassian.net --username user@example.com --password mytoken --space MYSPACE');
    console.log('  # Export single page');
    console.log('  node index.js -u https://mysite.atlassian.net -n user@example.com -p mytoken -s MYSPACE -i 123456789');
    console.log('  # Export with custom output directory');
    console.log('  node index.js -u https://mysite.atlassian.net -n user@example.com -p mytoken -s MYSPACE -o ./export');
    process.exit(0);
  }

  // Build config from args or environment variables
  const config: ConfluenceConfig = {
    baseUrl: args.url || process.env.CONFLUENCE_BASE_URL || '',
    username: args.username || process.env.CONFLUENCE_USERNAME || '',
    password: args.password || process.env.CONFLUENCE_PASSWORD || '',
    spaceKey: args.space || process.env.CONFLUENCE_SPACE_KEY || '',
    outputDir: args.output || process.env.OUTPUT_DIR || './output',
    pageId: args.pageId || undefined
  };

  // Validate config
  if (!config.baseUrl || !config.username || !config.password || !config.spaceKey) {
    console.error('Error: Missing required configuration.\n');
    console.error('Please provide all required options or set environment variables.');
    console.error('Run with --help for usage information.\n');
    process.exit(1);
  }

  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║   Minimal Confluence to Markdown Exporter          ║');
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
