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
    console.log('  help                          Show this help message');
    console.log('  index                         Create _index.yaml with page metadata');
    console.log('  plan                          Create _queue.yaml for download (from index or specific page tree)');
    console.log('  download                      Download HTML pages from _queue.yaml');
    console.log('  transform                     Transform HTML files to Markdown (checks for missing .md files)');
    console.log('  index plan download transform Run all commands in sequence\n');
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
    console.log('  # Full workflow: index, plan, download, and transform');
    console.log('  node index.js index plan download transform -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Create index only (Phase 1)');
    console.log('  node index.js index -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Create download queue from existing index (Phase 2)');
    console.log('  node index.js plan -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Create download queue for specific page and all children');
    console.log('  node index.js plan -i 123456789 -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Download HTML pages from existing queue (Phase 3)');
    console.log('  node index.js download -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Transform HTML to Markdown (Phase 4)');
    console.log('  node index.js transform -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Download and transform together');
    console.log('  node index.js download transform -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Download single page HTML only (no index/plan needed)');
    console.log('  node index.js download -i 123456789 -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE');
  }
}
