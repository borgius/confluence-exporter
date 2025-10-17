/**
 * Download command handler - Downloads HTML pages from _queue.yaml
 */

import type { CommandHandler, CommandContext } from './types.js';
import { ConfluenceApi } from '../api.js';
import type { PageTreeNode, PageIndexEntry, ConfluenceConfig } from '../types.js';
import { join } from 'node:path';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { parse } from 'yaml';
import { format } from 'prettier';

export class DownloadCommand implements CommandHandler {
  name = 'download';
  description = 'Download HTML pages from Confluence';

  constructor(private config: ConfluenceConfig) {}

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

    let hasTree = false;
    let hasQueue = false;

    try {
      await access(treeFile);
      hasTree = true;
      console.log(`✅ Found tree file`);
    } catch {
      console.log(`❌ Tree file not found`);
    }

    try {
      await access(queueFile);
      hasQueue = true;
      console.log(`✅ Found queue file`);
    } catch {
      console.log(`❌ Queue file not found`);
    }

    if (hasTree) {
      // Use tree structure (hierarchical download)
      console.log(`\n📂 Using hierarchical structure from tree\n`);
      await this.downloadFromTree(api, this.config);
    } else if (hasQueue) {
      // Fallback to flat queue structure
      console.log(`\n📋 Using flat queue from queue file\n`);
      
      const queueContent = await readFile(queueFile, 'utf-8');
      const queue = parse(queueContent) as PageIndexEntry[];
      
      console.log(`📊 Queue contains ${queue.length} pages\n`);
      
      // Apply limit if specified
      const pagesToProcess = this.config.limit ? queue.slice(0, this.config.limit) : queue;
      
      for (let i = 0; i < pagesToProcess.length; i++) {
        const entry = pagesToProcess[i];
        console.log(`[${i + 1}/${pagesToProcess.length}] Downloading: ${entry.title} (${entry.id})`);
        
        try {
          await this.downloadPage(api, entry.id);
        } catch (error) {
          console.error(`❌ Failed to download page ${entry.id}:`, error);
        }
      }
      
      console.log('\n✅ Download complete!\n');
    } else {
      throw new Error(
        `❌ No queue or tree file found. Run 'plan' command first to create the queue.`
      );
    }
  }

  private async downloadFromTree(
    api: ConfluenceApi,
    config: CommandContext['config']
  ): Promise<void> {
    const treeFile = join(config.outputDir, '_tree.yaml');
    const treeContent = await readFile(treeFile, 'utf-8');
    const tree = parse(treeContent) as PageTreeNode[];

    // Create root folder for space
    const rootDir = join(config.outputDir, config.spaceKey);
    await mkdir(rootDir, { recursive: true });

    // Process tree recursively
    let count = 0;
    const processNode = async (node: PageTreeNode, currentDir: string, depth: number = 0) => {
      count++;
      const indent = '  '.repeat(depth);
      console.log(`${indent}[${count}] Downloading: ${node.title} (${node.id})`);

      try {
        await this.downloadPage(api, node.id, currentDir);

        // If node has children, create a folder and recurse
        if (node.children && node.children.length > 0) {
          const slug = this.slugify(node.title);
          const childDir = join(currentDir, `${node.id}-${slug}`);
          await mkdir(childDir, { recursive: true });

          for (const child of node.children) {
            await processNode(child, childDir, depth + 1);
          }
        }
      } catch (error) {
        console.error(`${indent}❌ Failed to download: ${error}`);
      }
    };

    for (const node of tree) {
      await processNode(node, rootDir);
    }

    console.log('\n✅ Download complete!\n');
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

    await writeFile(filepath, formattedHtml, 'utf-8');
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
