/**
 * Help command handler
 */

import type { CommandContext, CommandHandler } from './types.js';

export class HelpCommand implements CommandHandler {
  async execute(_context: CommandContext): Promise<void> {
    this.showHelp();
  }

  private showHelp(): void {
    console.log('Minimal Confluence to Markdown Exporter\n');
    console.log('Usage: node index.js <command> [options]\n');
    console.log('Commands:');
    console.log('  help                     Show this help message');
    console.log('  index                    Create _index.yaml with page metadata');
    console.log('  plan                     Create _queue.yaml for download (from index or specific page tree)');
    console.log('  download                 Download pages from _queue.yaml (requires plan to be run first)');
    console.log('  index plan download      Run all commands in sequence\n');
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
    console.log('  # Download from existing queue (requires plan first)');
    console.log('  node index.js download -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE');
    console.log('  # Do all three (create index, plan, then download)');
    console.log('  node index.js index plan download -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE');
    console.log('  # Export single page (no index/plan needed)');
    console.log('  node index.js download -i 123456789 -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE');
  }
}
