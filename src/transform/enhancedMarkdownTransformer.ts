/**
 * @fileoverview Enhanced markdown transformer with cleanup and queue discovery.
 * 
 * Extends basic markdown transformation with content cleanup and dynamic
 * discovery of additional pages through macro expansion and link analysis.
 * Supports queue-based processing for comprehensive content export.
 * 
 * Implements FR-035 for comprehensive markdown processing with queue population.
 */

import type { Page } from '../models/entities.js';
import type { QueueItem } from '../models/queueEntities.js';
import type { CleanupContext } from '../models/markdownCleanup.js';
import type { MarkdownTransformResult, TransformContext } from './markdownTransformer.js';
import { MarkdownCleanupService, type CleanupServiceConfig, type CleanupServiceResult } from '../services/markdownCleanupService.js';
import { LinkDiscovery, type LinkDiscoveryConfig, type LinkDiscoveryResult } from './linkDiscovery.js';
import { MacroDiscovery, type MacroDiscoveryConfig, type MacroDiscoveryResult } from './macroDiscovery.js';
import { UserDiscovery, type UserDiscoveryConfig, type UserDiscoveryResult } from './userDiscovery.js';
import { logger } from '../util/logger.js';

/**
 * Interface for the base transformer to avoid importing the class.
 */
export interface IMarkdownTransformer {
  transform(page: Page, context: TransformContext): Promise<MarkdownTransformResult>;
}

/**
 * Enhanced transformation result including cleanup and discovery data.
 */
export interface EnhancedTransformResult extends MarkdownTransformResult {
  /** Optional cleanup processing result if cleanup was enabled */
  cleanupResult?: CleanupServiceResult;
  /** Discovery results for queue population */
  discoveryResult: QueueDiscoveryResult;
  /** Performance metrics for the transformation process */
  metrics: EnhancedTransformMetrics;
}

/**
 * Results of queue discovery analysis including all discovered content.
 */
export interface QueueDiscoveryResult {
  /** Queue items ready for processing */
  queueItems: QueueItem[];
  /** Link discovery analysis results */
  linkDiscovery: LinkDiscoveryResult;
  /** Macro expansion discovery results */
  macroDiscovery: MacroDiscoveryResult;
  /** User reference discovery results */
  userDiscovery: UserDiscoveryResult;
  /** Total number of items discovered across all sources */
  totalItemsDiscovered: number;
}

/**
 * Performance metrics for enhanced transformation process.
 */
export interface EnhancedTransformMetrics {
  /** Time spent on base markdown transformation */
  transformTimeMs: number;
  /** Time spent on cleanup processing (if enabled) */
  cleanupTimeMs?: number;
  /** Time spent on discovery analysis */
  discoveryTimeMs: number;
  /** Total processing time including all phases */
  totalProcessingTimeMs: number;
  /** Content size before processing */
  contentSizeBefore: number;
  /** Content size after processing */
  contentSizeAfter: number;
}

/**
 * Configuration for enhanced transformation features.
 */
export interface EnhancedTransformConfig {
  /** Cleanup service configuration */
  cleanup: Partial<CleanupServiceConfig>;
  /** Link discovery configuration */
  linkDiscovery: Partial<LinkDiscoveryConfig>;
  /** Macro discovery configuration */
  macroDiscovery: Partial<MacroDiscoveryConfig>;
  /** User discovery configuration */
  userDiscovery: Partial<UserDiscoveryConfig>;
  /** Enable content cleanup processing */
  enableCleanup: boolean;
  /** Enable queue discovery for dynamic content */
  enableQueueDiscovery: boolean;
  /** Fail transformation if cleanup encounters errors */
  failOnCleanupError: boolean;
  /** Fail transformation if discovery encounters errors */
  failOnDiscoveryError: boolean;
}

/**
 * Enhanced markdown transformer that extends basic transformation with:
 * - Content cleanup and typography enhancement
 * - Dynamic content discovery for queue processing
 * - Performance monitoring and error handling
 * 
 * Wraps a base transformer and adds comprehensive post-processing capabilities
 * for high-quality markdown output and dynamic content exploration.
 * 
 * @example
 * ```typescript
 * const enhanced = new EnhancedMarkdownTransformer(baseTransformer, {
 *   enableCleanup: true,
 *   enableQueueDiscovery: true,
 *   cleanup: { intensity: 'medium' }
 * });
 * 
 * const result = await enhanced.transform(page, context);
 * console.log(`Discovered ${result.discoveryResult.totalItemsDiscovered} new items`);
 * ```
 */
export class EnhancedMarkdownTransformer {
  private readonly baseTransformer: IMarkdownTransformer;
  private readonly cleanupService?: MarkdownCleanupService;
  private linkDiscovery?: LinkDiscovery;
  private macroDiscovery?: MacroDiscovery;
  private userDiscovery?: UserDiscovery;
  private readonly config: EnhancedTransformConfig;

  /**
   * Creates a new enhanced transformer with the specified base transformer and configuration.
   * 
   * @param baseTransformer - Base markdown transformer to extend
   * @param config - Optional configuration for enhanced features
   */
  constructor(
    baseTransformer: IMarkdownTransformer,
    config: Partial<EnhancedTransformConfig> = {}
  ) {
    this.baseTransformer = baseTransformer;
    this.config = {
      cleanup: {},
      linkDiscovery: {},
      macroDiscovery: {},
      userDiscovery: {},
      enableCleanup: true,
      enableQueueDiscovery: true,
      failOnCleanupError: false,
      failOnDiscoveryError: false,
      ...config,
    };

    // Initialize services based on configuration
    if (this.config.enableCleanup) {
      this.cleanupService = new MarkdownCleanupService(this.config.cleanup);
    }

    if (this.config.enableQueueDiscovery) {
      // Services will be initialized when baseUrl is available from context
    }
  }

  /**
   * Transform page with enhanced cleanup and queue discovery
   */
  async transform(page: Page, context: TransformContext): Promise<EnhancedTransformResult> {
    const startTime = Date.now();
    const metrics: EnhancedTransformMetrics = {
      transformTimeMs: 0,
      discoveryTimeMs: 0,
      totalProcessingTimeMs: 0,
      contentSizeBefore: page.bodyStorage?.length || 0,
      contentSizeAfter: 0,
    };

    try {
      // Initialize discovery services with context
      this.initializeDiscoveryServices(context);

      // Step 1: Base transformation
      logger.debug(`Starting enhanced transformation for page ${page.id}`);
      const baseResult = await this.performBaseTransformation(page, context, metrics);

      // Step 2: Cleanup processing
      const cleanupResult = await this.performCleanupProcessing(baseResult.content, page, context, metrics);
      const finalContent = cleanupResult?.content || baseResult.content;

      // Step 3: Queue discovery
      const discoveryResult = await this.performQueueDiscovery(finalContent, baseResult, context.currentPageId);

      // Calculate final metrics
      metrics.contentSizeAfter = finalContent.length;
      metrics.totalProcessingTimeMs = Date.now() - startTime;

      logger.info(`Enhanced transformation completed for page ${page.id}: ` +
        `${discoveryResult.totalItemsDiscovered} queue items discovered, ` +
        `${cleanupResult?.rulesApplied.length || 0} cleanup rules applied`);

      return {
        ...baseResult,
        content: finalContent,
        cleanupResult,
        discoveryResult,
        metrics,
      };

    } catch (error) {
      metrics.totalProcessingTimeMs = Date.now() - startTime;
      logger.error(`Enhanced transformation failed for page ${page.id}:`, error);
      throw error;
    }
  }

  private async performBaseTransformation(
    page: Page,
    context: TransformContext,
    metrics: EnhancedTransformMetrics
  ): Promise<MarkdownTransformResult> {
    const transformStartTime = Date.now();
    const baseResult = await this.baseTransformer.transform(page, context);
    metrics.transformTimeMs = Date.now() - transformStartTime;
    return baseResult;
  }

  private async performCleanupProcessing(
    content: string,
    page: Page,
    context: TransformContext,
    metrics: EnhancedTransformMetrics
  ): Promise<CleanupServiceResult | undefined> {
    if (!this.config.enableCleanup || !this.cleanupService) {
      return undefined;
    }

    try {
      const cleanupStartTime = Date.now();
      const cleanupContext: CleanupContext = {
        fileName: `${page.title || page.id}.md`,
        spaceKey: context.spaceKey,
        pageId: page.id,
        filePath: undefined,
      };

      const cleanupResult = await this.cleanupService.cleanup(content, cleanupContext);
      metrics.cleanupTimeMs = Date.now() - cleanupStartTime;

      if (!cleanupResult.success && this.config.failOnCleanupError) {
        throw new Error(`Cleanup failed: ${cleanupResult.rulesFailed.join(', ')}`);
      }

      logger.debug(`Cleanup applied ${cleanupResult.rulesApplied.length} rules for page ${page.id}`);
      return cleanupResult;
    } catch (error) {
      logger.error(`Cleanup failed for page ${page.id}:`, error);
      if (this.config.failOnCleanupError) {
        throw error;
      }
      return undefined;
    }
  }

  private initializeDiscoveryServices(context: TransformContext): void {
    if (!this.config.enableQueueDiscovery) {
      return;
    }

    if (!this.linkDiscovery) {
      this.linkDiscovery = new LinkDiscovery(context.baseUrl, this.config.linkDiscovery);
    }

    if (!this.macroDiscovery) {
      this.macroDiscovery = new MacroDiscovery(context.spaceKey, this.config.macroDiscovery);
    }

    if (!this.userDiscovery) {
      this.userDiscovery = new UserDiscovery(context.baseUrl, this.config.userDiscovery);
    }
  }

  private async performQueueDiscovery(
    content: string,
    baseResult: MarkdownTransformResult,
    sourcePageId: string
  ): Promise<QueueDiscoveryResult> {
    const allQueueItems: QueueItem[] = [];
    
    // Default empty results
    let linkDiscovery: LinkDiscoveryResult = {
      queueItems: [],
      linksFound: 0,
      internalLinks: 0,
      externalLinks: 0,
    };
    
    let macroDiscovery: MacroDiscoveryResult = {
      queueItems: [],
      macrosFound: 0,
      listChildrenMacros: 0,
      userMentionMacros: 0,
      otherMacros: 0,
    };
    
    let userDiscovery: UserDiscoveryResult = {
      queueItems: [],
      usersFound: 0,
      userMentions: 0,
      userProfiles: 0,
    };

    if (!this.config.enableQueueDiscovery) {
      return {
        queueItems: [],
        linkDiscovery,
        macroDiscovery,
        userDiscovery,
        totalItemsDiscovered: 0,
      };
    }

    try {
      // Link discovery
      if (this.linkDiscovery) {
        linkDiscovery = this.linkDiscovery.discoverFromContent(
          content,
          sourcePageId,
          baseResult.links
        );
        allQueueItems.push(...linkDiscovery.queueItems);
      }

      // Macro discovery
      if (this.macroDiscovery) {
        macroDiscovery = this.macroDiscovery.discoverFromContent(content, sourcePageId);
        allQueueItems.push(...macroDiscovery.queueItems);
      }

      // User discovery
      if (this.userDiscovery) {
        userDiscovery = this.userDiscovery.discoverFromContent(content, sourcePageId);
        allQueueItems.push(...userDiscovery.queueItems);
      }

      // Deduplicate queue items by pageId
      const uniqueQueueItems = this.deduplicateQueueItems(allQueueItems);

      return {
        queueItems: uniqueQueueItems,
        linkDiscovery,
        macroDiscovery,
        userDiscovery,
        totalItemsDiscovered: uniqueQueueItems.length,
      };

    } catch (error) {
      logger.error(`Queue discovery failed for page ${sourcePageId}:`, error);
      
      if (this.config.failOnDiscoveryError) {
        throw error;
      }

      return {
        queueItems: [],
        linkDiscovery,
        macroDiscovery,
        userDiscovery,
        totalItemsDiscovered: 0,
      };
    }
  }

  private deduplicateQueueItems(queueItems: QueueItem[]): QueueItem[] {
    const seen = new Set<string>();
    const unique: QueueItem[] = [];

    for (const item of queueItems) {
      if (!seen.has(item.pageId)) {
        seen.add(item.pageId);
        unique.push(item);
      }
    }

    return unique;
  }

  /**
   * Get configuration for the enhanced transformer
   */
  getConfig(): EnhancedTransformConfig {
    return { ...this.config };
  }

  /**
   * Check if cleanup is enabled
   */
  isCleanupEnabled(): boolean {
    return this.config.enableCleanup && !!this.cleanupService;
  }

  /**
   * Check if queue discovery is enabled
   */
  isQueueDiscoveryEnabled(): boolean {
    return this.config.enableQueueDiscovery;
  }
}

export const createEnhancedMarkdownTransformer = (
  baseTransformer: IMarkdownTransformer,
  config?: Partial<EnhancedTransformConfig>
): EnhancedMarkdownTransformer => {
  return new EnhancedMarkdownTransformer(baseTransformer, config);
};
