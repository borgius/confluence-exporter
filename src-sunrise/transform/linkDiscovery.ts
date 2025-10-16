/**
 * T098a: Page link discovery and queue population
 * Extracts page references from markdown content for queue processing
 * Supports FR-033 for global download queue functionality
 */

import type { QueueItem } from '../models/queueEntities.js';
import type { LinkExtraction } from './markdownTransformer.js';
import { logger } from '../util/logger.js';

export interface LinkDiscoveryResult {
  queueItems: QueueItem[];
  linksFound: number;
  internalLinks: number;
  externalLinks: number;
}

export interface LinkDiscoveryConfig {
  enableInternalLinkDiscovery: boolean;
  enableAttachmentLinkDiscovery: boolean;
  maxLinksPerPage: number;
  excludeExternalDomains: string[];
}

export class LinkDiscovery {
  private readonly config: LinkDiscoveryConfig;
  private readonly baseUrl: string;

  constructor(baseUrl: string, config: Partial<LinkDiscoveryConfig> = {}) {
    this.baseUrl = baseUrl;
    this.config = {
      enableInternalLinkDiscovery: true,
      enableAttachmentLinkDiscovery: true,
      maxLinksPerPage: 100,
      excludeExternalDomains: [],
      ...config,
    };
  }

  /**
   * Discover page references from markdown content and create queue items
   */
  discoverFromContent(
    content: string,
    sourcePageId: string,
    links: LinkExtraction[]
  ): LinkDiscoveryResult {
    const queueItems: QueueItem[] = [];
    let internalLinks = 0;
    let externalLinks = 0;

    try {
      // Process extracted links
      for (const link of links.slice(0, this.config.maxLinksPerPage)) {
        if (link.isInternal && this.config.enableInternalLinkDiscovery) {
          const queueItem = this.createQueueItemFromLink(link, sourcePageId);
          if (queueItem) {
            queueItems.push(queueItem);
            internalLinks++;
          }
        } else if (!link.isInternal) {
          externalLinks++;
        }
      }

      // Discover additional page references from markdown syntax
      const additionalRefs = this.discoverFromMarkdownSyntax(content, sourcePageId);
      queueItems.push(...additionalRefs);

      logger.debug(`Link discovery completed for page ${sourcePageId}: ${queueItems.length} queue items created`);

      return {
        queueItems,
        linksFound: links.length,
        internalLinks,
        externalLinks,
      };
    } catch (error) {
      logger.error(`Link discovery failed for page ${sourcePageId}:`, error);
      return {
        queueItems: [],
        linksFound: 0,
        internalLinks: 0,
        externalLinks: 0,
      };
    }
  }

  /**
   * Discover page references from Confluence page links in content
   */
  discoverFromPageLinks(content: string, sourcePageId: string): QueueItem[] {
    const queueItems: QueueItem[] = [];
    
    // Match Confluence page URLs and extract page IDs
    const confluencePagePattern = new RegExp(
      `${this.escapeRegExp(this.baseUrl)}/(?:pages/)?(?:viewpage\\.action\\?pageId=|spaces/[^/]+/pages/)([0-9]+)`,
      'gi'
    );

    const matches = content.matchAll(confluencePagePattern);
    for (const match of matches) {
      const pageId = match[1];
      if (pageId && pageId !== sourcePageId) {
        queueItems.push({
          pageId,
          sourceType: 'reference',
          discoveryTimestamp: Date.now(),
          retryCount: 0,
          parentPageId: sourcePageId,
          status: 'pending',
        });
      }
    }

    return queueItems;
  }

  /**
   * Discover attachment references that might lead to pages
   */
  discoverFromAttachments(content: string, sourcePageId: string): QueueItem[] {
    if (!this.config.enableAttachmentLinkDiscovery) {
      return [];
    }

    const queueItems: QueueItem[] = [];
    
    // Match attachment URLs that might reference pages
    const attachmentPagePattern = new RegExp(
      `${this.escapeRegExp(this.baseUrl)}/download/attachments/([0-9]+)/`,
      'gi'
    );

    const matches = content.matchAll(attachmentPagePattern);
    for (const match of matches) {
      const pageId = match[1];
      if (pageId && pageId !== sourcePageId) {
        queueItems.push({
          pageId,
          sourceType: 'reference',
          discoveryTimestamp: Date.now(),
          retryCount: 0,
          parentPageId: sourcePageId,
          status: 'pending',
        });
      }
    }

    return queueItems;
  }

  private createQueueItemFromLink(link: LinkExtraction, sourcePageId: string): QueueItem | null {
    if (!link.pageId || link.pageId === sourcePageId) {
      return null;
    }

    return {
      pageId: link.pageId,
      sourceType: 'reference',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      parentPageId: sourcePageId,
      status: 'pending',
    };
  }

  private discoverFromMarkdownSyntax(content: string, sourcePageId: string): QueueItem[] {
    const queueItems: QueueItem[] = [];

    // Discover from page reference syntax like [[pageId|title]]
    const pageRefPattern = /\[\[([0-9]+)\|[^\]]*\]\]/g;
    const matches = content.matchAll(pageRefPattern);
    for (const match of matches) {
      const pageId = match[1];
      if (pageId && pageId !== sourcePageId) {
        queueItems.push({
          pageId,
          sourceType: 'reference',
          discoveryTimestamp: Date.now(),
          retryCount: 0,
          parentPageId: sourcePageId,
          status: 'pending',
        });
      }
    }

    // Discover from Confluence page links in markdown
    const confluenceRefs = this.discoverFromPageLinks(content, sourcePageId);
    queueItems.push(...confluenceRefs);

    // Discover from attachment references
    const attachmentRefs = this.discoverFromAttachments(content, sourcePageId);
    queueItems.push(...attachmentRefs);

    return queueItems;
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

export const createLinkDiscovery = (
  baseUrl: string, 
  config?: Partial<LinkDiscoveryConfig>
): LinkDiscovery => {
  return new LinkDiscovery(baseUrl, config);
};
