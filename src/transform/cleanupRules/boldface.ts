/**
 * T105: Boldface punctuation rule
 * Normalizes boldface formatting to ensure consistent punctuation handling
 * Supports FR-026 for markdown cleanup and typography enhancement
 */

import type { CleanupRule, CleanupContext, CleanupResult, CleanupMetrics } from '../../models/markdownCleanup.js';

export interface BoldfaceConfig {
  movePunctuationOutside: boolean;
  preserveIntentionalBoldPunctuation: boolean;
  handleAsteriskFormat: boolean;
  handleUnderscoreFormat: boolean;
  preserveCodeWithinBold: boolean;
}

interface BoldPattern {
  regex: RegExp;
  replacement: string;
  description: string;
}

export class BoldfaceRule implements CleanupRule {
  readonly name = 'boldface';
  readonly description = 'Normalizes boldface formatting for consistent punctuation handling';
  readonly version = '1.0.0';

  private readonly config: BoldfaceConfig;

  constructor(config: Partial<BoldfaceConfig> = {}) {
    this.config = {
      movePunctuationOutside: true,
      preserveIntentionalBoldPunctuation: false,
      handleAsteriskFormat: true,
      handleUnderscoreFormat: true,
      preserveCodeWithinBold: true,
      ...config,
    };
  }

  async process(content: string, _context: CleanupContext): Promise<CleanupResult> {
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

      // Apply boldface punctuation normalization
      const boldfacePatterns = this.getBoldfacePatterns();
      let changesApplied = 0;

      for (const pattern of boldfacePatterns) {
        const beforeLength = processedContent.length;
        processedContent = processedContent.replace(pattern.regex, pattern.replacement);
        const afterLength = processedContent.length;
        
        // Count changes by difference in content
        if (beforeLength !== afterLength || processedContent !== content) {
          changesApplied++;
        }
      }

      metrics.changesApplied = changesApplied;

      // Restore code sections
      processedContent = this.restoreCodeSections(processedContent, codeExtractions.replacements);

      metrics.processingTimeMs = Date.now() - startTime;

      return {
        content: processedContent,
        metadata: {
          ruleApplied: this.name,
          version: this.version,
          timestamp: new Date().toISOString(),
          context: _context,
        },
        metrics,
        changed: processedContent !== content,
      };
    } catch (error) {
      metrics.processingTimeMs = Date.now() - startTime;
      metrics.issues.push({
        severity: 'error',
        message: `Boldface punctuation normalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        line: 0,
        column: 0,
        rule: this.name,
      });

      return {
        content,
        metadata: {
          ruleApplied: this.name,
          version: this.version,
          timestamp: new Date().toISOString(),
          context: _context,
        },
        metrics,
        changed: false,
      };
    }
  }

  private extractCodeSections(content: string): { content: string; replacements: Map<string, string> } {
    const replacements = new Map<string, string>();
    let processedContent = content;
    let counter = 0;

    if (this.config.preserveCodeWithinBold) {
      // Extract fenced code blocks
      processedContent = processedContent.replace(/```[\s\S]*?```/g, (match) => {
        const placeholder = `__BOLDFACE_CODE_BLOCK_${counter++}__`;
        replacements.set(placeholder, match);
        return placeholder;
      });

      // Extract inline code
      processedContent = processedContent.replace(/`[^`]+`/g, (match) => {
        const placeholder = `__BOLDFACE_INLINE_CODE_${counter++}__`;
        replacements.set(placeholder, match);
        return placeholder;
      });
    }

    return { content: processedContent, replacements };
  }

  private restoreCodeSections(content: string, replacements: Map<string, string>): string {
    let restoredContent = content;
    
    for (const [placeholder, original] of replacements) {
      restoredContent = restoredContent.replace(placeholder, original);
    }
    
    return restoredContent;
  }

  private getBoldfacePatterns(): BoldPattern[] {
    const patterns: BoldPattern[] = [];

    if (this.config.movePunctuationOutside) {
      // Handle asterisk bold formatting: **text.** -> **text**.
      if (this.config.handleAsteriskFormat) {
        patterns.push({
          regex: /\*\*([^*]+)([.!?;:,])\*\*/g,
          replacement: '**$1**$2',
          description: 'Move punctuation outside asterisk bold formatting',
        });
      }

      // Handle underscore bold formatting: __text.__ -> __text__.
      if (this.config.handleUnderscoreFormat) {
        patterns.push({
          regex: /__([^_]+)([.!?;:,])__/g,
          replacement: '__$1__$2',
          description: 'Move punctuation outside underscore bold formatting',
        });
      }

      // Handle mixed italic/bold with punctuation: ***text.*** -> ***text***.
      patterns.push({
        regex: /\*\*\*([^*]+)([.!?;:,])\*\*\*/g,
        replacement: '***$1***$2',
        description: 'Move punctuation outside triple asterisk formatting',
      });

      // Handle italic with bold asterisk: *text.* -> *text*.
      patterns.push({
        regex: /\*([^*]+)([.!?;:,])\*/g,
        replacement: '*$1*$2',
        description: 'Move punctuation outside single asterisk formatting',
      });

      // Handle italic with underscore: _text._ -> _text_.
      patterns.push({
        regex: /_([^_]+)([.!?;:,])_/g,
        replacement: '_$1_$2',
        description: 'Move punctuation outside single underscore formatting',
      });
    }

    // Handle whitespace normalization within bold formatting
    patterns.push({
      regex: /\*\*\s+([^*]+?)\s+\*\*/g,
      replacement: '**$1**',
      description: 'Remove extra whitespace within asterisk bold formatting',
    });

    patterns.push({
      regex: /__\s+([^_]+?)\s+__/g,
      replacement: '__$1__',
      description: 'Remove extra whitespace within underscore bold formatting',
    });

    // Handle consecutive bold formatting: **text****more** -> **textmore**
    patterns.push({
      regex: /\*\*([^*]+)\*\*\*\*([^*]+)\*\*/g,
      replacement: '**$1$2**',
      description: 'Merge consecutive asterisk bold formatting',
    });

    patterns.push({
      regex: /__([^_]+)____([^_]+)__/g,
      replacement: '__$1$2__',
      description: 'Merge consecutive underscore bold formatting',
    });

    return patterns;
  }
}

export const createBoldfaceRule = (config?: Partial<BoldfaceConfig>): BoldfaceRule => {
  return new BoldfaceRule(config);
};
