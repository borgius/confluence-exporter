/**
 * T101: Typography cleanup rule
 * Implements smart quotes, dashes, and ellipses enhancement
 * Supports FR-035 for markdown cleanup and quality enhancement
 */

import type { CleanupRule, CleanupContext, CleanupResult, CleanupMetrics } from '../../models/markdownCleanup.js';

export interface TypographyConfig {
  enableSmartQuotes: boolean;
  enableSmartDashes: boolean;
  enableSmartEllipses: boolean;
  preserveCodeBlocks: boolean;
  preserveInlineCode: boolean;
}

export class TypographyRule implements CleanupRule {
  readonly name = 'typography';
  readonly description = 'Enhances typography with smart quotes, dashes, and ellipses';
  readonly version = '1.0.0';

  private readonly config: TypographyConfig;

  constructor(config: Partial<TypographyConfig> = {}) {
    this.config = {
      enableSmartQuotes: true,
      enableSmartDashes: true,
      enableSmartEllipses: true,
      preserveCodeBlocks: true,
      preserveInlineCode: true,
      ...config,
    };
  }

  async process(content: string, context: CleanupContext): Promise<CleanupResult> {
    const startTime = Date.now();
    const metrics: CleanupMetrics = {
      changesApplied: 0,
      charactersProcessed: content.length,
      processingTimeMs: 0,
      issues: [],
    };

    try {
      let processedContent = content;
      
      // Extract code blocks and inline code to preserve them
      const codeExtractions = this.extractCodeSections(processedContent);
      processedContent = codeExtractions.content;

      // Apply typography enhancements
      if (this.config.enableSmartQuotes) {
        const quotesResult = this.enhanceQuotes(processedContent);
        processedContent = quotesResult.content;
        metrics.changesApplied += quotesResult.changes;
      }

      if (this.config.enableSmartDashes) {
        const dashesResult = this.enhanceDashes(processedContent);
        processedContent = dashesResult.content;
        metrics.changesApplied += dashesResult.changes;
      }

      if (this.config.enableSmartEllipses) {
        const ellipsesResult = this.enhanceEllipses(processedContent);
        processedContent = ellipsesResult.content;
        metrics.changesApplied += ellipsesResult.changes;
      }

      // Restore code sections
      processedContent = this.restoreCodeSections(processedContent, codeExtractions.sections);

      metrics.processingTimeMs = Date.now() - startTime;

      return {
        content: processedContent,
        metadata: {
          ruleApplied: this.name,
          version: this.version,
          timestamp: new Date().toISOString(),
          context: {
            fileName: context.fileName,
            spaceKey: context.spaceKey,
            pageId: context.pageId,
          },
        },
        metrics,
        changed: metrics.changesApplied > 0,
      };

    } catch (error) {
      metrics.issues.push({
        severity: 'error',
        message: `Typography rule failed: ${error}`,
        line: 0,
        column: 0,
        rule: this.name,
      });

      metrics.processingTimeMs = Date.now() - startTime;

      return {
        content,
        metadata: {
          ruleApplied: this.name,
          version: this.version,
          timestamp: new Date().toISOString(),
          context: {
            fileName: context.fileName,
            spaceKey: context.spaceKey,
            pageId: context.pageId,
          },
        },
        metrics,
        changed: false,
      };
    }
  }

  private extractCodeSections(content: string): { content: string; sections: Map<string, string> } {
    const sections = new Map<string, string>();
    let processed = content;
    let placeholderIndex = 0;

    if (this.config.preserveCodeBlocks) {
      // Extract fenced code blocks
      processed = processed.replace(/```[\s\S]*?```/g, (match) => {
        const placeholder = `__CODEBLOCK_${placeholderIndex++}__`;
        sections.set(placeholder, match);
        return placeholder;
      });
    }

    if (this.config.preserveInlineCode) {
      // Extract inline code
      processed = processed.replace(/`[^`\n]+`/g, (match) => {
        const placeholder = `__INLINECODE_${placeholderIndex++}__`;
        sections.set(placeholder, match);
        return placeholder;
      });
    }

    return { content: processed, sections };
  }

  private restoreCodeSections(content: string, sections: Map<string, string>): string {
    let restored = content;
    
    for (const [placeholder, original] of sections) {
      restored = restored.replace(placeholder, original);
    }
    
    return restored;
  }

  private enhanceQuotes(content: string): { content: string; changes: number } {
    let changes = 0;
    let processed = content;

    // Convert straight quotes to smart quotes
    // Opening quotes: Quote at start of word or after whitespace/punctuation
    processed = processed.replace(/(\s|^|[—–\-([{])"/g, (_match, prefix) => {
      changes++;
      return `${prefix}"`;
    });

    processed = processed.replace(/(\s|^|[—–\-([{])'/g, (_match, prefix) => {
      changes++;
      return `${prefix}'`;
    });

    // Closing quotes: Quote at end of word or before whitespace/punctuation
    processed = processed.replace(/"(\s|$|[—–\-)\]},.:;!?])/g, (_match, suffix) => {
      changes++;
      return `"${suffix}`;
    });

    processed = processed.replace(/'(\s|$|[—–\-)\]},.:;!?])/g, (_match, suffix) => {
      changes++;
      return `'${suffix}`;
    });

    // Handle contractions - apostrophes should be curly
    processed = processed.replace(/(\w)'(\w)/g, (_match, before, after) => {
      changes++;
      return `${before}'${after}`;
    });

    return { content: processed, changes };
  }

  private enhanceDashes(content: string): { content: string; changes: number } {
    let changes = 0;
    let processed = content;

    // Em dashes: Convert double hyphens or spaced hyphens
    processed = processed.replace(/--/g, () => {
      changes++;
      return '—';
    });

    processed = processed.replace(/(\s)-(\s)/g, (match, before, after) => {
      changes++;
      return `${before}—${after}`;
    });

    // En dashes: For ranges and compound adjectives
    processed = processed.replace(/(\d+)\s*-\s*(\d+)/g, (match, start, end) => {
      changes++;
      return `${start}–${end}`;
    });

    // Date ranges
    processed = processed.replace(/(\d{4})-(\d{4})/g, (match, start, end) => {
      changes++;
      return `${start}–${end}`;
    });

    return { content: processed, changes };
  }

  private enhanceEllipses(content: string): { content: string; changes: number } {
    let changes = 0;
    let processed = content;

    // Convert three periods to ellipsis character
    processed = processed.replace(/\.\.\./g, () => {
      changes++;
      return '…';
    });

    // Handle spaced periods
    processed = processed.replace(/\.\s\.\s\./g, () => {
      changes++;
      return '…';
    });

    return { content: processed, changes };
  }
}

/**
 * Create a typography rule with default configuration.
 */
export function createTypographyRule(config?: Partial<TypographyConfig>): TypographyRule {
  return new TypographyRule(config);
}

/**
 * Typography enhancement patterns for different contexts.
 */
export const typographyPatterns = {
  quotes: {
    openingDouble: /(\s|^|[—–\-([{])"/g,
    closingDouble: /"(\s|$|[—–\-)\]},.:;!?])/g,
    openingSingle: /(\s|^|[—–\-([{])'/g,
    closingSingle: /'(\s|$|[—–\-)\]},.:;!?])/g,
    contractions: /(\w)'(\w)/g,
  },
  dashes: {
    emDash: /--/g,
    spacedEmDash: /(\s)-(\s)/g,
    numberRange: /(\d+)\s*-\s*(\d+)/g,
    yearRange: /(\d{4})-(\d{4})/g,
  },
  ellipses: {
    threePeriods: /\.\.\./g,
    spacedPeriods: /\.\s\.\s\./g,
  },
};

/**
 * Check if typography enhancements can be applied safely.
 */
export function canApplyTypography(content: string): boolean {
  // Don't apply to content that appears to be technical/code-heavy
  const totalLength = content.length;
  
  if (totalLength === 0) return false;
  
  // If more than 30% of content is code, skip typography enhancement
  const codeLines = content.split('\n').filter(line => 
    line.trim().startsWith('    ') || // Indented code
    line.trim().startsWith('```') ||  // Code fence
    line.includes('`')                // Inline code
  ).length;
  
  const totalLines = content.split('\n').length;
  const codeRatio = codeLines / totalLines;
  
  return codeRatio < 0.3;
}

/**
 * Preview typography changes without applying them.
 */
export function previewTypographyChanges(content: string, _config?: Partial<TypographyConfig>): {
  changes: Array<{
    type: 'quotes' | 'dashes' | 'ellipses';
    original: string;
    enhanced: string;
    line: number;
    column: number;
  }>;
  estimatedChanges: number;
} {
  const changes: Array<{
    type: 'quotes' | 'dashes' | 'ellipses';
    original: string;
    enhanced: string;
    line: number;
    column: number;
  }> = [];

  // This would be more complex in a real implementation
  // For now, provide estimate based on pattern matching
  const quoteMatches = content.match(/"[^"]*"/g) || [];
  const dashMatches = content.match(/--/g) || [];
  const ellipsisMatches = content.match(/\.\.\./g) || [];

  const estimatedChanges = quoteMatches.length * 2 + dashMatches.length + ellipsisMatches.length;

  return { changes, estimatedChanges };
}
