/**
 * Minimal export runner
 */

import { promises as fs } from 'fs';
import path from 'path';
import prettier from 'prettier';
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

    // Otherwise, export entire space
    console.log(`Starting export of space: ${this.config.spaceKey}`);
    console.log(`Output directory: ${this.config.outputDir}\n`);

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
