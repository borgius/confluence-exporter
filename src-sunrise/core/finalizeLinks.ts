/**
 * Final link rewrite pass after all pages exported
 * Implements T064: Final link rewrite pass after all pages exported
 */

import { readFile } from 'fs/promises';
import { join, relative, dirname } from 'path';
import type { ManifestEntry } from '../models/entities.js';
import { logger } from '../util/logger.js';
import { atomicWriteFile } from '../fs/index.js';

export interface LinkRewriteStats {
  totalFiles: number;
  processedFiles: number;
  totalLinks: number;
  rewrittenLinks: number;
  brokenLinks: number;
  skippedLinks: number;
  errors: string[];
}

export interface LinkMappingTable {
  pageIdToPath: Map<string, string>; // pageId -> relative markdown path
  pathToPageId: Map<string, string>; // relative markdown path -> pageId
  confluenceUrlToPath: Map<string, string>; // confluence URL -> relative markdown path
}

/**
 * Performs final link rewriting after all pages have been exported
 */
export class FinalLinkRewriter {
  private outputDir: string;
  private stats: LinkRewriteStats;
  private linkMapping: LinkMappingTable;

  constructor(outputDir: string) {
    this.outputDir = outputDir;
    this.stats = {
      totalFiles: 0,
      processedFiles: 0,
      totalLinks: 0,
      rewrittenLinks: 0,
      brokenLinks: 0,
      skippedLinks: 0,
      errors: [],
    };
    this.linkMapping = {
      pageIdToPath: new Map(),
      pathToPageId: new Map(),
      confluenceUrlToPath: new Map(),
    };
  }

  /**
   * Builds link mapping table from manifest entries
   */
  buildLinkMapping(manifestEntries: ManifestEntry[], baseUrl: string): void {
    this.linkMapping.pageIdToPath.clear();
    this.linkMapping.pathToPageId.clear();
    this.linkMapping.confluenceUrlToPath.clear();

    for (const entry of manifestEntries) {
      if (entry.status === 'exported' || entry.status === 'unchanged') {
        // Map page ID to relative path
        this.linkMapping.pageIdToPath.set(entry.id, entry.path);
        this.linkMapping.pathToPageId.set(entry.path, entry.id);

        // Map various Confluence URL patterns to relative path
        const confluenceUrls = this.generateConfluenceUrls(entry.id, entry.title, baseUrl);
        for (const url of confluenceUrls) {
          this.linkMapping.confluenceUrlToPath.set(url, entry.path);
        }
      }
    }

    logger.info('Built link mapping table', {
      pageIdMappings: this.linkMapping.pageIdToPath.size,
      urlMappings: this.linkMapping.confluenceUrlToPath.size,
    });
  }

  /**
   * Performs final link rewrite pass on all exported markdown files
   */
  async performFinalRewrite(manifestEntries: ManifestEntry[], baseUrl: string): Promise<LinkRewriteStats> {
    this.buildLinkMapping(manifestEntries, baseUrl);

    const exportedEntries = manifestEntries.filter(
      entry => entry.status === 'exported' || entry.status === 'unchanged'
    );

    this.stats.totalFiles = exportedEntries.length;

    for (const entry of exportedEntries) {
      try {
        await this.rewriteLinksInFile(entry);
        this.stats.processedFiles++;
      } catch (error) {
        const errorMsg = `Failed to rewrite links in ${entry.path}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        this.stats.errors.push(errorMsg);
        logger.error('Link rewrite failed', {
          filePath: entry.path,
          pageId: entry.id,
          error: errorMsg,
        });
      }
    }

    this.logSummary();
    return { ...this.stats };
  }

  /**
   * Rewrites links in a single markdown file
   */
  private async rewriteLinksInFile(entry: ManifestEntry): Promise<void> {
    const filePath = join(this.outputDir, entry.path);
    
    try {
      const content = await readFile(filePath, 'utf-8');
      const rewrittenContent = this.rewriteLinksInContent(content, entry.path);
      
      // Only write if content changed
      if (rewrittenContent !== content) {
        await atomicWriteFile(filePath, rewrittenContent);
        logger.debug('Rewrote links in file', {
          filePath: entry.path,
          pageId: entry.id,
        });
      }
    } catch (error) {
      throw new Error(`File processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Rewrites links within markdown content
   */
  private rewriteLinksInContent(content: string, currentFilePath: string): string {
    // Match markdown links: [text](url) and reference links: [text][ref]
    const linkPattern = /\[([^\]]*)\]\(([^)]+)\)/g;
    
    return content.replace(linkPattern, (match, linkText, linkUrl) => {
      this.stats.totalLinks++;
      
      const rewrittenUrl = this.rewriteSingleLink(linkUrl, currentFilePath);
      
      if (rewrittenUrl !== linkUrl) {
        this.stats.rewrittenLinks++;
        return `[${linkText}](${rewrittenUrl})`;
      } else {
        this.stats.skippedLinks++;
        return match;
      }
    });
  }

  /**
   * Rewrites a single link URL
   */
  private rewriteSingleLink(linkUrl: string, currentFilePath: string): string {
    // Skip external links (http/https), anchors, and already relative links
    if (this.shouldSkipLink(linkUrl)) {
      return linkUrl;
    }

    // Try to find mapping for this URL
    const targetPath = this.findTargetPath(linkUrl);
    
    if (targetPath) {
      // Convert to relative path from current file
      const currentDir = dirname(currentFilePath);
      const relativePath = relative(currentDir, targetPath);
      
      // Ensure forward slashes for markdown compatibility
      return relativePath.replace(/\\/g, '/');
    } else {
      // Track broken link
      this.stats.brokenLinks++;
      logger.debug('Broken link detected', {
        linkUrl,
        currentFile: currentFilePath,
      });
      
      // Return original URL (could add a comment or marker here)
      return linkUrl;
    }
  }

  /**
   * Determines if a link should be skipped from rewriting
   */
  private shouldSkipLink(linkUrl: string): boolean {
    // Skip external URLs
    if (linkUrl.startsWith('http://') || linkUrl.startsWith('https://')) {
      // Only skip if it's not a Confluence URL we can map
      return !this.linkMapping.confluenceUrlToPath.has(linkUrl);
    }
    
    // Skip anchors and relative links that are already local
    if (linkUrl.startsWith('#') || linkUrl.startsWith('./') || linkUrl.startsWith('../')) {
      return true;
    }
    
    // Skip data URLs, mailto, etc.
    if (linkUrl.includes(':') && !linkUrl.startsWith('/')) {
      return true;
    }
    
    return false;
  }

  /**
   * Finds the target path for a given link URL
   */
  private findTargetPath(linkUrl: string): string | null {
    // Direct URL mapping
    if (this.linkMapping.confluenceUrlToPath.has(linkUrl)) {
      return this.linkMapping.confluenceUrlToPath.get(linkUrl) || null;
    }

    // Try to extract page ID from various URL patterns
    const pageId = this.extractPageIdFromUrl(linkUrl);
    if (pageId && this.linkMapping.pageIdToPath.has(pageId)) {
      return this.linkMapping.pageIdToPath.get(pageId) || null;
    }

    // Try partial URL matching
    for (const [mappedUrl, path] of this.linkMapping.confluenceUrlToPath.entries()) {
      if (this.urlsMatch(linkUrl, mappedUrl)) {
        return path;
      }
    }

    return null;
  }

  /**
   * Extracts page ID from various Confluence URL patterns
   */
  private extractPageIdFromUrl(url: string): string | null {
    // Pattern: /pages/123456789/Page+Title
    const pagesMatch = url.match(/\/pages\/(\d+)/);
    if (pagesMatch) {
      return pagesMatch[1];
    }

    // Pattern: pageId=123456789
    const pageIdMatch = url.match(/pageId=(\d+)/);
    if (pageIdMatch) {
      return pageIdMatch[1];
    }

    // Pattern: /display/SPACE/Page+Title with pageId query
    const displayMatch = url.match(/\/display\/[^/]+\/[^?]*\?.*pageId=(\d+)/);
    if (displayMatch) {
      return displayMatch[1];
    }

    return null;
  }

  /**
   * Checks if two URLs should be considered matching for linking
   */
  private urlsMatch(url1: string, url2: string): boolean {
    // Normalize URLs for comparison
    const normalize = (url: string) => url.toLowerCase().replace(/[+%20]/g, ' ');
    
    const norm1 = normalize(url1);
    const norm2 = normalize(url2);
    
    // Exact match
    if (norm1 === norm2) {
      return true;
    }
    
    // Check if one is a substring of the other (for partial matches)
    if (norm1.includes(norm2) || norm2.includes(norm1)) {
      return true;
    }
    
    return false;
  }

  /**
   * Generates possible Confluence URLs for a page
   */
  private generateConfluenceUrls(pageId: string, title: string, baseUrl: string): string[] {
    const urls: string[] = [];
    const encodedTitle = encodeURIComponent(title.replace(/ /g, '+'));
    
    // Various Confluence URL patterns
    urls.push(`${baseUrl}/pages/${pageId}`);
    urls.push(`${baseUrl}/pages/${pageId}/${encodedTitle}`);
    urls.push(`/pages/${pageId}`);
    urls.push(`/pages/${pageId}/${encodedTitle}`);
    
    return urls;
  }

  /**
   * Logs summary of link rewriting results
   */
  private logSummary(): void {
    logger.info('Final link rewrite completed', {
      totalFiles: this.stats.totalFiles,
      processedFiles: this.stats.processedFiles,
      totalLinks: this.stats.totalLinks,
      rewrittenLinks: this.stats.rewrittenLinks,
      brokenLinks: this.stats.brokenLinks,
      skippedLinks: this.stats.skippedLinks,
      errorCount: this.stats.errors.length,
    });

    if (this.stats.brokenLinks > 0) {
      logger.warn('Broken links detected during rewrite', {
        brokenLinks: this.stats.brokenLinks,
        message: 'Some links could not be resolved to local files',
      });
    }

    if (this.stats.errors.length > 0) {
      logger.error('Link rewrite errors occurred', {
        errorCount: this.stats.errors.length,
        errors: this.stats.errors.slice(0, 5), // Show first 5 errors
      });
    }
  }
}

/**
 * Creates a final link rewriter for the given output directory
 */
export function createFinalLinkRewriter(outputDir: string): FinalLinkRewriter {
  return new FinalLinkRewriter(outputDir);
}
