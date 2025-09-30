/**
 * T103: Smart word wrapping rule
 * Implements smart word wrapping with 92-character target while preserving markdown structure
 * Supports FR-035 for markdown cleanup and quality enhancement
 */

import type { CleanupRule, CleanupContext, CleanupResult, CleanupMetrics, RuleConfig } from '../../models/markdownCleanup.js';

export interface WordWrapConfig extends RuleConfig {
  lineLength: number;
  preserveCodeBlocks: boolean;
  preserveInlineCode: boolean;
  preserveTables: boolean;
  preserveLinks: boolean;
  wrapLists: boolean;
  respectParagraphs: boolean;
}

interface WrapContext {
  inCodeBlock: boolean;
  inTable: boolean;
  inList: boolean;
  listIndent: number;
}

export class WordWrapRule implements CleanupRule {
  readonly name = 'wordWrap';
  readonly description = 'Applies smart word wrapping with markdown structure preservation';
  readonly version = '1.0.0';

  private readonly config: WordWrapConfig;

  constructor(config: Partial<WordWrapConfig> = {}) {
    this.config = {
      lineLength: 92,
      preserveCodeBlocks: true,
      preserveInlineCode: true,
      preserveTables: true,
      preserveLinks: true,
      wrapLists: true,
      respectParagraphs: true,
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
      
      // Extract protected sections to preserve them
      const protectedSections = this.extractProtectedSections(processedContent);
      processedContent = protectedSections.content;

      // Apply word wrapping
      const wrappedContent = this.applyWordWrapping(processedContent, metrics);

      // Restore protected sections
      processedContent = this.restoreProtectedSections(wrappedContent, protectedSections.sections);

      return this.createSuccessResult(processedContent, context, metrics, startTime);

    } catch (error) {
      return this.createErrorResult(content, context, error, metrics, startTime);
    }
  }

  private extractProtectedSections(content: string): { content: string; sections: Map<string, string> } {
    const sections = new Map<string, string>();
    let processed = content;
    let placeholderIndex = 0;

    // Extract fenced code blocks
    if (this.config.preserveCodeBlocks) {
      processed = processed.replace(/```[\s\S]*?```/g, (match) => {
        const placeholder = `__CODEBLOCK_${placeholderIndex++}__`;
        sections.set(placeholder, match);
        return placeholder;
      });
    }

    // Extract inline code
    if (this.config.preserveInlineCode) {
      processed = processed.replace(/`[^`\n]+`/g, (match) => {
        const placeholder = `__INLINECODE_${placeholderIndex++}__`;
        sections.set(placeholder, match);
        return placeholder;
      });
    }

    // Extract links if preserving them
    if (this.config.preserveLinks) {
      // Markdown links [text](url)
      processed = processed.replace(/\[([^\]]+)\]\([^)]+\)/g, (match) => {
        const placeholder = `__LINK_${placeholderIndex++}__`;
        sections.set(placeholder, match);
        return placeholder;
      });

      // Reference links [text][ref]
      processed = processed.replace(/\[([^\]]+)\]\[([^\]]*)\]/g, (match) => {
        const placeholder = `__REFLINK_${placeholderIndex++}__`;
        sections.set(placeholder, match);
        return placeholder;
      });

      // Auto links <url>
      processed = processed.replace(/<[^>]+>/g, (match) => {
        const placeholder = `__AUTOLINK_${placeholderIndex++}__`;
        sections.set(placeholder, match);
        return placeholder;
      });
    }

    return { content: processed, sections };
  }

  private restoreProtectedSections(content: string, sections: Map<string, string>): string {
    let restored = content;
    
    for (const [placeholder, original] of sections) {
      restored = restored.replace(placeholder, original);
    }
    
    return restored;
  }

  private applyWordWrapping(content: string, metrics: CleanupMetrics): string {
    const lines = content.split('\n');
    const wrappedLines: string[] = [];
    const context: WrapContext = {
      inCodeBlock: false,
      inTable: false,
      inList: false,
      listIndent: 0,
    };

    for (const line of lines) {
      this.updateContext(line, context);

      if (this.shouldSkipWrapping(line, context)) {
        wrappedLines.push(line);
      } else {
        const wrapped = this.wrapLine(line, context);
        if (wrapped.length !== 1 || wrapped[0] !== line) {
          metrics.changesApplied++;
        }
        wrappedLines.push(...wrapped);
      }
    }

    return wrappedLines.join('\n');
  }

  private updateContext(line: string, context: WrapContext): void {
    this.updateCodeBlockState(line, context);
    this.updateTableState(line, context);
    this.updateListState(line, context);
  }

  private updateCodeBlockState(line: string, context: WrapContext): void {
    if (line.trim().startsWith('```')) {
      context.inCodeBlock = !context.inCodeBlock;
    }
  }

  private updateTableState(line: string, context: WrapContext): void {
    if (this.config.preserveTables) {
      const isTableLine = line.trim().includes('|') && !context.inCodeBlock;
      context.inTable = isTableLine;
    }
  }

  private updateListState(line: string, context: WrapContext): void {
    if (!this.config.wrapLists) return;

    if (this.isNewListItem(line)) {
      this.setListContextForNewItem(line, context);
    } else if (this.isEmptyLine(line)) {
      this.clearListContext(context);
    } else if (this.isListContinuation(line, context)) {
      this.handleListContinuation(line, context);
    }
  }

  private isNewListItem(line: string): boolean {
    return /^(\s*)([-*+]|\d+\.)\s+/.test(line);
  }

  private isEmptyLine(line: string): boolean {
    return line.trim() === '';
  }

  private setListContextForNewItem(line: string, context: WrapContext): void {
    const listMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+/);
    if (listMatch) {
      context.inList = true;
      context.listIndent = listMatch[1].length + listMatch[2].length + 1;
    }
  }

  private clearListContext(context: WrapContext): void {
    context.inList = false;
    context.listIndent = 0;
  }

  private isListContinuation(line: string, context: WrapContext): boolean {
    return context.inList && !line.match(/^\s*[-*+\d]/);
  }

  private handleListContinuation(line: string, context: WrapContext): void {
    const currentIndent = line.match(/^(\s*)/)?.[1].length || 0;
    if (currentIndent < context.listIndent) {
      this.clearListContext(context);
    }
  }

  private shouldSkipWrapping(line: string, context: WrapContext): boolean {
    // Skip if line is within length limit
    if (line.length <= this.config.lineLength) {
      return true;
    }

    // Skip code blocks
    if (context.inCodeBlock) {
      return true;
    }

    // Skip tables
    if (context.inTable) {
      return true;
    }

    // Skip headings
    if (line.trim().startsWith('#')) {
      return true;
    }

    // Skip horizontal rules
    if (/^[\s]*[-*_]{3,}[\s]*$/.test(line)) {
      return true;
    }

    // Skip empty lines
    if (line.trim() === '') {
      return true;
    }

    return false;
  }

  private wrapLine(line: string, context: WrapContext): string[] {
    // Handle list items specially
    if (context.inList) {
      return this.wrapListItem(line, context);
    }

    // Handle regular paragraphs
    return this.wrapParagraph(line);
  }

  private wrapListItem(line: string, context: WrapContext): string[] {
    const leadingSpace = line.match(/^(\s*)/)?.[1] || '';
    const content = line.slice(leadingSpace.length);
    
    // Check if this is a list marker line
    const listMatch = content.match(/^([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const [, marker, text] = listMatch;
      const prefix = `${leadingSpace}${marker} `;
      const availableWidth = this.config.lineLength - prefix.length;
      
      if (text.length <= availableWidth) {
        return [line]; // Fits on one line
      }
      
      const wrappedText = this.wrapText(text, availableWidth);
      const continuationPrefix = ' '.repeat(prefix.length);
      
      return [
        `${prefix}${wrappedText[0]}`,
        ...wrappedText.slice(1).map(textLine => `${continuationPrefix}${textLine}`)
      ];
    }

    // This is a continuation line in a list
    const indent = Math.max(context.listIndent, leadingSpace.length);
    const prefix = ' '.repeat(indent);
    const availableWidth = this.config.lineLength - prefix.length;
    const text = line.trim();
    
    if (text.length <= availableWidth) {
      return [line];
    }
    
    const wrappedText = this.wrapText(text, availableWidth);
    return wrappedText.map(textLine => `${prefix}${textLine}`);
  }

  private wrapParagraph(line: string): string[] {
    const leadingSpace = line.match(/^(\s*)/)?.[1] || '';
    const text = line.slice(leadingSpace.length);
    const availableWidth = this.config.lineLength - leadingSpace.length;
    
    if (text.length <= availableWidth) {
      return [line];
    }
    
    const wrappedText = this.wrapText(text, availableWidth);
    return wrappedText.map(textLine => `${leadingSpace}${textLine}`);
  }

  private wrapText(text: string, maxWidth: number): string[] {
    if (text.length <= maxWidth) {
      return [text];
    }

    const words = text.split(/\s+/);
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      
      if (testLine.length <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Single word longer than max width
          lines.push(word);
        }
      }
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    return lines.length > 0 ? lines : [text];
  }

  private createSuccessResult(
    content: string, 
    context: CleanupContext, 
    metrics: CleanupMetrics, 
    startTime: number
  ): CleanupResult {
    metrics.processingTimeMs = Date.now() - startTime;

    return {
      content,
      metadata: {
        ruleApplied: this.name,
        version: this.version,
        timestamp: new Date().toISOString(),
        context,
      },
      metrics,
      changed: metrics.changesApplied > 0,
    };
  }

  private createErrorResult(
    content: string, 
    context: CleanupContext, 
    error: unknown,
    metrics: CleanupMetrics, 
    startTime: number
  ): CleanupResult {
    metrics.issues.push({
      severity: 'error',
      message: `Word wrap rule failed: ${error}`,
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
        context,
      },
      metrics,
      changed: false,
    };
  }
}

/**
 * Create a word wrap rule with default configuration.
 */
export function createWordWrapRule(config?: Partial<WordWrapConfig>): WordWrapRule {
  return new WordWrapRule(config);
}

/**
 * Word wrap patterns and utilities.
 */
export const wordWrapPatterns = {
  codeBlock: /```[\s\S]*?```/g,
  inlineCode: /`[^`\n]+`/g,
  markdownLink: /\[([^\]]+)\]\([^)]+\)/g,
  referenceLink: /\[([^\]]+)\]\[([^\]]*)\]/g,
  autoLink: /<[^>]+>/g,
  listItem: /^(\s*)([-*+]|\d+\.)\s+(.*)$/,
  heading: /^#{1,6}\s+/,
  horizontalRule: /^[\s]*[-*_]{3,}[\s]*$/,
  table: /\|/,
};

/**
 * Check if word wrapping can be applied safely.
 */
export function canApplyWordWrapping(content: string, maxLineLength: number = 92): boolean {
  const lines = content.split('\n');
  
  // Check if any lines exceed the maximum length
  const longLines = lines.filter(line => line.length > maxLineLength);
  
  if (longLines.length === 0) {
    return false; // No lines need wrapping
  }

  // Check if content is mostly code (avoid wrapping code-heavy content)
  const codeLines = lines.filter(line => 
    line.trim().startsWith('    ') || // Indented code
    line.trim().startsWith('```') ||  // Code fence
    line.includes('`')                // Inline code
  ).length;
  
  const codeRatio = codeLines / lines.length;
  return codeRatio < 0.5; // Only wrap if less than 50% code
}

/**
 * Analyze line length distribution in content.
 */
export function analyzeLineLength(content: string): {
  totalLines: number;
  averageLength: number;
  maxLength: number;
  longLines: number;
  lineDistribution: Record<string, number>;
} {
  const lines = content.split('\n');
  const lengths = lines.map(line => line.length);
  
  const analysis = {
    totalLines: lines.length,
    averageLength: Math.round(lengths.reduce((sum, len) => sum + len, 0) / lines.length),
    maxLength: Math.max(...lengths),
    longLines: lengths.filter(len => len > 92).length,
    lineDistribution: {} as Record<string, number>,
  };

  // Categorize line lengths
  for (const length of lengths) {
    let category: string;
    if (length === 0) category = 'empty';
    else if (length <= 40) category = 'short';
    else if (length <= 80) category = 'medium';
    else if (length <= 120) category = 'long';
    else category = 'very-long';
    
    analysis.lineDistribution[category] = (analysis.lineDistribution[category] || 0) + 1;
  }

  return analysis;
}

/**
 * Preview word wrap changes without applying them.
 */
export function previewWordWrapChanges(content: string, config?: Partial<WordWrapConfig>): {
  changes: Array<{
    lineNumber: number;
    originalLine: string;
    wrappedLines: string[];
    reason: string;
  }>;
  estimatedChanges: number;
} {
  const changes: Array<{
    lineNumber: number;
    originalLine: string;
    wrappedLines: string[];
    reason: string;
  }> = [];

  const lineLength = config?.lineLength || 92;
  const lines = content.split('\n');
  
  let estimatedChanges = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.length > lineLength) {
      // Simple estimation - this would be more complex in real implementation
      const estimatedWrapCount = Math.ceil(line.length / lineLength);
      if (estimatedWrapCount > 1) {
        estimatedChanges++;
        
        changes.push({
          lineNumber: i + 1,
          originalLine: line,
          wrappedLines: [`${line.slice(0, lineLength)}...`], // Simplified preview
          reason: `Line exceeds ${lineLength} characters`,
        });
      }
    }
  }

  return { changes, estimatedChanges };
}
