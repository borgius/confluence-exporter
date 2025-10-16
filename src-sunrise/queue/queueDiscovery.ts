/**
 * T089: Queue discovery hook handlers
 * Supports FR-038 for queue discovery and dependency resolution
 */

import type { QueueItem, DownloadQueue, IQueueDiscovery } from '../models/queueEntities.js';

export interface DiscoveryContext {
  spaceKey: string;
  currentPageId?: string;
  discoveryDepth: number;
  maxDepth: number;
  sourceType: QueueItem['sourceType'];
}

export interface DiscoveryResult {
  newItems: QueueItem[];
  skippedItems: string[];
  reason?: string;
}

export interface DiscoveryHookResult {
  shouldAdd: boolean;
  reason?: string;
  modifiedItem?: Partial<QueueItem>;
}

export type DiscoveryHook = (
  pageId: string,
  context: DiscoveryContext,
  queue: DownloadQueue
) => DiscoveryHookResult | Promise<DiscoveryHookResult>;

export class QueueDiscoveryService implements IQueueDiscovery {
  private hooks: DiscoveryHook[] = [];
  private circularDetection = new Map<string, Set<string>>();

  constructor(private maxDiscoveryDepth = 3) {}

  /**
   * Register a discovery hook.
   */
  addHook(hook: DiscoveryHook): void {
    this.hooks.push(hook);
  }

  /**
   * Remove a discovery hook.
   */
  removeHook(hook: DiscoveryHook): void {
    const index = this.hooks.indexOf(hook);
    if (index !== -1) {
      this.hooks.splice(index, 1);
    }
  }

  /**
   * Clear all discovery hooks.
   */
  clearHooks(): void {
    this.hooks = [];
  }

  /**
   * Discover page dependencies and add to queue.
   */
  async discoverPageDependencies(
    pageId: string,
    context: DiscoveryContext,
    queue: DownloadQueue
  ): Promise<DiscoveryResult> {
    const newItems: QueueItem[] = [];
    const skippedItems: string[] = [];

    // Check discovery depth limits
    if (context.discoveryDepth >= context.maxDepth) {
      return {
        newItems,
        skippedItems: [pageId],
        reason: 'Maximum discovery depth reached',
      };
    }

    // Check for circular dependencies
    if (this.hasCircularDependency(pageId, context.currentPageId)) {
      skippedItems.push(pageId);
      return {
        newItems,
        skippedItems,
        reason: 'Circular dependency detected',
      };
    }

    // Check if already processed or queued
    if (this.isAlreadyKnown(pageId, queue)) {
      skippedItems.push(pageId);
      return {
        newItems,
        skippedItems,
        reason: 'Page already known',
      };
    }

    // Apply discovery hooks
    const hookResult = await this.applyDiscoveryHooks(pageId, context, queue);
    if (!hookResult.shouldAdd) {
      skippedItems.push(pageId);
      return {
        newItems,
        skippedItems,
        reason: hookResult.reason || 'Rejected by discovery hook',
      };
    }

    // Create queue item
    const queueItem = this.createQueueItem(pageId, context, hookResult.modifiedItem);
    newItems.push(queueItem);

    // Update circular detection tracking
    this.updateCircularTracking(pageId, context.currentPageId);

    return { newItems, skippedItems };
  }

  /**
   * Discover dependencies from page content.
   */
  async discoverFromContent(
    content: string,
    context: DiscoveryContext,
    queue: DownloadQueue
  ): Promise<DiscoveryResult> {
    const discoveredPageIds = this.extractPageReferences(content);
    const allNewItems: QueueItem[] = [];
    const allSkippedItems: string[] = [];

    for (const pageId of discoveredPageIds) {
      const result = await this.discoverPageDependencies(pageId, context, queue);
      allNewItems.push(...result.newItems);
      allSkippedItems.push(...result.skippedItems);
    }

    return {
      newItems: allNewItems,
      skippedItems: allSkippedItems,
    };
  }

  /**
   * Discover macro dependencies.
   */
  async discoverMacroDependencies(
    macroContent: string,
    context: DiscoveryContext,
    queue: DownloadQueue
  ): Promise<DiscoveryResult> {
    const macroContext = {
      ...context,
      sourceType: 'macro' as const,
      discoveryDepth: context.discoveryDepth + 1,
    };

    // Extract page references from macro parameters
    const pageIds = this.extractMacroPageReferences(macroContent);
    const allNewItems: QueueItem[] = [];
    const allSkippedItems: string[] = [];

    for (const pageId of pageIds) {
      const result = await this.discoverPageDependencies(pageId, macroContext, queue);
      allNewItems.push(...result.newItems);
      allSkippedItems.push(...result.skippedItems);
    }

    return {
      newItems: allNewItems,
      skippedItems: allSkippedItems,
    };
  }

  /**
   * Check discovery queue capacity.
   */
  checkDiscoveryCapacity(queue: DownloadQueue, additionalItems: number): boolean {
    const currentSize = queue.items?.size || 0;
    const totalAfterAddition = currentSize + additionalItems;

    return totalAfterAddition <= queue.maxQueueSize;
  }

  /**
   * Get discovery statistics.
   */
  getDiscoveryStats(queue: DownloadQueue): {
    totalDiscovered: number;
    bySourceType: Record<string, number>;
    circularReferencesDetected: number;
    averageDiscoveryDepth: number;
  } {
    const bySourceType: Record<string, number> = {};
    let totalDepth = 0;
    let depthCount = 0;

    if (queue.items) {
      for (const item of queue.items.values()) {
        bySourceType[item.sourceType] = (bySourceType[item.sourceType] || 0) + 1;
        
        // Calculate depth from discovery timestamp patterns
        const depth = this.estimateDiscoveryDepth(item);
        totalDepth += depth;
        depthCount++;
      }
    }

    return {
      totalDiscovered: queue.items?.size || 0,
      bySourceType,
      circularReferencesDetected: this.circularDetection.size,
      averageDiscoveryDepth: depthCount > 0 ? totalDepth / depthCount : 0,
    };
  }

  private async applyDiscoveryHooks(
    pageId: string,
    context: DiscoveryContext,
    queue: DownloadQueue
  ): Promise<DiscoveryHookResult> {
    const result: DiscoveryHookResult = { shouldAdd: true };

    for (const hook of this.hooks) {
      try {
        const hookResult = await hook(pageId, context, queue);
        
        if (!hookResult.shouldAdd) {
          return hookResult; // First rejection wins
        }

        // Merge modifications
        if (hookResult.modifiedItem) {
          result.modifiedItem = {
            ...result.modifiedItem,
            ...hookResult.modifiedItem,
          };
        }
      } catch (error) {
        // Hook failure should not prevent discovery
        console.warn(`Discovery hook failed for ${pageId}:`, error);
      }
    }

    return result;
  }

  private hasCircularDependency(pageId: string, currentPageId?: string): boolean {
    if (!currentPageId) return false;

    // Check if adding this dependency would create a cycle
    const dependencies = this.circularDetection.get(currentPageId);
    if (dependencies?.has(pageId)) {
      return true;
    }

    // Check for deeper cycles using DFS
    return this.detectCycleDFS(pageId, currentPageId, new Set([currentPageId]));
  }

  private detectCycleDFS(targetPageId: string, currentPageId: string, visited: Set<string>): boolean {
    const dependencies = this.circularDetection.get(currentPageId);
    if (!dependencies) return false;

    for (const depPageId of dependencies) {
      if (depPageId === targetPageId) {
        return true; // Cycle found
      }

      if (!visited.has(depPageId)) {
        visited.add(depPageId);
        if (this.detectCycleDFS(targetPageId, depPageId, visited)) {
          return true;
        }
        visited.delete(depPageId);
      }
    }

    return false;
  }

  private isAlreadyKnown(pageId: string, queue: DownloadQueue): boolean {
    // Check if in items map
    if (queue.items?.has(pageId)) {
      return true;
    }

    // Check if in processed pages
    if (queue.processedPages?.has(pageId)) {
      return true;
    }

    return false;
  }

  private createQueueItem(
    pageId: string,
    context: DiscoveryContext,
    modifications?: Partial<QueueItem>
  ): QueueItem {
    const baseItem: QueueItem = {
      pageId,
      sourceType: context.sourceType,
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      parentPageId: context.currentPageId,
      status: 'pending',
    };

    if (modifications) {
      return { ...baseItem, ...modifications };
    }

    return baseItem;
  }

  private updateCircularTracking(pageId: string, currentPageId?: string): void {
    if (!currentPageId) return;

    if (!this.circularDetection.has(currentPageId)) {
      this.circularDetection.set(currentPageId, new Set());
    }

    const dependencies = this.circularDetection.get(currentPageId);
    if (dependencies) {
      dependencies.add(pageId);
    }
  }

  private extractPageReferences(content: string): string[] {
    const pageIds: string[] = [];

    // Extract Confluence page links
    const pageLinkRegex = /\[([^\]]+)\]\(\/spaces\/[^/]+\/pages\/(\d+)\/[^)]+\)/g;
    
    let match = pageLinkRegex.exec(content);
    while (match !== null) {
      pageIds.push(match[2]);
      match = pageLinkRegex.exec(content);
    }

    // Extract user mentions that might reference user pages
    const userMentionRegex = /@([a-zA-Z0-9._-]+)/g;
    match = userMentionRegex.exec(content);
    while (match !== null) {
      // User pages would need to be resolved separately
      // This is a placeholder for user page discovery
      match = userMentionRegex.exec(content);
    }

    // Extract attachment references
    const attachmentRegex = /!\[([^\]]*)\]\(\/download\/attachments\/(\d+)\/[^)]+\)/g;
    match = attachmentRegex.exec(content);
    while (match !== null) {
      pageIds.push(match[2]);
      match = attachmentRegex.exec(content);
    }

    return [...new Set(pageIds)]; // Remove duplicates
  }

  private extractMacroPageReferences(macroContent: string): string[] {
    const pageIds: string[] = [];

    // Extract page parameters from macro content
    const pageParamRegex = /page[^=]*=["']?(\d+)["']?/g;
    
    let match = pageParamRegex.exec(macroContent);
    while (match !== null) {
      pageIds.push(match[1]);
      match = pageParamRegex.exec(macroContent);
    }

    // Extract space and title combinations that need resolution
    const spaceTitleRegex = /space=["']?([^"'\s]+)["']?[^>]*title=["']?([^"']+)["']?/g;
    match = spaceTitleRegex.exec(macroContent);
    while (match !== null) {
      // These would need to be resolved to page IDs via API
      // This is a placeholder for space/title resolution
      match = spaceTitleRegex.exec(macroContent);
    }

    return [...new Set(pageIds)];
  }

  private estimateDiscoveryDepth(item: QueueItem): number {
    // Estimate depth based on source type
    const baseDepths = {
      initial: 0,
      reference: 1,
      macro: 2,
      user: 1,
    };

    return baseDepths[item.sourceType] || 1;
  }
}

/**
 * Default discovery hooks for common use cases.
 */
export const defaultDiscoveryHooks = {
  /**
   * Skip pages that are too old.
   */
  skipOldPages: (_maxAgeMs: number): DiscoveryHook => {
    return (_pageId, _context, _queue) => {
      // This would need actual page metadata to implement
      // For now, always allow
      return { shouldAdd: true };
    };
  },

  /**
   * Skip pages from excluded spaces.
   */
  skipExcludedSpaces: (excludedSpaces: string[]): DiscoveryHook => {
    return (_pageId, context, _queue) => {
      if (excludedSpaces.includes(context.spaceKey)) {
        return {
          shouldAdd: false,
          reason: `Space ${context.spaceKey} is excluded`,
        };
      }
      return { shouldAdd: true };
    };
  },

  /**
   * Limit discovery by source type.
   */
  limitBySourceType: (allowedTypes: QueueItem['sourceType'][]): DiscoveryHook => {
    return (_pageId, context, _queue) => {
      if (!allowedTypes.includes(context.sourceType)) {
        return {
          shouldAdd: false,
          reason: `Source type ${context.sourceType} not allowed`,
        };
      }
      return { shouldAdd: true };
    };
  },

  /**
   * Add custom metadata to discovered items.
   */
  addMetadata: (_metadata: Record<string, unknown>): DiscoveryHook => {
    return (_pageId, _context, _queue) => {
      return {
        shouldAdd: true,
        modifiedItem: {
          // Custom metadata would be added to a metadata field
          // This is a placeholder for the pattern
        },
      };
    };
  },
};

/**
 * Create a discovery service with common configuration.
 */
export function createDiscoveryService(config: {
  maxDepth?: number;
  excludedSpaces?: string[];
  allowedSourceTypes?: QueueItem['sourceType'][];
  maxPageAge?: number;
}): QueueDiscoveryService {
  const service = new QueueDiscoveryService(config.maxDepth);

  if (config.excludedSpaces) {
    service.addHook(defaultDiscoveryHooks.skipExcludedSpaces(config.excludedSpaces));
  }

  if (config.allowedSourceTypes) {
    service.addHook(defaultDiscoveryHooks.limitBySourceType(config.allowedSourceTypes));
  }

  if (config.maxPageAge) {
    service.addHook(defaultDiscoveryHooks.skipOldPages(config.maxPageAge));
  }

  return service;
}
