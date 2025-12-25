/**
 * Help command handler
 */

import { ConfluenceConfig } from 'src/types.js';
import type { CommandContext, CommandHandler } from './types.js';

export class HelpCommand implements CommandHandler {
  async execute(_context: CommandContext): Promise<void> {
    this.showHelp();
  }

  private showHelp(): void {
    console.log('Minimal Confluence to Markdown Exporter\n');
    console.log('Usage: node index.js [command] [options]\n');
    console.log('If no command is provided, runs full sync: update index (or create if not exists), plan, download, and transform.\n');
    console.log('Commands:');
    console.log('  help                          Show this help message');
    console.log('  index                         Create _index.yaml with page metadata');
    console.log('  update                        Check for new/updated pages and update _index.yaml');
    console.log('  plan                          Create _queue.yaml for download (from index or specific page tree)');
    console.log('  download                      Download HTML pages from _queue.yaml');
    console.log('  transform                     Transform HTML files to Markdown (skips existing MD files, creates links structure)');
    console.log('  index plan download transform Run all commands in sequence\n');
    console.log('Options:');
    console.log('  -u, --url <url>          Confluence base URL');
    console.log('  -n, --username <email>   Confluence username/email');
    console.log('  -p, --password <token>   Confluence API token');
    console.log('  -s, --space <key>        Confluence space key');
    console.log('  -i, --pageId <id>        Download specific page ID only (optional)');
    console.log('  -o, --output <dir>       Output directory (default: ./output)');
    console.log('  -l, --limit <number>     Limit number of pages to process (optional)');
    console.log('  --parallel <number>      Number of concurrent operations (default: 5)');
    console.log('  -f, --force              Force re-download of all pages (skip version check)');
    console.log('  --clear                  Clear existing MD files and images before transforming');
    console.log('  --pageSize <number>      Items per API page (default: 25)');
    console.log('  -h, --help               Show this help message\n');
    console.log('Environment Variables:');
    console.log('  CONFLUENCE_BASE_URL');
    console.log('  CONFLUENCE_USERNAME');
    console.log('  CONFLUENCE_PASSWORD');
    console.log('  CONFLUENCE_SPACE_KEY');
    console.log('  CONFLUENCE_OUTPUT_DIR\n');
    console.log('Examples:');
    console.log('  # Full workflow: index, plan, download, and transform');
    console.log('  node index.js index plan download transform -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Full workflow with limit (process first 10 pages only)');
    console.log('  node index.js index plan download transform -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE -l 10\n');
    console.log('  # Create index only (Phase 1)');
    console.log('  node index.js index -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Check for new/updated pages and update existing index');
    console.log('  node index.js update -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Create download queue from existing index (Phase 2)');
    console.log('  node index.js plan -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Create download queue for specific page and all children');
    console.log('  node index.js plan -i 123456789 -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Force re-download all pages (ignore version check)');
    console.log('  node index.js plan --force -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Download HTML pages from existing queue (Phase 3)');
    console.log('  node index.js download -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Transform HTML to Markdown (Phase 4)');
    console.log('  node index.js transform -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Transform HTML to Markdown with clear (remove existing MD files first)');
    console.log('  node index.js transform --clear -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Download and transform together');
    console.log('  node index.js download transform -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Download and transform with higher concurrency');
    console.log('  node index.js download transform --parallel 10 -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE\n');
    console.log('  # Download single page HTML only (no index/plan needed)');
    console.log('  node index.js download -i 123456789 -u https://mysite.atlassian.net -n user@example.com -p token -s MYSPACE');
  }
}
