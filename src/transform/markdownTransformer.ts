import type { Page } from '../models/entities.js';

export interface MarkdownTransformResult {
  content: string;
  frontMatter: Record<string, unknown>;
  links: LinkExtraction[];
  attachments: AttachmentReference[];
}

export interface LinkExtraction {
  originalHref: string;
  isInternal: boolean;
  pageId?: string;
  anchor?: string;
  resolvedPath?: string; // Deferred until link map is built
}

export interface AttachmentReference {
  originalSrc: string;
  attachmentId?: string;
  fileName: string;
  resolvedPath?: string; // Deferred until attachments are downloaded
}

export interface TransformContext {
  currentPageId: string;
  spaceKey: string;
  baseUrl: string;
}

export class MarkdownTransformer {
  /**
   * Transform a Confluence page to Markdown with extracted metadata
   */
  transform(page: Page, context: TransformContext): MarkdownTransformResult {
    const content = page.bodyStorage || '';
    const links: LinkExtraction[] = [];
    const attachments: AttachmentReference[] = [];

    // Transform the content and extract references
    const markdownContent = this.transformStorageToMarkdown(content, context, links, attachments);

    // Build front matter
    const frontMatter = this.buildFrontMatter(page, context);

    return {
      content: markdownContent,
      frontMatter,
      links,
      attachments
    };
  }

  private transformStorageToMarkdown(
    content: string,
    context: TransformContext,
    links: LinkExtraction[],
    attachments: AttachmentReference[]
  ): string {
    let result = content;

    // Transform headings
    result = this.transformHeadings(result);
    
    // Transform paragraphs and basic formatting
    result = this.transformBasicFormatting(result);
    
    // Transform code blocks and inline code
    result = this.transformCode(result);
    
    // Transform lists
    result = this.transformLists(result);
    
    // Transform tables
    result = this.transformTables(result);
    
    // Transform links and extract them for later resolution
    result = this.transformLinks(result, context, links);
    
    // Transform images/attachments and extract them
    result = this.transformAttachments(result, context, attachments);
    
    // Transform macros to appropriate markdown or placeholders
    result = this.transformMacros(result);
    
    // Clean up remaining HTML tags
    result = this.cleanupHtml(result);

    return result.trim();
  }

  private transformHeadings(content: string): string {
    // Transform h1-h6 tags to markdown headers
    return content
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
      .replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n')
      .replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n')
      .replace(/<h6[^>]*>(.*?)<\/h6>/gi, '###### $1\n\n');
  }

  private transformBasicFormatting(content: string): string {
    return content
      // Bold
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      // Italic
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      // Underline (convert to emphasis)
      .replace(/<u[^>]*>(.*?)<\/u>/gi, '*$1*')
      // Strikethrough
      .replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~')
      .replace(/<del[^>]*>(.*?)<\/del>/gi, '~~$1~~')
      // Paragraphs
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      // Line breaks
      .replace(/<br\s*\/?>/gi, '\n');
  }

  private transformCode(content: string): string {
    return content
      // Code blocks with language
      .replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>.*?<ac:parameter[^>]*ac:name="language"[^>]*>(.*?)<\/ac:parameter>.*?<ac:plain-text-body><!\[CDATA\[(.*?)\]\]><\/ac:plain-text-body>.*?<\/ac:structured-macro>/gis, '```$1\n$2\n```\n\n')
      // Code blocks without language
      .replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>.*?<ac:plain-text-body><!\[CDATA\[(.*?)\]\]><\/ac:plain-text-body>.*?<\/ac:structured-macro>/gis, '```\n$1\n```\n\n')
      // Inline code
      .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
      // Preformatted text
      .replace(/<pre[^>]*>(.*?)<\/pre>/gis, '```\n$1\n```\n\n');
  }

  private transformLists(content: string): string {
    return content
      // Unordered lists
      .replace(/<ul[^>]*>(.*?)<\/ul>/gis, (_match, listContent) => {
        const items = listContent.replace(/<li[^>]*>(.*?)<\/li>/gis, '- $1\n');
        return items + '\n';
      })
      // Ordered lists
      .replace(/<ol[^>]*>(.*?)<\/ol>/gis, (_match, listContent) => {
        let counter = 1;
        const items = listContent.replace(/<li[^>]*>(.*?)<\/li>/gis, (_itemMatch, itemContent) => {
          return `${counter++}. ${itemContent}\n`;
        });
        return items + '\n';
      });
  }

  private transformTables(content: string): string {
    return content.replace(/<table[^>]*>(.*?)<\/table>/gis, (_match, tableContent) => {
      const rows: string[] = [];
      let headerProcessed = false;

      // Extract table rows
      tableContent.replace(/<tr[^>]*>(.*?)<\/tr>/gis, (rowMatch: string, rowContent: string) => {
        const cells: string[] = [];
        
        // Extract cells (both th and td)
        rowContent.replace(/<(?:th|td)[^>]*>(.*?)<\/(?:th|td)>/gis, (cellMatch: string, cellContent: string) => {
          cells.push(cellContent.trim());
          return cellMatch;
        });

        if (cells.length > 0) {
          const row = '| ' + cells.join(' | ') + ' |';
          rows.push(row);

          // Add header separator after first row
          if (!headerProcessed) {
            const separator = '| ' + cells.map(() => '---').join(' | ') + ' |';
            rows.push(separator);
            headerProcessed = true;
          }
        }

        return rowMatch;
      });

      return rows.length > 0 ? rows.join('\n') + '\n\n' : '';
    });
  }

  private transformLinks(
    content: string,
    context: TransformContext,
    links: LinkExtraction[]
  ): string {
    return content.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (_match, href, text) => {
      const linkInfo: LinkExtraction = {
        originalHref: href,
        isInternal: this.isInternalLink(href, context.baseUrl)
      };

      // Extract page ID from internal links
      if (linkInfo.isInternal) {
        const pageIdMatch = href.match(/\/pages\/(\d+)/);
        if (pageIdMatch) {
          linkInfo.pageId = pageIdMatch[1];
        }

        // Extract anchor
        const anchorMatch = href.match(/#(.+)$/);
        if (anchorMatch) {
          linkInfo.anchor = anchorMatch[1];
        }
      }

      links.push(linkInfo);

      // For now, keep original href - will be resolved later
      return `[${text}](${href})`;
    });
  }

  private transformAttachments(
    content: string,
    _context: TransformContext,
    attachments: AttachmentReference[]
  ): string {
    return content.replace(/<ac:image[^>]*>.*?<ri:attachment[^>]*ri:filename="([^"]*)"[^>]*\/>.*?<\/ac:image>/gis, (match, fileName) => {
      const attachmentRef: AttachmentReference = {
        originalSrc: match,
        fileName
      };

      attachments.push(attachmentRef);

      // For now, use filename as alt text - path will be resolved later
      return `![${fileName}](${fileName})`;
    });
  }

  private transformMacros(content: string): string {
    return content
      // Info macro
      .replace(/<ac:structured-macro[^>]*ac:name="info"[^>]*>.*?<ac:rich-text-body>(.*?)<\/ac:rich-text-body>.*?<\/ac:structured-macro>/gis, '> **Info:** $1\n\n')
      // Warning macro
      .replace(/<ac:structured-macro[^>]*ac:name="warning"[^>]*>.*?<ac:rich-text-body>(.*?)<\/ac:rich-text-body>.*?<\/ac:structured-macro>/gis, '> **Warning:** $1\n\n')
      // Note macro
      .replace(/<ac:structured-macro[^>]*ac:name="note"[^>]*>.*?<ac:rich-text-body>(.*?)<\/ac:rich-text-body>.*?<\/ac:structured-macro>/gis, '> **Note:** $1\n\n')
      // Table of contents
      .replace(/<ac:structured-macro[^>]*ac:name="toc"[^>]*>.*?<\/ac:structured-macro>/gis, '<!-- Table of Contents -->\n\n')
      // Other macros - convert to comments
      .replace(/<ac:structured-macro[^>]*ac:name="([^"]*)"[^>]*>.*?<\/ac:structured-macro>/gis, '<!-- Confluence Macro: $1 -->\n\n');
  }

  private cleanupHtml(content: string): string {
    return content
      // Remove Confluence layout elements while preserving content
      .replace(/<ac:layout[^>]*>(.*?)<\/ac:layout>/gis, '$1')
      .replace(/<ac:layout-section[^>]*>(.*?)<\/ac:layout-section>/gis, '$1')
      .replace(/<ac:layout-cell[^>]*>(.*?)<\/ac:layout-cell>/gis, '$1')
      // Remove Confluence link elements while preserving content  
      .replace(/<ac:link[^>]*>(.*?)<\/ac:link>/gis, '$1')
      .replace(/<ri:page[^>]*\/>/g, '')
      .replace(/<ri:space[^>]*\/>/g, '')
      // Remove common HTML tags while preserving content
      .replace(/<(?:div|span|section|article)[^>]*>(.*?)<\/(?:div|span|section|article)>/gis, '$1')
      // Remove empty tags
      .replace(/<[^>]*><\/[^>]*>/g, '')
      // Clean up excessive whitespace
      .replace(/\n{3,}/g, '\n\n')
      // Trim each line
      .split('\n').map(line => line.trimEnd()).join('\n');
  }

  private isInternalLink(href: string, baseUrl: string): boolean {
    return href.includes(baseUrl) || href.startsWith('/') || href.startsWith('#');
  }

  private buildFrontMatter(page: Page, context: TransformContext): Record<string, unknown> {
    const frontMatter: Record<string, unknown> = {
      id: page.id,
      url: `${context.baseUrl}/spaces/${context.spaceKey}/pages/${page.id}/${encodeURIComponent(page.title)}`,
      title: page.title,
      type: page.type
    };

    if (page.version) {
      frontMatter.version = page.version;
    }

    if (page.parentId) {
      frontMatter.parentId = page.parentId;
    }

    return frontMatter;
  }
}
