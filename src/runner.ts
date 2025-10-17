/**
 * Minimal export runner
 */

import { promises as fs } from 'fs';
import path from 'path';
import prettier from 'prettier';
import yaml from 'yaml';
import type { ConfluenceConfig, Page, PageIndexEntry } from './types.js';
import { ConfluenceApi } from './api.js';
import { MarkdownTransformer } from './transformer.js';

export class ExportRunner {
  private api: ConfluenceApi;
  private transformer: MarkdownTransformer;
  private config: ConfluenceConfig;

  constructor(config: ConfluenceConfig) {
    this.config = config;
    this.api = new ConfluenceApi(config);
    this.transformer = new MarkdownTransformer(this.api);
  }

  /**
   * Run the index command (Phase 1 only)
   */
  async runIndex(): Promise<void> {
    // Create output directory if it doesn't exist
    await fs.mkdir(this.config.outputDir, { recursive: true });

    console.log(`Starting indexing of space: ${this.config.spaceKey}`);
    console.log(`Output directory: ${this.config.outputDir}\n`);

    // Phase 1: Create _index.yaml
    console.log('Phase 1: Creating _index.yaml...');
    await this.createIndex();

    console.log(`\nIndexing complete!`);
    console.log(`Index saved to: ${this.config.outputDir}/_index.yaml`);
  }

  /**
   * Run the download command (Phase 2 only)
   */
  async runDownload(): Promise<void> {
    // Create output directory if it doesn't exist
    await fs.mkdir(this.config.outputDir, { recursive: true });

    // If pageId is specified, export only that page
    if (this.config.pageId) {
      console.log(`Exporting single page: ${this.config.pageId}`);
      console.log(`Output directory: ${this.config.outputDir}\n`);

      try {
        const page = await this.api.getPage(this.config.pageId);
        console.log(`Processing: ${page.title} (${page.id})`);
        await this.processPage(page);
        console.log(`\n✓ Page exported successfully!`);
        console.log(`Files saved to: ${this.config.outputDir}`);
      } catch (error) {
        throw new Error(`Failed to export page ${this.config.pageId}: ${error instanceof Error ? error.message : error}`);
      }
      return;
    }

    // Check if _queue.yaml exists, require it to proceed
    const queuePath = path.join(this.config.outputDir, '_queue.yaml');
    
    try {
      await fs.access(queuePath);
      console.log(`Using queue file: ${queuePath}`);
    } catch {
      throw new Error(
        `Queue file not found: ${queuePath}\n\n` +
        `To start download, you need to run the 'plan' command first:\n` +
        `  node index.js plan -u URL -n USER -p PASS -s SPACE\n\n` +
        `This will create a _queue.yaml file with the pages to download.`
      );
    }
    
    const sourcePath = queuePath;

    // Otherwise, download pages from source file
    console.log(`Starting download from ${path.basename(sourcePath)}`);
    console.log(`Output directory: ${this.config.outputDir}\n`);

    // Phase 2: Download pages from source
    console.log(`Phase 2: Downloading pages from ${path.basename(sourcePath)}...`);
    await this.downloadFromFile(sourcePath);

    console.log(`\nDownload complete!`);
    console.log(`Files saved to: ${this.config.outputDir}`);
  }

  /**
   * Run the plan command - Create _queue.yaml
   */
  async runPlan(): Promise<void> {
    // Create output directory if it doesn't exist
    await fs.mkdir(this.config.outputDir, { recursive: true });

    const queuePath = path.join(this.config.outputDir, '_queue.yaml');

    // If pageId is specified, create queue for that page and all children
    if (this.config.pageId) {
      console.log(`Creating download queue for page: ${this.config.pageId} and all children`);
      console.log(`Output directory: ${this.config.outputDir}\n`);

      try {
        const pages = await this.collectPageTree(this.config.pageId);
        await this.writeQueue(queuePath, pages);
        
        console.log(`\n✓ Queue created: ${queuePath}`);
        console.log(`  Total pages in queue: ${pages.length}`);
      } catch (error) {
        throw new Error(`Failed to create queue for page ${this.config.pageId}: ${error instanceof Error ? error.message : error}`);
      }
      return;
    }

    // Otherwise, create queue from existing _index.yaml
    console.log(`Creating download queue from existing index`);
    console.log(`Output directory: ${this.config.outputDir}\n`);

    const indexPath = path.join(this.config.outputDir, '_index.yaml');
    
    try {
      // Read _index.yaml
      const yamlContent = await fs.readFile(indexPath, 'utf-8');
      const pages = yaml.parse(yamlContent) as PageIndexEntry[];
      
      console.log(`Read ${pages.length} pages from _index.yaml`);
      
      // Write _queue.yaml (same format, just a copy for now)
      await this.writeQueue(queuePath, pages);
      
      console.log(`\n✓ Queue created: ${queuePath}`);
      console.log(`  Total pages in queue: ${pages.length}`);
    } catch (error) {
      throw new Error(`Failed to create queue from index: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Run the export process (both index and download)
   * @deprecated Use runIndex() and runDownload() separately
   */
  async run(): Promise<void> {
    await this.runIndex();
    await this.runDownload();
  }

  /**
   * Phase 1: Create _index.yaml file with all pages to download
   */
  private async createIndex(): Promise<void> {
    const indexPath = path.join(this.config.outputDir, '_index.yaml');
    
    let pageCount = 0;
    const indexedPageIds = new Set<string>();
    let pageSize = this.config.pageSize || 25;
    
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
        existingPages.forEach(page => indexedPageIds.add(page.id));
        console.log(`Found existing index with ${pageCount} pages. Resuming from page ${pageCount + 1}...\n`);
      }
    } catch (_error) {
      // File doesn't exist or is invalid, start fresh
      const header = `# Confluence Export Index
# Space: ${this.config.spaceKey}
# Export Date: ${new Date().toISOString()}
# Page Size: ${pageSize}

`;
      await fs.writeFile(indexPath, header, 'utf-8');
      console.log(`Creating new index with page size: ${pageSize}...\n`);
    }
    
    // Fetch all pages metadata (without body content) and append each to the file
    for await (const page of this.api.getAllPages(this.config.spaceKey, pageSize)) {
      // Skip if already indexed
      if (indexedPageIds.has(page.id)) {
        continue;
      }
      
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
    }
    
    console.log(`\n✓ Index created: ${indexPath}`);
    console.log(`  Total pages indexed: ${pageCount}`);
  }

  /**
   * Phase 2: Download pages from index.yaml or queue.yaml
   */
  private async downloadFromFile(filePath: string): Promise<void> {
    // Read and parse the YAML file (array format)
    const yamlContent = await fs.readFile(filePath, 'utf-8');
    const pages = yaml.parse(yamlContent) as PageIndexEntry[];
    
    console.log(`Reading from: ${filePath}`);
    console.log(`Space: ${this.config.spaceKey}`);
    console.log(`Total pages to download: ${pages.length}\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process each page from the file
    for (let i = 0; i < pages.length; i++) {
      const entry = pages[i];
      const pageNum = i + 1;
      
      console.log(`[${pageNum}/${pages.length}] Processing: ${entry.title} (${entry.id})`);
      
      try {
        // Fetch full page with body content
        const page = await this.api.getPage(entry.id);
        await this.processPage(page);
        successCount++;
      } catch (error) {
        console.error(`  ✗ Failed to process page ${entry.id}:`, error instanceof Error ? error.message : error);
        errorCount++;
      }
    }
    
    console.log(`\n✓ Download complete!`);
    console.log(`  Success: ${successCount} pages`);
    if (errorCount > 0) {
      console.log(`  Errors: ${errorCount} pages`);
    }
  }

  /**
   * Recursively collect a page and all its descendants
   */
  private async collectPageTree(pageId: string, depth: number = 0): Promise<PageIndexEntry[]> {
    const pages: PageIndexEntry[] = [];
    const indent = '  '.repeat(depth);
    
    // Fetch the page
    const page = await this.api.getPage(pageId);
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
    const children = await this.api.getChildPages(pageId);
    
    // Recursively collect children
    for (const child of children) {
      const childPages = await this.collectPageTree(child.id, depth + 1);
      pages.push(...childPages);
    }
    
    return pages;
  }

  /**
   * Write _queue.yaml file
   */
  private async writeQueue(queuePath: string, pages: PageIndexEntry[]): Promise<void> {
    const header = `# Confluence Download Queue
# Space: ${this.config.spaceKey}
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

  /**
   * Phase 2: Download pages from _index.yaml
   * @deprecated Use downloadFromFile() instead
   */
  private async downloadFromIndex(): Promise<void> {
    const indexPath = path.join(this.config.outputDir, '_index.yaml');
    await this.downloadFromFile(indexPath);
  }

  /**
   * Process a single page
   */
  private async processPage(page: Page): Promise<void> {
    // Transform to markdown
    const result = await this.transformer.transform(page);

    // Create safe filename from title
    const filename = this.slugify(result.frontMatter.title);
    
    // Build original page URL
    const originalUrl = `${this.config.baseUrl}/pages/viewpage.action?pageId=${page.id}`;

    // Create front matter
    const frontMatter = [
      '---',
      `title: "${result.frontMatter.title.replace(/"/g, '\\"')}"`,
      `id: "${result.frontMatter.id}"`,
      `url: "${originalUrl}"`,
      result.frontMatter.version ? `version: ${result.frontMatter.version}` : '',
      result.frontMatter.parentId ? `parentId: "${result.frontMatter.parentId}"` : '',
      '---'
    ].filter(Boolean).join('\n');

    // Combine front matter and content
    const markdownContent = `${frontMatter}\n\n${result.content}`;

    const mdFilepath = path.join(this.config.outputDir, `${filename}.md`);
    const htmlFilepath = path.join(this.config.outputDir, `${filename}.html`);

    // Save images if any
    if (result.images.length > 0) {
      const imagesDir = path.join(this.config.outputDir, 'images');
      await fs.mkdir(imagesDir, { recursive: true });
      
      for (const image of result.images) {
        const imagePath = path.join(imagesDir, image.filename);
        await fs.writeFile(imagePath, image.data);
      }
    }

    // Format and write markdown file
    try {
      const formattedMarkdown = await prettier.format(markdownContent, {
        parser: 'markdown',
        printWidth: 120,
        proseWrap: 'preserve',
        tabWidth: 2,
        useTabs: false
      });
      await fs.writeFile(mdFilepath, formattedMarkdown, 'utf-8');
      console.log(`  ✓ Saved: ${filename}.md (formatted)`);
    } catch {
      // If formatting fails, save unformatted markdown
      console.warn(`  ⚠ Could not format Markdown, saving unformatted`);
      await fs.writeFile(mdFilepath, markdownContent, 'utf-8');
      console.log(`  ✓ Saved: ${filename}.md`);
    }

    // Format and write original HTML file
    try {
      const formattedHtml = await prettier.format(page.body, {
        parser: 'html',
        printWidth: 120,
        tabWidth: 2,
        useTabs: false,
        htmlWhitespaceSensitivity: 'ignore'
      });
      await fs.writeFile(htmlFilepath, formattedHtml, 'utf-8');
      console.log(`  ✓ Saved: ${filename}.html (formatted)`);
    } catch {
      // If formatting fails, save unformatted HTML
      console.warn(`  ⚠ Could not format HTML, saving unformatted`);
      await fs.writeFile(htmlFilepath, page.body, 'utf-8');
      console.log(`  ✓ Saved: ${filename}.html`);
    }
  }

  /**
   * Convert title to safe filename
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '') // Remove special chars
      .replace(/\s+/g, '-')     // Replace spaces with hyphens
      .replace(/-+/g, '-')      // Replace multiple hyphens with single
      .trim();
  }
}
