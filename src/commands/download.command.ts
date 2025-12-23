/**
 * Download command handler - Downloads HTML pages from _queue.yaml
 */

import type { CommandHandler, CommandContext } from './types.js';
import { ConfluenceApi } from '../api.js';
import type { PageTreeNode, PageIndexEntry, ConfluenceConfig } from '../types.js';
import path, { join } from 'path';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { parse, stringify } from 'yaml';
import { format } from 'prettier';
import { updateIndexEntry, readIndexEntry } from '../utils.js';

export class DownloadCommand implements CommandHandler {
  name = 'download';
  description = 'Download HTML pages from Confluence';

  constructor(private config: ConfluenceConfig) { }

  async execute(context: CommandContext): Promise<void> {
    const api = new ConfluenceApi(this.config);

    // Single page mode
    if (this.config.pageId) {
      console.log(`\n📄 Downloading single page: ${this.config.pageId}\n`);
      
      // Check if page needs downloading
      const indexPath = join(this.config.outputDir, '_index.yaml');
      const indexEntry = readIndexEntry(indexPath, this.config.pageId);
      
      if (indexEntry && indexEntry.downloadedVersion !== undefined && indexEntry.downloadedAt) {
        // Check if we have current version info
        const currentVersion = indexEntry.version ?? 0;
        const downloadedVersion = indexEntry.downloadedVersion;
        
        if (currentVersion === downloadedVersion) {
          console.log(`⏭️  Page ${this.config.pageId} is up-to-date (v${downloadedVersion}), skipping download`);
          console.log('\n✅ Download complete!\n');
          return;
        } else {
          console.log(`📥 Updating page ${this.config.pageId} from v${downloadedVersion} to v${currentVersion}`);
        }
      } else {
        console.log(`📥 Downloading new page ${this.config.pageId}`);
      }
      
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

    // Download pages from queue using the path map in batches
    const batchSize = 50;
    for (let batchStart = 0; batchStart < queue.length; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, queue.length);
      const batch = queue.slice(batchStart, batchEnd);
      
      console.log(`\n📦 Processing batch ${Math.floor(batchStart / batchSize) + 1}/${Math.ceil(queue.length / batchSize)} (${batch.length} pages)`);
      
      await this.downloadBatch(api, config, batch, pagePathMap, rootDir);
    }

    console.log('\n✅ Download complete!\n');
  }

  private async downloadBatch(
    api: ConfluenceApi,
    config: ConfluenceConfig,
    batch: PageIndexEntry[],
    pagePathMap: Map<string, string>,
    rootDir: string
  ): Promise<void> {
    const indexPath = join(config.outputDir, '_index.yaml');
    
    // Read index once for the entire batch
    const indexContent = readFileSync(indexPath, 'utf-8');
    const allIndexEntries = parse(indexContent) as PageIndexEntry[];
    const indexMap = new Map(allIndexEntries.map(entry => [entry.id, entry]));

    // Determine which pages need downloading
    const pagesToDownload: Array<{ entry: PageIndexEntry; pagePath: string; skipReason: string }> = [];
    const skippedPages: Array<{ entry: PageIndexEntry; pagePath: string; skipReason: string }> = [];

    for (const entry of batch) {
      const pagePath = pagePathMap.get(entry.id) || rootDir;
      const indexEntry = indexMap.get(entry.id);
      
      let skip = false;
      let skipReason = '';
      
      if (indexEntry && indexEntry.downloadedVersion !== undefined && indexEntry.downloadedAt) {
        // Page has been downloaded before
        const currentVersion = entry.version ?? 0;
        const downloadedVersion = indexEntry.downloadedVersion;
        
        if (currentVersion === downloadedVersion) {
          skip = true;
          skipReason = `(⏭️ skipped - up-to-date v${downloadedVersion})`;
        } else {
          skipReason = `(📥 updating v${downloadedVersion} → v${currentVersion})`;
        }
      } else {
        skipReason = `(📥 new download)`;
      }

      const filename = `${entry.id}-${this.slugify(entry.title)}.html`;
      const deep = Math.max(0, pagePath.split(path.sep).length - rootDir.split(path.sep).length - 1);
      console.log(`${'  '.repeat(deep)}/${filename} ${skipReason}`);

      if (skip) {
        skippedPages.push({ entry, pagePath, skipReason });
      } else {
        pagesToDownload.push({ entry, pagePath, skipReason });
      }
    }

    // Download pages in parallel
    if (pagesToDownload.length > 0) {
      console.log(`\n📥 Downloading ${pagesToDownload.length} pages in parallel...`);
      
      const downloadPromises = pagesToDownload.map(async ({ entry, pagePath }) => {
        try {
          // Create directory if it doesn't exist
          mkdirSync(pagePath, { recursive: true });
          const page = await api.getPage(entry.id);
          
          // Update the index entry in memory
          const indexEntry = indexMap.get(entry.id);
          if (indexEntry) {
            indexEntry.downloadedVersion = page.version ?? 0;
            indexEntry.downloadedAt = new Date().toISOString();
          }
          
          return { entry, page, pagePath, success: true };
        } catch (error) {
          console.error(`❌ Failed to download page ${entry.id}:`, error);
          return { entry, page: null, pagePath, success: false };
        }
      });

      const results = await Promise.all(downloadPromises);

      // Process successful downloads
      for (const result of results) {
        if (result.success && result.page) {
          try {
            await this.savePageToFile(result.page, result.pagePath);
          } catch (error) {
            console.error(`❌ Failed to save page ${result.entry.id}:`, error);
          }
        }
      }
    }

    // Write updated index back to file once for the entire batch
    if (pagesToDownload.length > 0) {
      const yamlContent = stringify(allIndexEntries, {
        indent: 2,
        lineWidth: 0
      });
      writeFileSync(indexPath, yamlContent, 'utf-8');
      console.log(`💾 Updated index with ${pagesToDownload.length} downloaded pages`);
    }

    console.log(`✅ Batch complete: ${pagesToDownload.length} downloaded, ${skippedPages.length} skipped`);
  }

  private async savePageToFile(
    page: { id: string; title: string; body: string; version?: number },
    filePath: string
  ): Promise<void> {
    const slug = this.slugify(page.title);
    const filename = `${page.id}-${slug}.html`;
    const fullPath = join(filePath, filename);

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

    writeFileSync(fullPath, formattedHtml, 'utf-8');
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
