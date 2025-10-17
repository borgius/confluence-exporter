/**
 * Index command handler - Creates _index.yaml with all page metadata
 */

import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'yaml';
import { ConfluenceApi } from '../api.js';
import type { PageIndexEntry } from '../types.js';
import type { CommandContext, CommandHandler } from './types.js';

export class IndexCommand implements CommandHandler {
  async execute(context: CommandContext): Promise<void> {
    const { config } = context;
    const api = new ConfluenceApi(config);

    // Create output directory if it doesn't exist
    await fs.mkdir(config.outputDir, { recursive: true });

    console.log(`Starting indexing of space: ${config.spaceKey}`);
    console.log(`Output directory: ${config.outputDir}\n`);

    // Phase 1: Create _index.yaml
    console.log('Phase 1: Creating _index.yaml...');
    await this.createIndex(api, config);

    console.log(`\nIndexing complete!`);
    console.log(`Index saved to: ${config.outputDir}/_index.yaml`);
  }

  /**
   * Create _index.yaml file with all pages to download
   */
  private async createIndex(api: ConfluenceApi, config: CommandContext['config']): Promise<void> {
    const indexPath = path.join(config.outputDir, '_index.yaml');
    
    let pageCount = 0;
    let pageSize = config.pageSize || 100;
    let startFrom = 0;
    
    // Check if _index.yaml already exists (resume functionality)
    try {
      const existingContent = await fs.readFile(indexPath, 'utf-8');
      
      // Extract page size from comment if it exists
      const pageSizeMatch = existingContent.match(/# Page Size: (\d+)/);
      if (pageSizeMatch) {
        pageSize = parseInt(pageSizeMatch[1], 10);
        console.log(`Using existing page size from index: ${pageSize}`);
      }
      
      const existingPages = yaml.parse(existingContent) as PageIndexEntry[];
      
      if (existingPages && Array.isArray(existingPages)) {
        pageCount = existingPages.length;
        // Calculate the start position for the API
        startFrom = pageCount;
        console.log(`Found existing index with ${pageCount} pages. Resuming from position ${startFrom + 1}...\n`);
      }
    } catch (_error) {
      // File doesn't exist or is invalid, start fresh
      const header = `# Confluence Export Index
# Space: ${config.spaceKey}
# Export Date: ${new Date().toISOString()}
# Page Size: ${pageSize}

`;
      await fs.writeFile(indexPath, header, 'utf-8');
      console.log(`Creating new index with page size: ${pageSize}...\n`);
    }
    
    // Fetch pages starting from where we left off
    for await (const page of api.getAllPages(config.spaceKey, pageSize, startFrom)) {
      pageCount++;
      console.log(`[${pageCount}] Indexed: ${page.title} (${page.id}) [API Page ${page.apiPageNumber}]`);
      
      // Create page entry
      const pageEntry: PageIndexEntry = {
        id: page.id,
        title: page.title,
        version: page.version,
        parentId: page.parentId,
        modifiedDate: page.modifiedDate,
        indexedDate: new Date().toISOString(),
        pageNumber: page.apiPageNumber
      };
      
      // Convert to YAML and format as array item (with leading -)
      const yamlDoc = yaml.stringify(pageEntry).trim();
      const lines = yamlDoc.split('\n');
      const arrayItem = lines.map((line, index) => {
        if (index === 0) {
          return `- ${line}`;
        }
        return `  ${line}`;
      }).join('\n');
      
      await fs.appendFile(indexPath, arrayItem + '\n', 'utf-8');
      
      // Check if limit is reached
      if (config.limit && pageCount >= config.limit) {
        console.log(`\n⚠ Limit reached: ${config.limit} pages indexed`);
        break;
      }
    }
    
    console.log(`\n✓ Index created: ${indexPath}`);
    console.log(`  Total pages indexed: ${pageCount}`);
  }
}
