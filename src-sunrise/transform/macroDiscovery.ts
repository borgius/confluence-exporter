/**
 * T098b: Macro discovery and parsing
 * Handles list-children, user mentions, and other Confluence macros for queue population
 * Supports FR-033 for global download queue functionality
 */

import type { QueueItem } from '../models/queueEntities.js';
import { logger } from '../util/logger.js';

export interface MacroDiscoveryResult {
  queueItems: QueueItem[];
  macrosFound: number;
  listChildrenMacros: number;
  userMentionMacros: number;
  otherMacros: number;
}

export interface MacroDiscoveryConfig {
  enableListChildrenDiscovery: boolean;
  enableUserMentionDiscovery: boolean;
  enableContentByLabelDiscovery: boolean;
  maxMacrosPerPage: number;
  supportedMacroTypes: string[];
}

export interface MacroMatch {
  type: string;
  parameters: Record<string, string>;
  content?: string;
  fullMatch: string;
  startIndex: number;
  endIndex: number;
}

export class MacroDiscovery {
  private readonly config: MacroDiscoveryConfig;
  private readonly spaceKey: string;

  constructor(spaceKey: string, config: Partial<MacroDiscoveryConfig> = {}) {
    this.spaceKey = spaceKey;
    this.config = {
      enableListChildrenDiscovery: true,
      enableUserMentionDiscovery: true,
      enableContentByLabelDiscovery: true,
      maxMacrosPerPage: 50,
      supportedMacroTypes: ['children', 'children-display', 'content-by-label', 'user-mention', 'userinfo'],
      ...config,
    };
  }

  /**
   * Discover page references from Confluence macros in content
   */
  discoverFromContent(content: string, sourcePageId: string): MacroDiscoveryResult {
    const queueItems: QueueItem[] = [];
    let listChildrenMacros = 0;
    let userMentionMacros = 0;
    let otherMacros = 0;

    try {
      // Parse macro patterns from content
      const macros = this.parseMacros(content);
      
      for (const macro of macros.slice(0, this.config.maxMacrosPerPage)) {
        const macroQueueItems = this.processMacro(macro, sourcePageId);
        queueItems.push(...macroQueueItems);

        // Count macro types
        if (macro.type === 'children' || macro.type === 'children-display') {
          listChildrenMacros++;
        } else if (macro.type === 'user-mention' || macro.type === 'userinfo') {
          userMentionMacros++;
        } else {
          otherMacros++;
        }
      }

      logger.debug(`Macro discovery completed for page ${sourcePageId}: ${queueItems.length} queue items from ${macros.length} macros`);

      return {
        queueItems,
        macrosFound: macros.length,
        listChildrenMacros,
        userMentionMacros,
        otherMacros,
      };
    } catch (error) {
      logger.error(`Macro discovery failed for page ${sourcePageId}:`, error);
      return {
        queueItems: [],
        macrosFound: 0,
        listChildrenMacros: 0,
        userMentionMacros: 0,
        otherMacros: 0,
      };
    }
  }

  /**
   * Parse Confluence macros from content
   */
  parseMacros(content: string): MacroMatch[] {
    const macros: MacroMatch[] = [];

    // Parse structured macros (ac:structured-macro)
    const structuredMacros = this.parseStructuredMacros(content);
    macros.push(...structuredMacros);

    // Parse comment-style macros
    const commentMacros = this.parseCommentMacros(content);
    macros.push(...commentMacros);

    // Parse inline macros
    const inlineMacros = this.parseInlineMacros(content);
    macros.push(...inlineMacros);

    return macros.filter(macro => this.config.supportedMacroTypes.includes(macro.type));
  }

  private parseStructuredMacros(content: string): MacroMatch[] {
    const macros: MacroMatch[] = [];
    
    // Match ac:structured-macro elements
    const structuredMacroPattern = /<ac:structured-macro\s+ac:name="([^"]+)"[^>]*>([\s\S]*?)<\/ac:structured-macro>/g;
    
    const matches = content.matchAll(structuredMacroPattern);
    for (const match of matches) {
      const type = match[1];
      const macroContent = match[2];
      const fullMatch = match[0];
      const startIndex = match.index || 0;
      
      // Extract parameters from macro content
      const parameters = this.extractMacroParameters(macroContent);
      
      macros.push({
        type,
        parameters,
        content: macroContent,
        fullMatch,
        startIndex,
        endIndex: startIndex + fullMatch.length,
      });
    }

    return macros;
  }

  private parseCommentMacros(content: string): MacroMatch[] {
    const macros: MacroMatch[] = [];
    
    // Match comment-style macros like <!-- content-by-label: {...} -->
    const commentMacroPattern = /<!--\s*([^:]+):\s*({[^}]*}|\S+)\s*-->/g;
    
    const matches = content.matchAll(commentMacroPattern);
    for (const match of matches) {
      const type = match[1].trim();
      const paramString = match[2];
      const fullMatch = match[0];
      const startIndex = match.index || 0;
      
      let parameters: Record<string, string> = {};
      if (paramString.startsWith('{')) {
        try {
          parameters = JSON.parse(paramString);
        } catch {
          // Fallback for malformed JSON
          parameters = { config: paramString };
        }
      } else {
        parameters = { value: paramString };
      }
      
      macros.push({
        type,
        parameters,
        fullMatch,
        startIndex,
        endIndex: startIndex + fullMatch.length,
      });
    }

    return macros;
  }

  private parseInlineMacros(content: string): MacroMatch[] {
    const macros: MacroMatch[] = [];
    
    // Match user mentions like @username
    const userMentionPattern = /@(\w+)/g;
    
    const matches = content.matchAll(userMentionPattern);
    for (const match of matches) {
      const username = match[1];
      const fullMatch = match[0];
      const startIndex = match.index || 0;
      
      macros.push({
        type: 'user-mention',
        parameters: { username },
        fullMatch,
        startIndex,
        endIndex: startIndex + fullMatch.length,
      });
    }

    return macros;
  }

  private extractMacroParameters(macroContent: string): Record<string, string> {
    const parameters: Record<string, string> = {};
    
    // Extract ac:parameter elements
    const paramPattern = /<ac:parameter\s+ac:name="([^"]+)"[^>]*>(.*?)<\/ac:parameter>/gs;
    
    const matches = macroContent.matchAll(paramPattern);
    for (const match of matches) {
      const name = match[1];
      const value = match[2].replace(/<[^>]*>/g, '').trim(); // Strip HTML tags
      parameters[name] = value;
    }

    return parameters;
  }

  private processMacro(macro: MacroMatch, sourcePageId: string): QueueItem[] {
    const queueItems: QueueItem[] = [];

    switch (macro.type) {
      case 'children':
      case 'children-display':
        queueItems.push(...this.processChildrenMacro(macro, sourcePageId));
        break;
      
      case 'content-by-label':
        queueItems.push(...this.processContentByLabelMacro(macro, sourcePageId));
        break;
      
      case 'user-mention':
      case 'userinfo':
        queueItems.push(...this.processUserMentionMacro(macro, sourcePageId));
        break;
      
      default:
        // Other macros might be processed for future functionality
        break;
    }

    return queueItems;
  }

  private processChildrenMacro(_macro: MacroMatch, sourcePageId: string): QueueItem[] {
    if (!this.config.enableListChildrenDiscovery) {
      return [];
    }

    // Children macro creates a queue item for discovery of child pages
    // The actual child page IDs will be discovered by the API call
    return [{
      pageId: sourcePageId, // Use source page as reference for child discovery
      sourceType: 'macro',
      discoveryTimestamp: Date.now(),
      retryCount: 0,
      parentPageId: sourcePageId,
      status: 'pending',
    }];
  }

  private processContentByLabelMacro(macro: MacroMatch, sourcePageId: string): QueueItem[] {
    if (!this.config.enableContentByLabelDiscovery) {
      return [];
    }

    // Extract space and label information
    const space = macro.parameters.spaces || macro.parameters.space || this.spaceKey;
    const labels = macro.parameters.labels || macro.parameters.label;
    
    if (labels && space) {
      // Create queue item for label-based page discovery
      return [{
        pageId: `label:${labels}:${space}`, // Special format for label discovery
        sourceType: 'macro',
        discoveryTimestamp: Date.now(),
        retryCount: 0,
        parentPageId: sourcePageId,
        status: 'pending',
      }];
    }

    return [];
  }

  private processUserMentionMacro(macro: MacroMatch, sourcePageId: string): QueueItem[] {
    if (!this.config.enableUserMentionDiscovery) {
      return [];
    }

    const username = macro.parameters.username || macro.parameters.userKey;
    
    if (username) {
      // Create queue item for user page discovery
      return [{
        pageId: `user:${username}`, // Special format for user discovery
        sourceType: 'macro',
        discoveryTimestamp: Date.now(),
        retryCount: 0,
        parentPageId: sourcePageId,
        status: 'pending',
      }];
    }

    return [];
  }
}

export const createMacroDiscovery = (
  spaceKey: string,
  config?: Partial<MacroDiscoveryConfig>
): MacroDiscovery => {
  return new MacroDiscovery(spaceKey, config);
};
