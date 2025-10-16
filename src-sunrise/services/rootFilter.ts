/**
 * Root page filter service
 * Implements T062: Root page filter logic
 */

import type { Page } from '../models/entities.js';
import { logger } from '../util/logger.js';

export interface RootFilterConfig {
  rootPageId: string;
  includeRoot: boolean; // Whether to include the root page itself in results
}

export interface RootFilterStats {
  totalPages: number;
  filteredPages: number;
  includedPages: number;
  rootPageFound: boolean;
  rootPageTitle?: string;
}

/**
 * Filters pages to include only those under a specified root page
 */
export class RootPageFilter {
  private config: RootFilterConfig;
  private pageMap: Map<string, Page> = new Map();
  private childrenMap: Map<string, Set<string>> = new Map();
  private ancestorMap: Map<string, string[]> = new Map();
  private stats: RootFilterStats;

  constructor(rootPageId: string, includeRoot = true) {
    this.config = { rootPageId, includeRoot };
    this.stats = {
      totalPages: 0,
      filteredPages: 0,
      includedPages: 0,
      rootPageFound: false,
    };
  }

  /**
   * Builds internal maps from the page list for efficient filtering
   */
  buildPageMaps(pages: Page[]): void {
    this.stats.totalPages = pages.length;
    this.pageMap.clear();
    this.childrenMap.clear();
    this.ancestorMap.clear();

    // Build page map and parent-child relationships
    for (const page of pages) {
      this.pageMap.set(page.id, page);
      
      if (page.parentId) {
        if (!this.childrenMap.has(page.parentId)) {
          this.childrenMap.set(page.parentId, new Set());
        }
        const children = this.childrenMap.get(page.parentId);
        if (children) {
          children.add(page.id);
        }
      }
    }

    // Build ancestor chains for efficient lookup
    for (const page of pages) {
      this.buildAncestorChain(page.id);
    }

    // Check if root page exists
    const rootPage = this.pageMap.get(this.config.rootPageId);
    if (rootPage) {
      this.stats.rootPageFound = true;
      this.stats.rootPageTitle = rootPage.title;
      logger.info('Root page filter configured', {
        rootPageId: this.config.rootPageId,
        rootPageTitle: rootPage.title,
        includeRoot: this.config.includeRoot,
      });
    } else {
      logger.warn('Root page not found in page list', {
        rootPageId: this.config.rootPageId,
        totalPages: pages.length,
      });
    }
  }

  /**
   * Filters pages to include only those under the root page
   */
  filterPages(pages: Page[]): Page[] {
    if (!this.stats.rootPageFound) {
      logger.warn('Cannot filter pages: root page not found');
      return pages;
    }

    this.buildPageMaps(pages);
    
    const includedPages: Page[] = [];
    
    // Include root page if configured
    if (this.config.includeRoot) {
      const rootPage = this.pageMap.get(this.config.rootPageId);
      if (rootPage) {
        includedPages.push(rootPage);
      }
    }

    // Include all descendants of root page
    const descendants = this.getDescendants(this.config.rootPageId);
    for (const pageId of descendants) {
      const page = this.pageMap.get(pageId);
      if (page) {
        includedPages.push(page);
      }
    }

    this.stats.includedPages = includedPages.length;
    this.stats.filteredPages = this.stats.totalPages - this.stats.includedPages;

    logger.info('Pages filtered by root page', {
      rootPageId: this.config.rootPageId,
      totalPages: this.stats.totalPages,
      includedPages: this.stats.includedPages,
      filteredPages: this.stats.filteredPages,
    });

    return includedPages;
  }

  /**
   * Checks if a page should be included in the filtered result
   */
  shouldIncludePage(pageId: string): boolean {
    if (!this.stats.rootPageFound) {
      return true; // No filtering if root not found
    }

    if (pageId === this.config.rootPageId) {
      return this.config.includeRoot;
    }

    // Check if page is a descendant of root
    const ancestors = this.ancestorMap.get(pageId) || [];
    return ancestors.includes(this.config.rootPageId);
  }

  /**
   * Gets filter statistics
   */
  getStats(): RootFilterStats {
    return { ...this.stats };
  }

  /**
   * Logs filter summary
   */
  logSummary(): void {
    if (!this.stats.rootPageFound) {
      logger.warn('Root page filter summary: root page not found', {
        rootPageId: this.config.rootPageId,
      });
      return;
    }

    logger.info('Root page filter summary', {
      rootPageId: this.config.rootPageId,
      rootPageTitle: this.stats.rootPageTitle,
      totalPages: this.stats.totalPages,
      includedPages: this.stats.includedPages,
      filteredPages: this.stats.filteredPages,
      filterEfficiency: this.stats.totalPages > 0 
        ? `${((this.stats.filteredPages / this.stats.totalPages) * 100).toFixed(1)}% filtered out`
        : 'N/A',
    });
  }

  /**
   * Gets all descendants of a page recursively
   */
  private getDescendants(pageId: string): Set<string> {
    const descendants = new Set<string>();
    const children = this.childrenMap.get(pageId);
    
    if (children) {
      for (const childId of children) {
        descendants.add(childId);
        // Recursively add grandchildren
        const grandchildren = this.getDescendants(childId);
        for (const grandchildId of grandchildren) {
          descendants.add(grandchildId);
        }
      }
    }
    
    return descendants;
  }

  /**
   * Builds ancestor chain for a page
   */
  private buildAncestorChain(pageId: string): string[] {
    const existing = this.ancestorMap.get(pageId);
    if (existing) {
      return existing;
    }

    const page = this.pageMap.get(pageId);
    if (!page || !page.parentId) {
      this.ancestorMap.set(pageId, []);
      return [];
    }

    const parentAncestors = this.buildAncestorChain(page.parentId);
    const ancestors = [page.parentId, ...parentAncestors];
    this.ancestorMap.set(pageId, ancestors);
    
    return ancestors;
  }
}

/**
 * Creates a root page filter from configuration
 */
export function createRootPageFilter(rootPageId?: string, includeRoot = true): RootPageFilter | null {
  if (!rootPageId) {
    return null;
  }

  return new RootPageFilter(rootPageId, includeRoot);
}
