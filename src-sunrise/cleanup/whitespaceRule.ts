/**
 * Whitespace cleanup rule implementation.
 * Handles consistent spacing, line endings, indentation, and whitespace normalization.
 */

import type { ICleanupRule, RuleResult, MarkdownDocument, ContentType, RuleConfig } from '../models/markdownCleanup.js';
import { parseMarkdown } from '../util/markdownParser.js';

export class WhitespaceCleanupRule implements ICleanupRule {
  public readonly name = 'whitespace';
  public readonly priority = 90;
  public readonly preserveTypes: ContentType[] = ['CODE_BLOCK', 'INLINE_CODE'];

  /**
   * Check if rule can be applied to document.
   */
  canApply(document: MarkdownDocument): boolean {
    // Can apply to any document with content
    return document.content.length > 0;
  }

  /**
   * Apply whitespace cleanup to markdown document.
   */
  async apply(document: MarkdownDocument, _config: RuleConfig = {}): Promise<RuleResult> {
    const startTime = Date.now();
    let changesApplied = 0;
    
    try {
      // Parse markdown to identify preserved sections
      const { preservedSections } = await parseMarkdown(document.content);
      
      // Apply whitespace normalization while preserving code sections
      const processedContent = this.applyWhitespaceNormalization(
        document.content,
        preservedSections
      );

      // Count changes by comparing before/after
      if (processedContent !== document.content) {
        changesApplied = this.countWhitespaceChanges(document.content, processedContent);
      }

      return {
        ruleName: this.name,
        success: true,
        changesApplied,
        processingTime: Date.now() - startTime,
        preservedBlocks: preservedSections.length,
      };
    } catch (error) {
      return {
        ruleName: this.name,
        success: false,
        changesApplied: 0,
        processingTime: Date.now() - startTime,
        preservedBlocks: 0,
        errorMessage: error instanceof Error ? error.message : 'Unknown whitespace processing error',
      };
    }
  }

  /**
   * Apply whitespace normalization while preserving code blocks.
   */
  private applyWhitespaceNormalization(
    content: string,
    preservedSections: Array<{startLine: number, endLine: number, type: string}>
  ): string {
    if (preservedSections.length === 0) {
      // No preserved sections, process entire content
      return this.normalizeWhitespace(content);
    }

    // Process content in segments, skipping preserved sections
    const lines = content.split('\n');
    const processedLines = [...lines];

    // Create line-based preserved ranges
    const preservedLines = new Set<number>();
    for (const section of preservedSections) {
      for (let i = section.startLine; i <= section.endLine; i++) {
        preservedLines.add(i);
      }
    }

    // Process only non-preserved lines
    const nonPreservedContent: string[] = [];
    const lineMapping: number[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      if (!preservedLines.has(i)) {
        nonPreservedContent.push(lines[i]);
        lineMapping.push(i);
      }
    }

    // Apply whitespace normalization to non-preserved content
    const normalizedContent = this.normalizeWhitespace(nonPreservedContent.join('\n'));
    const normalizedLines = normalizedContent.split('\n');

    // Replace non-preserved lines with normalized versions
    for (let i = 0; i < lineMapping.length && i < normalizedLines.length; i++) {
      const originalLineIndex = lineMapping[i];
      processedLines[originalLineIndex] = normalizedLines[i];
    }

    return processedLines.join('\n');
  }

  /**
   * Normalize whitespace in content.
   */
  private normalizeWhitespace(content: string): string {
    return content
      // Normalize line endings to Unix-style
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // Remove trailing whitespace from each line
      .replace(/[ \t]+$/gm, '')
      // Normalize multiple spaces to single space (except at line start for indentation)
      .replace(/^([ \t]*)[^\S\n]+/gm, '$1 ')
      .replace(/([^\n\t ])[ \t]+/g, '$1 ')
      // Remove excessive blank lines (max 2 consecutive)
      .replace(/\n{4,}/g, '\n\n\n')
      // Ensure file ends with single newline
      .replace(/\n*$/, '\n');
  }

  /**
   * Count whitespace changes made to content.
   */
  private countWhitespaceChanges(original: string, _processed: string): number {
    let changes = 0;

    // Count line ending normalizations
    const crlfCount = (original.match(/\r\n/g) || []).length;
    const crCount = (original.match(/\r(?!\n)/g) || []).length;
    changes += crlfCount + crCount;

    // Count trailing whitespace removals
    const trailingWhitespaceLines = (original.match(/[ \t]+$/gm) || []).length;
    changes += trailingWhitespaceLines;

    // Count multiple space normalizations
    const multipleSpaces = (original.match(/[ \t]{2,}/g) || []).length;
    changes += multipleSpaces;

    // Count excessive blank line reductions
    const excessiveBlankLines = (original.match(/\n{4,}/g) || []).length;
    changes += excessiveBlankLines;

    return changes;
  }
}

/**
 * Factory function to create whitespace cleanup rule instance.
 */
export function createWhitespaceRule(): ICleanupRule {
  return new WhitespaceCleanupRule();
}
