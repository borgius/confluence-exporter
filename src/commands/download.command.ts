/**
 * Download command handler - Downloads HTML pages from _queue.yaml
 */

import { promises as fs } from 'fs';
import path from 'path';
import prettier from 'prettier';
import yaml from 'yaml';
import { ConfluenceApi } from '../api.js';
import { slugify } from '../utils.js';
import type { ConfluenceConfig, Page, PageIndexEntry } from '../types.js';
import type { CommandContext, CommandHandler } from './types.js';

export class DownloadCommand implements CommandHandler {
  constructor(private config: ConfluenceConfig) {}
  async execute(_context: CommandContext): Promise<void> {
    const api = new ConfluenceApi(this.config);

    // Create output directory if it doesn't exist
    await fs.mkdir(this.config.outputDir, { recursive: true });

    // If pageId is specified, export only that page
    if (this.config.pageId) {
      console.log(`Downloading single page: ${this.config.pageId}`);
      console.log(`Output directory: ${this.config.outputDir}\n`);

      try {
        const page = await api.getPage(this.config.pageId);
        console.log(`Processing: ${page.title} (${page.id})`);
        await this.downloadPage(page, this.config.outputDir);
        console.log(`\n✓ Page downloaded successfully!`);
        console.log(`HTML file saved to: ${this.config.outputDir}`);
      } catch (error) {
        throw new Error(`Failed to download page ${this.config.pageId}: ${error instanceof Error ? error.message : error}`);
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

    // Download pages from queue
    console.log(`Starting download from ${path.basename(queuePath)}`);
    console.log(`Output directory: ${this.config.outputDir}\n`);

    console.log(`Phase 3: Downloading HTML pages from ${path.basename(queuePath)}...`);
    await this.downloadFromFile(queuePath, api, this.config);

    console.log(`\nDownload complete!`);
    console.log(`HTML files saved to: ${this.config.outputDir}`);
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
    // Check if _tree.yaml exists - prefer hierarchical download
    const treeYamlPath = path.join(config.outputDir, '_tree.yaml');
    let useTreeStructure = false;
    
    try {
      await fs.access(treeYamlPath);
      useTreeStructure = true;
      console.log(`Found ${path.basename(treeYamlPath)} - downloading with hierarchical structure`);
    } catch {
      console.log(`Using queue file: ${path.basename(filePath)} - flat structure`);
    }

    if (useTreeStructure) {
      // Download using tree structure
      const treeContent = await fs.readFile(treeYamlPath, 'utf-8');
      const tree = yaml.parse(treeContent) as import('../types.js').PageTreeNode[];
      
      // Create root folder with space key
      const rootDir = path.join(config.outputDir, config.spaceKey);
      await fs.mkdir(rootDir, { recursive: true });
      
      console.log(`Root directory: ${rootDir}`);
      console.log(`Space: ${config.spaceKey}\n`);
      
      let totalCount = 0;
      let successCount = 0;
      let errorCount = 0;
      
      // Recursive download from tree
      const downloadTree = async (nodes: import('../types.js').PageTreeNode[], currentDir: string, depth: number = 0): Promise<void> => {
        for (const node of nodes) {
          const indent = '  '.repeat(depth);
          totalCount++;
          
          // Check if HTML file already exists
          const filename = `${node.id}-${slugify(node.title)}`;
          const htmlFilepath = path.join(currentDir, `${filename}.html`);
          
          let htmlExists = false;
          try {
            await fs.access(htmlFilepath);
            htmlExists = true;
          } catch {
            // File doesn't exist, will download
          }
          
          if (htmlExists) {
            console.log(`${indent}[${totalCount}] Skipping (exists): ${node.title} (${node.id})`);
            successCount++;
          } else {
            console.log(`${indent}[${totalCount}] Downloading: ${node.title} (${node.id})`);
            
            try {
              // Fetch and download the page
              const page = await api.getPage(node.id);
              await this.downloadPage(page, currentDir);
              successCount++;
            } catch (error) {
              console.error(`${indent}  ✗ Failed to download ${node.title}:`, error instanceof Error ? error.message : error);
              errorCount++;
            }
          }
          
          // If node has children, create a subfolder and process children
          if (node.children && node.children.length > 0) {
            const folderName = `${node.id}-${slugify(node.title)}`;
            const childDir = path.join(currentDir, folderName);
            await fs.mkdir(childDir, { recursive: true });
            if (!htmlExists) {
              console.log(`${indent}  → Created folder: ${folderName}/ (${node.children.length} children)`);
            }
            
            // Recursively download children
            await downloadTree(node.children, childDir, depth + 1);
          }
        }
      };
      
      await downloadTree(tree, rootDir);
      
      console.log(`\n✓ Download complete!`);
      console.log(`  Success: ${successCount} pages`);
      if (errorCount > 0) {
        console.log(`  Errors: ${errorCount} pages`);
      }
      
    } else {
      // Fallback to queue-based flat download
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
        
        // Check if HTML file already exists
        const filename = `${entry.id}-${slugify(entry.title)}`;
        const htmlFilepath = path.join(config.outputDir, `${filename}.html`);
        
        let htmlExists = false;
        try {
          await fs.access(htmlFilepath);
          htmlExists = true;
        } catch {
          // File doesn't exist, will download
        }
        
        if (htmlExists) {
          console.log(`[${pageNum}/${pagesToDownload.length}] Skipping (exists): ${entry.title} (${entry.id})`);
          successCount++;
        } else {
          console.log(`[${pageNum}/${pagesToDownload.length}] Downloading: ${entry.title} (${entry.id})`);
          
          try {
            // Fetch full page with body content
            const page = await api.getPage(entry.id);
            await this.downloadPage(page, config.outputDir);
            successCount++;
          } catch (error) {
            console.error(`  ✗ Failed to download ${entry.title}:`, error instanceof Error ? error.message : error);
            errorCount++;
          }
        }
      }
      
      console.log(`\n✓ Download complete!`);
      console.log(`  Success: ${successCount} pages`);
      if (errorCount > 0) {
        console.log(`  Errors: ${errorCount} pages`);
      }
    }
  }

  /**
   * Download and save a single page as HTML
   * @param page - Page to download
   * @param targetDir - Target directory to save the page
   */
  private async downloadPage(
    page: Page,
    targetDir: string
  ): Promise<void> {
    // Create safe filename from title with page ID prefix
    const filename = `${page.id}-${slugify(page.title)}`;
    const htmlFilepath = path.join(targetDir, `${filename}.html`);

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
