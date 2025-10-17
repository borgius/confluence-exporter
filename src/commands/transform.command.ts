/**
 * Transform command handler - Transforms HTML files to Markdown
 */

import { promises as fs } from 'fs';
import path from 'path';
import prettier from 'prettier';
import { ConfluenceApi } from '../api.js';
import { slugify, unslugify } from '../utils.js';
import type { CommandContext, CommandHandler } from './types.js';

export class TransformCommand implements CommandHandler {
  private api!: ConfluenceApi;

  async execute(context: CommandContext): Promise<void> {
    const { config } = context;
    this.api = new ConfluenceApi(config);

    console.log(`Transforming HTML files to Markdown...`);
    console.log(`Output directory: ${config.outputDir}\n`);

    // Read all HTML files in the output directory
    const files = await fs.readdir(config.outputDir);
    const htmlFiles = files.filter(f => f.endsWith('.html') && !f.startsWith('_'));

    if (htmlFiles.length === 0) {
      console.log('No HTML files found to transform.');
      console.log('Run the "download" command first to download HTML pages.');
      return;
    }

    // Apply limit if specified
    const filesToProcess = config.limit ? htmlFiles.slice(0, config.limit) : htmlFiles;
    
    console.log(`Found ${htmlFiles.length} HTML files`);
    if (config.limit && htmlFiles.length > config.limit) {
      console.log(`Limiting to first ${config.limit} files\n`);
    } else {
      console.log();
    }

    let transformedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    // Process each HTML file
    for (let i = 0; i < filesToProcess.length; i++) {
      const htmlFile = filesToProcess[i];
      const baseFilename = htmlFile.replace('.html', '');
      const mdFilename = `${baseFilename}.md`;
      const htmlFilepath = path.join(config.outputDir, htmlFile);
      const mdFilepath = path.join(config.outputDir, mdFilename);

      console.log(`[${i + 1}/${filesToProcess.length}] Checking: ${htmlFile}`);

      // Check if MD file already exists
      try {
        await fs.access(mdFilepath);
        console.log(`  ⊘ Skipped: ${mdFilename} already exists`);
        skippedCount++;
        continue;
      } catch {
        // MD file doesn't exist, proceed with transformation
      }

      try {
        // Read HTML content
        const htmlContent = await fs.readFile(htmlFilepath, 'utf-8');

        // Parse the title from filename (reverse slugification is lossy, but best effort)
        const title = unslugify(baseFilename);

        // Transform HTML to Markdown
        const images: Array<{ filename: string; data: Buffer }> = [];
        const markdownBody = await this.htmlToMarkdown(htmlContent, baseFilename, images);

        // Build original page URL (use baseUrl if available)
        const originalUrl = config.baseUrl 
          ? `${config.baseUrl}/pages/viewpage.action?pageId=${baseFilename}`
          : '';

        // Create front matter
        const frontMatter = [
          '---',
          `title: "${title.replace(/"/g, '\\"')}"`,
          `id: "${baseFilename}"`,
          originalUrl ? `url: "${originalUrl}"` : '',
          '---'
        ].filter(Boolean).join('\n');

        // Combine front matter and content
        const markdownContent = `${frontMatter}\n\n${markdownBody}`;

        // Save images if any
        if (images.length > 0) {
          const imagesDir = path.join(config.outputDir, 'images');
          await fs.mkdir(imagesDir, { recursive: true });
          
          for (const image of images) {
            const imagePath = path.join(imagesDir, image.filename);
            await fs.writeFile(imagePath, image.data);
          }
          console.log(`  ✓ Saved ${images.length} image(s)`);
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
          console.log(`  ✓ Transformed: ${mdFilename} (formatted)`);
        } catch {
          // If formatting fails, save unformatted markdown
          console.warn(`  ⚠ Could not format Markdown, saving unformatted`);
          await fs.writeFile(mdFilepath, markdownContent, 'utf-8');
          console.log(`  ✓ Transformed: ${mdFilename}`);
        }

        transformedCount++;
      } catch (error) {
        console.error(`  ✗ Failed to transform ${htmlFile}:`, error instanceof Error ? error.message : error);
        errorCount++;
      }
    }

    console.log(`\n✓ Transformation complete!`);
    console.log(`  Transformed: ${transformedCount} files`);
    console.log(`  Skipped: ${skippedCount} files (MD already exists)`);
    if (errorCount > 0) {
      console.log(`  Errors: ${errorCount} files`);
    }
  }

  /**
   * Basic HTML to Markdown conversion
   */
  private async htmlToMarkdown(html: string, pageId: string, images: Array<{ filename: string; data: Buffer }>): Promise<string> {
    let markdown = html;

    // Transform user links first (before removing ac:link)
    markdown = await this.transformUserLinks(markdown);

    // Transform images and download attachments
    markdown = await this.transformImages(markdown, pageId, images);

    // Transform macros to markdown equivalents (with data fetching)
    markdown = await this.transformMacros(markdown, pageId);

    // Remove remaining ac:link elements
    markdown = markdown.replace(/<ac:link[^>]*>[\s\S]*?<\/ac:link>/g, '');
    
    // Headers
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n');
    markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n##### $1\n');
    markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n###### $1\n');

    // Bold and italic
    markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');

    // Links
    markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

    // Lists
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
      
      // Extract extension and slugify the base name
      const lastDotIndex = originalFilename.lastIndexOf('.');
      const extension = lastDotIndex > 0 ? originalFilename.slice(lastDotIndex) : '';
      const baseName = lastDotIndex > 0 ? originalFilename.slice(0, lastDotIndex) : originalFilename;
      const slugifiedFilename = slugify(baseName) + extension;
      
      let replacement = `![${originalFilename}](images/${slugifiedFilename})`;

      // Download the image if API is available
      if (this.api) {
        try {
          const imageData = await this.api.downloadAttachment(pageId, originalFilename);
          if (imageData) {
            images.push({ filename: slugifiedFilename, data: imageData });
            console.log(`  ✓ Downloaded image: ${originalFilename} -> ${slugifiedFilename}`);
          } else {
            console.warn(`  ⚠ Failed to download image: ${originalFilename}`);
            replacement = `![${originalFilename} (not found)](images/${slugifiedFilename})`;
          }
        } catch (error) {
          console.warn(`  ⚠ Error downloading image ${originalFilename}:`, error);
          replacement = `![${originalFilename} (error)](images/${slugifiedFilename})`;
        }
      }

      result = result.replace(match[0], replacement);
    }

    return result;
  }

  /**
   * Transform Confluence macros to Markdown
   */
  private async transformMacros(content: string, pageId: string): Promise<string> {
    let result = content;

    // Handle list-children macro - fetch actual child pages
    const listChildrenRegex = /<ac:structured-macro[^>]*ac:name="list-children"[^>]*(?:\/>|>.*?<\/ac:structured-macro>)/gis;
    const listChildrenMatches = Array.from(content.matchAll(listChildrenRegex));
    
    for (const match of listChildrenMatches) {
      let replacement = '<!-- Child Pages List -->\n\n';
      
      if (this.api) {
        try {
          const childPages = await this.api.getChildPages(pageId);
          if (childPages.length > 0) {
            replacement = '## Child Pages\n\n' +
              childPages.map(child => `- [${child.title}](${slugify(child.title)}.md)`).join('\n') +
              '\n\n';
          }
        } catch (error) {
          console.warn(`Failed to fetch child pages for ${pageId}:`, error);
        }
      }
      
      result = result.replace(match[0], replacement);
    }

    // Apply other macro transformations
    result = result
      // Code blocks with language
      .replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>.*?<ac:parameter[^>]*ac:name="language"[^>]*>(.*?)<\/ac:parameter>.*?<ac:plain-text-body><!\[CDATA\[(.*?)\]\]><\/ac:plain-text-body>.*?<\/ac:structured-macro>/gis, '```$1\n$2\n```\n\n')
      // Code blocks without language
      .replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>.*?<ac:plain-text-body><!\[CDATA\[(.*?)\]\]><\/ac:plain-text-body>.*?<\/ac:structured-macro>/gis, '```\n$1\n```\n\n')
      // Info panels
      .replace(/<ac:structured-macro[^>]*ac:name="info"[^>]*>.*?<ac:rich-text-body>(.*?)<\/ac:rich-text-body>.*?<\/ac:structured-macro>/gis, '> **Info:** $1\n\n')
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
   * Clean up malformed markdown patterns
   */
  private cleanMarkdown(markdown: string): string {
    let cleaned = markdown;
    
    // First pass: clean confluence-specific patterns
    cleaned = this.cleanConfluencePatterns(cleaned);
    
    // Second pass: general cleanup
    cleaned = this.cleanGeneral(cleaned);
    
    // Third pass: another round of confluence patterns to catch any new issues
    cleaned = this.cleanConfluencePatterns(cleaned);
    
    // Final cleanup of excessive whitespace
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
    cleaned = cleaned.trim() + '\n';
    
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
    cleaned = cleaned.replace(/^#+\s*\*\*\s*$/gm, '');
    cleaned = cleaned.replace(/^#+\s*\*\s*$/gm, '');
    cleaned = cleaned.replace(/^#+\s*__\s*$/gm, '');
    cleaned = cleaned.replace(/^#+\s*_\s*$/gm, '');
    
    // Remove headers that only contain bold/italic markers across multiple lines
    // Example: ## **\n\n** (with only whitespace between)
    cleaned = cleaned.replace(/^(#+)\s*\*\*\s*\n+\s*\*\*\s*$/gm, '');
    cleaned = cleaned.replace(/^(#+)\s*\*\s*\n+\s*\*\s*$/gm, '');
    
    // Remove empty bold markers (no content or only whitespace between)
    cleaned = cleaned.replace(/\*\*\s*\*\*/g, '');
    cleaned = cleaned.replace(/__\s*__/g, '');
    
    // Remove standalone italic markers on their own line
    cleaned = cleaned.replace(/^\s*\*\s*$/gm, '');
    cleaned = cleaned.replace(/^\s*_\s*$/gm, '');
    
    // Remove empty italic markers that span multiple lines (only if truly empty)
    cleaned = cleaned.replace(/\*\s*\n+\s*\*/g, '\n\n');
    
    // Remove empty links
    cleaned = cleaned.replace(/\[\s*\]\(\s*\)/g, '');
    
    // Remove empty list items
    cleaned = cleaned.replace(/^[-*+]\s*$/gm, '');
    
    // Clean up excessive blank lines (more than 3 consecutive)
    cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');
    
    // Remove trailing whitespace from each line
    cleaned = cleaned.replace(/[ \t]+$/gm, '');
    
    // Ensure single trailing newline at end of file
    cleaned = cleaned.trim() + '\n';

    return cleaned;
  }
}
