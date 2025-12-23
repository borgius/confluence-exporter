/**
 * Update command handler - Checks for new/updated pages and updates _index.yaml
 */

import { promises as fs } from 'fs';
import path from 'path';
import yaml from 'yaml';
import { ConfluenceApi } from '../api.js';
import type { ConfluenceConfig, PageIndexEntry, PageMetadata } from '../types.js';
import type { CommandContext, CommandHandler } from './types.js';

export class UpdateCommand implements CommandHandler {
  constructor(private config: ConfluenceConfig) {}

  async execute(context: CommandContext): Promise<void> {
    const api = new ConfluenceApi(this.config);
    const indexPath = path.join(this.config.outputDir, '_index.yaml');

    console.log(`Checking for updates in space: ${this.config.spaceKey}`);
    console.log(`Index file: ${indexPath}\n`);

    // Load existing index
    let existingIndex: Map<string, PageIndexEntry>;
    let oldestIndexedDate: string | undefined;
    
    try {
      const existingContent = await fs.readFile(indexPath, 'utf-8');
      const existingPages = yaml.parse(existingContent) as PageIndexEntry[];
      existingIndex = new Map(existingPages.map(p => [p.id, p]));
      
      // Find the oldest indexedDate to use as the starting point for CQL search
      for (const page of existingPages) {
        if (page.indexedDate) {
          if (!oldestIndexedDate || page.indexedDate < oldestIndexedDate) {
            oldestIndexedDate = page.indexedDate;
          }
        }
      }
      
      console.log(`Loaded existing index with ${existingIndex.size} pages`);
      if (oldestIndexedDate) {
        console.log(`Oldest indexed date: ${oldestIndexedDate}\n`);
      }
    } catch (error) {
      console.error(`Error: _index.yaml not found. Run 'index' command first.`);
      process.exit(1);
    }

    // Use CQL to fetch only pages modified since oldest indexed date
    // This is much more efficient than fetching all pages
    let modifiedPages: PageMetadata[] = [];
    
    if (oldestIndexedDate) {
      // Format date for CQL: "yyyy-MM-dd" or "yyyy-MM-dd HH:mm"
      const searchDate = oldestIndexedDate.split('T')[0]; // Get just the date part
      const cql = `space = "${this.config.spaceKey}" AND type = page AND lastmodified >= "${searchDate}" ORDER BY lastmodified DESC`;
      
      console.log(`Searching for pages modified since ${searchDate}...`);
      console.log(`CQL: ${cql}\n`);
      
      try {
        modifiedPages = await api.searchPages(cql, this.config.pageSize || 100);
        console.log(`Found ${modifiedPages.length} pages modified since ${searchDate}\n`);
      } catch (error) {
        console.warn(`CQL search failed, falling back to full space scan...`);
        console.warn(`Error: ${error}\n`);
        modifiedPages = [];
      }
    }

    // If CQL search returned results, use them; otherwise fall back to full scan
    let currentPages: Map<string, PageMetadata>;
    let needsFullScan = modifiedPages.length === 0;
    
    if (!needsFullScan) {
      // Build a map from modified pages and merge with existing index
      // This approach won't detect deleted pages without a full scan
      currentPages = new Map(Array.from(existingIndex.entries()).map(([id, entry]) => [id, {
        id: entry.id,
        title: entry.title,
        version: entry.version,
        parentId: entry.parentId,
        modifiedDate: entry.modifiedDate
      }] as [string, PageMetadata]));
      
      // Update with modified pages
      for (const page of modifiedPages) {
        currentPages.set(page.id, page);
      }
      
      console.log(`Note: Using incremental update. To detect deleted pages, run with --full flag.\n`);
    } else {
      // Full scan - fetch all pages metadata
      console.log('Fetching all pages metadata (metadata only, no content)...\n');
      
      currentPages = new Map();
      let pageCount = 0;
      
      for await (const page of api.getAllPagesMetadata(this.config.spaceKey, this.config.pageSize || 100)) {
        currentPages.set(page.id, page);
        pageCount++;
        
        // Progress indicator every 100 pages
        if (pageCount % 100 === 0) {
          console.log(`  Fetched ${pageCount} pages...`);
        }
      }
      
      console.log(`\nFetched ${currentPages.size} pages from space\n`);
    }

    // Compare and find changes
    const newPages: PageMetadata[] = [];
    const updatedPages: Array<{ current: PageMetadata; indexed: PageIndexEntry }> = [];
    const deletedPages: PageIndexEntry[] = [];

    // Find new and updated pages
    for (const [id, current] of currentPages) {
      const indexed = existingIndex.get(id);
      
      if (!indexed) {
        newPages.push(current);
      } else if (current.version && indexed.version && current.version > indexed.version) {
        updatedPages.push({ current, indexed });
      }
    }

    // Find deleted pages (only if we did a full scan)
    if (!needsFullScan) {
      // Skip deleted page detection for incremental updates
    } else {
      for (const [id, indexed] of existingIndex) {
        if (!currentPages.has(id)) {
          deletedPages.push(indexed);
        }
      }
    }

    // Report findings
    console.log('=== Update Summary ===');
    console.log(`New pages:     ${newPages.length}`);
    console.log(`Updated pages: ${updatedPages.length}`);
    if (needsFullScan) {
      console.log(`Deleted pages: ${deletedPages.length}`);
    } else {
      console.log(`Deleted pages: (skipped - use --full for deletion detection)`);
    }
    console.log('');

    if (newPages.length === 0 && updatedPages.length === 0 && deletedPages.length === 0) {
      console.log('✓ Index is up to date. No changes needed.');
      return;
    }

    // Show details
    if (newPages.length > 0) {
      console.log('\n--- New Pages ---');
      for (const page of newPages) {
        console.log(`  + ${page.title} (${page.id})`);
      }
    }

    if (updatedPages.length > 0) {
      console.log('\n--- Updated Pages ---');
      for (const { current, indexed } of updatedPages) {
        console.log(`  ~ ${current.title} (${current.id}) v${indexed.version} → v${current.version}`);
      }
    }

    if (deletedPages.length > 0) {
      console.log('\n--- Deleted Pages ---');
      for (const page of deletedPages) {
        console.log(`  - ${page.title} (${page.id})`);
      }
    }

    // Update the index
    console.log('\n\nUpdating _index.yaml...');
    
    // Build updated index
    const updatedIndex: PageIndexEntry[] = [];
    const now = new Date().toISOString();

    for (const [id, current] of currentPages) {
      const existing = existingIndex.get(id);
      
      if (existing && (!current.version || !existing.version || current.version === existing.version)) {
        // Keep existing entry unchanged
        updatedIndex.push(existing);
      } else {
        // New or updated page
        updatedIndex.push({
          id: current.id,
          title: current.title,
          version: current.version,
          parentId: current.parentId,
          modifiedDate: current.modifiedDate,
          indexedDate: now,
          pageNumber: existing?.pageNumber || 0
        });
      }
    }

    // Write updated index
    const header = `# Confluence Export Index
# Space: ${this.config.spaceKey}
# Export Date: ${now}
# Page Size: ${this.config.pageSize || 100}

`;

    const yamlContent = updatedIndex.map(entry => {
      const yamlDoc = yaml.stringify(entry).trim();
      const lines = yamlDoc.split('\n');
      return lines.map((line, index) => {
        if (index === 0) {
          return `- ${line}`;
        }
        return `  ${line}`;
      }).join('\n');
    }).join('\n');

    await fs.writeFile(indexPath, header + yamlContent + '\n', 'utf-8');

    console.log(`\n✓ Index updated successfully!`);
    console.log(`  Total pages in index: ${updatedIndex.length}`);
    console.log(`  Added: ${newPages.length}, Updated: ${updatedPages.length}, Removed: ${deletedPages.length}`);
  }
}
