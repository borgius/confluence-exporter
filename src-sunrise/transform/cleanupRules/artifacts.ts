/**
 * T106: Export artifact cleanup rule
 * Cleans up export artifacts including unnecessary escapes, empty HTML comments, and malformed links
 * Supports FR-025 for markdown cleanup and transformation process enhancement
 */

import type { CleanupRule, CleanupContext, CleanupResult, CleanupMetrics } from '../../models/markdownCleanup.js';

export interface ArtifactConfig {
  removeConfluenceMacros: boolean;
  removeHTMLComments: boolean;
  removePageInfoMacros: boolean;
  removeNavigationElements: boolean;
  removeMetadataComments: boolean;
  removeEmptyContainers: boolean;
  cleanupHTMLEscapes: boolean;
  removeMalformedLinks: boolean;
}

interface ArtifactPattern {
  regex: RegExp;
  replacement: string;
  description: string;
  multiline?: boolean;
}

export class ArtifactRule implements CleanupRule {
  readonly name = 'artifacts';
  readonly description = 'Removes Confluence export artifacts and malformed content';
  readonly version = '1.0.0';

  private readonly config: ArtifactConfig;

  constructor(config: Partial<ArtifactConfig> = {}) {
    this.config = {
      removeConfluenceMacros: true,
      removeHTMLComments: true,
      removePageInfoMacros: true,
      removeNavigationElements: true,
      removeMetadataComments: true,
      removeEmptyContainers: true,
      cleanupHTMLEscapes: true,
      removeMalformedLinks: true,
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
      
      // Extract code blocks to preserve them
      const codeExtractions = this.extractCodeSections(processedContent);
      processedContent = codeExtractions.content;

      // Apply artifact cleanup patterns
      const artifactPatterns = this.getArtifactPatterns();
      let changesApplied = 0;

      for (const pattern of artifactPatterns) {
        const before = processedContent;
        
        if (pattern.multiline) {
          processedContent = processedContent.replace(pattern.regex, pattern.replacement);
        } else {
          processedContent = processedContent.replace(pattern.regex, pattern.replacement);
        }
        
        if (processedContent !== before) {
          changesApplied++;
        }
      }

      // Clean up excessive whitespace after artifact removal
      processedContent = this.cleanupWhitespace(processedContent);

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
        message: `Export artifact cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

    // Extract fenced code blocks
    processedContent = processedContent.replace(/```[\s\S]*?```/g, (match) => {
      const placeholder = `__ARTIFACT_CODE_BLOCK_${counter++}__`;
      replacements.set(placeholder, match);
      return placeholder;
    });

    // Extract inline code
    processedContent = processedContent.replace(/`[^`]+`/g, (match) => {
      const placeholder = `__ARTIFACT_INLINE_CODE_${counter++}__`;
      replacements.set(placeholder, match);
      return placeholder;
    });

    return { content: processedContent, replacements };
  }

  private restoreCodeSections(content: string, replacements: Map<string, string>): string {
    let restoredContent = content;
    
    for (const [placeholder, original] of replacements) {
      restoredContent = restoredContent.replace(placeholder, original);
    }
    
    return restoredContent;
  }

  private getArtifactPatterns(): ArtifactPattern[] {
    const patterns: ArtifactPattern[] = [];

    // Remove Confluence structured macros
    if (this.config.removeConfluenceMacros) {
      patterns.push({
        regex: /<ac:structured-macro[\s\S]*?<\/ac:structured-macro>/g,
        replacement: '',
        description: 'Remove Confluence structured macros',
        multiline: true,
      });

      patterns.push({
        regex: /<ac:rich-text-body[\s\S]*?<\/ac:rich-text-body>/g,
        replacement: '',
        description: 'Remove Confluence rich text body containers',
        multiline: true,
      });
    }

    // Remove HTML comments
    if (this.config.removeHTMLComments) {
      patterns.push({
        regex: /<!-- Confluence Macro: \w+ -->/g,
        replacement: '',
        description: 'Remove Confluence macro comments',
      });

      patterns.push({
        regex: /<!-- Table of Contents -->/g,
        replacement: '',
        description: 'Remove table of contents comments',
      });

      patterns.push({
        regex: /<!-- content-by-label:[\s\S]*? -->/g,
        replacement: '',
        description: 'Remove content-by-label comments',
        multiline: true,
      });
    }

    // Remove page info and navigation elements
    if (this.config.removePageInfoMacros) {
      patterns.push({
        regex: /\*\*On this page:\*\*/g,
        replacement: '',
        description: 'Remove "On this page" labels',
      });

      patterns.push({
        regex: /\*\*Related pages\*\*/g,
        replacement: '',
        description: 'Remove "Related pages" labels',
      });
    }

    // Clean up HTML escapes
    if (this.config.cleanupHTMLEscapes) {
      patterns.push({
        regex: /&quot;/g,
        replacement: '"',
        description: 'Replace HTML quote escapes',
      });

      patterns.push({
        regex: /&lt;/g,
        replacement: '<',
        description: 'Replace HTML less-than escapes',
      });

      patterns.push({
        regex: /&gt;/g,
        replacement: '>',
        description: 'Replace HTML greater-than escapes',
      });

      patterns.push({
        regex: /&amp;/g,
        replacement: '&',
        description: 'Replace HTML ampersand escapes',
      });
    }

    // Remove malformed links and unnecessary escapes
    if (this.config.removeMalformedLinks) {
      patterns.push({
        regex: /\\\\/g,
        replacement: '',
        description: 'Remove unnecessary backslash escapes',
      });

      patterns.push({
        regex: /\[([^\]]+)\]\(\)/g,
        replacement: '$1',
        description: 'Remove empty link targets',
      });

      patterns.push({
        regex: /\[\]\([^)]+\)/g,
        replacement: '',
        description: 'Remove links with empty text',
      });
    }

    return patterns;
  }

  private cleanupWhitespace(content: string): string {
    if (!this.config.removeEmptyContainers) {
      return content;
    }

    let cleaned = content;

    // Remove excessive blank lines (more than 2 consecutive)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Remove trailing whitespace from lines
    cleaned = cleaned.replace(/[ \t]+$/gm, '');

    // Remove empty list items
    cleaned = cleaned.replace(/^\s*[-*+]\s*$/gm, '');

    // Remove empty headings
    cleaned = cleaned.replace(/^#+\s*$/gm, '');

    // Remove empty blockquotes
    cleaned = cleaned.replace(/^>\s*$/gm, '');

    return cleaned;
  }
}

export const createArtifactRule = (config?: Partial<ArtifactConfig>): ArtifactRule => {
  return new ArtifactRule(config);
};
