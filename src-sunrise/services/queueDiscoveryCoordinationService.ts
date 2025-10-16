/**
 * T114a: Queue discovery coordination service
 * Orchestrates multiple discovery sources for comprehensive page reference extraction
 */

import type { QueueItem } from '../models/queueEntities.js';
import type { LinkExtraction } from '../transform/markdownTransformer.js';
import type { LinkDiscoveryResult } from '../transform/linkDiscovery.js';
import type { MacroDiscoveryResult } from '../transform/macroDiscovery.js';
import type { UserDiscoveryResult } from '../transform/userDiscovery.js';
import { LinkDiscovery } from '../transform/linkDiscovery.js';
import { MacroDiscovery } from '../transform/macroDiscovery.js';
import { UserDiscovery } from '../transform/userDiscovery.js';
import { logger } from '../util/logger.js';

export interface DiscoverySource {
  name: string;
  enabled: boolean;
  priority: number;
  timeout: number;
}

export interface DiscoveryCoordinationConfig {
  sources: {
    links: DiscoverySource;
    macros: DiscoverySource;
    users: DiscoverySource;
  };
  deduplication: boolean;
  maxConcurrentDiscovery: number;
  discoveryTimeout: number;
  retryFailedDiscovery: boolean;
  maxRetries: number;
}

export interface DiscoveryResult {
  sourceType: string;
  itemsFound: number;
  processingTimeMs: number;
  errors: string[];
  success: boolean;
}

export interface CoordinatedDiscoveryResult {
  totalItemsFound: number;
  totalProcessingTimeMs: number;
  sourceResults: DiscoveryResult[];
  uniqueItems: QueueItem[];
  duplicatesRemoved: number;
  errors: string[];
  success: boolean;
}

export interface DiscoveryContext {
  spaceKey: string;
  content: string;
  pageId: string;
  parentPageId?: string;
  baseUrl: string;
  extractedLinks?: LinkExtraction[];
}

/**
 * Coordinates multiple discovery services to find comprehensive page references.
 */
export class QueueDiscoveryCoordinationService {
  private readonly linkDiscovery: LinkDiscovery;
  private readonly macroDiscovery: MacroDiscovery;
  private readonly userDiscovery: UserDiscovery;
  private readonly config: DiscoveryCoordinationConfig;

  constructor(baseUrl: string, spaceKey: string, config: Partial<DiscoveryCoordinationConfig> = {}) {
    this.config = {
      sources: {
        links: {
          name: 'Link Discovery',
          enabled: true,
          priority: 1,
          timeout: 5000,
        },
        macros: {
          name: 'Macro Discovery',
          enabled: true,
          priority: 2,
          timeout: 5000,
        },
        users: {
          name: 'User Discovery',
          enabled: true,
          priority: 3,
          timeout: 5000,
        },
      },
      deduplication: true,
      maxConcurrentDiscovery: 3,
      discoveryTimeout: 15000,
      retryFailedDiscovery: true,
      maxRetries: 2,
      ...config,
    };

    // Initialize discovery services with proper configuration
    this.linkDiscovery = new LinkDiscovery(baseUrl);
    this.macroDiscovery = new MacroDiscovery(spaceKey);
    this.userDiscovery = new UserDiscovery(baseUrl);
  }

  /**
   * Coordinate discovery from all enabled sources.
   */
  async discoverFromContent(context: DiscoveryContext): Promise<CoordinatedDiscoveryResult> {
    const startTime = Date.now();
    const sourceResults: DiscoveryResult[] = [];
    const allItems: QueueItem[] = [];
    const globalErrors: string[] = [];

    try {
      logger.debug(`Starting coordinated discovery for page ${context.pageId}`);

      // Get enabled sources sorted by priority
      const enabledSources = this.getEnabledSources();
      
      if (enabledSources.length === 0) {
        return this.createEmptyResult(startTime, ['No discovery sources enabled']);
      }

      // Run discovery sources sequentially to avoid complexity
      for (const source of enabledSources) {
        try {
          const result = await this.runSingleDiscoverySource(source, context);
          sourceResults.push(result);
          
          if (result.success) {
            const items = await this.extractItemsFromSourceResult(source.name.toLowerCase(), context);
            allItems.push(...items);
          } else {
            globalErrors.push(...result.errors);
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          sourceResults.push({
            sourceType: source.name,
            itemsFound: 0,
            processingTimeMs: 0,
            errors: [errorMessage],
            success: false,
          });
          globalErrors.push(`${source.name} failed: ${errorMessage}`);
        }
      }

      // Deduplicate items if enabled
      const { uniqueItems, duplicatesRemoved } = this.config.deduplication 
        ? this.deduplicateItems(allItems)
        : { uniqueItems: allItems, duplicatesRemoved: 0 };

      const totalProcessingTimeMs = Date.now() - startTime;
      const success = sourceResults.some(r => r.success) && globalErrors.length === 0;

      logger.debug(`Coordinated discovery completed: ${uniqueItems.length} unique items found, ${duplicatesRemoved} duplicates removed`);

      return {
        totalItemsFound: uniqueItems.length,
        totalProcessingTimeMs,
        sourceResults,
        uniqueItems,
        duplicatesRemoved,
        errors: globalErrors,
        success,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Coordinated discovery failed:', error);
      
      return this.createEmptyResult(startTime, [errorMessage]);
    }
  }

  /**
   * Run discovery for a single source with timeout and retry logic.
   */
  private async runSingleDiscoverySource(
    source: DiscoverySource,
    context: DiscoveryContext,
    retryCount = 0
  ): Promise<DiscoveryResult> {
    const startTime = Date.now();

    try {
      logger.debug(`Running discovery source: ${source.name}`);

      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Discovery timeout after ${source.timeout}ms`)), source.timeout);
      });

      // Run discovery with timeout
      const result = await Promise.race([
        this.executeDiscoverySource(source.name.toLowerCase(), context),
        timeoutPromise
      ]);

      const processingTimeMs = Date.now() - startTime;
      logger.debug(`Discovery source ${source.name} completed in ${processingTimeMs}ms`);

      return {
        sourceType: source.name,
        itemsFound: this.getItemCount(result),
        processingTimeMs,
        errors: [],
        success: true,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const processingTimeMs = Date.now() - startTime;

      logger.warn(`Discovery source ${source.name} failed (attempt ${retryCount + 1}): ${errorMessage}`);

      // Retry logic
      if (this.config.retryFailedDiscovery && retryCount < this.config.maxRetries) {
        const delay = 1000 * Math.pow(2, retryCount); // Exponential backoff
        await this.sleep(delay);
        return this.runSingleDiscoverySource(source, context, retryCount + 1);
      }

      return {
        sourceType: source.name,
        itemsFound: 0,
        processingTimeMs,
        errors: [errorMessage],
        success: false,
      };
    }
  }

  /**
   * Execute discovery for a specific source.
   */
  private async executeDiscoverySource(
    sourceName: string, 
    context: DiscoveryContext
  ): Promise<LinkDiscoveryResult | MacroDiscoveryResult | UserDiscoveryResult> {
    switch (sourceName.toLowerCase()) {
      case 'link discovery':
        return this.linkDiscovery.discoverFromContent(
          context.content,
          context.pageId,
          context.extractedLinks || []
        );
      case 'macro discovery':
        return this.macroDiscovery.discoverFromContent(context.content, context.pageId);
      case 'user discovery':
        return this.userDiscovery.discoverFromContent(context.content, context.pageId);
      default:
        throw new Error(`Unknown discovery source: ${sourceName}`);
    }
  }

  /**
   * Extract queue items from discovery result.
   */
  private async extractItemsFromSourceResult(
    sourceName: string, 
    context: DiscoveryContext
  ): Promise<QueueItem[]> {
    const result = await this.executeDiscoverySource(sourceName, context);
    
    if ('queueItems' in result) {
      return result.queueItems;
    }
    
    return [];
  }

  /**
   * Get item count from discovery result.
   */
  private getItemCount(result: LinkDiscoveryResult | MacroDiscoveryResult | UserDiscoveryResult): number {
    if ('queueItems' in result) {
      return result.queueItems.length;
    }
    return 0;
  }

  /**
   * Create empty result for error cases.
   */
  private createEmptyResult(startTime: number, errors: string[]): CoordinatedDiscoveryResult {
    return {
      totalItemsFound: 0,
      totalProcessingTimeMs: Date.now() - startTime,
      sourceResults: [],
      uniqueItems: [],
      duplicatesRemoved: 0,
      errors,
      success: false,
    };
  }

  /**
   * Get enabled discovery sources sorted by priority.
   */
  private getEnabledSources(): DiscoverySource[] {
    const sources = Object.values(this.config.sources)
      .filter(source => source.enabled)
      .sort((a, b) => a.priority - b.priority);

    return sources;
  }

  /**
   * Remove duplicate items based on pageId.
   */
  private deduplicateItems(items: QueueItem[]): { uniqueItems: QueueItem[]; duplicatesRemoved: number } {
    const seen = new Set<string>();
    const uniqueItems: QueueItem[] = [];

    for (const item of items) {
      if (!seen.has(item.pageId)) {
        seen.add(item.pageId);
        uniqueItems.push(item);
      }
    }

    const duplicatesRemoved = items.length - uniqueItems.length;
    
    if (duplicatesRemoved > 0) {
      logger.debug(`Removed ${duplicatesRemoved} duplicate items during deduplication`);
    }

    return { uniqueItems, duplicatesRemoved };
  }

  /**
   * Sleep for the specified number of milliseconds.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get configuration.
   */
  getConfig(): DiscoveryCoordinationConfig {
    return { ...this.config };
  }

  /**
   * Update source configuration.
   */
  updateSourceConfig(
    sourceType: keyof DiscoveryCoordinationConfig['sources'], 
    config: Partial<DiscoverySource>
  ): void {
    this.config.sources[sourceType] = {
      ...this.config.sources[sourceType],
      ...config,
    };
  }

  /**
   * Enable or disable a discovery source.
   */
  setSourceEnabled(sourceType: keyof DiscoveryCoordinationConfig['sources'], enabled: boolean): void {
    this.config.sources[sourceType].enabled = enabled;
  }

  /**
   * Get discovery statistics.
   */
  getSourceStatistics(): {
    enabledSources: number;
    totalSources: number;
    sourceNames: string[];
  } {
    const sources = Object.values(this.config.sources);
    const enabledSources = sources.filter(s => s.enabled);

    return {
      enabledSources: enabledSources.length,
      totalSources: sources.length,
      sourceNames: enabledSources.map(s => s.name),
    };
  }
}
