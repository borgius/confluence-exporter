/**
 * Minimal export runner
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { ConfluenceConfig, Page } from './types.js';
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
    console.log(`Starting export of space: ${this.config.spaceKey}`);
    console.log(`Output directory: ${this.config.outputDir}`);

    // Create output directory if it doesn't exist
    await fs.mkdir(this.config.outputDir, { recursive: true });

    let pageCount = 0;

    // Fetch and process all pages
    for await (const page of this.api.getAllPages(this.config.spaceKey)) {
      pageCount++;
      console.log(`[${pageCount}] Processing: ${page.title} (${page.id})`);

      try {
        await this.processPage(page);
      } catch (error) {
        console.error(`Failed to process page ${page.id}:`, error);
      }
    }

    console.log(`\nExport complete! Processed ${pageCount} pages.`);
    console.log(`Files saved to: ${this.config.outputDir}`);
  }

  /**
   * Process a single page
   */
  private async processPage(page: Page): Promise<void> {
    // Transform to markdown
    const result = await this.transformer.transform(page);

    // Create front matter
    const frontMatter = [
      '---',
      `title: "${result.frontMatter.title.replace(/"/g, '\\"')}"`,
      `id: "${result.frontMatter.id}"`,
      result.frontMatter.version ? `version: ${result.frontMatter.version}` : '',
      result.frontMatter.parentId ? `parentId: "${result.frontMatter.parentId}"` : '',
      '---'
    ].filter(Boolean).join('\n');

    // Combine front matter and content
    const markdownContent = `${frontMatter}\n\n${result.content}`;

    // Create safe filename from title
    const filename = this.slugify(result.frontMatter.title);
    const filepath = path.join(this.config.outputDir, `${filename}.md`);

    // Write to file
    await fs.writeFile(filepath, markdownContent, 'utf-8');
    console.log(`  ✓ Saved: ${filename}.md`);
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
