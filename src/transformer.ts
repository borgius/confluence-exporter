/**
 * Minimal HTML to Markdown transformer
 */

import type { Page } from './types.js';

export interface MarkdownResult {
  content: string;
  frontMatter: {
    title: string;
    id: string;
    version?: number;
    parentId?: string;
  };
}

export class MarkdownTransformer {
  /**
   * Transform Confluence storage format (HTML) to Markdown
   */
  transform(page: Page): MarkdownResult {
    const markdown = this.htmlToMarkdown(page.body);
    
    return {
      content: markdown,
      frontMatter: {
        title: page.title,
        id: page.id,
        version: page.version,
        parentId: page.parentId
      }
    };
  }

  /**
   * Basic HTML to Markdown conversion
   */
  private htmlToMarkdown(html: string): string {
    let markdown = html;

    // Remove Confluence-specific macros (basic approach)
    markdown = markdown.replace(/<ac:structured-macro[^>]*>[\s\S]*?<\/ac:structured-macro>/g, '');
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

    return markdown;
  }
}
