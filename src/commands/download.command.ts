/**
 * Download command handler - Downloads HTML pages from _queue.yaml
 */

import { promises as fs } from 'fs';
import path from 'path';
import prettier from 'prettier';
import yaml from 'yaml';
import { ConfluenceApi } from '../api.js';
import { slugify } from '../utils.js';
import type { Page, PageIndexEntry } from '../types.js';
import type { CommandContext, CommandHandler } from './types.js';

export class DownloadCommand implements CommandHandler {
  async execute(context: CommandContext): Promise<void> {
    const { config } = context;
    const api = new ConfluenceApi(config);

    // Create output directory if it doesn't exist
    await fs.mkdir(config.outputDir, { recursive: true });

    // If pageId is specified, export only that page
    if (config.pageId) {
      console.log(`Downloading single page: ${config.pageId}`);
      console.log(`Output directory: ${config.outputDir}\n`);

      try {
        const page = await api.getPage(config.pageId);
        console.log(`Processing: ${page.title} (${page.id})`);
        await this.downloadPage(page, config);
        console.log(`\n✓ Page downloaded successfully!`);
        console.log(`HTML file saved to: ${config.outputDir}`);
      } catch (error) {
        throw new Error(`Failed to download page ${config.pageId}: ${error instanceof Error ? error.message : error}`);
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

    console.log(`Phase 3: Downloading HTML pages from ${path.basename(queuePath)}...`);
    await this.downloadFromFile(queuePath, api, config);

    console.log(`\nDownload complete!`);
    console.log(`HTML files saved to: ${config.outputDir}`);
    console.log(`Run 'transform' command to convert HTML to Markdown.`);
  }

  /**
   * Download pages from queue file
   */
  private async downloadFromFile(
    filePath: string,
    api: ConfluenceApi,
    config: CommandContext['config']
  ): Promise<void> {
    // Read and parse the YAML file (array format)
    const yamlContent = await fs.readFile(filePath, 'utf-8');
    const pages = yaml.parse(yamlContent) as PageIndexEntry[];
    
    console.log(`Reading from: ${filePath}`);
    console.log(`Space: ${config.spaceKey}`);
    
    // Apply limit if specified
    const pagesToDownload = config.limit ? pages.slice(0, config.limit) : pages;
    
    console.log(`Total pages to download: ${pagesToDownload.length}`);
    if (config.limit && pages.length > config.limit) {
      console.log(`Limiting to first ${config.limit} pages (out of ${pages.length} total)\n`);
    } else {
      console.log();
    }
    
    let successCount = 0;
    let errorCount = 0;
    
    // Process each page from the file
    for (let i = 0; i < pagesToDownload.length; i++) {
      const entry = pagesToDownload[i];
      const pageNum = i + 1;
      
      console.log(`[${pageNum}/${pagesToDownload.length}] Downloading: ${entry.title} (${entry.id})`);
      
      try {
        // Fetch full page with body content
        const page = await api.getPage(entry.id);
        await this.downloadPage(page, config);
        successCount++;
      } catch (error) {
        console.error(`  ✗ Failed to download ${entry.title}:`, error instanceof Error ? error.message : error);
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
   * Download and save a single page as HTML
   */
  private async downloadPage(
    page: Page,
    config: CommandContext['config']
  ): Promise<void> {
    // Create safe filename from title with page ID prefix
    const filename = `${page.id}-${slugify(page.title)}`;
    const htmlFilepath = path.join(config.outputDir, `${filename}.html`);

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
      console.log(`  ✓ Downloaded: ${page.title} (${page.id})`);
    } catch {
      // If formatting fails, save unformatted HTML
      console.warn(`  ⚠ Could not format HTML, saving unformatted`);
      await fs.writeFile(htmlFilepath, page.body, 'utf-8');
      console.log(`  ✓ Saved: ${filename}.html`);
    }
  }
}
