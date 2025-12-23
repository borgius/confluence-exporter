/**
 * Transform command handler - Transforms HTML files to Markdown
 */

import { promises as fs } from 'fs';
import path from 'path';
import prettier from 'prettier';
import { htmlToMarkdown } from "webforai";
import { ConfluenceApi } from '../api.js';
import { pagePath, slugify, unslugify } from '../utils.js';
import type { Page } from '../types.js';
import { logger } from '../logger.js';
import type { CommandContext, CommandHandler } from './types.js';
import type { ConfluenceConfig } from '../types.js';

interface TreeNode {
  name: string;
  children: { [key: string]: TreeNode };
  files: Array<{ name: string; relativePath: string }>;
}

export class TransformCommand implements CommandHandler {
  private pendingIncludes: Array<{ placeholder: string; content: string }> = [];
  private api!: ConfluenceApi;
  constructor(private config: ConfluenceConfig) {
  }
  async execute(_context: CommandContext): Promise<void> {
    this.api = new ConfluenceApi(this.config);

    logger.info(`Transforming HTML files to Markdown...`);
    logger.info(`Output directory: ${this.config.outputDir}\n`);

    // Clear existing MD files and images if --clear flag is set
    if (this.config.clear) {
      logger.info('Clearing existing .md files and images folders...');
      await this.clearExistingFiles(this.config.outputDir);
      logger.info('✓ Cleared existing files\n');
    }

    let transformedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const htmlFiles: string[] = [];

    if (this.config.pageId) {
      logger.info(`Processing specific page: ${this.config.pageId}\n`);
      const pageHtmlPath = pagePath(this.config.pageId, this.config);
      logger.info(`HTML path: ${pageHtmlPath}\n`);
      htmlFiles.push(pageHtmlPath);
    } else {

      // Helper function to recursively find HTML files
      const findHtmlFiles = async (dir: string, fileList: string[] = []): Promise<string[]> => {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !entry.name.startsWith('_') && entry.name !== 'images') {
            // Recursively search subdirectories (skip _index, _queue, etc. and images folder)
            await findHtmlFiles(fullPath, fileList);
          } else if (entry.isFile() && entry.name.endsWith('.html') && !entry.name.startsWith('_')) {
            fileList.push(fullPath);
          }
        }

        return fileList;
      };

      // Find all HTML files recursively
      htmlFiles.push(...await findHtmlFiles(this.config.outputDir));
    }
    if (htmlFiles.length === 0) {
      logger.info('No HTML files found to transform.');
      logger.info('Run the "download" command first to download HTML pages.');
      return;
    }

    // Apply limit if specified
    const filesToProcess = this.config.limit ? htmlFiles.slice(0, this.config.limit) : htmlFiles;

    logger.info(`Found ${htmlFiles.length} HTML files`);
    if (this.config.limit && htmlFiles.length > this.config.limit) {
      logger.info(`Limiting to first ${this.config.limit} files\n`);
    } else {
      logger.info();
    }

    // Process each HTML file
    for (let i = 0; i < filesToProcess.length; i++) {
      const htmlFilepath = filesToProcess[i];
      const htmlFile = path.basename(htmlFilepath);
      const dirPath = path.dirname(htmlFilepath);
      const baseFilename = htmlFile.replace('.html', '');
      const mdFilename = `${baseFilename}.md`;
      const mdFilepath = path.join(dirPath, mdFilename);
      const id = baseFilename.split('-')[0];

      // Show relative path for better readability
      const relativePath = path.relative(this.config.outputDir, htmlFilepath);
      logger.info(`[${i + 1}/${filesToProcess.length}] Checking: ${htmlFilepath}`);
      logger.debug(`Processing file ${baseFilename} (ID: ${id})`);

      // Check if MD file already exists
      try {
        await fs.access(mdFilepath);
        if (this.config.force) {
          logger.info(`  ⚑ Force: Overwriting existing ${mdFilename}`);
          // If forcing, remove existing images folder for this page to avoid stale files
          try {
            const imagesDir = path.join(dirPath, 'images');
            await fs.rm(imagesDir, { recursive: true, force: true });
            logger.info(`  ✓ Removed existing images/ for ${baseFilename}`);
          } catch (err) {
            // Non-fatal if images removal fails
            logger.warn(`  ⚠ Could not remove images for ${baseFilename}:`, err instanceof Error ? err.message : err);
          }
        } else {
          logger.info(`  ⊘ Skipped: ${mdFilename} already exists`);
          skippedCount++;
          continue;
        }
      } catch {
        // MD file doesn't exist, proceed with transformation
      }

      try {
        logger.debug(`Reading HTML content from ${htmlFilepath}`);
        // Read HTML content
        const htmlContent = await fs.readFile(htmlFilepath, 'utf-8');
        logger.debug(`HTML content length: ${htmlContent.length} characters`);

        // Parse the title from filename (reverse slugification is lossy, but best effort)
        const title = unslugify(baseFilename);
        logger.debug(`Parsed title: "${title}"`);

        logger.debug(`Starting HTML to Markdown transformation`);
        // Transform HTML to Markdown
        const images: Array<{ filename: string; data: Buffer }> = [];
        const markdownBody = await this.htmlToMarkdown(htmlContent, id, images);
        logger.debug(`Transformation complete, markdown length: ${markdownBody.length} characters`);

        // Build original page URL (use baseUrl if available)
        const originalUrl = this.config.baseUrl
          ? `${this.config.baseUrl}/pages/viewpage.action?pageId=${id}`
          : '';
        logger.debug(`Original URL: ${originalUrl || 'none'}`);

        // Create front matter
        const frontMatter = [
          '---',
          `title: "${title.replace(/"/g, '\\"') }"`,
          `id: "${id}"`,
          originalUrl ? `url: "${originalUrl}"` : '',
          '---'
        ].filter(Boolean).join('\n');
        logger.debug(`Front matter created`);

        // Before finalizing, replace any pending include placeholders inside markdownBody
        let finalBody = markdownBody;
        logger.debug(`Processing ${this.pendingIncludes.length} pending includes`);
        for (const include of this.pendingIncludes) {
          // Replace raw placeholder
          finalBody = finalBody.replace(include.placeholder, include.content);
          // Some converters escape underscores/backslashes; also replace escaped variants
          const escaped = include.placeholder.replace(/_/g, '\\_');
          finalBody = finalBody.replace(escaped, include.content);
          // And double-escaped (e.g. \__INCLUDE_1__)
          const doubleEscaped = escaped.replace(/\\/g, '\\\\');
          finalBody = finalBody.replace(doubleEscaped, include.content);
        }
        logger.debug(`Include placeholders replaced`);

        // Combine front matter and content
        const markdownContent = `${frontMatter}\n\n${finalBody}`;
        logger.debug(`Combined content length: ${markdownContent.length} characters`);

        // Save images if any (in the same directory as the page)
        if (images.length > 0) {
          logger.debug(`Saving ${images.length} images`);
          const imagesDir = path.join(dirPath, 'images');
          await fs.mkdir(imagesDir, { recursive: true });

          for (const image of images) {
            const imagePath = path.join(imagesDir, image.filename);
            await fs.writeFile(imagePath, image.data);
          }
          logger.info(`  ✓ Saved ${images.length} image(s)`);
        } else {
          logger.debug(`No images to save`);
        }

        logger.debug(`Performing final cleanup`);
        // Final cleanup: unescape any remaining backslashes before [],() produced by converters
        let finalMarkdownToWrite = markdownContent
          // Remove escaped bracket/paren characters produced by converters (e.g. \[ \] \( \) )
          .replace(/\\([\[\]\(\)])/g, '$1');
        logger.debug(`Final markdown length: ${finalMarkdownToWrite.length} characters`);

        logger.debug(`Formatting with Prettier`);

        // Format and write markdown file
        try {
          const formattedMarkdown = await prettier.format(markdownContent, {
            parser: 'markdown',
            printWidth: 120,
            proseWrap: 'preserve',
            tabWidth: 2,
            useTabs: false
          });
          // Prefer the prettier-formatted version of cleaned content
          const formatted = await prettier.format(finalMarkdownToWrite, {
            parser: 'markdown',
            printWidth: 120,
            proseWrap: 'preserve',
            tabWidth: 2,
            useTabs: false
          });
          logger.debug(`Writing formatted markdown to ${mdFilepath}`);
          await fs.writeFile(mdFilepath, formatted, 'utf-8');
          logger.info(`  ✓ Transformed: ${mdFilename} (formatted)`);
        } catch {
          // If formatting fails, save unformatted markdown
          logger.warn(`  ⚠ Could not format Markdown, saving unformatted`);
          logger.debug(`Writing unformatted markdown to ${mdFilepath}`);
          await fs.writeFile(mdFilepath, finalMarkdownToWrite, 'utf-8');
          logger.info(`  ✓ Transformed: ${mdFilename}`);
        }

        transformedCount++;
      } catch (error) {
        logger.error(`  ✗ Failed to transform ${htmlFile}:`, error instanceof Error ? error.message : error);
        errorCount++;
      }
    }

    logger.info(`\n✓ Transformation complete!`);
    logger.info(`  Transformed: ${transformedCount} files`);
    logger.info(`  Skipped: ${skippedCount} files (MD already exists)`);
    if (errorCount > 0) {
      logger.info(`  Errors: ${errorCount} files`);
    }

    // Create links folder and _links.md file
    logger.info('\nCreating links folder and _links.md file...');
    await this.createLinksStructure(this.config.outputDir);
    logger.info('✓ Links structure created');
  }

  /**
   * Basic HTML to Markdown conversion
   */
  private async htmlToMarkdown(html: string, pageId: string, images: Array<{ filename: string; data: Buffer }>): Promise<string> {
    let markdown = html;

    // Preprocess: convert lists inside table cells to inline text to avoid breaking Markdown tables
    // Convert <td>...<ul><li>Item</li>...</ul>...</td> -> <td>...• Item; Item; ...</td>
    try {
      markdown = markdown.replace(/<td([^>]*)>([\s\S]*?)<\/td>/gi, (full, attrs, inner) => {
        // If there are list tags inside, replace them with inline bullets separated by semicolons
        if (/<ul[^>]*>|<ol[^>]*>/i.test(inner)) {
          // Extract list items
          const items: string[] = [];
          const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
          for (const m of Array.from(inner.matchAll(liRegex))) {
            let item = m[1] || '';
            // Strip tags inside li
            item = item.replace(/<[^>]+>/g, '').trim();
            if (item) items.push(item);
          }

          if (items.length > 0) {
            const replacement = items.map(i => `• ${i}`).join('; ');
            // Remove the original lists from inner and append the inline replacement
            const cleanedInner = inner.replace(/<ul[^>]*>[\s\S]*?<\/ul>/gi, '').replace(/<ol[^>]*>[\s\S]*?<\/ol>/gi, '').trim();
            const spacer = cleanedInner && !cleanedInner.endsWith(' ') ? ' ' : '';
            return `<td${attrs}>${cleanedInner}${spacer}${replacement}</td>`;
          }
        }
        return full;
      });
    } catch (e) {
      // Non-fatal: if preprocessing fails, continue without it
      logger.warn('List-in-table preprocessing failed:', e instanceof Error ? e.message : e);
    }

    // Transform macros to markdown equivalents (with data fetching)
    markdown = await this.transformMacros(markdown, pageId);

    // Transform user links first (before removing ac:link)
    markdown = await this.transformUserLinks(markdown);

    // Transform page links to HTML anchor tags (will be converted to MD links later)
    markdown = await this.transformPageLinks(markdown);

    // Transform images and download attachments
    markdown = await this.transformImages(markdown, pageId, images);

    logger.debug(`Reving layout, time, and other elements`);
    // Remove layout structure tags (they don't add value in markdown)
    markdown = markdown.replace(/<\/?ac:layout[^>]*>/gi, '');
    markdown = markdown.replace(/<\/?ac:layout-section[^>]*>/gi, '\n\n');
    markdown = markdown.replace(/<\/?ac:layout-cell[^>]*>/gi, '\n\n');

    // Time elements
    markdown = markdown.replace(/<time[^>]*datetime="([^"]+)"[^>]*\/?>.*?/gi, '$1');

    logger.debug(`Converting HTML to Markdown using webforai`);
    markdown = htmlToMarkdown(markdown);

    // Trim whitespace in Markdown table cells
    markdown = markdown.replace(/^\|(.+)\|$/gm, (line) => {
      const parts = line.split('|');
      const trimmedParts = parts.map(part => part.trim());
      return trimmedParts.join('|');
    });

    logger.debug(`Post-processing Markdown content (Pending includes, links, cleanup)`);
    // Replace include placeholders with actual content (handle escaped variants)
    for (const include of this.pendingIncludes) {
      // raw
      markdown = markdown.replace(include.placeholder, include.content);
      // escaped underscores (e.g. \_\_INCLUDE_1\_\_)
      const escaped = include.placeholder.replace(/_/g, '\\_');
      markdown = markdown.replace(escaped, include.content);
      // double-escaped (e.g. \\\_\\\_INCLUDE_1\\\_\\\_)
      const doubleEscaped = escaped.replace(/\\/g, '\\\\');
      markdown = markdown.replace(doubleEscaped, include.content);
    }
    this.pendingIncludes = [];
    logger.debug(`Pending includes processed`);
    // Restore page links that were escaped by htmlToMarkdown
    // Pattern: \[Title\](url.md) -> [Title](url.md)
    markdown = markdown.replace(/\\?\[([^\]]+)\\?\]\\?\(([^)]+\.md)\\?\)/g, '[$1]($2)');

    // Unescape image and link bracket escaping produced by converters
    // Example: !\[image.png\]\(images/image.png\) -> ![image.png](images/image.png)
    markdown = markdown.replace(/!\\\[([^\]]+)\\\]\(\s*([^\)]+)\s*\)/g, '![$1]($2)');
    markdown = markdown.replace(/\\\[([^\]]+)\\\]\(\s*([^\)]+)\s*\)/g, '[$1]($2)');

    // Remove remaining ac:link elements
    markdown = markdown.replace(/<ac:link[^>]*>[\s\S]*?<\/ac:link>/g, '');

    logger.debug(`Converting headers`);
    // Headers
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n');
    markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n##### $1\n');
    markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n###### $1\n');

    logger.debug(`Converting text formatting`);
    // Bold and italic
    markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

    // Links
    logger.debug(`Converting links`);
    markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

    // Lists
    logger.debug(`Converting lists`);
    markdown = markdown.replace(/<ul[^>]*>/gi, '\n');
    markdown = markdown.replace(/<\/ul>/gi, '\n');
    markdown = markdown.replace(/<ol[^>]*>/gi, '\n');
    markdown = markdown.replace(/<\/ol>/gi, '\n');
    markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');

    // Paragraphs
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');

    // Code blocks
    markdown = markdown.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n');
    markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');

    // Line breaks
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');

    // Remove remaining HTML tags
    logger.debug(`Removing remaining HTML tags`);
    markdown = markdown.replace(/<[^>]+>/g, '');

    // Clean up HTML entities
    markdown = markdown.replace(/&nbsp;/g, ' ');
    markdown = markdown.replace(/&amp;/g, '&');
    markdown = markdown.replace(/&lt;/g, '<');
    markdown = markdown.replace(/&gt;/g, '>');
    markdown = markdown.replace(/&quot;/g, '"');

    // Clean up extra whitespace
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    markdown = markdown.trim();

    // Apply markdown cleanup to remove malformed patterns
    logger.debug(`Cleaning up markdown`);
    markdown = this.cleanMarkdown(markdown);

    return markdown;
  }

  /**
   * Transform images and download attachments
   */
  private async transformImages(content: string, pageId: string, images: Array<{ filename: string; data: Buffer }>): Promise<string> {
    let result = content;

    // Match image attachments: <ac:image><ri:attachment ri:filename="..." /></ac:image>
    const imageRegex = /<ac:image[^>]*><ri:attachment[^>]*ri:filename="([^"]+)"[^>]*\/><\/ac:image>/gi;
    const imageMatches = Array.from(content.matchAll(imageRegex));

    for (const match of imageMatches) {
      const originalFilename = match[1];
      logger.debug(`Processing image attachment: ${originalFilename}`);

      // Extract extension and slugify the base name
      const lastDotIndex = originalFilename.lastIndexOf('.');
      const extension = lastDotIndex > 0 ? originalFilename.slice(lastDotIndex) : '';
      const baseName = lastDotIndex > 0 ? originalFilename.slice(0, lastDotIndex) : originalFilename;
      const slugifiedFilename = slugify(baseName) + extension;

      let replacement = `![${originalFilename}](images/${slugifiedFilename})`;

      // Download the image if API is available
      if (this.api) {
        try {
          // Try downloading with original filename first (Confluence API may handle encoding internally)
          let imageData = await this.api.downloadAttachment(pageId, originalFilename);

          // If that fails, try with URL-encoded filename
          if (!imageData) {
            const encodedImageName = encodeURIComponent(originalFilename);
            imageData = await this.api.downloadAttachment(pageId, encodedImageName);
          }

          if (imageData) {
            images.push({ filename: slugifiedFilename, data: imageData });
            logger.info(`  ✓ Downloaded image: ${originalFilename} -> ${slugifiedFilename}`);
          } else {
            // Image might be on a different page or not exist
            logger.warn(`  ⚠ Image not found on this page: ${originalFilename} (may be on parent/child page)`);
            replacement = `![${originalFilename}](images/${slugifiedFilename})`;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('404')) {
            logger.warn(`  ⚠ Image not attached to this page: ${originalFilename}`);
          } else {
            logger.warn(`  ⚠ Error downloading image ${originalFilename}:`, errorMessage);
          }
          // Keep the reference but mark as missing
          replacement = `![${originalFilename}](images/${slugifiedFilename})`;
        }
      }

      logger.debug(`Replacing image tag with markdown: ${replacement}`);
      result = result.replace(match[0], replacement);
    }
    logger.debug(`Processed inline <img> tags that reference /download/attachments/...`);

    // Also handle inline <img> tags that reference /download/attachments/... with optional data-linked-resource-container-id
    // Example: <img class="confluence-embedded-image" src="/download/attachments/715168874/image.png?version=1&api=v2" data-linked-resource-container-id="715168874" />
    const inlineImgRegex = /<img[^>]*src="([^"]*\/download\/attachments\/[^"\s]+)"[^>]*>/gi;
    const inlineImgMatches = Array.from(content.matchAll(inlineImgRegex));

    logger.debug(`Found ${inlineImgMatches.length} inline <img> tags with /download/attachments/ URLs`);

    for (const match of inlineImgMatches) {
      const src = match[1];
      logger.debug(`Processing inline image src: ${src}`);

      // Try to extract filename from URL path
      let filename = src.split('/').pop() || 'image';
      // Strip query params if present
      filename = filename.split('?')[0];

      // Try to extract container id from the tag using a secondary regex on the original match
      const fullTag = match[0];
      const containerIdMatch = fullTag.match(/data-linked-resource-container-id="([^"<>]+)"/i);
      const containerId = containerIdMatch ? containerIdMatch[1] : pageId;

      const lastDotIndex = filename.lastIndexOf('.');
      const extension = lastDotIndex > 0 ? filename.slice(lastDotIndex) : '';
      const baseName = lastDotIndex > 0 ? filename.slice(0, lastDotIndex) : filename;
      const slugifiedFilename = slugify(baseName) + extension;

      let replacement = `![${filename}](images/${slugifiedFilename})`;

      if (this.api) {
        try {
          logger.debug(`Downloading inline image from container ${containerId} with filename ${filename}`);
          // The API expects the filename as-is; try original filename first
          let imageData = await this.api.downloadAttachment(containerId, filename);

          // Fallback: try URL-decoded filename
          if (!imageData) {
            const decoded = decodeURIComponent(filename);
            if (decoded !== filename) {
              imageData = await this.api.downloadAttachment(containerId, decoded);
            }
          }

          // Another fallback: try removing any appended tokens (some Confluence instances append ids)
          if (!imageData) {
            const simpleName = filename.replace(/^[^a-z0-9]+/i, '').split(/[^a-z0-9.\-_]/i)[0];
            if (simpleName && simpleName !== filename) {
              imageData = await this.api.downloadAttachment(containerId, simpleName);
            }
          }

          if (imageData) {
            images.push({ filename: slugifiedFilename, data: imageData });
            logger.info(`  ✓ Downloaded inline image: ${filename} -> ${slugifiedFilename}`);
          } else {
            logger.warn(`  ⚠ Inline image not downloaded: ${filename} (container ${containerId})`);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          logger.warn(`  ⚠ Error downloading inline image ${filename}:`, errorMessage);
        }
      }

      result = result.replace(match[0], replacement);
    }
    logger.debug(`Completed processing inline <img> tags`);
    return result;
  }

  /**
   * Build a Markdown list from an included page's HTML content.
   * Prefer extracting <ul>/<ol> list items and anchor links; fall back to full page transform.
   */
  private async buildIncludeList(page: Page, title: string): Promise<string> {
    try {
      const html = page.body || '';

      // Extract list items inside <ul> or <ol>
      const listRegex = /<ul[^>]*>([\s\S]*?)<\/ul>/i;
      const listMatch = html.match(listRegex);
      if (listMatch) {
        const itemsHtml = listMatch[1];
        const itemRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
        const items: string[] = [];
        for (const m of Array.from(itemsHtml.matchAll(itemRegex))) {
          let item = m[1].trim();
          // Convert <a href> to markdown
          item = item.replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
          // Strip remaining tags
          item = item.replace(/<[^>]+>/g, '').trim();
          items.push(`- ${item}`);
        }
        if (items.length > 0) {
          return `\n\n## ${title}\n\n${items.join('\n')}\n\n`;
        }
      }

      // If no lists found, look for anchor links
      const anchorRegex = /<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
      const anchors = Array.from(html.matchAll(anchorRegex));
      if (anchors.length > 0) {
        const items = anchors.map(a => `- [${a[2].replace(/<[^>]+>/g, '').trim()}](${a[1]})`);
        return `\n\n## ${title}\n\n${items.join('\n')}\n\n`;
      }

      // Fall back to full-page transform
      const full = await this.htmlToMarkdown(html, page.id || title, []);
      return `\n\n## ${title}\n\n${full}\n\n`;
    } catch (error) {
      logger.warn(`Failed to build include list for ${title}:`, error);
      return `\n\n## ${title}\n\n<!-- failed to include content -->\n\n`;
    }
  }

  /**
   * Transform Confluence macros to Markdown
   */
  private async transformMacros(content: string, pageId: string): Promise<string> {
    let result = content;

    // Handle children macro - fetch child pages of specified page or current page
    const childrenRegex = /<ac:structured-macro[^>]*ac:name="children"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gis;
    const childrenMatches = Array.from(content.matchAll(childrenRegex));

    for (const match of childrenMatches) {
      let replacement = '<!-- Child Pages -->\n\n';
      const macroContent = match[1];

      if (this.api) {
        try {
          // Check if there's a page parameter
          const pageParamMatch = macroContent.match(/ri:content-title="([^"]+)"/i);
          let targetPageId = pageId;
          let targetTitle = '';

          if (pageParamMatch) {
            targetTitle = pageParamMatch[1];
            // Try to find the page by title
            const targetPage = await this.api.getPageByTitle(this.config.spaceKey, targetTitle);
            if (targetPage) {
              targetPageId = targetPage.id;
            }
          }

          const childPages = await this.api.getChildPages(targetPageId);
          if (childPages.length > 0) {
            replacement = childPages.map(child => `- [${child.title}](${slugify(child.title)}.md)`).join('\n') + '\n\n';
          }
        } catch (error) {
          logger.warn(`Failed to fetch child pages:`, error);
        }
      }

      result = result.replace(match[0], replacement);
    }

    // Handle list-children macro - fetch actual child pages
    const listChildrenRegex = /<ac:structured-macro[^>]*ac:name="list-children"[^>]*(?:\/>|>.*?<\/ac:structured-macro>)/gis;
    const listChildrenMatches = Array.from(result.matchAll(listChildrenRegex));

    for (const match of listChildrenMatches) {
      let replacement = '<!-- Child Pages List -->\n\n';

      if (this.api) {
        try {
          const childPages = await this.api.getChildPages(pageId);
          if (childPages.length > 0) {
            replacement = childPages.map(child => `- [${child.title}](${slugify(child.title)}.md)`).join('\n') + '\n\n';
          }
        } catch (error) {
          logger.warn(`Failed to fetch child pages for ${pageId}:`, error);
        }
      }

      result = result.replace(match[0], replacement);
    }

    // Handle include macro - fetch content from included page
    const includeRegex = /<ac:structured-macro[^>]*ac:name="include"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gis;
    const includeMatches = Array.from(result.matchAll(includeRegex));

    for (const match of includeMatches) {
      const macroContent = match[1];
      const titleMatch = macroContent.match(/ri:content-title="([^"]+)"/i);
      
      if (titleMatch && this.api) {
        const includeTitle = titleMatch[1];
        try {
          let includedPage: Page | null;
          if (includeTitle === "FCS Useful Links") {
            // Hardcode the pageId for FCS Useful Links
            includedPage = await this.api.getPage("167810724");
          } else {
            includedPage = await this.api.getPageByTitle(this.config.spaceKey, includeTitle);
          }
          if (includedPage && includedPage.body) {
            // Build a concise Markdown list from the included page using the API
            const listMd = await this.buildIncludeList(includedPage, includeTitle);

            // Generate a unique placeholder per include to avoid collisions
            const placeholder = `__INCLUDE_${this.pendingIncludes.length + 1}__`;

            // Replace macro with placeholder and remember the content for later
            result = result.replace(match[0], placeholder);
            this.pendingIncludes.push({ placeholder, content: listMd });
          } else {
            result = result.replace(match[0], `<!-- Include: ${includeTitle} (page not found) -->\n\n`);
          }
        } catch (error) {
          logger.warn(`Failed to fetch included page "${includeTitle}":`, error);
          result = result.replace(match[0], `<!-- Include: ${includeTitle} (error) -->\n\n`);
        }
      } else {
        result = result.replace(match[0], '<!-- Include macro -->\n\n');
      }
    }
    // Preserve table-like macros: extract the inner rich-text-body so HTML tables
    // inside macros (e.g. table-filter) are retained and later converted to Markdown.
    result = result.replace(/<ac:structured-macro[^>]*ac:name="(?:table|table-filter)"[^>]*>[\s\S]*?<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>[\s\S]*?<\/ac:structured-macro>/gis, '$1\n\n');

    // Apply other macro transformations
    result = result
      // Code blocks with language
      .replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>.*?<ac:parameter[^>]*ac:name="language"[^>]*>(.*?)<\/ac:parameter>.*?<ac:plain-text-body><!\[CDATA\[(.*?)\]\]><\/ac:plain-text-body>.*?<\/ac:structured-macro>/gis, '```$1\n$2\n```\n\n')
      // Code blocks without language
      .replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>.*?<ac:plain-text-body><!\[CDATA\[(.*?)\]\]><\/ac:plain-text-body>.*?<\/ac:structured-macro>/gis, '```\n$1\n```\n\n')
      // Info panels
      /* Replace info macro with a concise inline marker using the macro title and body.
         Desired output example:
         [i] Here you will find
         <body content...>
      */
      .replace(/<ac:structured-macro[^>]*ac:name="info"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gis, (_match, inner) => {
        try {
          // Extract title parameter if present
          const titleMatch = inner.match(/<ac:parameter[^>]*ac:name="title"[^>]*>([\s\S]*?)<\/ac:parameter>/i);
          const title = titleMatch ? titleMatch[1].trim() : '';

          // Extract rich-text-body content
          const bodyMatch = inner.match(/<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>/i);
          const body = bodyMatch ? bodyMatch[1].trim() : '';

          const titleLine = title ? `[i] ${title}\n\n` : '';

          // Return title marker plus body (body will be further transformed later)
          return `${titleLine}${body}\n\n`;
        } catch (e) {
          return '<!-- Info macro -->\n\n';
        }
      })
      // Warning panels
      .replace(/<ac:structured-macro[^>]*ac:name="warning"[^>]*>.*?<ac:rich-text-body>(.*?)<\/ac:rich-text-body>.*?<\/ac:rich-text-body>.*?<\/ac:structured-macro>/gis, '> **Warning:** $1\n\n')
      // Note panels
      .replace(/<ac:structured-macro[^>]*ac:name="note"[^>]*>.*?<ac:rich-text-body>(.*?)<\/ac:rich-text-body>.*?<\/ac:structured-macro>/gis, '> **Note:** $1\n\n')
      // Panel macro - extract content
      .replace(/<ac:structured-macro[^>]*ac:name="panel"[^>]*>.*?<ac:rich-text-body>(.*?)<\/ac:rich-text-body>.*?<\/ac:structured-macro>/gis, '$1\n\n')
      // Excerpt macro - extract content
      .replace(/<ac:structured-macro[^>]*ac:name="excerpt"[^>]*>.*?<ac:rich-text-body>(.*?)<\/ac:rich-text-body>.*?<\/ac:structured-macro>/gis, '$1\n\n')
      // Table of contents
      .replace(/<ac:structured-macro[^>]*ac:name="toc"[^>]*(?:\/>|>.*?<\/ac:structured-macro>)/gis, '<!-- Table of Contents -->\n\n')
      // Content by label
      .replace(/<ac:structured-macro[^>]*ac:name="contentbylabel"[^>]*(?:\/>|>.*?<\/ac:structured-macro>)/gis, '<!-- Content by Label -->\n\n')
      // Livesearch macro
      .replace(/<ac:structured-macro[^>]*ac:name="livesearch"[^>]*(?:\/>|>.*?<\/ac:structured-macro>)/gis, '<!-- Live Search -->\n\n')
      // Jira macro
      .replace(/<ac:structured-macro[^>]*ac:name="jira"[^>]*(?:\/>|>.*?<\/ac:structured-macro>)/gis, '<!-- Jira Issues -->\n\n')
      // Recently updated macro
      .replace(/<ac:structured-macro[^>]*ac:name="recently-updated"[^>]*(?:\/>|>.*?<\/ac:structured-macro>)/gis, '<!-- Recently Updated Pages -->\n\n')
      // Popular labels macro
      .replace(/<ac:structured-macro[^>]*ac:name="popular-labels"[^>]*(?:\/>|>.*?<\/ac:structured-macro>)/gis, '<!-- Popular Labels -->\n\n')
      // Other macros - convert to comments
      .replace(/<ac:structured-macro[^>]*ac:name="([^"]*)"[^>]*(?:\/>|>.*?<\/ac:structured-macro>)/gis, '<!-- Confluence Macro: $1 -->\n\n');

    return result;
  }

  /**
   * Transform user links to display names
   */
  private async transformUserLinks(html: string): Promise<string> {
    if (!this.api) {
      // If no API provided, just remove user links
      return html.replace(/<ac:link[^>]*><ri:user[^>]*\/><\/ac:link>/g, '@unknown-user');
    }

    let result = html;

    // Match user links by username
    const usernameRegex = /<ac:link[^>]*><ri:user[^>]*ri:username="([^"]+)"[^>]*\/><\/ac:link>/gi;
    const usernameMatches = Array.from(html.matchAll(usernameRegex));

    for (const match of usernameMatches) {
      const username = match[1];
      const user = await this.api.getUserByUsername(username);

      if (user) {
        result = result.replace(match[0], `@${user.displayName}`);
      } else {
        result = result.replace(match[0], `@${username}`);
      }
    }

    // Match user links by userkey
    const userkeyRegex = /<ac:link[^>]*><ri:user[^>]*ri:userkey="([^"]+)"[^>]*\/><\/ac:link>/gi;
    const userkeyMatches = Array.from(result.matchAll(userkeyRegex));

    for (const match of userkeyMatches) {
      const userKey = match[1];
      const user = await this.api.getUserByKey(userKey);

      if (user) {
        result = result.replace(match[0], `@${user.displayName}`);
      } else {
        result = result.replace(match[0], `@user-${userKey.slice(-8)}`);
      }
    }

    return result;
  }

  /**
   * Transform page links to markdown links
   */
  private async transformPageLinks(html: string): Promise<string> {
    let result = html;

    // Match page links by content title - various formats
    // Format 1: <ac:link><ri:page ri:content-title="Title" /></ac:link>
    const pageLinkRegex1 = /<ac:link[^>]*>\s*<ri:page[^>]*ri:content-title="([^"]+)"[^>]*\/>\s*<\/ac:link>/gi;
    const matches1 = Array.from(html.matchAll(pageLinkRegex1));

    for (const match of matches1) {
      const title = match[1];
      const link = `[${title}](${slugify(title)}.md)`;
      result = result.replace(match[0], link);
    }

    // Format 2: Just <ri:page ri:content-title="Title" /> without ac:link wrapper
    const pageLinkRegex2 = /<ri:page[^>]*ri:content-title="([^"]+)"[^>]*\/>/gi;
    const matches2 = Array.from(result.matchAll(pageLinkRegex2));

    for (const match of matches2) {
      const title = match[1];
      const link = `[${title}](${slugify(title)}.md)`;
      result = result.replace(match[0], link);
    }

    return result;
  }

  /**
   * Clean up malformed markdown patterns
   */
  private cleanMarkdown(markdown: string): string {
    let cleaned = markdown;

    // First pass: clean confluence-specific patterns
    logger.debug('Cleaning Confluence-specific markdown patterns');
    cleaned = this.cleanConfluencePatterns(cleaned);

    // Second pass: general cleanup
    logger.debug('Cleaning general markdown patterns');
    cleaned = this.cleanGeneral(cleaned);

    // Third pass: another round of confluence patterns to catch any new issues
    logger.debug('Cleaning Confluence-specific markdown patterns (second pass)');
    cleaned = this.cleanConfluencePatterns(cleaned);

    // Final cleanup of excessive whitespace
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
    cleaned = cleaned.trim() + '\n';

    logger.debug('Final cleanup of excessive whitespace');
    return cleaned;
  }

  /**
   * Clean up specific problematic patterns that appear in Confluence exports
   */
  private cleanConfluencePatterns(markdown: string): string {
    let cleaned = markdown;

    // Remove standalone bold markers that are not part of content
    // This handles cases like "**\n\n**" or "** **"
    cleaned = cleaned.replace(/\*\*\s*\n\s*\n\s*\*\*/g, '');

    // Remove lines that only contain **
    cleaned = cleaned.replace(/^\s*\*\*\s*$/gm, '');

    // Remove empty headers (headers with no content)
    cleaned = cleaned.replace(/^#+\s*$/gm, '');

    // Remove bold markers around only whitespace
    cleaned = cleaned.replace(/\*\*\s+\*\*/g, ' ');

    // Remove italic markers around only whitespace
    cleaned = cleaned.replace(/\*\s+\*/g, ' ');

    // Clean up malformed blockquotes
    cleaned = cleaned.replace(/^>\s*$/gm, '');

    // Remove empty code blocks
    cleaned = cleaned.replace(/```\s*\n\s*```/g, '');

    // Clean up malformed horizontal rules
    cleaned = cleaned.replace(/^[-*_]\s*$/gm, '');

    return cleaned;
  }

  /**
   * General markdown cleanup
   */
  private cleanGeneral(markdown: string): string {
    let cleaned = markdown;

    // Remove empty headers with just bold/italic markers (no content between them)
    // Match: ## ** or ## * (at end of line)
    logger.debug('Removing empty headers with only formatting markers');
    cleaned = cleaned.replace(/^#+\s*\*\*\s*$/gm, '');
    cleaned = cleaned.replace(/^#+\s*\*\s*$/gm, '');
    cleaned = cleaned.replace(/^#+\s*__\s*$/gm, '');
    cleaned = cleaned.replace(/^#+\s*_\s*$/gm, '');

    // Remove headers that only contain bold/italic markers across multiple lines
    // Example: ## **\n\n** (with only whitespace between)
    logger.debug('Removing headers with only formatting markers across multiple lines');
    cleaned = cleaned.replace(/^(#+)\s*\*\*\s*\n+\s*\*\*\s*$/gm, '');
    cleaned = cleaned.replace(/^(#+)\s*\*\s*\n+\s*\*\s*$/gm, '');

    // Remove empty bold markers (no content or only whitespace between)
    logger.debug('Removing empty bold markers');
    cleaned = cleaned.replace(/\*\*\s*\*\*/g, '');
    cleaned = cleaned.replace(/__\s*__/g, '');

    // Remove standalone italic markers on their own line
    logger.debug('Removing standalone italic markers on their own line');
    cleaned = cleaned.replace(/^\s*\*\s*$/gm, '');
    cleaned = cleaned.replace(/^\s*_\s*$/gm, '');

    // Remove empty italic markers that span multiple lines (only if truly empty)
    logger.debug('Removing empty italic markers that span multiple lines'); 
    cleaned = cleaned.replace(/\*\s*\n+\s*\*/g, '\n\n');

    // Remove empty links
    logger.debug('Removing empty links');
    cleaned = cleaned.replace(/\[\s*\]\(\s*\)/g, '');

    // Remove empty list items
    logger.debug('Removing empty list items');
    cleaned = cleaned.replace(/^[-*+]\s*$/gm, '');

    // Clean up excessive blank lines (more than 3 consecutive)
    logger.debug('Cleaning up excessive blank lines');
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');

    // Remove trailing whitespace from each line
    logger.debug('Removing trailing whitespace from each line');
    cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');

    // Ensure single trailing newline at end of file
    logger.debug('Ensuring single trailing newline at end of file');
    cleaned = cleaned.trim() + '\n';

    return cleaned;
  }

  /**
   * Create links folder with symlinks and _links.md with tree structure
   */
  private async createLinksStructure(outputDir: string): Promise<void> {
    const linksDir = path.join(outputDir, 'links');

    // Remove existing links folder if it exists
    try {
      await fs.rm(linksDir, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }

    // Create fresh links folder
    await fs.mkdir(linksDir, { recursive: true });

    // Find all MD files recursively
    const findMdFiles = async (dir: string, fileList: Array<{ path: string; relativePath: string }> = []): Promise<Array<{ path: string; relativePath: string }>> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory() && !entry.name.startsWith('_') && entry.name !== 'images' && entry.name !== 'links') {
          await findMdFiles(fullPath, fileList);
        } else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
          const relativePath = path.relative(outputDir, fullPath);
          fileList.push({ path: fullPath, relativePath });
        }
      }

      return fileList;
    };

    const mdFiles = await findMdFiles(outputDir);

    // Create symlinks in links folder
    for (const file of mdFiles) {
      const linkName = path.basename(file.path);
      const linkPath = path.join(linksDir, linkName);
      const targetPath = path.relative(linksDir, file.path);

      try {
        await fs.symlink(targetPath, linkPath);
      } catch (error) {
        logger.warn(`  ⚠ Failed to create symlink for ${linkName}:`, error instanceof Error ? error.message : error);
      }
    }

    logger.info(`  ✓ Created ${mdFiles.length} symlinks in links/`);

    // Build tree structure for _links.md
    const tree = this.buildFileTree(mdFiles);
    const treeMarkdown = this.generateTreeMarkdown(tree, outputDir);

    // Write _links.md
    const linksFilePath = path.join(outputDir, '_links.md');
    const linksContent = `# Documentation Links\n\n${treeMarkdown}`;

    try {
      const formattedContent = await prettier.format(linksContent, {
        parser: 'markdown',
        printWidth: 120,
        proseWrap: 'preserve',
        tabWidth: 2,
        useTabs: false
      });
      await fs.writeFile(linksFilePath, formattedContent, 'utf-8');
    } catch {
      await fs.writeFile(linksFilePath, linksContent, 'utf-8');
    }

    logger.info(`  ✓ Created _links.md with tree structure`);
  }

  /**
   * Build a tree structure from flat file list
   */
  private buildFileTree(files: Array<{ path: string; relativePath: string }>): TreeNode {
    const root: TreeNode = { name: '', children: {}, files: [] };

    for (const file of files) {
      const parts = file.relativePath.split(path.sep);
      let current = root;

      // Navigate/create directory structure
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (!current.children[part]) {
          current.children[part] = { name: part, children: {}, files: [] };
        }
        current = current.children[part];
      }

      // Add file to current directory
      current.files.push({
        name: parts[parts.length - 1],
        relativePath: file.relativePath
      });
    }

    return root;
  }

  /**
   * Generate markdown tree structure
   */
  private generateTreeMarkdown(node: TreeNode, outputDir: string, level: number = 0): string {
    let result = '';
    const indent = '  '.repeat(level);

    // Sort directories and files alphabetically
    const sortedDirs = Object.keys(node.children).sort();
    const sortedFiles = node.files.sort((a, b) => a.name.localeCompare(b.name));

    // Add directories first
    for (const dirName of sortedDirs) {
      const child = node.children[dirName];
      result += `${indent}- **${dirName}/**\n`;
      result += this.generateTreeMarkdown(child, outputDir, level + 1);
    }

    // Add files
    for (const file of sortedFiles) {
      const linkPath = file.relativePath;
      result += `${indent}- [${file.name}](${linkPath})\n`;
    }

    return result;
  }

  /**
   * Recursively clear existing .md files and images folders
   */
  private async clearExistingFiles(dir: string): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (entry.name === 'images' || entry.name === 'links') {
            // Remove entire images and links folders
            await fs.rm(fullPath, { recursive: true, force: true });
            logger.info(`  Removed: ${path.relative(this.config.outputDir, fullPath)}/`);
          } else if (!entry.name.startsWith('_')) {
            // Recursively clear subdirectories (skip _index, _queue, etc.)
            await this.clearExistingFiles(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.md') && !entry.name.startsWith('_')) {
          // Remove .md files
          await fs.unlink(fullPath);
          logger.info(`  Removed: ${path.relative(this.config.outputDir, fullPath)}`);
        }
      }
    } catch (error) {
      logger.warn(`Warning: Could not clear files in ${dir}:`, error instanceof Error ? error.message : error);
    }
  }
}
