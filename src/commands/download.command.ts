/**
 * Download command handler - Downloads HTML pages from _queue.yaml
 */

import type { CommandHandler, CommandContext } from './types.js';
import { ConfluenceApi } from '../api.js';
import type { PageTreeNode, PageIndexEntry, ConfluenceConfig } from '../types.js';
import path, { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { parse } from 'yaml';
import { format } from 'prettier';
import { updateIndexEntry } from '../utils.js';

export class DownloadCommand implements CommandHandler {
  name = 'download';
  description = 'Download HTML pages from Confluence';

  constructor(private config: ConfluenceConfig) { }

  async execute(context: CommandContext): Promise<void> {
    const api = new ConfluenceApi(this.config);

    // Single page mode
    if (this.config.pageId) {
      console.log(`\n📄 Downloading single page: ${this.config.pageId}\n`);
      await this.downloadPage(api, this.config.pageId);
      console.log('\n✅ Download complete!\n');
      return;
    }

    // Queue mode - check for tree first, then fallback to queue
    const treeFile = join(this.config.outputDir, '_tree.yaml');
    const queueFile = join(this.config.outputDir, '_queue.yaml');

    console.log(`\n🔍 Checking for tree file: ${treeFile}`);
    console.log(`🔍 Checking for queue file: ${queueFile}\n`);

    const hasTree = existsSync(treeFile);
    const hasQueue = existsSync(queueFile);

    if (!hasTree || !hasQueue) {
      throw new Error(
        `❌ Tree or queue file not found. Run 'plan' command first to create the tree and queue.`
      );
    }

    // Read queue
    const queueContent = readFileSync(queueFile, 'utf-8');
    const queue = parse(queueContent) as PageIndexEntry[];

    console.log(`📊 Queue contains ${queue.length} pages\n`);

    // Apply limit if specified
    const pagesToProcess = this.config.limit ? queue.slice(0, this.config.limit) : queue;

    await this.downloadFromQueueWithHierarchy(api, this.config, pagesToProcess);
  }

  private async downloadFromQueueWithHierarchy(
    api: ConfluenceApi,
    config: ConfluenceConfig,
    queue: PageIndexEntry[]
  ): Promise<void> {
    const treeFile = join(config.outputDir, '_tree.yaml');
    const treeContent = readFileSync(treeFile, 'utf-8');
    const tree = parse(treeContent) as PageTreeNode[];

    // Build a map of pageId -> path
    const pagePathMap = new Map<string, string>();

    const buildPathMap = (node: PageTreeNode, currentPath: string) => {
      // Store the path for this page
      pagePathMap.set(node.id, currentPath);

      // If node has children, build paths for them too
      if (node.children && node.children.length > 0) {
        const slug = this.slugify(node.title);
        const childDir = join(currentPath, `${node.id}-${slug}`);

        for (const child of node.children) {
          buildPathMap(child, childDir);
        }
      }
    };

    // Create root folder for space
    const rootDir = join(config.outputDir, config.spaceKey);
    mkdirSync(rootDir, { recursive: true });

    // Build the path map from tree
    for (const node of tree) {
      buildPathMap(node, rootDir);
    }
   
    // Display first page path as tree
    const firstPagePath = pagePathMap.get(queue[0].id);
    if (firstPagePath) {
      this.displayPathAsTree(path.dirname(firstPagePath), rootDir);
    }

    // Download pages from queue using the path map
    for (let i = 0; i < queue.length; i++) {
      const entry = queue[i];
      const pagePath = pagePathMap.get(entry.id) || rootDir;

      // Skip if HTML file already exists
      const filename = `${entry.id}-${this.slugify(entry.title)}.html`;
      const skip = existsSync(`${pagePath}/${filename}`);
 
      const deep = Math.max(0, pagePath.split(path.sep).length - rootDir.split(path.sep).length - 1);
      console.log(`${'  '.repeat(deep)}/${filename} [${i + 1}/${queue.length}] ${skip ? '(⏭️ skipped)' : ''}`);

      try {
        // Create directory if it doesn't exist
        mkdirSync(pagePath, { recursive: true });
        if (!skip) await this.downloadPage(api, entry.id, pagePath);
      } catch (error) {
        console.error(`❌ Failed to download page ${entry.id}:`, error);
      }
    }

    console.log('\n✅ Download complete!\n');
  }

  private displayPathAsTree(fullPath: string, rootDir: string): void {
    // Get relative path from root
    const relativePath = path.relative(rootDir, fullPath);
    
    // Split path into segments
    const segments = relativePath.split(path.sep).filter(s => s);
    
    // Display each segment with proper indentation
    for (let i = 0; i < segments.length; i++) {
      const indent = '  '.repeat(i);
      console.log(`${indent}/${segments[i]}`);
    }
  }

  private async downloadPage(
    api: ConfluenceApi,
    pageId: string,
    outputDir?: string
  ): Promise<void> {
    const page = await api.getPage(pageId);
    const slug = this.slugify(page.title);
    const filename = `${pageId}-${slug}.html`;

    const dir = outputDir || process.cwd();
    const filepath = join(dir, filename);

    // Format HTML with Prettier
    let formattedHtml = page.body;
    try {
      formattedHtml = await format(page.body, {
        parser: 'html',
        printWidth: 120,
        htmlWhitespaceSensitivity: 'ignore',
        tabWidth: 2,
      });
    } catch {
      console.warn(`⚠️  Failed to format HTML for ${page.title}, saving unformatted`);
    }

    writeFileSync(filepath, formattedHtml, 'utf-8');

    // Update _index.yaml with download metadata
    const indexPath = join(this.config.outputDir, '_index.yaml');
    const success = updateIndexEntry(indexPath, page.id, {
      downloadedVersion: page.version ?? 0,
      downloadedAt: new Date().toISOString()
    });

    if (!success) {
      console.warn(`⚠️  Failed to update index for page ${page.title}`);
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim()
      .substring(0, 50); // Limit length for filesystem
  }
}
