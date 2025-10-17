/**
 * Download command handler - Downloads pages from _queue.yaml
 */

import { promises as fs } from 'fs';
import path from 'path';
import prettier from 'prettier';
import yaml from 'yaml';
import { ConfluenceApi } from '../api.js';
import { MarkdownTransformer } from '../transformer.js';
import type { Page, PageIndexEntry } from '../types.js';
import type { CommandContext, CommandHandler } from './types.js';

export class DownloadCommand implements CommandHandler {
  async execute(context: CommandContext): Promise<void> {
    const { config } = context;
    const api = new ConfluenceApi(config);
    const transformer = new MarkdownTransformer(api);

    // Create output directory if it doesn't exist
    await fs.mkdir(config.outputDir, { recursive: true });

    // If pageId is specified, export only that page
    if (config.pageId) {
      console.log(`Exporting single page: ${config.pageId}`);
      console.log(`Output directory: ${config.outputDir}\n`);

      try {
        const page = await api.getPage(config.pageId);
        console.log(`Processing: ${page.title} (${page.id})`);
        await this.processPage(page, transformer, config);
        console.log(`\n✓ Page exported successfully!`);
        console.log(`Files saved to: ${config.outputDir}`);
      } catch (error) {
        throw new Error(`Failed to export page ${config.pageId}: ${error instanceof Error ? error.message : error}`);
      }
      return;
    }

    // Check if _queue.yaml exists, require it to proceed
    const queuePath = path.join(config.outputDir, '_queue.yaml');
    
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

    // Download pages from queue
    console.log(`Starting download from ${path.basename(queuePath)}`);
    console.log(`Output directory: ${config.outputDir}\n`);

    console.log(`Phase 2: Downloading pages from ${path.basename(queuePath)}...`);
    await this.downloadFromFile(queuePath, api, transformer, config);

    console.log(`\nDownload complete!`);
    console.log(`Files saved to: ${config.outputDir}`);
  }

  /**
   * Download pages from queue file
   */
  private async downloadFromFile(
    filePath: string,
    api: ConfluenceApi,
    transformer: MarkdownTransformer,
    config: CommandContext['config']
  ): Promise<void> {
    // Read and parse the YAML file (array format)
    const yamlContent = await fs.readFile(filePath, 'utf-8');
    const pages = yaml.parse(yamlContent) as PageIndexEntry[];
    
    console.log(`Reading from: ${filePath}`);
    console.log(`Space: ${config.spaceKey}`);
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
        const page = await api.getPage(entry.id);
        await this.processPage(page, transformer, config);
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
  private async processPage(
    page: Page,
    transformer: MarkdownTransformer,
    config: CommandContext['config']
  ): Promise<void> {
    // Transform to markdown
    const result = await transformer.transform(page);

    // Create safe filename from title
    const filename = this.slugify(result.frontMatter.title);
    
    // Build original page URL
    const originalUrl = `${config.baseUrl}/pages/viewpage.action?pageId=${page.id}`;

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

    const mdFilepath = path.join(config.outputDir, `${filename}.md`);
    const htmlFilepath = path.join(config.outputDir, `${filename}.html`);

    // Save images if any
    if (result.images.length > 0) {
      const imagesDir = path.join(config.outputDir, 'images');
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
