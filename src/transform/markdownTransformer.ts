import type { Page } from '../models/entities.js';

export interface MarkdownTransformResult {
  content: string;
  frontMatter: Record<string, unknown>;
  links: LinkExtraction[];
  attachments: AttachmentReference[];
  users: UserReference[];
  macroExpansions: MacroExpansionRequest[];
  discoveredPageIds: string[]; // Page IDs discovered during macro expansion that need to be downloaded
}

export interface MacroExpansionRequest {
  type: 'list-children' | 'contentbylabel' | 'excerpt-include';
  pageId: string; // The page where the macro appears
  parameters: Record<string, string>;
  placeholder: string; // The placeholder text to replace
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

export interface UserReference {
  userKey: string;
  username?: string; // Resolved from API
  displayName?: string; // Resolved from API
  resolvedUrl?: string; // Deferred until user info is fetched
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
    const users: UserReference[] = [];
    const macroExpansions: MacroExpansionRequest[] = [];

    // Transform the content and extract references
    const markdownContent = this.transformStorageToMarkdown(content, context, links, attachments, users, macroExpansions);

    // Build front matter
    const frontMatter = this.buildFrontMatter(page, context);

    return {
      content: markdownContent,
      frontMatter,
      links,
      attachments,
      users,
      macroExpansions,
      discoveredPageIds: [] // Basic transformer doesn't discover pages, only enhanced transformer does
    };
  }

  private transformStorageToMarkdown(
    content: string,
    context: TransformContext,
    links: LinkExtraction[],
    attachments: AttachmentReference[],
    users: UserReference[],
    macroExpansions: MacroExpansionRequest[]
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
    
    // Transform user links and extract them
    result = this.transformUserLinks(result, context, users);
    
    // Transform links and extract them for later resolution
    result = this.transformLinks(result, context, links);
    
    // Transform images/attachments and extract them
    result = this.transformAttachments(result, context, attachments);
    
    // Transform macros to appropriate markdown or placeholders
    result = this.transformMacros(result, context, macroExpansions);
    
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

  private transformUserLinks(
    content: string,
    context: TransformContext,
    users: UserReference[]
  ): string {
    return content.replace(/<ac:link[^>]*><ri:user[^>]*ri:userkey="([^"]*)"[^>]*\/><\/ac:link>/gi, (_match, userKey) => {
      // Extract a username-like identifier from the userKey
      // This is a placeholder - in real implementation, you'd call the API
      const extractedId = this.extractUserIdFromKey(userKey);
      
      const userRef: UserReference = {
        userKey,
        resolvedUrl: `${context.baseUrl}/display/~${extractedId}`
      };

      users.push(userRef);

      // Create a user mention link
      return `[@user:${extractedId}](${userRef.resolvedUrl})`;
    });
  }

  /**
   * Placeholder method to extract a user identifier from userKey
   * In a real implementation, this would make an API call to resolve the username
   */
  private extractUserIdFromKey(userKey: string): string {
    // Simple heuristic: take last 8 characters as fallback
    // In real implementation, you would:
    // 1. Call this.api.getUser(userKey) to get actual username
    // 2. Cache the results to avoid duplicate API calls
    // 3. Handle errors gracefully
    return userKey.slice(-8);
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
        // Handle both direct page URLs and viewpage.action URLs
        let pageIdMatch = href.match(/\/pages\/(\d+)/);
        if (!pageIdMatch) {
          pageIdMatch = href.match(/pageId=([^&#]*)/);
        }
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

  private transformMacros(
    content: string, 
    context: TransformContext, 
    macroExpansions: MacroExpansionRequest[]
  ): string {
    return content
      // Info macro
      .replace(/<ac:structured-macro[^>]*ac:name="info"[^>]*>.*?<ac:rich-text-body>(.*?)<\/ac:rich-text-body>.*?<\/ac:structured-macro>/gis, '> **Info:** $1\n\n')
      // Warning macro
      .replace(/<ac:structured-macro[^>]*ac:name="warning"[^>]*>.*?<ac:rich-text-body>(.*?)<\/ac:rich-text-body>.*?<\/ac:structured-macro>/gis, '> **Warning:** $1\n\n')
      // Note macro
      .replace(/<ac:structured-macro[^>]*ac:name="note"[^>]*>.*?<ac:rich-text-body>(.*?)<\/ac:rich-text-body>.*?<\/ac:structured-macro>/gis, '> **Note:** $1\n\n')
      // Panel macro - extract content from rich-text-body
      .replace(/<ac:structured-macro[^>]*ac:name="panel"[^>]*>.*?<ac:rich-text-body>(.*?)<\/ac:rich-text-body>.*?<\/ac:structured-macro>/gis, '$1\n\n')
      // List-children macro - shows child pages (handles both self-closing and regular)
      .replace(/<ac:structured-macro[^>]*ac:name="list-children"[^>]*(?:\/>|>.*?<\/ac:structured-macro>)/gis, (match) => {
        const params = this.extractMacroParameters(match);
        const placeholder = `<!-- MACRO_EXPANSION:list-children:${Date.now()}:${Math.random().toString(36)} -->`;
        
        // Add to expansion requests for later processing
        macroExpansions.push({
          type: 'list-children',
          pageId: context.currentPageId,
          parameters: params,
          placeholder
        });
        
        return placeholder + '\n\n';
      })
      // Content by label macro - shows pages with specific labels
      .replace(/<ac:structured-macro[^>]*ac:name="contentbylabel"[^>]*(?:\/>|>(.*?)<\/ac:structured-macro>)/gis, (match) => {
        const params = this.extractMacroParameters(match);
        const placeholder = `<!-- MACRO_EXPANSION:contentbylabel:${Date.now()}:${Math.random().toString(36)} -->`;
        
        macroExpansions.push({
          type: 'contentbylabel',
          pageId: context.currentPageId,
          parameters: params,
          placeholder
        });
        
        return placeholder + '\n\n';
      })
      // Code macro with language and title support
      .replace(/<ac:structured-macro[^>]*ac:name="code"[^>]*>(.*?)<\/ac:structured-macro>/gis, (match, body) => {
        const params = this.extractMacroParameters(match);
        const language = params.language || '';
        const title = params.title;
        
        // Extract only the plain text body content
        const plainTextMatch = body.match(/<ac:plain-text-body[^>]*>(.*?)<\/ac:plain-text-body>/is);
        const codeContent = plainTextMatch ? plainTextMatch[1].trim() : body.replace(/<[^>]*>/g, '').trim();
        
        let result = '';
        if (title) {
          result += `**${title}**\n\n`;
        }
        result += '```' + language + '\n' + codeContent + '\n```\n\n';
        return result;
      })
      // Excerpt macro - content for reuse
      .replace(/<ac:structured-macro[^>]*ac:name="excerpt"[^>]*>.*?<ac:rich-text-body>(.*?)<\/ac:rich-text-body>.*?<\/ac:structured-macro>/gis, '$1\n\n')
      // Excerpt-include macro - includes content from another page (handles both self-closing and regular)
      .replace(/<ac:structured-macro[^>]*ac:name="excerpt-include"[^>]*(?:\/>|>(.*?)<\/ac:structured-macro>)/gis, (match) => {
        const params = this.extractMacroParameters(match);
        const placeholder = `<!-- MACRO_EXPANSION:excerpt-include:${Date.now()}:${Math.random().toString(36)} -->`;
        
        macroExpansions.push({
          type: 'excerpt-include',
          pageId: context.currentPageId,
          parameters: params,
          placeholder
        });
        
        return placeholder + '\n\n';
      })
      // Table of contents
      .replace(/<ac:structured-macro[^>]*ac:name="toc"[^>]*>.*?<\/ac:structured-macro>/gis, '<!-- Table of Contents -->\n\n')
      // Other macros - convert to comments (handles both self-closing and regular)
      .replace(/<ac:structured-macro[^>]*ac:name="([^"]*)"[^>]*(?:\/>|>.*?<\/ac:structured-macro>)/gis, '<!-- Confluence Macro: $1 -->\n\n');
  }

  /**
   * Extract parameters from a structured macro
   */
  private extractMacroParameters(macroContent: string): Record<string, string> {
    const params: Record<string, string> = {};
    
    // Extract parameters from ac:parameter elements
    const paramRegex = /<ac:parameter[^>]*ac:name="([^"]*)"[^>]*>(.*?)<\/ac:parameter>/gis;
    let match: RegExpExecArray | null = paramRegex.exec(macroContent);
    
    while (match !== null) {
      const paramName = match[1];
      const paramValue = match[2].replace(/<[^>]*>/g, '').trim(); // Strip HTML tags
      params[paramName] = paramValue;
      match = paramRegex.exec(macroContent);
    }
    
    return params;
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
