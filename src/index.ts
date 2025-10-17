#!/usr/bin/env node
/**
 * Minimal Confluence to Markdown Exporter - CLI Entry Point
 */

import minimist from 'minimist';
import { config as loadEnv } from 'dotenv';
import { ExportRunner } from './runner.js';
import type { ConfluenceConfig } from './types.js';

type Command = 'help' | 'index' | 'download' | 'plan';

function showHelp(): void {
  console.log('Minimal Confluence to Markdown Exporter\n');
  console.log('Usage: node index.js <command> [options]\n');
  console.log('Commands:');
  console.log('  help                     Show this help message');
  console.log('  index                    Create _index.yaml with page metadata');
  console.log('  plan                     Create _queue.yaml for download (from index or specific page tree)');
  console.log('  download                 Download pages from existing _index.yaml or _queue.yaml');
  console.log('  index download           Run both commands in sequence\n');
  console.log('Options:');
  console.log('  -u, --url <url>          Confluence base URL');
  console.log('  -n, --username <email>   Confluence username/email');
  console.log('  -p, --password <token>   Confluence API token');
  console.log('  -s, --space <key>        Confluence space key');
  console.log('  -i, --pageId <id>        Download specific page ID only (optional)');
  console.log('  -o, --output <dir>       Output directory (default: ./output)');
  console.log('  --pageSize <number>      Items per API page (default: 25)');
  console.log('  -h, --help               Show this help message\n');
  console.log('Environment Variables:');
  console.log('  CONFLUENCE_BASE_URL');
  console.log('  CONFLUENCE_USERNAME');
  console.log('  CONFLUENCE_PASSWORD');
  console.log('  CONFLUENCE_SPACE_KEY');
  console.log('  OUTPUT_DIR\n');
  console.log('Examples:');
  console.log('  # Create index only');
  console.log('  node index.js index -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE');
  console.log('  # Create download queue from existing index');
  console.log('  node index.js plan -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE');
  console.log('  # Create download queue for specific page and all children');
  console.log('  node index.js plan -i 123456789 -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE');
  console.log('  # Download from existing queue or index');
  console.log('  node index.js download -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE');
  console.log('  # Do both (create index then download)');
  console.log('  node index.js index download -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE');
  console.log('  # Export single page (no index needed)');
  console.log('  node index.js download -i 123456789 -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE');
}

async function main() {
  // Load .env file if it exists
  loadEnv();

  // Parse command line arguments
  const args = minimist(process.argv.slice(2), {
    string: ['url', 'username', 'password', 'space', 'output', 'pageId', 'pageSize'],
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

  // Show help if requested or no commands provided
  if (args.help || args._.length === 0) {
    showHelp();
    process.exit(0);
  }

  // Extract commands from positional arguments
  const commands = args._ as string[];
  const validCommands: Command[] = ['help', 'index', 'download', 'plan'];
  const requestedCommands: Command[] = [];

  // Validate and collect commands
  for (const cmd of commands) {
    const command = cmd.toLowerCase();
    if (validCommands.includes(command as Command)) {
      requestedCommands.push(command as Command);
    } else {
      console.error(`Error: Unknown command "${cmd}"\n`);
      showHelp();
      process.exit(1);
    }
  }

  // Handle help command
  if (requestedCommands.includes('help')) {
    showHelp();
    process.exit(0);
  }

  // Build config from args or environment variables
  const config: ConfluenceConfig = {
    baseUrl: args.url || process.env.CONFLUENCE_BASE_URL || '',
    username: args.username || process.env.CONFLUENCE_USERNAME || '',
    password: args.password || process.env.CONFLUENCE_PASSWORD || '',
    spaceKey: args.space || process.env.CONFLUENCE_SPACE_KEY || '',
    outputDir: args.output || process.env.OUTPUT_DIR || './output',
    pageId: args.pageId || undefined,
    pageSize: args.pageSize ? parseInt(args.pageSize, 10) : undefined
  };

  // Validate config (except for help command which doesn't need it)
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

    // Execute commands in sequence
    for (let i = 0; i < requestedCommands.length; i++) {
      const command = requestedCommands[i];
      
      if (i > 0) {
        console.log('\n' + '─'.repeat(60) + '\n');
      }

      switch (command) {
        case 'index':
          await runner.runIndex();
          break;
        case 'plan':
          await runner.runPlan();
          break;
        case 'download':
          await runner.runDownload();
          break;
      }
    }
    
    console.log('\n✓ All commands completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Command failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
