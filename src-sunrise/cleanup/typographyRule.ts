/**
 * Typography cleanup rule implementation.
 * Handles smart quotes, dashes, ellipses, and other typographic improvements.
 */

import textr from 'textr';
import type { ICleanupRule, RuleResult, MarkdownDocument, ContentType, RuleConfig } from '../models/markdownCleanup.js';
import { parseMarkdown } from '../util/markdownParser.js';

export class TypographyCleanupRule implements ICleanupRule {
  public readonly name = 'typography';
  public readonly priority = 100;
  public readonly preserveTypes: ContentType[] = ['CODE_BLOCK', 'INLINE_CODE', 'MATH_BLOCK', 'MATH_INLINE'];

  private readonly processor = textr({ locale: 'en-us' })
    .use(this.smartQuotes)
    .use(this.smartDashes)
    .use(this.smartEllipses);

  /**
   * Check if rule can be applied to document.
   */
  canApply(document: MarkdownDocument): boolean {
    // Can apply to any document with text content
    return document.content.length > 0;
  }

  /**
   * Apply typography cleanup to markdown document.
   */
  async apply(document: MarkdownDocument, _config: RuleConfig = {}): Promise<RuleResult> {
    const startTime = Date.now();
    let changesApplied = 0;
    
    try {
      // Parse markdown to identify preserved sections
      const { preservedSections } = await parseMarkdown(document.content);
      
      // Apply typography rules while preserving code sections
      const processedContent = this.applyTypographyWithPreservation(
        document.content,
        preservedSections
      );

      // Count changes by comparing before/after
      if (processedContent !== document.content) {
        changesApplied = this.countTypographyChanges(document.content, processedContent);
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
        errorMessage: error instanceof Error ? error.message : 'Unknown typography processing error',
      };
    }
  }

  /**
   * Apply typography processing while preserving code blocks and inline code.
   */
  private applyTypographyWithPreservation(
    content: string,
    preservedSections: Array<{startLine: number, endLine: number, type: string}>
  ): string {
    if (preservedSections.length === 0) {
      // No preserved sections, process entire content
      return this.processor(content);
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
    for (let i = 0; i < lines.length; i++) {
      if (!preservedLines.has(i)) {
        processedLines[i] = this.processor(lines[i]);
      }
    }

    return processedLines.join('\n');
  }

  /**
   * Count typography changes made to content.
   */
  private countTypographyChanges(original: string, processed: string): number {
    let changes = 0;

    // Count quote changes
    changes += this.countCharacterChanges(original, processed, '"', '\u201C');
    changes += this.countCharacterChanges(original, processed, "'", '\u2019');

    // Count dash changes
    changes += this.countStringChanges(original, processed, '--', '\u2014');
    
    // Count ellipsis changes
    changes += this.countStringChanges(original, processed, '...', '\u2026');

    return changes;
  }

  /**
   * Count specific character replacements.
   */
  private countCharacterChanges(_original: string, processed: string, oldChar: string, newChar: string): number {
    const newCount = (processed.match(new RegExp(`\\${newChar}`, 'g')) || []).length;
    const remainingOldCount = (processed.match(new RegExp(`\\${oldChar}`, 'g')) || []).length;
    return Math.max(0, newCount - remainingOldCount);
  }

  /**
   * Count specific string replacements.
   */
  private countStringChanges(_original: string, processed: string, _oldStr: string, newStr: string): number {
    const newCount = (processed.match(new RegExp(newStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    return newCount;
  }

  /**
   * Smart quotes transformation function for textr.
   */
  private smartQuotes(text: string): string {
    // Convert straight quotes to curly quotes
    // Handle opening and closing quotes based on context
    return text
      // Opening double quotes (after whitespace or start of line)
      .replace(/(^|\s|>)"/g, '$1\u201C')
      // Closing double quotes (before whitespace, punctuation, or end)
      .replace(/"/g, '\u201D')
      // Opening single quotes (after whitespace or start)
      .replace(/(^|\s|>)'/g, '$1\u2018')
      // Closing single quotes and apostrophes
      .replace(/'/g, '\u2019');
  }

  /**
   * Smart dashes transformation function for textr.
   */
  private smartDashes(text: string): string {
    return text
      // Convert double hyphens to em dashes
      .replace(/--/g, '\u2014')
      // Convert number ranges to en dashes (e.g., "1-10" becomes "1–10")
      .replace(/(\d+)\s*-\s*(\d+)/g, '$1\u2013$2')
      // Convert date ranges to en dashes (e.g., "2020-2021")
      .replace(/(\d{4})\s*-\s*(\d{4})/g, '$1\u2013$2');
  }

  /**
   * Smart ellipses transformation function for textr.
   */
  private smartEllipses(text: string): string {
    return text
      // Convert three or more dots to proper ellipsis
      .replace(/\.{3,}/g, '\u2026')
      // Convert spaced dots to ellipsis
      .replace(/\.\s+\.\s+\./g, '\u2026');
  }
}

/**
 * Factory function to create typography cleanup rule instance.
 */
export function createTypographyRule(): ICleanupRule {
  return new TypographyCleanupRule();
}
