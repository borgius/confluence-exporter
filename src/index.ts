#!/usr/bin/env node
/**
 * Minimal Confluence to Markdown Exporter - CLI Entry Point
 */

import minimist from 'minimist';
import { config as loadEnv } from 'dotenv';
import { CommandExecutor } from './commands/executor.js';
import { HelpCommand } from './commands/help.command.js';
import type { ConfluenceConfig } from './types.js';
import type { CommandContext } from './commands/types.js';

async function main() {
  // Load .env file if it exists
  loadEnv();

  // Parse command line arguments
  const args = minimist(process.argv.slice(2), {
    string: ['url', 'username', 'password', 'space', 'output', 'pageId', 'pageSize', 'limit'],
    boolean: ['clear', 'force'],
    alias: {
      u: 'url',
      n: 'username',
      p: 'password',
      s: 'space',
      o: 'output',
      i: 'pageId',
      l: 'limit',
      f: 'force',
      h: 'help'
    }
  });

  // Show help if requested or no commands provided
  if (args.help || args._.length === 0) {
    const helpCommand = new HelpCommand();
    await helpCommand.execute({ config: {} as ConfluenceConfig, args });
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
    pageSize: args.pageSize ? parseInt(args.pageSize, 10) : 100,
    limit: args.limit ? parseInt(args.limit, 10) : undefined,
    clear: args.clear || false,
    force: args.force || false
  };

  // Validate config (except for help command which doesn't need it)
  if (!config.baseUrl || !config.username || !config.password || !config.spaceKey) {
    console.error('Error: Missing required configuration.\n');
    console.error('Please provide all required options or set environment variables.');
    console.error('Run with --help for usage information.\n');
    process.exit(1);
  }


  // Extract commands from positional arguments
  const commands = args._ as string[];
  const executor = new CommandExecutor(config);

  // Validate commands
  let requestedCommands: Awaited<ReturnType<typeof executor.validateCommands>>;
  try {
    requestedCommands = executor.validateCommands(commands);
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}\n`);
    const helpCommand = new HelpCommand();
    await helpCommand.execute({ config: {} as ConfluenceConfig, args });
    process.exit(1);
  }

  // Handle help command
  if (requestedCommands.includes('help')) {
    const helpCommand = new HelpCommand();
    await helpCommand.execute({ config: {} as ConfluenceConfig, args });
    process.exit(0);
  }

  try {
    const context: CommandContext = { config, args };
    await executor.executeCommands(requestedCommands, context);
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Command failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
