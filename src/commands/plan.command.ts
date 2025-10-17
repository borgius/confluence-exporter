/**
 * Plan command handler - Creates _queue.yaml for download
 */

import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'yaml';
import { ConfluenceApi } from '../api.js';
import type { PageIndexEntry } from '../types.js';
import type { CommandContext, CommandHandler } from './types.js';

export class PlanCommand implements CommandHandler {
  async execute(context: CommandContext): Promise<void> {
    const { config } = context;
    const api = new ConfluenceApi(config);

    // Create output directory if it doesn't exist
    await fs.mkdir(config.outputDir, { recursive: true });

    const queuePath = path.join(config.outputDir, '_queue.yaml');

    // If pageId is specified, create queue for that page and all children
    if (config.pageId) {
      console.log(`Creating download queue for page: ${config.pageId} and all children`);
      console.log(`Output directory: ${config.outputDir}\n`);

      try {
        const pages = await this.collectPageTree(api, config.pageId);
        await this.writeQueue(queuePath, config, pages);
        
        console.log(`\n✓ Queue created: ${queuePath}`);
        console.log(`  Total pages in queue: ${pages.length}`);
      } catch (error) {
        throw new Error(`Failed to create queue for page ${config.pageId}: ${error instanceof Error ? error.message : error}`);
      }
      return;
    }

    // Otherwise, create queue from existing _index.yaml
    console.log(`Creating download queue from existing index`);
    console.log(`Output directory: ${config.outputDir}\n`);

    const indexPath = path.join(config.outputDir, '_index.yaml');
    
    try {
      // Read _index.yaml
      const yamlContent = await fs.readFile(indexPath, 'utf-8');
      const pages = yaml.parse(yamlContent) as PageIndexEntry[];
      
      console.log(`Read ${pages.length} pages from _index.yaml`);
      
      // Apply limit if specified
      const pagesToQueue = config.limit ? pages.slice(0, config.limit) : pages;
      
      if (config.limit && pages.length > config.limit) {
        console.log(`Limiting to first ${config.limit} pages`);
      }
      
      // Write _queue.yaml (same format, just a copy for now)
      await this.writeQueue(queuePath, config, pagesToQueue);
      
      console.log(`\n✓ Queue created: ${queuePath}`);
      console.log(`  Total pages in queue: ${pagesToQueue.length}`);
    } catch (error) {
      throw new Error(`Failed to create queue from index: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Recursively collect a page and all its descendants
   */
  private async collectPageTree(api: ConfluenceApi, pageId: string, depth: number = 0): Promise<PageIndexEntry[]> {
    const pages: PageIndexEntry[] = [];
    const indent = '  '.repeat(depth);
    
    // Fetch the page
    const page = await api.getPage(pageId);
    console.log(`${indent}[${pages.length + 1}] Found: ${page.title} (${page.id})`);
    
    // Add to results
    pages.push({
      id: page.id,
      title: page.title,
      version: page.version,
      parentId: page.parentId,
      modifiedDate: page.modifiedDate,
      indexedDate: new Date().toISOString(),
      pageNumber: 0 // Not from API pagination
    });
    
    // Fetch child pages
    const children = await api.getChildPages(pageId);
    
    // Recursively collect children
    for (const child of children) {
      const childPages = await this.collectPageTree(api, child.id, depth + 1);
      pages.push(...childPages);
    }
    
    return pages;
  }

  /**
   * Write _queue.yaml file
   */
  private async writeQueue(queuePath: string, config: CommandContext['config'], pages: PageIndexEntry[]): Promise<void> {
    const header = `# Confluence Download Queue
# Space: ${config.spaceKey}
# Created: ${new Date().toISOString()}
# Total Pages: ${pages.length}

`;
    
    await fs.writeFile(queuePath, header, 'utf-8');
    
    // Write each page as YAML array entry
    for (const page of pages) {
      const yamlDoc = yaml.stringify(page).trim();
      const lines = yamlDoc.split('\n');
      const arrayItem = lines.map((line, index) => {
        if (index === 0) {
          return `- ${line}`;
        }
        return `  ${line}`;
      }).join('\n');
      
      await fs.appendFile(queuePath, arrayItem + '\n', 'utf-8');
    }
  }
}
