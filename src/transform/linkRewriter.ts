import type { LinkExtraction } from './markdownTransformer.js';
import type { Page, LinkReference } from '../models/entities.js';

export interface LinkMap {
  [pageId: string]: string; // pageId -> relative path
}

export interface LinkRewriteResult {
  content: string;
  deferredLinks: LinkReference[];
}

export class LinkRewriter {
  private linkMap: LinkMap;
  private baseUrl: string;

  constructor(linkMap: LinkMap, baseUrl: string) {
    this.linkMap = linkMap;
    this.baseUrl = baseUrl;
  }

  /**
   * Rewrite links in markdown content based on the link map
   */
  rewriteLinks(
    content: string,
    links: LinkExtraction[],
    sourcePageId: string
  ): LinkRewriteResult {
    let result = content;
    const deferredLinks: LinkReference[] = [];

    for (const link of links) {
      if (!link.isInternal) {
        // External links remain unchanged
        continue;
      }

      const rewriteResult = this.rewriteLink(link, sourcePageId);
      
      if (rewriteResult.deferred) {
        // Store for later resolution
        deferredLinks.push({
          sourcePageId,
          targetPageId: link.pageId || '',
          originalHref: link.originalHref,
          deferred: true
        });
      } else if (rewriteResult.newHref) {
        // Replace in content
        const linkPattern = this.escapeRegExp(link.originalHref);
        const regex = new RegExp(`\\[([^\\]]+)\\]\\(${linkPattern}\\)`, 'g');
        result = result.replace(regex, `[$1](${rewriteResult.newHref})`);
      }
    }

    return {
      content: result,
      deferredLinks
    };
  }

  private rewriteLink(
    link: LinkExtraction,
    sourcePageId: string
  ): { newHref?: string; deferred?: boolean } {
    // Handle anchor-only links (same page)
    if (link.originalHref.startsWith('#')) {
      return { newHref: link.originalHref };
    }

    // Handle page links
    if (link.pageId) {
      const targetPath = this.linkMap[link.pageId];
      
      if (!targetPath) {
        // Page not in export scope - defer for later resolution
        return { deferred: true };
      }

      // Calculate relative path from source to target
      const relativePath = this.calculateRelativePath(sourcePageId, link.pageId);
      
      // Add anchor if present
      const anchor = link.anchor ? `#${link.anchor}` : '';
      
      return { newHref: relativePath + anchor };
    }

    // Handle other internal paths
    if (link.originalHref.startsWith('/')) {
      // Could be attachment or other resource - keep as-is for now
      return { newHref: link.originalHref };
    }

    // Unknown internal link type - defer
    return { deferred: true };
  }

  private calculateRelativePath(sourcePageId: string, targetPageId: string): string {
    const sourcePath = this.linkMap[sourcePageId];
    const targetPath = this.linkMap[targetPageId];

    if (!sourcePath || !targetPath) {
      throw new Error(`Missing path mapping for page ${sourcePageId} or ${targetPageId}`);
    }

    // Convert to relative path
    const sourceDir = this.getDirectoryPath(sourcePath);
    const relativePath = this.getRelativePath(sourceDir, targetPath);

    return relativePath;
  }

  private getDirectoryPath(filePath: string): string {
    const lastSlash = filePath.lastIndexOf('/');
    return lastSlash === -1 ? '' : filePath.substring(0, lastSlash);
  }

  private getRelativePath(fromDir: string, toFile: string): string {
    if (!fromDir) {
      return toFile;
    }

    const fromParts = fromDir.split('/').filter(p => p);
    const toParts = toFile.split('/').filter(p => p);

    // Find common base
    let commonLength = 0;
    for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
      if (fromParts[i] === toParts[i]) {
        commonLength++;
      } else {
        break;
      }
    }

    // Calculate relative path
    const upSteps = fromParts.length - commonLength;
    const downParts = toParts.slice(commonLength);

    const relativeParts = Array(upSteps).fill('..').concat(downParts);
    return relativeParts.join('/') || './';
  }

  private escapeRegExp(string: string): string {
    // Escape special regex characters
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Build a link map from a list of pages
   */
  static buildLinkMap(pages: Page[]): LinkMap {
    const linkMap: LinkMap = {};
    
    for (const page of pages) {
      if (page.path) {
        linkMap[page.id] = page.path;
      }
    }
    
    return linkMap;
  }

  /**
   * Finalize deferred links after all pages are processed
   */
  static finalizeDeferredLinks(
    deferredLinks: LinkReference[],
    linkMap: LinkMap
  ): LinkReference[] {
    const resolvedLinks: LinkReference[] = [];
    
    for (const link of deferredLinks) {
      const targetPath = linkMap[link.targetPageId];
      
      if (targetPath) {
        // Link can now be resolved
        resolvedLinks.push({
          ...link,
          deferred: false
        });
      } else {
        // Link target is not in export scope - keep as external
        resolvedLinks.push(link);
      }
    }
    
    return resolvedLinks;
  }
}
