/**
 * Minimal HTML to Markdown transformer
 */

import type { Page } from './types.js';
import type { ConfluenceApi } from './api.js';

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
  private api?: ConfluenceApi;

  constructor(api?: ConfluenceApi) {
    this.api = api;
  }

  /**
   * Transform Confluence storage format (HTML) to Markdown
   */
  async transform(page: Page): Promise<MarkdownResult> {
    const markdown = await this.htmlToMarkdown(page.body);
    
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
  private async htmlToMarkdown(html: string): Promise<string> {
    let markdown = html;

    // Transform user links first (before removing ac:link)
    markdown = await this.transformUserLinks(markdown);

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
}
