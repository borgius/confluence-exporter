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
   * Run the export process
   */
  async run(): Promise<void> {
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

    // Otherwise, export entire space in two phases
    console.log(`Starting export of space: ${this.config.spaceKey}`);
    console.log(`Output directory: ${this.config.outputDir}\n`);

    // Phase 1: Create index.yaml
    console.log('Phase 1: Creating index.yaml...');
    await this.createIndex();

    // Phase 2: Download pages from index
    console.log('\nPhase 2: Downloading pages from index...');
    await this.downloadFromIndex();

    console.log(`\nExport complete!`);
    console.log(`Files saved to: ${this.config.outputDir}`);
  }

  /**
   * Phase 1: Create index.yaml file with all pages to download
   */
  private async createIndex(): Promise<void> {
    const indexPath = path.join(this.config.outputDir, 'index.yaml');
    
    // Initialize the file with header metadata as comments
    const header = `# Confluence Export Index
# Space: ${this.config.spaceKey}
# Export Date: ${new Date().toISOString()}

`;
    await fs.writeFile(indexPath, header, 'utf-8');
    
    let pageCount = 0;
    
    // Fetch all pages metadata (without body content) and append each to the file
    for await (const page of this.api.getAllPages(this.config.spaceKey)) {
      pageCount++;
      console.log(`[${pageCount}] Indexed: ${page.title} (${page.id})`);
      
      // Create page entry
      const pageEntry: PageIndexEntry = {
        id: page.id,
        title: page.title,
        version: page.version,
        parentId: page.parentId,
        modifiedDate: page.modifiedDate,
        indexedDate: new Date().toISOString(),
        pageNumber: pageCount
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
   * Phase 2: Download pages from index.yaml
   */
  private async downloadFromIndex(): Promise<void> {
    const indexPath = path.join(this.config.outputDir, 'index.yaml');
    
    // Read and parse index.yaml (array format)
    const yamlContent = await fs.readFile(indexPath, 'utf-8');
    const pages = yaml.parse(yamlContent) as PageIndexEntry[];
    
    console.log(`Reading index from: ${indexPath}`);
    console.log(`Space: ${this.config.spaceKey}`);
    console.log(`Total pages to download: ${pages.length}\n`);
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process each page from the index
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
