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
    const markdown = await this.htmlToMarkdown(page.body, page.id);
    
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
  private async htmlToMarkdown(html: string, pageId: string): Promise<string> {
    let markdown = html;

    // Transform user links first (before removing ac:link)
    markdown = await this.transformUserLinks(markdown);

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

    return markdown;
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
              childPages.map(child => `- [${child.title}](${child.id}.md)`).join('\n') +
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
}
